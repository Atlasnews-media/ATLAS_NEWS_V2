const { loadChileCalendar } = await import("../src/lib/chile-calendar.ts");

const result = await loadChileCalendar(new Date());

console.log("[ATLAS CALENDAR CHILE]");
console.log(JSON.stringify(result, null, 2));

if (result.sources.ine !== "ok" || result.sources.bancoCentral !== "ok") {
  console.warn("Una fuente oficial chilena no respondió durante el probe.");
}

if (result.events.length === 0) {
  console.warn("El parser no recuperó eventos chilenos próximos.");
}
