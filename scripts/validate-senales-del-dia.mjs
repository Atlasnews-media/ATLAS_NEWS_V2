import fs from "node:fs/promises";
import path from "node:path";

const input = process.argv[2] || process.env.ATLAS_SENALES_FILE || "";

function fail(message) {
  throw new Error(`Señales del día V1: ${message}`);
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`${label} es obligatorio`);
  return value.trim();
}

function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function paragraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text) {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((token) => token.length >= 4),
  );
}

function overlapRatio(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (left.size < 4 || right.size < 4) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.min(left.size, right.size);
}

function validateSource(source, label) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    fail(`${label} debe ser un objeto`);
  }
  const keys = Object.keys(source).sort().join(",");
  if (keys !== "name,url") fail(`${label} sólo puede contener name y url`);
  requiredString(source.name, `${label}.name`);
  const urlText = requiredString(source.url, `${label}.url`);
  if (/\[[^\]]+\]\(/.test(urlText)) fail(`${label}.url no puede usar Markdown`);
  let url;
  try {
    url = new URL(urlText);
  } catch {
    fail(`${label}.url no es una URL válida`);
  }
  if (url.protocol !== "https:") fail(`${label}.url debe usar https`);
}

function validateItem(item, expectedSlot, label, anchors) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    fail(`${label} debe ser un objeto`);
  }

  const allowed = ["anchor", "deck", "development", "headline", "slot", "sources"];
  const keys = Object.keys(item).sort();
  if (keys.join(",") !== allowed.sort().join(",")) {
    fail(`${label} debe contener exactamente slot, headline, deck, development, anchor y sources`);
  }

  if (item.slot !== expectedSlot) fail(`${label}.slot debe ser ${expectedSlot}`);

  const headline = requiredString(item.headline, `${label}.headline`);
  if ([...headline].length > 72) fail(`${label}.headline supera 72 caracteres`);

  const deck = requiredString(item.deck, `${label}.deck`);
  if ([...deck].length > 180) fail(`${label}.deck supera 180 caracteres`);
  if (normalize(deck) === normalize(headline)) fail(`${label}.deck repite el headline`);

  const development = requiredString(item.development, `${label}.development`);
  const developmentParagraphs = paragraphs(development);
  if (developmentParagraphs.length < 2 || developmentParagraphs.length > 4) {
    fail(`${label}.development debe contener 2–4 párrafos separados por línea en blanco`);
  }
  const words = wordCount(development);
  if (words < 140) fail(`${label}.development tiene ${words} palabras; mínimo 140`);
  if (words > 260) fail(`${label}.development tiene ${words} palabras; máximo contractual 260`);

  const anchor = requiredString(item.anchor, `${label}.anchor`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(anchor)) fail(`${label}.anchor no cumple el patrón`);
  if (anchors.has(anchor)) fail(`${label}.anchor está duplicado: ${anchor}`);
  anchors.add(anchor);

  if (!Array.isArray(item.sources) || item.sources.length === 0) {
    fail(`${label}.sources debe contener al menos una fuente`);
  }
  item.sources.forEach((source, index) =>
    validateSource(source, `${label}.sources[${index}]`),
  );

  return { headline, deck, development, slot: expectedSlot };
}

function validateReady(document) {
  const topKeys = Object.keys(document).sort().join(",");
  if (topKeys !== "contract,date,sections,status") {
    fail("READY sólo puede contener status, date, contract y sections");
  }
  if (document.contract !== "atlas-senales-del-dia-v1") fail("contract incorrecto");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(document.date || ""))) fail("date inválida");

  if (!document.sections || typeof document.sections !== "object" || Array.isArray(document.sections)) {
    fail("sections debe ser un objeto");
  }
  const sectionKeys = Object.keys(document.sections).sort().join(",");
  if (sectionKeys !== "international,markets,national") {
    fail("sections debe contener exactamente international, national y markets");
  }

  const specification = {
    international: ["technology", "world"],
    national: ["ipsa_company", "policy_economy"],
    markets: ["market_signal_1", "market_signal_2"],
  };

  const anchors = new Set();
  const allItems = [];
  for (const [section, slots] of Object.entries(specification)) {
    const items = document.sections[section];
    if (!Array.isArray(items) || items.length !== 2) {
      fail(`${section} debe contener exactamente 2 señales`);
    }
    slots.forEach((slot, index) => {
      allItems.push(
        validateItem(items[index], slot, `sections.${section}[${index}]`, anchors),
      );
    });
  }

  for (let i = 0; i < allItems.length; i += 1) {
    for (let j = i + 1; j < allItems.length; j += 1) {
      const left = `${allItems[i].headline} ${allItems[i].deck}`;
      const right = `${allItems[j].headline} ${allItems[j].deck}`;
      const ratio = overlapRatio(left, right);
      if (ratio >= 0.72) {
        fail(`posible duplicación interna entre ${allItems[i].slot} y ${allItems[j].slot} (overlap ${ratio.toFixed(2)})`);
      }
    }
  }

  const m1 = document.sections.markets[0];
  const m2 = document.sections.markets[1];
  const marketOverlap = overlapRatio(
    `${m1.headline} ${m1.deck} ${m1.development}`,
    `${m2.headline} ${m2.deck} ${m2.development}`,
  );
  if (marketOverlap >= 0.58) {
    fail(`las dos señales de Mercados parecen demasiado cercanas (overlap ${marketOverlap.toFixed(2)})`);
  }

  return {
    valid: true,
    status: "READY",
    date: document.date,
    contract: document.contract,
    itemCount: allItems.length,
    note: "Validación estructural aprobada. La deduplicación semántica contra General/Nacional/Mercados requiere revisión editorial del Publisher.",
  };
}

function validateBlocked(document) {
  const topKeys = Object.keys(document).sort().join(",");
  if (topKeys !== "contract,date,reason,status") {
    fail("BLOCKED sólo puede contener status, date, contract y reason");
  }
  if (document.contract !== "atlas-senales-del-dia-v1") fail("contract incorrecto");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(document.date || ""))) fail("date inválida");
  const reason = requiredString(document.reason, "reason");
  if (reason.length < 12) fail("reason es demasiado breve");

  return {
    valid: true,
    status: "BLOCKED",
    date: document.date,
    contract: document.contract,
    reason,
  };
}

async function main() {
  if (!input) fail("indica la ruta del JSON como primer argumento o ATLAS_SENALES_FILE");
  const resolved = path.resolve(process.cwd(), input);
  const text = await fs.readFile(resolved, "utf8");
  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    fail(`JSON inválido: ${error.message}`);
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    fail("la raíz debe ser un objeto");
  }

  let result;
  if (document.status === "READY") result = validateReady(document);
  else if (document.status === "BLOCKED") result = validateBlocked(document);
  else fail("status debe ser READY o BLOCKED");

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
