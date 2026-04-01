/**
 * primitives.test.ts — Unit tests for all Finance OS primitives
 *
 * All tests use fixture JSON — no live API calls.
 * CopilotClient.graphql is mocked at the module boundary.
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

const accountsFixture = loadFixture('accounts.json') as { accounts: unknown[] };
const emptyAccountsFixture = loadFixture('empty-accounts.json') as { accounts: unknown[] };
const transactionsFixture = loadFixture('transactions.json') as { transactions: { edges?: unknown[]; pageInfo?: unknown } };
const categoriesFixture = loadFixture('categories.json') as { categories: unknown[] };
const networthFixture = loadFixture('networth.json') as { networthHistory: unknown[] };
const emptyNetworthFixture = loadFixture('empty-networth.json') as { networthHistory: unknown[] };
const monthlySpendFixture = loadFixture('monthly-spend.json') as { monthlySpending: unknown[] };

const clientModule = require('../src/client');
const mockGraphql: jest.Mock = clientModule.__mockGraphql;

beforeEach(() => {
  mockGraphql.mockReset();
});

describe('accounts', () => {
  const { getAccounts, getAccountBalances } = require('../src/primitives/accounts');

  test('getAccounts() returns array with expected shape', async () => {
    mockGraphql.mockResolvedValueOnce(accountsFixture);

    const accounts = await getAccounts();

    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.length).toBe(3);

    const first = accounts[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('type');
    expect(first).toHaveProperty('balance');
    expect(first).toHaveProperty('isManual');
    expect(first).toHaveProperty('hasLiveBalance');
    expect(first).toHaveProperty('isUserHidden');
    expect(first).toHaveProperty('isUserClosed');
  });

  test('getAccounts() excludes closed accounts by default', async () => {
    mockGraphql.mockResolvedValueOnce(accountsFixture);

    const accounts = await getAccounts();
    const closedAccounts = accounts.filter((a: { isUserClosed: boolean }) => a.isUserClosed);
    expect(closedAccounts.length).toBe(0);
  });

  test('getAccounts(includeHidden=true) includes all accounts', async () => {
    mockGraphql.mockResolvedValueOnce(accountsFixture);

    const accounts = await getAccounts(true);
    expect(accounts.length).toBe(4);
  });

  test('getAccounts() returns empty array on API error', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('Network error'));

    const accounts = await getAccounts();
    expect(accounts).toEqual([]);
  });

  test('getAccounts() handles empty accounts response', async () => {
    mockGraphql.mockResolvedValueOnce(emptyAccountsFixture);

    const accounts = await getAccounts();
    expect(accounts).toEqual([]);
  });

  test('getAccountBalances() returns simplified sorted array', async () => {
    mockGraphql.mockResolvedValueOnce(accountsFixture);

    const balances = await getAccountBalances();

    expect(Array.isArray(balances)).toBe(true);
    expect(balances.length).toBe(3);

    const first = balances[0];
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('balance');
    expect(first).toHaveProperty('type');
    expect(first).toHaveProperty('subType');
    expect(first).not.toHaveProperty('institutionId');
    expect(first).not.toHaveProperty('mask');
  });

  test('getAccountBalances() is sorted by type', async () => {
    mockGraphql.mockResolvedValueOnce(accountsFixture);

    const balances = await getAccountBalances();
    const types = balances.map((b: { type: string }) => b.type);
    const sorted = [...types].sort();
    expect(types).toEqual(sorted);
  });
});

describe('transactions', () => {
  const { getTransactions, getUnreviewed } = require('../src/primitives/transactions');

  test('getTransactions() returns page with transactions array', async () => {
    mockGraphql.mockResolvedValueOnce(transactionsFixture);

    const page = await getTransactions({ limit: 5 });

    expect(page).toHaveProperty('transactions');
    expect(page).toHaveProperty('pageInfo');
    expect(Array.isArray(page.transactions)).toBe(true);
    expect(page.transactions.length).toBe(5);
  });

  test('each transaction has required fields', async () => {
    mockGraphql.mockResolvedValueOnce(transactionsFixture);

    const page = await getTransactions({ limit: 5 });
    const tx = page.transactions[0];

    expect(tx).toHaveProperty('id');
    expect(tx).toHaveProperty('name');
    expect(tx).toHaveProperty('amount');
    expect(tx).toHaveProperty('date');
    expect(tx).toHaveProperty('accountId');
    expect(tx).toHaveProperty('isReviewed');
    expect(tx).toHaveProperty('isPending');
    expect(tx).toHaveProperty('tags');
    expect(Array.isArray(tx.tags)).toBe(true);
  });

  test('getTransactions() returns empty page on API error', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('API error'));

    const page = await getTransactions();
    expect(page.transactions).toEqual([]);
    expect(page.pageInfo.hasNextPage).toBe(false);
  });

  test('getTransactions() handles malformed response missing edges', async () => {
    mockGraphql.mockResolvedValueOnce({
      transactions: {
        pageInfo: {
          hasNextPage: false,
          endCursor: null,
          hasPreviousPage: false,
          startCursor: null,
        },
      },
    });

    const page = await getTransactions();
    expect(page.transactions).toEqual([]);
    expect(page.pageInfo.hasNextPage).toBe(false);
  });

  test('getUnreviewed() returns only unreviewed transactions', async () => {
    const unreviewedFixture = {
      transactions: {
        ...transactionsFixture.transactions,
        edges: (transactionsFixture.transactions.edges ?? []).filter(
          (e: unknown) => !(e as { node: { isReviewed: boolean } }).node.isReviewed
        ),
      },
    };
    mockGraphql.mockResolvedValueOnce(unreviewedFixture);

    const unreviewed = await getUnreviewed();
    expect(Array.isArray(unreviewed)).toBe(true);
    for (const tx of unreviewed) {
      expect(tx.isReviewed).toBe(false);
    }
  });

  test('getUnreviewed() returns correct count from fixture', async () => {
    const unreviewedEdges = (transactionsFixture.transactions.edges ?? []).filter(
      (e: unknown) => !(e as { node: { isReviewed: boolean } }).node.isReviewed
    );
    const unreviewedFixture = {
      transactions: {
        ...transactionsFixture.transactions,
        edges: unreviewedEdges,
      },
    };
    mockGraphql.mockResolvedValueOnce(unreviewedFixture);

    const unreviewed = await getUnreviewed();
    expect(unreviewed.length).toBe(3);
  });
});

describe('categories', () => {
  const { getCategories, getSpendingByCategory } = require('../src/primitives/categories');

  test('getCategories() returns array with expected shape', async () => {
    mockGraphql.mockResolvedValueOnce(categoriesFixture);

    const categories = await getCategories();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBe(6);

    const first = categories[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('isExcluded');
    expect(first).toHaveProperty('isRolloverDisabled');
  });

  test('getCategories() flattens child categories with parentId', async () => {
    mockGraphql.mockResolvedValueOnce(categoriesFixture);

    const categories = await getCategories();
    const children = categories.filter((c: { parentId?: string }) => c.parentId);
    expect(children.length).toBe(1);
    expect(children[0].parentId).toBe('cat-transport');
    expect(children[0].name).toBe('Rideshare');
  });

  test('getCategories() returns empty array on API error', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('API error'));

    const categories = await getCategories();
    expect(categories).toEqual([]);
  });

  test('getSpendingByCategory() returns {categoryId, categoryName, actual} shape', async () => {
    mockGraphql.mockResolvedValueOnce(categoriesFixture);

    const spending = await getSpendingByCategory('2026-03');
    expect(Array.isArray(spending)).toBe(true);
    expect(spending.length).toBeGreaterThan(0);

    const first = spending[0];
    expect(first).toHaveProperty('categoryId');
    expect(first).toHaveProperty('categoryName');
    expect(first).toHaveProperty('actual');
    expect(first).toHaveProperty('month');
    expect('budgeted' in first).toBe(true);
    expect('remaining' in first).toBe(true);
  });

  test('getSpendingByCategory() uses correct month filter', async () => {
    mockGraphql.mockResolvedValueOnce(categoriesFixture);

    const spending = await getSpendingByCategory('2026-03');
    for (const s of spending) {
      expect(s.month).toBe('2026-03');
    }
  });
});

describe('budgets', () => {
  const { getBudgetStatus, getMonthlySpend } = require('../src/primitives/budgets');

  test('getBudgetStatus() returns per-category status', async () => {
    mockGraphql.mockResolvedValueOnce(categoriesFixture);

    const budgets = await getBudgetStatus('2026-03');
    expect(Array.isArray(budgets)).toBe(true);
    expect(budgets.length).toBeGreaterThan(0);

    const first = budgets[0];
    expect(first).toHaveProperty('categoryId');
    expect(first).toHaveProperty('categoryName');
    expect(first).toHaveProperty('budgeted');
    expect(first).toHaveProperty('actual');
    expect(first).toHaveProperty('remaining');
    expect(first).toHaveProperty('isOverBudget');
    expect(first).toHaveProperty('month');
  });

  test('getBudgetStatus() correctly identifies over-budget categories', async () => {
    mockGraphql.mockResolvedValueOnce(categoriesFixture);

    const budgets = await getBudgetStatus('2026-03');
    const dining = budgets.find((b: { categoryName: string }) => b.categoryName === 'Dining Out');
    expect(dining).toBeDefined();
    expect(dining.isOverBudget).toBe(true);
    expect(dining.remaining).toBeLessThan(0);
  });

  test('getBudgetStatus() correctly identifies under-budget categories', async () => {
    mockGraphql.mockResolvedValueOnce(categoriesFixture);

    const budgets = await getBudgetStatus('2026-03');
    const groceries = budgets.find((b: { categoryName: string }) => b.categoryName === 'Groceries');
    expect(groceries).toBeDefined();
    expect(groceries.isOverBudget).toBe(false);
    expect(groceries.remaining).toBeGreaterThan(0);
  });

  test('getBudgetStatus() excludes categories marked isExcluded', async () => {
    mockGraphql.mockResolvedValueOnce(categoriesFixture);

    const budgets = await getBudgetStatus('2026-03');
    const income = budgets.find((b: { categoryName: string }) => b.categoryName === 'Income');
    expect(income).toBeUndefined();
  });

  test('getBudgetStatus() returns empty array when no budget is set', async () => {
    mockGraphql.mockResolvedValueOnce({
      categories: [
        {
          id: 'cat-empty',
          name: 'Empty',
          isExcluded: false,
          spend: { current: null, histories: [] },
          budget: { current: null, histories: [] },
          childCategories: [],
        },
      ],
    });

    const budgets = await getBudgetStatus('2026-03');
    expect(budgets).toEqual([]);
  });

  test('getMonthlySpend() returns {total, month} shape', async () => {
    mockGraphql.mockResolvedValueOnce(monthlySpendFixture);

    const spend = await getMonthlySpend('2026-03');
    expect(spend).toHaveProperty('total');
    expect(spend).toHaveProperty('month');
    expect(spend.month).toBe('2026-03');
    expect(typeof spend.total).toBe('number');
  });

  test('getMonthlySpend() returns correct values from fixture', async () => {
    mockGraphql.mockResolvedValueOnce(monthlySpendFixture);

    const spend = await getMonthlySpend('2026-03');
    expect(spend.total).toBe(480.0);
    expect(spend.budgeted).toBe(625.0);
    expect(spend.remaining).toBe(145.0);
  });
});

describe('networth', () => {
  const { getCurrentNetworth, getNetworthHistory } = require('../src/primitives/networth');

  test('getCurrentNetworth() returns {assets, debt, net} shape', async () => {
    mockGraphql.mockResolvedValueOnce(networthFixture);

    const nw = await getCurrentNetworth();
    expect(nw).not.toBeNull();
    expect(nw).toHaveProperty('assets');
    expect(nw).toHaveProperty('debt');
    expect(nw).toHaveProperty('net');
    expect(nw).toHaveProperty('date');
  });

  test('getCurrentNetworth() returns the most recent entry', async () => {
    mockGraphql.mockResolvedValueOnce(networthFixture);

    const nw = await getCurrentNetworth();
    expect(nw?.date).toBe('2026-03-01');
    expect(nw?.assets).toBe(56000.0);
    expect(nw?.debt).toBe(450.0);
    expect(nw?.net).toBe(55550.0);
  });

  test('getCurrentNetworth() returns null on empty history', async () => {
    mockGraphql.mockResolvedValueOnce(emptyNetworthFixture);

    const nw = await getCurrentNetworth();
    expect(nw).toBeNull();
  });

  test('getCurrentNetworth() returns null on API error', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('API error'));

    const nw = await getCurrentNetworth();
    expect(nw).toBeNull();
  });

  test('getNetworthHistory() returns sorted array', async () => {
    mockGraphql.mockResolvedValueOnce(networthFixture);

    const history = await getNetworthHistory();
    expect(history.length).toBe(6);

    for (let i = 1; i < history.length; i++) {
      expect(history[i].date >= history[i - 1].date).toBe(true);
    }
  });

  test('each networth entry has net = assets - debt', async () => {
    mockGraphql.mockResolvedValueOnce(networthFixture);

    const history = await getNetworthHistory();
    for (const entry of history) {
      expect(entry.net).toBeCloseTo(entry.assets - entry.debt, 2);
    }
  });
});

describe('write primitives', () => {
  const { setCategory, markReviewed, setNotes, bulkMarkReviewed, setBudget } = require('../src/primitives/write');

  test('setCategory() without --confirm does NOT call graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await setCategory('tx-001', 'cat-food', false);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));

    writeSpy.mockRestore();
  });

  test('markReviewed() without --confirm returns dry-run message without calling graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await markReviewed('tx-002', false);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));

    writeSpy.mockRestore();
  });

  test('setNotes() without --confirm does NOT call graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await setNotes('tx-003', 'Test note', false);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));

    writeSpy.mockRestore();
  });

  test('setCategory() with confirm=true DOES call graphql with correct mutation + variables', async () => {
    mockGraphql.mockResolvedValueOnce(transactionsFixture);
    mockGraphql.mockResolvedValueOnce({
      transactions: {
        edges: [{ node: { id: 'tx-002', itemId: 'item-003', accountId: 'acct-003' } }],
      },
    });
    mockGraphql.mockResolvedValueOnce({
      editTransaction: {
        transaction: {
          id: 'tx-002',
          categoryId: 'cat-dining',
          isReviewed: false,
          userNotes: null,
        },
      },
    });

    await setCategory('tx-002', 'cat-dining', true);

    expect(mockGraphql).toHaveBeenCalledTimes(3);
    expect(mockGraphql).toHaveBeenLastCalledWith(
      'EditTransaction',
      expect.stringContaining('mutation EditTransaction'),
      expect.objectContaining({
        id: 'tx-002',
        itemId: 'item-003',
        accountId: 'acct-003',
        input: { categoryId: 'cat-dining' },
      })
    );
  });

  test('setNotes() with confirm=true DOES call graphql', async () => {
    mockGraphql.mockResolvedValueOnce(transactionsFixture);
    mockGraphql.mockResolvedValueOnce({
      transactions: {
        edges: [{ node: { id: 'tx-003', itemId: 'item-004', accountId: 'acct-002' } }],
      },
    });
    mockGraphql.mockResolvedValueOnce({
      editTransaction: {
        transaction: {
          id: 'tx-003',
          categoryId: null,
          isReviewed: false,
          userNotes: 'Budget meal',
        },
      },
    });

    await setNotes('tx-003', 'Budget meal', true);

    expect(mockGraphql).toHaveBeenCalledTimes(3);
    expect(mockGraphql).toHaveBeenLastCalledWith(
      'EditTransaction',
      expect.stringContaining('mutation EditTransaction'),
      expect.objectContaining({
        id: 'tx-003',
        input: { userNotes: 'Budget meal' },
      })
    );
  });

  test('markReviewed() with confirm=true DOES call graphql', async () => {
    mockGraphql.mockResolvedValueOnce(transactionsFixture);
    mockGraphql.mockResolvedValueOnce({
      transactions: {
        edges: [{ node: { id: 'tx-002', itemId: 'item-003', accountId: 'acct-003' } }],
      },
    });
    mockGraphql.mockResolvedValueOnce({
      editTransaction: {
        transaction: {
          id: 'tx-002',
          categoryId: 'cat-dining',
          isReviewed: true,
          userNotes: null,
        },
      },
    });

    await markReviewed('tx-002', true);

    expect(mockGraphql).toHaveBeenCalledTimes(3);
    expect(mockGraphql).toHaveBeenLastCalledWith(
      'EditTransaction',
      expect.any(String),
      expect.objectContaining({
        id: 'tx-002',
        input: expect.objectContaining({ isReviewed: true }),
      })
    );
  });

  test('bulkMarkReviewed() with empty array outputs message without calling graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await bulkMarkReviewed([], false);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('No transactions'));

    writeSpy.mockRestore();
  });

  test('bulkMarkReviewed() dry-run shows count without calling graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await bulkMarkReviewed(['tx-002', 'tx-004', 'tx-005'], false);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('3'));

    writeSpy.mockRestore();
  });

  test('bulkMarkReviewed() with multiple IDs + confirm calls graphql once per transaction', async () => {
    mockGraphql
      .mockResolvedValueOnce({ bulkEditTransactions: { updated: [{ id: 'tx-002' }], failed: [] } })
      .mockResolvedValueOnce({ bulkEditTransactions: { updated: [{ id: 'tx-004' }], failed: [] } })
      .mockResolvedValueOnce({ bulkEditTransactions: { updated: [{ id: 'tx-005' }], failed: [] } });

    await bulkMarkReviewed(['tx-002', 'tx-004', 'tx-005'], true);

    expect(mockGraphql).toHaveBeenCalledTimes(3);
    expect(mockGraphql).toHaveBeenNthCalledWith(
      1,
      'BulkEditTransactions',
      expect.stringContaining('mutation BulkEditTransactions'),
      expect.objectContaining({ filter: { id: 'tx-002' }, input: { isReviewed: true } })
    );
    expect(mockGraphql).toHaveBeenNthCalledWith(
      2,
      'BulkEditTransactions',
      expect.stringContaining('mutation BulkEditTransactions'),
      expect.objectContaining({ filter: { id: 'tx-004' }, input: { isReviewed: true } })
    );
    expect(mockGraphql).toHaveBeenNthCalledWith(
      3,
      'BulkEditTransactions',
      expect.stringContaining('mutation BulkEditTransactions'),
      expect.objectContaining({ filter: { id: 'tx-005' }, input: { isReviewed: true } })
    );
  });

  test('setBudget() dry-run only prints message without calling graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await setBudget('cat-groceries', 300, '2026-03', false);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Would set budget for category cat-groceries to $300.00 for 2026-03'));

    writeSpy.mockRestore();
  });
});
