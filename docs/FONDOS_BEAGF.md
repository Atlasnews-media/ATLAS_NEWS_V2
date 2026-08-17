# ATLAS NEWS — Integración Fondos Mutuos BEAGF

Estado: Fase 1 — contrato y configuración

## Objetivo

Incorporar una pestaña pública `Fondos` con un resumen de rentabilidades de una selección acotada de fondos mutuos de BancoEstado AGF, alimentada directamente desde la API pública de BuscaFondos y actualizada por GitHub Actions sin dependencia de GPT.

El nombre `Integración Fondos Mutuos BEAGF` es interno. El nombre editorial visible se definirá por separado; en navegación la sección se denomina `Fondos`.

## Regla de aislamiento operacional

La actualización de Fondos es un subsistema independiente del pipeline editorial de ATLAS NEWS.

- Un fallo de BuscaFondos, de cálculo o de validación de Fondos no puede bloquear General, Nacional, Mercados, Lecturas ni el despliegue editorial normal.
- El workflow de Fondos será independiente de `.github/workflows/publish-site.yml`.
- `publish-site.yml` no ejecutará la extracción ni los cálculos de Fondos.
- Ante un fallo de actualización, la sección debe conservar el último snapshot válido previamente publicado.
- La pestaña `Fondos` nunca debe requerir que la API externa esté disponible durante la navegación del lector.
- La renderización consume únicamente un snapshot estático validado.

## Separación de responsabilidades

```text
BuscaFondos API
      |
      v
scripts/funds/update-funds.*
      |
      v
src/lib/funds/finance.ts
      |
      v
validador del dataset
      |
      v
snapshot estático de Fondos
      |
      v
/fondos/ + componente de tabla
```

### Capa de adquisición

Responsable de:

- consultar `https://api.buscafondos.com`;
- verificar `/health`;
- recuperar únicamente las series configuradas;
- solicitar solo el rango histórico necesario mediante `from_date`;
- entregar fechas y valores cuota sin lógica de presentación.

### Capa financiera

`src/lib/funds/finance.ts` será el único módulo autorizado para calcular:

- tendencia diaria;
- rentabilidad 7 días;
- rentabilidad 30 días;
- rentabilidad 60 días;
- rentabilidad 90 días;
- rentabilidad 1 año;
- redondeo porcentual para publicación.

Debe contener funciones puras: recibe datos, devuelve resultados y no realiza `fetch`, escritura de archivos ni renderizado.

### Capa de render

La página Astro y sus componentes:

- no calculan rentabilidades;
- no consultan BuscaFondos;
- no deducen fechas;
- no transforman valores cuota;
- solo presentan el snapshot ya validado.

## Metodología acordada

### Rentabilidad

Para cada horizonte:

1. tomar el último valor cuota disponible;
2. retroceder N días calendario;
3. encontrar la primera observación disponible desde la fecha objetivo hacia adelante;
4. calcular:

```text
((valor_cuota_final - valor_cuota_inicial) / valor_cuota_inicial) * 100
```

Horizontes públicos iniciales: `7D`, `30D`, `60D`, `90D`, `1 AÑO`.

Las rentabilidades se publican con dos decimales.

### Tendencia

La tendencia compara el último valor cuota con la observación inmediatamente anterior disponible:

- `up` -> `▲`
- `down` -> `▼`
- `flat` -> `→`

No requiere explicación adicional en la interfaz.

### Fecha de datos

La sección mostrará la fecha efectiva de los datos, no la hora en que GitHub Actions ejecutó el proceso.

La fecha de referencia será la última fecha disponible reportada por la fuente y validada contra las series configuradas.

## Contrato del snapshot

El snapshot publicado deberá respetar conceptualmente esta estructura:

```json
{
  "schemaVersion": 1,
  "status": "current",
  "asOf": "2026-08-17",
  "fetchedAt": "2026-08-18T13:17:00.000Z",
  "source": {
    "name": "BuscaFondos",
    "provider": "buscafondos",
    "baseUrl": "https://api.buscafondos.com"
  },
  "funds": [
    {
      "key": "identificador-interno",
      "displayName": "Nombre editorial",
      "seriesId": "000000000",
      "seriesName": "Serie X",
      "effectiveDate": "2026-08-17",
      "trend": "up",
      "returns": {
        "d7": 0.12,
        "d30": 0.48,
        "d60": 0.91,
        "d90": 1.35,
        "y1": 4.27
      }
    }
  ]
}
```

Los valores del ejemplo son ficticios y no corresponden a fondos reales.

## Universo de fondos

El alcance objetivo es de ocho fondos/series específicos de BancoEstado AGF.

La whitelist definitiva se incorporará en `src/lib/funds/config.ts` una vez que se entregue el listado canónico de fondos y series. No se realizará descubrimiento dinámico de productos en producción.

## Política de fallos

Una actualización nueva solo puede sustituir al snapshot anterior cuando:

- la fuente responde correctamente;
- todas las series configuradas están presentes;
- las observaciones tienen fechas válidas;
- existen datos suficientes para todos los horizontes;
- los valores cuota son numéricos, finitos y positivos;
- los cálculos devuelven resultados finitos;
- el snapshot cumple su contrato.

Si cualquiera de esos controles falla, el proceso debe terminar como fallido sin destruir el último snapshot válido.

## Plan de construcción

1. **Fase 1 — Contrato y configuración.** Estructura técnica, tipos, configuración y contrato del snapshot. Sin cambios visibles en producción.
2. **Fase 2 — Motor financiero aislado.** Implementación y pruebas deterministas de `finance.ts`.
3. **Fase 3 — Extracción BuscaFondos.** Cliente de API, generación y validación de snapshot.
4. **Fase 4 — Action independiente en sombra.** Ejecución manual, sin modificar la web pública.
5. **Fase 5 — Pestaña Fondos y navegación.** Render estático según mockup aprobado.
6. **Fase 6 — Producción automática.** Cron independiente, fallback y coordinación segura del despliegue público.

## Gate de Fase 1

La Fase 1 se considera aprobada si:

- no modifica rutas públicas ni navegación;
- no modifica `publish-site.yml`;
- no realiza llamadas externas;
- no introduce cálculos en componentes Astro;
- define un contrato tipado para configuración y snapshot;
- reserva `finance.ts` como capa financiera independiente;
- el proyecto continúa construyendo con las mismas reglas previas.
