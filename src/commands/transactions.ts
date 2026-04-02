/**
 * commands/transactions.ts — transactions, set-category, mark-reviewed, set-notes, mark-all-reviewed
 */
import {
  formatTransactionsTable,
  getTransactions,
  getUnreviewed,
  searchTransactions,
} from "../primitives/transactions";
import { bulkMarkReviewed, markReviewed, setCategory, setNotes } from "../primitives/write";
import { fatal, outputJson, outputText } from "../utils";

export async function cmdTransactions(
  _positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const limit = flags.limit ? parseInt(flags.limit as string, 10) : 50;
  const unreviewed = !!flags.unreviewed;
  const search = flags.search as string | undefined;

  let transactions: Awaited<ReturnType<typeof getUnreviewed>>;

  if (unreviewed) {
    transactions = await getUnreviewed();
  } else if (search) {
    transactions = await searchTransactions(search);
  } else {
    const page = await getTransactions({ limit });
    transactions = page.transactions;
  }

  if (flags.json) {
    outputJson(transactions);
  } else {
    outputText(formatTransactionsTable(transactions));
  }
}

export async function cmdSetCategory(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const txId = positional[0];
  const categoryId = positional[1];
  if (!txId || !categoryId) {
    fatal("Usage: finance set-category <tx-id> <category-id> [--confirm]");
  }
  const confirm = !!flags.confirm;
  await setCategory(txId, categoryId, confirm);
}

export async function cmdMarkReviewed(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const txId = positional[0];
  if (!txId) {
    fatal("Usage: finance mark-reviewed <tx-id> [--confirm]");
  }
  const confirm = !!flags.confirm;
  await markReviewed(txId, confirm);
}

export async function cmdSetNotes(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const txId = positional[0];
  const notes = positional.slice(1).join(" ") || (flags.notes as string);
  if (!txId || !notes) {
    fatal("Usage: finance set-notes <tx-id> <notes> [--confirm]");
  }
  const confirm = !!flags.confirm;
  await setNotes(txId, notes, confirm);
}

export async function cmdMarkAllReviewed(
  _positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const confirm = !!flags.confirm;
  const unreviewed = await getUnreviewed();

  if (unreviewed.length === 0) {
    outputText("No unreviewed transactions found.");
    return;
  }

  const ids = unreviewed.map((t) => t.id);
  await bulkMarkReviewed(ids, confirm);
}
