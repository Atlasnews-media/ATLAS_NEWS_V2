import fs from "node:fs/promises";

const file =
  process.argv[2] ?? "artifacts/editorial-memory-input/input.json";

const allowedSourceRefs = new Set(["main", "PR_VALIDATION"]);

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function daysBetween(olderDate, newerDate) {
  return Math.round(
    (Date.parse(`${newerDate}T00:00:00Z`) -
      Date.parse(`${olderDate}T00:00:00Z`)) /
      86_400_000,
  );
}

function validatePublishedItem(item, kind, errors) {
  assert(item && typeof item === "object", `${kind}: objeto obligatorio`, errors);
  if (!item || typeof item !== "object") return;

  assert(
    typeof item.candidate_id === "string" &&
      /^CAND-[0-9a-f]{16}$/.test(item.candidate_id),
    `${kind}: candidate_id inválido`,
    errors,
  );
  assert(item.lineage_id === null, `${kind}: lineage_id debe ser null`, errors);
  assert(
    typeof item.editorial_date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(item.editorial_date),
    `${kind}: editorial_date inválida`,
    errors,
  );
  assert(
    ["general", "national", "markets"].includes(item.section),
    `${kind}: sección inválida`,
    errors,
  );
  assert(
    item.publication_state === "published",
    `${kind}: publication_state debe ser published`,
    errors,
  );
  assert(
    typeof item.published_title === "string" && item.published_title.length > 0,
    `${kind}: título obligatorio`,
    errors,
  );
  assert(
    typeof item.published_summary === "string" &&
      item.published_summary.length > 0,
    `${kind}: summary obligatorio`,
    errors,
  );
  assert(
    typeof item.record_ref === "string" &&
      (item.record_ref.startsWith("src/content/editions/") ||
        item.record_ref.startsWith("src/content/briefings/")),
    `${kind}: record_ref fuera de contenido editorial`,
    errors,
  );
  assert(Array.isArray(item.tags), `${kind}: tags debe ser lista`, errors);
  assert(
    Array.isArray(item.sources) && item.sources.length > 0,
    `${kind}: requiere al menos una fuente`,
    errors,
  );
  if (Array.isArray(item.sources)) {
    for (const source of item.sources) {
      assert(
        typeof source?.name === "string" &&
          source.name.length > 0 &&
          typeof source?.url === "string" &&
          /^https:\/\//.test(source.url),
        `${kind}: fuente inválida`,
        errors,
      );
    }
  }
  assert(
    Array.isArray(item.claims) && item.claims.length > 0,
    `${kind}: claims no puede estar vacío`,
    errors,
  );
  if (Array.isArray(item.claims)) {
    for (const claim of item.claims) {
      assert(
        typeof claim?.claim_id === "string" && claim.claim_id.length > 0,
        `${kind}: claim_id obligatorio`,
        errors,
      );
      assert(
        typeof claim?.statement === "string" && claim.statement.length > 0,
        `${kind}: statement de claim obligatorio`,
        errors,
      );
      assert(
        Array.isArray(claim?.sources) && claim.sources.length > 0,
        `${kind}: cada claim requiere fuentes`,
        errors,
      );
    }
  }
  assert(
    typeof item.content_hash_sha256 === "string" &&
      /^[0-9a-f]{64}$/.test(item.content_hash_sha256),
    `${kind}: hash SHA-256 inválido`,
    errors,
  );
}

