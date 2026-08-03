import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const expectedPages = [
  "dist/index.html",
  "dist/ediciones/index.html",
  "dist/ediciones/2026-08-03-daily-alivio-petrolero-y-peso-chileno/index.html",
  "dist/lecturas/index.html",
  "dist/archivo/index.html",
];

for (const path of expectedPages) await access(new URL(path, root));

const home = await readFile(new URL("dist/index.html", root), "utf8");
for (const label of [
  "ATLAS NEWS",
  "En una mirada",
  "Petróleo y peso chileno",
]) {
  if (!home.includes(label))
    throw new Error(`La portada generada no contiene: ${label}`);
}

const currentEdition = await readFile(
  new URL(
    "dist/ediciones/2026-08-03-daily-alivio-petrolero-y-peso-chileno/index.html",
    root,
  ),
  "utf8",
);

for (const passage of [
  "A las 08:05, el petróleo devolvía una parte importante",
  "El efecto dependerá de la duración del movimiento",
  "La deuda corta chilena conserva el respaldo",
]) {
  if (!currentEdition.includes(passage)) {
    throw new Error(
      `La edición generada omitió contenido del Markdown: ${passage}`,
    );
  }
}

for (const internalText of ["briefing", "brifing"]) {
  if (currentEdition.toLowerCase().includes(internalText)) {
    throw new Error(
      `La edición generada expone texto interno: ${internalText}`,
    );
  }
}

const generalNoticeCount =
  currentEdition.toLowerCase().split("no constituye una recomendación").length -
  1;
if (generalNoticeCount !== 1) {
  throw new Error(
    `El aviso general debe aparecer solo en el pie: se detectaron ${generalNoticeCount} apariciones.`,
  );
}

const draftPages = [
  "dist/ediciones/2026-08-04-daily-borrador-interno/index.html",
  "dist/ediciones/2026-08-03-daily-riesgo-y-disciplina/index.html",
  "dist/ediciones/2026-08-02-weekly-senales-sin-consenso/index.html",
  "dist/lecturas/2026-08-03-reading-como-leer-la-incertidumbre/index.html",
];

for (const path of draftPages) {
  try {
    await access(new URL(path, root));
    throw new Error(`El borrador ${path} fue publicado por error.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

console.log(
  `Salida validada: ${expectedPages.length} páginas requeridas y ${draftPages.length} borradores excluidos.`,
);
