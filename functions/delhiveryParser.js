function parseTracking(body, awb) {
  const record = body?.ShipmentData?.map(entry => entry.Shipment).find(entry => String(entry?.AWB) === String(awb));
  if (!record || !record.Status?.Status) throw new Error("Shipment not found in partner response");
  const iso = value => { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? date.toISOString() : null; };
  const status = String(record.Status.Status);
  return { status, location: String(record.Status.StatusLocation ?? ""), at: iso(record.Status.StatusDateTime), eta: iso(record.ExpectedDeliveryDate), delivered: status.toLowerCase() === "delivered" && record.Status.StatusType === "DL" };
}
module.exports = { parseTracking };
