import { normalizeOdometerKm, parseOdometerJson } from "../src/lib/odometer-normalize.ts";

const cases = [
  [39815, 39815],
  ["39815", 39815],
  ["39815.6", 39815],
  [39815.6, 39815],
  [0, null],
  ["abc", null],
];

let failed = 0;
for (const [input, expected] of cases) {
  const result = normalizeOdometerKm(input);
  if (result !== expected) {
    console.error("FAIL", input, "expected", expected, "got", result);
    failed++;
  }
}

const jsonKm = parseOdometerJson('{"km":39815,"confidence":"high"}');
if (jsonKm?.km !== 39815 || jsonKm?.confidence !== "high") {
  console.error("FAIL parseOdometerJson", jsonKm);
  failed++;
}

const jsonDecimal = parseOdometerJson('{"km":39815.6}');
if (jsonDecimal?.km !== 39815) {
  console.error("FAIL parseOdometerJson decimal", jsonDecimal);
  failed++;
}

if (failed > 0) process.exit(1);
console.log("All normalize tests passed");
