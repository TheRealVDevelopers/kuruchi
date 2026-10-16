export const INDIA_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
  "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand",
  "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra",
  "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal",
];

export function normalizePostalState(value: string): string | undefined {
  const key = value.trim().toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    "orissa": "Odisha", "pondicherry": "Puducherry", "uttaranchal": "Uttarakhand",
    "nct of delhi": "Delhi", "new delhi": "Delhi",
    "andaman and nicobar": "Andaman and Nicobar Islands",
    "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
    "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  };
  return aliases[key] ?? INDIA_STATES.find((state) => state.toLowerCase() === key);
}

// Only the PIN is sent to the postal directory; no owner or showroom data.
export async function lookupPinState(pin: string, signal?: AbortSignal): Promise<string | undefined> {
  if (!/^[1-9]\d{5}$/.test(pin)) return undefined;
  const response = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal });
  if (!response.ok) throw new Error("Postal lookup unavailable");
  const data = await response.json();
  const result = Array.isArray(data) ? data[0] : undefined;
  if (result?.Status !== "Success" || !Array.isArray(result.PostOffice)) return undefined;
  const states = new Set<string>();
  for (const office of result.PostOffice) {
    // Do not guess if the directory returns an ambiguous or unrecognised state.
    if (String(office.Pincode) !== pin || typeof office.State !== "string") continue;
    const state = normalizePostalState(office.State);
    if (state) states.add(state);
  }
  return states.size === 1 ? [...states][0] : undefined;
}
