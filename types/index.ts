// types/index.ts

export interface Author {
  id: number;
  name: string;
  feedUrl: string;
  siteUrl: string | null;
  description: string | null;
  createdAt: string;
  articleCount?: number;
  lastChecked?: string | null;
  imprintVersion?: number;
}

export interface Article {
  id: number;
  authorId: number;
  title: string;
  url: string;
  publishedAt: string | null;
  fetchedAt: string;
  wordCount: number | null;
  rawText: string;
  extractedFeatures: DocumentFeatures | null;
}

export interface DocumentFeatures {
  title: string;
  date: string;
  sourceUrl: string;
  mainTopics: string[];
  coreClaims: string[];
  reasoningPatterns: string[];
  analogyPatterns: string[];
  argumentGaps: string[];
  styleMarkers: string[];
  strengthSignals: string[];
  riskSignals: string[];
  notableExcerpts: string[];
}

export interface ImprintScore {
  score: number;
  explanation: string;
  evidence: string[];
}

export interface ImprintReport {
  id: number;
  authorId: number;
  generatedAt: string;
  documentCount: number;
  totalWordCount: number;
  dateRange: { start: string; end: string };
  imprintSummary: string;
  recurringThemes: string[];
  cognitiveHabits: CognitiveHabit[];
  reasoningPatterns: ReasoningPattern[];
  argumentGapPatterns: ArgumentGap[];
  styleMarkers: string[];
  strengths: Strength[];
  riskSignals: RiskSignal[];
  scores: {
    compressionStrength: ImprintScore;
    argumentCompleteness: ImprintScore;
    frameworkStability: ImprintScore;
    extrapolationRisk: ImprintScore;
  };
  confidence: 'low' | 'moderate' | 'high';
  confidenceNote: string;
}

export interface CognitiveHabit {
  habit: string;
  frequency: 'occasional' | 'frequent' | 'consistent';
  evidence: string[];
}

export interface ReasoningPattern {
  pattern: string;
  shape: string;
  evidence: string[];
}

export interface ArgumentGap {
  gap: string;
  severity: 'minor' | 'moderate' | 'significant';
  evidence: string[];
}

export interface Strength {
  strength: string;
  evidence: string[];
}

export interface RiskSignal {
  signal: string;
  evidence: string[];
}

export interface NewArticle {
  title: string;
  url: string;
  publishedAt: string | null;
  guid: string;
  /** Plain text the feed itself carries (description / content:encoded).
   *  Fallback corpus source when the article page can't be fetched —
   *  e.g. Zhihu/WeChat pages behind anti-bot walls, reached via bridge feeds. */
  feedContent?: string | null;
}
