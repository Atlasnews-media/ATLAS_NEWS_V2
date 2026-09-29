import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const CONTRACT_RELATIVE =
  process.env.ATLAS_SOCIAL_CONTRACT_OUTPUT ||
  "tools/social-renderer/.generated/daily-contract.json";
const CONTRACT_PATH = path.join(ROOT, CONTRACT_RELATIVE);

function yamlScalar(raw) {
  const value = String(raw || "").trim();
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

function parseHighlights(frontmatterLines) {
  const start = frontmatterLines.findIndex((line) => line === "highlights:");
  if (start < 0) return [];
  const items = [];
  let current = null;

  for (let i = start + 1; i < frontmatterLines.length; i += 1) {
    const line = frontmatterLines[i];
    if (line && !line.startsWith(" ")) break;
    const labelMatch = line.match(/^\s{2}- label:\s*(.+)$/);
    if (labelMatch) {
      if (current) items.push(current);
      current = { label: yamlScalar(labelMatch[1]), text: "" };
      continue;
    }
    const textMatch = line.match(/^\s{4}text:\s*(.+)$/);
    if (textMatch && current) current.text = yamlScalar(textMatch[1]);
  }
  if (current) items.push(current);
  return items.filter((item) => item.label && item.text);
}

function compact(text, max, label) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) throw new Error(`${label} is required`);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const boundary = cut.lastIndexOf(" ");
  const shortened = `${cut.slice(0, boundary > max * 0.65 ? boundary : cut.length).trim()}…`;
  console.warn(
    `[social-v2] ${label} compacted from ${clean.length} to ${shortened.length} chars`,
  );
  return shortened;
}

async function main() {
  try {
    await fs.access(CONTRACT_PATH);
  } catch {
    console.log("[social-v2] no v1 contract present; safe no-op");
    return;
  }

  const v1 = JSON.parse(await fs.readFile(CONTRACT_PATH, "utf8"));
  if (String(v1.version) !== "1") {
    throw new Error(`Expected Social Content Contract v1, got ${v1.version}`);
  }
  if (!v1.sourceId) throw new Error("v1 sourceId is required for v2 upgrade");

  const sourcePath = path.resolve(ROOT, String(v1.sourceId));
  const relative = path.relative(ROOT, sourcePath).replaceAll(path.sep, "/");
  if (relative !== String(v1.sourceId).replaceAll("\\", "/")) {
    throw new Error("Unsafe sourceId in social contract");
  }

  const markdown = await fs.readFile(sourcePath, "utf8");
  const parts = markdown.split(/^---\s*$/m);
  if (parts.length < 3)
    throw new Error(`Invalid Markdown frontmatter: ${v1.sourceId}`);
  const frontmatterLines = parts[1].split(/\r?\n/);
  const publishedHighlights = parseHighlights(frontmatterLines);

  if (publishedHighlights.length !== 5) {
    throw new Error(
      `Fail-closed: seven-slide carousel requires exactly the 5 published General highlights; found ${publishedHighlights.length}`,
    );
  }

  const cards = publishedHighlights.map((item, index) => ({
    label: compact(item.label, 72, `highlights[${index}].label`),
    text: compact(item.text, 180, `highlights[${index}].text`),
  }));

  const v2 = {
    version: "2",
    sourceCommit: v1.sourceCommit || "",
    sourceId: v1.sourceId,
    canonicalUrl: v1.canonicalUrl,
    publishedDate: v1.publishedDate,
    productType: v1.productType,
    sectionLabel: v1.sectionLabel,
    title: v1.title,
    dek: v1.dek,
    highlights: cards,
  };

  await fs.writeFile(CONTRACT_PATH, `${JSON.stringify(v2, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        contractVersion: v2.version,
        sourceId: v2.sourceId,
        highlightCards: v2.highlights.length,
        output: CONTRACT_RELATIVE,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
