# 工程规范（Engineering Standards）

> 上位文件：[CONSTITUTION.md](./CONSTITUTION.md)。本文规定日常开发的具体做法。

## 分支与提交

- 主分支 `main` 保持可部署。功能开发使用 `feat/<描述>`、修复使用 `fix/<描述>` 分支，经 PR 合入。
- Commit message 用一句话说清"改了什么、为什么"，格式：`<type>: <描述>`，type 取 `feat` / `fix` / `docs` / `refactor` / `chore`。修订宪法必须用 `constitution:` 前缀。
- 涉及 `lib/schema.ts` 的改动，PR 描述中必须注明需要执行 `npm run db:push`。

## 代码规范

- TypeScript 严格模式（`tsconfig.json` 已开启 `strict`），不使用 `any` 兜底；LLM 返回的 JSON 必须落到 `types/index.ts` 中的显式类型。
- **类型即契约**：`types/index.ts` 中的 `DocumentFeatures` / `ImprintReport` 与 `lib/analyzer.ts` prompt 中的 JSON schema 是同一份契约的两个表达，任何一侧修改必须同步另一侧。
- 业务逻辑放 `lib/`，API route 只做参数校验、调用 lib、返回 JSON；页面组件不直接访问数据库。
- 秘钥只经环境变量（`DATABASE_URL`、`OPENROUTER_API_KEY`、可选 `CRON_SECRET`）注入，不进代码、不进日志。新增环境变量必须同步更新 `.env.example` 和 README。

## Prompt 变更规范

`lib/analyzer.ts` 中的 prompt 属于核心资产，改动要求：

1. 宪法第二节的伦理红线条款（不奉承、不推断私人心理、三分法、证据强制、置信度诚实）不得删除或弱化。
2. 修改输出 JSON schema 时，同步修改 `types/index.ts`、报告渲染页面（`app/authors/[id]/report/page.tsx`）与 `lib/export.ts`。
3. 评分锚点（Paul Graham 10/10 等）如需调整，在 PR 中说明新锚点的选取理由。
4. 改动后至少用一个真实语料（≥5 篇文章）人工验证一次完整管道：check → ingest → generate → export。

## 验证清单（合入前）

MVP 阶段无自动化测试，以下手动验证为合入底线：

```bash
npm run build
```

- [ ] `npm run build` 通过（类型检查 + 构建）
- [ ] 涉及分析管道的改动：跑通一次完整用户流程（添加作者 → check → ingest → 生成报告 → 导出）
- [ ] 涉及 schema 的改动：本地 `npm run db:push` 成功，Drizzle Studio 中确认表结构
- [ ] 涉及文档的改动：README 的项目结构 / 环境变量表与实际一致

## 依赖策略

- 不为单一功能引入大型依赖；当前依赖面（next / drizzle / postgres / rss-parser / date-fns）刻意保持小。OpenRouter 用原生 fetch 调用，不引入 SDK。
- 更换模型：优先用 `OPENROUTER_MODEL` 环境变量切换，无需改代码；确需改默认值时只改 `lib/analyzer.ts` 的 `MODEL` 常量，并按 Prompt 变更规范做一次真实语料验证——换模型等同于改 prompt，输出稳定性必须重测。

## 文档地图

| 文件 | 内容 | 更新时机 |
|---|---|---|
| [CONSTITUTION.md](./CONSTITUTION.md) | 设计理念、伦理红线、工程原则、路线 | 立项级变化时 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 当前实现的架构与数据流 | 架构 / 数据模型变化时 |
| ENGINEERING.md（本文） | 开发规范 | 流程变化时 |
| ../README.md | 安装、部署、使用 | 面向使用者的变化时 |
| ../CLAUDE.md | AI 协作者的工程入口 | 与以上任一同步 |
