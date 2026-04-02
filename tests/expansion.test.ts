/**
 * expansion.test.ts — Tests for all new Finance OS primitives (API expansion)
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

const holdingsFixture = loadFixture('holdings.json') as { holdings: unknown[] };
const recurringFixture = loadFixture('recurring.json') as { recurrings: unknown[] };
const tagsFixture = loadFixture('tags.json') as { tags: unknown[] };
const investmentPerformanceFixture = loadFixture('investment-performance.json') as { investmentPerformance: unknown[] };
const allocationFixture = loadFixture('allocation.json') as { investmentAllocation: unknown[] };

const clientModule = require('../src/client');
const mockGraphql: jest.Mock = clientModule.__mockGraphql;

beforeEach(() => {
  mockGraphql.mockReset();
});

// ─── Holdings ────────────────────────────────────────────────────────────────

describe('holdings', () => {
  const { getHoldings, getAggregatedHoldings } = require('../src/primitives/holdings');

  test('getHoldings() returns array with security.symbol, quantity, metrics', async () => {
    mockGraphql.mockResolvedValueOnce(holdingsFixture);

    const holdings = await getHoldings();

    expect(Array.isArray(holdings)).toBe(true);
    expect(holdings.length).toBe(3);

    const first = holdings[0];
    expect(first).toHaveProperty('security');
    expect(first.security).toHaveProperty('symbol');
    expect(first.security).toHaveProperty('currentPrice');
    expect(first.security).toHaveProperty('name');
    expect(first).toHaveProperty('quantity');
    expect(first).toHaveProperty('metrics');
    expect(first.metrics).toHaveProperty('averageCost');
    expect(first.metrics).toHaveProperty('totalReturn');
    expect(first.metrics).toHaveProperty('costBasis');
  });

  test('getHoldings() returns correct values from fixture', async () => {
    mockGraphql.mockResolvedValueOnce(holdingsFixture);

    const holdings = await getHoldings();
    const aapl = holdings.find((h: { security: { symbol: string } }) => h.security.symbol === 'AAPL');

    expect(aapl).toBeDefined();
    expect(aapl.quantity).toBe(15);
    expect(aapl.security.currentPrice).toBe(189.84);
    expect(aapl.metrics.costBasis).toBe(2250.00);
    expect(aapl.metrics.totalReturn).toBe(597.60);
  });

  test('getHoldings() returns empty array on API error', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('API error'));

    const holdings = await getHoldings();
    expect(holdings).toEqual([]);
  });

  test('getHoldings() handles empty response', async () => {
    mockGraphql.mockResolvedValueOnce({ holdings: [] });

    const holdings = await getHoldings();
    expect(holdings).toEqual([]);
  });

  test('getHoldings() handles null response', async () => {
    mockGraphql.mockResolvedValueOnce({ holdings: null });

    const holdings = await getHoldings();
    expect(holdings).toEqual([]);
  });

  test('getAggregatedHoldings() returns array with security, change, value', async () => {
    mockGraphql.mockResolvedValueOnce({
      aggregatedHoldings: [
        {
          security: { currentPrice: 189.84, symbol: 'AAPL', name: 'Apple Inc.', type: 'EQUITY', id: 'sec-001', lastUpdate: null },
          change: 2.5,
          value: 2847.60,
        },
      ],
    });

    const holdings = await getAggregatedHoldings();
    expect(holdings.length).toBe(1);
    expect(holdings[0].security.symbol).toBe('AAPL');
    expect(holdings[0].change).toBe(2.5);
    expect(holdings[0].value).toBe(2847.60);
  });

  test('getAggregatedHoldings() passes timeFrame variable', async () => {
    mockGraphql.mockResolvedValueOnce({ aggregatedHoldings: [] });

    await getAggregatedHoldings('ONE_YEAR');

    expect(mockGraphql).toHaveBeenCalledWith(
      'AggregatedHoldings',
      expect.any(String),
      expect.objectContaining({ timeFrame: 'ONE_YEAR' })
    );
  });

  test('getAggregatedHoldings() returns empty array on API error', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('Network error'));

    const holdings = await getAggregatedHoldings();
    expect(holdings).toEqual([]);
  });
});

// ─── Recurring ───────────────────────────────────────────────────────────────

describe('recurring', () => {
  const { getRecurrings, getRecurringMetrics } = require('../src/primitives/recurring');

  test('getRecurrings() returns array with name, frequency, nextPaymentDate', async () => {
    mockGraphql.mockResolvedValueOnce(recurringFixture);

    const recurrings = await getRecurrings();

    expect(Array.isArray(recurrings)).toBe(true);
    expect(recurrings.length).toBe(4);

    const first = recurrings[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('frequency');
    expect(first).toHaveProperty('state');
    expect(first).toHaveProperty('nextPaymentAmount');
    expect(first).toHaveProperty('nextPaymentDate');
    expect(first).toHaveProperty('payments');
    expect(Array.isArray(first.payments)).toBe(true);
  });

  test('getRecurrings() returns correct values from fixture', async () => {
    mockGraphql.mockResolvedValueOnce(recurringFixture);

    const recurrings = await getRecurrings();
    const netflix = recurrings.find((r: { name: string }) => r.name === 'Netflix');

    expect(netflix).toBeDefined();
    expect(netflix.frequency).toBe('MONTHLY');
    expect(netflix.state).toBe('ACTIVE');
    expect(netflix.nextPaymentAmount).toBe(-15.99);
    expect(netflix.nextPaymentDate).toBe('2026-04-15');
    expect(netflix.payments.length).toBe(3);
  });

  test('getRecurrings() includes cancelled recurrings', async () => {
    mockGraphql.mockResolvedValueOnce(recurringFixture);

    const recurrings = await getRecurrings();
    const cancelled = recurrings.filter((r: { state: string }) => r.state === 'CANCELLED');
    expect(cancelled.length).toBe(1);
    expect(cancelled[0].name).toBe('Old Service');
  });

  test('getRecurrings() returns empty array on API error', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('API error'));

    const recurrings = await getRecurrings();
    expect(recurrings).toEqual([]);
  });

  test('getRecurrings() handles empty response', async () => {
    mockGraphql.mockResolvedValueOnce({ recurrings: [] });

    const recurrings = await getRecurrings();
    expect(recurrings).toEqual([]);
  });

  test('getRecurringMetrics() returns metrics for a specific recurring', async () => {
    mockGraphql.mockResolvedValueOnce({
      recurring: {
        id: 'rec-001',
        keyMetrics: {
          averageTransactionAmount: -15.99,
          totalSpent: -191.88,
          period: '12 months',
        },
      },
    });

    const metrics = await getRecurringMetrics('rec-001');
    expect(metrics).not.toBeNull();
    expect(metrics.averageTransactionAmount).toBe(-15.99);
    expect(metrics.totalSpent).toBe(-191.88);
    expect(metrics.period).toBe('12 months');
  });

  test('getRecurringMetrics() returns null on API error', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('API error'));

    const metrics = await getRecurringMetrics('rec-001');
    expect(metrics).toBeNull();
  });
});

// ─── Tags ────────────────────────────────────────────────────────────────────

describe('tags', () => {
  const { getTags, createTag, editTag, deleteTag } = require('../src/primitives/tags');

  test('getTags() returns array with id, name, colorName', async () => {
    mockGraphql.mockResolvedValueOnce(tagsFixture);

    const tags = await getTags();

    expect(Array.isArray(tags)).toBe(true);
    expect(tags.length).toBe(3);

    const first = tags[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('colorName');
  });

  test('getTags() returns correct values from fixture', async () => {
    mockGraphql.mockResolvedValueOnce(tagsFixture);

    const tags = await getTags();
    const business = tags.find((t: { name: string }) => t.name === 'Business');

    expect(business).toBeDefined();
    expect(business.id).toBe('tag-001');
    expect(business.colorName).toBe('blue');
  });

  test('getTags() returns empty array on API error', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('API error'));

    const tags = await getTags();
    expect(tags).toEqual([]);
  });

  test('getTags() handles empty response', async () => {
    mockGraphql.mockResolvedValueOnce({ tags: [] });

    const tags = await getTags();
    expect(tags).toEqual([]);
  });

  test('createTag() dry-run does NOT call graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createTag('Test Tag', {}, false);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Test Tag'));

    writeSpy.mockRestore();
  });

  test('createTag() dry-run shows color option', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createTag('Test Tag', { colorName: 'purple' }, false);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('color=purple'));

    writeSpy.mockRestore();
  });

  test('createTag() with confirm=true calls graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    mockGraphql.mockResolvedValueOnce({
      createTag: { id: 'tag-new', name: 'Test Tag', colorName: 'blue' },
    });

    const result = await createTag('Test Tag', { colorName: 'blue' }, true);

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(mockGraphql).toHaveBeenCalledWith(
      'CreateTag',
      expect.stringContaining('mutation CreateTag'),
      expect.objectContaining({ input: { name: 'Test Tag', colorName: 'blue' } })
    );
    expect(result).not.toBeNull();
    expect(result.id).toBe('tag-new');

    writeSpy.mockRestore();
  });

  test('editTag() dry-run does NOT call graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await editTag('tag-001', { name: 'New Name' }, false);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));

    writeSpy.mockRestore();
  });

  test('deleteTag() dry-run does NOT call graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await deleteTag('tag-001', false);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('tag-001'));

    writeSpy.mockRestore();
  });

  test('deleteTag() with confirm=true calls graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    mockGraphql.mockResolvedValueOnce({ deleteTag: true });

    await deleteTag('tag-001', true);

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(mockGraphql).toHaveBeenCalledWith(
      'DeleteTag',
      expect.stringContaining('mutation DeleteTag'),
      expect.objectContaining({ id: 'tag-001' })
    );

    writeSpy.mockRestore();
  });
});

// ─── Categories Write ────────────────────────────────────────────────────────

describe('categories-write', () => {
  const { createCategory, editCategory, deleteCategory } = require('../src/primitives/categories-write');

  test('createCategory() dry-run does NOT call graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createCategory('New Category', {}, false);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('New Category'));

    writeSpy.mockRestore();
  });

  test('createCategory() dry-run shows opts', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createCategory('New Category', { colorName: 'red', isExcluded: true }, false);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('color=red'));
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('excluded=true'));

    writeSpy.mockRestore();
  });

  test('createCategory() with confirm=true calls graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    mockGraphql.mockResolvedValueOnce({
      createCategory: { id: 'cat-new', name: 'New Category', colorName: 'blue', isExcluded: false },
    });

    const result = await createCategory('New Category', { colorName: 'blue' }, true);

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(mockGraphql).toHaveBeenCalledWith(
      'CreateCategory',
      expect.stringContaining('mutation CreateCategory'),
      expect.objectContaining({ input: { name: 'New Category', colorName: 'blue' } })
    );
    expect(result).not.toBeNull();
    expect(result.id).toBe('cat-new');

    writeSpy.mockRestore();
  });

  test('editCategory() dry-run does NOT call graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await editCategory('cat-001', { name: 'Updated' }, false);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));

    writeSpy.mockRestore();
  });

  test('deleteCategory() dry-run does NOT call graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await deleteCategory('cat-001', false);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('cat-001'));

    writeSpy.mockRestore();
  });

  test('deleteCategory() with confirm=true calls graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    mockGraphql.mockResolvedValueOnce({ deleteCategory: true });

    await deleteCategory('cat-001', true);

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(mockGraphql).toHaveBeenCalledWith(
      'DeleteCategory',
      expect.stringContaining('mutation DeleteCategory'),
      expect.objectContaining({ id: 'cat-001' })
    );

    writeSpy.mockRestore();
  });
});

// ─── Investments ─────────────────────────────────────────────────────────────

describe('investments', () => {
  const { getInvestmentPerformance, getInvestmentBalance, getInvestmentAllocation } = require('../src/primitives/investments');

  test('getInvestmentPerformance() returns date + performance array', async () => {
    mockGraphql.mockResolvedValueOnce(investmentPerformanceFixture);

    const perf = await getInvestmentPerformance();

    expect(Array.isArray(perf)).toBe(true);
    expect(perf.length).toBe(6);

    const first = perf[0];
    expect(first).toHaveProperty('date');
    expect(first).toHaveProperty('performance');
    expect(first.date).toBe('2026-01-01');
    expect(first.performance).toBe(2.15);
  });

  test('getInvestmentPerformance() passes timeFrame variable', async () => {
    mockGraphql.mockResolvedValueOnce({ investmentPerformance: [] });

    await getInvestmentPerformance('THREE_MONTHS');

    expect(mockGraphql).toHaveBeenCalledWith(
      'InvestmentPerformance',
      expect.any(String),
      expect.objectContaining({ timeFrame: 'THREE_MONTHS' })
    );
  });

  test('getInvestmentPerformance() returns empty array on API error', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('API error'));

    const perf = await getInvestmentPerformance();
    expect(perf).toEqual([]);
  });

  test('getInvestmentPerformance() handles empty response', async () => {
    mockGraphql.mockResolvedValueOnce({ investmentPerformance: [] });

    const perf = await getInvestmentPerformance();
    expect(perf).toEqual([]);
  });

  test('getInvestmentBalance() returns array with id, date, balance', async () => {
    mockGraphql.mockResolvedValueOnce({
      investmentBalance: [
        { id: 'ib-001', date: '2026-03-01', balance: 34695.00 },
        { id: 'ib-002', date: '2026-02-01', balance: 33200.00 },
      ],
    });

    const balance = await getInvestmentBalance();
    expect(balance.length).toBe(2);
    expect(balance[0]).toHaveProperty('id');
    expect(balance[0]).toHaveProperty('date');
    expect(balance[0]).toHaveProperty('balance');
    expect(balance[0].balance).toBe(34695.00);
  });

  test('getInvestmentBalance() returns empty array on error', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('fail'));
    const balance = await getInvestmentBalance();
    expect(balance).toEqual([]);
  });

  test('getInvestmentAllocation() returns percentage, amount, type array', async () => {
    mockGraphql.mockResolvedValueOnce(allocationFixture);

    const alloc = await getInvestmentAllocation();

    expect(Array.isArray(alloc)).toBe(true);
    expect(alloc.length).toBe(4);

    const first = alloc[0];
    expect(first).toHaveProperty('percentage');
    expect(first).toHaveProperty('amount');
    expect(first).toHaveProperty('type');
    expect(first).toHaveProperty('id');
  });

  test('getInvestmentAllocation() returns correct values from fixture', async () => {
    mockGraphql.mockResolvedValueOnce(allocationFixture);

    const alloc = await getInvestmentAllocation();
    const usStocks = alloc.find((a: { type: string }) => a.type === 'US_STOCKS');

    expect(usStocks).toBeDefined();
    expect(usStocks.percentage).toBe(45.2);
    expect(usStocks.amount).toBe(15680.00);
  });

  test('getInvestmentAllocation() returns empty array on API error', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('API error'));

    const alloc = await getInvestmentAllocation();
    expect(alloc).toEqual([]);
  });

  test('getInvestmentAllocation() handles empty response', async () => {
    mockGraphql.mockResolvedValueOnce({ investmentAllocation: [] });

    const alloc = await getInvestmentAllocation();
    expect(alloc).toEqual([]);
  });
});

// ─── Account History ─────────────────────────────────────────────────────────

describe('account-history', () => {
  const { getBalanceHistory } = require('../src/primitives/account-history');

  test('getBalanceHistory() returns array with date and balance', async () => {
    mockGraphql.mockResolvedValueOnce({
      accountBalanceHistory: [
        { date: '2026-03-01', balance: 3500.00 },
        { date: '2026-02-01', balance: 3200.00 },
        { date: '2026-01-01', balance: 2900.00 },
      ],
    });

    const history = await getBalanceHistory('item-001', 'acct-001');
    expect(history.length).toBe(3);
    expect(history[0]).toHaveProperty('date');
    expect(history[0]).toHaveProperty('balance');
    expect(history[0].balance).toBe(3500.00);
  });

  test('getBalanceHistory() passes timeFrame variable', async () => {
    mockGraphql.mockResolvedValueOnce({ accountBalanceHistory: [] });

    await getBalanceHistory('item-001', 'acct-001', 'SIX_MONTHS');

    expect(mockGraphql).toHaveBeenCalledWith(
      'BalanceHistory',
      expect.any(String),
      expect.objectContaining({ itemId: 'item-001', accountId: 'acct-001', timeFrame: 'SIX_MONTHS' })
    );
  });

  test('getBalanceHistory() returns empty array on API error', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('API error'));

    const history = await getBalanceHistory('item-001', 'acct-001');
    expect(history).toEqual([]);
  });

  test('getBalanceHistory() handles empty response', async () => {
    mockGraphql.mockResolvedValueOnce({ accountBalanceHistory: [] });

    const history = await getBalanceHistory('item-001', 'acct-001');
    expect(history).toEqual([]);
  });
});

// ─── Summary ─────────────────────────────────────────────────────────────────

describe('summary', () => {
  const { getTransactionSummary } = require('../src/primitives/summary');

  test('getTransactionSummary() returns count, income, spent shape', async () => {
    mockGraphql.mockResolvedValueOnce({
      transactionsSummary: {
        transactionsCount: 42,
        totalNetIncome: 1200.00,
        totalIncome: 5000.00,
        totalSpent: 3800.00,
      },
    });

    const summary = await getTransactionSummary();
    expect(summary).not.toBeNull();
    expect(summary.transactionsCount).toBe(42);
    expect(summary.totalNetIncome).toBe(1200.00);
    expect(summary.totalIncome).toBe(5000.00);
    expect(summary.totalSpent).toBe(3800.00);
  });

  test('getTransactionSummary() returns null on API error', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('API error'));

    const summary = await getTransactionSummary();
    expect(summary).toBeNull();
  });

  test('getTransactionSummary() handles null response', async () => {
    mockGraphql.mockResolvedValueOnce({ transactionsSummary: null });

    const summary = await getTransactionSummary();
    expect(summary).toBeNull();
  });
});

// ─── Export ──────────────────────────────────────────────────────────────────

describe('export', () => {
  const { exportTransactions } = require('../src/primitives/export');

  test('exportTransactions() returns url and expiresAt', async () => {
    mockGraphql.mockResolvedValueOnce({
      exportTransactions: {
        url: 'https://export.copilot.money/download/abc123',
        expiresAt: '2026-04-01T23:59:59Z',
      },
    });

    const result = await exportTransactions();
    expect(result).not.toBeNull();
    expect(result.url).toBe('https://export.copilot.money/download/abc123');
    expect(result.expiresAt).toBe('2026-04-01T23:59:59Z');
  });

  test('exportTransactions() returns null on API error', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('API error'));

    const result = await exportTransactions();
    expect(result).toBeNull();
  });

  test('exportTransactions() returns null on empty url', async () => {
    mockGraphql.mockResolvedValueOnce({
      exportTransactions: { url: null, expiresAt: null },
    });

    const result = await exportTransactions();
    expect(result).toBeNull();
  });
});

// ─── Connections ─────────────────────────────────────────────────────────────

describe('connections', () => {
  const { refreshAllConnections } = require('../src/primitives/connections');

  test('refreshAllConnections() returns connection statuses', async () => {
    mockGraphql.mockResolvedValueOnce({
      refreshAllConnections: [
        { status: 'SYNCING', itemId: 'item-001', institution: { name: 'Chase', id: 'inst-001' } },
        { status: 'SYNCING', itemId: 'item-002', institution: { name: 'Fidelity', id: 'inst-002' } },
      ],
    });

    const conns = await refreshAllConnections();
    expect(conns.length).toBe(2);
    expect(conns[0].status).toBe('SYNCING');
    expect(conns[0].institutionName).toBe('Chase');
  });

  test('refreshAllConnections() returns empty array on API error', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('API error'));

    const conns = await refreshAllConnections();
    expect(conns).toEqual([]);
  });

  test('refreshAllConnections() handles empty response', async () => {
    mockGraphql.mockResolvedValueOnce({ refreshAllConnections: [] });

    const conns = await refreshAllConnections();
    expect(conns).toEqual([]);
  });
});

// ─── Transactions Write ─────────────────────────────────────────────────────

describe('transactions-write', () => {
  const { createTransaction, deleteTransaction } = require('../src/primitives/transactions-write');

  test('createTransaction() dry-run does NOT call graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createTransaction({
      accountId: 'acct-001',
      itemId: 'item-001',
      amount: -25.00,
      name: 'Test Purchase',
      date: '2026-04-01',
    }, false);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Test Purchase'));

    writeSpy.mockRestore();
  });

  test('createTransaction() with confirm=true calls graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    mockGraphql.mockResolvedValueOnce({
      createTransaction: {
        id: 'tx-new',
        name: 'Test Purchase',
        amount: -25.00,
        date: '2026-04-01',
        accountId: 'acct-001',
        itemId: 'item-001',
      },
    });

    const result = await createTransaction({
      accountId: 'acct-001',
      itemId: 'item-001',
      amount: -25.00,
      name: 'Test Purchase',
      date: '2026-04-01',
    }, true);

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(mockGraphql).toHaveBeenCalledWith(
      'CreateTransaction',
      expect.stringContaining('mutation CreateTransaction'),
      expect.objectContaining({
        accountId: 'acct-001',
        itemId: 'item-001',
        input: { amount: -25.00, name: 'Test Purchase', date: '2026-04-01' },
      })
    );
    expect(result).not.toBeNull();
    expect(result.id).toBe('tx-new');

    writeSpy.mockRestore();
  });

  test('deleteTransaction() dry-run does NOT call graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await deleteTransaction('item-001', 'acct-001', 'tx-001', false);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));

    writeSpy.mockRestore();
  });

  test('deleteTransaction() with confirm=true calls graphql', async () => {
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    mockGraphql.mockResolvedValueOnce({ deleteTransaction: true });

    await deleteTransaction('item-001', 'acct-001', 'tx-001', true);

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(mockGraphql).toHaveBeenCalledWith(
      'DeleteTransaction',
      expect.stringContaining('mutation DeleteTransaction'),
      expect.objectContaining({ itemId: 'item-001', accountId: 'acct-001', id: 'tx-001' })
    );

    writeSpy.mockRestore();
  });
});