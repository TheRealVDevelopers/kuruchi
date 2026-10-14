const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");
const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, "../../src/lib/shippingStages.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsForTest });
const { shippingStage, showroomShippingStage, SHIPPING_STAGES } = exportsForTest;
const { commonProductionTargets } = exportsForTest;
test("four public stages map legacy production and packing codes consistently", () => {
  assert.equal(SHIPPING_STAGES.length, 4);
  assert.equal(shippingStage("IN_PRODUCTION"), 0); assert.equal(shippingStage("PO_PLACED"), 0);
  assert.equal(shippingStage("QC_PENDING"), 1);
  for (const code of ["READY_TO_PACK", "PACKED", "DISPATCHED"]) assert.equal(shippingStage(code), 2);
  assert.equal(shippingStage("IN_TRANSIT"), 3); assert.equal(shippingStage("INSTALLED"), 4);
});
test("partial shipments do not make the whole showroom appear further along", () => {
  assert.equal(showroomShippingStage(["IN_TRANSIT", "IN_PRODUCTION"]), 0);
  assert.equal(showroomShippingStage(["IN_TRANSIT", "CANCELLED"]), 3);
  assert.equal(showroomShippingStage(["APPROVED", "IN_TRANSIT"]), -1);
  assert.equal(showroomShippingStage([]), -1);
});
test("bulk selection offers only a common legal next stage", () => {
  assert.equal(commonProductionTargets(Array(6).fill("APPROVED"))[0], "IN_PRODUCTION");
  assert.equal(commonProductionTargets(["IN_PRODUCTION", "PO_PLACED"])[0], "QC_PENDING");
  assert.equal(commonProductionTargets(["QC_PENDING", "QC_PENDING"])[0], "READY_TO_PACK");
  assert.equal(commonProductionTargets(["APPROVED", "QC_PENDING"]).length, 0);
  assert.equal(commonProductionTargets(["INSTALLED"]).length, 0);
  assert.equal(commonProductionTargets([]).length, 0);
});
