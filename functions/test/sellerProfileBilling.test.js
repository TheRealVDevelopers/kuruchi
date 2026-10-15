const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");
const React = require("../../node_modules/react");

function load(file, imports = {}, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../../src", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, require: (name) => imports[name] ?? {}, ...globals });
  return exports;
}

const profile = { legalName: "Kurchi Projects", gstin: "GST", pan: "PAN", address: "Registered address", state: "Karnataka", pincode: "560001", invoicePrefix: "KP" };
const parties = load("lib/invoiceParties.ts");
const accounts = { role: "ACCOUNTS" };
function actionsHarness() {
  const db = {
    sellerProfile: { ...profile, gstin: "" },
    projects: [{ id: "p", name: "Showroom", clientId: "client", site: { address: "Site", state: "Karnataka", pincode: "560001" } }],
    clients: [{ id: "client", name: "Customer", gstin: "GST", billingAddress: "Customer address", state: "Karnataka" }],
    consignments: [{ id: "shipment", projectId: "p" }], challans: [],
  };
  let writes = 0;
  const api = load("data/actions.ts", { "@/lib/invoiceParties": parties, "./store": { db, commit: () => { writes++; }, audit: () => {}, nextId: () => "challan", nextDocNumber: () => "DC/1" } });
  return { db, api, get writes() { return writes; } };
}

function findElement(node, type) {
  if (!node || typeof node !== "object") return undefined;
  if (node.type === type) return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const found = findElement(child, type);
    if (found) return found;
  }
}

test("every missing seller field blocks billing without creating partial documents", () => {
  for (const field of ["legalName", "gstin", "pan", "address", "state", "pincode"]) {
    for (const missing of ["", "   "]) {
      const h = actionsHarness();
      h.db.sellerProfile = { ...profile, [field]: missing };
      const before = JSON.stringify(h.db);
      assert.throws(() => h.api.createChallan(accounts, "shipment"), h.api.SellerProfileRequiredError);
      assert.equal(JSON.stringify(h.db), before);
      assert.equal(h.writes, 0);
    }
  }
});

test("Admin and Accounts can save the seller profile; other roles cannot", () => {
  for (const role of ["ADMIN", "ACCOUNTS"]) {
    const h = actionsHarness();
    h.api.saveSellerProfile({ role }, { ...profile, gstin: " gst ", pan: " pan " });
    assert.equal(h.api.requireSellerProfile().gstin, "GST");
    assert.equal(h.db.sellerProfile.pan, "PAN");
    assert.equal(h.writes, 1);
  }
  for (const role of ["SUPER_ADMIN", "CLIENT", "INSTALLATION", "VENDOR"]) {
    const h = actionsHarness();
    const before = JSON.stringify(h.db);
    assert.throws(() => h.api.saveSellerProfile({ role }, profile), /Only Kurchi Admin or Accounts/);
    assert.equal(JSON.stringify(h.db), before);
    assert.equal(h.writes, 0);
  }
});

