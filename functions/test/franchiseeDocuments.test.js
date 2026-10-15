const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");
const React = require("../../node_modules/react");
const { renderToStaticMarkup } = require("../../node_modules/react-dom/server");

function load(file, imports = {}, suffix = "") {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../../src", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source + suffix, { exports, require: (name) => imports[name] ?? {} });
  return exports;
}
const model = load("features/franchisee-documents/model.ts");
const showroom = load("lib/showroom.ts");
const admin = { uid: "admin", role: "ADMIN", active: true, name: "Kurchi Admin" };
const vendor = { uid: "vendor", role: "VENDOR", active: true, vendorId: "mine" };
const file = { name: "Company GST.pdf", type: "application/pdf", size: 2048 };

function library(options = {}) {
  const calls = [];
  const metadata = [];
  const api = load("features/franchisee-documents/library.ts", {
    "./model": model,
    "@/lib/firebase": { db: {}, storage: {}, auth: { currentUser: { uid: options.uid ?? admin.uid } } },
    "firebase/firestore": {
      collection: (_, name) => name, doc: (...args) => ({ id: args.length === 1 ? "doc1" : args[2] }),
      serverTimestamp: () => "SERVER_TIMESTAMP",
      setDoc: async (_, data) => { calls.push("publish"); metadata.push(data); if (options.publishError) throw Error("publish failed"); },
      getDoc: async () => { if (options.readError) throw Error("offline"); return { exists: () => Boolean(options.exists) }; },
      updateDoc: async (_, data) => { calls.push("rename"); metadata.push(data); },
      deleteDoc: async () => { calls.push("remove metadata"); if (options.deleteError) throw Error("delete failed"); },
    },
    "firebase/storage": {
      ref: (_, objectPath) => objectPath,
      uploadBytes: async (objectPath) => { calls.push(["upload", objectPath]); if (options.uploadError) throw Error("upload failed"); },
      getDownloadURL: async () => "https://firebasestorage.googleapis.com/file",
      deleteObject: async () => { calls.push("remove file"); if (options.missingFile) throw { code: "storage/object-not-found" }; },
    },
  });
  return { api, calls, metadata };
}

test("shared library has two fixed categories and validates named images/PDFs", () => {
  assert.deepEqual(Array.from(model.SHARED_DOCUMENT_CATEGORIES, (entry) => entry.id), ["KURCHI_KYC", "INSTRUCTION_MANUAL"]);
  assert.equal(model.documentName("  GST certificate  "), "GST certificate");
  for (const name of ["", "   ", "x".repeat(161)]) assert.throws(() => model.documentName(name));
  assert.equal(model.validateLibraryFile(file), "application/pdf");
  assert.equal(model.validateLibraryFile({ ...file, type: "", name: "photo.JPG" }), "image/jpeg");
  for (const invalid of [{ type: "image/svg+xml" }, { type: "text/html" }, { size: 0 }, { size: model.MAX_DOCUMENT_BYTES + 1 }]) {
    assert.throws(() => model.validateLibraryFile({ ...file, ...invalid }));
  }
  assert.equal(model.validateLibraryFile({ ...file, size: model.MAX_DOCUMENT_BYTES }), "application/pdf");
  for (const url of ["javascript:alert(1)", "data:text/html;base64,abc", "http://example.com/file"]) assert.equal(model.safeDocumentUrl(url), undefined);
});

test("only an active signed-in Admin may upload, rename or delete shared files", async () => {
  for (const user of [vendor, { ...admin, active: false }, { ...admin, role: "SUPER_ADMIN" }]) {
    const h = library();
    await assert.rejects(h.api.uploadSharedDocument(user, "KURCHI_KYC", "GST", file), /Only Kurchi Admin/);
    await assert.rejects(h.api.renameSharedDocument(user, { id: "doc1" }, "New name"), /Only Kurchi Admin/);
    await assert.rejects(h.api.removeSharedDocument(user, { id: "doc1" }), /Only Kurchi Admin/);
    assert.equal(h.calls.length, 0);
  }
  const h = library({ uid: "someone-else" });
  await assert.rejects(h.api.uploadSharedDocument(admin, "KURCHI_KYC", "GST", file), /Sign in again/);
});

