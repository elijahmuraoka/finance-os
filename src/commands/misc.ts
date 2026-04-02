/**
 * commands/misc.ts — snapshot, export, summary, refresh, account-history, transaction create/delete
 */
import * as fs from "node:fs";
import { getClient } from "../client";
import { buildFinanceSnapshot, getSnapshotPath } from "../context-loader";
import type { TimeFrame as AccountHistoryTimeFrame } from "../primitives/account-history";
import { formatBalanceHistoryTable, getBalanceHistory } from "../primitives/account-history";
import { getAccounts } from "../primitives/accounts";
import { formatRefreshResult, refreshAllConnections } from "../primitives/connections";
import { exportTransactions, exportTransactionsByMonth } from "../primitives/export";
import {
  formatSummaryTable,
  getTransactionSummary,
  getTransactionSummaryByMonth,
} from "../primitives/summary";
import { createTransaction, deleteTransaction } from "../primitives/transactions-write";
import { fatal, outputJson, outputText, parseArgs, parseTimeFrame } from "../utils";

export async function cmdSnapshot(
  _positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  await buildFinanceSnapshot();
  outputText("Finance snapshot updated.");

  if (flags.print) {
    const snapshotPath = getSnapshotPath();
    if (fs.existsSync(snapshotPath)) {
      outputText("");
      outputText(fs.readFileSync(snapshotPath, "utf8"));
    }
  }
}

export async function cmdAccountHistory(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const accountId = positional[0];
  if (!accountId) {
    fatal("Usage: finance account-history <account-id> [--timeframe 1M|3M|6M|1Y|ALL] [--json]");
  }

  const accounts = await getAccounts(true);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) {
    fatal(`Account ${accountId} not found`);
  }

  const rawData = await getClient().graphql<{
    accounts: Array<{ id: string; itemId: string; name: string }>;
  }>("Accounts", `query Accounts { accounts { id itemId name } }`, {});

  const rawAccount = rawData?.accounts?.find((a) => a.id === accountId);
  if (!rawAccount?.itemId) {
    fatal(`Could not resolve itemId for account ${accountId}`);
  }

  const timeFrame = parseTimeFrame(flags.timeframe);
  const history = await getBalanceHistory(
    rawAccount.itemId,
    accountId,
    timeFrame as AccountHistoryTimeFrame | undefined,
  );

  if (flags.json) {
    outputJson(history);
  } else {
    outputText(formatBalanceHistoryTable(history, account.name));
  }
}

export async function cmdTransactionWrite(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const { flags: parsedFlags, positional: parsedPositional } = parseArgs(positional);
  const mergedFlags = { ...flags, ...parsedFlags };
  const subcommand = parsedPositional[0];

  if (subcommand === "create") {
    const accountId = mergedFlags.account as string;
    const amount = Number(mergedFlags.amount);
    const name = mergedFlags.name as string;
    const date = mergedFlags.date as string;

    if (!accountId || !Number.isFinite(amount) || !name || !date) {
      fatal(
        "Usage: finance transaction create --account <id> --amount <n> --name <name> --date <YYYY-MM-DD> [--confirm]",
      );
    }

    const rawData = await getClient().graphql<{
      accounts: Array<{ id: string; itemId: string }>;
    }>("Accounts", `query Accounts { accounts { id itemId } }`, {});

    const rawAccount = rawData?.accounts?.find((a) => a.id === accountId);
    if (!rawAccount?.itemId) {
      fatal(`Could not resolve itemId for account ${accountId}`);
    }

    await createTransaction(
      { accountId, itemId: rawAccount.itemId, amount, name, date },
      !!mergedFlags.confirm,
    );
  } else if (subcommand === "delete") {
    const txId = parsedPositional[1];
    if (!txId) fatal("Usage: finance transaction delete <tx-id> [--confirm]");

    const rawData = await getClient().graphql<{
      transactions: {
        edges: Array<{ node: { id: string; itemId: string; accountId: string } }>;
      };
    }>(
      "Transactions",
      `query Transactions($filter: TransactionFilter) {
        transactions(first: 200, filter: $filter) {
          edges { node { id itemId accountId } }
        }
      }`,
      { filter: { id: txId } },
    );

    const match = rawData?.transactions?.edges?.[0]?.node;
    if (!match) {
      fatal(`Transaction ${txId} not found`);
    }

    await deleteTransaction(match.itemId, match.accountId, txId, !!mergedFlags.confirm);
  } else {
    fatal(`Unknown transaction subcommand: ${subcommand}. Use: create, delete`);
  }
}

export async function cmdExport(
  _positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const month = flags.month as string | undefined;

  const result = month ? await exportTransactionsByMonth(month) : await exportTransactions();

  if (flags.json) {
    outputJson(result);
  } else {
    if (result) {
      outputText(`Export URL: ${result.url}`);
      outputText(`Expires: ${result.expiresAt}`);
    } else {
      outputText("Export failed or returned no data.");
    }
  }
}

export async function cmdSummary(
  _positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const month = flags.month as string | undefined;

  const summary = month ? await getTransactionSummaryByMonth(month) : await getTransactionSummary();

  if (flags.json) {
    outputJson(summary);
  } else {
    outputText(formatSummaryTable(summary));
  }
}

export async function cmdRefresh(
  _positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const connections = await refreshAllConnections();
  if (flags.json) {
    outputJson(connections);
  } else {
    outputText(formatRefreshResult(connections));
  }
}
