/**
 * holdings.ts — Investment holdings read primitives
 */
import { getClient } from "../client";
import { warn } from "../logger";
import { AGGREGATED_HOLDINGS_QUERY, HOLDINGS_QUERY } from "../queries";

export interface SecurityInfo {
  currentPrice: number | null;
  lastUpdate: string | null;
  symbol: string;
  name: string;
  type: string;
  id: string;
}

export interface HoldingMetrics {
  averageCost: number | null;
  totalReturn: number | null;
  costBasis: number | null;
}

export interface Holding {
  security: SecurityInfo;
  metrics: HoldingMetrics;
  accountId: string;
  quantity: number;
  itemId: string;
  id: string;
}

export interface AggregatedHolding {
  security: SecurityInfo;
  change: number | null;
  value: number | null;
}

interface HoldingsData {
  holdings: Array<{
    security: {
      currentPrice: number | null;
      lastUpdate: string | null;
      symbol: string;
      name: string;
      type: string;
      id: string;
      marketInfo?: { closeTime: string | null; openTime: string | null } | null;
    };
    metrics: {
      averageCost: number | null;
      totalReturn: number | null;
      costBasis: number | null;
    };
    accountId: string;
    quantity: number;
    itemId: string;
    id: string;
  }>;
}

interface AggregatedHoldingsData {
  aggregatedHoldings: Array<{
    security: {
      currentPrice: number | null;
      lastUpdate: string | null;
      symbol: string;
      name: string;
      type: string;
      id: string;
    };
    change: number | null;
    value: number | null;
  }>;
}

export type TimeFrame = "ONE_MONTH" | "THREE_MONTHS" | "SIX_MONTHS" | "ONE_YEAR" | "ALL";

export async function getHoldings(): Promise<Holding[]> {
  try {
    const data = await getClient().graphql<HoldingsData>("Holdings", HOLDINGS_QUERY, {});

    return (data?.holdings ?? []).map((h) => ({
      security: {
        currentPrice: h.security?.currentPrice ?? null,
        lastUpdate: h.security?.lastUpdate ?? null,
        symbol: h.security?.symbol ?? "",
        name: h.security?.name ?? "",
        type: h.security?.type ?? "",
        id: h.security?.id ?? "",
      },
      metrics: {
        averageCost: h.metrics?.averageCost ?? null,
        totalReturn: h.metrics?.totalReturn ?? null,
        costBasis: h.metrics?.costBasis ?? null,
      },
      accountId: h.accountId ?? "",
      quantity: h.quantity ?? 0,
      itemId: h.itemId ?? "",
      id: h.id ?? "",
    }));
  } catch (err) {
    warn("holdings", (err as Error).message);
    return [];
  }
}

export async function getAggregatedHoldings(timeFrame?: TimeFrame): Promise<AggregatedHolding[]> {
  try {
    const variables: Record<string, unknown> = {};
    if (timeFrame) variables.timeFrame = timeFrame;

    const data = await getClient().graphql<AggregatedHoldingsData>(
      "AggregatedHoldings",
      AGGREGATED_HOLDINGS_QUERY,
      variables,
    );

    return (data?.aggregatedHoldings ?? []).map((h) => ({
      security: {
        currentPrice: h.security?.currentPrice ?? null,
        lastUpdate: h.security?.lastUpdate ?? null,
        symbol: h.security?.symbol ?? "",
        name: h.security?.name ?? "",
        type: h.security?.type ?? "",
        id: h.security?.id ?? "",
      },
      change: h.change ?? null,
      value: h.value ?? null,
    }));
  } catch (err) {
    warn("holdings", (err as Error).message);
    return [];
  }
}

export function formatHoldingsTable(holdings: Holding[]): string {
  if (holdings.length === 0) return "No holdings found.";

  const lines: string[] = [`Investment Holdings (${holdings.length}):`, ""];

  const sorted = [...holdings].sort((a, b) => {
    const aVal = (a.security.currentPrice ?? 0) * a.quantity;
    const bVal = (b.security.currentPrice ?? 0) * b.quantity;
    return bVal - aVal;
  });

  for (const h of sorted) {
    const value = h.security.currentPrice
      ? `$${(h.security.currentPrice * h.quantity).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "?";
    const ret =
      h.metrics.totalReturn !== null
        ? ` (return: ${h.metrics.totalReturn >= 0 ? "+" : ""}$${h.metrics.totalReturn.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
        : "";
    lines.push(
      `  ${h.security.symbol}: ${h.quantity} shares @ $${h.security.currentPrice?.toFixed(2) ?? "?"} = ${value}${ret}`,
    );
  }

  return lines.join("\n");
}

export function formatAggregatedHoldingsTable(holdings: AggregatedHolding[]): string {
  if (holdings.length === 0) return "No aggregated holdings found.";

  const lines: string[] = [`Aggregated Holdings (${holdings.length}):`, ""];

  const sorted = [...holdings].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  for (const h of sorted) {
    const value =
      h.value !== null
        ? `$${h.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "?";
    const change = h.change !== null ? ` (${h.change >= 0 ? "+" : ""}${h.change.toFixed(2)}%)` : "";
    lines.push(`  ${h.security.symbol}: ${value}${change}`);
  }

  return lines.join("\n");
}
