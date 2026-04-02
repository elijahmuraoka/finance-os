/**
 * commands/networth.ts — networth
 */
import {
  formatCurrentNetworth,
  formatNetworthTable,
  getCurrentNetworth,
  getNetworthHistory,
} from "../primitives/networth";
import { outputJson, outputText } from "../utils";

export async function cmdNetworth(
  _positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  if (flags.history) {
    const history = await getNetworthHistory();
    if (flags.json) {
      outputJson(history);
    } else {
      outputText(formatNetworthTable(history));
    }
  } else {
    const current = await getCurrentNetworth();
    if (flags.json) {
      outputJson(current);
    } else {
      outputText(formatCurrentNetworth(current));
    }
  }
}
