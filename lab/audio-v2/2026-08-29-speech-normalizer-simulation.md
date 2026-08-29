# ATLAS NEWS — Speech Normalizer Simulation

Fecha: 2026-08-29
Estado: LAB / NO PRODUCTIVO
Objetivo: simular una capa `normalize_for_speech()` para Kokoro usando frases reales de los diálogos Nacional y Mercados ya generados. Este archivo NO modifica contenido editorial ni audio publicado.

## Principio

```text
texto editorial
→ normalize_for_speech()
→ texto TTS
→ Kokoro
```

La representación editorial permanece intacta. Solo cambia la cadena que recibe el sintetizador.

---

## 1. Números, porcentajes y magnitudes

### Caso A — millones de dólares

**Original**

> En la semana terminada el 26 de agosto salieron unos 22.330 millones de dólares de fondos de acciones de Estados Unidos, la mayor salida semanal desde marzo.

**Speech text simulado**

> En la semana terminada el veintiséis de agosto salieron unos veintidós mil trescientos treinta millones de dólares de fondos de acciones de Estados Unidos, la mayor salida semanal desde marzo.

**Regla**

- `22.330 millones` → `veintidós mil trescientos treinta millones`
- El punto se interpreta como separador de miles en contexto financiero en español.

### Caso B — otra magnitud

**Original**

> Europa recibió cerca de 7.920 millones y Asia unos 4.800 millones.

**Speech text simulado**

> Europa recibió cerca de siete mil novecientos veinte millones y Asia unos cuatro mil ochocientos millones.

### Caso C — porcentaje decimal

**Original**

> Los ocupados totales cayeron 0,2% anual, pero los asalariados formales bajaron 2,4%.

**Speech text simulado**

> Los ocupados totales cayeron cero coma dos por ciento anual, pero los asalariados formales bajaron dos coma cuatro por ciento.

### Caso D — tasa con decimal

**Original**

> El Treasury a dos años subió hacia 4,36% y la probabilidad de alza pasó desde cerca de 35% a más de 55%.

**Speech text simulado**

> El bono del Tesoro estadounidense a dos años subió hacia cuatro coma treinta y seis por ciento y la probabilidad de alza pasó desde cerca de treinta y cinco por ciento a más de cincuenta y cinco por ciento.

---

## 2. Anglicismos financieros con equivalente natural en español

### Caso E — large caps

**Original**

> Los fondos large-cap perdieron casi 24.730 millones de dólares, mientras mid-cap y small-cap recibieron entradas.

**Speech text simulado**

> Los fondos de empresas de gran capitalización perdieron casi veinticuatro mil setecientos treinta millones de dólares, mientras los fondos de mediana y pequeña capitalización recibieron entradas.

**Criterio**

Para audio, priorizar la expresión española cuando conserva exactamente el significado financiero y evita pronunciación artificial.

### Caso F — high yield

**Original**

> El dato importante es que high yield tuvo salidas, mientras los bonos de mayor calidad y menor plazo recibían dinero.

**Speech text simulado**

> El dato importante es que los bonos de alto rendimiento tuvieron salidas, mientras los bonos de mayor calidad y menor plazo recibían dinero.

### Caso G — carry

**Original**

> Puede ser una búsqueda de carry con menos duración.

**Speech text simulado**

> Puede ser una búsqueda de rendimiento por carry con menor duración.

**Salvedad**

`carry` no debe sustituirse ciegamente. En una versión productiva requiere una entrada explícita del léxico financiero porque su traducción depende del contexto. Para esta simulación se conserva el concepto y se reduce el Spanglish de la oración.

---

## 3. Términos que conviene desarrollar, no traducir literalmente

### Caso H — Treasury

**Original**

> El Treasury a dos años subió hacia 4,36%.

**Speech text simulado**

> El bono del Tesoro estadounidense a dos años subió hacia cuatro coma treinta y seis por ciento.

### Caso I — beta

**Original**

