// lib/schema.ts
import { pgTable, serial, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const authors = pgTable('authors', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  feedUrl: text('feed_url').notNull(),
  siteUrl: text('site_url'),
  description: text('description'),
  lastChecked: timestamp('last_checked'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const articles = pgTable('articles', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id').notNull().references(() => authors.id),
  title: text('title').notNull(),
  url: text('url').notNull().unique(),
  guid: text('guid').unique(),
  publishedAt: timestamp('published_at'),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
  wordCount: integer('word_count'),
  rawText: text('raw_text').notNull(),
  extractedFeatures: jsonb('extracted_features'),
});

export const imprintReports = pgTable('imprint_reports', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id').notNull().references(() => authors.id),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
  documentCount: integer('document_count').notNull(),
  totalWordCount: integer('total_word_count').notNull(),
  reportData: jsonb('report_data').notNull(),
});
