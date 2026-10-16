const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("../../node_modules/typescript");
const vm = require("node:vm");

test("role-switching sandbox cannot run in production or on a remote hostname", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../src/lib/demoMode.ts"), "utf8").split("export const IS_LOCAL_DEMO")[0];
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
  const check = exports.isLocalDemoEnvironment;
  assert.equal(check(true, "demo", "127.0.0.1"), true);
  assert.equal(check(true, "demo", "localhost"), true);
  assert.equal(check(false, "demo", "localhost"), false);
  assert.equal(check(true, "production", "localhost"), false);
  assert.equal(check(true, "demo", "kurchi--e-commerce.web.app"), false);
});
