---
title: "Chile abre consulta para exigir autenticación multifactor en servicios esenciales"
summary: "La ANCI propuso MFA obligatoria, registros de acceso y controles reforzados para servicios esenciales y operadores vitales; el diseño reduce el riesgo de credenciales robadas, pero exige adaptación tecnológica y presupuestaria."
publishedAt: "2026-11-20T06:17:00-03:00"
cutoffAt: "2026-11-20T06:16:00-03:00"
section: "national"
editionSlot: "morning"
status: "draft"
tags:
  - chile
  - ciberseguridad
  - regulacion
  - servicios-esenciales
sources:
  - name: "ANCI — Comienza consulta pública sobre MFA, 19 de noviembre de 2026"
    url: "https://anci.gob.cl/noticias/consulta-publica-primera-normativa-anci-2fa/"
    publishedAt: "2026-11-19T16:33:00-03:00"
  - name: "ANCI — Propuesta de Estándar N°1 de autenticación multifactor"
    url: "https://anci.gob.cl/documents/5200/Estandar_1_20261105.pdf"
    publishedAt: "2026-11-19T00:00:00-03:00"
  - name: "Diario Oficial — Resolución exenta N°290 de la ANCI"
    url: "https://www.diariooficial.interior.gob.cl/publicaciones/2026/11/19/44603/01/2901817.pdf"
    publishedAt: "2026-11-19T00:00:00-03:00"
  - name: "Biblioteca del Congreso Nacional — Ley N°21.663 Marco de Ciberseguridad"
    url: "https://www.bcn.cl/leychile/navegar?i=1202434"
highlights:
  - label: "Alcance amplio"
    text: "La propuesta cubre servicios esenciales y operadores vitales, desde banca y energía hasta salud, transporte y telecomunicaciones."
  - label: "Plazos graduales"
    text: "El borrador prioriza cuentas administrativas y accesos remotos, antes de extender MFA al resto de los usuarios."
  - label: "Excepciones acotadas"
    text: "Sistemas heredados, clínicos o industriales pueden obtener más tiempo, pero deben documentar riesgos y controles compensatorios."
demo: false
---

## Desarrollo

La Agencia Nacional de Ciberseguridad abrió el 19 de noviembre una consulta de 30 días sobre su primer estándar de cumplimiento: una propuesta que exige autenticación multifactor, o MFA, a las instituciones que prestan servicios esenciales y a los operadores de importancia vital. El cambio relevante no es una nueva recomendación voluntaria, sino la definición del parámetro con que la autoridad pretende convertir los deberes generales de la Ley Marco de Ciberseguridad en controles verificables. Mientras la consulta esté abierta, el texto es una propuesta y sus plazos todavía no corren.

El borrador responde a un riesgo observado. La ANCI señala que al menos 55% de los incidentes de efecto significativo reportados desde marzo de 2025 se originó en accesos no autorizados que utilizaron credenciales válidas obtenidas mediante phishing, infostealers, fuerza bruta u otras técnicas. Por eso prioriza las cuentas con privilegios administrativos y los accesos remotos: propone que ambos incorporen MFA dentro de 30 días desde la eventual publicación del estándar definitivo. Para las demás cuentas de usuario final plantea 90 días, y hasta 180 días para ciertos sistemas internos heredados, clínicos o industriales que acrediten condiciones especiales.

La obligación propuesta incluye sistemas institucionales, servicios en la nube y consolas de administración accesibles desde internet. También exige proteger los accesos a tecnologías operacionales mediante puntos de entrada controlados, conservar registros de autenticación por al menos 12 meses y cerrar vías alternativas que permitan eludir el segundo factor. Las cuentas destinadas exclusivamente a comunicaciones automatizadas entre máquinas quedan fuera de la definición de usuario final.

El alcance económico es amplio porque la Ley N°21.663 comprende actividades como banca y medios de pago, electricidad, combustibles, agua, telecomunicaciones, infraestructura digital, transporte, seguridad social, salud y producción farmacéutica. Además, la ANCI informó en julio que el primer proceso de calificación ya sumaba 1.154 operadores de importancia vital. No todas las instituciones enfrentarán la misma brecha tecnológica, pero el estándar busca un piso común para servicios cuya interrupción puede afectar continuidad operacional y confianza pública.

## Implicancias y riesgos

Para directorios y administraciones superiores, la propuesta desplaza MFA desde una decisión técnica hacia una obligación de gobierno corporativo. El texto exige identificar quién supervisa el cumplimiento, quién coordina la implementación y cómo se documentan y corrigen las brechas. Esa trazabilidad eleva el costo de ignorar sistemas antiguos, proveedores sin controles suficientes o cuentas con privilegios excesivos.

La carga de implementación será desigual. Plataformas modernas suelen ofrecer MFA, proveedores de identidad y registros centralizados; sistemas heredados, clínicos o industriales pueden requerir integraciones, licencias y cambios operacionales. El borrador reconoce esa diferencia, pero no acepta el costo o la ausencia de MFA nativo como excusa automática. Para obtener más tiempo, la institución tendría que acreditar impedimentos objetivos, evaluar alternativas y mantener medidas compensatorias como segmentación de redes, privilegios mínimos, límites a intentos automatizados y revisión de registros.

La lectura económica no es que toda inversión digital aumentará de inmediato. Sí cambia la jerarquía: accesos remotos, cuentas administrativas y proveedores externos pasarían al frente del presupuesto de ciberseguridad. Si la norma final conserva ese diseño, podría acelerar demanda por gestión de identidades, llaves físicas, monitoreo y modernización de sistemas. También puede exponer costos que hasta ahora estaban diferidos, sobre todo en organizaciones con tecnología operacional o aplicaciones críticas antiguas.

El beneficio esperado es reducir una vía frecuente y relativamente barata de ataque. Sin embargo, MFA no elimina el riesgo por sí solo: sesiones robadas, recuperación insegura de cuentas, ingeniería social y accesos alternativos pueden mantener vulnerabilidades. Por eso la propuesta combina el segundo factor con revocación de sesiones, detección de actividad anómala y registros. La condición que debilitaría esta lectura sería una versión final con alcance mucho menor o plazos sustancialmente más amplios; la reforzaría una aprobación cercana al texto consultado y una fiscalización consistente.

## Qué observar

El primer punto es el resultado de la consulta pública y los cambios entre el borrador y el estándar definitivo. Importa verificar si se mantienen los plazos de 30, 90 y 180 días, qué mecanismos de autenticación serán aceptados y cómo se evaluarán las extensiones para sistemas heredados, clínicos e industriales.

El segundo es la ejecución sectorial. Bancos, utilities, telecomunicaciones, salud, transporte y proveedores tecnológicos parten con arquitecturas y reguladores distintos. La señal útil será si las instituciones priorizan cuentas administrativas y accesos remotos sin interrumpir servicios, y si los terceros que ingresan a redes críticas pueden cumplir el mismo estándar.

Finalmente, habrá que observar si la ANCI publica criterios de supervisión y evidencia de reducción de incidentes por credenciales comprometidas. Una caída de esos accesos no autorizados confirmaría la eficacia del instrumento; un desplazamiento hacia recuperación de cuentas, robo de sesiones o proveedores débiles obligaría a reforzar controles adicionales.
