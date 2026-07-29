'use client';

import { useState, useEffect } from 'react';
import { Author, Article, NewArticle } from '@/types';
import Link from 'next/link';
import { formatDistanceToNow, format } from 'date-fns';

export default function AuthorPage({ params }: { params: { id: string } }) {
  const authorId = Number(params.id);

  const [author, setAuthor] = useState<Author | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  // Check state
  const [checking, setChecking] = useState(false);
  const [newItems, setNewItems] = useState<NewArticle[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Ingest state
  const [ingesting, setIngesting] = useState(false);
  const [ingestResults, setIngestResults] = useState<{ success: boolean; title: string; error?: string }[] | null>(null);

  // Analyze state
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Auto-track state
  const [tracking, setTracking] = useState(false);
  const [importMode, setImportMode] = useState<'latest' | 'all' | 'range'>('latest');
  const [sinceDate, setSinceDate] = useState('');
  const [untilDate, setUntilDate] = useState('');
  const [trackProgress, setTrackProgress] = useState<string | null>(null);
  const [trackResult, setTrackResult] = useState<{
    imported: { title: string; success: boolean; error?: string }[];
    remaining: number;
    undatedExcluded: number;
    batches: number;
    stoppedOnErrors: boolean;
    error?: string;
  } | null>(null);

  useEffect(() => {
    loadAll();
  }, [authorId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [authRes, artRes] = await Promise.all([
        fetch('/api/authors'),
        fetch(`/api/articles?authorId=${authorId}&withFeatures=1`),
      ]);
      const authList: Author[] = await authRes.json();
      const artList: Article[] = await artRes.json();
      setAuthor(authList.find(a => a.id === authorId) ?? null);
      setArticles(artList);
    } finally {
      setLoading(false);
    }
  }

  async function checkForUpdates() {
    setChecking(true);
    setNewItems(null);
    setIngestResults(null);
    setSelected(new Set());
    try {
      const res = await fetch('/api/articles/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setNewItems(data.newItems);
      if (data.newItems.length > 0) {
        setSelected(new Set(data.newItems.map((i: NewArticle) => i.guid)));
      }
      // Refresh author to update lastChecked
      const authRes = await fetch('/api/authors');
      const authList: Author[] = await authRes.json();
      setAuthor(authList.find(a => a.id === authorId) ?? null);
    } catch (e) {
      setNewItems([]);
    } finally {
      setChecking(false);
    }
  }

  async function ingestSelected() {
    if (!newItems || selected.size === 0) return;
    const items = newItems.filter(i => selected.has(i.guid));
    setIngesting(true);
    setIngestResults(null);
    try {
      const res = await fetch('/api/articles/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorId, items }),
      });
      const data = await res.json();
      setIngestResults(data.results);
      setNewItems(null);
      setSelected(new Set());
      await loadAll();
    } finally {
      setIngesting(false);
    }
  }

  async function autoTrack() {
    setTracking(true);
    setTrackResult(null);
    setTrackProgress(null);
    setNewItems(null);
    setIngestResults(null);

    const body: Record<string, unknown> = { authorId };
    if (importMode === 'range') {
      if (sinceDate) body.since = sinceDate;
      if (untilDate) body.until = untilDate;
    }

    // "latest" = one batch. "all" / "range" = keep calling until the feed is
    // drained — each request ingests at most one batch (serverless timeout).
    const loop = importMode !== 'latest';
    const imported: { title: string; success: boolean; error?: string }[] = [];
    let remaining = 0;
    let undatedExcluded = 0;
    let batches = 0;
    let stoppedOnErrors = false;

    try {
      for (;;) {
        batches++;
        const res = await fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.error && !data.ingested) throw new Error(data.error);

        imported.push(...data.ingested);
        remaining = data.skipped;
        undatedExcluded = data.undatedExcluded ?? 0;

        const okCount = imported.filter(r => r.success).length;
        setTrackProgress(
          `Batch ${batches} done — ${okCount} imported, ${remaining} remaining...`
        );

        if (!loop || remaining === 0) break;
        // Failed items stay out of the DB and would be retried forever;
        // if a whole batch produced no successes, stop and surface the errors.
        if (!data.ingested.some((r: { success: boolean }) => r.success)) {
          stoppedOnErrors = true;
          break;
        }
        await loadAll(); // keep the corpus list filling in as batches land
      }

      setTrackResult({ imported, remaining, undatedExcluded, batches, stoppedOnErrors });
      await loadAll();
    } catch (e) {
      setTrackResult({
        imported,
        remaining,
        undatedExcluded,
        batches,
        stoppedOnErrors: false,
        error: String(e),
      });
    } finally {
      setTracking(false);
      setTrackProgress(null);
    }
  }

  async function generateImprint() {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await loadAll();
      window.location.href = `/authors/${authorId}/report`;
    } catch (e) {
      setAnalyzeError(String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  function toggleSelect(guid: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(guid) ? next.delete(guid) : next.add(guid);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-sm text-claude-faint">Loading...</p>
      </div>
    );
  }

  if (!author) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-sm text-claude-muted">Author not found.</p>
        <Link href="/" className="text-sm text-claude-accent mt-2 inline-block">← Back</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link href="/" className="text-xs text-claude-muted hover:text-claude-text transition-colors">
          ← All authors
        </Link>
        <div className="mt-3 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-medium text-claude-text">{author.name}</h1>
            {author.description && (
              <p className="text-sm text-claude-muted mt-0.5">{author.description}</p>
            )}
            <p className="text-xs text-claude-faint mt-1 font-mono">{author.feedUrl}</p>
          </div>
          <div className="flex gap-2 ml-4 shrink-0">
            {(author.imprintVersion ?? 0) > 0 && (
              <Link href={`/authors/${authorId}/report`} className="btn-secondary">
                View report
              </Link>
            )}
            <button
              className="btn-primary"
              onClick={generateImprint}
              disabled={analyzing || articles.length === 0}
            >
              {analyzing ? 'Analyzing...' : 'Generate imprint'}
            </button>
          </div>
        </div>
        {analyzeError && (
          <p className="text-xs text-red-400 mt-2">{analyzeError}</p>
        )}
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 mb-6 text-xs text-claude-muted">
        <span><span className="text-claude-text font-medium">{articles.length}</span> articles</span>
        {(author.imprintVersion ?? 0) > 0 && (
          <span><span className="text-claude-accent font-medium">v{author.imprintVersion}</span> imprint</span>
        )}
        {author.lastChecked && (
          <span>checked {formatDistanceToNow(new Date(author.lastChecked), { addSuffix: true })}</span>
        )}
      </div>

      {/* Recent focus — what the author is thinking about lately */}
      {(() => {
        const recent = articles.filter(a => a.extractedFeatures).slice(0, 5);
        if (recent.length === 0) return null;
        const topicCounts = new Map<string, number>();
        for (const a of recent) {
          for (const t of a.extractedFeatures!.mainTopics ?? []) {
            topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
          }
        }
        const topics = [...topicCounts.entries()]
          .sort((x, y) => y[1] - x[1])
          .slice(0, 8);
        const claims = recent
          .flatMap(a => (a.extractedFeatures!.coreClaims ?? []).slice(0, 2).map(c => ({ c, title: a.title })))
          .slice(0, 6);
        return (
          <div className="card mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="label">Recent focus</p>
              <span className="text-xs text-claude-faint">last {recent.length} analyzed articles</span>
            </div>
            {topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {topics.map(([t, n]) => (
                  <span key={t} className="text-xs bg-claude-hover text-claude-text px-2 py-0.5 rounded">
                    {t}{n > 1 ? ` ×${n}` : ''}
                  </span>
                ))}
              </div>
            )}
            {claims.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-claude-faint">Recent judgments & claims</p>
                {claims.map((item, i) => (
                  <p key={i} className="text-xs text-claude-muted leading-relaxed">
                    <span className="text-claude-accent">·</span> {item.c}
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Import */}
      <div className="mb-6">
        <div className="card space-y-3">
          <p className="label">Import articles</p>
          <div className="flex gap-1.5">
            {([
              ['latest', 'Latest batch'],
              ['all', 'Everything'],
              ['range', 'Date range'],
            ] as const).map(([mode, labelText]) => (
              <button
                key={mode}
                onClick={() => setImportMode(mode)}
                disabled={tracking}
                className={`text-xs px-2.5 py-1.5 rounded border transition-colors ${
                  importMode === mode
                    ? 'border-claude-accent text-claude-accent bg-claude-hover'
                    : 'border-claude-border text-claude-muted hover:text-claude-text'
                }`}
              >
                {labelText}
              </button>
            ))}
          </div>

          {importMode === 'range' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="input flex-1"
                value={sinceDate}
                onChange={e => setSinceDate(e.target.value)}
                disabled={tracking}
              />
              <span className="text-xs text-claude-faint shrink-0">to</span>
              <input
                type="date"
                className="input flex-1"
                value={untilDate}
                onChange={e => setUntilDate(e.target.value)}
                disabled={tracking}
              />
            </div>
          )}

          <p className="text-xs text-claude-faint">
            {importMode === 'latest' && 'Imports the newest articles not yet in the corpus (up to 5).'}
            {importMode === 'all' && 'Imports every article in the feed, batch by batch. Each article costs one LLM analysis call — a large archive takes a while and spends credits accordingly.'}
            {importMode === 'range' && 'Imports articles published inside the range, batch by batch. Leave an end empty for an open range. Articles the feed gives no date for are skipped.'}
          </p>

          <div className="flex gap-2">
            <button
              className="btn-primary flex-1"
              onClick={autoTrack}
              disabled={
                tracking || checking ||
                (importMode === 'range' && !sinceDate && !untilDate)
              }
            >
              {tracking ? (trackProgress ?? 'Fetching & analyzing...') : 'Import'}
            </button>
            <button
              className="btn-secondary flex-1"
              onClick={checkForUpdates}
              disabled={checking || tracking}
            >
              {checking ? 'Checking feed...' : 'Check manually'}
            </button>
          </div>
        </div>

        {/* Import results */}
        {trackResult && (
          <div className="mt-3 card space-y-1.5">
            {(() => {
              const ok = trackResult.imported.filter(r => r.success);
              const failed = trackResult.imported.filter(r => !r.success);
              const shown = trackResult.imported.slice(0, 30);
              return (
                <>
                  <p className="label">
                    Import complete — {ok.length} imported
                    {failed.length > 0 ? `, ${failed.length} failed` : ''}
                    {trackResult.remaining > 0 ? `, ${trackResult.remaining} not attempted` : ''}
                    {trackResult.batches > 1 ? ` (${trackResult.batches} batches)` : ''}
                  </p>
                  {trackResult.error && (
                    <p className="text-xs text-red-400">{trackResult.error}</p>
                  )}
                  {trackResult.stoppedOnErrors && (
                    <p className="text-xs text-red-400">
                      Stopped: an entire batch failed, so the remaining articles were left alone. Fix the errors below (or just retry) to continue.
                    </p>
                  )}
                  {trackResult.undatedExcluded > 0 && (
                    <p className="text-xs text-claude-muted">
                      {trackResult.undatedExcluded} article{trackResult.undatedExcluded > 1 ? 's' : ''} skipped — the feed provides no publish date for them, so they can&apos;t be matched against a date range. Use &quot;Everything&quot; to import them.
                    </p>
                  )}
                  {shown.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={r.success ? 'text-green-400' : 'text-red-400'}>
                        {r.success ? '✓' : '✗'}
                      </span>
                      <span className="text-claude-muted truncate">{r.title}</span>
                      {r.error && <span className="text-red-400 text-xs">{r.error}</span>}
                    </div>
                  ))}
                  {trackResult.imported.length > shown.length && (
                    <p className="text-xs text-claude-faint">
                      ...and {trackResult.imported.length - shown.length} more
                    </p>
                  )}
                  {trackResult.imported.length === 0 && !trackResult.error && (
                    <p className="text-xs text-claude-muted">Nothing new matched this import.</p>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* New items found */}
        {newItems !== null && newItems.length === 0 && (
          <p className="text-xs text-claude-muted mt-3 text-center">No new articles found.</p>
        )}

        {newItems !== null && newItems.length > 0 && (
          <div className="mt-3 card space-y-3">
            <div className="flex items-center justify-between">
              <p className="label">{newItems.length} new article{newItems.length > 1 ? 's' : ''} found</p>
              <button
                className="text-xs text-claude-muted hover:text-claude-text"
                onClick={() => selected.size === newItems.length
                  ? setSelected(new Set())
                  : setSelected(new Set(newItems.map(i => i.guid)))
                }
              >
                {selected.size === newItems.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="space-y-1.5">
              {newItems.map(item => (
                <label key={item.guid} className="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[#D97757]"
                    checked={selected.has(item.guid)}
                    onChange={() => toggleSelect(item.guid)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-claude-text group-hover:text-white transition-colors truncate">
                      {item.title}
                    </p>
                    {item.publishedAt && (
                      <p className="text-xs text-claude-faint">
                        {format(new Date(item.publishedAt), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
            <button
              className="btn-primary w-full"
              onClick={ingestSelected}
              disabled={ingesting || selected.size === 0}
            >
              {ingesting ? 'Fetching & analyzing...' : `Import ${selected.size} article${selected.size !== 1 ? 's' : ''}`}
            </button>
            <p className="text-xs text-claude-faint text-center">
              Each article will be fetched and analyzed individually. This may take a moment.
            </p>
          </div>
        )}

        {/* Ingest results */}
        {ingestResults && (
          <div className="mt-3 card space-y-1.5">
            <p className="label">Import complete</p>
            {ingestResults.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={r.success ? 'text-green-400' : 'text-red-400'}>
                  {r.success ? '✓' : '✗'}
                </span>
                <span className="text-claude-muted truncate">{r.title}</span>
                {r.error && <span className="text-red-400 text-xs">{r.error}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Article list */}
      <div>
        <p className="label mb-3">Articles in corpus</p>
        {articles.length === 0 ? (
          <div className="card text-center py-6">
            <p className="text-sm text-claude-muted">No articles yet.</p>
            <p className="text-xs text-claude-faint mt-1">Check for new articles above to begin.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {articles.map(article => (
              <div key={article.id} className="card py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-claude-text hover:text-white transition-colors truncate block"
                    >
                      {article.title}
                    </a>
                    <div className="flex gap-3 mt-1">
                      {article.publishedAt && (
                        <span className="text-xs text-claude-faint">
                          {format(new Date(article.publishedAt), 'MMM d, yyyy')}
                        </span>
                      )}
                      {article.wordCount && (
                        <span className="text-xs text-claude-faint">{article.wordCount.toLocaleString()} words</span>
                      )}
                    </div>
                  </div>
                  {(article as any).hasFeatures && (
                    <span className="text-xs text-claude-accent shrink-0">analyzed</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
