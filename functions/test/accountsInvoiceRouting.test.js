const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");
const React = require("../../node_modules/react");
const { renderToStaticMarkup } = require("../../node_modules/react-dom/server");
function load(file, imports, extra = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../../src", file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(source, { exports, require: (name) => imports[name] ?? {}, ...extra });
  return exports;
}

test("old shipment requests open the invoice section in both Accounts inbox and notifications", () => {
  const db = { notifications: [
    ...["Invoice requested by Admin", "Shipment ready for billing", "Shipment ready for documents"].map((title) => ({ role: "ACCOUNTS", title, link: "/accounts" })),
    { role: "ACCOUNTS", title: "Invoice requested by Admin", link: "/accounts#shipment-cn-123" },
    { role: "ACCOUNTS", title: "Payment waiting", link: "/accounts" },
    { role: "ADMIN", title: "Invoice requested by Admin", link: "/admin" },
  ] };
  const { repo } = load("data/repo.ts", { "./store": { db } });
  const before = JSON.stringify(db);
  const result = repo.notifications({ role: "ACCOUNTS" });
  assert.deepEqual(Array.from(result, (n) => n.link), ["/accounts#shipment-invoices", "/accounts#shipment-invoices", "/accounts#shipment-invoices", "/accounts#shipment-cn-123", "/accounts"]);
  assert.equal(JSON.stringify(db), before);
});

test("request opens its exact selected shipment billing action even after dispatch", () => {
  const requested = { id: "cn-request", projectId: "p", status: "IN_TRANSIT", taxableValue: 100, invoiceRequestItemIds: ["selected"], deliveryMethod: "DIRECT_TRUCK" };
  let effect, available = false, scrolled = 0, focused = 0;
  const target = { scrollIntoView: () => { scrolled++; }, focus: () => { focused++; } };
  const user = { role: "ACCOUNTS" };
  const { default: Page } = load("features/accounts/pages/AccountsHomePage.tsx", {
    react: { ...React, useEffect: (callback) => { effect = callback; } },
    "react/jsx-runtime": require("../../node_modules/react/jsx-runtime"),
    "react-router-dom": { useLocation: () => ({ hash: "#shipment-cn-request", key: "request" }), Link: (props) => React.createElement("a", { href: props.to }, props.children) },
    "lucide-react": Object.fromEntries(["CheckCircle2", "CircleDollarSign", "FileText", "IndianRupee", "Printer", "Receipt", "ShieldCheck", "Truck", "WalletCards"].map((name) => [name, () => null])),
    "@/features/auth/AuthContext": { useAuth: () => ({ user }) },
    "@/data/store": { useDb: () => 0 },
    "@/lib/useAction": { useAction: () => () => {} },
    "@/lib/money": { formatCompactINR: String, formatINR: String },
    "@/data/repo": { receivablesAgeing: () => ({}), repo: {
      projects: () => [{ id: "p", site: { city: "Bengaluru" } }], invoices: () => [],
      notifications: () => [{ id: "notice", title: "Invoice requested by Admin", link: "/accounts#shipment-cn-request" }],
      consignments: () => [requested, { id: "unrelated", status: "DELIVERED" }],
      itemById: (id) => { assert.equal(id, "selected"); return { name: "Electrical Storage" }; },
    } },
  }, { document: { getElementById: (id) => { assert.equal(id, "shipment-cn-request"); return available ? target : null; } } });
  const html = renderToStaticMarkup(React.createElement(Page));
  assert.match(html, /href="\/accounts#shipment-cn-request"/);
  assert.match(html, /id="shipment-invoices"/);
  assert.match(html, /id="shipment-cn-request"/);
  assert.match(html, /Admin selected: Electrical Storage/);
  assert.match(html, /Create shipment documents/);
  assert.doesNotMatch(html, /id="shipment-unrelated"/);
  effect(); assert.equal(scrolled, 0);
  available = true; effect(); assert.equal(scrolled, 1); assert.equal(focused, 1);
  effect(); assert.equal(scrolled, 1);
});
