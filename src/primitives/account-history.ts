/**
 * account-history.ts — Per-account balance history read primitive
 */
import { getClient } from "../client";
import { warn } from "../logger";
import { BALANCE_HISTORY_QUERY } from "../queries";

export type TimeFrame = "ONE_MONTH" | "THREE_MONTHS" | "SIX_MONTHS" | "ONE_YEAR" | "ALL";

export interface BalanceHistoryEntry {
  date: string;
  balance: number;
}

interface BalanceHistoryData {
  accountBalanceHistory: Array<{
    date: string;
    balance: number;
  }>;
}

/**
 * Get balance history for a specific account.
 * Requires both itemId and accountId from the account record.
 */
export async function getBalanceHistory(
  itemId: string,
  accountId: string,
  timeFrame?: TimeFrame,
): Promise<BalanceHistoryEntry[]> {
  try {
    const variables: Record<string, unknown> = { itemId, accountId };
    if (timeFrame) variables.timeFrame = timeFrame;

    const data = await getClient().graphql<BalanceHistoryData>(
      "BalanceHistory",
      BALANCE_HISTORY_QUERY,
      variables,
    );

    return (data?.accountBalanceHistory ?? []).map((e) => ({
      date: e.date ?? "",
      balance: e.balance ?? 0,
    }));
  } catch (err) {
    warn("account-history", (err as Error).message);
    return [];
  }
}

export function formatBalanceHistoryTable(entries: BalanceHistoryEntry[], label?: string): string {
  if (entries.length === 0) return "No balance history found.";

  const title = label ? `Balance History — ${label}` : "Balance History";
  const lines: string[] = [`${title} (${entries.length} entries):`, ""];

  const recent = entries.slice(-12);
  for (const e of recent) {
    const bal = `$${e.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    lines.push(`  ${e.date}: ${bal}`);
  }

  if (entries.length > 12) {
    lines.push(`  ... (${entries.length - 12} more entries)`);
  }

  return lines.join("\n");
}
