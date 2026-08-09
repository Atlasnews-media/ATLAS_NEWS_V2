import { access, readdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const briefingDir = new URL("src/content/briefings/", root);

const corePages = [
  "dist/index.html",
  "dist/ediciones/index.html",
  "dist/nacional/index.html",
  "dist/mercados/index.html",
  "dist/lecturas/index.html",
  "dist/archivo/index.html",
  "dist/estado/index.html",
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

async function validateRenderedPublication({
  label,
  filename,
  markdown,
  outputPath,
  requiredHeadings = [],
}) {
  if (!(await exists(outputPath))) {
    throw new Error(`La ${label} publicada no generó su página: ${outputPath}`);
  }

  const html = await readFile(new URL(outputPath, root), "utf8");
  const htmlText = htmlToText(html);
  const title = normalizeText(frontmatterValue(markdown, "title") ?? "");

  if (!title || !htmlText.includes(title)) {
    throw new Error(`La ${label} ${filename} no conserva su título en el HTML.`);
  }

  for (const heading of requiredHeadings) {
    if (!htmlText.includes(normalizeText(heading))) {
      throw new Error(`La ${label} ${filename} omitió la sección: ${heading}`);
    }
  }

  for (const internalText of ["briefing", "brifing", "cite"]) {
    if (html.toLowerCase().includes(internalText.toLowerCase())) {
      throw new Error(
        `La ${label} ${filename} expone texto interno: ${internalText}`,
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

async function validatePublishedFile(group, filename, markdown) {
  const slug = filename.replace(/\.mdx?$/, "");
  const outputPath = `${group.outputDir}/${slug}/index.html`;
  await validateRenderedPublication({
    label: group.label,
    filename,
    markdown,
    outputPath,
    requiredHeadings: group.requiredHeadings,
  });
}

async function validateContentGroup(group) {
  const files = await markdownFiles(group.sourceDir);
  const publishedEditionKeys = new Map();
  const published = [];
  let draftCount = 0;

  for (const filename of files) {
    const markdown = await readFile(new URL(filename, group.sourceDir), "utf8");
    const status = frontmatterValue(markdown, "status");
    const slug = filename.replace(/\.mdx?$/, "");
    const outputPath = `${group.outputDir}/${slug}/index.html`;

    if (status === "published") {
      const record = {
        filename,
        slug,
        title: frontmatterValue(markdown, "title") ?? "",
        publishedAt: frontmatterValue(markdown, "publishedAt") ?? "",
        type: frontmatterValue(markdown, "type"),
      };
      published.push(record);

      if (group.outputDir === "dist/ediciones") {
        const match = filename.match(/^(\d{4}-\d{2}-\d{2})-(daily|weekly)-/);
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

  return { published, draftCount };
}

async function validateBriefings() {
  const files = await markdownFiles(briefingDir);
  const published = [];
  let draftCount = 0;

  for (const filename of files) {
    const markdown = await readFile(new URL(filename, briefingDir), "utf8");
    const status = frontmatterValue(markdown, "status");
    const section = frontmatterValue(markdown, "section");
    const slug = filename.replace(/\.mdx?$/, "");
    const route =
      section === "national"
        ? "nacional"
        : section === "markets"
          ? "mercados"
          : undefined;

    if (status === "published") {
      if (!route) {
        throw new Error(
          `El briefing publicado ${filename} no tiene una sección pública válida.`,
        );
      }

      const outputPath = `dist/${route}/${slug}/index.html`;
      const record = {
        filename,
        slug,
        title: frontmatterValue(markdown, "title") ?? "",
        publishedAt: frontmatterValue(markdown, "publishedAt") ?? "",
        section,
        route,
      };
      published.push(record);
      await validateRenderedPublication({
        label: section === "national" ? "pieza Nacional" : "pieza Mercados",
        filename,
        markdown,
        outputPath,
      });
      continue;
    }

    if (status === "draft") {
      draftCount += 1;
      for (const candidateRoute of ["nacional", "mercados"]) {
        if (await exists(`dist/${candidateRoute}/${slug}/index.html`)) {
          throw new Error(`El borrador ${filename} fue publicado por error.`);
        }
      }
    }
  }

  return { published, draftCount };
}

for (const path of corePages) await access(new URL(path, root));
await access(new URL("dist/status.json", root));

const home = await readFile(new URL("dist/index.html", root), "utf8");
const homeText = htmlToText(home);
if (!homeText.includes(normalizeText("ATLAS NEWS"))) {
  throw new Error("La portada generada no contiene la marca ATLAS NEWS.");
}

const results = [];
for (const group of contentGroups) {
  results.push({ group, result: await validateContentGroup(group) });
}
const briefingResult = await validateBriefings();

const editionResult = results.find(
  ({ group }) => group.outputDir === "dist/ediciones",
)?.result;
const readingResult = results.find(
  ({ group }) => group.outputDir === "dist/lecturas",
)?.result;

const publishedDailies = (editionResult?.published ?? [])
  .filter(({ type }) => type === "daily")
  .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
const publishedWeeklies = (editionResult?.published ?? []).filter(
  ({ type }) => type === "weekly",
);
const publishedNational = briefingResult.published
  .filter(({ section }) => section === "national")
  .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
const publishedMarkets = briefingResult.published
  .filter(({ section }) => section === "markets")
  .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));

const latestDaily = publishedDailies.at(-1);
const latestNational = publishedNational.at(-1);
const latestMarkets = publishedMarkets.at(-1);
const currentIssueNumber = publishedDailies.length;
const currentIssueLabel = `N° ${String(currentIssueNumber).padStart(3, "0")}`;

if (latestDaily) {
  if (!homeText.includes(normalizeText(latestDaily.title))) {
    throw new Error(
      `La portada no muestra la edición diaria más reciente: ${latestDaily.filename}.`,
    );
  }
  if (!homeText.includes(normalizeText(currentIssueLabel))) {
    throw new Error(
      `La portada no muestra la numeración vigente ${currentIssueLabel}.`,
    );
  }
}
if (latestNational) {
  if (!homeText.includes(normalizeText(latestNational.title))) {
    throw new Error("La portada no muestra la pieza Nacional más reciente.");
  }
  if (!home.includes(`/nacional/${latestNational.slug}/`)) {
    throw new Error("La portada no enlaza la pieza Nacional más reciente.");
  }
}
if (latestMarkets) {
  if (!homeText.includes(normalizeText(latestMarkets.title))) {
    throw new Error("La portada no muestra la pieza Mercados más reciente.");
  }
  if (!home.includes(`/mercados/${latestMarkets.slug}/`)) {
    throw new Error("La portada no enlaza la pieza Mercados más reciente.");
  }
}

const status = JSON.parse(
  await readFile(new URL("dist/status.json", root), "utf8"),
);
if (status.schemaVersion !== 1) {
  throw new Error("El manifiesto público no usa el esquema esperado.");
}
if (latestDaily) {
  if (status.latestDaily?.id !== latestDaily.slug) {
    throw new Error(
      "El manifiesto no identifica la edición diaria más reciente.",
    );
  }
  if (status.latestDaily?.issueNumber !== currentIssueNumber) {
    throw new Error(
      "El manifiesto contiene una numeración editorial incorrecta.",
    );
  }
  if (
    normalizeText(status.latestDaily?.title ?? "") !==
    normalizeText(latestDaily.title)
  ) {
    throw new Error(
      "El manifiesto no conserva el título de la portada vigente.",
    );
  }
}
if (status.latestNational?.id !== (latestNational?.slug ?? undefined)) {
  if (!(status.latestNational === null && !latestNational)) {
    throw new Error("El manifiesto no identifica el Nacional más reciente.");
  }
}
if (status.latestMarkets?.id !== (latestMarkets?.slug ?? undefined)) {
  if (!(status.latestMarkets === null && !latestMarkets)) {
    throw new Error("El manifiesto no identifica el Mercados más reciente.");
  }
}
if (!status.sourceCommit || typeof status.sourceCommit !== "string") {
  throw new Error("El manifiesto no identifica el commit de origen.");
}

const statePage = htmlToText(
  await readFile(new URL("dist/estado/index.html", root), "utf8"),
);
if (latestDaily && !statePage.includes(normalizeText(latestDaily.title))) {
  throw new Error("La página de estado no identifica la portada vigente.");
}
if (latestDaily && !statePage.includes(normalizeText(currentIssueLabel))) {
  throw new Error("La página de estado no muestra la numeración vigente.");
}

const readingCount = readingResult?.published.length ?? 0;
const publishedTotal =
  publishedDailies.length +
  publishedWeeklies.length +
  publishedNational.length +
  publishedMarkets.length +
  readingCount;
const draftTotal =
  results.reduce((total, { result }) => total + result.draftCount, 0) +
  briefingResult.draftCount;

if (status.publications?.daily !== publishedDailies.length) {
  throw new Error("El manifiesto no coincide con las ediciones diarias.");
}
if (status.publications?.weekly !== publishedWeeklies.length) {
  throw new Error("El manifiesto no coincide con los panoramas semanales.");
}
if (status.publications?.national !== publishedNational.length) {
  throw new Error("El manifiesto no coincide con Nacional.");
}
if (status.publications?.markets !== publishedMarkets.length) {
  throw new Error("El manifiesto no coincide con Mercados.");
}
if (status.publications?.readings !== readingCount) {
  throw new Error("El manifiesto no coincide con las lecturas publicadas.");
}
if (status.publications?.total !== publishedTotal) {
  throw new Error("El manifiesto no coincide con el total publicado.");
}

console.log(
  `Salida validada: ${corePages.length} páginas base, ${publishedTotal} publicaciones íntegras, ${draftTotal} borradores excluidos y ${currentIssueLabel} vigente.`,
);
