/**
 * commands/budgets.ts — budget, budget set
 */
import {
  formatBudgetTable,
  formatMonthlySpendSummary,
  getBudgetStatus,
  getMonthlySpend,
} from "../primitives/budgets";
import { setBudget } from "../primitives/write";
import { fatal, getCurrentMonth, outputJson, outputText, parseArgs } from "../utils";

export async function cmdBudget(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const { flags: parsedFlags, positional: parsedPositional } = parseArgs(positional);
  const mergedFlags = { ...flags, ...parsedFlags };
  const subcommand = parsedPositional[0];

  if (subcommand === "set") {
    const categoryId = parsedPositional[1];
    const amountRaw = parsedPositional[2];
    if (!categoryId || !amountRaw) {
      fatal("Usage: finance budget set <category-id> <amount> [--month YYYY-MM] [--confirm]");
    }

    const amount = Number(amountRaw);
    if (!Number.isFinite(amount)) {
      fatal(`Invalid amount: ${amountRaw}`);
    }

    const month = (mergedFlags.month as string | undefined) ?? getCurrentMonth();
    const confirm = !!mergedFlags.confirm;
    await setBudget(categoryId, amount, month, confirm);
    return;
  }

  const month = mergedFlags.month as string | undefined;
  const [budgets, monthly] = await Promise.all([getBudgetStatus(month), getMonthlySpend(month)]);

  if (mergedFlags.json) {
    outputJson({ budgets, monthly });
  } else {
    outputText(formatMonthlySpendSummary(monthly));
    outputText("");
    outputText(formatBudgetTable(budgets));
  }
}
