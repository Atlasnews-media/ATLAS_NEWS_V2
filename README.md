# ATLAS NEWS

MVP de una publicación financiera digital con gramática visual de periódico y contenido versionado.

## Estado

Fase 2: sistema de contenido, rutas públicas y muestras editoriales.

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
└── pages/
```

Los esquemas en `src/content.config.ts` constituyen el contrato que debe cumplir cualquier publicación creada por una persona o por GPT.

`npm run build` valida primero el contenido, comprueba Astro y TypeScript, genera el sitio y revisa que las rutas públicas existan sin exponer borradores.

## Seguridad

Las claves nunca se guardan en el repositorio. `.env.example` documenta únicamente nombres de variables. Los valores reales se configurarán como secretos durante la fase de automatización.
