import { execFileSync } from "node:child_process";

const inGitHubActions = process.env.GITHUB_ACTIONS === "true";
const eventName = process.env.GITHUB_EVENT_NAME ?? "";
const ref = process.env.GITHUB_REF ?? "";

if (!inGitHubActions) {
  console.log(
    "[publication-integrity] Entorno local: gate de procedencia omitido.",
  );
  process.exit(0);
}

if (eventName === "pull_request") {
  console.log(
    "[publication-integrity] PR: la procedencia se valida antes del merge; no hay publicación.",
  );
  process.exit(0);
}

if (!["push", "workflow_dispatch"].includes(eventName)) {
  throw new Error(
    `[publication-integrity] Evento no autorizado para publicación: ${eventName || "desconocido"}.`,
  );
}

if (ref !== "refs/heads/main") {
  throw new Error(
    `[publication-integrity] La publicación solo puede originarse desde main; ref recibida: ${ref || "vacía"}.`,
  );
}

const commitMeta = execFileSync(
  "git",
  ["log", "-1", "--format=%cn%x00%ce"],
  { encoding: "utf8" },
).trim();

const [committerName = "", committerEmail = ""] = commitMeta.split("\0");
const isGitHubMerge =
  committerName === "GitHub" && committerEmail === "noreply@github.com";

if (!isGitHubMerge) {
  throw new Error(
    [
      "[publication-integrity] PUBLICACIÓN BLOQUEADA.",
      "El HEAD de main no tiene procedencia de merge ejecutado por GitHub.",
      `Committer detectado: ${committerName || "desconocido"} <${committerEmail || "sin email"}>.`,
      "Los cambios directos a main pueden existir temporalmente mientras no haya Ruleset administrativo,",
      "pero no pueden desplegar ATLAS NEWS. Deben quedar cubiertos por un PR validado y fusionado.",
    ].join(" "),
  );
}

console.log(
  `[publication-integrity] Procedencia autorizada: ${committerName} <${committerEmail}> sobre main.`,
);
