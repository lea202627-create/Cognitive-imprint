'use client';

import { useState, useEffect } from 'react';
import { ImprintReport, Author } from '@/types';
import Link from 'next/link';
import { format } from 'date-fns';

function ScoreBar({ score, inverted }: { score: number; inverted?: boolean }) {
  const pct = (score / 10) * 100;
  const color = inverted
    ? score >= 7 ? 'bg-red-400' : score >= 4 ? 'bg-yellow-400' : 'bg-green-400'
    : score >= 7 ? 'bg-green-400' : score >= 4 ? 'bg-yellow-400' : 'bg-red-400';

  return (
    <div className="score-bar-track w-full">
      <div className={`score-bar-fill ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="inline-block text-xs bg-claude-hover text-claude-muted px-2 py-0.5 rounded-full">
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-t border-claude-border pt-4">
      <button
        className="flex items-center justify-between w-full text-left mb-3"
        onClick={() => setOpen(o => !o)}
      >
        <span className="label">{title}</span>
        <span className="text-claude-faint text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && children}
    </div>
  );
}

function Evidence({ excerpts }: { excerpts?: string[] }) {
  if (!excerpts?.length) return null;
  return (
    <div className="mt-2 space-y-1">
      {excerpts.map((e, i) => (
        <p key={i} className="text-xs text-claude-faint font-mono border-l border-claude-border pl-3 py-0.5">
          "{e}"
        </p>
      ))}
    </div>
  );
}

export default function ReportPage({ params }: { params: { id: string } }) {
  const authorId = Number(params.id);

  const [author, setAuthor] = useState<Author | null>(null);
  const [reports, setReports] = useState<ImprintReport[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadAll();
  }, [authorId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [authRes, repRes] = await Promise.all([
        fetch('/api/authors'),
        fetch(`/api/analyze?authorId=${authorId}`),
      ]);
      const authList: Author[] = await authRes.json();
      const repList: ImprintReport[] = await repRes.json();
      setAuthor(authList.find(a => a.id === authorId) ?? null);
      setReports(repList);
    } finally {
      setLoading(false);
    }
  }

  async function exportMarkdown(reportId: number) {
    setExporting(true);
    try {
      const res = await fetch(`/api/analyze/export?reportId=${reportId}`);
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cognitive-imprint-${author?.name.toLowerCase().replace(/\s+/g, '-') ?? 'report'}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-sm text-claude-faint">Loading...</p>
      </div>
    );
  }

  if (!reports.length) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href={`/authors/${authorId}`} className="text-xs text-claude-muted hover:text-claude-text">
          ← Back
        </Link>
        <p className="text-sm text-claude-muted mt-6">No imprint reports yet.</p>
        <p className="text-xs text-claude-faint mt-1">Generate one from the author page.</p>
      </div>
    );
  }

  const report = reports[selectedIndex];
  const scores = report.scores;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/authors/${authorId}`} className="text-xs text-claude-muted hover:text-claude-text transition-colors">
          ← {author?.name ?? 'Author'}
        </Link>

        <div className="mt-3 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-medium text-claude-text">Cognitive Imprint</h1>
            <p className="text-xs text-claude-faint mt-1">
              {report.documentCount} docs · {report.totalWordCount.toLocaleString()} words ·{' '}
              {format(new Date(report.generatedAt), 'MMM d, yyyy')}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4 shrink-0">
            {reports.length > 1 && (
              <select
                className="input text-xs py-1.5 w-auto"
                value={selectedIndex}
                onChange={e => setSelectedIndex(Number(e.target.value))}
              >
                {reports.map((r, i) => (
                  <option key={r.id} value={i}>
                    v{reports.length - i} — {format(new Date(r.generatedAt), 'MMM d, yyyy')}
                  </option>
                ))}
              </select>
            )}
            <button
              className="btn-secondary"
              onClick={() => exportMarkdown(report.id)}
              disabled={exporting}
            >
              {exporting ? 'Exporting...' : 'Export .md'}
            </button>
          </div>
        </div>
      </div>

      {/* Confidence */}
      <div className={`mb-6 card py-3 border-l-2 ${
        report.confidence === 'high' ? 'border-l-green-400' :
        report.confidence === 'moderate' ? 'border-l-yellow-400' : 'border-l-red-400'
      }`}>
        <p className="text-xs text-claude-muted">
          <span className="text-claude-text capitalize">{report.confidence} confidence</span>
          {' — '}{report.confidenceNote}
        </p>
      </div>

      {/* Imprint summary */}
      <div className="mb-6 card">
        <p className="label mb-2">Imprint summary</p>
        <p className="text-sm text-claude-text leading-relaxed">{report.imprintSummary}</p>
      </div>

      {/* Scores */}
      <div className="mb-6">
        <p className="label mb-3">Scores</p>
        <div className="space-y-4">
          {[
            { key: 'compressionStrength', label: 'Compression Strength', inverted: false },
            { key: 'argumentCompleteness', label: 'Argument Completeness', inverted: false },
            { key: 'frameworkStability', label: 'Framework Stability', inverted: false },
            { key: 'extrapolationRisk', label: 'Extrapolation Risk', inverted: true },
          ].map(({ key, label, inverted }) => {
            const s = scores[key as keyof typeof scores];
            return (
              <div key={key} className="card space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-claude-text">{label}</span>
                  <span className="font-mono text-sm text-claude-accent">{s.score}/10</span>
                </div>
                <ScoreBar score={s.score} inverted={inverted} />
                <p className="text-xs text-claude-muted">{s.explanation}</p>
                <Evidence excerpts={s.evidence} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Recurring themes */}
      <Section title="Recurring themes">
        <div className="flex flex-wrap gap-2">
          {report.recurringThemes?.map((t, i) => <Badge key={i} label={t} />)}
        </div>
      </Section>

      {/* Cognitive habits */}
      <Section title="Cognitive habits">
        <div className="space-y-4">
          {report.cognitiveHabits?.map((h, i) => (
            <div key={i}>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-claude-text">{h.habit}</p>
                <span className="text-xs text-claude-faint capitalize">{h.frequency}</span>
              </div>
              <Evidence excerpts={h.evidence} />
            </div>
          ))}
        </div>
      </Section>

      {/* Reasoning patterns */}
      <Section title="Reasoning patterns">
        <div className="space-y-4">
          {report.reasoningPatterns?.map((r, i) => (
            <div key={i}>
              <p className="text-sm text-claude-text mb-0.5">{r.pattern}</p>
              <p className="text-xs text-claude-faint font-mono">{r.shape}</p>
              <Evidence excerpts={r.evidence} />
            </div>
          ))}
        </div>
      </Section>

      {/* Argument gaps */}
      <Section title="Argument gap patterns">
        <div className="space-y-4">
          {report.argumentGapPatterns?.map((g, i) => (
            <div key={i}>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-claude-text">{g.gap}</p>
                <span className={`text-xs capitalize ${
                  g.severity === 'significant' ? 'text-red-400' :
                  g.severity === 'moderate' ? 'text-yellow-400' : 'text-claude-faint'
                }`}>{g.severity}</span>
              </div>
              <Evidence excerpts={g.evidence} />
            </div>
          ))}
        </div>
      </Section>

      {/* Strengths */}
      <Section title="Strengths">
        <div className="space-y-4">
          {report.strengths?.map((s, i) => (
            <div key={i}>
              <p className="text-sm text-claude-text">{s.strength}</p>
              <Evidence excerpts={s.evidence} />
            </div>
          ))}
        </div>
      </Section>

      {/* Risk signals */}
      <Section title="Risk signals">
        <div className="space-y-4">
          {report.riskSignals?.map((r, i) => (
            <div key={i}>
              <p className="text-sm text-claude-text">{r.signal}</p>
              <Evidence excerpts={r.evidence} />
            </div>
          ))}
        </div>
      </Section>

      {/* Style markers */}
      <Section title="Style markers">
        <div className="flex flex-wrap gap-2">
          {report.styleMarkers?.map((m, i) => <Badge key={i} label={m} />)}
        </div>
      </Section>

      <div className="mt-8 pb-8" />
    </div>
  );
}
