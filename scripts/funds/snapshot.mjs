const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_NAME = "BuscaFondos";
const HISTORY_BUFFER_DAYS = 380;

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function attributesOf(item, label) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`${label}: registro inválido.`);
  }
  if (
    !item.attributes ||
    typeof item.attributes !== "object" ||
    Array.isArray(item.attributes)
  ) {
    throw new Error(`${label}: attributes inválido.`);
  }
  return item.attributes;
}

function subtractUtcDays(date, days) {
  if (!ISO_DATE_PATTERN.test(date)) {
    throw new Error(`Fecha efectiva inválida: ${date}`);
  }
  const [year, month, day] = date.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Fecha efectiva inválida: ${date}`);
  }

  parsed.setUTCDate(parsed.getUTCDate() - days);
  return parsed.toISOString().slice(0, 10);
}

function parsePriceObservations(records, seriesId) {
  const observations = records.map((record) => {
    const attributes = attributesOf(record, `Serie ${seriesId}`);
    const date = String(attributes.date ?? "");
    const price = Number(attributes.price);

    if (!ISO_DATE_PATTERN.test(date)) {
      throw new Error(`Serie ${seriesId}: fecha de valor cuota inválida.`);
    }
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Serie ${seriesId}: valor cuota inválido para ${date}.`);
    }

    return { date, price };
  });

  if (observations.length === 0) {
    throw new Error(`Serie ${seriesId}: no se recibieron valores cuota.`);
  }

  return observations;
}

function latestObservationDate(observations) {
  return observations.reduce(
    (latest, observation) =>
      observation.date > latest ? observation.date : latest,
    "",
  );
}

function findBancoEstadoProvider(providers) {
  const matches = providers.filter((provider) => {
    const attributes = attributesOf(provider, "Administradora");
    return normalizeText(attributes.name).includes("BANCOESTADO");
  });

  if (matches.length !== 1) {
    throw new Error(
      `Se esperaba una administradora BancoEstado y se encontraron ${matches.length}.`,
    );
  }

  return matches[0];
}

async function validateConfiguredUniverse(client, configs) {
  const provider = findBancoEstadoProvider(await client.assetProviders());
  const providerId = String(provider.id ?? "");
  if (!providerId) {
    throw new Error("BancoEstado AGF no tiene identificador de proveedor válido.");
  }

  const conceptualAssets = await client.conceptualAssets(providerId);
  const validated = [];

  for (const config of configs) {
    const conceptualAsset = conceptualAssets.find(
      (item) => String(item.id) === String(config.conceptualAssetId),
    );

    if (!conceptualAsset) {
      throw new Error(
        `${config.displayName}: no existe el fondo conceptual ${config.conceptualAssetId}.`,
      );
    }

    const conceptualAttributes = attributesOf(
      conceptualAsset,
      config.displayName,
    );
    if (
      normalizeText(conceptualAttributes.name) !==
      normalizeText(config.sourceFundName)
    ) {
      throw new Error(
        `${config.displayName}: el nombre fuente no coincide con BuscaFondos.`,
      );
    }

    const realAssets = await client.realAssets(config.conceptualAssetId);
    const realAsset = realAssets.find(
      (item) => String(item.id) === String(config.seriesId),
    );

    if (!realAsset) {
      throw new Error(
        `${config.displayName}: no existe la serie ${config.seriesId}.`,
      );
    }

    const realAttributes = attributesOf(realAsset, config.displayName);
    const sourceSeries = String(
      realAttributes.serie ?? realAttributes.series ?? realAttributes.name ?? "",
    );

    if (
      normalizeText(sourceSeries) !== normalizeText(config.sourceSeriesName)
    ) {
      throw new Error(
        `${config.displayName}: la serie configurada no coincide con BuscaFondos.`,
      );
    }

    validated.push(config);
  }

  return validated;
}

