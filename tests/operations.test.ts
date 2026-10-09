import test from "node:test";
import assert from "node:assert/strict";
import {
  formatOpsTime,
  fulfillmentLabels,
  fulfillmentStatuses,
} from "../src/lib/deipo/operations";

test("operational times display Guatemala in 24-hour format across UTC date boundary", () => {
  assert.match(formatOpsTime("2026-10-06T01:00:00Z"), /0?5\/10.*19:00/);
  assert.match(formatOpsTime("2026-10-06T06:00:00Z"), /0?6\/10.*00:00/);
  assert.equal(formatOpsTime(null), "Sin horario");
});
test("every deterministic operational state has a Spanish label", () => {
  assert.equal(fulfillmentStatuses.length, 7);
  for (const state of fulfillmentStatuses) assert.ok(fulfillmentLabels[state]);
});
