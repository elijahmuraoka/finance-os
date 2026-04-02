/**
 * recurring.ts — Recurring transactions (subscriptions) read primitives
 */
import { getClient } from "../client";
import { warn } from "../logger";
import { RECURRING_KEY_METRICS_QUERY, RECURRINGS_QUERY } from "../queries";

export interface RecurringPayment {
  amount: number;
  isPaid: boolean;
  date: string;
}

export interface RecurringRule {
  nameContains: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  days: number[] | null;
}

export interface Recurring {
  id: string;
  name: string;
  frequency: string;
  state: string;
  nextPaymentAmount: number | null;
  nextPaymentDate: string | null;
  categoryId: string | null;
  rule: RecurringRule | null;
  payments: RecurringPayment[];
}

export interface RecurringKeyMetrics {
  averageTransactionAmount: number | null;
  totalSpent: number | null;
  period: string | null;
}

interface RecurringsData {
  recurrings: Array<{
    id: string;
    name: string;
    frequency: string;
    state: string;
    nextPaymentAmount: number | null;
    nextPaymentDate: string | null;
    categoryId: string | null;
    emoji: string | null;
    rule: {
      nameContains: string | null;
      minAmount: number | null;
      maxAmount: number | null;
      days: number[] | null;
    } | null;
    payments: Array<{
      amount: number;
      isPaid: boolean;
      date: string;
    }>;
  }>;
}

interface RecurringKeyMetricsData {
  recurring: {
    id: string;
    keyMetrics: {
      averageTransactionAmount: number | null;
      totalSpent: number | null;
      period: string | null;
    };
  };
}

export async function getRecurrings(): Promise<Recurring[]> {
  try {
    const data = await getClient().graphql<RecurringsData>("Recurrings", RECURRINGS_QUERY, {});

    return (data?.recurrings ?? []).map((r) => ({
      id: r.id ?? "",
      name: r.name ?? "",
      frequency: r.frequency ?? "",
      state: r.state ?? "",
      nextPaymentAmount: r.nextPaymentAmount ?? null,
      nextPaymentDate: r.nextPaymentDate ?? null,
      categoryId: r.categoryId ?? null,
      rule: r.rule
        ? {
            nameContains: r.rule.nameContains ?? null,
            minAmount: r.rule.minAmount ?? null,
            maxAmount: r.rule.maxAmount ?? null,
            days: r.rule.days ?? null,
          }
        : null,
      payments: (r.payments ?? []).map((p) => ({
        amount: p.amount ?? 0,
        isPaid: p.isPaid ?? false,
        date: p.date ?? "",
      })),
    }));
  } catch (err) {
    warn("recurring", (err as Error).message);
    return [];
  }
}

export async function getRecurringMetrics(id: string): Promise<RecurringKeyMetrics | null> {
  try {
    const data = await getClient().graphql<RecurringKeyMetricsData>(
      "RecurringKeyMetrics",
      RECURRING_KEY_METRICS_QUERY,
      { id },
    );

    const metrics = data?.recurring?.keyMetrics;
    if (!metrics) return null;

    return {
      averageTransactionAmount: metrics.averageTransactionAmount ?? null,
      totalSpent: metrics.totalSpent ?? null,
      period: metrics.period ?? null,
    };
  } catch (err) {
    warn("recurring", (err as Error).message);
    return null;
  }
}

function fmtFrequency(freq: string): string {
  switch (freq.toUpperCase()) {
    case "MONTHLY":
      return "/mo";
    case "WEEKLY":
      return "/wk";
    case "BIWEEKLY":
      return "/2wk";
    case "YEARLY":
    case "ANNUALLY":
      return "/yr";
    case "QUARTERLY":
      return "/qtr";
    default:
      return `/${freq.toLowerCase()}`;
  }
}

export function formatRecurringsTable(recurrings: Recurring[]): string {
  if (recurrings.length === 0) return "No recurring transactions found.";

  const lines: string[] = [`Recurring Transactions (${recurrings.length}):`, ""];

  const active = recurrings.filter((r) => r.state.toUpperCase() === "ACTIVE");
  const inactive = recurrings.filter((r) => r.state.toUpperCase() !== "ACTIVE");

  if (active.length > 0) {
    lines.push("  Active:");
    for (const r of active) {
      const amt =
        r.nextPaymentAmount !== null ? `$${Math.abs(r.nextPaymentAmount).toFixed(2)}` : "?";
      const next = r.nextPaymentDate ? ` (next: ${r.nextPaymentDate})` : "";
      lines.push(`    ${r.name}: ${amt}${fmtFrequency(r.frequency)}${next}`);
    }
  }

  if (inactive.length > 0) {
    if (active.length > 0) lines.push("");
    lines.push("  Inactive/Paused:");
    for (const r of inactive) {
      lines.push(`    ${r.name} [${r.state.toLowerCase()}]`);
    }
  }

  return lines.join("\n");
}
