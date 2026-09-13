import assert from "node:assert/strict";

import {
  selectBlockSentences,
  validateCoverContract,
} from "./cover-briefing-contract.mjs";

// Este test viaja con el compositor para evitar regresiones silenciosas de Portada.
const goodBlocks = {
  snapshot:
    "En monedas, el dólar observado marcó novecientos treinta y siete pesos con diecisiete centavos, un uno coma veintiuno por ciento sobre la jornada hábil anterior. El euro se ubicó en mil ochenta y ocho pesos con noventa y siete centavos, con un avance de uno coma cero cuatro por ciento. La UF vigente alcanzó cuarenta mil novecientos diez pesos con diez centavos. El IPSA retrocedió, el S y P quinientos cayó, el Brent avanzó y el cobre subió. El bono del Tesoro estadounidense a diez años se ubicó cerca de cinco por ciento.",
  central:
    "La señal central comienza con un cierre inesperado de infraestructura energética que reduce una ruta alternativa para el transporte de crudo. El hecho ocurre después de varios días de tensión regional y añade una restricción física donde antes existía capacidad de desvío. Ese contexto importa porque la oferta disponible no depende solamente del volumen producido, sino también de la posibilidad de moverlo entre puertos y corredores logísticos. Cuando una vía de respaldo deja de operar, cualquier incidente adicional tiene más capacidad de trasladarse a precios y expectativas. El mecanismo económico pasa por energía, costos de transporte y percepción de inflación futura. Un petróleo persistentemente caro puede sostener presiones de precios incluso cuando otros componentes del índice muestran moderación, y eso reduce el espacio para que los bancos centrales relajen su postura. La implicancia financiera es una combinación menos cómoda para activos sensibles a tasas largas: la duración enfrenta una prima mayor y las compañías dependientes de financiamiento barato pierden parte del soporte que recibirían de una normalización monetaria rápida. La señal no asegura un nuevo ciclo inflacionario, pero exige reapertura física y normalización energética para recuperar alivio.",
  chile:
    "En Chile, el hecho local relevante es el avance formal de una reforma destinada a ampliar el financiamiento habitacional y profundizar el mercado de capitales. Lo que cambia es que la propuesta deja de ser un anuncio general y entra en una tramitación con calendario, autoridades convocadas y preguntas de diseño que deberán responderse públicamente. El impacto potencial se concentra en la capacidad de movilizar crédito hipotecario de largo plazo, liberar balance en los originadores y ampliar la intermediación de ahorro hacia activos asociados a vivienda. Para los hogares, sin embargo, el beneficio no es inmediato porque todavía faltan ley, reglamentación y operación efectiva. Los riesgos permanecen en el precio al que se compren las carteras, la calidad de originación, el grado de riesgo retenido por los bancos y la exposición fiscal que pueda asumir el Estado. La lectura útil es institucional: existe una ruta verificable, pero todavía no una nueva condición crediticia disponible.",
  markets:
    "En mercados, la lectura relevante no es repetir el nivel de cada índice, sino entender qué está diciendo la formación de precios. La renta variable puede recuperar terreno mientras la curva larga conserva una prima elevada, una combinación que muestra alivio táctico sin una validación equivalente desde la renta fija. Esa divergencia sugiere que los inversionistas todavía distinguen entre capacidad de crecimiento corporativo y costo estructural del capital. Cuando las tasas largas permanecen exigentes, las valoraciones de negocios con flujos lejanos quedan más expuestas, mientras compañías con caja visible y menor necesidad de refinanciamiento pueden resistir mejor. La energía añade otra capa porque modifica simultáneamente márgenes, inflación esperada y política monetaria. El mensaje agregado es de dispersión, no de liquidación generalizada: el mercado sigue premiando crecimiento verificable, pero exige una compensación mayor para asumir duración financiera. Por eso importa menos reconstruir el tablero inicial y más observar si acciones, bonos y energía vuelven a moverse en la misma dirección.",
  watch:
    "Qué seguir exige condiciones verificables. La primera será la duración del cierre de la infraestructura energética y si existe una reapertura capaz de devolver capacidad de transporte antes de la próxima sesión. La segunda será observar si la tasa larga supera y sostiene el umbral relevante o rechaza ese nivel cuando el mercado incorpore nueva información. En Chile, el próximo hito tendrá fecha conocida en la comisión legislativa y permitirá revisar garantías, apalancamiento, criterios de compra de cartera y supervisión. Si esas condiciones cambian en sentido contrario a la tesis actual, la lectura deberá invalidarse o ajustarse en la siguiente edición.",
  closing:
    "La señal para comenzar el día queda así delimitada: un entorno externo más exigente, una agenda local que entra en fase verificable y mercados que todavía separan alivio táctico de normalización estructural. Para profundizar, Internacional, Nacional y Mercados mantienen sus cápsulas y desarrollos completos, junto con fuentes, contexto y riesgos en ATLAS NEWS.",
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
