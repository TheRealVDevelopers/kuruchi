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
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../../src", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(compiled, { exports, URLSearchParams, require: (name) => imports[name] ?? {} });
  return exports;
}
const inbox = load("lib/accountsInbox.ts");
const project = { id: "prj-1135", name: "Jana test", site: { city: "Bengaluru" }, initialPayment: { status: "PENDING_VERIFICATION" } };
const payment = { id: "payment", role: "ACCOUNTS", title: "Payment verification needed", detail: "Jana test · Payment claimed", link: "/accounts", readBy: [] };

test("a verified payment resolves the old dashboard alert without changing receipts or saved notifications", () => {
  const db = { projects: [structuredClone(project)], notifications: [payment], consignments: [], crates: [], payments: [{ invoiceId: "advance-prj-1135", amount: 100 }] };
  const { repo } = load("data/repo.ts", { "./store": { db }, "@/lib/accountsInbox": inbox });
  assert.equal(repo.notifications({ role: "ACCOUNTS" })[0].requestStatus, "WAITING");
  db.projects[0].initialPayment.status = "VERIFIED";
  const before = JSON.stringify(db);
  const entry = repo.notifications({ role: "ACCOUNTS" })[0];
  assert.equal(entry.requestStatus, "COMPLETED"); assert.equal(entry.requestCategory, "PAYMENT");
  assert.equal(entry.title, "Payment verified"); assert.equal(entry.link, "/accounts/payments?verify=prj-1135");
  assert.equal(JSON.stringify(db), before); assert.equal(db.notifications[0].title, "Payment verification needed");
});

test("payment decisions resolve only the named showroom, including old and corrected requests", () => {
  const other = { ...project, id: "other", name: "Other showroom", initialPayment: { status: "VERIFIED" } };
  for (const title of ["Payment verification needed", "Corrected payment needs verification"]) {
    assert.equal(inbox.accountsInboxEntry({ ...payment, title }, [project, other]).requestStatus, "WAITING");
    const held = { ...project, initialPayment: { status: "ON_HOLD", holdReason: "Check bank reference" } };
    const entry = inbox.accountsInboxEntry({ ...payment, title }, [held, other]);
    assert.equal(entry.requestStatus, "ON_HOLD"); assert.match(entry.detail, /Check bank reference/);
    const denied = { ...project, initialPayment: { status: "REJECTED", rejectionReason: "Reference does not match" } };
    assert.equal(inbox.accountsInboxEntry({ ...payment, title }, [denied]).requestStatus, "RETURNED");
  }
  const missing = inbox.accountsInboxEntry(payment, [other]);
  assert.equal(missing.requestStatus, "ARCHIVED"); assert.doesNotMatch(missing.title, /verification needed/);
  assert.equal(inbox.accountsInboxEntry(payment, [project, { ...project, id: "ambiguous" }]).requestStatus, undefined);
});

test("invoice requests follow the requested shipment and completed documents leave the waiting queue", () => {
  const notification = { id: "invoice", title: "Invoice requested by Admin", detail: "Bengaluru: invoice needed", link: "/accounts/invoices?shipment=shipment1" };
  const shipment = { id: "shipment1", projectId: project.id, status: "READY" };
  const entry = inbox.accountsInboxEntry(notification, [project], [shipment, { id: "other", invoiceId: "other-invoice" }]);
  assert.equal(entry.requestCategory, "INVOICE"); assert.equal(entry.requestStatus, "WAITING");
  assert.equal(inbox.accountsInboxEntry(notification, [project], [{ ...shipment, invoiceId: "invoice1" }]).requestStatus, "COMPLETED");
  assert.equal(inbox.accountsInboxEntry(notification, [project], [{ ...shipment, billingExempt: true }]).requestStatus, "WAITING");
  assert.equal(inbox.accountsInboxEntry(notification, [project], [{ ...shipment, billingExempt: true, challanId: "dc1" }]).requestStatus, "COMPLETED");
  assert.equal(inbox.accountsInboxEntry(notification, [project], []).requestStatus, "ARCHIVED");
});

test("Accounts Inbox renders two request tabs, deduplicates a task and keeps completed payment history", () => {
  const radix = require("../../node_modules/@radix-ui/react-tabs");
  const component = load("features/accounts/components/AccountsInbox.tsx", {
    react: React, "react/jsx-runtime": require("../../node_modules/react/jsx-runtime"),
    "react-router-dom": { Link: ({ to, children, ...props }) => React.createElement("a", { ...props, href: to }, children) },
    "lucide-react": Object.fromEntries(["CheckCircle2", "ChevronRight", "CreditCard", "Receipt"].map((name) => [name, () => null])),
    "@/components/ui/tabs": { Tabs: radix.Root, TabsList: radix.List, TabsTrigger: radix.Trigger, TabsContent: radix.Content },
  });
  const verified = inbox.accountsInboxEntry(payment, [{ ...project, initialPayment: { status: "VERIFIED" } }]);
  const html = renderToStaticMarkup(React.createElement(component.AccountsInbox, { notifications: [verified, { ...verified, id: "duplicate" }] }));
  assert.equal((html.match(/role="tab"/g) || []).length, 2);
  assert.match(html, /Payment requests/); assert.match(html, /Invoice requests/);
  assert.match(html, /No payment requests waiting/); assert.match(html, /Completed requests &amp; history/);
  assert.equal((html.match(/Payment verified/g) || []).length, 1);
  assert.doesNotMatch(html, /Payment verification needed/);
});
