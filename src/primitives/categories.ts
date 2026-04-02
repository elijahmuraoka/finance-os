/**
 * categories.ts — Category read primitives
 */
import { getClient } from "../client";
import { warn } from "../logger";
import { CATEGORIES_QUERY } from "../queries";

export interface Category {
  id: string;
  name: string;
  colorName: string | null;
  isExcluded: boolean;
  isRolloverDisabled: boolean;
  parentId?: string;
}

export interface CategoryWithSpend extends Category {
  spendCurrentMonth: number | null;
  budgetCurrentMonth: number | null;
  month: string | null;
}

export interface SpendingByCategory {
  categoryId: string;
  categoryName: string;
  budgeted: number | null;
  actual: number;
  remaining: number | null;
  month: string;
}

interface RawSpendMonthly {
  amount: number;
  month: string;
  id: string;
  __typename: string;
}

interface RawBudgetMonthly {
  amount: number;
  resolvedAmount: number;
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
  colorName: string | null;
  isExcluded: boolean;
  isRolloverDisabled: boolean;
  templateId: string | null;
  spend?: RawSpend | null;
  budget?: RawBudget | null;
  childCategories?: RawCategory[];
  __typename: string;
}

interface CategoriesData {
  categories: RawCategory[];
}

export interface GetCategoriesOpts {
  withSpend?: boolean;
  withBudget?: boolean;
}

function mapCategory(raw: RawCategory, parentId?: string): Category {
  return {
    id: raw.id,
    name: raw.name,
    colorName: raw.colorName ?? null,
    isExcluded: raw.isExcluded ?? false,
    isRolloverDisabled: raw.isRolloverDisabled ?? false,
    ...(parentId ? { parentId } : {}),
  };
}

export async function getCategories(opts: GetCategoriesOpts = {}): Promise<Category[]> {
  try {
    const data = await getClient().graphql<CategoriesData>("Categories", CATEGORIES_QUERY, {
      spend: opts.withSpend ?? false,
      budget: opts.withBudget ?? false,
      rollovers: null,
    });

    const raw = data?.categories ?? [];
    const result: Category[] = [];

    for (const cat of raw) {
      result.push(mapCategory(cat));
      for (const child of cat.childCategories ?? []) {
        result.push(mapCategory(child, cat.id));
      }
    }

    return result;
  } catch (err) {
    warn("categories", (err as Error).message);
    return [];
  }
}

export async function getSpendingByCategory(month?: string): Promise<SpendingByCategory[]> {
  try {
    const targetMonth = month ?? getCurrentMonth();

    const data = await getClient().graphql<CategoriesData>("Categories", CATEGORIES_QUERY, {
      spend: true,
      budget: true,
      rollovers: null,
    });

    const raw = data?.categories ?? [];
    const result: SpendingByCategory[] = [];

    function processCategory(cat: RawCategory): void {
      // Find spend for target month
      const spendMonthly =
        cat.spend?.current?.month === targetMonth
          ? cat.spend.current
          : (cat.spend?.histories?.find((h) => h.month === targetMonth) ?? null);

      const budgetMonthly =
        cat.budget?.current?.month === targetMonth
          ? cat.budget.current
          : (cat.budget?.histories?.find((h) => h.month === targetMonth) ?? null);

      const actual = spendMonthly?.amount ?? 0;
      const budgeted = budgetMonthly?.resolvedAmount ?? budgetMonthly?.amount ?? null;

      if (actual !== 0 || budgeted !== null) {
        result.push({
          categoryId: cat.id,
          categoryName: cat.name,
          budgeted,
          actual,
          remaining: budgeted !== null ? budgeted - actual : null,
          month: targetMonth,
        });
      }

      for (const child of cat.childCategories ?? []) {
        processCategory(child);
      }
    }

    for (const cat of raw) {
      processCategory(cat);
    }

    return result;
  } catch (err) {
    warn("categories", (err as Error).message);
    return [];
  }
}

function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function formatCategoriesTable(categories: Category[]): string {
  if (categories.length === 0) return "No categories found.";

  const lines: string[] = [`Categories (${categories.length}):`, ""];
  const topLevel = categories.filter((c) => !c.parentId);
  const children: Record<string, Category[]> = {};
  for (const c of categories.filter((c) => c.parentId)) {
    const pid = c.parentId as string;
    if (!children[pid]) children[pid] = [];
    children[pid].push(c);
  }

  for (const cat of topLevel) {
    const excl = cat.isExcluded ? " [excluded]" : "";
    lines.push(`  ${cat.name}${excl}`);
    for (const child of children[cat.id] ?? []) {
      const childExcl = child.isExcluded ? " [excluded]" : "";
      lines.push(`    └ ${child.name}${childExcl}`);
    }
  }

  return lines.join("\n");
}

export function formatSpendingTable(spending: SpendingByCategory[]): string {
  if (spending.length === 0) return "No spending data found.";

  const sorted = [...spending].sort((a, b) => b.actual - a.actual);
  const lines: string[] = [`Spending by Category (${spending[0]?.month ?? ""}):`, ""];

  for (const s of sorted) {
    const actual = `$${s.actual.toFixed(2)}`;
    const budget = s.budgeted !== null ? ` / $${s.budgeted.toFixed(2)}` : "";
    const remaining =
      s.remaining !== null
        ? s.remaining >= 0
          ? ` (${s.remaining.toFixed(2)} left)`
          : ` (OVER by $${Math.abs(s.remaining).toFixed(2)})`
        : "";
    lines.push(`  ${s.categoryName}: ${actual}${budget}${remaining}`);
  }

  return lines.join("\n");
}
