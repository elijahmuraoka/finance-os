/**
 * commands/accounts.ts — accounts, balances
 */
import { formatAccountsTable, getAccountBalances, getAccounts } from "../primitives/accounts";
import { outputJson, outputText } from "../utils";

export async function cmdAccounts(
  _positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const accounts = await getAccounts();
  if (flags.json) {
    outputJson(accounts);
  } else {
    outputText(formatAccountsTable(accounts));
  }
}

export async function cmdBalances(
  _positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const balances = await getAccountBalances();
  if (flags.json) {
    outputJson(balances);
  } else {
    const lines: string[] = ["Account Balances:", ""];
    for (const b of balances) {
      const sub = b.subType ? ` (${b.subType})` : "";
      lines.push(`  ${b.type}${sub}: ${b.name}  $${b.balance.toFixed(2)}`);
    }
    outputText(lines.join("\n"));
  }
}
