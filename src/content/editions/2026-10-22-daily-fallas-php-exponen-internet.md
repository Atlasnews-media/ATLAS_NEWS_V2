---
title: "Dos fallas críticas en PHP exponen una capa invisible de internet"
summary: "Vulnerabilidades de ejecución remota obligan a actualizar servidores en todo el mundo mientras los intentos de explotación escalan a millones."
publishedAt: "2026-10-22T06:06:29-03:00"
cutoffAt: "2026-10-22T06:05:18-03:00"
type: "daily"
editionSlot: "morning"
status: "draft"
tags:
  - ciberseguridad
  - infraestructura-digital
  - tecnologia
  - riesgo-operacional
sources:
  - name: "PHP — Actualizaciones de seguridad del 21 de octubre de 2026"
    url: "https://www.php.net/archive/2026.php#2026-10-21-1"
  - name: "GitHub Advisory — CVE-2026-109618"
    url: "https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w"
  - name: "GitHub Advisory — CVE-2026-109619"
    url: "https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp"
  - name: "Reuters — La explotación de las fallas PHP escala a millones de intentos"
    url: "https://www.reuters.com/world/asia-pacific/cloudflare-sees-millions-exploit-attempts-after-php-disclosure-2026-10-22/"
featured: false
demo: false
highlights:
  - label: "Dos fallas permiten tomar servidores PHP sin autenticación"
    text: "Los defectos CVE-2026-109618 y CVE-2026-109619 permiten ejecutar código de forma remota antes de que una aplicación procese la solicitud."
  - label: "Los intentos de explotación escalaron a millones"
    text: "Cloudflare observó actividad antes de la divulgación y un salto desde decenas de miles de intentos en minutos hasta millones tras el aviso."
  - label: "Actualizar es la única solución completa"
    text: "PHP publicó las versiones 8.5.12, 8.4.27, 8.3.36 y 8.2.35 y advirtió que las mitigaciones parciales no eliminan el riesgo."
  - label: "Gobiernos y bancos suspendieron servicios en línea"
    text: "Sitios públicos europeos y servicios de instituciones asiáticas fueron desconectados temporalmente mientras sus operadores revisaban sistemas."
  - label: "Las versiones sin soporte prolongan la exposición"
    text: "Instalaciones antiguas dependen de actualizaciones de proveedores o backports, lo que amplía la brecha entre divulgación y protección efectiva."
---

## Hecho central

Dos vulnerabilidades críticas en PHP, uno de los componentes más extendidos para operar sitios y aplicaciones web, abrieron una carrera mundial entre administradores y atacantes. Los defectos CVE-2026-109618 y CVE-2026-109619 permiten ejecutar código de forma remota sin autenticación. El proyecto PHP les asignó una severidad de 9,2 sobre 10 y advirtió que todas las instalaciones que atienden solicitudes web están expuestas, con el mayor riesgo en configuraciones `mod_php`, donde se demostró que el ataque puede ejecutarse antes de que intervenga la aplicación.

La explotación se aceleró alrededor de la divulgación coordinada del 21 de octubre. Cloudflare registró miles de intentos unas diez horas antes del anuncio, decenas de miles durante los primeros 45 minutos y cientos de miles dentro de las dos horas siguientes; el total ya alcanzaba millones el 22 de octubre. La actividad previa a la publicación oficial indica que parte del conocimiento técnico circuló antes de que una mayoría de operadores pudiera instalar las correcciones.

PHP publicó las versiones 8.5.12, 8.4.27, 8.3.36 y 8.2.35 y sostuvo que actualizar es la única solución completa. La urgencia trascendió al sector tecnológico: sitios gubernamentales europeos quedaron temporalmente fuera de línea, Mitsubishi UFJ Financial Group suspendió servicios de internet y el Ministerio de Finanzas japonés retiró contenido mientras revisaba su exposición; China y Corea del Sur también ordenaron inspecciones o emitieron alertas.

## En una mirada

- Dos fallas críticas permiten ejecutar código en servidores PHP sin autenticación.
- Los intentos de explotación escalaron a millones alrededor de la divulgación pública.
- PHP publicó cuatro versiones corregidas y afirma que actualizar es la única solución completa.
- Gobiernos y entidades financieras suspendieron servicios mientras revisaban sistemas.
- Las instalaciones antiguas o sin soporte enfrentan una ventana de exposición más larga.

## Por qué importa

PHP funciona como una capa invisible de una parte amplia de internet, por lo que una vulnerabilidad en el motor puede propagarse entre países y sectores sin depender de una sola empresa o proveedor de nube. La ejecución remota antes de que intervenga la aplicación reduce la utilidad de defensas construidas dentro del propio sitio y convierte la velocidad de actualización del servidor en el principal factor de protección. La explotación observada antes de la divulgación también comprime el tiempo disponible para responder y aumenta el riesgo de interrupciones preventivas, robo de datos y movimientos posteriores dentro de redes corporativas. El costo económico no se limita a reparar equipos comprometidos: incluye suspender servicios, auditar cadenas de proveedores y mantener sistemas heredados que ya no reciben soporte directo.

## Mercados globales

No se verificó una reacción global de precios atribuible de manera directa a las fallas. La señal relevante para General es operacional: bancos, gobiernos y empresas con servicios expuestos deben escoger entre mantenerlos disponibles durante la revisión o desconectarlos para reducir el riesgo de intrusión.

El episodio puede elevar gastos urgentes en seguridad, auditoría y continuidad operacional, especialmente entre organizaciones que dependen de versiones antiguas. La evaluación de acciones, flujos, seguros cibernéticos y posicionamiento sectorial pertenece a Mercados.

## Chile

El canal hacia Chile es la dependencia internacional de software, alojamiento y proveedores digitales que utilizan PHP. Una organización chilena puede recibir la vulnerabilidad a través de infraestructura propia o de terceros aunque el incidente se haya descubierto y explotado fuera del país. Esta investigación no identifica un ataque doméstico ni una suspensión local de servicios; la transmisión es el riesgo importado por una tecnología de uso global.

## Tasas, monedas y commodities

No hay un efecto directo y verificable sobre tasas, monedas o commodities en esta noticia. El impacto financiero inmediato opera por costos de respuesta, interrupciones y posible responsabilidad por datos comprometidos, no por un shock macroeconómico o de oferta física.

Si las intrusiones derivaran en interrupciones amplias de pagos, comercio electrónico o servicios públicos, el evento podría adquirir una dimensión macrofinanciera. Al cierre informativo, la evidencia disponible muestra una emergencia distribuida de ciberseguridad, no una dislocación cross-asset.

## Qué observar

La primera señal será la velocidad de adopción de las versiones corregidas y la aparición de indicadores públicos sobre servidores comprometidos. También importará si los intentos detectados se traducen en intrusiones confirmadas, robo de información o interrupciones prolongadas en gobiernos, bancos y grandes plataformas.

El riesgo persistirá más tiempo en PHP 8.1 y versiones anteriores, que ya no reciben soporte general, y en instalaciones sujetas a parches de distribuidores. PHP 8.2 llegará al fin de su soporte el 31 de diciembre de 2026, por lo que la respuesta inmediata deberá ir acompañada de migraciones si los operadores quieren evitar otra brecha de mantenimiento.
