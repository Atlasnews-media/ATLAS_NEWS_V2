import { execFileSync } from "node:child_process";

const eventName = process.env.GITHUB_EVENT_NAME;
const headRef = process.env.GITHUB_HEAD_REF ?? "";
const prHeadSha = process.env.ATLAS_PR_HEAD_SHA ?? "";

function runGit(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function frontmatterValue(text, field) {
  return text
    .match(new RegExp(`^${field}:\\s*["']?([^"'\\r\\n]+)`, "m"))?.[1]
    ?.trim();
}

function normalizePromotionFields(text) {
  return text
    .replace(/^status:\s*.*$/m, "status: <PROMOTION_STATUS>")
    .replace(/^publishedAt:\s*.*$/m, "publishedAt: <PROMOTION_TIME>");
}

function isIsoWithZone(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  );
}

function santiagoDate(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const record = Object.fromEntries(
    parts.map(({ type, value: part }) => [type, part]),
  );
  return `${record.year}-${record.month}-${record.day}`;
}

function readAt(sha, path) {
  try {
    return runGit(["show", `${sha}:${path}`]);
  } catch {
    return undefined;
  }
}

if (
  eventName !== "pull_request" ||
  !/^editorial\/\d{4}-\d{2}-\d{2}-morning$/.test(headRef)
) {
  console.log("Contrato de promoción matutina: omitido fuera del PR morning.");
  process.exit(0);
}

if (!prHeadSha) {
  throw new Error("Falta ATLAS_PR_HEAD_SHA para validar la promoción.");
}

const parentSha = runGit(["rev-parse", `${prHeadSha}^`]);
const changedFiles = runGit(["diff", "--name-only", parentSha, prHeadSha])
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter(Boolean)
  .filter((path) =>
    /^src\/content\/(editions\/\d{4}-\d{2}-\d{2}-daily-|briefings\/\d{4}-\d{2}-\d{2}-(?:national|markets)-)/.test(
      path,
    ),
  );

let transitions = 0;

for (const path of changedFiles) {
  const before = readAt(parentSha, path);
  const after = readAt(prHeadSha, path);
  if (!after) continue;

  const afterStatus = frontmatterValue(after, "status");

  if (!before) {
    if (afterStatus === "published") {
      throw new Error(
        `${path}: una pieza nueva del Morning Package no puede nacer published; debe existir primero como draft.`,
      );
    }
    continue;
  }

  const beforeStatus = frontmatterValue(before, "status");

  if (beforeStatus === "published" && afterStatus === "draft") {
    throw new Error(
      `${path}: no se permite published → draft durante promoción.`,
    );
  }

  if (beforeStatus !== "draft" || afterStatus !== "published") continue;

  transitions += 1;

  const beforePublishedAt = frontmatterValue(before, "publishedAt");
  const afterPublishedAt = frontmatterValue(after, "publishedAt");
  const beforeCutoffAt = frontmatterValue(before, "cutoffAt");
  const afterCutoffAt = frontmatterValue(after, "cutoffAt");

  if (!isIsoWithZone(afterPublishedAt)) {
    throw new Error(
      `${path}: publishedAt de promoción debe ser ISO 8601 con zona horaria.`,
    );
  }

  if (beforePublishedAt === afterPublishedAt) {
    throw new Error(
      `${path}: draft → published debe reemplazar el publishedAt provisional por la hora efectiva de promoción.`,
    );
  }

  if (beforeCutoffAt !== afterCutoffAt) {
    throw new Error(
      `${path}: cutoffAt cambió durante promoción; debe conservarse intacto.`,
    );
  }

  if (
    beforeCutoffAt &&
    Number.isFinite(Date.parse(beforeCutoffAt)) &&
    Date.parse(beforeCutoffAt) > Date.parse(afterPublishedAt)
  ) {
    throw new Error(
      `${path}: cutoffAt no puede ser posterior al publishedAt efectivo.`,
    );
  }

  const filenameDate = path.match(/(\d{4}-\d{2}-\d{2})-/)?.[1];
  if (filenameDate && santiagoDate(afterPublishedAt) !== filenameDate) {
    throw new Error(
      `${path}: publishedAt efectivo no corresponde a la fecha editorial ${filenameDate} en America/Santiago.`,
    );
  }

  if (normalizePromotionFields(before) !== normalizePromotionFields(after)) {
    throw new Error(
      `${path}: la promoción modificó contenido fuera de status y publishedAt.`,
    );
  }
}

console.log(
  transitions > 0
    ? `Contrato de promoción validado: ${transitions} transición(es) draft → published sin reescritura editorial.`
    : "Contrato de promoción: este commit no contiene transición draft → published.",
);
