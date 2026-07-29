// lib/analyzer.ts
import { DocumentFeatures, ImprintReport, Article } from '@/types';

// ─── LLM transport (OpenRouter) ─────────────────────────────────────────────
// The model id lives here and nowhere else. Override with OPENROUTER_MODEL to
// point at any model OpenRouter serves (e.g. openai/gpt-4o, google/gemini-2.5-pro).

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4';

async function callModel(prompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // Optional attribution headers used by OpenRouter's dashboard/rankings.
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'http://localhost:3000',
      'X-Title': 'Cognitive Imprint',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  // OpenRouter can return a 200 with an error payload.
  if (data.error) {
    throw new Error(`OpenRouter error: ${JSON.stringify(data.error).slice(0, 300)}`);
  }

  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error(`OpenRouter returned no content: ${JSON.stringify(data).slice(0, 300)}`);
  }

  return text;
}

function parseJsonResponse<T>(raw: string, label: string): T {
  // Models sometimes wrap JSON in a markdown fence or add a preamble.
  let clean = raw.replace(/```(?:json)?/gi, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start > 0 || (end !== -1 && end < clean.length - 1)) {
    clean = clean.slice(start, end + 1);
  }

  try {
    return JSON.parse(clean) as T;
  } catch {
    throw new Error(`Failed to parse ${label}: ${clean.slice(0, 200)}`);
  }
}

// ─── Per-document extraction ───────────────────────────────────────────────

export async function extractDocumentFeatures(
  title: string,
  text: string,
  url: string,
  date: string | null
): Promise<DocumentFeatures> {
  const prompt = `You are a cognitive pattern analyst. Analyze this text and extract structured features.

STRICT RULES:
- Do not flatter the author
- Do not infer private psychology or motives
- Separate: what is present in text / what is a plausible inference / what is uncertain
- Every claim must be grounded in the text
- Focus on COGNITIVE patterns, not content summary

TEXT METADATA:
Title: ${title}
URL: ${url}
Date: ${date ?? 'unknown'}

TEXT:
${text.slice(0, 6000)}

Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "title": string,
  "date": string,
  "sourceUrl": string,
  "mainTopics": string[],
  "coreClaims": string[],
  "reasoningPatterns": string[],
  "analogyPatterns": string[],
  "argumentGaps": string[],
  "styleMarkers": string[],
  "strengthSignals": string[],
  "riskSignals": string[],
  "notableExcerpts": string[]
}

For notableExcerpts: pick 2-4 verbatim short phrases (under 20 words each) that best illustrate the author's cognitive habits.`;

  const raw = await callModel(prompt, 1500);
  return parseJsonResponse<DocumentFeatures>(raw, 'document features');
}

// ─── Corpus-level aggregation ──────────────────────────────────────────────

// The fields the model produces; the rest are computed from the corpus itself.
type ModelAuthoredReport = Omit<
  ImprintReport,
  | 'id' | 'authorId' | 'generatedAt'
  | 'documentCount' | 'totalWordCount' | 'dateRange'
  | 'confidence' | 'confidenceNote'
>;

