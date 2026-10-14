const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");
const React = require("../../node_modules/react");
const { renderToStaticMarkup } = require("../../node_modules/react-dom/server");
function load(file, imports = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../../src", file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(source, { exports, URLSearchParams, require: (name) => imports[name] ?? {} });
  return exports;
}
const links = load("lib/accountsInbox.ts");
const project = { id: "p", name: "Requested showroom", totals: { value: 100 }, site: { city: "Bengaluru" }, initialPayment: { status: "PENDING_VERIFICATION", amount: 100, percentage: 10, reference: "UTR-REQUESTED" } };
const shipment = { id: "cn-request", projectId: "p", crateIds: ["crate"], status: "READY", taxableValue: 100, invoiceRequestItemIds: ["selected"], deliveryMethod: "DIRECT_TRUCK" };

test("every Accounts request type opens its actionable page and older links are repaired", () => {
  const cases = [
    ["Payment verification needed", "Requested showroom · paid", "/accounts/payments?verify=p"],
    ["Corrected payment needs verification", "Requested showroom · corrected", "/accounts/payments?verify=p"],
    ["Invoice requested by Admin", "Bengaluru: selected items", "/accounts/invoices?shipment=cn-request"],
    ["Shipment ready for billing", "Bengaluru: CRATE-1 is packed.", "/accounts/invoices?shipment=cn-request"],
    ["Shipment ready for documents", "Bengaluru: documents", "/accounts/invoices?shipment=cn-request"],
    ["Project ready for closure", "Bengaluru: completed", "/accounts/cost-centres?project=p"],
  ];
  const db = { projects: [project], consignments: [shipment], crates: [{ id: "crate", crateCode: "CRATE-1" }], notifications: cases.map(([title, detail]) => ({ role: "ACCOUNTS", title, detail, link: "/accounts" })) };
  const { repo } = load("data/repo.ts", { "./store": { db }, "@/lib/accountsInbox": links });
  const before = JSON.stringify(db);
  assert.deepEqual(Array.from(repo.notifications({ role: "ACCOUNTS" }), (n) => n.link), cases.map((entry) => entry[2]));
  assert.equal(JSON.stringify(db), before);
  assert.equal(links.accountsInboxLink({ link: "/accounts#shipment-cn-123" }), "/accounts/invoices?shipment=cn-123");
  assert.equal(links.accountsInboxLink({ link: "/accounts#shipment-invoices" }), "/accounts/invoices?requests=1");
});

test("ambiguous old requests open the correct queue without selecting another showroom", () => {
  const projects = [project, { ...project, id: "other" }];
  assert.equal(links.accountsInboxLink({ title: "Invoice requested by Admin", detail: "Bengaluru: items", link: "/accounts" }, projects, [shipment]), "/accounts/invoices?requests=1");
  assert.equal(links.accountsInboxLink({ title: "Payment verification needed", detail: "Requested showroom · paid", link: "/accounts" }, projects), "/accounts/payments?verification=1");
  assert.equal(links.accountsInboxLink({ title: "Project ready for closure", detail: "Bengaluru: completed", link: "/accounts" }, projects), "/accounts/cost-centres");
});

test("project broadcasts stay in Accounts without altering Admin links", () => {
  const notification = { role: "ALL", title: "Project cancelled", detail: "Bengaluru: paused", link: "/admin/projects/p" };
  const { repo } = load("data/repo.ts", { "./store": { db: { notifications: [notification] } }, "@/lib/accountsInbox": links });
  assert.equal(repo.notifications({ role: "ACCOUNTS" })[0].link, "/accounts/cost-centres?project=p");
  assert.equal(repo.notifications({ role: "ADMIN" })[0].link, "/admin/projects/p");
});

