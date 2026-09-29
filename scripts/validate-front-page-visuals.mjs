import { readFile } from "node:fs/promises";

const homePath = new URL("../dist/index.html", import.meta.url);
const html = await readFile(homePath, "utf8");

const headlineBlocks = [
  ...html.matchAll(
    /<section\b[^>]*class=(?:"[^"]*\bheadline-item\b[^"]*"|'[^']*\bheadline-item\b[^']*')[^>]*>([\s\S]*?)<\/section>/gi,
  ),
];

const visuals = headlineBlocks
  .map(([, block]) => {
    const label =
      block
        .match(
          /<p\b[^>]*class=(?:"[^"]*\bheadline-label\b[^"]*"|'[^']*\bheadline-label\b[^']*')[^>]*>([\s\S]*?)<\/p>/i,
        )?.[1]
        ?.replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim() ?? "Titular";
    const src =
      block.match(/<img\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)')[^>]*>/i)?.[1] ??
      block.match(/<img\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)')[^>]*>/i)?.[2];
    return src ? { label, src } : null;
  })
  .filter(Boolean);

const seen = new Map();
for (const visual of visuals) {
  const previous = seen.get(visual.src);
  if (previous) {
    throw new Error(
      `La portada reutiliza la misma fotografía en ${previous} y ${visual.label}: ${visual.src}`,
    );
  }
  seen.set(visual.src, visual.label);
}

console.log(
  `[visual-integrity] ${visuals.length} titulares con ${seen.size} fotografías únicas.`,
);
