/**
 * investments.ts — Investment performance, balance, and allocation read primitives
 */
import { getClient } from "../client";
import { warn } from "../logger";
import {
  INVESTMENT_ALLOCATION_QUERY,
  INVESTMENT_BALANCE_QUERY,
  INVESTMENT_PERFORMANCE_QUERY,
} from "../queries";

export type TimeFrame = "ONE_MONTH" | "THREE_MONTHS" | "SIX_MONTHS" | "ONE_YEAR" | "ALL";

export interface PerformanceEntry {
  date: string;
  performance: number;
}

export interface BalanceEntry {
  id: string;
  date: string;
  balance: number;
}

export interface AllocationEntry {
  percentage: number;
  amount: number;
  type: string;
  id: string;
}

interface PerformanceData {
  investmentPerformance: Array<{
    date: string;
    performance: number;
  }>;
}

interface BalanceData {
  investmentBalance: Array<{
    id: string;
    date: string;
    balance: number;
  }>;
}

interface AllocationData {
  investmentAllocation: Array<{
    percentage: number;
    amount: number;
    type: string;
    id: string;
  }>;
}

export async function getInvestmentPerformance(timeFrame?: TimeFrame): Promise<PerformanceEntry[]> {
  try {
    const variables: Record<string, unknown> = {};
    if (timeFrame) variables.timeFrame = timeFrame;

    const data = await getClient().graphql<PerformanceData>(
      "InvestmentPerformance",
      INVESTMENT_PERFORMANCE_QUERY,
      variables,
    );

    return (data?.investmentPerformance ?? []).map((e) => ({
      date: e.date ?? "",
      performance: e.performance ?? 0,
    }));
  } catch (err) {
    warn("investments", (err as Error).message);
    return [];
  }
}

export async function getInvestmentBalance(timeFrame?: TimeFrame): Promise<BalanceEntry[]> {
  try {
    const variables: Record<string, unknown> = {};
    if (timeFrame) variables.timeFrame = timeFrame;

    const data = await getClient().graphql<BalanceData>(
      "InvestmentBalance",
      INVESTMENT_BALANCE_QUERY,
      variables,
    );

    return (data?.investmentBalance ?? []).map((e) => ({
      id: e.id ?? "",
      date: e.date ?? "",
      balance: e.balance ?? 0,
    }));
  } catch (err) {
    warn("investments", (err as Error).message);
    return [];
  }
}

export async function getInvestmentAllocation(): Promise<AllocationEntry[]> {
  try {
    const data = await getClient().graphql<AllocationData>(
      "InvestmentAllocation",
      INVESTMENT_ALLOCATION_QUERY,
      {},
    );

    return (data?.investmentAllocation ?? []).map((e) => ({
      percentage: e.percentage ?? 0,
      amount: e.amount ?? 0,
      type: e.type ?? "",
      id: e.id ?? "",
    }));
  } catch (err) {
    warn("investments", (err as Error).message);
    return [];
  }
}

export function formatPerformanceTable(entries: PerformanceEntry[]): string {
  if (entries.length === 0) return "No performance data found.";

  const lines: string[] = [`Investment Performance (${entries.length} entries):`, ""];
  const recent = entries.slice(-12);
  for (const e of recent) {
    const pct = `${e.performance >= 0 ? "+" : ""}${e.performance.toFixed(2)}%`;
    lines.push(`  ${e.date}: ${pct}`);
  }
  return lines.join("\n");
}

export function formatAllocationTable(entries: AllocationEntry[]): string {
  if (entries.length === 0) return "No allocation data found.";

  const lines: string[] = ["Investment Allocation:", ""];
  const sorted = [...entries].sort((a, b) => b.percentage - a.percentage);
  for (const e of sorted) {
    const amt = `$${e.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    lines.push(`  ${e.type}: ${e.percentage.toFixed(1)}% (${amt})`);
  }
  return lines.join("\n");
}
