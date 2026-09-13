export const COVER_CONTRACT_VERSION = 1;

export const COVER_BLOCK_BUDGETS = Object.freeze({
  snapshot: { targetMin: 80, targetMax: 125, hardMin: 65, hardMax: 140 },
  central: { targetMin: 180, targetMax: 220, hardMin: 165, hardMax: 235 },
  chile: { targetMin: 130, targetMax: 160, hardMin: 115, hardMax: 175 },
  markets: { targetMin: 130, targetMax: 160, hardMin: 115, hardMax: 175 },
  watch: { targetMin: 80, targetMax: 110, hardMin: 65, hardMax: 125 },
  closing: { targetMin: 40, targetMax: 60, hardMin: 35, hardMax: 75 },
});

export const COVER_TOTAL_BUDGET = Object.freeze({
  targetMin: 650,
  targetMax: 750,
  hardMin: 600,
  hardMax: 810,
});

export function cleanSpeechText(value) {
  return String(value ?? "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[`_*#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function countWords(text) {
  return cleanSpeechText(text)
    .split(/\s+/)
    .filter(Boolean).length;
}

export function sentenceList(text) {
  const normalized = cleanSpeechText(text);
  if (!normalized) return [];
  const segmenter = new Intl.Segmenter("es", { granularity: "sentence" });
  return [...segmenter.segment(normalized)]
    .map(({ segment }) => segment.trim())
    .filter(Boolean);
}

function tokenSet(text) {
  return new Set(
    cleanSpeechText(text)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es-CL")
      .replace(/[^a-z0-9ñ]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4),
  );
}

function numberSet(text) {
  return new Set(
    cleanSpeechText(text)
      .match(/\b\d[\d.,]*\b/g)
      ?.map((value) => value.replace(/[.,]/g, "")) ?? [],
  );
}

function percentSet(text) {
  return new Set(
    cleanSpeechText(text)
      .match(/\b\d+(?:[.,]\d+)?\s*%/g)
      ?.map((value) => value.replace(/\s+/g, "").replace(",", ".")) ?? [],
  );
}

export function lexicalOverlap(left, right) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size < 4 || rightTokens.size < 4) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

export function isNearDuplicate(left, right) {
  const overlap = lexicalOverlap(left, right);
  if (overlap >= 0.72) return true;

  const leftNumbers = numberSet(left);
  const rightNumbers = numberSet(right);
  let numericOverlap = 0;
  for (const value of leftNumbers) {
    if (rightNumbers.has(value)) numericOverlap += 1;
  }
  return numericOverlap >= 1 && overlap >= 0.38;
}

export function selectBlockSentences(
  candidates,
  { targetMin, targetMax, accepted = [] } = {},
) {
  const selected = [];
  const acceptedLocal = [...accepted];
  const provenance = [];

  for (const candidate of candidates ?? []) {
    const text = cleanSpeechText(
      typeof candidate === "string" ? candidate : candidate?.text,
    );
    if (!text) continue;
    if (acceptedLocal.some((existing) => isNearDuplicate(text, existing))) {
      continue;
    }

    const nextWords = countWords([...selected, text].join(" "));
    if (selected.length && nextWords > targetMax) continue;

    selected.push(text);
    acceptedLocal.push(text);
    provenance.push(
      typeof candidate === "string"
        ? { source: null, role: null, text }
        : {
            source: candidate?.source ?? null,
            role: candidate?.role ?? null,
            text,
          },
    );

    if (countWords(selected.join(" ")) >= targetMin) break;
  }

  return {
    text: selected.join(" "),
    words: countWords(selected.join(" ")),
    selected,
    accepted: acceptedLocal,
    provenance,
  };
}

function blockBudgetCheck(name, text, required, errors, warnings) {
  if (!text) {
    if (required) errors.push(`${name}: bloque requerido ausente.`);
    return;
  }

  const budget = COVER_BLOCK_BUDGETS[name];
  const words = countWords(text);
  if (words < budget.hardMin || words > budget.hardMax) {
    errors.push(
      `${name}: ${words} palabras fuera del rango duro ${budget.hardMin}-${budget.hardMax}.`,
    );
  } else if (words < budget.targetMin || words > budget.targetMax) {
    warnings.push(
      `${name}: ${words} palabras fuera del objetivo ${budget.targetMin}-${budget.targetMax}.`,
    );
  }
}

