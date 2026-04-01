/**
 * write.ts — Confirm-gated write primitives for Copilot Money
 *
 * All functions accept a `confirm` parameter.
 * - confirm=false (default): dry-run, print what WOULD happen, no mutation
 * - confirm=true: execute the GraphQL mutation
 *
 * EditTransaction requires itemId + accountId + id, but we often only have
 * the transaction `id`. We make a best-effort attempt by looking up the
 * transaction first when itemId/accountId aren't supplied.
 */

import { getClient } from '../client';
import { EDIT_TRANSACTION_MUTATION, BULK_EDIT_TRANSACTIONS_MUTATION } from '../queries';
import { getTransactions } from './transactions';

// ─── Shared helpers ──────────────────────────────────────────────────────────

function dryRun(message: string): void {
  process.stdout.write(`[dry-run] ${message}\n`);
  process.stdout.write('  (Pass --confirm to execute this mutation)\n');
}

interface TransactionMeta {
  id: string;
  itemId: string;
  accountId: string;
}

/**
 * Look up itemId + accountId for a given transaction ID.
 * EditTransaction mutation requires all three fields.
 */
async function resolveTxMeta(txId: string): Promise<TransactionMeta> {
  // The transactions query returns itemId and accountId
  const page = await getTransactions({ limit: 200 });
  const tx = page.transactions.find((t) => t.id === txId);
  if (!tx) {
    throw new Error(
      `Transaction ${txId} not found in recent 200 transactions. ` +
        `Try running 'finance transactions --json' to confirm the ID.`
    );
  }

  // transactions primitive doesn't expose itemId — we need to fetch raw
  // Use a raw graphql call to get itemId
  const raw = await getClient().graphql<{
    transactions: {
      edges: Array<{
        node: { id: string; itemId: string; accountId: string };
      }>;
    };
  }>(
    'Transactions',
    `query Transactions($filter: TransactionFilter) {
      transactions(first: 200, filter: $filter) {
        edges { node { id itemId accountId } }
      }
    }`,
    { filter: { id: txId } }
  );

  const match = raw?.transactions?.edges?.[0]?.node;
  if (match?.itemId) {
    return { id: txId, itemId: match.itemId, accountId: match.accountId };
  }

  // Fallback: try to get itemId from broader fetch
  throw new Error(
    `Could not resolve itemId for transaction ${txId}. ` +
      `This is required by the Copilot API. ` +
      `Try passing --item-id <itemId> directly.`
  );
}

// ─── EditTransaction input type ───────────────────────────────────────────────

interface EditTransactionInput {
  categoryId?: string;
  isReviewed?: boolean;
  userNotes?: string;
  tagIds?: string[];
}

interface EditTransactionResult {
  editTransaction: {
    transaction: {
      id: string;
      categoryId: string | null;
      isReviewed: boolean;
      userNotes: string | null;
    };
  };
}

async function fireEditTransaction(
  meta: TransactionMeta,
  input: EditTransactionInput
): Promise<void> {
  const result = await getClient().graphql<EditTransactionResult>(
    'EditTransaction',
    EDIT_TRANSACTION_MUTATION,
    {
      itemId: meta.itemId,
      accountId: meta.accountId,
      id: meta.id,
      input,
    }
  );

  const updated = result?.editTransaction?.transaction;
  if (!updated) {
    throw new Error('EditTransaction returned no transaction. Mutation may have failed.');
  }

  process.stdout.write(
    `✓ Updated transaction ${meta.id}\n` +
      `  categoryId: ${updated.categoryId ?? 'null'}\n` +
      `  isReviewed: ${updated.isReviewed}\n` +
      `  notes: ${updated.userNotes ?? 'null'}\n`
  );
}

// ─── BulkEditTransactions ─────────────────────────────────────────────────────

interface BulkEditInput {
  isReviewed?: boolean;
  categoryId?: string;
  userNotes?: string;
}

interface BulkEditResult {
  bulkEditTransactions: {
    updated: Array<{ id: string }>;
    failed: Array<{ transaction: { id: string }; error: string; errorCode: string }>;
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Set the category on a single transaction.
 */
export async function setCategory(
  txId: string,
  categoryId: string,
  confirm: boolean
): Promise<void> {
  if (!confirm) {
    dryRun(`Would set transaction ${txId} category to ${categoryId}`);
    return;
  }

  const meta = await resolveTxMeta(txId);
  await fireEditTransaction(meta, { categoryId });
}

/**
 * Mark a single transaction as reviewed.
 */
export async function markReviewed(txId: string, confirm: boolean): Promise<void> {
  if (!confirm) {
    dryRun(`Would mark transaction ${txId} as reviewed`);
    return;
  }

  const meta = await resolveTxMeta(txId);
  await fireEditTransaction(meta, { isReviewed: true });
}

/**
 * Set notes on a single transaction.
 */
export async function setNotes(
  txId: string,
  notes: string,
  confirm: boolean
): Promise<void> {
  if (!confirm) {
    dryRun(`Would set notes on transaction ${txId} to: ${notes}`);
    return;
  }

  const meta = await resolveTxMeta(txId);
  await fireEditTransaction(meta, { userNotes: notes });
}

/**
 * Bulk-mark multiple transactions as reviewed.
 * Uses BulkEditTransactions with an ID filter.
 */
export async function bulkMarkReviewed(
  txIds: string[],
  confirm: boolean
): Promise<void> {
  if (txIds.length === 0) {
    process.stdout.write('No transactions to mark reviewed.\n');
    return;
  }

  if (!confirm) {
    dryRun(
      `Would mark ${txIds.length} transaction(s) as reviewed:\n` +
        txIds.map((id) => `  - ${id}`).join('\n')
    );
    return;
  }

  const input: BulkEditInput = { isReviewed: true };

  // BulkEditTransactions takes a filter, not explicit IDs.
  // We pass each ID individually to avoid sending unknown filter shapes.
  // TODO: if Copilot exposes an `ids` filter field, use it for one round-trip.
  let succeeded = 0;
  let failed = 0;

  for (const txId of txIds) {
    try {
      const result = await getClient().graphql<BulkEditResult>(
        'BulkEditTransactions',
        BULK_EDIT_TRANSACTIONS_MUTATION,
        {
          input,
          filter: { id: txId },
        }
      );

      const updatedCount = result?.bulkEditTransactions?.updated?.length ?? 0;
      const failedItems = result?.bulkEditTransactions?.failed ?? [];

      if (failedItems.length > 0) {
        process.stderr.write(
          `  ✗ ${txId}: ${failedItems[0]?.error ?? 'unknown error'}\n`
        );
        failed++;
      } else {
        succeeded += updatedCount;
      }
    } catch (err) {
      process.stderr.write(`  ✗ ${txId}: ${(err as Error).message}\n`);
      failed++;
    }
  }

  process.stdout.write(
    `Bulk mark reviewed: ${succeeded} updated, ${failed} failed (of ${txIds.length} total)\n`
  );
}
