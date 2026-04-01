/**
 * budgets.ts — Budget read primitives
 */
import { getClient } from '../client';
import { CATEGORIES_QUERY, MONTHLY_SPEND_QUERY, SPENDS_QUERY } from '../queries';

export interface BudgetStatus {
  categoryId: string;
  categoryName: string;
  budgeted: number;
  actual: number;
  remaining: number;
  isOverBudget: boolean;
  month: string;
}

export interface MonthlySpend {
  total: number;
  budgeted: number | null;
  remaining: number | null;
  month: string;
}

export interface MonthlySpendSummary {
  totalAmount: number;
  comparisonAmount: number | null;
  date: string;
  id: string;
}

interface RawSpendMonthly {
  amount: number;
  month: string;
  id: string;
  comparisonAmount: number | null;
  unpaidRecurringAmount: number | null;
  __typename: string;
}

interface RawBudgetMonthly {
  amount: number;
  resolvedAmount: number;
  unassignedAmount: number | null;
  childAmount: number | null;
  goalAmount: number | null;
  rolloverAmount: number | null;
  month: string;
  id: string;
  __typename: string;
}

interface RawSpend {
  current: RawSpendMonthly | null;
  histories: RawSpendMonthly[];
  __typename: string;
}

interface RawBudget {
  current: RawBudgetMonthly | null;
  histories: RawBudgetMonthly[];
  __typename: string;
}

interface RawCategory {
  id: string;
  name: string;
  isExcluded: boolean;
  spend?: RawSpend | null;
  budget?: RawBudget | null;
  childCategories?: RawCategory[];
  __typename: string;
}

interface CategoriesData {
  categories: RawCategory[];
}

interface MonthlySpendData {
  monthlySpending: Array<{
    totalAmount: number;
    comparisonAmount: number | null;
    date: string;
    id: string;
    __typename: string;
  }>;
}

interface SpendsData {
  categoriesTotal: {
    spend: {
      current: RawSpendMonthly | null;
      histories: RawSpendMonthly[];
      __typename: string;
    } | null;
    __typename: string;
  };
}

function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export async function getBudgetStatus(month?: string): Promise<BudgetStatus[]> {
  try {
    const targetMonth = month ?? getCurrentMonth();

    const data = await getClient().graphql<CategoriesData>(
      'Categories',
      CATEGORIES_QUERY,
      { spend: true, budget: true, rollovers: null }
    );

    const categories = data?.categories ?? [];
    const result: BudgetStatus[] = [];

    function processCategory(cat: RawCategory): void {
      if (cat.isExcluded) return;

      const spendMonthly =
        cat.spend?.current?.month === targetMonth
          ? cat.spend.current
          : cat.spend?.histories?.find((h) => h.month === targetMonth) ?? null;

      const budgetMonthly =
        cat.budget?.current?.month === targetMonth
          ? cat.budget.current
          : cat.budget?.histories?.find((h) => h.month === targetMonth) ?? null;

      const actual = spendMonthly?.amount ?? 0;
      const budgeted = budgetMonthly?.resolvedAmount ?? budgetMonthly?.amount ?? 0;

      // Only include if there's budget or actual spend
      if (budgeted !== 0 || actual !== 0) {
        const remaining = budgeted - actual;
        result.push({
          categoryId: cat.id,
          categoryName: cat.name,
          budgeted,
          actual,
          remaining,
          isOverBudget: remaining < 0,
          month: targetMonth,
        });
      }

      for (const child of cat.childCategories ?? []) {
        processCategory(child);
      }
    }

    for (const cat of categories) {
      processCategory(cat);
    }

    // Sort: over budget first (by most over), then by actual spend descending
    return result.sort((a, b) => {
      if (a.isOverBudget && !b.isOverBudget) return -1;
      if (!a.isOverBudget && b.isOverBudget) return 1;
      if (a.isOverBudget && b.isOverBudget) return a.remaining - b.remaining; // more negative = worse
      return b.actual - a.actual;
    });
  } catch (err) {
    console.warn(`[budgets] Warning: ${(err as Error).message}`);
    return [];
  }
}

