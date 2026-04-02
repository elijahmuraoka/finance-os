/**
 * transactions-write.ts — Transaction create/delete write primitives
 *
 * All write operations are dry-run by default.
 * Pass confirm=true to execute the GraphQL mutation.
 */
import { getClient, CopilotError } from '../client';
import {
  CREATE_TRANSACTION_MUTATION,
  DELETE_TRANSACTION_MUTATION,
} from '../queries';

function dryRun(message: string): void {
  process.stdout.write(`[dry-run] ${message}\n`);
  process.stdout.write('  (Pass --confirm to execute this mutation)\n');
}

export interface CreateTransactionOpts {
  accountId: string;
  itemId: string;
  amount: number;
  name: string;
  date: string;
}

interface CreateTransactionData {
  createTransaction: {
    id: string;
    name: string;
    amount: number;
    date: string;
    accountId: string;
    itemId: string;
  };
}

interface DeleteTransactionData {
  deleteTransaction: boolean | null;
}

export async function createTransaction(
  opts: CreateTransactionOpts,
  confirm = false
): Promise<{ id: string; name: string; amount: number; date: string } | null> {
  if (!confirm) {
    dryRun(
      `Would create transaction "${opts.name}" for $${Math.abs(opts.amount).toFixed(2)} on ${opts.date} in account ${opts.accountId}`
    );
    return null;
  }

  try {
    const data = await getClient().graphql<CreateTransactionData>(
      'CreateTransaction',
      CREATE_TRANSACTION_MUTATION,
      {
        accountId: opts.accountId,
        itemId: opts.itemId,
        input: {
          amount: opts.amount,
          name: opts.name,
          date: opts.date,
        },
      }
    );

    const created = data?.createTransaction;
    if (!created) {
      throw new CopilotError('CreateTransaction returned no data');
    }

    process.stdout.write(
      `✓ Created transaction "${created.name}" (${created.id}) — $${Math.abs(created.amount).toFixed(2)} on ${created.date}\n`
    );
    return {
      id: created.id,
      name: created.name,
      amount: created.amount,
      date: created.date,
    };
  } catch (err) {
    throw new CopilotError(`Failed to create transaction: ${(err as Error).message}`);
  }
}

export async function deleteTransaction(
  itemId: string,
  accountId: string,
  id: string,
  confirm = false
): Promise<void> {
  if (!confirm) {
    dryRun(`Would delete transaction ${id}`);
    return;
  }

  try {
    await getClient().graphql<DeleteTransactionData>(
      'DeleteTransaction',
      DELETE_TRANSACTION_MUTATION,
      { itemId, accountId, id }
    );

    process.stdout.write(`✓ Deleted transaction ${id}\n`);
  } catch (err) {
    throw new CopilotError(`Failed to delete transaction: ${(err as Error).message}`);
  }
}
