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
  text: z.string().min(12).max(140),
});

const editionSchema = z.object({
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
  editionNumber: z.number().int().positive().optional(),
  highlights: z.array(highlightSchema).length(3).optional(),
});

const readingSchema = z.object({
  title: z.string().min(8).max(160),
  summary: z.string().min(40).max(320),
  publishedAt: z.coerce.date(),
  status: z.enum(["draft", "published"]).default("draft"),
  tags: z.array(z.string().min(2)).min(1),
  source: sourceSchema,
  author: z.string().min(2).optional(),
  demo: z.boolean().default(false),
});

export const collections = {
  editions: defineCollection({
    loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/editions" }),
    schema: editionSchema,
  }),
  readings: defineCollection({
    loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/readings" }),
    schema: readingSchema,
  }),
};
