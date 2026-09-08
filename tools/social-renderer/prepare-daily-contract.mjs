import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(process.cwd());
const SOURCE_COMMIT = String(process.env.ATLAS_SOURCE_COMMIT || "").trim();
const STATUS_URL =
  process.env.ATLAS_PUBLIC_STATUS_URL ||
  "https://eldesiempre100.github.io/status.json";
const BLOCKED_SOURCE_COMMIT =
  process.env.ATLAS_BLOCKED_SOURCE_COMMIT ||
  "74e4d789383cce8d3b7a75679ecb263576d3ac70";
const OUTPUT_RELATIVE =
  process.env.ATLAS_SOCIAL_CONTRACT_OUTPUT ||
  "tools/social-renderer/.generated/daily-contract.json";
const STATUS_READINESS_TIMEOUT_MS = envMs("ATLAS_PUBLIC_STATUS_TIMEOUT_MS", 45000);
const STATUS_FETCH_TIMEOUT_MS = envMs(
  "ATLAS_PUBLIC_STATUS_FETCH_TIMEOUT_MS",
  8000,
);
const STATUS_RETRY_BASE_MS = envMs(
  "ATLAS_PUBLIC_STATUS_RETRY_BASE_MS",
  3000,
);
const STATUS_RETRY_MAX_MS = envMs(
  "ATLAS_PUBLIC_STATUS_RETRY_MAX_MS",
  12000,
);
const TRANSIENT_STATUS_CODES = new Set([404, 429, 500, 502, 503]);

const KEY_ICONS = ["trend-up", "cash-card", "risk-triangle"];
const IMPACT_ICONS = ["portfolio-grid", "decision-check", "context-target"];
const IMPACT_LABELS = ["Carteras", "Decisiones", "Contexto"];

function envMs(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function writeOutput(name, value) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  return fs.appendFile(output, `${name}=${String(value)}\n`);
}

async function markSkipped(reason) {
  await writeOutput("eligible", "false");
  await writeOutput("reason", reason);
  console.log(JSON.stringify({ eligible: false, reason }, null, 2));
}

function git(args, options = {}) {
  const result = execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    ...options,
  });
  return String(result ?? "").trim();
}

function commitParents(commit) {
  const raw = git(["cat-file", "-p", commit]);
  return raw
    .split(/\r?\n/)
    .map((line) => line.match(/^parent ([0-9a-f]{40})$/)?.[1])
    .filter(Boolean);
}

