/**
 * transactions.ts — Transaction read primitives
 */
import { getClient } from '../client';
import { TRANSACTIONS_QUERY } from '../queries';

export interface Tag {
  id: string;
  name: string;
  colorName: string | null;
}

export interface Transaction {
  id: string;
  name: string;
  amount: number;
  date: string;
  accountId: string;
  categoryId: string | null;
  isReviewed: boolean;
  isPending: boolean;
  userNotes: string | null;
  recurringId: string | null;
  type: string;
  tags: Tag[];
}

export interface TransactionPage {
  transactions: Transaction[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
    hasPreviousPage: boolean;
    startCursor: string | null;
  };
}

export interface GetTransactionsOpts {
  limit?: number;
  after?: string;
  unreviewed?: boolean;
  categoryId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

interface RawTag {
  id: string;
  name: string;
  colorName: string | null;
  __typename: string;
}

interface RawTransaction {
  id: string;
  name: string;
  amount: number;
  date: string;
  accountId: string;
  categoryId: string | null;
  isReviewed: boolean;
  isPending: boolean;
  userNotes: string | null;
  recurringId: string | null;
  type: string;
  tags: RawTag[];
  __typename: string;
}

interface RawEdge {
  cursor: string;
  node: RawTransaction;
  __typename: string;
}

interface RawPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
  hasPreviousPage: boolean;
  startCursor: string | null;
  __typename: string;
}

interface TransactionsData {
  transactions: {
    edges: RawEdge[];
    pageInfo: RawPageInfo;
    __typename: string;
  };
}

function buildFilter(opts: GetTransactionsOpts): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (opts.unreviewed) {
    filter['isReviewed'] = false;
  }
  if (opts.categoryId) {
    filter['categoryId'] = opts.categoryId;
  }
  if (opts.search) {
    filter['search'] = opts.search;
  }
  if (opts.startDate || opts.endDate) {
    const dateFilter: Record<string, string> = {};
    if (opts.startDate) dateFilter['gte'] = opts.startDate;
    if (opts.endDate) dateFilter['lte'] = opts.endDate;
    filter['date'] = dateFilter;
  }

  return filter;
}

function mapTransaction(raw: RawTransaction): Transaction {
  return {
    id: raw.id,
    name: raw.name,
    amount: raw.amount ?? 0,
    date: raw.date,
    accountId: raw.accountId,
    categoryId: raw.categoryId ?? null,
    isReviewed: raw.isReviewed ?? false,
    isPending: raw.isPending ?? false,
    userNotes: raw.userNotes ?? null,
    recurringId: raw.recurringId ?? null,
    type: raw.type,
    tags: (raw.tags ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      colorName: t.colorName ?? null,
    })),
  };
}

export async function getTransactions(
  opts: GetTransactionsOpts = {}
): Promise<TransactionPage> {
  try {
    const variables: Record<string, unknown> = {
      first: opts.limit ?? 50,
    };

    if (opts.after) variables['after'] = opts.after;

    const filter = buildFilter(opts);
    if (Object.keys(filter).length > 0) {
      variables['filter'] = filter;
    }

    const data = await getClient().graphql<TransactionsData>(
      'Transactions',
      TRANSACTIONS_QUERY,
      variables
    );

    const raw = data?.transactions;
    if (!raw) {
      return { transactions: [], pageInfo: { hasNextPage: false, endCursor: null, hasPreviousPage: false, startCursor: null } };
    }

    return {
      transactions: (raw.edges ?? []).map((e) => mapTransaction(e.node)),
      pageInfo: {
        hasNextPage: raw.pageInfo?.hasNextPage ?? false,
        endCursor: raw.pageInfo?.endCursor ?? null,
        hasPreviousPage: raw.pageInfo?.hasPreviousPage ?? false,
        startCursor: raw.pageInfo?.startCursor ?? null,
      },
    };
  } catch (err) {
    console.warn(`[transactions] Warning: ${(err as Error).message}`);
    return { transactions: [], pageInfo: { hasNextPage: false, endCursor: null, hasPreviousPage: false, startCursor: null } };
  }
}

export async function getUnreviewed(): Promise<Transaction[]> {
  const page = await getTransactions({ unreviewed: true, limit: 100 });
  return page.transactions;
}

export async function searchTransactions(query: string): Promise<Transaction[]> {
  const page = await getTransactions({ search: query, limit: 50 });
  return page.transactions;
}

export function formatTransactionsTable(transactions: Transaction[]): string {
  if (transactions.length === 0) return 'No transactions found.';

  const lines: string[] = [`Transactions (${transactions.length}):`, ''];
  for (const t of transactions) {
    const reviewed = t.isReviewed ? '✓' : '○';
    const pending = t.isPending ? ' [pending]' : '';
    const amount = t.amount.toFixed(2);
    const sign = t.amount < 0 ? '' : '+';
    lines.push(`  ${reviewed} ${t.date}  ${sign}$${amount}  ${t.name}${pending}`);
    if (t.userNotes) {
      lines.push(`     Notes: ${t.userNotes}`);
    }
  }

  return lines.join('\n');
}