function repeatedPercentages(left, right) {
  const leftValues = percentSet(left);
  const rightValues = percentSet(right);
  return [...leftValues].filter((value) => rightValues.has(value));
}

function duplicatePairs(blocks) {
  const names = ["central", "chile", "markets", "watch"];
  const pairs = [];
  for (let leftIndex = 0; leftIndex < names.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < names.length; rightIndex += 1) {
      const leftName = names[leftIndex];
      const rightName = names[rightIndex];
      for (const leftSentence of sentenceList(blocks[leftName])) {
        for (const rightSentence of sentenceList(blocks[rightName])) {
          if (lexicalOverlap(leftSentence, rightSentence) >= 0.82) {
            pairs.push({ leftName, rightName, leftSentence, rightSentence });
          }
        }
      }
    }
  }
  return pairs;
}

export function validateCoverContract({
  blocks,
  fullScript,
  hasNational = true,
  hasMarkets = true,
}) {
  const errors = [];
  const warnings = [];

  blockBudgetCheck("snapshot", blocks.snapshot, false, errors, warnings);
  blockBudgetCheck("central", blocks.central, true, errors, warnings);
  blockBudgetCheck("chile", blocks.chile, hasNational, errors, warnings);
  blockBudgetCheck("markets", blocks.markets, hasMarkets, errors, warnings);
  blockBudgetCheck("watch", blocks.watch, true, errors, warnings);
  blockBudgetCheck("closing", blocks.closing, true, errors, warnings);

  if (blocks.snapshot) {
    const causalPattern =
      /\b(porque|debido a|por eso|por lo que|implica|sugiere|explica|refleja)\b/i;
    if (causalPattern.test(blocks.snapshot)) {
      errors.push(
        "snapshot: contiene lenguaje causal o interpretativo; debe ser cuantitativo.",
      );
    }
  }

  if (blocks.snapshot && blocks.markets) {
    const repeated = repeatedPercentages(blocks.snapshot, blocks.markets);
    if (repeated.length > 1) {
      errors.push(
        `markets: reenumera ${repeated.length} porcentajes ya usados en snapshot (${repeated.join(", ")}).`,
      );
    } else if (repeated.length === 1) {
      warnings.push(
        `markets: reutiliza una cifra del snapshot como evidencia (${repeated[0]}).`,
      );
    }
  }

  const duplicateSentencePairs = duplicatePairs(blocks);
  if (duplicateSentencePairs.length) {
    errors.push(
      `redundancia: ${duplicateSentencePairs.length} par(es) de oraciones casi duplicadas entre bloques editoriales.`,
    );
  }

  if (blocks.watch) {
    const futurePattern =
      /\b(si|será|serán|deberá|deberán|próxim|sesión|reunión|umbral|duración|reapertura|confirmar|invalidar|observar|vigilar|condición|fecha|espera)\w*/i;
    if (!futurePattern.test(blocks.watch)) {
      errors.push(
        "watch: no contiene una condición, hito, fecha, umbral o variable futura verificable.",
      );
    }
  }

  const totalWords = countWords(fullScript);
  if (
    totalWords < COVER_TOTAL_BUDGET.hardMin ||
    totalWords > COVER_TOTAL_BUDGET.hardMax
  ) {
    errors.push(
      `total: ${totalWords} palabras fuera del rango duro ${COVER_TOTAL_BUDGET.hardMin}-${COVER_TOTAL_BUDGET.hardMax}.`,
    );
  } else if (
    totalWords < COVER_TOTAL_BUDGET.targetMin ||
    totalWords > COVER_TOTAL_BUDGET.targetMax
  ) {
    warnings.push(
      `total: ${totalWords} palabras fuera del objetivo ${COVER_TOTAL_BUDGET.targetMin}-${COVER_TOTAL_BUDGET.targetMax}.`,
    );
  }

  const qualityScore = Math.max(0, 100 - errors.length * 18 - warnings.length * 4);
  return {
    version: COVER_CONTRACT_VERSION,
    valid: errors.length === 0 && qualityScore >= 80,
    qualityScore,
    errors,
    warnings,
    totalWords,
    blockWords: Object.fromEntries(
      Object.entries(blocks).map(([name, text]) => [name, countWords(text)]),
    ),
    duplicateSentencePairs,
  };
}
