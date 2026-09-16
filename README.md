# ATLAS NEWS

Publicación financiera digital estática con gramática visual de periódico, contenido versionado y procesos editoriales controlados.

## Estado

El proyecto dispone de:

- publicación íntegra desde Markdown;
- numeración automática de ediciones diarias;
- validación editorial, de portada y de salida;
- despliegue estático mediante GitHub Actions con verificación posterior;
- página y manifiesto públicos de estado;
- barra económica con snapshot, actualización y fallback;
- Radar IPSA para generar candidatos en borrador;
- Buzón Editorial para convertir propuestas estructuradas en Pull Requests de revisión.

Ningún candidato de Radar o del Buzón se publica automáticamente.

## Sitio público

- [Ver ATLAS NEWS](https://atlasnews-media.github.io/)
- [Ver estado de publicación](https://atlasnews-media.github.io/estado/)
- [Consultar manifiesto JSON](https://atlasnews-media.github.io/status.json)

El código y el contenido fuente permanecen en el repositorio privado. GitHub Actions publica únicamente la salida estática en `EldeSiempre100.github.io` después de validar cada cambio aceptado en `main`.

La numeración `N° 001`, `N° 002`, etc. corresponde al orden cronológico de las ediciones diarias publicadas. Los panoramas semanales y las Lecturas no alteran esa secuencia.

## Fuente de verdad

- Ediciones: `src/content/editions/`.
- Lecturas: `src/content/readings/`.
- Indicadores: `src/data/economic-indicators.json`.
- Configuración Radar IPSA: `src/data/radar-companies.json`.
- Estado público generado: `public/status.json` durante el build.

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
npm run status:generate
npm run audit:production
npm run validate:content
npm run validate:build
npm run update:indicators
npm run radar:discover
npm run editorial:from-issue
```

`npm run build` actualiza los indicadores y ejecuta la construcción completa. `npm run build:site` valida, genera el manifiesto y construye sin volver a consultar el proveedor económico.

`npm run audit:production` requiere `ATLAS_PUBLIC_DIR` y `ATLAS_SOURCE_SHA`; GitHub Actions los configura automáticamente al ejecutar **Auditar producción**.

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
- [Auditoría integral](docs/AUDITORIA_INTEGRAL.md)
- [Procedimiento de publicación para GPT](docs/PROCEDIMIENTO_GPT_PUBLICACION.md)
- [Indicadores económicos](docs/INDICADORES_ECONOMICOS.md)
- [Radar IPSA](docs/RADAR_IPSA.md)

Los cambios técnicos se realizan mediante rama y Pull Request. Los Pull Requests validan, pero no despliegan producción.

En GitHub Actions, **Publicar ATLAS NEWS** valida y despliega; **Auditar producción** compara `main` con la versión pública y falla cuando existe un desfase.

## Seguridad

Las claves nunca se guardan en el repositorio. Los valores reales se configuran como GitHub Secrets.

La publicación web utiliza una clave SSH de despliegue almacenada por GitHub Actions. Los workflows editoriales solo crean borradores y Pull Requests; no cambian contenido a `published`.
