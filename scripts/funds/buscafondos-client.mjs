function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} no tiene estructura de objeto válida.`);
  }
  return value;
}

function assertDataArray(payload, label) {
  const object = assertObject(payload, label);
  if (!Array.isArray(object.data)) {
    throw new Error(`${label} no contiene un arreglo data válido.`);
  }
  return object.data;
}

export function createBuscaFondosClient({
  baseUrl = "https://api.buscafondos.com",
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("No hay implementación fetch disponible para BuscaFondos.");
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  async function request(path) {
    const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
      headers: {
        accept: "application/json",
        "user-agent": "ATLAS-NEWS-Funds/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(
        `BuscaFondos respondió HTTP ${response.status} en ${path}.`,
      );
    }

    return response.json();
  }

  return Object.freeze({
    async health() {
      return assertObject(await request("/health"), "BuscaFondos /health");
    },

    async assetProviders() {
      return assertDataArray(
        await request("/api/asset_providers"),
        "BuscaFondos asset_providers",
      );
    },

    async conceptualAssets(providerId) {
      return assertDataArray(
        await request(
          `/api/asset_providers/${encodeURIComponent(providerId)}/conceptual_assets`,
        ),
        "BuscaFondos conceptual_assets",
      );
    },

    async realAssets(conceptualAssetId) {
      return assertDataArray(
        await request(
          `/api/conceptual_assets/${encodeURIComponent(conceptualAssetId)}/real_assets`,
        ),
        "BuscaFondos real_assets",
      );
    },

    async days(seriesId, fromDate) {
      const params = new URLSearchParams();
      if (fromDate) params.set("from_date", fromDate);
      const suffix = params.size ? `?${params.toString()}` : "";

      return assertDataArray(
        await request(
          `/api/real_assets/${encodeURIComponent(seriesId)}/days${suffix}`,
        ),
        "BuscaFondos days",
      );
    },
  });
}