async function main() {
  const raw = await fs.readFile(file, "utf8");
  const data = JSON.parse(raw);
  const errors = [];

  assert(data.schema_version === 1, "schema_version debe ser 1", errors);
  assert(data.experiment_id === "EXP-011", "experiment_id inválido", errors);
  assert(data.mode === "LAB_ONLY", "mode debe ser LAB_ONLY", errors);
  assert(
    typeof data.generated_at === "string" &&
      !Number.isNaN(Date.parse(data.generated_at)),
    "generated_at debe ser ISO-8601",
    errors,
  );

  assert(
    data.source?.repository === "Atlasnews-media/ATLAS_NEWS_V2",
    "source.repository inválido",
    errors,
  );
  assert(
    allowedSourceRefs.has(data.source?.source_ref),
    "source.source_ref no permitido",
    errors,
  );
  assert(
    typeof data.source?.source_commit === "string" &&
      /^[0-9a-f]{40}$/.test(data.source.source_commit),
    "source.source_commit debe ser SHA completo",
    errors,
  );
  assert(
    typeof data.source?.editorial_date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(data.source.editorial_date),
    "source.editorial_date inválida",
    errors,
  );

  assert(
    data.skill_snapshot?.name === "atlas-editorial-memory" &&
      data.skill_snapshot?.version === "0.2.0-candidate" &&
      data.skill_snapshot?.drive_folder_id ===
        "1oZLcsmCwPV0KapLAHbaGuUoDfodUGUky",
    "snapshot de Skill 003 no coincide con baseline congelada",
    errors,
  );

  assert(
    data.safety?.production_writes_allowed === false,
    "production_writes_allowed debe ser false",
    errors,
  );
  assert(
    data.safety?.production_branch_writes_allowed === false,
    "production_branch_writes_allowed debe ser false",
    errors,
  );
  assert(
    data.safety?.morning_package_writes_allowed === false,
    "morning_package_writes_allowed debe ser false",
    errors,
  );
  assert(
    data.safety?.canonical_memory_writes_allowed === false,
    "canonical_memory_writes_allowed debe ser false",
    errors,
  );
  assert(
    data.safety?.producer_public_write_target ===
      "Atlasnews-media/Atlasnews-media.github.io:lab/editorial-memory-judge/input.json",
    "producer_public_write_target inválido",
    errors,
  );
  assert(
    data.safety?.judge_public_write_target ===
      "Atlasnews-media/Atlasnews-media.github.io:lab/editorial-memory-judge/latest.json",
    "judge_public_write_target inválido",
    errors,
  );

  const forbidden = data.safety?.forbidden_paths ?? [];
  for (const required of [
    "src/content/editions/**",
    "src/content/briefings/**",
    "data/editorial_state.json",
    ".github/workflows/publish-site.yml",
  ]) {
    assert(forbidden.includes(required), `falta forbidden_path: ${required}`, errors);
  }

  assert(
    Array.isArray(data.questions) && data.questions.length === 7,
    "questions debe contener exactamente 7 juicios",
    errors,
  );

  assert(
    Array.isArray(data.candidates) &&
      data.candidates.length >= 1 &&
      data.candidates.length <= 3,
    "candidates debe contener entre 1 y 3 piezas",
    errors,
  );

  const candidateIds = new Set();
  const candidateSections = new Set();
  for (const [index, candidate] of (data.candidates ?? []).entries()) {
    validatePublishedItem(candidate, `candidate[${index}]`, errors);
    assert(
      candidate.editorial_date === data.source?.editorial_date,
      `candidate[${index}]: fecha no coincide con source`,
      errors,
    );
    assert(
      !candidateIds.has(candidate.candidate_id),
      `candidate[${index}]: candidate_id duplicado`,
      errors,
    );
    assert(
      !candidateSections.has(candidate.section),
      `candidate[${index}]: sección duplicada`,
      errors,
    );
    candidateIds.add(candidate.candidate_id);
    candidateSections.add(candidate.section);
  }

  assert(
    Array.isArray(data.retrieval) &&
      data.retrieval.length === (data.candidates?.length ?? -1),
    "retrieval debe tener una entrada por candidato",
    errors,
  );

  for (const [index, retrieval] of (data.retrieval ?? []).entries()) {
    assert(
      candidateIds.has(retrieval.candidate_id),
      `retrieval[${index}]: candidate_id no existe`,
      errors,
    );
    assert(
      retrieval.retrieval_config?.short_memory_days === 5 &&
        retrieval.retrieval_config?.comparison_pool_days === 10,
      `retrieval[${index}]: ventanas deben ser 5/10`,
      errors,
    );
    assert(
      retrieval.retrieval_config?.strategy ===
        "FULL_COMPARISON_POOL_RECALL_FIRST",
      `retrieval[${index}]: estrategia inesperada`,
      errors,
    );
    assert(
      Array.isArray(retrieval.retrieved_prior_items),
      `retrieval[${index}]: antecedentes debe ser lista`,
      errors,
    );

    const refs = new Set();
    for (const [priorIndex, prior] of (
      retrieval.retrieved_prior_items ?? []
    ).entries()) {
      validatePublishedItem(
        prior,
        `retrieval[${index}].prior[${priorIndex}]`,
        errors,
      );
      const age = daysBetween(
        prior.editorial_date,
        data.source?.editorial_date,
      );
      assert(
        age >= 1 && age < 10,
        `retrieval[${index}].prior[${priorIndex}]: antecedente fuera de ventana`,
        errors,
      );
      assert(
        !refs.has(prior.record_ref),
        `retrieval[${index}].prior[${priorIndex}]: record_ref duplicado`,
        errors,
      );
      refs.add(prior.record_ref);
    }
  }

  assert(
    data.control?.engine === "scripts/editorial-shadow-audit.mjs" &&
      data.control?.mode === "shadow" &&
      data.control?.blocking === false,
    "control Shadow inválido o bloqueante",
    errors,
  );
  assert(
    Array.isArray(data.control?.candidate_results) &&
      data.control.candidate_results.length ===
        (data.candidates?.length ?? -1),
    "control.candidate_results debe cubrir todos los candidatos",
    errors,
  );

  const serialized = JSON.stringify(data);
  for (const forbiddenToken of [
    '"production_writes_allowed":true',
    '"canonical_memory_writes_allowed":true',
    '"morning_package_writes_allowed":true',
  ]) {
    assert(
      !serialized.replaceAll(" ", "").includes(forbiddenToken),
      `se detectó permiso prohibido: ${forbiddenToken}`,
      errors,
    );
  }

  if (errors.length) {
    console.error("EXP-011 INPUT INVALID");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `EXP-011 INPUT VALID — ${data.candidates.length} candidatos · ${data.source.editorial_date} · ${data.source.source_commit.slice(0, 7)}`,
  );
}

main().catch((error) => {
  console.error("EXP-011 INPUT INVALID");
  console.error(error.message);
  process.exit(1);
});