test("missing seller details open the popup and Okay opens the correct form with the billing return address", () => {
  for (const role of ["ACCOUNTS", "ADMIN"]) {
    const h = actionsHarness();
    let open = false;
    let navigation;
    const base = role === "ACCOUNTS" ? "/accounts" : "/admin";
    const location = { pathname: `${base}/invoices`, search: "?shipment=shipment", hash: "#billing" };
    const Context = React.createContext(null);
    const { SellerProfilePromptProvider } = load("components/app/SellerProfilePromptProvider.tsx", {
      react: { ...React, useState: () => [open, (value) => { open = value; }], useCallback: (fn) => fn },
      "react/jsx-runtime": require("../../node_modules/react/jsx-runtime"),
      "react-router-dom": { useLocation: () => location, useNavigate: () => (...args) => { navigation = args; } },
      "@/features/auth/AuthContext": { useAuth: () => ({ user: { role } }) },
      "@/lib/sellerProfilePrompt": { SellerProfilePromptContext: Context },
      "@/components/ui/alert-dialog": Object.fromEntries(["AlertDialog", "AlertDialogAction", "AlertDialogCancel", "AlertDialogContent", "AlertDialogDescription", "AlertDialogFooter", "AlertDialogHeader", "AlertDialogTitle"].map((name) => [name, name])),
    });
    let tree = SellerProfilePromptProvider({ children: null });
    const errors = [];
    const { useAction } = load("lib/useAction.ts", {
      react: { useCallback: (fn) => fn }, "@/data/actions": h.api,
      "@/lib/sellerProfilePrompt": { useSellerProfilePrompt: () => tree.props.value },
      sonner: { toast: { error: (...args) => errors.push(args) } },
    });
    const run = useAction();
    assert.equal(run(() => h.api.createChallan(accounts, "shipment")), false);
    assert.equal(h.writes, 0);
    tree = SellerProfilePromptProvider({ children: null });
    assert.equal(findElement(tree, "AlertDialog").props.open, true);
    assert.equal(errors.length, 0);
    findElement(tree, "AlertDialogAction").props.onClick();
    assert.equal(navigation[0], `${base}/business-profile`);
    assert.equal(navigation[1].state.returnTo, `${location.pathname}${location.search}${location.hash}`);

    findElement(tree, "AlertDialog").props.onOpenChange(false);
    assert.equal(open, false);
    assert.equal(run(() => { throw new h.api.RuleError("Customer GSTIN missing", ["FN-01"]); }), false);
    assert.equal(open, false);
    assert.equal(errors[0][0], "Blocked");
    assert.match(errors[0][1].description, /Customer GSTIN missing/);
  }
});

test("saving the form returns Accounts to the same billing task and billing succeeds on retry", () => {
  const h = actionsHarness();
  const returnTo = "/accounts/invoices?shipment=shipment#billing";
  let navigation;
  const { default: Page } = load("features/admin/pages/BusinessProfilePage.tsx", {
    react: { useState: () => [{ ...profile }, () => {}] },
    "react/jsx-runtime": require("../../node_modules/react/jsx-runtime"),
    "react-router-dom": { Link: "a", useLocation: () => ({ state: { returnTo } }), useNavigate: () => (...args) => { navigation = args; } },
    "@/features/auth/AuthContext": { useAuth: () => ({ user: accounts }) },
    "@/data/store": { useDb: () => {} }, "@/data/actions": h.api,
    "@/lib/useAction": { useAction: () => (fn) => { fn(); return true; } },
  });
  const form = findElement(Page(), "form");
  form.props.onSubmit({ preventDefault() {} });
  assert.equal(navigation[0], returnTo);
  assert.equal(h.db.sellerProfile.gstin, "GST");
  h.api.createChallan(accounts, "shipment");
  assert.equal(h.db.challans.length, 1);
  assert.equal(h.db.consignments[0].challanId, "challan");
});

test("a failed profile save stays on the form", () => {
  let navigated = false;
  const { default: Page } = load("features/admin/pages/BusinessProfilePage.tsx", {
    react: { useState: () => [{ ...profile }, () => {}] },
    "react/jsx-runtime": require("../../node_modules/react/jsx-runtime"),
    "react-router-dom": { Link: "a", useLocation: () => ({ state: { returnTo: "/accounts/invoices" } }), useNavigate: () => () => { navigated = true; } },
    "@/features/auth/AuthContext": { useAuth: () => ({ user: accounts }) },
    "@/data/store": { useDb: () => {} }, "@/lib/useAction": { useAction: () => () => false },
  });
  findElement(Page(), "form").props.onSubmit({ preventDefault() {} });
  assert.equal(navigated, false);
});

test("printing with missing seller details prompts before opening a print window", () => {
  const h = actionsHarness();
  let opened = false;
  const { printTaxInvoice } = load("lib/printInvoice.ts", { "@/data/actions": h.api }, { window: { open: () => { opened = true; } } });
  assert.throws(() => printTaxInvoice({}), h.api.SellerProfileRequiredError);
  assert.equal(opened, false);
});
