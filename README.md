# ATLAS NEWS

Publicación financiera digital estática con gramática visual de periódico, contenido versionado y procesos editoriales controlados.

## Estado

El proyecto dispone de:

- publicación íntegra desde Markdown;
- validación editorial y de salida;
- despliegue estático mediante GitHub Actions;
- barra económica con snapshot, actualización y fallback;
- Radar IPSA para generar candidatos en borrador;
- Buzón Editorial para convertir propuestas estructuradas en Pull Requests de revisión.

Ningún candidato de Radar o del Buzón se publica automáticamente.

## Sitio público

[Ver ATLAS NEWS](https://eldesiempre100.github.io/)

El código y el contenido fuente permanecen en el repositorio privado. GitHub Actions publica únicamente la salida estática en `EldeSiempre100.github.io` después de validar cada cambio aceptado en `main`.

## Fuente de verdad

- Ediciones: `src/content/editions/`.
- Lecturas: `src/content/readings/`.
- Indicadores: `src/data/economic-indicators.json`.
- Configuración Radar IPSA: `src/data/radar-companies.json`.

Cada publicación corresponde a un archivo Markdown o MDX. Los componentes presentan el contenido, pero no lo duplican.

## Requisitos

- Node.js 22.12 o superior.
- npm 10 o superior.

## Comandos

```bash
npm ci
npm run dev
npm run format:check
npm run build
npm run build:site
npm run validate:content
npm run validate:build
npm run update:indicators
npm run radar:discover
npm run editorial:from-issue
```

`npm run build` actualiza los indicadores y ejecuta la construcción completa. `npm run build:site` valida y construye sin volver a consultar el proveedor económico.

## Estructura

```text
.github/
├── ISSUE_TEMPLATE/
└── workflows/
docs/
scripts/
src/
├── content/
│   ├── editions/
│   └── readings/
├── data/
├── layouts/
├── pages/
└── styles/
```

Los esquemas en `src/content.config.ts` y las validaciones en `scripts/validate-content.mjs` constituyen el contrato que debe cumplir cualquier publicación creada por una persona o por un proceso automatizado.

## Operación

- [Operación segura](docs/OPERACION_SEGURA.md)
- [Procedimiento de publicación para GPT](docs/PROCEDIMIENTO_GPT_PUBLICACION.md)
- [Indicadores económicos](docs/INDICADORES_ECONOMICOS.md)
- [Radar IPSA](docs/RADAR_IPSA.md)

Los cambios técnicos se realizan mediante rama y Pull Request. Los Pull Requests validan, pero no despliegan producción.

## Seguridad

Las claves nunca se guardan en el repositorio. Los valores reales se configuran como GitHub Secrets.

La publicación web utiliza una clave SSH de despliegue almacenada por GitHub Actions. Los workflows editoriales solo crean borradores y Pull Requests; no cambian contenido a `published`.
