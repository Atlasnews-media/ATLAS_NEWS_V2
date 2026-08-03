# ATLAS NEWS

MVP de una publicación financiera digital con gramática visual de periódico y contenido versionado.

## Estado

Fase 4: despliegue continuo gratuito y operación editorial basada en Markdown.

## Sitio público

[Ver ATLAS NEWS](https://eldesiempre100.github.io/)

El código y el contenido fuente permanecen en el repositorio privado. GitHub Actions publica únicamente la salida estática en `EldeSiempre100.github.io` después de validar cada cambio aceptado en `main`.

## Requisitos

- Node.js 22.12 o superior.
- npm 10 o superior.

## Comandos

```bash
npm install
npm run dev
npm run check
npm run build
npm run validate:content
npm run validate:build
npm run format:check
```

## Estructura

```text
src/
├── content/
│   ├── editions/
│   └── readings/
├── layouts/
├── styles/
└── pages/
```

Los esquemas en `src/content.config.ts` constituyen el contrato que debe cumplir cualquier publicación creada por una persona o por GPT.

`npm run build` valida primero el contenido, comprueba Astro y TypeScript, genera el sitio y revisa que las rutas públicas existan sin exponer borradores.

## Seguridad

Las claves nunca se guardan en el repositorio. `.env.example` documenta únicamente nombres de variables. Los valores reales se configurarán como secretos durante la fase de automatización.

La publicación web utiliza una clave SSH de despliegue almacenada por GitHub Actions. No utiliza la API de OpenAI ni genera consumo asociado a ella.
