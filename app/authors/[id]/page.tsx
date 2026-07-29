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
  const [trackResult, setTrackResult] = useState<{
    newFound: number;
    ingested: { title: string; success: boolean; error?: string }[];
    skipped: number;
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
    setNewItems(null);
    setIngestResults(null);
    try {
      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorId }),
      });
      const data = await res.json();
      if (data.error && !data.ingested) throw new Error(data.error);
      setTrackResult(data);
      await loadAll();
    } catch (e) {
      setTrackResult({ newFound: 0, ingested: [], skipped: 0, error: String(e) });
    } finally {
      setTracking(false);
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

      {/* Check for updates */}
      <div className="mb-6">
        <div className="flex gap-2">
          <button
            className="btn-primary flex-1"
            onClick={autoTrack}
            disabled={tracking || checking}
          >
            {tracking ? 'Tracking: fetching & analyzing...' : 'Auto-import new articles'}
          </button>
          <button
            className="btn-secondary flex-1"
            onClick={checkForUpdates}
            disabled={checking || tracking}
          >
            {checking ? 'Checking feed...' : 'Check manually'}
          </button>
        </div>

        {/* Auto-track results */}
        {trackResult && (
          <div className="mt-3 card space-y-1.5">
            {trackResult.error ? (
              <p className="text-xs text-red-400">{trackResult.error}</p>
            ) : (
              <>
                <p className="label">
                  Auto-track complete — {trackResult.newFound} new found, {trackResult.ingested.length} imported
                  {trackResult.skipped > 0 ? `, ${trackResult.skipped} deferred to next run` : ''}
                </p>
                {trackResult.ingested.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={r.success ? 'text-green-400' : 'text-red-400'}>
                      {r.success ? '✓' : '✗'}
                    </span>
                    <span className="text-claude-muted truncate">{r.title}</span>
                    {r.error && <span className="text-red-400 text-xs">{r.error}</span>}
                  </div>
                ))}
                {trackResult.newFound === 0 && (
                  <p className="text-xs text-claude-muted">Nothing new since last check.</p>
                )}
              </>
            )}
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
