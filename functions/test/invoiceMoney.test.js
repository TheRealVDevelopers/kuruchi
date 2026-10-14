const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");

function load(file) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../../src/lib", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: () => ({}) });
  return exports;
}
const { invoiceTax, roundMoney, formatINR } = load("money.ts");
const { taxMode } = load("rules.ts");

test("103 taxable retains paise and splits GST correctly", () => {
  const tax = invoiceTax(103, "CGST_SGST");
  assert.equal(tax.cgst, 9.27);
  assert.equal(tax.sgst, 9.27);
  assert.equal(tax.gst, 18.54);
  assert.equal(tax.total, 121.54);
});
test("interstate tax preserves decimal values", () => {
  const tax = invoiceTax(100.5, "IGST");
  assert.equal(tax.igst, 18.09);
  assert.equal(tax.total, 118.59);
  assert.equal(tax.cgst + tax.sgst, 0);
});
test("invoice total always equals rounded printed components", () => {
  for (const amount of [0, 0.03, 0.17, 103, 100.5, 12345.67, 999999.99]) {
    for (const mode of ["CGST_SGST", "IGST"]) {
      const tax = invoiceTax(amount, mode);
      assert.equal(tax.total, roundMoney(amount + tax.cgst + tax.sgst + tax.igst));
    }
  }
});
test("money displays paise and normalizes state whitespace", () => {
  assert.match(formatINR(121.54), /121\.54/);
  assert.equal(taxMode(" Karnataka ", "Karnataka "), "CGST_SGST");
  assert.equal(taxMode("Kerala", " Karnataka "), "IGST");
});
