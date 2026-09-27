/**
 * The four money fields, and what is computed from them.
 * Rules BQ-05 … BQ-08 and FN-10 in docs/02-workflow.md.
 *
 *   basePrice     typed    — factory cost or vendor purchase price, per unit
 *   sellingPrice  typed    — quoted to the client in the BOQ, per unit
 *   finalPrice    typed    — agreed after negotiation, per unit
 *   landedCost    computed — "actual price": base + transport + install + rework
 */

import type { BoqItem, ItemPricing } from "@/types";

export interface LineMoney {
  qty: number;
  revenue: number;
  baseCost: number;
  transport: number;
  install: number;
  rework: number;
  /** the "actual price" — what this line really cost Kurchi */
  landedCost: number;
  /** what we expected to make at BOQ time */
  quotedMargin: number;
  /** what we actually made */
  realMargin: number;
  marginPct: number;
  /** quotedMargin − realMargin: discount given away, freight under-estimated, rework */
  erosion: number;
}

export function lineMoney(qty: number, p: ItemPricing): LineMoney {
  const revenue = p.finalPrice * qty;
  const baseCost = p.basePrice * qty;
  const transport = p.allocatedTransport;
  const install = p.allocatedInstall;
  const rework = p.reworkCost;

  const landedCost = baseCost + transport + install + rework;
  const quotedMargin = (p.sellingPrice - p.basePrice) * qty;
  const realMargin = revenue - landedCost;

  return {
    qty,
    revenue,
    baseCost,
    transport,
    install,
    rework,
    landedCost,
    quotedMargin,
    realMargin,
    marginPct: revenue ? (realMargin / revenue) * 100 : 0,
    erosion: quotedMargin - realMargin,
  };
}

export function itemMoney(item: BoqItem): LineMoney {
  return lineMoney(item.qty, item.pricing);
}

export function rollUp(items: BoqItem[]): LineMoney {
  const zero: LineMoney = {
    qty: 0, revenue: 0, baseCost: 0, transport: 0, install: 0, rework: 0,
    landedCost: 0, quotedMargin: 0, realMargin: 0, marginPct: 0, erosion: 0,
  };

  const sum = items.reduce((acc, item) => {
    const m = itemMoney(item);
    return {
      ...acc,
      qty: acc.qty + m.qty,
      revenue: acc.revenue + m.revenue,
      baseCost: acc.baseCost + m.baseCost,
      transport: acc.transport + m.transport,
      install: acc.install + m.install,
      rework: acc.rework + m.rework,
      landedCost: acc.landedCost + m.landedCost,
      quotedMargin: acc.quotedMargin + m.quotedMargin,
      realMargin: acc.realMargin + m.realMargin,
      erosion: acc.erosion + m.erosion,
    };
  }, zero);

  sum.marginPct = sum.revenue ? (sum.realMargin / sum.revenue) * 100 : 0;
  return sum;
}

/**
 * Rule BQ-08 — transport and installation are allocated across a consignment
 * pro-rata by value, unless Admin overrides a line.
 */
export function allocatePro(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  return weights.map((w) => Math.round((w / sum) * total));
}

/* ------------------------------------------------------------ formatting */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatINR(n: number): string {
  return inr.format(n);
}

/** ₹1,24,500 → "₹1.2L", ₹45,00,000 → "₹45L", ₹1,20,00,000 → "₹1.2Cr" */
export function formatCompactINR(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(0)}K`;
  return formatINR(n);
}

export function formatPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}
