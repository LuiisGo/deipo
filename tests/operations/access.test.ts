import test from "node:test";
import assert from "node:assert/strict";
import {
  createTrackerToken,
  trackerHash,
  validTrackerToken,
  readCustomerTracker,
} from "../../src/lib/deipo/customer-access";

test("256-bit customer access is random, URL safe and hash only at rest", () => {
  const tokens = new Set(Array.from({ length: 1000 }, createTrackerToken));
  assert.equal(tokens.size, 1000);
  for (const token of tokens) {
    assert.equal(validTrackerToken(token), true);
    assert.equal(Buffer.from(token, "base64url").length, 32);
    assert.match(trackerHash(token), /^[a-f0-9]{64}$/);
    assert.notEqual(trackerHash(token), token);
  }
});
test("order code and customer identifiers are never tracker authentication", async () => {
  for (const bad of [
    "D-8626F64A7F6F",
    "+50255551234",
    "person@example.test",
    "",
    "x".repeat(42),
    "x".repeat(44),
    "../order",
    "a".repeat(64),
  ]) {
    assert.equal(validTrackerToken(bad), false);
    assert.throws(() => trackerHash(bad));
    assert.equal(await readCustomerTracker(bad), null);
  }
});
