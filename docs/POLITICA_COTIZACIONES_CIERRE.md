# ATLAS NEWS V2 — Política aprobada de cotizaciones, cierres y vigencia

**Criterio funcional definido por el responsable editorial el 22 de octubre de 2026.**
Este contrato no puede modificarse unilateralmente por ajustes de backend, fallback o QA.

## Invariantes
1. **Durante una sesión abierta:** si existe una fuente intradía verificable, actualizar cotización, variación diaria, fecha/hora efectiva y procedencia conforme al intervalo programado (no anunciar tiempo real si el proveedor introduce rezago). Una referencia diaria nunca se presenta como tick intradía.
2. **Al cierre:** conservar el último valor efectivamente confirmado y su variación respecto del cierre comparable anterior. No reiniciar el porcentaje a cero.
3. **Noche, fines de semana y feriados:** continuar mostrando ese último cierre y variación hasta que exista una nueva observación verificable. No se oculta por cambiar el día calendario.
4. **Si falla el proveedor:** usar únicamente observaciones previamente verificadas con fuente y fecha originales. Identificar la antigüedad: un corte nuevo del JSON no cambia la fecha de la cotización. Rechazar cualquier supuesto dato nuevo sin fecha o procedencia.
5. **IPSA:** precio intradía solo cuando exista un proveedor del **mismo índice y base de cálculo** que entregue fecha y hora verificables. Si no, mostrar expresamente el último cierre con fecha y variación original; no confundir el cierre previo con una cotización actual.
6. **Dólar y euro oficiales:** las series de Mi Indicador son *referencias diarias* basadas en publicaciones del Banco Central de Chile, no transacciones spot en tiempo real. Su último registro y variación diarios permanecen hasta que se publique un dato oficial posterior (incluidos viernes a lunes). Para incorporar spot intradía, exigir proveedor, identidad de serie y rotulación propios: no sustituir silenciosamente la referencia oficial.
7. **Variación:** calcular usando dos observaciones consecutivas comparables del mismo instrumento, proveedor y escala. No mezclar series de índices con y sin dividendos, ni índices históricos rebautizados tras cambios metodológicos.
8. **Governance:** cualquier modificación de la política de visibilidad, período de comparación, clasificación de fuente o instrumento del hero requiere autorización expresa del responsable editorial.

## Estado de la alimentación intradía
La cadencia de comprobación del frontend es de cinco minutos; el intento de generación del snapshot se encuentra configurado cada 15 minutos, sujeto a ejecución de GitHub Actions y a disponibilidad del proveedor. **Frecuencia de consulta no equivale a frecuencia de nueva cotización.** La actual ruta de IPSA (Findic cierre diario, Yahoo y Stooq como intentos alternativos) no acredita por sí sola un precio intradía continuo: este componente necesita un proveedor adicional técnicamente probado y autorizado.

## Control de publicación
Mostrar fecha efectiva del último cierre IPSA en el hero, fuente y hora del registro en información descriptiva. Mantener diagnóstico `partial/delayed` si el dato es anterior a la sesión actual; no confundir dato retenido con dato actualizado.
