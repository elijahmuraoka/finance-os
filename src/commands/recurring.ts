/**
 * commands/recurring.ts — recurring
 */
import { formatRecurringsTable, getRecurringMetrics, getRecurrings } from "../primitives/recurring";
import { outputJson, outputText } from "../utils";

export async function cmdRecurring(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const id = positional[0];

  if (id && flags.metrics) {
    const metrics = await getRecurringMetrics(id);
    if (flags.json) {
      outputJson(metrics);
    } else {
      if (!metrics) {
        outputText(`No metrics found for recurring ${id}`);
      } else {
        const fmt = (n: number | null) => (n !== null ? `$${Math.abs(n).toFixed(2)}` : "?");
        outputText(`Recurring Metrics (${id}):`);
        outputText(`  Average: ${fmt(metrics.averageTransactionAmount)}`);
        outputText(`  Total Spent: ${fmt(metrics.totalSpent)}`);
        outputText(`  Period: ${metrics.period ?? "?"}`);
      }
    }
    return;
  }

  const recurrings = await getRecurrings();
  if (flags.json) {
    outputJson(recurrings);
  } else {
    outputText(formatRecurringsTable(recurrings));
  }
}