function pageHarness(search = "") {
  const user = { role: "ACCOUNTS" };
  const imports = {
    react: React, "react/jsx-runtime": require("../../node_modules/react/jsx-runtime"),
    "react-router-dom": { useLocation: () => ({ search, hash: "" }), useSearchParams: () => [new URLSearchParams(search)], Link: (props) => React.createElement("a", { href: props.to }, props.children) },
    "lucide-react": Object.fromEntries(["CheckCircle2", "CircleDollarSign", "FileText", "IndianRupee", "Printer", "Receipt", "ShieldCheck", "Truck", "WalletCards", "PlusCircle"].map((name) => [name, () => null])),
    "@/features/auth/AuthContext": { useAuth: () => ({ user }) },
    "@/data/store": { useDb: () => 0 }, "@/lib/useAction": { useAction: () => () => {}, formatDate: String },
    "@/lib/money": { formatCompactINR: String, formatINR: String }, "@/lib/utils": { cn: () => "" },
    "@/components/app/Shell": { PageHeader: (props) => React.createElement("h1", null, props.title), EmptyState: (props) => React.createElement("p", null, props.title), StatStrip: (props) => props.children, StatCard: () => null },
    "@/components/app/ResponsiveTable": { ResponsiveTable: (props) => React.createElement("div", null, props.data.map((entry) => entry.number).join(",")) },
    "@/components/app/RuleGate": { RuleTag: () => null },
    "@/data/repo": { receivablesAgeing: () => ({}), repo: {
      projects: () => [project, { ...project, id: "other", name: "Other showroom", initialPayment: { ...project.initialPayment, reference: "OTHER-UTR" } }],
      invoices: () => [], notifications: () => [], consignments: () => [shipment], costEntries: () => [], payments: () => [],
      itemById: (id) => { assert.equal(id, "selected"); return { name: "Electrical Storage" }; },
    } },
  };
  imports["../components/ShipmentInvoiceTasks"] = load("features/accounts/components/ShipmentInvoiceTasks.tsx", imports);
  imports["../components/PaymentApprovalTasks"] = load("features/accounts/components/PaymentApprovalTasks.tsx", imports);
  return imports;
}

test("invoice request opens the selected-item billing task inside Tax invoices", () => {
  const imports = pageHarness("?shipment=cn-request");
  const { InvoicesPage } = load("features/accounts/pages/FinancePages.tsx", imports);
  const html = renderToStaticMarkup(React.createElement(InvoicesPage));
  assert.match(html, /Tax invoices/); assert.match(html, /Admin selected: Electrical Storage/);
  assert.match(html, /Create shipment documents/); assert.doesNotMatch(html, /All packed products/);
});

test("payment request opens only the requested showroom's approval in Payments", () => {
  const imports = pageHarness("?verify=p");
  const { PaymentsPage } = load("features/accounts/pages/FinancePages.tsx", imports);
  const html = renderToStaticMarkup(React.createElement(PaymentsPage));
  assert.match(html, /Payment verification/); assert.match(html, /UTR-REQUESTED/); assert.match(html, /Approve payment/);
  assert.doesNotMatch(html, /OTHER-UTR/);
});

test("closure request selects its cost centre and links to the same project's invoices", () => {
  const imports = pageHarness("?project=other");
  const { default: Page } = load("features/accounts/pages/CostCentresPage.tsx", imports);
  const html = renderToStaticMarkup(React.createElement(Page));
  assert.match(html, /Cost centres/); assert.match(html, /Other showroom/);
  assert.match(html, /value="other" selected=""/); assert.match(html, /href="\/accounts\/invoices\?project=other"/);
});

test("reviewing project invoices keeps the same project filter", () => {
  const imports = pageHarness("?project=other");
  imports["@/data/repo"].repo.invoices = () => [{ projectId: "p", number: "INVOICE-FIRST" }, { projectId: "other", number: "INVOICE-REQUESTED" }];
  const { InvoicesPage } = load("features/accounts/pages/FinancePages.tsx", imports);
  const html = renderToStaticMarkup(React.createElement(InvoicesPage));
  assert.match(html, /INVOICE-REQUESTED/); assert.doesNotMatch(html, /INVOICE-FIRST/);
  assert.doesNotMatch(html, /Electrical Storage/);
});

test("completed invoice requests show Print and link to the same shipment's e-way bill", () => {
  const imports = pageHarness("?shipment=cn-request");
  imports["@/data/repo"].repo.consignments = () => [{ ...shipment, status: "DELIVERED", invoiceId: "inv" }];
  imports["@/data/repo"].repo.invoices = () => [{ id: "inv" }];
  const { ShipmentInvoiceTasks } = imports["../components/ShipmentInvoiceTasks"];
  const html = renderToStaticMarkup(React.createElement(ShipmentInvoiceTasks, { shipmentId: "cn-request", pendingOnly: true }));
  assert.match(html, /Print/); assert.match(html, /href="\/accounts\/eway\?shipment=cn-request"/);
  assert.doesNotMatch(html, /Create shipment documents/);
});

test("already verified payment requests show status without another approval action", () => {
  const imports = pageHarness("?verify=p");
  imports["@/data/repo"].repo.projects = () => [{ ...project, initialPayment: { ...project.initialPayment, status: "VERIFIED" } }];
  const { PaymentsPage } = load("features/accounts/pages/FinancePages.tsx", imports);
  const html = renderToStaticMarkup(React.createElement(PaymentsPage));
  assert.match(html, /Payment status: verified/); assert.doesNotMatch(html, /Approve payment/);
});
