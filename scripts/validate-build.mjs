import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const expectedPages = [
  "dist/index.html",
  "dist/ediciones/index.html",
  "dist/ediciones/2026-08-03-daily-riesgo-y-disciplina/index.html",
  "dist/ediciones/2026-08-02-weekly-senales-sin-consenso/index.html",
  "dist/lecturas/index.html",
  "dist/lecturas/2026-08-03-reading-como-leer-la-incertidumbre/index.html",
  "dist/archivo/index.html",
];

for (const path of expectedPages) await access(new URL(path, root));

const home = await readFile(new URL("dist/index.html", root), "utf8");
for (const label of [
  "ATLAS NEWS",
  "Ediciones recientes",
  "Lecturas seleccionadas",
]) {
  if (!home.includes(label))
    throw new Error(`La portada generada no contiene: ${label}`);
}

try {
  await access(
    new URL(
      "dist/ediciones/2026-08-04-daily-borrador-interno/index.html",
      root,
    ),
  );
  throw new Error("El borrador interno fue publicado por error.");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log(
  `Salida validada: ${expectedPages.length} páginas requeridas y ningún borrador publicado.`,
);
