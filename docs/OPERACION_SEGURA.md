# Operación segura de ATLAS NEWS

## Fuente de verdad

GitHub es la fuente operativa del proyecto. La rama `main` representa el estado aceptado y desplegable del repositorio privado.

El clon local puede permanecer desactualizado mientras no se utilice para editar, crear commits o publicar. Antes de volver a usarlo se debe sincronizar explícitamente.

## Flujo normal de cambios

1. Crear una rama desde el `main` remoto vigente.
2. Realizar un cambio de alcance definido.
3. Ejecutar las validaciones aplicables.
4. Abrir un Pull Request contra `main`.
5. Confirmar que el Pull Request no despliega producción.
6. Revisar archivos modificados, resultados y exclusiones.
7. Fusionar mediante `squash` cuando corresponda.
8. Verificar el workflow de `main` y la salida pública.

Los cambios técnicos no deben escribirse directamente en `main` salvo una recuperación excepcional, explícitamente autorizada y documentada.

## Sincronización del clon local

Con el árbol local limpio:

```bash
git status
git fetch --prune origin
git switch main
git pull --ff-only origin main
```

Para descargar una rama remota sin integrarla:

```bash
git switch --track origin/<rama>
```

Si la rama local ya existe:

```bash
git switch <rama>
git pull --ff-only origin <rama>
```

Si existen cambios locales sin commit, detenerse. No usar `reset`, `clean` ni `stash` automáticamente.

## Reversión

Una reversión publicada debe conservar el historial:

```bash
git revert <sha>
```

Después de la reversión se ejecutan formato, validación editorial y construcción antes de publicar.

No utilizar:

- `git reset --hard` para corregir historia compartida;
- `git push --force`;
- eliminación de commits ya publicados;
- sustitución manual del repositorio público.

## Validaciones mínimas

```bash
npm ci
npm run format:check
npm run build:site
```

Cuando el cambio afecta indicadores:

```bash
npm run update:indicators
```

Cuando afecta Radar IPSA:

```bash
ATLAS_RADAR_FIXTURE=scripts/fixtures/gdelt-radar-sample.json \
ATLAS_RADAR_REPORT_PATH=tmp/radar-report.json \
npm run radar:discover
```

## Producción

Los Pull Requests validan, pero no despliegan. La publicación se realiza desde `main`, por ejecución manual autorizada o por un horario expresamente configurado.

Si falla formato, contrato editorial, Astro o validación de salida, el workflow se detiene antes de reemplazar la versión pública anterior.

## Secretos

Las claves y credenciales viven únicamente en GitHub Secrets o en un almacén equivalente aprobado.

Nunca deben aparecer en:

- Markdown editorial;
- archivos de ejemplo;
- logs;
- comentarios de Pull Requests;
- prompts;
- documentación del repositorio.

## Registro de cada entrega

Cada cierre debe informar como mínimo:

- rama y SHA final;
- archivos modificados;
- validaciones ejecutadas;
- estado del Pull Request;
- estado del workflow de `main`;
- confirmación de cambios editoriales o su ausencia;
- dependencias externas pendientes.
