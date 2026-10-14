const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");
const React = require("../../node_modules/react");
const { renderToStaticMarkup } = require("../../node_modules/react-dom/server");
function compile(file) { return ts.transpileModule(fs.readFileSync(path.join(__dirname, "../../src", file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText; }
function pure(file) { const exports = {}; vm.runInNewContext(compile(file), { exports }); return exports; }
const statuses = pure("lib/statuses.ts"); const stages = pure("lib/shippingStages.ts");
function render(view, role = "ADMIN", limit) {
  const exports = {};
  vm.runInNewContext(compile("components/app/BoqItemBoard.tsx"), { exports, localStorage: { getItem: () => view }, require: name => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return require("../../node_modules/react/jsx-runtime");
    if (name === "react-router-dom") return { Link: props => React.createElement("a", { href: props.to }, props.children) };
    if (name === "lucide-react") return { LayoutGrid: () => null, List: () => null, X: () => null };
    if (name === "@/lib/statuses") return statuses;
    if (name === "@/lib/shippingStages") return stages;
    if (name === "./StatusBadge") return { ItemStatusBadge: props => React.createElement("span", null, statuses.ITEM_STATUS_META[props.status].label) };
    if (name === "./StatusControl") return { StatusControl: () => React.createElement("button", null, "Update item") };
    if (name === "./TransitDialog") return { TransitDialog: () => null };
    if (name === "@/data/repo") return { repo: { consignments: () => [], crates: () => [] } };
    return {};
  } });
  const items = Array.from({ length: 16 }, (_, i) => ({ id: "i" + i, projectId: "p", name: "Product " + i, qty: 1, unit: "nos", status: "APPROVED" }));
  return renderToStaticMarkup(React.createElement(exports.BoqItemBoard, { items, user: { role }, editable: true, limit }));
}
test("Tiles renders 16 checkboxes and the four shipping stages", () => {
  const html = render("tiles");
  assert.equal((html.match(/type="checkbox"/g) || []).length, 17);
  assert.match(html, /Select all/); assert.match(html, /Update selected/); assert.match(html, /In packaging/);
});
test("saved List view is compact but keeps item selection and status", () => {
  const html = render("list");
  assert.match(html, /aria-pressed="true"[^>]*>List/);
  assert.equal((html.match(/type="checkbox"/g) || []).length, 17);
  assert.doesNotMatch(html, /grid-cols-4/);
});
test("read-only customers get the view toggle without bulk editing controls", () => {
  const html = render("list", "CLIENT", 4);
  assert.doesNotMatch(html, /type="checkbox"/); assert.doesNotMatch(html, /Update selected/);
  assert.match(html, /Item view/); assert.match(html, /12 more items/);
});
