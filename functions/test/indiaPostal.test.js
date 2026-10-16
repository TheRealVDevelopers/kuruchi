const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");

function load(fetch) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, "../../src/lib/indiaPostal.ts"), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, fetch });
  return exports;
}
test("all 28 states and 8 union territories are selectable without duplicates", () => {
  const { INDIA_STATES, normalizePostalState } = load();
  assert.equal(INDIA_STATES.length, 36);
  assert.equal(new Set(INDIA_STATES).size, 36);
  for (const state of ["Ladakh", "Lakshadweep", "Arunachal Pradesh", "Sikkim", "Tripura", "Mizoram"]) assert.ok(INDIA_STATES.includes(state));
  assert.equal(normalizePostalState("Orissa"), "Odisha");
  assert.equal(normalizePostalState("Daman & Diu"), "Dadra and Nagar Haveli and Daman and Diu");
});
test("PIN lookup validates input, forwards cancellation and normalizes returned state", async () => {
  const signal = {};
  let calls = 0;
  const { lookupPinState } = load(async (url, options) => {
    calls++;
    assert.equal(url, "https://api.postalpincode.in/pincode/560001");
    assert.equal(options.signal, signal);
    return { ok: true, json: async () => [{ Status: "Success", PostOffice: [{ Pincode: "560001", State: "Karnataka" }] }] };
  });
  for (const pin of ["", "56000", "000000", "5600017", "abcdef"]) assert.equal(await lookupPinState(pin), undefined);
  assert.equal(calls, 0);
  assert.equal(await lookupPinState("560001", signal), "Karnataka");
});
test("unknown, mismatched or ambiguous PIN responses never guess a state", async () => {
  for (const offices of [[], [{ Pincode: "999999", State: "Karnataka" }], [{ Pincode: "560001", State: "Unknown" }], [{ Pincode: "560001", State: "Karnataka" }, { Pincode: "560001", State: "Kerala" }]]) {
    const { lookupPinState } = load(async () => ({ ok: true, json: async () => [{ Status: "Success", PostOffice: offices }] }));
    assert.equal(await lookupPinState("560001"), undefined);
  }
});
test("network errors are surfaced for the form's manual-selection fallback", async () => {
  const { lookupPinState } = load(async () => ({ ok: false }));
  await assert.rejects(lookupPinState("560001"), /unavailable/);
});