> Eso significa que el mercado estaba reduciendo beta general, pero manteniendo convicción en la temática de IA.

**Speech text simulado**

> Eso significa que el mercado estaba reduciendo su exposición general al mercado, pero manteniendo convicción en la temática de inteligencia artificial.

**Salvedad**

Esta sustitución cambia la superficie lingüística más que una simple pronunciación. Solo debe activarse si el contrato editorial acepta esta equivalencia en audio. Si `beta` se usa en sentido cuantitativo estricto, debe mantenerse como término técnico y tratarse por pronunciación.

---

## 4. Nombres propios y expresiones inglesas

Estos casos NO deben resolverse con traducción automática.

### Caso J — Nvidia / Jackson Hole / Warsh

**Original**

> Antes de Nvidia y Jackson Hole, los inversionistas ya estaban reduciendo exposición a acciones estadounidenses.

> El viernes Nvidia cayó 4,6% después del discurso de Warsh.

**Speech text de primera simulación conservadora**

> Antes de Nvidia y Jackson Hole, los inversionistas ya estaban reduciendo exposición a acciones estadounidenses.

> El viernes Nvidia cayó cuatro coma seis por ciento después del discurso de Warsh.

**Tratamiento propuesto**

- Mantener el nombre editorial.
- Aplicar pronunciación controlada únicamente en la capa TTS.
- No fijar todavía una grafía fonética en producción sin escuchar una muestra Kokoro por término.
- Si la fonetización española resulta insuficiente, evaluar segmentación bilingüe solo para nombres propios.

---

## 5. Fragmento completo — simulación Mercados

### Original

> Los fondos globales de bonos recibieron más de 10.000 millones de dólares y los fondos de corto plazo captaron unos 6.290 millones, el mayor ingreso en siete semanas. En Estados Unidos, gobierno y Treasury de plazo corto a intermedio recibieron alrededor de 3.300 millones.

### Speech text simulado

> Los fondos globales de bonos recibieron más de diez mil millones de dólares y los fondos de corto plazo captaron unos seis mil doscientos noventa millones, el mayor ingreso en siete semanas. En Estados Unidos, los bonos de gobierno y del Tesoro estadounidense de plazo corto a intermedio recibieron alrededor de tres mil trescientos millones.

---

## 6. Fragmento completo — simulación Nacional

### Original

> Hay 184 mil personas que llevan doce meses o más buscando empleo y esa proporción se acerca al 20% de los desocupados. El tiempo promedio de búsqueda pasó desde alrededor de cuatro meses en 2014 a más de siete meses en 2026.

### Speech text simulado

> Hay ciento ochenta y cuatro mil personas que llevan doce meses o más buscando empleo y esa proporción se acerca al veinte por ciento de los desocupados. El tiempo promedio de búsqueda pasó desde alrededor de cuatro meses en dos mil catorce a más de siete meses en dos mil veintiséis.

---

## 7. Contrato mínimo propuesto para una implementación futura

1. El normalizador actúa solo sobre `speech_text`.
2. `display_text` y fuentes editoriales permanecen intactos.
3. Orden de normalización recomendado:
   - monedas y magnitudes;
   - porcentajes y decimales;
   - puntos base;
   - fechas/años cuando corresponda;
   - siglas;
   - léxico financiero explícitamente permitido;
   - nombres propios mediante diccionario de pronunciación.
4. Ninguna sustitución semántica ambigua se aplica sin regla explícita.
5. Cada regla crítica debe tener golden tests.
6. La versión del normalizador debe quedar registrada junto al artefacto de audio para reproducibilidad.
7. Esta simulación no autoriza aún cambios en el pipeline productivo.

## Resultado esperado

La mejora buscada no es cambiar la redacción de ATLAS NEWS, sino entregar a Kokoro una representación específicamente diseñada para habla. Los dos defectos observados —segmentación incorrecta de números y pronunciación deficiente de anglicismos— pueden resolverse en una misma capa previa a síntesis con impacto acotado y reversible.
