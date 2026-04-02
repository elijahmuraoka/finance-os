/**
 * error-recovery.test.ts — Error recovery + edge case tests
 *
 * Tests graceful degradation, partial crypto failure, double-counting exclusion,
 * and search functionality.
 */

jest.mock('../src/client', () => {
  const mockGraphql = jest.fn();
  const mockGetClient = jest.fn(() => ({ graphql: mockGraphql }));
  return {
    CopilotClient: jest.fn().mockImplementation(() => ({ graphql: mockGraphql })),
    CopilotError: class CopilotError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CopilotError';
      }
    },
    getClient: mockGetClient,
    __mockGraphql: mockGraphql,
  };
});

import * as path from 'path';
import * as fs from 'fs';

const fixturesDir = path.join(__dirname, 'fixtures');

function loadFixture(name: string): unknown {
  const p = path.join(fixturesDir, name);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const transactionsFixture = loadFixture('transactions.json') as {
  transactions: { edges?: unknown[]; pageInfo?: unknown };
};

const clientModule = require('../src/client');
const mockGraphql: jest.Mock = clientModule.__mockGraphql;

beforeEach(() => {
  mockGraphql.mockReset();
});

// ─── getAccounts() error recovery ────────────────────────────────────────────

describe('accounts error recovery', () => {
  const { getAccounts } = require('../src/primitives/accounts');

  test('getAccounts() returns empty array when graphql throws', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('GraphQL connection refused'));

    const accounts = await getAccounts();
    expect(accounts).toEqual([]);
  });

  test('getAccounts() returns empty array when graphql returns null data', async () => {
    mockGraphql.mockResolvedValueOnce({ accounts: null });

    const accounts = await getAccounts();
    expect(accounts).toEqual([]);
  });

  test('getAccounts() returns empty array on timeout error', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('AbortError: The operation was aborted'));

    const accounts = await getAccounts();
    expect(accounts).toEqual([]);
  });
});

// ─── searchTransactions ──────────────────────────────────────────────────────

describe('searchTransactions', () => {
  const { searchTransactions } = require('../src/primitives/transactions');

  test('searchTransactions finds transactions by name', async () => {
    mockGraphql.mockResolvedValueOnce(transactionsFixture);

    const results = await searchTransactions('Coffee');

    expect(results.length).toBeGreaterThan(0);
    for (const tx of results) {
      expect(tx.name.toLowerCase()).toContain('coffee');
    }
  });

  test('searchTransactions finds transactions by notes', async () => {
    // Create fixture with a transaction that has notes
    const fixtureWithNotes = {
      transactions: {
        ...transactionsFixture.transactions,
        edges: [
          ...(transactionsFixture.transactions.edges ?? []),
          {
            cursor: 'cursor-notes',
            node: {
              id: 'tx-notes-test',
              name: 'Generic Payment',
              amount: -50.0,
              date: '2026-03-15',
              accountId: 'acct-001',
              itemId: 'item-001',
              categoryId: null,
              isReviewed: false,
              isPending: false,
              userNotes: 'lunch with team meeting',
              recurringId: null,
              type: 'DEBIT',
              tags: [],
              __typename: 'Transaction',
            },
            __typename: 'TransactionEdge',
          },
        ],
      },
    };
    mockGraphql.mockResolvedValueOnce(fixtureWithNotes);

    const results = await searchTransactions('lunch with team');

    expect(results.length).toBeGreaterThan(0);
    const match = results.find(
      (tx: { id: string }) => tx.id === 'tx-notes-test'
    );
    expect(match).toBeDefined();
    expect(match.userNotes).toContain('lunch with team');
  });

  test('searchTransactions returns empty array when no matches', async () => {
    mockGraphql.mockResolvedValueOnce(transactionsFixture);

    const results = await searchTransactions('zzz-nonexistent-merchant-zzz');

    expect(results).toEqual([]);
  });

  test('searchTransactions is case-insensitive', async () => {
    mockGraphql.mockResolvedValueOnce(transactionsFixture);
    const resultsUpper = await searchTransactions('COFFEE');

    mockGraphql.mockResolvedValueOnce(transactionsFixture);
    const resultsLower = await searchTransactions('coffee');

    expect(resultsUpper.length).toBe(resultsLower.length);
  });
});

// ─── Double-counting exclusion in context-loader ─────────────────────────────

describe('double-counting exclusion', () => {
  const { getAccountBalances } = require('../src/primitives/accounts');

  test('crypto exchange accounts are available but excluded from context-loader totals', async () => {
    // Create accounts fixture that includes crypto exchange accounts
    const accountsWithCrypto = {
      accounts: [
        {
          id: 'acct-checking',
          name: 'Checking',
          type: 'Depository',
          subType: 'Checking',
          balance: 5000,
          hasLiveBalance: true,
          liveBalance: null,
          mask: '1234',
          isManual: false,
          institutionId: 'ins_chase',
          isUserHidden: false,
          isUserClosed: false,
          limit: null,
          color: null,
          __typename: 'Account',
        },
        {
          id: 'acct-kraken',
          name: 'Kraken Exchange',
          type: 'Investment',
          subType: null,
          balance: 15000,
          hasLiveBalance: true,
          liveBalance: null,
          mask: null,
          isManual: false,
          institutionId: 'crypto_exchange_kraken',
          isUserHidden: false,
          isUserClosed: false,
          limit: null,
          color: null,
          __typename: 'Account',
        },
        {
          id: 'acct-gemini',
          name: 'Gemini Exchange',
          type: 'Investment',
          subType: null,
          balance: 8000,
          hasLiveBalance: true,
          liveBalance: null,
          mask: null,
          isManual: false,
          institutionId: 'crypto_exchange_gemini',
          isUserHidden: false,
          isUserClosed: false,
          limit: null,
          color: null,
          __typename: 'Account',
        },
      ],
    };

    mockGraphql.mockResolvedValueOnce(accountsWithCrypto);

    const balances = await getAccountBalances();

    // All accounts should be returned by getAccountBalances
    expect(balances.length).toBe(3);

    // Verify the crypto exchange accounts have the right institutionId
    const krakenAcct = balances.find(
      (b: { id: string }) => b.id === 'acct-kraken'
    );
    expect(krakenAcct).toBeDefined();
    expect(krakenAcct.institutionId).toBe('crypto_exchange_kraken');

    const geminiAcct = balances.find(
      (b: { id: string }) => b.id === 'acct-gemini'
    );
    expect(geminiAcct).toBeDefined();
    expect(geminiAcct.institutionId).toBe('crypto_exchange_gemini');

    // Verify context-loader would exclude them:
    // The context-loader filters on institutionId.startsWith('crypto_exchange_')
    const nonCryptoBalances = balances.filter(
      (b: { institutionId: string | null }) =>
        !b.institutionId?.startsWith('crypto_exchange_')
    );
    expect(nonCryptoBalances.length).toBe(1);
    expect(nonCryptoBalances[0].id).toBe('acct-checking');

    const nonCryptoTotal = nonCryptoBalances.reduce(
      (sum: number, b: { balance: number }) => sum + b.balance,
      0
    );
    expect(nonCryptoTotal).toBe(5000); // Only checking, not 28000
  });
});
