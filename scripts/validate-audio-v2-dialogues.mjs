import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

const requiredSpeakers = new Set(["VOZ 1", "VOZ 2"]);

export function validateDialogue(text, section = "dialogue") {
  const speakers = new Set();
  const lines = String(text)
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

  return { lines: lines.length, speakers: [...speakers].sort() };
}

async function main() {
  const planPath = process.env.ATLAS_AUDIO_V2_PLAN;
  if (!planPath) {
    throw new Error("Falta ATLAS_AUDIO_V2_PLAN para validar diálogos.");
  }

  const plan = JSON.parse(await readFile(planPath, "utf8"));
  for (const section of ["national", "markets"]) {
    const product = plan?.products?.[section];
    if (!product?.sourceId || !product?.script) {
      continue;
    }

    const result = validateDialogue(product.script, section);
    console.log(
      `Audio V2 ${section}: contrato de diálogo válido (${result.lines} líneas, VOZ 1 + VOZ 2).`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
