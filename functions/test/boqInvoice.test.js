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
    projects: [{ id: "p", name: "Showroom", clientId: "client", retentionPct: 0, site: { city: "Bengaluru", address: "Site", state: "Karnataka", pincode: "560001" } }],
    items: Array.from({ length: 16 }, (_, index) => ({ id: "i" + index, projectId: "p", name: "Item " + index, status: "READY_TO_PACK", qty: 2, qtyReadyToPack: 2, qtyDispatched: 0, hsnCode: "9403", pricing: { finalPrice: 100 } })),
    crates: [], consignments: [], invoices: [], challans: [], creditNotes: [], notifications: [],
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

test("shipment invoices cannot bill the BOQ again after a full milestone invoice", () => {
  const h = harness(), accounts = { role: "ACCOUNTS" };
  h.api.issueInvoice(accounts, "p", { final: false, percent: 100, description: "Full BOQ" });
  const [shipmentId] = h.api.requestSelectedBoqInvoice(admin, ["i0"], "DIRECT_TRUCK", "DUPLICATE");
  assert.throws(() => h.api.createShipmentBillingPack(accounts, shipmentId), /more than the approved BOQ value/);
  assert.equal(h.db.invoices.length, 1);
  assert.equal(h.db.items[0].qtyInvoiced, undefined);
});

test("tax-inclusive credit notes free only their taxable share for further billing", () => {
  const h = harness(), accounts = { role: "ACCOUNTS" };
  const first = h.api.issueInvoice(accounts, "p", { final: false, percent: 100, description: "Full BOQ" });
  h.db.creditNotes.push({ invoiceId: first.id, amount: 118 });
  assert.throws(() => h.api.issueInvoice(accounts, "p", { final: false, percent: 101 / 3200 * 100, description: "Too much" }), /more than the approved BOQ value/);
  const replacement = h.api.issueInvoice(accounts, "p", { final: false, percent: 100 / 3200 * 100, description: "Correct remaining value" });
  assert.equal(replacement.taxableValue, 100);
  assert.equal(replacement.total, 118);
});

test("legacy packed crates retain their BOQ quantities when invoiced", () => {
  const h = harness();
  const shipmentId = h.api.createDispatchBatch(admin, { projectId: "p", crateCode: "LEGACY", allocations: [{ itemId: "i0", qty: 2 }] });
  delete h.db.crates[0].itemQuantities;
  const invoice = h.api.createShipmentBillingPack({ role: "ACCOUNTS" }, shipmentId);
  assert.equal(invoice.lines[0].qty, 2);
  assert.equal(invoice.taxableValue, 200);
});

