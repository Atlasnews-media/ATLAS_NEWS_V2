import fs from "node:fs/promises";

const file = process.argv[2] ?? "lab/editorial-memory-judge/latest.json";

const allowedStatus = new Set([
  "BOOTSTRAP",
  "READY",
  "RUNNING",
  "PASS",
  "PASS_WITH_OBSERVATIONS",
  "FAIL",
  "BLOCKED",
]);

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

async function main() {
  const raw = await fs.readFile(file, "utf8");
  const data = JSON.parse(raw);
  const errors = [];

  assert(data.schemaVersion === 1, "schemaVersion debe ser 1", errors);
  assert(
    data.experimentId === "EXP-011",
    "experimentId debe ser EXP-011",
    errors,
  );
  assert(data.mode === "LAB_ONLY", "mode debe ser LAB_ONLY", errors);
  assert(allowedStatus.has(data.status), "status no permitido", errors);
  assert(
    data.skill?.name === "atlas-editorial-memory",
    "skill.name inválido",
    errors,
  );
  assert(
    typeof data.skill?.version === "string" && data.skill.version.length > 0,
    "skill.version obligatorio",
    errors,
  );
  assert(Array.isArray(data.cases), "cases debe ser lista", errors);
  assert(
    data.metrics && typeof data.metrics === "object",
    "metrics obligatorio",
    errors,
  );
  assert(Array.isArray(data.notes), "notes debe ser lista", errors);

  if (data.generatedAt !== null) {
    assert(
      !Number.isNaN(Date.parse(data.generatedAt)),
      "generatedAt debe ser ISO-8601 o null",
      errors,
    );
  }

  if (data.run !== null) {
    assert(
      typeof data.run?.runId === "string" && data.run.runId.length > 0,
      "run.runId obligatorio",
      errors,
    );
    assert(
      typeof data.run?.editorialDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(data.run.editorialDate),
      "run.editorialDate debe ser YYYY-MM-DD",
      errors,
    );
    assert(
      data.run?.productionWrites === 0,
      "productionWrites debe ser 0",
      errors,
    );
  }

  if (errors.length) {
    console.error("EXP-011 INVALID");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log("EXP-011 VALID");
}

main().catch((error) => {
  console.error("EXP-011 INVALID");
  console.error(error.message);
  process.exit(1);
});
