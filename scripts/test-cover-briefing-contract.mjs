import assert from "node:assert/strict";

import {
  countWords,
  selectBlockSentences,
  validateCoverContract,
} from "./cover-briefing-contract.mjs";

// Este test viaja con el compositor para evitar regresiones silenciosas de Portada.
function repeated(text, minimumWords) {
  const sentence = `${text} Esta frase aporta contexto adicional verificable sin repetir la fotografía cuantitativa inicial.`;
  const parts = [];
  while (countWords(parts.join(" ")) < minimumWords) parts.push(sentence);
  return parts.join(" ");
}

const goodBlocks = {
  snapshot:
    "En monedas, el dólar observado marcó novecientos treinta y siete pesos, un uno por ciento sobre la jornada hábil anterior. El euro avanzó y la UF mantuvo su valor vigente. El IPSA retrocedió, el S y P quinientos cayó, el Brent avanzó y el cobre subió. El bono del Tesoro estadounidense a diez años se ubicó cerca de cinco por ciento.",
  central: repeated(
    "La señal central parte de un hecho internacional y desarrolla su contexto, el mecanismo de transmisión y la implicancia económica principal.",
    180,
  ),
  chile: repeated(
    "En Chile se identifica el hecho local, qué cambió respecto de la situación anterior, su impacto y los riesgos todavía abiertos.",
    130,
  ),
  markets: repeated(
    "En mercados la lectura se concentra en qué está descontando el mercado, cómo se distribuye el riesgo y qué señal deja la formación de precios.",
    130,
  ),
  watch: repeated(
    "La próxima condición verificable será observar si el umbral relevante se confirma en la siguiente sesión y qué fecha concentra el próximo hito.",
    80,
  ),
  closing:
    "La señal para comenzar el día queda planteada. Para profundizar, Internacional, Nacional y Mercados mantienen sus cápsulas y desarrollos completos, con sus fuentes, contexto y riesgos disponibles en ATLAS NEWS.",
};

const goodScript = Object.values(goodBlocks).join(" ");
const good = validateCoverContract({
  blocks: goodBlocks,
  fullScript: goodScript,
});
assert.equal(good.errors.length, 0, good.errors.join("\n"));
assert.equal(good.valid, true);

const badSnapshot = {
  ...goodBlocks,
  snapshot: `${goodBlocks.snapshot} Esto ocurre porque el mercado anticipa una política monetaria más dura.`,
};
const badSnapshotResult = validateCoverContract({
  blocks: badSnapshot,
  fullScript: Object.values(badSnapshot).join(" "),
});
assert.equal(badSnapshotResult.valid, false);
assert.ok(
  badSnapshotResult.errors.some((error) => error.includes("lenguaje causal")),
);

const duplicateMarkets = {
  ...goodBlocks,
  markets: goodBlocks.central,
};
const duplicateResult = validateCoverContract({
  blocks: duplicateMarkets,
  fullScript: Object.values(duplicateMarkets).join(" "),
});
assert.equal(duplicateResult.valid, false);
assert.ok(
  duplicateResult.errors.some((error) => error.includes("redundancia")),
);

const selection = selectBlockSentences(
  [
    "Primera oración útil con un hecho claramente identificable y contexto suficiente.",
    "Primera oración útil con un hecho claramente identificable y contexto suficiente.",
    "Segunda oración distinta que agrega mecanismo e implicancia sin clonar la anterior.",
  ],
  { targetMin: 15, targetMax: 40 },
);
assert.equal(selection.selected.length, 2);

console.log(
  `Contrato Portada V12 OK · score ${good.qualityScore} · ${good.totalWords} palabras de prueba.`,
);
