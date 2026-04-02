/**
 * cli.ts — Finance OS CLI router
 *
 * Thin entry point that parses the top-level command and delegates
 * to the appropriate command module under src/commands/.
 *
 * Usage: finance <command> [flags...]
 * Run with no arguments for full help.
 */

import { cmdAccounts, cmdBalances } from "./commands/accounts";
import { cmdBudget } from "./commands/budgets";
import { cmdCategories, cmdCategoryWrite, cmdSpending } from "./commands/categories";
import { cmdCrypto } from "./commands/crypto";
import { cmdDoctor } from "./commands/doctor";
import { cmdAllocation, cmdHoldings, cmdPerformance } from "./commands/investments";
import { cmdMcp } from "./commands/mcp";
import {
  cmdAccountHistory,
  cmdExport,
  cmdRefresh,
  cmdSnapshot,
  cmdSummary,
  cmdTransactionWrite,
} from "./commands/misc";
import { cmdNetworth } from "./commands/networth";
import { cmdRecurring } from "./commands/recurring";
import { cmdReport } from "./commands/report";
import { cmdTags, cmdTagWrite } from "./commands/tags";
import {
  cmdMarkAllReviewed,
  cmdMarkReviewed,
  cmdSetCategory,
  cmdSetNotes,
  cmdTransactions,
} from "./commands/transactions";
import { fatal, parseArgs } from "./utils";

type CommandHandler = (
  positional: string[],
  flags: Record<string, string | boolean>,
) => Promise<void>;

const COMMAND_MAP: Record<string, CommandHandler> = {
  accounts: cmdAccounts,
  balances: cmdBalances,
  transactions: cmdTransactions,
  categories: cmdCategories,
  spending: cmdSpending,
  budget: cmdBudget,
  networth: cmdNetworth,
  snapshot: cmdSnapshot,
  doctor: cmdDoctor,
  "set-category": cmdSetCategory,
  "mark-reviewed": cmdMarkReviewed,
  "set-notes": cmdSetNotes,
  "mark-all-reviewed": cmdMarkAllReviewed,
  category: cmdCategoryWrite,
  holdings: cmdHoldings,
  performance: cmdPerformance,
  allocation: cmdAllocation,
  tags: cmdTags,
  tag: cmdTagWrite,
  recurring: cmdRecurring,
  "account-history": cmdAccountHistory,
  transaction: cmdTransactionWrite,
  export: cmdExport,
  summary: cmdSummary,
  refresh: cmdRefresh,
  crypto: cmdCrypto,
  mcp: cmdMcp,
  report: cmdReport,
};

function printHelp(): void {
  process.stdout.write(
    [
      "Finance OS CLI",
      "",
      "Read commands:",
      "  finance accounts [--json]",
      "  finance balances [--json]",
      "  finance transactions [--limit N] [--unreviewed] [--search TEXT] [--json]",
      "  finance categories [--json]",
      "  finance spending [--month YYYY-MM] [--json]",
      "  finance budget [--month YYYY-MM] [--json]",
      "  finance budget set <category-id> <amount> [--month YYYY-MM] [--confirm]",
      "  finance networth [--history] [--json]",
      "  finance snapshot [--print]",
      "  finance doctor [--json]",
      "",
      "Investment commands:",
      "  finance holdings [--aggregated] [--timeframe 1M|3M|6M|1Y|ALL] [--json]",
      "  finance performance [--timeframe 1M|3M|6M|1Y|ALL] [--json]",
      "  finance allocation [--json]",
      "",
      "Tag commands:",
      "  finance tags [--json]",
      "  finance tag create <name> [--color <colorName>] [--confirm]",
      "  finance tag edit <id> --name <new-name> [--confirm]",
      "  finance tag delete <id> [--confirm]",
      "",
      "Recurring commands:",
      "  finance recurring [--json]",
      "  finance recurring <id> --metrics [--json]",
      "",
      "Account history:",
      "  finance account-history <account-id> [--timeframe 1M|3M|6M|1Y|ALL] [--json]",
      "",
      "Category management (dry-run by default):",
      "  finance category create <name> [--color <colorName>] [--excluded] [--confirm]",
      "  finance category edit <id> --name <new-name> [--color <colorName>] [--excluded] [--confirm]",
      "  finance category delete <id> [--confirm]",
      "",
      "Transaction management (dry-run by default):",
      "  finance transaction create --account <id> --amount <n> --name <name> --date <YYYY-MM-DD> [--confirm]",
      "  finance transaction delete <tx-id> [--confirm]",
      "",
      "Export & summary:",
      "  finance export [--month YYYY-MM]",
      "  finance summary [--month YYYY-MM] [--json]",
      "",
      "Connections:",
      "  finance refresh [--json]",
      "",
      "Crypto commands:",
      "  finance crypto [--json]              — full snapshot (all sources)",
      "  finance crypto kraken [--json]       — Kraken only",
      "  finance crypto gemini [--json]       — Gemini only",
      "  finance crypto wallet [--json]       — on-chain ETH + SOL",
      "  finance crypto summary [--json]      — top holdings aggregated",
      "",
      "Write commands (dry-run by default, add --confirm to execute):",
      "  finance set-category <tx-id> <category-id> [--confirm]",
      "  finance mark-reviewed <tx-id> [--confirm]",
      "  finance set-notes <tx-id> <notes...> [--confirm]",
      "  finance mark-all-reviewed [--confirm]",
      "",
      "Premium commands:",
      "  finance mcp                          — boot Model Context Protocol server",
      "  finance report                       — generate HTML dashboard report",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    printHelp();
  }

  const command = argv[0];
  const rest = argv.slice(1);
  const { flags, positional } = parseArgs(rest);

  const handler = COMMAND_MAP[command];
  if (!handler) {
    fatal(`Unknown command: ${command}. Run 'finance' for help.`);
  }

  try {
    // Commands that need raw rest args (budget, category, tag, transaction, crypto)
    // receive the full rest as positional so they can re-parse subcommands
    const needsRawRest = ["budget", "category", "tag", "transaction", "crypto"];
    if (needsRawRest.includes(command)) {
      await handler(rest, {});
    } else {
      await handler(positional, flags);
    }
  } catch (err) {
    fatal((err as Error).message);
  }
}

main();