function hasCommit(commit) {
  try {
    git(["cat-file", "-e", `${commit}^{commit}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function fetchCommit(commit, depth = 2) {
  if (hasCommit(commit)) return;
  git(["fetch", "--no-tags", `--depth=${depth}`, "origin", commit], {
    stdio: "ignore",
  });
  if (!hasCommit(commit)) {
    throw new Error(
      `Fail-closed: Git commit ${commit} is not available locally`,
    );
  }
}

function changedFiles(commit) {
  const [firstParent] = commitParents(commit);
  if (!firstParent) {
    const result = git([
      "diff-tree",
      "--root",
      "--no-commit-id",
      "--name-only",
      "-r",
      commit,
    ]);
    return result
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  fetchCommit(firstParent);
  const result = git(["diff", "--name-only", firstParent, commit]);
  return result
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isAncestor(ancestor, descendant) {
  try {
    git(["merge-base", "--is-ancestor", ancestor, descendant], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function fetchPublicCommitHistory(commit) {
  if (hasCommit(commit) && isAncestor(SOURCE_COMMIT, commit)) return;

  try {
    git(["fetch", "--no-tags", "--depth=128", "origin", commit], {
      stdio: "ignore",
    });
  } catch {
    git(["fetch", "--no-tags", "--depth=128", "origin", "main"], {
      stdio: "ignore",
    });
  }

  if (!hasCommit(commit)) {
    throw new Error(
      `Fail-closed: public status commit ${commit} cannot be verified in origin`,
    );
  }
}

function readinessUrl(attempt) {
  const url = new URL(STATUS_URL);
  url.searchParams.set("source", SOURCE_COMMIT);
  url.searchParams.set("readiness", `${Date.now()}-${attempt}`);
  return url.toString();
}

function logReadiness(attempt, expectedEdition, observed, state, detail = "") {
  console.log(
    JSON.stringify({
      attempt,
      timestamp: new Date().toISOString(),
      expectedCommit: SOURCE_COMMIT,
      observedCommit: observed?.commit || "<missing>",
      expectedEdition,
      observedEdition: observed?.edition || "<missing>",
      state,
      ...(detail ? { detail } : {}),
    }),
  );
}

function statusIdentity(status) {
  const commit = String(status?.sourceCommit || "").trim();
  const edition = String(status?.latestDaily?.id || "").trim();
  if (!/^[0-9a-f]{40}$/i.test(commit) || !edition) {
    throw new Error(
      "PUBLIC_STATUS_INVALID: sourceCommit/latestDaily.id missing or invalid",
    );
  }
  return { commit, edition };
}

function isSupersededEdition(observed, expected) {
  const observedDate = String(observed || "").slice(0, 10);
  const expectedDate = String(expected || "").slice(0, 10);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(observedDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(expectedDate) &&
    observedDate > expectedDate
  );
}

function isTransientStatusError(error) {
  const message = String(error?.message || error);
  return (
    /HTTP (404|429|500|502|503)\b/.test(message) ||
    error?.name === "AbortError" ||
    error?.name === "TypeError"
  );
}

async function waitForPublicStatus(expectedEdition) {
  const deadline = Date.now() + STATUS_READINESS_TIMEOUT_MS;
  let attempt = 0;
  let observed = null;

  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const status = await fetchJson(readinessUrl(attempt));
      observed = statusIdentity(status);

      if (
        observed.commit === SOURCE_COMMIT &&
        observed.edition === expectedEdition
      ) {
        logReadiness(attempt, expectedEdition, observed, "READY");
        return "exact-public-identity";
      }

      if (isSupersededEdition(observed.edition, expectedEdition)) {
        logReadiness(
          attempt,
          expectedEdition,
          observed,
          "SUPERSEDED_BY_NEWER_RELEASE",
        );
        throw new Error(
          `SUPERSEDED_BY_NEWER_RELEASE: observed ${observed.edition} while waiting for ${expectedEdition}`,
        );
      }

      logReadiness(attempt, expectedEdition, observed, "WAITING_PUBLIC_STATUS");
    } catch (error) {
      if (String(error?.message || "").startsWith("SUPERSEDED_BY_NEWER_RELEASE:")) {
        throw error;
      }
      if (!isTransientStatusError(error)) {
        logReadiness(
          attempt,
          expectedEdition,
          observed,
          "PUBLIC_STATUS_INVALID",
          error?.message || String(error),
        );
        throw error;
      }
      logReadiness(
        attempt,
        expectedEdition,
        observed,
        "WAITING_PUBLIC_STATUS",
        error?.message || String(error),
      );
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const delay = Math.min(
      STATUS_RETRY_BASE_MS * attempt,
      STATUS_RETRY_MAX_MS,
      remaining,
    );
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  }

  logReadiness(attempt, expectedEdition, observed, "PUBLIC_STATUS_TIMEOUT");
  throw new Error(
    `PUBLIC_STATUS_TIMEOUT: public identity did not converge within ${STATUS_READINESS_TIMEOUT_MS}ms`,
  );
}

function yamlScalar(raw) {
  const value = String(raw || "").trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value);
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

function scalar(frontmatterLines, key) {
  const prefix = `${key}:`;
  const line = frontmatterLines.find((candidate) =>
    candidate.startsWith(prefix),
  );
  if (!line) return "";
  return yamlScalar(line.slice(prefix.length));
}

function highlights(frontmatterLines) {
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
  return items;
}

function sectionBody(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const target = `## ${heading}`;
  const start = lines.findIndex((line) => line.trim() === target);
  if (start < 0) return "";
  const selected = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) break;
    selected.push(lines[i]);
  }
  return selected.join("\n").trim();
}

function plainText(markdown) {
  return String(markdown || "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sentences(text) {
  const clean = plainText(text);
  if (!clean) return [];
  const segmenter = new Intl.Segmenter("es", { granularity: "sentence" });
  return Array.from(segmenter.segment(clean), ({ segment }) =>
    segment.trim(),
  ).filter((segment) => segment.length >= 12);
}

function headlineParts(title, fallbackDek) {
  for (const separator of [",", " — ", " – ", ":"]) {
    const index = title.indexOf(separator);
    if (index <= 7) continue;
    const left = title.slice(0, index).trim();
    const right = title.slice(index + separator.length).trim();
    if (left.length >= 8 && right.length >= 8) {
      return { title: left, dek: right };
    }
  }
  return { title, dek: fallbackDek };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function assertPublic(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "Cache-Control": "no-cache" },
      signal: controller.signal,
    });
    await response.arrayBuffer();
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  required(SOURCE_COMMIT, "ATLAS_SOURCE_COMMIT");
  if (!/^[0-9a-f]{40}$/i.test(SOURCE_COMMIT)) {
    throw new Error("ATLAS_SOURCE_COMMIT must be a full Git commit SHA");
  }

  if (SOURCE_COMMIT.toLowerCase() === BLOCKED_SOURCE_COMMIT.toLowerCase()) {
    await markSkipped("blocked-source-commit-2026-09-05");
    return;
  }

  const dailyFiles = changedFiles(SOURCE_COMMIT).filter((file) =>
    /^src\/content\/editions\/\d{4}-\d{2}-\d{2}-daily-[^/]+\.mdx?$/.test(file),
  );
  if (dailyFiles.length === 0) {
    await markSkipped("no-new-daily-edition-in-source-commit");
    return;
  }
  if (dailyFiles.length !== 1) {
    throw new Error(
      `Fail-closed: expected exactly one daily edition in ${SOURCE_COMMIT}, found ${dailyFiles.length}`,
    );
  }

  const sourceId = dailyFiles[0];
  const editionId = path.basename(sourceId).replace(/\.mdx?$/, "");
  if (editionId.startsWith("2026-09-05-")) {
    await markSkipped("blocked-edition-date-2026-09-05");
    return;
  }

  const publicationEvidence = await waitForPublicStatus(editionId);

  const markdown = await fs.readFile(path.join(ROOT, sourceId), "utf8");
  const parts = markdown.split(/^---\s*$/m);
  if (parts.length < 3)
    throw new Error(`Invalid Markdown frontmatter: ${sourceId}`);
  const frontmatterLines = parts[1].split(/\r?\n/);

  const rawTitle = required(scalar(frontmatterLines, "title"), "title");
  const summary = required(scalar(frontmatterLines, "summary"), "summary");
  const publishedAt = required(
    scalar(frontmatterLines, "publishedAt"),
    "publishedAt",
  );
  const statusValue = required(scalar(frontmatterLines, "status"), "status");
  const type = required(scalar(frontmatterLines, "type"), "type");
  if (statusValue !== "published" || type !== "daily") {
    throw new Error(
      "Fail-closed: source edition is not a published daily edition",
    );
  }

  const sourceHighlights = highlights(frontmatterLines);
  if (
    sourceHighlights.length !== 3 ||
    sourceHighlights.some((item) => !item.label || !item.text)
  ) {
    throw new Error(
      "Fail-closed: automatic social contract requires exactly 3 published highlights",
    );
  }

  const summarySentences = sentences(summary);
  const centralSectionSentences = sentences(
    sectionBody(markdown, "Hecho central"),
  );
  const ideaCentral = required(
    summarySentences[0] || centralSectionSentences[0],
    "ideaCentral",
  );
  const ideaSupport = required(
    summarySentences.slice(1).join(" ") ||
      centralSectionSentences.find((item) => item !== ideaCentral),
    "ideaSupport",
  );

  const impactSentences = sentences(sectionBody(markdown, "Por qué importa"));
  if (impactSentences.length < 3) {
    throw new Error(
      `Fail-closed: Por qué importa must expose at least 3 published sentences; found ${impactSentences.length}`,
    );
  }

  const fallbackDek = sourceHighlights.map((item) => item.label).join(" · ");
  const headline = headlineParts(rawTitle, fallbackDek);
  const canonicalUrl = `https://eldesiempre100.github.io/ediciones/${editionId}/`;
  await assertPublic(`${canonicalUrl}?source=${SOURCE_COMMIT}`);

  const contract = {
    version: "1",
    sourceCommit: SOURCE_COMMIT,
    sourceId,
    canonicalUrl,
    publishedDate: publishedAt,
    productType: "daily",
    sectionLabel: "PORTADA · HECHO CENTRAL",
    title: headline.title,
    dek: headline.dek,
    ideaCentral,
    ideaSupport,
    keyPoints: sourceHighlights.map((item, index) => ({
      iconKey: KEY_ICONS[index],
      text: item.text,
    })),
    impactItems: impactSentences.slice(0, 3).map((text, index) => ({
      iconKey: IMPACT_ICONS[index],
      label: IMPACT_LABELS[index],
      text,
    })),
  };

  const outputPath = path.join(ROOT, OUTPUT_RELATIVE);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(contract, null, 2)}\n`);

  await writeOutput("eligible", "true");
  await writeOutput("reason", "verified-new-daily-edition");
  await writeOutput("contract_path", OUTPUT_RELATIVE);
  await writeOutput("source_commit", SOURCE_COMMIT);
  await writeOutput("source_id", sourceId);
  await writeOutput("edition_id", editionId);
  await writeOutput("canonical_url", canonicalUrl);

  console.log(
    JSON.stringify(
      {
        eligible: true,
        sourceCommit: SOURCE_COMMIT,
        sourceId,
        editionId,
        canonicalUrl,
        contractPath: OUTPUT_RELATIVE,
        publicationEvidence,
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
