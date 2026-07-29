# 架构文档（Architecture）

> 本文描述系统当前（v1.0）的实际实现。设计动机见 [CONSTITUTION.md](./CONSTITUTION.md)。

## 总览

单体 Next.js 14（App Router）应用。前端页面与 API Route 同仓同进程部署（Vercel serverless），数据库为 Supabase Postgres（Drizzle ORM + postgres.js），LLM 分析经 OpenRouter 调用（默认模型 `anthropic/claude-sonnet-4`，可由 `OPENROUTER_MODEL` 切换）。

```
                 ┌── 自动路径：Vercel Cron（每日）──► GET /api/track ─┐
                 │            作者页一键导入 ──────► POST /api/track ─┤
                 │                                                    ▼
RSS 源 ──────────┤                                          tracker.ts（去重 + 限量）
                 │                                                    │
                 └── 手动路径：/api/articles/check ──► 发现新文章      │
                                  │ 用户勾选                          │
                                  ▼                                   │
                          /api/articles/ingest                        │
                                  │                                   │
                                  ├──► fetcher.ts 抓取正文并清洗 ◄────┤
                                  │           │                       │
                                  │           ▼                       │
                                  │    analyzer.ts 逐篇提取认知特征    │
                                  ▼           │                       │
                          articles 表 ◄───────┴───────────────────────┘
                          (raw_text + extracted_features)
                                  │
                                  ▼
                          /api/analyze ──► analyzer.ts 语料级聚合 ──► imprint_reports 表（版本化）
                                  │
                                  ▼
                          /api/analyze/export ──► export.ts ──► Markdown
```

## 模块职责

| 模块 | 职责 | 边界 |
|---|---|---|
| `lib/fetcher.ts` | Feed 解析（RSS 2.0 / RSS 1.0-RDF / Atom）、正文抓取与清洗 | 只负责取回干净文本，不做任何分析；非 feed URL 显式抛错而非静默返回空 |
| `lib/tracker.ts` | 自动跟踪管道：检查 feed → 去重 → 自动抓取分析入库 | 复用 fetcher + analyzer；每作者每轮上限 5 篇、cron 每轮总上限 8 篇（适配 60s 超时） |
| `lib/analyzer.ts` | 两段式 LLM 分析管道 | 唯一与 LLM（OpenRouter）交互的模块；`callModel` 为纯 fetch 传输层，模型 ID 与 prompt 均在此文件；prompt 的伦理红线见宪法第二节 |
| `lib/export.ts` | 报告转 Markdown | 纯格式化，无业务逻辑 |
| `lib/schema.ts` / `lib/db.ts` | Drizzle schema 与连接 | schema 变更走 `npm run db:push` |
| `types/index.ts` | 全部共享类型 | 类型是 LLM JSON 输出的契约，与 analyzer 的 prompt schema 必须同步修改 |
| `middleware.ts` | 全站 HTTP Basic Auth 门禁 | `BASIC_AUTH_PASSWORD` 未设置则不启用；`GET /api/track` 凭 `Bearer $CRON_SECRET` 单独放行 |
| `app/api/**` | HTTP 层 | 参数校验 + 调 lib + 返回 JSON，不写业务逻辑 |
| `app/**/page.tsx` | UI | 客户端组件直接 fetch 内部 API |

## 数据模型

三张表（`lib/schema.ts`）：

- **authors** — 作者与其 RSS 源（`feed_url`）、上次检查时间（`last_checked`）。
- **articles** — 每篇文章一行：`url`/`guid` 唯一约束用于去重；`raw_text` 保存清洗后的全文；`extracted_features`（jsonb）保存逐篇认知特征。这两列是纵向跟踪的基础资产，只增不删。
- **imprint_reports** — 语料级报告，每次生成追加一行（版本化），`report_data`（jsonb）为完整报告结构。

## 两段式分析管道（核心设计）

1. **逐篇提取** `extractDocumentFeatures()` — 输入单篇文本（截断至 6000 字符），输出结构化 `DocumentFeatures`：主题、核心主张、推理模式、类比模式、论证缺口、风格标记、强项信号、风险信号、原文摘录。
2. **语料聚合** `generateImprintReport()` — 输入全部逐篇特征（不重读原文），输出 `ImprintReport`：认知签名摘要、反复出现的主题、认知习惯（带频率与证据）、推理形状、论证缺口模式、四维评分（压缩力 / 论证完整性 / 框架稳定性 / 外推风险，各带锚点定义与证据摘录），以及基于语料规模的置信度（<5 篇或 <3000 词 = low；<15 篇或 <15000 词 = moderate；否则 high）。

分离的理由：逐篇特征是稳定的中间表示。聚合 prompt 可以随时迭代并对历史语料重跑，成本只有一次 LLM 调用，无需重新抓取或逐篇重析。

## 关键约束

- **Vercel Hobby 60s 超时**：ingest 多篇文章时建议每批 3–5 篇；报告生成为单次 LLM 调用，30 篇以内语料可在限时内完成。
- **LLM 输出解析**：`parseJsonResponse` 先剥 markdown code fence，再截取首个 `{` 到末个 `}`（容忍模型前后加话），最后 `JSON.parse`；失败直接抛错（fail fast），不静默重试。
- **逐篇输入截断 6000 字符**：超长文章只分析开头部分，是已知取舍。
- **模型**：默认 `anthropic/claude-sonnet-4`（OpenRouter ID），集中写在 `lib/analyzer.ts` 的 `MODEL` 常量，可用 `OPENROUTER_MODEL` 环境变量覆盖为任意 OpenRouter 模型。
- **数据库连接**：Supabase transaction pooler（6543 端口）+ postgres.js，必须 `prepare: false`（pooler 不支持 prepared statements）、`max: 1`（serverless 每实例单连接）。

## 自动跟踪（v1.1）

- **入口**：`app/api/track/route.ts`。GET 供 Vercel Cron 调用（`vercel.json` 配置为每日 02:00 UTC），遍历全部作者；POST 供作者页"Auto-import new articles"按钮调用（单作者）。
- **鉴权**：设置了 `CRON_SECRET` 环境变量时，GET 要求 `Authorization: Bearer <CRON_SECRET>`（Vercel Cron 自动携带）；未设置则不校验（本地开发）。
- **限量**：每作者每轮最多 5 篇、cron 每轮总计最多 8 篇（`lib/tracker.ts` 中的常量），超出部分下一轮自动补上——这是对 Vercel 60s 超时的适配，不是数据截断。
- **去重**：依赖 `articles.url` / `articles.guid` 唯一约束 + 入库前的集合过滤，同一篇文章不会重复分析。
- **Recent focus 卡片**：作者页聚合最近 5 篇已分析文章的 `mainTopics`（频次排序）与 `coreClaims`，直接回答"作者这阶段在想什么、产生了哪些判断"；纯前端聚合，不消耗 LLM 调用。`GET /api/articles?withFeatures=1` 为此返回逐篇特征。

## 已知的演进预留

- 报告版本化（追加不覆盖）为 v2.x 的认知轨迹 diff 预留。
