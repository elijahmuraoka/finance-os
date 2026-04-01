/**
 * accounts.ts — Account read primitives
 */
import { getClient } from '../client';
import { ACCOUNTS_QUERY } from '../queries';

export interface Account {
  id: string;
  name: string;
  type: string;
  subType: string | null;
  balance: number;
  hasLiveBalance: boolean;
  mask: string | null;
  isManual: boolean;
  institutionId: string | null;
  isUserHidden: boolean;
  isUserClosed: boolean;
  limit: number | null;
  color: string | null;
}

export interface AccountBalance {
  id: string;
  name: string;
  balance: number;
  type: string;
  subType: string | null;
}

interface RawAccount {
  id: string;
  name: string;
  type: string;
  subType: string | null;
  balance: number;
  liveBalance: boolean | null;
  hasLiveBalance: boolean;
  mask: string | null;
  isManual: boolean;
  institutionId: string | null;
  isUserHidden: boolean;
  isUserClosed: boolean;
  limit: number | null;
  color: string | null;
  __typename: string;
}

interface AccountsResponse {
  accounts: RawAccount[];
}

export async function getAccounts(includeHidden = false): Promise<Account[]> {
  try {
    const data = await getClient().graphql<AccountsResponse>(
      'Accounts',
      ACCOUNTS_QUERY,
      {}
    );

    const accounts = data?.accounts ?? [];
    return accounts
      .filter((a) => includeHidden || (!a.isUserHidden && !a.isUserClosed))
      .map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        subType: a.subType ?? null,
        balance: a.balance ?? 0,
        hasLiveBalance: a.hasLiveBalance ?? false,
        mask: a.mask ?? null,
        isManual: a.isManual ?? false,
        institutionId: a.institutionId ?? null,
        isUserHidden: a.isUserHidden ?? false,
        isUserClosed: a.isUserClosed ?? false,
        limit: a.limit ?? null,
        color: a.color ?? null,
      }));
  } catch (err) {
    console.warn(`[accounts] Warning: ${(err as Error).message}`);
    return [];
  }
}

export async function getAccountBalances(): Promise<AccountBalance[]> {
  const accounts = await getAccounts();
  return accounts
    .map((a) => ({
      id: a.id,
      name: a.name,
      balance: a.balance,
      type: a.type,
      subType: a.subType,
    }))
    .sort((a, b) => a.type.localeCompare(b.type));
}

export function formatAccountsTable(accounts: Account[]): string {
  if (accounts.length === 0) return 'No accounts found.';

  const lines: string[] = ['Accounts:', ''];
  const byType: Record<string, Account[]> = {};
  for (const a of accounts) {
    if (!byType[a.type]) byType[a.type] = [];
    byType[a.type].push(a);
  }

  for (const [type, accts] of Object.entries(byType)) {
    lines.push(`  ${type.toUpperCase()}`);
    for (const a of accts) {
      const bal = a.balance.toFixed(2);
      const mask = a.mask ? ` (...${a.mask})` : '';
      const manual = a.isManual ? ' [manual]' : '';
      lines.push(`    ${a.name}${mask}${manual}: $${bal}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
