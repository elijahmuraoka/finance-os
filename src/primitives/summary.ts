/**
 * summary.ts — Transaction summary read primitive
 */
import { getClient } from "../client";
import { warn } from "../logger";
import { TRANSACTION_SUMMARY_QUERY } from "../queries";

export interface TransactionSummary {
  transactionsCount: number;
  totalNetIncome: number;
  totalIncome: number;
  totalSpent: number;
}

interface TransactionSummaryData {
  transactionsSummary: {
    transactionsCount: number;
    totalNetIncome: number;
    totalIncome: number;
    totalSpent: number;
  };
}

export interface SummaryFilter {
  startDate?: string;
  endDate?: string;
}

function getMonthRange(month: string): { startDate: string; endDate: string } {
  const [year, mon] = month.split("-").map(Number);
  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${year}-${String(mon).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { startDate, endDate };
}

export async function getTransactionSummary(
  filter?: SummaryFilter,
): Promise<TransactionSummary | null> {
  try {
    const variables: Record<string, unknown> = {};
    if (filter) {
      const txFilter: Record<string, unknown> = {};
      if (filter.startDate) txFilter.startDate = filter.startDate;
      if (filter.endDate) txFilter.endDate = filter.endDate;
      if (Object.keys(txFilter).length > 0) {
        variables.filter = txFilter;
      }
    }

    const data = await getClient().graphql<TransactionSummaryData>(
      "TransactionSummary",
      TRANSACTION_SUMMARY_QUERY,
      variables,
    );

    const summary = data?.transactionsSummary;
    if (!summary) return null;

    return {
      transactionsCount: summary.transactionsCount ?? 0,
      totalNetIncome: summary.totalNetIncome ?? 0,
      totalIncome: summary.totalIncome ?? 0,
      totalSpent: summary.totalSpent ?? 0,
    };
  } catch (err) {
    warn("summary", (err as Error).message);
    return null;
  }
}

export async function getTransactionSummaryByMonth(
  month: string,
): Promise<TransactionSummary | null> {
  const range = getMonthRange(month);
  return getTransactionSummary(range);
}

export function formatSummaryTable(summary: TransactionSummary | null): string {
  if (!summary) return "No transaction summary available.";

  const fmt = (n: number) =>
    `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const lines: string[] = [
    "Transaction Summary:",
    "",
    `  Transactions: ${summary.transactionsCount}`,
    `  Total Income: ${fmt(summary.totalIncome)}`,
    `  Total Spent:  ${fmt(summary.totalSpent)}`,
    `  Net Income:   ${summary.totalNetIncome >= 0 ? "+" : "-"}${fmt(summary.totalNetIncome)}`,
  ];

  return lines.join("\n");
}