test("a shipment cannot bill the same item quantity twice even if the BOQ has spare value", () => {
  const h = harness();
  const shipmentId = h.api.createDispatchBatch(admin, { projectId: "p", crateCode: "BILLED", allocations: [{ itemId: "i0", qty: 2 }] });
  h.db.items[0].qtyInvoiced = 2;
  assert.throws(() => h.api.createShipmentBillingPack({ role: "ACCOUNTS" }, shipmentId), /already been invoiced for this quantity/);
  assert.equal(h.db.invoices.length, 0);
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

test("vehicle and driver details are saved with only the selected shipment for either delivery method", () => {
  for (const method of ["DIRECT_TRUCK", "THIRD_PARTY_DELIVERY"]) {
    const h = harness();
    const others = JSON.stringify(h.db.items.slice(1));
    const [shipmentId] = h.api.requestSelectedBoqInvoice(admin, ["i0"], method, "VEHICLE", { vehicleNo: " ka01ab1234 ", driverName: " Driver One ", driverPhone: " +919876543210 " });
    const shipment = h.db.consignments.find((entry) => entry.id === shipmentId);
    assert.equal(shipment.vehicleNo, "KA01AB1234");
    assert.equal(shipment.driverName, "Driver One");
    assert.equal(shipment.driverPhone, "+919876543210");
    assert.equal(shipment.deliveryMethod, method);
    assert.deepEqual(Array.from(shipment.invoiceRequestItemIds), ["i0"]);
    assert.equal(JSON.stringify(h.db.items.slice(1)), others);
  }
});

test("missing vehicle, driver or invalid phone is rejected before packing or requesting an invoice", () => {
  const details = { vehicleNo: "KA01AB1234", driverName: "Driver", driverPhone: "9876543210" };
  for (const invalid of [{ vehicleNo: " " }, { driverName: " " }, { driverPhone: "123" }, { driverPhone: "not a number" }]) {
    const h = harness(), before = JSON.stringify(h.db);
    assert.throws(() => h.api.requestSelectedBoqInvoice(admin, ["i0"], "DIRECT_TRUCK", "INVALID", { ...details, ...invalid }), /vehicle number, driver name and a valid driver phone/);
    assert.equal(JSON.stringify(h.db), before);
    assert.equal(h.writes, 0);
  }
});

test("an existing matching invoice request saves changed transport details without sending a duplicate request", () => {
  const h = harness();
  const details = { vehicleNo: "KA01AB1234", driverName: "Driver", driverPhone: "9876543210" };
  h.api.requestSelectedBoqInvoice(admin, ["i0"], "DIRECT_TRUCK", "REPEAT", details);
  const notifications = h.db.notifications.length, writes = h.writes;
  h.api.requestSelectedBoqInvoice(admin, ["i0"], "DIRECT_TRUCK", "", { ...details, vehicleNo: "KA02CD1234" });
  assert.equal(h.db.consignments.length, 1);
  assert.equal(h.db.consignments[0].vehicleNo, "KA02CD1234");
  assert.equal(h.db.notifications.length, notifications);
  assert.equal(h.writes, writes + 1);
  h.api.requestSelectedBoqInvoice(admin, ["i0"], "DIRECT_TRUCK", "", { ...details, vehicleNo: "KA02CD1234" });
  assert.equal(h.writes, writes + 1);
});

test("invoice popup shows and prefills vehicle and driver fields for truck and partner delivery", () => {
  const React = require("../../node_modules/react");
  const { renderToStaticMarkup } = require("../../node_modules/react-dom/server");
  for (const method of ["DIRECT_TRUCK", "THIRD_PARTY_DELIVERY"]) {
    const exports = {};
    const shipment = { id: "s", deliveryMethod: method, vehicleNo: "KA01AB1234", driverName: "Driver One", driverPhone: "9876543210" };
    vm.runInNewContext(compile("components/app/BoqInvoiceDialog.tsx"), { exports, require: (name) => {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return require("../../node_modules/react/jsx-runtime");
      if (name === "@/data/repo") return { repo: { consignments: () => [shipment] } };
      return {};
    } });
    const html = renderToStaticMarkup(React.createElement(exports.BoqInvoiceDialog, { items: [{ id: "i0", name: "Electrical Storage", qty: 1, unit: "nos", consignmentId: "s" }], user: admin }));
    assert.match(html, /Truck \/ vehicle number/);
    assert.match(html, /Driver name/);
    assert.match(html, /Driver phone number/);
    assert.match(html, /value="KA01AB1234"/);
    assert.match(html, /value="Driver One"/);
    assert.match(html, /value="9876543210"/);
    assert.match(html, method === "DIRECT_TRUCK" ? /Truck and driver details/ : /Delivery vehicle and driver details/);
  }
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
  function render(status, role = "ADMIN", ids = ["i0"], view = "list") {
    const exports = {}; let hook = 0;
    vm.runInNewContext(compile("components/app/BoqItemBoard.tsx"), { exports, localStorage: { getItem: () => view }, require: (name) => {
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
  const tiles = render("READY_TO_PACK", "ADMIN", [], "tiles");
  const readyPosition = tiles.indexOf(">Ready to ship</span>");
  const invoicePosition = tiles.indexOf(">Invoice</span>");
  const transitPosition = tiles.indexOf(">In transit</span>");
  assert.ok(readyPosition >= 0 && readyPosition < invoicePosition && invoicePosition < transitPosition);
  const cardButton = (html) => html.match(/<button\b[^>]*aria-label="Invoice Selected chair"[^>]*>/)?.[0];
  assert.doesNotMatch(cardButton(tiles), /\sdisabled=/);
  assert.match(cardButton(render("QC_PENDING", "ADMIN", [], "tiles")), /\sdisabled=/);
  assert.doesNotMatch(render("READY_TO_PACK", "CLIENT", [], "tiles"), />Invoice<\/span>/);
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
