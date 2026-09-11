import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import * as z from "zod";

const sourceSchema = z.object({
  name: z.string().min(2),
  url: z.url(),
  publishedAt: z.coerce.date().optional(),
});

const highlightSchema = z.object({
  label: z.string().min(2).max(24),
  text: z.string().min(12).max(160),
});

const marketItemSchema = z.object({
  label: z.string().min(2).max(32),
  value: z.string().min(1).max(32),
  change: z.string().min(1).max(16).optional(),
  category: z.enum(["monedas", "mercados", "commodities", "tasas"]),
});

const marketSummarySchema = z.object({
  asOf: z.coerce.date(),
  items: z.array(marketItemSchema).min(3).max(6),
});

const editorialVisualSchema = z.object({
  src: z.url(),
  alt: z.string().min(12).max(220),
  source: z.string().min(2).max(80),
  sourceUrl: z.url(),
  author: z.string().min(2).max(120),
  license: z.string().min(2).max(160),
});

const readingAudioSchema = z.object({
  src: z.string().regex(/^\/audio\/readings\/[a-z0-9-]+\.mp3$/),
  durationLabel: z.string().min(3).max(16),
  voice: z.string().min(2).max(32),
});

const editionSchema = z
  .object({
    title: z.string().min(8).max(140),
    summary: z.string().min(40).max(320),
    publishedAt: z.coerce.date(),
    cutoffAt: z.coerce.date(),
    type: z.enum(["daily", "weekly"]),
    status: z.enum(["draft", "published"]).default("draft"),
    tags: z.array(z.string().min(2)).min(1),
    sources: z.array(sourceSchema).min(1),
    featured: z.boolean().default(false),
    demo: z.boolean().default(false),
    highlights: z.array(highlightSchema).length(3).optional(),
    marketSummary: marketSummarySchema.optional(),
    editorialVisual: editorialVisualSchema.optional(),
  })
  .superRefine((edition, context) => {
    if (
      edition.marketSummary &&
      edition.marketSummary.asOf > edition.cutoffAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["marketSummary", "asOf"],
        message:
          "La fecha del resumen de mercado no puede superar el corte editorial.",
      });
    }
  });

const briefingSchema = z
  .object({
    title: z.string().min(8).max(160),
    summary: z.string().min(40).max(320),
    publishedAt: z.coerce.date(),
    cutoffAt: z.coerce.date(),
    section: z.enum(["national", "markets"]),
    status: z.enum(["draft", "published"]).default("draft"),
    tags: z.array(z.string().min(2)).min(1),
    sources: z.array(sourceSchema).min(1),
    highlights: z.array(highlightSchema).length(3).optional(),
    demo: z.boolean().default(false),
    editorialVisual: editorialVisualSchema.optional(),
  })
  .superRefine((briefing, context) => {
    if (briefing.cutoffAt > briefing.publishedAt) {
      context.addIssue({
        code: "custom",
        path: ["cutoffAt"],
        message:
          "La fecha de corte editorial no puede superar la fecha de publicación.",
      });
    }
  });

const readingSchema = z.object({
  title: z.string().min(8).max(160),
  summary: z.string().min(40).max(320),
  publishedAt: z.coerce.date(),
  status: z.enum(["draft", "published"]).default("draft"),
  tags: z.array(z.string().min(2)).min(1),
  source: sourceSchema,
  author: z.string().min(2).optional(),
  audio: readingAudioSchema.optional(),
  demo: z.boolean().default(false),
});

export const collections = {
  editions: defineCollection({
    loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/editions" }),
    schema: editionSchema,
  }),
  briefings: defineCollection({
    loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/briefings" }),
    schema: briefingSchema,
  }),
  readings: defineCollection({
    loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/readings" }),
    schema: readingSchema,
  }),
};
