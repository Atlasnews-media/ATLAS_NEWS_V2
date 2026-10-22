import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { validateJevRequest, executeJev, JEV_ENGINE, JEV_MODEL } from "./jev-core.mjs";
import { radarToCore, coreToRadar } from "./adapters/lab-radar-adapter.mjs";
import { toCoreRequest } from "./adapters/production-adapter.mjs";

const sourceCommit="0123456789abcdef0123456789abcdef01234567";
const candidate={candidateKey:"general:1",section:"general",title:"Candidate title",description:"A sufficiently detailed candidate description for deterministic contract testing.",historicalPriors:[{id:"prior-1",title:"Prior"}]};
const neutral={schemaVersion:1,requestId:"JEV-TEST-0001",consumer:"T1",sourceCommit,editorialDate:"2026-09-29",candidates:[candidate]};
assert.equal(validateJevRequest(neutral),neutral);
console.log("A CORE WITHOUT LAB CONTRACT: PASS");

for(const bad of [{...neutral,requestId:""},{...neutral,sourceCommit:"bad"},{...neutral,candidates:[]}]) assert.throws(()=>validateJevRequest(bad));
console.log("B INVALID REQUEST REJECTION: PASS");

const fakeClient={async runQuestions(){return {ok:true,status:200,latencyMs:1,attempts:1,payload:{model:"jev-latest",usage:{},answers:{
 event_relation:{choice:"NEW_EVENT",confidence:0.9,probabilities:{NEW_EVENT:0.9}},
 information_relation:{choice:"NEW",confidence:0.9,probabilities:{NEW:0.9}},
 adds_new_information:{noul:0.9,confidence:0.9},
 historical_context_needed:{noul:0.2,confidence:0.8},
 angle_repeated:{noul:0.1,confidence:0.9}
}},error:null}}};
const coreResult=await executeJev(neutral,{client:fakeClient});
assert.equal(coreResult.engine,JEV_ENGINE); assert.equal(coreResult.modelRequested,JEV_MODEL); assert.equal(coreResult.thresholdsApplied,false);
assert.equal(coreResult.requestId,neutral.requestId); assert.equal(coreResult.sourceCommit,sourceCommit); assert.equal(coreResult.judgments[0].candidateKey,candidate.candidateKey);
console.log("F IDENTITY E2E: PASS");

const radar={schemaVersion:1,radarRunId:"RADAR-JEV-TEST-0001",sourceMainCommit:sourceCommit,radarStateVersion:"radar-state-v1",editorialDate:"2026-09-29",experimentMode:"RADAR_JEV",mode:"LAB_ONLY",productionWritesAllowed:false,candidateReviews:[{...candidate,priors:candidate.historicalPriors}]};
delete radar.candidateReviews[0].historicalPriors;
const radarCore=radarToCore(radar); const radarProjection=coreToRadar(radar,await executeJev(radarCore,{client:fakeClient}));
assert.equal(radarProjection.mode,"LAB_ONLY"); assert.equal(radarProjection.engine,"JEV_TYPESAFE"); assert.equal(radarProjection.radarRunId,radar.radarRunId);
console.log("C LAB ADAPTER CONTRACT: PASS");

const production={adapter:"ATLAS_PRODUCTION_JEV_V1",requestId:"PROD-JEV-TEST-0001",consumer:"T1",sourceCommit,editorialDate:"2026-09-29",candidate};
const prodCore=toCoreRequest(production); const prodResult=await executeJev(prodCore,{client:fakeClient});
assert.equal(prodResult.consumer,"T1"); assert.equal(prodResult.engine,"JEV_TYPESAFE");
console.log("D PRODUCTION ADAPTER CONTRACT: PASS");

const coreFiles=["scripts/jev/jev-core.mjs","scripts/jev/typesafe-jev-client.mjs","scripts/jev/run-jev.mjs"];
for(const file of coreFiles){const s=await fs.readFile(file,"utf8"); for(const forbidden of ["LAB_ONLY","radar-ingress/editorial","lab/radar-editorial","productionWritesAllowed"]) assert.equal(s.includes(forbidden),false,`${file} contains ${forbidden}`);}
console.log("G/H CORE ISOLATION: PASS");

console.log("ARCHITECTURE CONTRACT TESTS: PASS");
