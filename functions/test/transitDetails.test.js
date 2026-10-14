const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");
const source = fs.readFileSync(path.join(__dirname, "../../src/data/actions.ts"), "utf8");
const start = source.indexOf("export function startShipmentTransit(");
const end = source.indexOf("/* ------------------------------------------------------------------ site */", start);
function harness(blocked = false) {
  const shipment = { id: "s", projectId: "p", status: "READY", crateIds: [] };
  const exports = {}; let moved = 0;
  vm.runInNewContext(ts.transpileModule(source.slice(start, end), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, db: { consignments: [shipment], crates: [] }, RuleError: Error,
    requireProject: () => ({}), canDispatch: () => ({ ok: !blocked, reasons: ["Missing invoice"], blockedBy: ["DS-08"] }),
    dispatchConsignment: () => { moved++; shipment.status = "DISPATCHED"; },
    markInTransit: () => { moved++; shipment.status = "IN_TRANSIT"; },
  });
  return { shipment, api: exports, get moved() { return moved; } };
}
const admin = { role: "ADMIN" };
const direct = () => ({ deliveryMethod: "DIRECT_TRUCK", vehicleNo: "ka01ab1234", driverName: "Driver", driverPhone: "+919876543210", eta: new Date(Date.now() + 86400000).toISOString() });
test("direct truck requires driver details and a future ETA", () => {
  const h = harness();
  assert.throws(() => h.api.startShipmentTransit(admin, "s", { ...direct(), driverPhone: "" }), /driver/);
  assert.throws(() => h.api.startShipmentTransit(admin, "s", { ...direct(), eta: "2000-01-01" }), /future/);
  assert.equal(h.moved, 0); assert.equal(h.shipment.status, "READY");
});
test("Delhivery requires a valid AWB and never invents an ETA", () => {
  const h = harness(); assert.throws(() => h.api.startShipmentTransit(admin, "s", { deliveryMethod: "THIRD_PARTY_DELIVERY", awbNumber: "wrong" }), /AWB/);
  h.api.startShipmentTransit(admin, "s", { deliveryMethod: "THIRD_PARTY_DELIVERY", awbNumber: "123456789" });
  assert.equal(h.shipment.awbNumber, "123456789"); assert.equal(h.shipment.eta, undefined);
  assert.equal(h.shipment.status, "IN_TRANSIT");
});
test("missing dispatch documents block transit without changing transport details", () => {
  const h = harness(true); assert.throws(() => h.api.startShipmentTransit(admin, "s", direct()), /Missing invoice/);
  assert.equal(h.shipment.vehicleNo, undefined); assert.equal(h.moved, 0);
});
test("valid truck starts transit once; non-admin and repeat requests fail", () => {
  const h = harness(); assert.throws(() => h.api.startShipmentTransit({ role: "CLIENT" }, "s", direct()), /Only Admin/);
  h.api.startShipmentTransit(admin, "s", direct()); assert.equal(h.shipment.vehicleNo, "KA01AB1234"); assert.equal(h.shipment.etaSource, "MANUAL");
  assert.throws(() => h.api.startShipmentTransit(admin, "s", direct()), /not started transit/);
  assert.equal(h.moved, 2);
});