export async function generateImprintReport(
  authorName: string,
  articles: Article[],
): Promise<Omit<ImprintReport, 'id' | 'authorId' | 'generatedAt'>> {
  const docCount = articles.length;
  const totalWords = articles.reduce((sum, a) => sum + (a.wordCount ?? 0), 0);

  const dates = articles
    .map(a => a.publishedAt)
    .filter(Boolean)
    .sort() as string[];

  const dateRange = {
    start: dates[0] ?? 'unknown',
    end: dates[dates.length - 1] ?? 'unknown',
  };

  // Confidence assessment
  let confidence: 'low' | 'moderate' | 'high';
  let confidenceNote: string;
  if (docCount < 5 || totalWords < 3000) {
    confidence = 'low';
    confidenceNote = `Only ${docCount} documents (${totalWords} words). Patterns identified here are preliminary and may not reflect stable habits.`;
  } else if (docCount < 15 || totalWords < 15000) {
    confidence = 'moderate';
    confidenceNote = `${docCount} documents (${totalWords} words). Patterns are emerging but corpus is still limited.`;
  } else {
    confidence = 'high';
    confidenceNote = `${docCount} documents (${totalWords} words) across a meaningful time range.`;
  }

  // Aggregate all extracted features
  const allFeatures = articles
    .filter(a => a.extractedFeatures)
    .map(a => a.extractedFeatures!);

  const featuresJson = JSON.stringify(allFeatures, null, 2).slice(0, 15000);

  const prompt = `You are a cognitive pattern analyst performing corpus-level analysis.

Author: ${authorName}
Corpus: ${docCount} documents, ${totalWords} words, spanning ${dateRange.start} to ${dateRange.end}

STRICT RULES:
- Do not flatter the author
- Do not make unsupported claims about motive or private psychology
- Distinguish: confirmed patterns (appear in 50%+ of docs) / emerging patterns / single instances
- Every claim MUST reference specific text evidence from the excerpts provided
- Analyze cognitive habits separately from style and topic preference
- Be intellectually honest about limitations

SCORING ANCHORS:
- Compression Strength 10/10: Paul Graham — maximum insight per word, each sentence earns its place
- Compression Strength 2/10: Corporate blog — padded, generic, low signal density
- Argument Completeness 10/10: Academic paper — clear claim, evidence, counterarguments, bounded conclusions
- Argument Completeness 2/10: Twitter hot take — assertion without support
- Framework Stability 10/10: Consistent worldview and conceptual vocabulary across all texts
- Framework Stability 2/10: Contradictory positions, no stable lens
- Extrapolation Risk 10/10: Constant leap from one data point to universal claim
- Extrapolation Risk 2/10: Always bounded, careful about generalization

EXTRACTED FEATURES FROM ALL DOCUMENTS:
${featuresJson}

Return ONLY valid JSON (no markdown, no explanation):
{
  "imprintSummary": "one sentence describing the author's cognitive signature",
  "recurringThemes": ["theme1", "theme2"],
  "cognitiveHabits": [
    {
      "habit": "description",
      "frequency": "occasional|frequent|consistent",
      "evidence": ["verbatim excerpt 1", "verbatim excerpt 2"]
    }
  ],
  "reasoningPatterns": [
    {
      "pattern": "description",
      "shape": "e.g. observation → analogy → conclusion",
      "evidence": ["excerpt"]
    }
  ],
  "argumentGapPatterns": [
    {
      "gap": "description",
      "severity": "minor|moderate|significant",
      "evidence": ["excerpt"]
    }
  ],
  "styleMarkers": ["marker1", "marker2"],
  "strengths": [
    {
      "strength": "description",
      "evidence": ["excerpt"]
    }
  ],
  "riskSignals": [
    {
      "signal": "description",
      "evidence": ["excerpt"]
    }
  ],
  "scores": {
    "compressionStrength": {
      "score": 0,
      "explanation": "explanation",
      "evidence": ["excerpt1", "excerpt2"]
    },
    "argumentCompleteness": {
      "score": 0,
      "explanation": "explanation",
      "evidence": ["excerpt1"]
    },
    "frameworkStability": {
      "score": 0,
      "explanation": "explanation",
      "evidence": ["excerpt1"]
    },
    "extrapolationRisk": {
      "score": 0,
      "explanation": "explanation",
      "evidence": ["excerpt1"]
    }
  }
}`;

  const raw = await callModel(prompt, 4000);
  const parsed = parseJsonResponse<ModelAuthoredReport>(raw, 'imprint report');

  return {
    ...parsed,
    documentCount: docCount,
    totalWordCount: totalWords,
    dateRange,
    confidence,
    confidenceNote,
  };
}
