import fs from "node:fs/promises";

const file = process.argv[2] ?? "lab/editorial-memory-judge/bootstrap.json";

const allowedStatus = new Set([
  "BOOTSTRAP",
  "READY",
  "RUNNING",
  "PASS",
  "PASS_WITH_OBSERVATIONS",
  "FAIL",
  "BLOCKED",
]);

const eventLabels = new Set([
  "SAME_EVENT",
  "NEW_EVENT",
  "UNRELATED",
  "UNCERTAIN",
]);

const informationLabels = new Set([
  "NEW",
  "CONTINUATION",
  "MEANINGFUL_UPDATE",
  "REPETITION",
  "CONTRADICTION",
  "UNCERTAIN",
]);

const claimLabels = new Set([
  "SAME_FACT",
  "NEW_EVIDENCE",
  "MATERIAL_UPDATE",
  "CONTRADICTION",
  "UNRELATED",
  "UNCERTAIN",
]);

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function validConfidence(value) {
  return value === null || (typeof value === "number" && value >= 0 && value <= 1);
}

async function main() {
  const raw = await fs.readFile(file, "utf8");
  const data = JSON.parse(raw);
  const errors = [];

  assert(data.schemaVersion === 1, "schemaVersion debe ser 1", errors);
  assert(data.experimentId === "EXP-011", "experimentId debe ser EXP-011", errors);
  assert(data.mode === "LAB_ONLY", "mode debe ser LAB_ONLY", errors);
  assert(allowedStatus.has(data.status), "status no permitido", errors);
  assert(
    data.skill?.name === "atlas-editorial-memory" &&
      data.skill?.version === "0.2.0-candidate",
    "Skill baseline inválida",
    errors,
  );
  assert(Array.isArray(data.cases), "cases debe ser lista", errors);
  assert(data.metrics && typeof data.metrics === "object", "metrics obligatorio", errors);
  assert(Array.isArray(data.notes), "notes debe ser lista", errors);

  if (data.generatedAt !== null) {
    assert(
      typeof data.generatedAt === "string" &&
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
      typeof data.run?.sourceCommit === "string" &&
        /^[0-9a-f]{40}$/.test(data.run.sourceCommit),
      "run.sourceCommit debe ser SHA completo",
      errors,
    );
    assert(
      typeof data.run?.inputGeneratedAt === "string" &&
        !Number.isNaN(Date.parse(data.run.inputGeneratedAt)),
      "run.inputGeneratedAt inválido",
      errors,
    );
    assert(data.run?.productionWrites === 0, "productionWrites debe ser 0", errors);

    assert(
      data.experimental?.judge === "CHATGPT_SEMANTIC_LAB_V1",
      "experimental.judge no autorizado",
      errors,
    );
    assert(
      data.experimental?.contractVersion === "0.2",
      "contractVersion debe ser 0.2",
      errors,
    );
    assert(
      data.experimental?.confidencePolicy === "UNSCORED_NO_AUTOMATIC_ACTION",
      "confidencePolicy debe permanecer UNSCORED",
      errors,
    );
    assert(
      data.experimental?.thresholdsApplied === false,
      "thresholdsApplied debe ser false",
      errors,
    );
    assert(
      data.experimental?.lineageAssigned === false,
      "lineageAssigned debe ser false",
      errors,
    );
    assert(
      data.experimental?.canonicalMemoryWritten === false,
      "canonicalMemoryWritten debe ser false",
      errors,
    );
    assert(
      data.experimental?.productionWrites === 0,
      "experimental.productionWrites debe ser 0",
      errors,
    );
    assert(
      data.metrics?.processingMs === null,
      "processingMs debe ser null mientras no exista medición autorizada",
      errors,
    );
    assert(
      data.metrics?.candidates === data.cases.length,
      "metrics.candidates debe coincidir con cases",
      errors,
    );

    for (const [index, item] of data.cases.entries()) {
      const prefix = `cases[${index}]`;
      assert(
        typeof item.candidateId === "string" &&
          /^CAND-[0-9a-f]{16}$/.test(item.candidateId),
        `${prefix}: candidateId inválido`,
        errors,
      );
      assert(
        ["general", "national", "markets"].includes(item.section),
        `${prefix}: section inválida`,
        errors,
      );
      assert(
        item.policyAction === "HOLD_FOR_HUMAN_REVIEW",
        `${prefix}: policyAction debe ser HOLD_FOR_HUMAN_REVIEW`,
        errors,
      );
      assert(
        eventLabels.has(item.semantic?.eventRelation),
        `${prefix}: eventRelation inválida`,
        errors,
      );
      assert(
        informationLabels.has(item.semantic?.informationRelation),
        `${prefix}: informationRelation inválida`,
        errors,
      );
      assert(
        item.semantic?.proposedLineageId === null,
        `${prefix}: proposedLineageId debe ser null`,
        errors,
      );
      assert(
        validConfidence(item.semantic?.confidence),
        `${prefix}: confidence inválida`,
        errors,
      );
      assert(
        validConfidence(item.semantic?.informationConfidence),
        `${prefix}: informationConfidence inválida`,
        errors,
      );
      assert(
        validConfidence(item.semantic?.confidenceSummary),
        `${prefix}: confidenceSummary inválida`,
        errors,
      );

      if (data.experimental?.confidencePolicy === "UNSCORED_NO_AUTOMATIC_ACTION") {
        assert(
          item.semantic?.confidence === null &&
            item.semantic?.informationConfidence === null &&
            item.semantic?.confidenceSummary === null,
          `${prefix}: modo UNSCORED exige confidencias null`,
          errors,
        );
      }

      assert(
        Array.isArray(item.semantic?.claimRelations),
        `${prefix}: claimRelations debe ser lista`,
        errors,
      );
      for (const [claimIndex, claim] of (
        item.semantic?.claimRelations ?? []
      ).entries()) {
        assert(
          claimLabels.has(claim?.label),
          `${prefix}.claimRelations[${claimIndex}]: label inválido`,
          errors,
        );
        assert(
          validConfidence(claim?.confidence),
          `${prefix}.claimRelations[${claimIndex}]: confidence inválida`,
          errors,
        );
        if (
          data.experimental?.confidencePolicy ===
          "UNSCORED_NO_AUTOMATIC_ACTION"
        ) {
          assert(
            claim?.confidence === null,
            `${prefix}.claimRelations[${claimIndex}]: confidence debe ser null`,
            errors,
          );
        }
      }

      for (const field of [
        "addsNewInformation",
        "historicalContextNeeded",
        "angleRepeated",
      ]) {
        const value = item.semantic?.[field];
        assert(
          value &&
            (typeof value.value === "boolean" || value.value === null) &&
            validConfidence(value.confidence),
          `${prefix}: ${field} inválido`,
          errors,
        );
        if (
          data.experimental?.confidencePolicy ===
          "UNSCORED_NO_AUTOMATIC_ACTION"
        ) {
          assert(
            value?.confidence === null,
            `${prefix}: ${field}.confidence debe ser null`,
            errors,
          );
        }
      }

      assert(
        Array.isArray(item.evidenceRefs),
        `${prefix}: evidenceRefs debe ser lista`,
        errors,
      );
    }
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