test("upload publishes the supplied title/category after uploading a uniquely named file", async () => {
  const h = library();
  assert.equal(await h.api.uploadSharedDocument(admin, "INSTRUCTION_MANUAL", "  Assembly guide  ", file), "doc1");
  assert.equal(h.calls[0][0], "upload"); assert.equal(h.calls[1], "publish");
  assert.equal(h.metadata[0].name, "Assembly guide"); assert.equal(h.metadata[0].category, "INSTRUCTION_MANUAL");
  assert.equal(h.metadata[0].storagePath, "franchisee-library/INSTRUCTION_MANUAL/doc1/Company-GST.pdf");
  assert.equal(h.metadata[0].uploadedByUid, admin.uid); assert.equal(h.metadata[0].size, file.size);
  assert.equal(h.metadata[0].uploadedAt, "SERVER_TIMESTAMP");
  await assert.rejects(h.api.uploadSharedDocument(admin, "CUSTOM_CONTAINER", "Bad", file), /Choose Kurchi KYC/);
});

test("upload failures do not publish records or erase files after a lost acknowledgement", async () => {
  const failedUpload = library({ uploadError: true });
  await assert.rejects(failedUpload.api.uploadSharedDocument(admin, "KURCHI_KYC", "GST", file));
  assert.equal(failedUpload.metadata.length, 0);
  const rejectedRecord = library({ publishError: true });
  await assert.rejects(rejectedRecord.api.uploadSharedDocument(admin, "KURCHI_KYC", "GST", file));
  assert.ok(rejectedRecord.calls.includes("remove file"));
  const lostAck = library({ publishError: true, exists: true });
  assert.equal(await lostAck.api.uploadSharedDocument(admin, "KURCHI_KYC", "GST", file), "doc1");
  assert.ok(!lostAck.calls.includes("remove file"));
  const uncertain = library({ publishError: true, readError: true });
  await assert.rejects(uncertain.api.uploadSharedDocument(admin, "KURCHI_KYC", "GST", file));
  assert.ok(!uncertain.calls.includes("remove file"));
});

test("rename preserves file metadata; removal retries a previously deleted file safely", async () => {
  const doc = { id: "doc1", category: "KURCHI_KYC", storagePath: "franchisee-library/KURCHI_KYC/doc1/gst.pdf" };
  const h = library({ missingFile: true });
  await h.api.renameSharedDocument(admin, doc, " New GST ");
  assert.deepEqual(Object.keys(h.metadata[0]).sort(), ["name", "updatedAt"]);
  assert.equal(h.metadata[0].name, "New GST");
  await h.api.removeSharedDocument(admin, doc);
  assert.ok(h.calls.includes("remove metadata"));
  await assert.rejects(h.api.removeSharedDocument(admin, { ...doc, storagePath: "another-project/file.pdf" }), /invalid/);
  const retry = library({ deleteError: true });
  await assert.rejects(retry.api.removeSharedDocument(admin, doc), /delete failed/);
});

function billingRepo() {
  const projects = [{ id: "p1", name: "Ola Indiranagar", franchiseeId: "mine", site: { city: "Bengaluru" } }, { id: "p2", name: "Other showroom", franchiseeId: "other", site: { city: "Chennai" } }];
  const records = projects.map((p) => ({ id: `${p.id}-record`, projectId: p.id }));
  const db = { projects, invoices: records, challans: records, consignments: records, creditNotes: records,
    documents: [...records.map((record) => ({ ...record, type: "INVOICE" })), { id: "own-kyc", projectId: "p1", type: "KYC_GST" }],
  };
  return { db, ...load("data/repo.ts", { "./store": { db } }) };
}

test("franchisee billing includes only assigned showroom bills, challans, transport and attachments", () => {
  const { repo } = billingRepo();
  const groups = repo.franchiseeBilling(vendor);
  assert.equal(groups.length, 1); assert.equal(groups[0].project.name, "Ola Indiranagar");
  for (const collection of ["invoices", "challans", "shipments", "creditNotes", "attachments"]) {
    assert.equal(groups[0][collection].length, 1); assert.equal(groups[0][collection][0].projectId, "p1");
  }
  for (const user of [null, admin, { ...vendor, active: false }, { ...vendor, vendorId: "" }]) assert.equal(repo.franchiseeBilling(user).length, 0);
});

