# Indicadores económicos

## Alcance actual

La barra económica utiliza seis series:

- UF;
- dólar observado;
- euro;
- UTM;
- TPM;
- libra de cobre.

La actualización ocurre durante la construcción estática. El navegador no consulta proveedores externos.

## Flujo de datos

```text
proveedor público
→ validación de fecha y rango
→ snapshot normalizado
→ copia pública del snapshot
→ build estático
```

Si el proveedor falla:

```text
último snapshot público válido
→ respaldo local versionado
→ detención si ninguno es válido
```

La caída del proveedor no debe eliminar la barra ni reemplazar una versión pública válida con datos corruptos.

## Controles

Cada serie se valida por:

- valor numérico;
- rango de control;
- fecha interpretable;
- ausencia de fecha futura;
- antigüedad máxima acorde con su frecuencia.

La UTM y la TPM admiten ventanas mayores que las series diarias porque su actualización es mensual o discreta.

## Programación

El workflow está configurado para días hábiles a las 08:45 en `America/Santiago`.

También se actualiza durante las construcciones autorizadas de `main` y mediante ejecución manual.

## Migración futura al Banco Central

La arquitectura separa el snapshot del proveedor. La adopción de la API oficial requerirá:

1. identificar las series oficiales equivalentes;
2. incorporar credenciales como GitHub Secrets;
3. crear o adaptar el conector del proveedor;
4. ejecutar una comparación paralela durante un periodo de calibración;
5. conservar el fallback mientras se valida la transición;
6. actualizar la atribución visible.

Las credenciales no deben quedar disponibles para el código del navegador ni registrarse en logs.

## Cambios de proveedor

Un proveedor temporal no debe convertirse en dependencia irreversible. Cualquier sustitución debe mantener el mismo contrato interno:

```json
{
  "schemaVersion": 1,
  "status": "current",
  "asOf": "AAAA-MM-DD",
  "sourceName": "Fuente",
  "sourceUrl": "https://...",
  "indicators": []
}
```

## Verificación de una entrega

```bash
npm run update:indicators
npm run format:check
npm run build:site
```

La revisión debe confirmar:

- seis indicadores presentes;
- unidades correctas;
- fuente y fecha de corte visibles;
- ausencia de cambios editoriales;
- fallback probado;
- no despliegue desde Pull Requests.