export function validateFundsSnapshot(snapshot, expectedCount) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Snapshot de Fondos inválido.");
  }
  if (snapshot.schemaVersion !== 1) {
    throw new Error("Versión de snapshot de Fondos no soportada.");
  }
  if (snapshot.status !== "current") {
    throw new Error("Un snapshot nuevo debe publicarse con estado current.");
  }
  if (!ISO_DATE_PATTERN.test(snapshot.asOf)) {
    throw new Error("Snapshot de Fondos sin fecha efectiva válida.");
  }
  if (!Number.isFinite(Date.parse(snapshot.fetchedAt))) {
    throw new Error("Snapshot de Fondos sin fetchedAt válido.");
  }
  if (!snapshot.source || snapshot.source.provider !== "buscafondos") {
    throw new Error("Snapshot de Fondos sin fuente BuscaFondos válida.");
  }
  if (!Array.isArray(snapshot.funds) || snapshot.funds.length !== expectedCount) {
    throw new Error(
      `Snapshot de Fondos debe contener exactamente ${expectedCount} fondos.`,
    );
  }

  const keys = new Set();
  const series = new Set();
  const validTrends = new Set(["up", "down", "flat"]);

  for (const row of snapshot.funds) {
    if (!row.key || keys.has(row.key)) {
      throw new Error("Snapshot de Fondos contiene key vacía o duplicada.");
    }
    if (!row.seriesId || series.has(row.seriesId)) {
      throw new Error("Snapshot de Fondos contiene seriesId vacío o duplicado.");
    }
    keys.add(row.key);
    series.add(row.seriesId);

    if (row.effectiveDate !== snapshot.asOf) {
      throw new Error(`${row.displayName}: fecha efectiva inconsistente.`);
    }
    if (!validTrends.has(row.trend)) {
      throw new Error(`${row.displayName}: tendencia inválida.`);
    }

    for (const key of ["d7", "d30", "d60", "d90", "y1"]) {
      if (!Number.isFinite(row.returns?.[key])) {
        throw new Error(`${row.displayName}: rentabilidad ${key} inválida.`);
      }
    }
  }

  return snapshot;
}

export async function buildFundsSnapshot({
  client,
  configs,
  finance,
  expectedCount,
  baseUrl,
  now = () => new Date(),
}) {
  if (configs.length !== expectedCount) {
    throw new Error(
      `Whitelist inconsistente: ${configs.length} fondos, esperados ${expectedCount}.`,
    );
  }

  const health = await client.health();
  if (health.status !== "ok") {
    throw new Error(`BuscaFondos /health reportó estado ${health.status ?? "vacío"}.`);
  }

  const asOf = String(health.last_scraped_date ?? "");
  if (!ISO_DATE_PATTERN.test(asOf)) {
    throw new Error("BuscaFondos /health no entregó last_scraped_date válido.");
  }

  const validatedConfigs = await validateConfiguredUniverse(client, configs);
  const fromDate = subtractUtcDays(asOf, HISTORY_BUFFER_DAYS);

  const funds = [];
  for (const config of validatedConfigs) {
    const records = await client.days(config.seriesId, fromDate);
    const observations = parsePriceObservations(records, config.seriesId);
    const effectiveDate = latestObservationDate(observations);

    if (effectiveDate !== asOf) {
      throw new Error(
        `${config.displayName}: último valor cuota ${effectiveDate}; fuente reporta ${asOf}.`,
      );
    }

    funds.push({
      key: config.key,
      displayName: config.displayName,
      seriesId: config.seriesId,
      seriesName: config.seriesName,
      effectiveDate,
      trend: finance.calculateFundTrend(observations),
      returns: finance.calculateFundReturns(observations),
    });
  }

  return validateFundsSnapshot(
    {
      schemaVersion: 1,
      status: "current",
      asOf,
      fetchedAt: now().toISOString(),
      source: {
        name: SOURCE_NAME,
        provider: "buscafondos",
        baseUrl,
      },
      funds,
    },
    expectedCount,
  );
}
