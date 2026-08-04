# Auditoría integral de ATLAS NEWS

Fecha de auditoría: 2026-08-04.

## Hallazgos iniciales

1. La cabecera mostraba `Vol. I · N° 001` como texto fijo, aunque ya existían dos ediciones diarias publicadas.
2. `main` contenía la edición diaria del 4 de agosto, pero el repositorio público todavía correspondía al despliegue anterior.
3. La portada no disponía de un manifiesto que permitiera identificar la edición y el commit realmente desplegados.
4. La concurrencia del workflow podía cancelar despliegues de producción en curso.
5. Las validaciones comprobaban la integridad de páginas individuales, pero no exigían que la portada mostrara la edición diaria más reciente.
6. La revisión operativa dependía de interpretar commits, correos y ejecuciones de GitHub Actions.

## Correcciones estructurales

- La numeración se deriva del orden cronológico de las ediciones diarias publicadas.
- Los panoramas semanales y las Lecturas no modifican la numeración diaria.
- La cabecera, la portada, el listado, el archivo y los artículos utilizan la misma función de numeración.
- El build genera `status.json` con edición vigente, número, conteos, indicadores y commit de origen.
- La página `/estado/` presenta esa información en formato legible.
- El build falla cuando la portada, el archivo, la página de estado o el manifiesto no coinciden.
- Los despliegues de producción se serializan y verifican después de publicar.
- El workflow **Auditar producción** compara diariamente `main` con la web pública.

## Invariantes editoriales

1. Solo `status: published` llega a la web.
2. Una fecha de archivo debe coincidir con `publishedAt` en `America/Santiago`.
3. No puede existir más de una edición publicada del mismo tipo y fecha.
4. La edición diaria más reciente debe ser la portada.
5. El número visible debe ser igual a la cantidad histórica de ediciones diarias publicadas.
6. Un candidato de Radar o Buzón no puede publicarse con `pendiente-verificacion`.
7. Los borradores no generan páginas públicas.

## Invariantes de despliegue

1. Un Pull Request valida, pero no publica.
2. Un push aceptado en `main` construye y publica en orden.
3. `status.json.sourceCommit` debe coincidir con el commit que originó el despliegue.
4. La portada pública debe enlazar la edición indicada por `status.json.latestDaily.id`.
5. La auditoría de producción falla cuando la web queda detrás de `main`.

## Revisión rápida

### En la web

Abrir `/estado/` y comprobar:

- número de edición;
- fecha editorial;
- título esperado de portada;
- fecha de indicadores;
- código corto de la versión.

### En GitHub

1. **Code**: contenido aceptado en `main`.
2. **Pull requests**: cambios todavía no aprobados.
3. **Actions → Publicar ATLAS NEWS**: build y despliegue.
4. **Actions → Auditar producción**: coincidencia entre `main` y la web.

Los fallos de commits intermedios son historial. La decisión operativa debe basarse en el `HEAD` actual y en las ejecuciones asociadas a ese `HEAD`.

## Recuperación

Si una integración aceptada debe revertirse, se crea un commit nuevo mediante `git revert`. No se utiliza `reset --hard`, rebase de historia compartida ni force-push sobre `main`.
