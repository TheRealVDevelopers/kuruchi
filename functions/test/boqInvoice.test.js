const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");

function compile(file) {
  return ts.transpileModule(fs.readFileSync(path.join(__dirname, "../../src", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}
function pure(file) { const exports = {}; vm.runInNewContext(compile(file), { exports, require: () => ({}) }); return exports; }
const money = pure("lib/money.ts");
const rules = pure("lib/rules.ts");
const actionSource = compile("data/actions.ts");
const admin = { role: "ADMIN", name: "Admin" };

function harness() {
  const db = {
    projects: [{ id: "p", name: "Showroom", clientId: "client", site: { city: "Bengaluru", address: "Site", state: "Karnataka", pincode: "560001" } }],
    items: Array.from({ length: 16 }, (_, index) => ({ id: "i" + index, projectId: "p", name: "Item " + index, status: "READY_TO_PACK", qty: 2, qtyReadyToPack: 2, qtyDispatched: 0, hsnCode: "9403", pricing: { finalPrice: 100 } })),
    crates: [], consignments: [], invoices: [], challans: [], notifications: [],
    clients: [{ id: "client", name: "Customer", gstin: "GST", billingAddress: "Address", state: "Karnataka" }],
    sellerProfile: { legalName: "Kurchi", gstin: "GST", pan: "PAN", address: "Address", state: "Karnataka", pincode: "560001" },
  };
  let counter = 0, writes = 0;
  const exports = {};
  vm.runInNewContext(actionSource, { exports, require: (name) => {
    if (name === "./store") return { db, nextId: (prefix) => `${prefix}-${++counter}`, nextDocNumber: (prefix) => `${prefix}/${++counter}`, NOW: new Date(), commit: () => { writes++; }, audit: () => {}, recomputeProject: () => {} };
    if (name === "@/lib/rules") return rules;
    if (name === "@/lib/money") return money;
    return {};
  } });
  return { db, api: exports, get writes() { return writes; } };
}

test("six checked ready items produce an invoice containing exactly those six", () => {
  const h = harness();
  const ids = h.db.items.slice(0, 6).map((item) => item.id);
  const unselected = JSON.stringify(h.db.items.slice(6));
  const [shipmentId] = h.api.requestSelectedBoqInvoice(admin, ids, "DIRECT_TRUCK", "BOQ-06");
  assert.deepEqual(Array.from(h.db.consignments[0].invoiceRequestItemIds), ids);
  assert.deepEqual(Array.from(h.db.crates[0].itemIds), ids);
  const invoice = h.api.createShipmentBillingPack({ role: "ACCOUNTS" }, shipmentId);
  assert.equal(invoice.lines.length, 6);
  assert.equal(invoice.taxableValue, 1200);
  assert.equal(JSON.stringify(h.db.items.slice(6)), unselected);
  assert.ok(h.db.items.slice(0, 6).every((item) => item.qtyInvoiced === 2));
});

test("an existing shipment invoices only its checked items", () => {
  const h = harness();
  h.api.createDispatchBatch(admin, { projectId: "p", crateCode: "ALL-16", allocations: h.db.items.map((item) => ({ itemId: item.id, qty: item.qty })) });
  const others = JSON.stringify(h.db.items.slice(2));
  const [shipmentId] = h.api.requestSelectedBoqInvoice(admin, ["i0", "i1"], "DIRECT_TRUCK");
  assert.equal(h.db.consignments.length, 1);
  const invoice = h.api.createShipmentBillingPack({ role: "ACCOUNTS" }, shipmentId);
  assert.equal(invoice.lines.length, 2);
  assert.equal(invoice.taxableValue, 400);
  assert.equal(JSON.stringify(h.db.items.slice(2)), others);
});

test("repeating the same invoice request creates no duplicate batch or notification", () => {
  const h = harness();
  h.api.requestSelectedBoqInvoice(admin, ["i0", "i0", "i1"], "DIRECT_TRUCK", "SELECTED");
  const saved = JSON.stringify(h.db), writes = h.writes;
  h.api.requestSelectedBoqInvoice(admin, ["i1", "i0"], "DIRECT_TRUCK");
  assert.equal(JSON.stringify(h.db), saved);
  assert.equal(h.writes, writes);
});

test("invalid, early-stage and mixed-project selections fail before any changes", () => {
  for (const prepare of [
    () => [],
    () => ["missing"],
    (h) => { h.db.items[1].status = "QC_PENDING"; return ["i0", "i1"]; },
    (h) => { h.db.items[1].projectId = "other"; return ["i0", "i1"]; },
    (h) => { h.db.items[1].qtyInvoiced = 1; return ["i0", "i1"]; },
    (h) => { h.db.items[1].replacementFor = "original"; return ["i0", "i1"]; },
  ]) {
    const h = harness(), ids = prepare(h), before = JSON.stringify(h.db);
    assert.throws(() => h.api.requestSelectedBoqInvoice(admin, ids, "DIRECT_TRUCK", "NEW"));
    assert.equal(JSON.stringify(h.db), before);
    assert.equal(h.writes, 0);
  }
});

test("non-admins cannot request an invoice and existing requests cannot be replaced", () => {
  const h = harness();
  for (const role of ["CLIENT", "INSTALLATION", "ACCOUNTS"]) assert.throws(() => h.api.requestSelectedBoqInvoice({ role }, ["i0"], "DIRECT_TRUCK", "NEW"), /Only Admin/);
  h.api.createDispatchBatch(admin, { projectId: "p", crateCode: "EXISTING", allocations: [{ itemId: "i0", qty: 2 }, { itemId: "i1", qty: 2 }] });
  h.api.requestSelectedBoqInvoice(admin, ["i0"], "DIRECT_TRUCK");
  const before = JSON.stringify(h.db);
  assert.throws(() => h.api.requestSelectedBoqInvoice(admin, ["i1"], "DIRECT_TRUCK"), /different invoice request/);
  assert.equal(JSON.stringify(h.db), before);
});

test("invoice option stays visible and enables only for checked ready-to-ship items", () => {
  const React = require("../../node_modules/react");
  const { renderToStaticMarkup } = require("../../node_modules/react-dom/server");
  const statuses = pure("lib/statuses.ts"), stages = pure("lib/shippingStages.ts");
  function render(status, role = "ADMIN", ids = ["i0"]) {
    const exports = {}; let hook = 0;
    vm.runInNewContext(compile("components/app/BoqItemBoard.tsx"), { exports, localStorage: { getItem: () => "list" }, require: (name) => {
      if (name === "react") return { ...React, useState: (initial) => { hook++; return React.useState(hook === 2 ? ids : hook === 3 ? role === "ADMIN" : initial); } };
      if (name === "react/jsx-runtime") return require("../../node_modules/react/jsx-runtime");
      if (name === "react-router-dom") return { Link: (props) => React.createElement("a", { href: props.to }, props.children) };
      if (name === "lucide-react") return { LayoutGrid: () => null, List: () => null, X: () => null };
      if (name === "@/lib/statuses") return statuses;
      if (name === "@/lib/shippingStages") return stages;
      if (name === "./StatusBadge") return { ItemStatusBadge: () => null };
      if (name === "./StatusControl") return { StatusControl: () => null };
      if (name === "@/data/repo") return { repo: { consignments: () => [], crates: () => [] } };
      return {};
    } });
    return renderToStaticMarkup(React.createElement(exports.BoqItemBoard, { items: [{ id: "i0", projectId: "p", name: "Selected chair", qty: 2, status }], user: { role }, editable: true }));
  }
  const invoiceButton = (html) => html.match(/<button\b[^>]*>Invoice selected items<\/button>/)?.[0];
  assert.doesNotMatch(invoiceButton(render("READY_TO_PACK")), /\sdisabled=/);
  assert.doesNotMatch(invoiceButton(render("PACKED")), /\sdisabled=/);
  assert.match(invoiceButton(render("QC_PENDING")), /\sdisabled=/);
  assert.match(invoiceButton(render("IN_TRANSIT")), /\sdisabled=/);
  assert.doesNotMatch(render("READY_TO_PACK", "CLIENT"), /Invoice selected items/);
  const unselected = render("READY_TO_PACK", "ADMIN", []);
  assert.match(invoiceButton(unselected), /\sdisabled=/);
  assert.match(unselected, /Check the ready-to-ship items/);
});

test("Update item offers an invoice after Ready to ship and before transit", () => {
  const React = require("../../node_modules/react");
  const { renderToStaticMarkup } = require("../../node_modules/react-dom/server");
  const statuses = pure("lib/statuses.ts"), stages = pure("lib/shippingStages.ts");
  function render(status, role = "ADMIN") {
    const exports = {}; let hook = 0;
    vm.runInNewContext(compile("components/app/StatusControl.tsx"), { exports, require: (name) => {
      if (name === "react") return { ...React, useState: (initial) => { hook++; return React.useState(hook === 1 ? true : initial); } };
      if (name === "react/jsx-runtime") return require("../../node_modules/react/jsx-runtime");
      if (name === "react-router-dom") return { Link: (props) => React.createElement("a", { href: props.to }, props.children) };
      if (name === "lucide-react") return { Check: () => null, ChevronRight: () => null, X: () => null };
      if (name === "@/lib/statuses") return statuses;
      if (name === "@/lib/shippingStages") return stages;
      if (name === "./StatusBadge") return { ItemStatusBadge: () => null };
      if (name === "@/lib/useAction") return { useAction: () => () => true };
      if (name === "@/lib/utils") return { cn: (...values) => values.filter(Boolean).join(" ") };
      if (name === "@/data/repo") return { repo: { consignments: () => [] } };
      return {};
    } });
    return renderToStaticMarkup(React.createElement(exports.StatusControl, { item: { id: "i0", projectId: "p", name: "Storage", qty: 1, unit: "nos", status }, user: { role } }));
  }
  const ready = render("READY_TO_PACK");
  assert.match(ready, /Invoice this item/);
  assert.ok(ready.indexOf("Invoice this item") < ready.indexOf("Prepare shipment to start In transit"));
  assert.match(render("PACKED"), /Invoice this item/);
  assert.doesNotMatch(render("QC_PENDING"), /Invoice this item/);
  assert.doesNotMatch(render("READY_TO_PACK", "CLIENT"), /Invoice this item/);
});
