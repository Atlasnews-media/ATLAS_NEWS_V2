import { access, readdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

const corePages = [
  "dist/index.html",
  "dist/ediciones/index.html",
  "dist/lecturas/index.html",
  "dist/archivo/index.html",
];

const contentGroups = [
  {
    label: "edición",
    sourceDir: new URL("src/content/editions/", root),
    outputDir: "dist/ediciones",
    requiredHeadings: [
      "Hecho central",
      "En una mirada",
      "Por qué importa",
      "Mercados globales",
      "Chile",
      "Tasas, monedas y commodities",
      "Qué observar",
    ],
  },
  {
    label: "lectura",
    sourceDir: new URL("src/content/readings/", root),
    outputDir: "dist/lecturas",
    requiredHeadings: [
      "Tesis principal",
      "Por qué fue seleccionada",
      "Contexto y límites",
    ],
  },
];

function frontmatterValue(text, field) {
  return text
    .match(new RegExp(`^${field}:\\s*["']?([^"'\\r\\n]+)`, "m"))?.[1]
    ?.trim();
}

function stripFrontmatter(text) {
  return text.replace(
    /^\uFEFF?---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/,
    "",
  );
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function normalizeText(text) {
  return decodeHtmlEntities(text)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
}

function markdownToText(markdown) {
  return normalizeText(
    stripFrontmatter(markdown)
      .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^>\s?/gm, "")
      .replace(/^[-*+]\s+/gm, "")
      .replace(/^\d+\.\s+/gm, "")
      .replace(/^\|?(?:\s*:?-+:?\s*\|)+\s*$/gm, "")
      .replace(/\|/g, " ")
      .replace(/[*_~`]/g, "")
      .replace(/^\s*-{3,}\s*$/gm, " "),
  );
}

function htmlToText(html) {
  return normalizeText(
    html
      .replace(/<!--([\s\S]*?)-->/g, " ")
      .replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

async function exists(path) {
  try {
    await access(new URL(path, root));
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function markdownFiles(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.mdx?$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function countOccurrences(text, passage) {
  if (!passage) return 0;
  return text.split(passage).length - 1;
}

async function validatePublishedFile(group, filename, markdown) {
  const slug = filename.replace(/\.mdx?$/, "");
  const outputPath = `${group.outputDir}/${slug}/index.html`;

  if (!(await exists(outputPath))) {
    throw new Error(
      `La ${group.label} publicada no generó su página: ${outputPath}`,
    );
  }

  const html = await readFile(new URL(outputPath, root), "utf8");
  const htmlText = htmlToText(html);
  const bodyText = markdownToText(markdown);
  const title = normalizeText(frontmatterValue(markdown, "title") ?? "");

  if (!title || !htmlText.includes(title)) {
    throw new Error(
      `La ${group.label} ${filename} no conserva su título en el HTML.`,
    );
  }

  for (const heading of group.requiredHeadings) {
    if (!htmlText.includes(normalizeText(heading))) {
      throw new Error(
        `La ${group.label} ${filename} omitió la sección: ${heading}`,
      );
    }
  }

  if (!bodyText || !htmlText.includes(bodyText)) {
    throw new Error(
      `La ${group.label} ${filename} no llegó íntegra y en orden al HTML generado.`,
    );
  }

  for (const internalText of ["briefing", "brifing", "cite"]) {
    if (html.toLowerCase().includes(internalText.toLowerCase())) {
      throw new Error(
        `La ${group.label} ${filename} expone texto interno: ${internalText}`,
      );
    }
  }

  const generalNotice = normalizeText("no constituye una recomendación");
  const generalNoticeCount = countOccurrences(htmlText, generalNotice);
  if (generalNoticeCount !== 1) {
    throw new Error(
      `El aviso general debe aparecer una sola vez en ${filename}: se detectaron ${generalNoticeCount}.`,
    );
  }
}

async function validateContentGroup(group) {
  const files = await markdownFiles(group.sourceDir);
  const publishedEditionKeys = new Map();
  let publishedCount = 0;
  let draftCount = 0;

  for (const filename of files) {
    const markdown = await readFile(new URL(filename, group.sourceDir), "utf8");
    const status = frontmatterValue(markdown, "status");
    const slug = filename.replace(/\.mdx?$/, "");
    const outputPath = `${group.outputDir}/${slug}/index.html`;

    if (status === "published") {
      publishedCount += 1;

      if (group.outputDir === "dist/ediciones") {
        const match = filename.match(
          /^(\d{4}-\d{2}-\d{2})-(daily|weekly)-/,
        );
        if (match) {
          const editionKey = `${match[1]}:${match[2]}`;
          const previous = publishedEditionKeys.get(editionKey);
          if (previous) {
            throw new Error(
              `Hay dos ediciones publicadas para ${editionKey}: ${previous} y ${filename}.`,
            );
          }
          publishedEditionKeys.set(editionKey, filename);
        }
      }

      await validatePublishedFile(group, filename, markdown);
      continue;
    }

    if (status === "draft") {
      draftCount += 1;
      if (await exists(outputPath)) {
        throw new Error(`El borrador ${filename} fue publicado por error.`);
      }
    }
  }

  return { publishedCount, draftCount };
}

for (const path of corePages) await access(new URL(path, root));

const home = await readFile(new URL("dist/index.html", root), "utf8");
if (!htmlToText(home).includes(normalizeText("ATLAS NEWS"))) {
  throw new Error("La portada generada no contiene la marca ATLAS NEWS.");
}

const results = [];
for (const group of contentGroups) {
  results.push({ group, result: await validateContentGroup(group) });
}

const publishedTotal = results.reduce(
  (total, { result }) => total + result.publishedCount,
  0,
);
const draftTotal = results.reduce(
  (total, { result }) => total + result.draftCount,
  0,
);

console.log(
  `Salida validada: ${corePages.length} páginas base, ${publishedTotal} publicaciones íntegras y ${draftTotal} borradores excluidos.`,
);