export async function getMonthlySpend(month?: string): Promise<MonthlySpend> {
  const targetMonth = month ?? getCurrentMonth();

  try {
    // Try MonthlySpend query first — gives aggregate totals
    const data = await getClient().graphql<MonthlySpendData>(
      'MonthlySpend',
      MONTHLY_SPEND_QUERY,
      {}
    );

    const spending = data?.monthlySpending ?? [];
    // Find entry matching target month (date field is YYYY-MM-DD, month is YYYY-MM)
    const entry = spending.find((s) => s.date?.startsWith(targetMonth));

    if (entry) {
      return {
        total: entry.totalAmount ?? 0,
        budgeted: entry.comparisonAmount ?? null,
        remaining:
          entry.comparisonAmount !== null
            ? entry.comparisonAmount - (entry.totalAmount ?? 0)
            : null,
        month: targetMonth,
      };
    }

    // Fallback: derive from Spends query
    return await getMonthlySpendFromSpends(targetMonth);
  } catch (err) {
    console.warn(`[budgets] getMonthlySpend warning: ${(err as Error).message}`);
    return { total: 0, budgeted: null, remaining: null, month: targetMonth };
  }
}

async function getMonthlySpendFromSpends(targetMonth: string): Promise<MonthlySpend> {
  try {
    const data = await getClient().graphql<SpendsData>(
      'Spends',
      SPENDS_QUERY,
      { history: true }
    );

    const spend = data?.categoriesTotal?.spend;
    if (!spend) {
      return { total: 0, budgeted: null, remaining: null, month: targetMonth };
    }

    const monthly =
      spend.current?.month === targetMonth
        ? spend.current
        : spend.histories?.find((h) => h.month === targetMonth) ?? null;

    return {
      total: monthly?.amount ?? 0,
      budgeted: monthly?.comparisonAmount ?? null,
      remaining:
        monthly?.comparisonAmount !== null && monthly?.comparisonAmount !== undefined
          ? monthly.comparisonAmount - (monthly.amount ?? 0)
          : null,
      month: targetMonth,
    };
  } catch {
    return { total: 0, budgeted: null, remaining: null, month: targetMonth };
  }
}

export function formatBudgetTable(budgets: BudgetStatus[]): string {
  if (budgets.length === 0) return 'No budget data found.';

  const month = budgets[0]?.month ?? '';
  const lines: string[] = [`Budget Status (${month}):`, ''];

  for (const b of budgets) {
    const pct = b.budgeted > 0 ? Math.round((b.actual / b.budgeted) * 100) : null;
    const pctStr = pct !== null ? ` (${pct}%)` : '';
    const status = b.isOverBudget ? '⚠️ ' : '  ';
    const remaining =
      b.isOverBudget
        ? ` OVER $${Math.abs(b.remaining).toFixed(2)}`
        : ` $${b.remaining.toFixed(2)} left`;
    lines.push(
      `${status}${b.categoryName}: $${b.actual.toFixed(2)} / $${b.budgeted.toFixed(2)}${pctStr}${remaining}`
    );
  }

  return lines.join('\n');
}

export function formatMonthlySpendSummary(spend: MonthlySpend): string {
  const lines: string[] = [`Monthly Spend (${spend.month}):`, ''];
  lines.push(`  Total spent: $${spend.total.toFixed(2)}`);
  if (spend.budgeted !== null) {
    lines.push(`  Budget: $${spend.budgeted.toFixed(2)}`);
  }
  if (spend.remaining !== null) {
    const over = spend.remaining < 0;
    const label = over ? 'Over budget by' : 'Remaining';
    lines.push(`  ${label}: $${Math.abs(spend.remaining).toFixed(2)}`);
  }
  return lines.join('\n');
}
