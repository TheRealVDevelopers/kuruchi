const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseTracking } = require("../delhiveryParser");
const body = (status, type = "UD") => ({ ShipmentData: [{ Shipment: { AWB: "123456789", Status: { Status: status, StatusType: type, StatusLocation: "Bengaluru", StatusDateTime: "2026-10-14T10:00:00Z" }, ExpectedDeliveryDate: "2026-10-16T10:00:00Z" } }] });
test("tracking matches exact AWB and preserves provider ETA and location", () => {
  const result = parseTracking(body("In Transit"), "123456789");
  assert.equal(result.status, "In Transit"); assert.equal(result.location, "Bengaluru");
  assert.equal(result.eta, "2026-10-16T10:00:00.000Z"); assert.equal(result.delivered, false);
});
test("missing AWB and malformed response cannot change a shipment", () => {
  assert.throws(() => parseTracking(body("Delivered", "DL"), "different"));
  assert.throws(() => parseTracking({}, "123456789"));
});
test("only a confirmed delivered scan is treated as delivery", () => {
  assert.equal(parseTracking(body("Delivered", "DL"), "123456789").delivered, true);
  assert.equal(parseTracking(body("Delivered", "UD"), "123456789").delivered, false);
  assert.equal(parseTracking(body("RTO", "DL"), "123456789").delivered, false);
});
test("missing or invalid provider ETA stays unknown, not a guessed date", () => {
  const data = body("In Transit"); data.ShipmentData[0].Shipment.ExpectedDeliveryDate = "not-a-date";
  assert.equal(parseTracking(data, "123456789").eta, null);
});
