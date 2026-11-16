import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

function requireCondition(condition, message) {
  if (!condition) throw new Error("Audio V2 remoto: " + message);
}

function audioPath(value, label) {
  requireCondition(
    typeof value === "string" &&
      /^\/audio\/[a-zA-Z0-9._-]+\.mp3$/.test(value),
    label + " no tiene ruta MP3 pública válida.",
  );
  return value.slice(1);
}

export function verifyRemoteAudio({
  plan,
  analysis,
  cover,
  date,
  sourceCommit,
}) {
  requireCondition(
    plan?.date === date,
    "fecha del plan distinta de la edición.",
  );
  requireCondition(
    analysis?.date === date && analysis?.sourceCommit === sourceCommit,
    "manifiesto de análisis no pertenece a la edición y commit esperados.",
  );
  requireCondition(
    analysis?.voiceProfileTarget === "alex-c-v1",
    "perfil de voz del análisis inválido.",
  );

  const paths = [];
  const missing = [];

  for (const section of ["international", "national", "markets"]) {
    const expected = plan.products?.[section];
    const observed = analysis?.[section];
    requireCondition(expected && observed, section + " sin plan o resultado.");

    if (!expected.sourceId) {
      requireCondition(
        section !== "international" &&
          observed.status === "unavailable" &&
          observed.reason === "source_missing" &&
          observed.sourceId === null,
        section + " no identifica correctamente la ausencia de fuente.",
      );
      missing.push(section);
      continue;
    }

    requireCondition(
      !expected.unavailableReason,
      section +
        " tiene fuente pero no puede producirse: " +
        expected.unavailableReason,
    );
    requireCondition(
      observed.status === "published" &&
        observed.sourceId === expected.sourceId &&
        observed.scriptHash === expected.scriptHash &&
        observed.voiceProfileVersion === "alex-c-v1" &&
        observed.fallbackUsed === false &&
        Number(observed.durationSeconds) > 0,
      section + " no quedó publicado con la identidad y voz requeridas.",
    );
    paths.push(audioPath(observed.path, section));
  }

  const coverProduct = plan.products?.cover;
  requireCondition(coverProduct, "no existe plan de Portada.");

  if (coverProduct.unavailableReason === "cover_contract_failed") {
    requireCondition(
      !coverProduct.needsGeneration && !coverProduct.needsPeaks,
      "Portada inválida no debe generar un audio nuevo.",
    );
    // La Portada anterior se conserva cuando falta el contrato editorial.
    requireCondition(
      cover?.status === "published" &&
        typeof cover.date === "string" &&
        cover.date <= date,
      "la Portada anterior debe permanecer disponible y publicada.",
    );
  } else {
    requireCondition(
      !coverProduct.unavailableReason &&
        cover?.status === "published" &&
        cover.date === date &&
        cover.sourceIds?.general === plan.sourceIds?.general,
      "Portada actual ausente o con identidad editorial incorrecta.",
    );
  }
  paths.push(audioPath(cover.path, "Portada"));

  return { paths: [...new Set(paths)], missing };
}

function git(repoDir, args) {
  return execFileSync("git", args, { cwd: repoDir, encoding: "utf8" });
}

const invokedAsScript =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  const repoDir = process.env.ATLAS_PUBLIC_REPO_DIR;
  const planFile = process.env.ATLAS_AUDIO_V2_PLAN;
  const date = process.env.AUDIO_DATE;
  const sourceCommit = process.env.ATLAS_SOURCE_SHA;

  requireCondition(
    repoDir && planFile && date && sourceCommit,
    "faltan parámetros de verificación remota.",
  );

  const plan = JSON.parse(readFileSync(planFile, "utf8"));
  const analysis = JSON.parse(
    git(repoDir, ["show", "origin/main:audio/analysis-latest.json"]),
  );
  const cover = JSON.parse(
    git(repoDir, ["show", "origin/main:audio/latest.json"]),
  );
  const result = verifyRemoteAudio({
    plan,
    analysis,
    cover,
    date,
    sourceCommit,
  });

  for (const file of result.paths) {
    git(repoDir, ["cat-file", "-e", "origin/main:" + file]);
  }

  console.log(
    "Audio V2 verificado en origin/main para " +
      date +
      ": archivos=" +
      result.paths.length +
      "; fuentes ausentes=" +
      (result.missing.join(", ") || "ninguna") +
      ".",
  );
}
