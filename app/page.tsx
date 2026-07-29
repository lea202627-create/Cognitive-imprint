'use client';

import { useState, useEffect } from 'react';
import { Author } from '@/types';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

export default function HomePage() {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', feedUrl: '', siteUrl: '', description: '' });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    fetchAuthors();
  }, []);

  async function fetchAuthors() {
    try {
      const res = await fetch('/api/authors');
      const data = await res.json();
      setAuthors(data);
    } finally {
      setLoading(false);
    }
  }

  async function deleteAuthor(id: number) {
    if (!confirm('Delete this author and all their articles and reports?')) return;
    setDeletingId(id);
    try {
      await fetch('/api/authors', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      fetchAuthors();
    } finally {
      setDeletingId(null);
    }
  }

  async function addAuthor() {
    if (!form.name || !form.feedUrl) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch('/api/authors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setForm({ name: '', feedUrl: '', siteUrl: '', description: '' });
      setShowAdd(false);
      fetchAuthors();
    } catch (e) {
      setAddError(String(e));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-medium text-claude-text mb-1">Cognitive Imprint</h1>
        <p className="text-sm text-claude-muted">Extract cognitive patterns from public writing.</p>
      </div>

      {/* Author list */}
      <div className="space-y-2 mb-6">
        {loading ? (
          <div className="text-sm text-claude-faint py-4">Loading...</div>
        ) : authors.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-sm text-claude-muted mb-1">No authors yet.</p>
            <p className="text-xs text-claude-faint">Add an author to begin.</p>
          </div>
        ) : (
          authors.map(author => (
            <div key={author.id} className="card hover:border-claude-muted transition-colors group relative">
              <Link href={`/authors/${author.id}`} className="block">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-claude-text group-hover:text-white transition-colors">
                        {author.name}
                      </span>
                      {author.imprintVersion && author.imprintVersion > 0 ? (
                        <span className="text-xs font-mono bg-claude-hover text-claude-accent px-1.5 py-0.5 rounded">
                          v{author.imprintVersion}
                        </span>
                      ) : (
                        <span className="text-xs text-claude-faint">no imprint yet</span>
                      )}
                    </div>
                    {author.description && (
                      <p className="text-xs text-claude-muted truncate">{author.description}</p>
                    )}
                  </div>
                  <div className="text-right ml-4 shrink-0 pr-8">
                    <div className="text-xs text-claude-faint">
                      {author.articleCount ?? 0} articles
                    </div>
                    {author.lastChecked && (
                      <div className="text-xs text-claude-faint">
                        checked {formatDistanceToNow(new Date(author.lastChecked), { addSuffix: true })}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
              <button
                onClick={() => deleteAuthor(author.id)}
                disabled={deletingId === author.id}
                className="absolute top-3 right-3 text-claude-faint hover:text-red-400 transition-colors text-xs px-1"
                title="Delete author"
              >
                {deletingId === author.id ? '...' : '✕'}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add author */}
      {showAdd ? (
        <div className="card space-y-3">
          <p className="label">Add author</p>
          <div className="space-y-2">
            <input
              className="input"
              placeholder="Name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
            <input
              className="input"
              placeholder="Website or RSS URL — e.g. paulgraham.com"
              value={form.feedUrl}
              onChange={e => setForm(f => ({ ...f, feedUrl: e.target.value }))}
            />
            <p className="text-xs text-claude-faint -mt-1">
              Paste the site address and the feed is found automatically. A direct feed URL works too.
            </p>
            <input
              className="input"
              placeholder="Description (optional)"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          {addError && (
            <p className="text-xs text-red-400 leading-relaxed">{addError}</p>
          )}
          <div className="flex gap-2">
            <button className="btn-primary" onClick={addAuthor} disabled={adding || !form.name || !form.feedUrl}>
              {adding ? 'Finding feed...' : 'Add'}
            </button>
            <button className="btn-secondary" onClick={() => { setShowAdd(false); setAddError(null); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-secondary w-full" onClick={() => setShowAdd(true)}>
          + Add author
        </button>
      )}
    </div>
  );
}
