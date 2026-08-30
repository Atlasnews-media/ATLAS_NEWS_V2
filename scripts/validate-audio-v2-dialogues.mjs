import { readFile } from "node:fs/promises";

const planPath = process.env.ATLAS_AUDIO_V2_PLAN;
if (!planPath) {
  throw new Error("Falta ATLAS_AUDIO_V2_PLAN para validar diálogos.");
}

const plan = JSON.parse(await readFile(planPath, "utf8"));
const requiredSpeakers = new Set(["VOZ 1", "VOZ 2"]);

for (const section of ["national", "markets"]) {
  const product = plan?.products?.[section];
  if (!product?.sourceId || !product?.script) {
    continue;
  }

  const speakers = new Set();
  const lines = String(product.script)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error(`Audio V2 ${section}: diálogo vacío.`);
  }

  for (const [index, line] of lines.entries()) {
    const match = line.match(/^(VOZ [12]):\s+(.+)$/);
    if (!match) {
      throw new Error(
        `Audio V2 ${section}: línea ${index + 1} inválida; cada línea debe comenzar con VOZ 1: o VOZ 2:.`,
      );
    }
    speakers.add(match[1]);
  }

  for (const speaker of requiredSpeakers) {
    if (!speakers.has(speaker)) {
      throw new Error(
        `Audio V2 ${section}: falta participación obligatoria de ${speaker}.`,
      );
    }
  }

  console.log(
    `Audio V2 ${section}: contrato de diálogo válido (${lines.length} líneas, VOZ 1 + VOZ 2).`,
  );
}