const jsx = { react: React, "react/jsx-runtime": require("../../node_modules/react/jsx-runtime") };
const passthrough = ({ children }) => React.createElement("div", null, children);

test("all three containers render together and share company files while keeping billing scoped", () => {
  let user = vendor;
  const { repo } = billingRepo();
  const { FranchiseeDocuments } = load("features/franchisee-documents/FranchiseeDocuments.tsx", {
    ...jsx, "./model": model, "./useSharedDocuments": { useSharedDocuments: () => ({ documents: [{ id: "gst", category: "KURCHI_KYC", name: "Kurchi GST" }, { id: "guide", category: "INSTRUCTION_MANUAL", name: "Assembly guide" }], loading: false }) },
    "@/features/auth/AuthContext": { useAuth: () => ({ user }) }, "@/data/store": { useDb: () => {} },
    "@/data/repo": { repo: { ...repo, franchiseeBilling: (actor) => repo.franchiseeBilling(actor).map((group) => ({ ...group, invoices: [], challans: [], creditNotes: [], attachments: [], shipments: [] })) } },
    "./DocumentFile": { DocumentFile: ({ name }) => React.createElement("p", null, name) },
    "lucide-react": { BookOpen: () => null, ShieldCheck: () => null, Receipt: () => null },
  });
  const render = () => renderToStaticMarkup(React.createElement(FranchiseeDocuments));
  const html = render();
  assert.equal((html.match(/<section aria-labelledby="container-/g) || []).length, 3);
  for (const text of ["Kurchi KYC Documents", "Instruction Manuals", "Invoices &amp; Delivery Documents", "Kurchi GST", "Assembly guide"]) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /role="tab"|hidden=/);
  user = { ...vendor, uid: "other", vendorId: "other" };
  assert.match(render(), /Kurchi GST/); assert.match(render(), /Assembly guide/);
  user = { ...vendor, active: false }; assert.equal(render(), "");
});

test("franchisees can read an issued invoice while the seller profile is incomplete", () => {
  const { TestInvoice } = load("components/app/InvoiceDetailsDialog.tsx", {
    ...jsx, "@/data/repo": { repo: { sellerProfile: () => ({}), creditNotes: () => [], invoiceParties: () => ({ billTo: { name: "Ola Indiranagar" }, shipTo: { name: "Ola Indiranagar" } }) } },
    "@/features/accounts/components/InvoicePartyDetails": { InvoicePartyDetails: () => null },
    "@/lib/money": load("lib/money.ts"), "@/lib/useAction": { formatDate: (value) => value },
    "@/components/ui/dialog": Object.fromEntries(["Dialog", "DialogContent", "DialogDescription", "DialogHeader", "DialogTitle"].map((name) => [name, passthrough])),
  }, "\nexports.TestInvoice = InvoiceDetailsDialog;");
  const invoice = { id: "invoice", number: "KP/INV/1", issuedAt: "2026-10-15", dueDate: "2026-11-15", lines: [{ description: "Chair", hsn: "9403", qty: 1, rate: 100, taxableValue: 100 }], taxMode: "CGST_SGST", taxableValue: 100, cgst: 9, sgst: 9, total: 118, netPayable: 118, amountReceived: 0, retentionAmount: 0 };
  const html = renderToStaticMarkup(React.createElement(TestInvoice, { invoice, project: { name: "Ola Indiranagar" }, onClose: () => {} }));
  assert.match(html, /Chair/); assert.match(html, /Balance due/); assert.match(html, /₹118/); assert.match(html, /complete the seller details/);
  assert.doesNotMatch(html, /business-profile|Print \/ Save PDF/);
});

test("welcome uses Ola's showroom name and handles unassigned or multiple showrooms", () => {
  const { db } = billingRepo();
  assert.equal(showroom.showroomWelcome([db.projects[0]]), "Welcome, Ola Indiranagar");
  assert.equal(showroom.showroomWelcome([]), "Welcome to your showroom");
  assert.equal(showroom.showroomWelcome(db.projects), "Welcome to your showrooms");
  assert.equal(showroom.showroomName({ name: " ", site: { city: "Chennai" } }), "Chennai Showroom");
});
