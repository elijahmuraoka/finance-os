/**
 * cli.ts — Finance skill CLI router
 *
 * Usage:
 *   finance accounts [--json]
 *   finance balances [--json]
 *   finance transactions [--limit N] [--unreviewed] [--search TEXT] [--json]
 *   finance categories [--json]
 *   finance spending [--month YYYY-MM] [--json]
 *   finance budget [--month YYYY-MM] [--json]
 *   finance budget set <category-id> <amount> [--month YYYY-MM] [--confirm]
 *   finance networth [--json]
 *   finance snapshot [--print]
 *   finance doctor [--json]
 *   finance set-category <tx-id> <category-id> [--confirm]
 *   finance mark-reviewed <tx-id> [--confirm]
 *   finance set-notes <tx-id> <notes> [--confirm]
 *   finance mark-all-reviewed [--confirm]
 *
 * Crypto commands:
 *   finance crypto [--json]              — full snapshot from all sources
 *   finance crypto kraken [--json]       — Kraken balances only
 *   finance crypto gemini [--json]       — Gemini balances only
 *   finance crypto wallet [--json]       — on-chain ETH + SOL balances
 *   finance crypto summary [--json]      — top holdings aggregated
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getAccounts, getAccountBalances, formatAccountsTable } from './primitives/accounts';
import { getCryptoSnapshot } from './crypto/index';
import { createKrakenClient } from './crypto/kraken';
import { createGeminiClient } from './crypto/gemini';
import { getAllOnchainBalances, getSolBalance } from './crypto/onchain';
import { getKrakenConfig, getGeminiConfig, getOnchainConfig } from './crypto/config';
import {
  getTransactions,
  getUnreviewed,
  searchTransactions,
  formatTransactionsTable,
} from './primitives/transactions';
import { getCategories, getSpendingByCategory, formatCategoriesTable, formatSpendingTable } from './primitives/categories';
import { getBudgetStatus, getMonthlySpend, formatBudgetTable, formatMonthlySpendSummary } from './primitives/budgets';
import {
  getNetworthHistory,
  getCurrentNetworth,
  formatNetworthTable,
  formatCurrentNetworth,
} from './primitives/networth';
import { buildFinanceSnapshot, getSnapshotPath } from './context-loader';
import { setCategory, markReviewed, setNotes, bulkMarkReviewed, setBudget } from './primitives/write';
import { createCategory, editCategory, deleteCategory } from './primitives/categories-write';
import { getHoldings, getAggregatedHoldings, formatHoldingsTable, formatAggregatedHoldingsTable } from './primitives/holdings';
import { getInvestmentPerformance, getInvestmentBalance, getInvestmentAllocation, formatPerformanceTable, formatAllocationTable } from './primitives/investments';
import { getTags, createTag, editTag, deleteTag, formatTagsTable } from './primitives/tags';
import { getRecurrings, getRecurringMetrics, formatRecurringsTable } from './primitives/recurring';
import { getBalanceHistory, formatBalanceHistoryTable } from './primitives/account-history';
import { createTransaction, deleteTransaction } from './primitives/transactions-write';
import { exportTransactions, exportTransactionsByMonth } from './primitives/export';
import { getTransactionSummary, getTransactionSummaryByMonth, formatSummaryTable } from './primitives/summary';
import { refreshAllConnections, formatRefreshResult } from './primitives/connections';
import { getClient } from './client';
import type { TimeFrame as HoldingsTimeFrame } from './primitives/holdings';
import type { TimeFrame as InvestmentsTimeFrame } from './primitives/investments';
import type { TimeFrame as AccountHistoryTimeFrame } from './primitives/account-history';

function parseArgs(argv: string[]): { flags: Record<string, string | boolean>; positional: string[] } {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else {
      positional.push(arg);
      i++;
    }
  }
  return { flags, positional };
}

function outputJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function outputText(text: string): void {
  process.stdout.write(text + '\n');
}

function fatal(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

async function cmdAccounts(flags: Record<string, string | boolean>): Promise<void> {
  const accounts = await getAccounts();
  if (flags['json']) {
    outputJson(accounts);
  } else {
    outputText(formatAccountsTable(accounts));
  }
}

async function cmdBalances(flags: Record<string, string | boolean>): Promise<void> {
  const balances = await getAccountBalances();
  if (flags['json']) {
    outputJson(balances);
  } else {
    const lines: string[] = ['Account Balances:', ''];
    for (const b of balances) {
      const sub = b.subType ? ` (${b.subType})` : '';
      lines.push(`  ${b.type}${sub}: ${b.name}  $${b.balance.toFixed(2)}`);
    }
    outputText(lines.join('\n'));
  }
}

async function cmdTransactions(flags: Record<string, string | boolean>): Promise<void> {
  const limit = flags['limit'] ? parseInt(flags['limit'] as string, 10) : 50;
  const unreviewed = !!flags['unreviewed'];
  const search = flags['search'] as string | undefined;

  let transactions;

  if (unreviewed) {
    transactions = await getUnreviewed();
  } else if (search) {
    transactions = await searchTransactions(search);
  } else {
    const page = await getTransactions({ limit });
    transactions = page.transactions;
  }

  if (flags['json']) {
    outputJson(transactions);
  } else {
    outputText(formatTransactionsTable(transactions));
  }
}

async function cmdCategories(flags: Record<string, string | boolean>): Promise<void> {
  const categories = await getCategories();
  if (flags['json']) {
    outputJson(categories);
  } else {
    outputText(formatCategoriesTable(categories));
  }
}

async function cmdSpending(flags: Record<string, string | boolean>): Promise<void> {
  const month = flags['month'] as string | undefined;
  const spending = await getSpendingByCategory(month);
  if (flags['json']) {
    outputJson(spending);
  } else {
    outputText(formatSpendingTable(spending));
  }
}

async function cmdBudget(rest: string[], flags: Record<string, string | boolean>): Promise<void> {
  const { flags: parsedFlags, positional } = parseArgs(rest);
  const mergedFlags = { ...flags, ...parsedFlags };
  const subcommand = positional[0];

  if (subcommand === 'set') {
    const categoryId = positional[1];
    const amountRaw = positional[2];
    if (!categoryId || !amountRaw) {
      fatal('Usage: finance budget set <category-id> <amount> [--month YYYY-MM] [--confirm]');
    }

    const amount = Number(amountRaw);
    if (!Number.isFinite(amount)) {
      fatal(`Invalid amount: ${amountRaw}`);
    }

    const month = (mergedFlags['month'] as string | undefined) ?? getCurrentMonth();
    const confirm = !!mergedFlags['confirm'];
    await setBudget(categoryId, amount, month, confirm);
    return;
  }

  const month = mergedFlags['month'] as string | undefined;
  const [budgets, monthly] = await Promise.all([
    getBudgetStatus(month),
    getMonthlySpend(month),
  ]);

  if (mergedFlags['json']) {
    outputJson({ budgets, monthly });
  } else {
    outputText(formatMonthlySpendSummary(monthly));
    outputText('');
    outputText(formatBudgetTable(budgets));
  }
}

async function cmdNetworth(flags: Record<string, string | boolean>): Promise<void> {
  if (flags['history']) {
    const history = await getNetworthHistory();
    if (flags['json']) {
      outputJson(history);
    } else {
      outputText(formatNetworthTable(history));
    }
  } else {
    const current = await getCurrentNetworth();
    if (flags['json']) {
      outputJson(current);
    } else {
      outputText(formatCurrentNetworth(current));
    }
  }
}

async function cmdSnapshot(flags: Record<string, string | boolean>): Promise<void> {
  await buildFinanceSnapshot();
  outputText('Finance snapshot updated.');

  if (flags['print']) {
    const snapshotPath = getSnapshotPath();
    if (fs.existsSync(snapshotPath)) {
      outputText('');
      outputText(fs.readFileSync(snapshotPath, 'utf8'));
    }
  }
}

async function cmdSetCategory(
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  const txId = positional[0];
  const categoryId = positional[1];
  if (!txId || !categoryId) {
    fatal('Usage: finance set-category <tx-id> <category-id> [--confirm]');
  }
  const confirm = !!flags['confirm'];
  await setCategory(txId, categoryId, confirm);
}

async function cmdMarkReviewed(
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  const txId = positional[0];
  if (!txId) {
    fatal('Usage: finance mark-reviewed <tx-id> [--confirm]');
  }
  const confirm = !!flags['confirm'];
  await markReviewed(txId, confirm);
}

async function cmdSetNotes(
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  const txId = positional[0];
  const notes = positional.slice(1).join(' ') || (flags['notes'] as string);
  if (!txId || !notes) {
    fatal('Usage: finance set-notes <tx-id> <notes> [--confirm]');
  }
  const confirm = !!flags['confirm'];
  await setNotes(txId, notes, confirm);
}

async function cmdMarkAllReviewed(flags: Record<string, string | boolean>): Promise<void> {
  const confirm = !!flags['confirm'];
  const unreviewed = await getUnreviewed();

  if (unreviewed.length === 0) {
    outputText('No unreviewed transactions found.');
    return;
  }

  const ids = unreviewed.map((t) => t.id);
  await bulkMarkReviewed(ids, confirm);
}

type DoctorCheck = {
  key: string;
  label: string;
  ok: boolean;
  message: string;
  meta?: Record<string, unknown>;
};

function formatDoctorLine(check: DoctorCheck): string {
  const symbol = check.ok ? '✓' : '✗';
  return `${symbol} ${check.label.padEnd(16)} ${check.message}`;
}

async function runDoctor(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  try {
    const accounts = await getAccounts();
    checks.push({
      key: 'copilot',
      label: 'Copilot Money',
      ok: true,
      message: `authenticated (${accounts.length} accounts)`,
      meta: { accounts: accounts.length },
    });
  } catch (err) {
    checks.push({
      key: 'copilot',
      label: 'Copilot Money',
      ok: false,
      message: `${(err as Error).message}`,
    });
  }

  const refreshTokenPath = path.join(os.homedir(), '.openclaw', 'secrets', 'copilot-refresh-token');
  try {
    const refreshToken = fs.readFileSync(refreshTokenPath, 'utf8').trim();
    checks.push({
      key: 'firebase-refresh',
      label: 'Firebase token',
      ok: Boolean(refreshToken),
      message: refreshToken ? 'refresh token present' : 'refresh token file is empty',
      meta: { path: refreshTokenPath },
    });
  } catch (err) {
    checks.push({
      key: 'firebase-refresh',
      label: 'Firebase token',
      ok: false,
      message: `missing refresh token at ${refreshTokenPath}`,
      meta: { error: (err as Error).message },
    });
  }

  const krakenCfg = getKrakenConfig();
  if (!krakenCfg.configured) {
    checks.push({
      key: 'kraken',
      label: 'Kraken',
      ok: false,
      message: 'keys not configured',
    });
  } else {
    try {
      const balances = await createKrakenClient()!.getBalances();
      checks.push({
        key: 'kraken',
        label: 'Kraken',
        ok: true,
        message: `${balances.length} assets`,
        meta: { count: balances.length },
      });
    } catch (err) {
      checks.push({
        key: 'kraken',
        label: 'Kraken',
        ok: false,
        message: (err as Error).message,
      });
    }
  }

  const geminiCfg = getGeminiConfig();
  if (!geminiCfg.configured) {
    checks.push({
      key: 'gemini',
      label: 'Gemini',
      ok: false,
      message: 'keys not configured',
    });
  } else {
    try {
      const balances = await createGeminiClient()!.getBalances();
      checks.push({
        key: 'gemini',
        label: 'Gemini',
        ok: true,
        message: `${balances.length} assets`,
        meta: { count: balances.length },
      });
    } catch (err) {
      checks.push({
        key: 'gemini',
        label: 'Gemini',
        ok: false,
        message: (err as Error).message,
      });
    }
  }

  const onchainCfg = getOnchainConfig();
  if (onchainCfg.ethAddresses.length === 0) {
    checks.push({
      key: 'debank',
      label: 'DeBank (EVM)',
      ok: false,
      message: 'no ETH address configured',
    });
  } else {
    const address = onchainCfg.ethAddresses[0];
    const cachePath = path.join(os.homedir(), '.openclaw', 'cache', 'finance', `debank-${address.toLowerCase()}.json`);
    const cacheExists = fs.existsSync(cachePath);
    let cacheAgeMinutes: number | null = null;
    if (cacheExists) {
      try {
        const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as { fetchedAt?: number; tokens?: unknown[] };
        if (typeof parsed.fetchedAt === 'number') {
          cacheAgeMinutes = Math.floor((Date.now() - parsed.fetchedAt) / 60000);
        }
      } catch {
        cacheAgeMinutes = null;
      }
    }

    // For doctor: use cache if fresh, otherwise do a quick reachability ping (don't full-fetch all wallets)
    if (cacheExists && cacheAgeMinutes !== null && cacheAgeMinutes <= 30) {
      checks.push({
        key: 'debank',
        label: 'DeBank (EVM)',
        ok: true,
        message: `cached (${cacheAgeMinutes} min old) — ${onchainCfg.ethAddresses.length} address${onchainCfg.ethAddresses.length === 1 ? '' : 'es'}`,
        meta: { address, cacheAgeMinutes, addresses: onchainCfg.ethAddresses.length },
      });
    } else {
      // Quick ping: single address, 8s timeout
      try {
        const pingUrl = `https://api.rabby.io/v1/user/token_list?id=${address}&is_all=false&has_balance=true`;
        const res = await fetch(pingUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://rabby.io', 'Referer': 'https://rabby.io/' },
          signal: AbortSignal.timeout(8000),
        });
        checks.push({
          key: 'debank',
          label: 'DeBank (EVM)',
          ok: res.ok,
          message: res.ok ? `reachable — ${onchainCfg.ethAddresses.length} address${onchainCfg.ethAddresses.length === 1 ? '' : 'es'}` : `HTTP ${res.status}`,
          meta: { address, status: res.status },
        });
      } catch (err) {
        checks.push({
          key: 'debank',
          label: 'DeBank (EVM)',
          ok: false,
          message: (err as Error).message,
        });
      }
    }
  }

  if (!onchainCfg.solAddress) {
    checks.push({
      key: 'solana',
      label: 'Solana RPC',
      ok: false,
      message: 'no SOL address configured',
    });
  } else {
    try {
      await Promise.race([
        getSolBalance(onchainCfg.solAddress),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout after 8s')), 8000)),
      ]);
      checks.push({
        key: 'solana',
        label: 'Solana RPC',
        ok: true,
        message: 'reachable',
        meta: { address: onchainCfg.solAddress },
      });
    } catch (err) {
      checks.push({
        key: 'solana',
        label: 'Solana RPC',
        ok: false,
        message: (err as Error).message,
      });
    }
  }

  return checks;
}

async function cmdDoctor(flags: Record<string, string | boolean>): Promise<void> {
  const checks = await runDoctor();
  const passed = checks.every((check) => check.ok);

  if (flags['json']) {
    outputJson({
      ok: passed,
      checks,
    });
    return;
  }

  outputText('finance-os doctor');
  outputText('─────────────────────────────────');
  for (const check of checks) {
    outputText(formatDoctorLine(check));
  }
  outputText('─────────────────────────────────');
  outputText(passed ? 'All checks passed' : 'Some checks failed');
}

function fmtUsd(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtAmount(n: number, decimals = 6): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

async function cmdCrypto(subArgs: string[]): Promise<void> {
  const { flags, positional } = parseArgs(subArgs);
  const sub = positional[0] ?? '';
  const json = !!flags['json'];

  switch (sub) {
    case 'kraken': {
      const cfg = getKrakenConfig();
      if (!cfg.configured) {
        if (json) outputJson({ error: 'Kraken keys not configured', kraken: null });
        else outputText('Kraken keys not configured. Set KRAKEN_API_KEY + KRAKEN_API_SECRET in ~/.openclaw/secrets/crypto-keys.env');
        return;
      }
      try {
        const client = createKrakenClient()!;
        const balances = await client.getBalances();
        if (json) {
          outputJson(balances);
        } else {
          outputText('Kraken Balances:');
          for (const b of balances) {
            outputText(`  ${b.asset}: ${fmtAmount(b.balance)}`);
          }
        }
      } catch (err) {
        if (json) outputJson({ error: (err as Error).message, kraken: null });
        else fatal((err as Error).message);
      }
      break;
    }

    case 'gemini': {
      const cfg = getGeminiConfig();
      if (!cfg.configured) {
        if (json) outputJson({ error: 'Gemini keys not configured', gemini: null });
        else outputText('Gemini keys not configured. Set GEMINI_API_KEY + GEMINI_API_SECRET in ~/.openclaw/secrets/crypto-keys.env');
        return;
      }
      try {
        const client = createGeminiClient()!;
        const balances = await client.getBalances();
        if (json) {
          outputJson(balances);
        } else {
          outputText('Gemini Balances:');
          for (const b of balances) {
            outputText(`  ${b.currency}: ${fmtAmount(b.amount)}`);
          }
        }
      } catch (err) {
        if (json) outputJson({ error: (err as Error).message, gemini: null });
        else fatal((err as Error).message);
      }
      break;
    }

    case 'wallet': {
      const cfg = getOnchainConfig();
      if (cfg.ethAddresses.length === 0 && !cfg.solAddress) {
        if (json) outputJson({ error: 'No wallet addresses configured', onchain: null });
        else outputText('No wallet addresses configured. Set RABBY_ETH_ADDRESS_MAIN and/or RABBY_SOL_ADDRESS in ~/.openclaw/secrets/crypto-keys.env');
        return;
      }
      try {
        const snapshot = await getAllOnchainBalances();
        if (json) {
          outputJson(snapshot);
        } else {
          for (const wallet of snapshot.ethereum) {
            outputText(`\nEthereum (${wallet.address.slice(0, 8)}...)`);
            outputText(`  ETH: ${fmtAmount(wallet.eth, 6)} (${fmtUsd(wallet.ethUsd)})`);
            for (const t of wallet.tokens) {
              outputText(`  ${t.symbol}: ${fmtAmount(t.balance)} (${t.usdValue !== null ? fmtUsd(t.usdValue) : '?'})`);
            }
            for (const chain of wallet.extraChains ?? []) {
              outputText(`  [${chain.chainName}]`);
              if (chain.nativeBalance > 0.0001) outputText(`    ${chain.nativeSymbol}: ${fmtAmount(chain.nativeBalance, 6)} (${fmtUsd(chain.nativeUsd)})`);
              for (const t of chain.tokens) {
                outputText(`    ${t.symbol}: ${fmtAmount(t.balance)} (${t.usdValue !== null ? fmtUsd(t.usdValue) : '?'})`);
              }
              outputText(`    Total: ${fmtUsd(chain.totalUsd)}`);
            }
            outputText(`  Total: ${fmtUsd(wallet.totalUsd)}`);
          }
          if (snapshot.solana) {
            outputText(`\nSolana (${snapshot.solana.address.slice(0, 8)}...)`);
            outputText(`  SOL: ${fmtAmount(snapshot.solana.sol, 6)} (${fmtUsd(snapshot.solana.solUsd)})`);
            for (const t of snapshot.solana.tokens) {
              outputText(`  ${t.symbol}: ${fmtAmount(t.balance)} (${t.usdValue !== null ? fmtUsd(t.usdValue) : '?'})`);
            }
            outputText(`  Total: ${fmtUsd(snapshot.solana.totalUsd)}`);
          }
          if (snapshot.errors.length > 0) {
            outputText(`\nWarnings: ${snapshot.errors.join('; ')}`);
          }
          outputText(`\nTotal on-chain: ${fmtUsd(snapshot.totalUsd)}`);
        }
      } catch (err) {
        if (json) outputJson({ error: (err as Error).message, onchain: null });
        else fatal((err as Error).message);
      }
      break;
    }

    case 'summary': {
      try {
        const snapshot = await getCryptoSnapshot();
        if (json) {
          outputJson(snapshot.summary);
        } else {
          outputText(`\nCrypto Summary — Total: ${fmtUsd(snapshot.summary.totalUsd)}`);
          outputText(`  Exchanges: ${fmtUsd(snapshot.summary.exchangeUsd)} | Wallet: ${fmtUsd(snapshot.summary.onchainUsd)}`);
          outputText('\nTop Holdings:');
          for (const h of snapshot.summary.topHoldings) {
            const pct = h.pct.toFixed(1);
            outputText(`  ${h.symbol}: ${fmtUsd(h.usdValue)} (${pct}%) [${h.sources.join(', ')}]`);
          }
        }
      } catch (err) {
        if (json) outputJson({ error: (err as Error).message });
        else fatal((err as Error).message);
      }
      break;
    }

    case '':
    default: {
      try {
        const snapshot = await getCryptoSnapshot();
        if (json) {
          outputJson(snapshot);
        } else {
          outputText(`\nCrypto Holdings — ${snapshot.fetchedAt}`);
          outputText(`Total: ${fmtUsd(snapshot.summary.totalUsd)}\n`);

          if (snapshot.exchanges.kraken) {
            outputText('Kraken:');
            for (const b of snapshot.exchanges.kraken) {
              outputText(`  ${b.asset}: ${fmtAmount(b.balance)}${b.usdValue !== null ? ` (${fmtUsd(b.usdValue)})` : ''}`);
            }
          } else if (snapshot.exchanges.krakenError) {
            outputText(`Kraken: ${snapshot.exchanges.krakenError}`);
          }

          if (snapshot.exchanges.gemini) {
            outputText('\nGemini:');
            for (const b of snapshot.exchanges.gemini) {
              outputText(`  ${b.currency}: ${fmtAmount(b.amount)}${b.usdValue !== null ? ` (${fmtUsd(b.usdValue)})` : ''}`);
            }
          } else if (snapshot.exchanges.geminiError) {
            outputText(`Gemini: ${snapshot.exchanges.geminiError}`);
          }

          if (snapshot.onchain?.ethereum && snapshot.onchain.ethereum.length > 0) {
            for (const wallet of snapshot.onchain.ethereum) {
              outputText(`\nWallet (ETH ${wallet.address.slice(0, 8)}...):`);
              outputText(`  ETH: ${fmtAmount(wallet.eth)} (${fmtUsd(wallet.ethUsd)})`);
              for (const t of wallet.tokens) {
                outputText(`  ${t.symbol}: ${fmtAmount(t.balance)} (${t.usdValue !== null ? fmtUsd(t.usdValue) : '?'})`);
              }
              for (const chain of wallet.extraChains ?? []) {
                outputText(`  [${chain.chainName}] native: ${fmtAmount(chain.nativeBalance, 6)} ${chain.nativeSymbol} (${fmtUsd(chain.nativeUsd)})`);
                for (const t of chain.tokens) {
                  outputText(`    ${t.symbol}: ${fmtAmount(t.balance)} (${t.usdValue !== null ? fmtUsd(t.usdValue) : '?'})`);
                }
              }
            }
          }
          if (snapshot.onchain?.solana) {
            const sol = snapshot.onchain.solana;
            outputText(`\nWallet (SOL):`);
            outputText(`  SOL: ${fmtAmount(sol.sol)} (${fmtUsd(sol.solUsd)})`);
            for (const t of sol.tokens) {
              outputText(`  ${t.symbol}: ${fmtAmount(t.balance)} (${t.usdValue !== null ? fmtUsd(t.usdValue) : '?'})`);
            }
          }
          if (snapshot.onchainError) {
            outputText(`Wallet: ${snapshot.onchainError}`);
          }
        }
      } catch (err) {
        if (json) outputJson({ error: (err as Error).message, exchanges: { kraken: null, gemini: null }, onchain: null });
        else fatal((err as Error).message);
      }
    }
  }
}

function parseTimeFrame(flag: string | boolean | undefined): string | undefined {
  if (!flag || flag === true) return undefined;
  const map: Record<string, string> = {
    '1M': 'ONE_MONTH',
    '3M': 'THREE_MONTHS',
    '6M': 'SIX_MONTHS',
    '1Y': 'ONE_YEAR',
    'ALL': 'ALL',
  };
  const upper = (flag as string).toUpperCase();
  if (!map[upper]) {
    fatal(`Invalid timeframe: ${flag}. Valid values: 1M, 3M, 6M, 1Y, ALL`);
  }
  return map[upper];
}

async function cmdCategoryWrite(rest: string[], flags: Record<string, string | boolean>): Promise<void> {
  const { flags: parsedFlags, positional } = parseArgs(rest);
  const mergedFlags = { ...flags, ...parsedFlags };
  const subcommand = positional[0];

  if (subcommand === 'create') {
    const name = positional[1];
    if (!name) fatal('Usage: finance category create <name> [--color <colorName>] [--excluded] [--confirm]');
    const opts: Record<string, unknown> = {};
    if (mergedFlags['color']) opts['colorName'] = mergedFlags['color'] as string;
    if (mergedFlags['excluded']) opts['isExcluded'] = true;
    await createCategory(name, opts, !!mergedFlags['confirm']);
  } else if (subcommand === 'edit') {
    const id = positional[1];
    if (!id) fatal('Usage: finance category edit <id> --name <new-name> [--color <colorName>] [--excluded] [--confirm]');
    const opts: Record<string, unknown> = {};
    if (mergedFlags['name']) opts['name'] = mergedFlags['name'] as string;
    if (mergedFlags['color']) opts['colorName'] = mergedFlags['color'] as string;
    if (mergedFlags['excluded'] !== undefined) opts['isExcluded'] = !!mergedFlags['excluded'];
    await editCategory(id, opts, !!mergedFlags['confirm']);
  } else if (subcommand === 'delete') {
    const id = positional[1];
    if (!id) fatal('Usage: finance category delete <id> [--confirm]');
    await deleteCategory(id, !!mergedFlags['confirm']);
  } else {
    fatal(`Unknown category subcommand: ${subcommand}. Use: create, edit, delete`);
  }
}

async function cmdHoldings(flags: Record<string, string | boolean>): Promise<void> {
  const aggregated = !!flags['aggregated'];
  const timeFrame = parseTimeFrame(flags['timeframe']);

  if (aggregated) {
    const holdings = await getAggregatedHoldings(timeFrame as HoldingsTimeFrame | undefined);
    if (flags['json']) {
      outputJson(holdings);
    } else {
      outputText(formatAggregatedHoldingsTable(holdings));
    }
  } else {
    const holdings = await getHoldings();
    if (flags['json']) {
      outputJson(holdings);
    } else {
      outputText(formatHoldingsTable(holdings));
    }
  }
}

async function cmdPerformance(flags: Record<string, string | boolean>): Promise<void> {
  const timeFrame = parseTimeFrame(flags['timeframe']);
  const data = await getInvestmentPerformance(timeFrame as InvestmentsTimeFrame | undefined);
  if (flags['json']) {
    outputJson(data);
  } else {
    outputText(formatPerformanceTable(data));
  }
}

async function cmdAllocation(flags: Record<string, string | boolean>): Promise<void> {
  const data = await getInvestmentAllocation();
  if (flags['json']) {
    outputJson(data);
  } else {
    outputText(formatAllocationTable(data));
  }
}

async function cmdTags(flags: Record<string, string | boolean>): Promise<void> {
  const tags = await getTags();
  if (flags['json']) {
    outputJson(tags);
  } else {
    outputText(formatTagsTable(tags));
  }
}

async function cmdTagWrite(rest: string[], flags: Record<string, string | boolean>): Promise<void> {
  const { flags: parsedFlags, positional } = parseArgs(rest);
  const mergedFlags = { ...flags, ...parsedFlags };
  const subcommand = positional[0];

  if (subcommand === 'create') {
    const name = positional[1];
    if (!name) fatal('Usage: finance tag create <name> [--color <colorName>] [--confirm]');
    const opts: Record<string, unknown> = {};
    if (mergedFlags['color']) opts['colorName'] = mergedFlags['color'] as string;
    await createTag(name, opts, !!mergedFlags['confirm']);
  } else if (subcommand === 'edit') {
    const id = positional[1];
    if (!id) fatal('Usage: finance tag edit <id> --name <new-name> [--confirm]');
    const opts: Record<string, unknown> = {};
    if (mergedFlags['name']) opts['name'] = mergedFlags['name'] as string;
    await editTag(id, opts, !!mergedFlags['confirm']);
  } else if (subcommand === 'delete') {
    const id = positional[1];
    if (!id) fatal('Usage: finance tag delete <id> [--confirm]');
    await deleteTag(id, !!mergedFlags['confirm']);
  } else {
    fatal(`Unknown tag subcommand: ${subcommand}. Use: create, edit, delete`);
  }
}

async function cmdRecurring(flags: Record<string, string | boolean>, positional: string[]): Promise<void> {
  const id = positional[0];

  if (id && flags['metrics']) {
    const metrics = await getRecurringMetrics(id);
    if (flags['json']) {
      outputJson(metrics);
    } else {
      if (!metrics) {
        outputText(`No metrics found for recurring ${id}`);
      } else {
        const fmt = (n: number | null) => n !== null ? `$${Math.abs(n).toFixed(2)}` : '?';
        outputText(`Recurring Metrics (${id}):`);
        outputText(`  Average: ${fmt(metrics.averageTransactionAmount)}`);
        outputText(`  Total Spent: ${fmt(metrics.totalSpent)}`);
        outputText(`  Period: ${metrics.period ?? '?'}`);
      }
    }
    return;
  }

  const recurrings = await getRecurrings();
  if (flags['json']) {
    outputJson(recurrings);
  } else {
    outputText(formatRecurringsTable(recurrings));
  }
}

async function cmdAccountHistory(positional: string[], flags: Record<string, string | boolean>): Promise<void> {
  const accountId = positional[0];
  if (!accountId) {
    fatal('Usage: finance account-history <account-id> [--timeframe 1M|3M|6M|1Y|ALL] [--json]');
  }

  // Look up itemId from account
  const accounts = await getAccounts(true);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) {
    fatal(`Account ${accountId} not found`);
  }

  // Need itemId — accounts from the raw query have it, but our primitive strips it.
  // Fetch raw to get itemId
  const rawData = await getClient().graphql<{
    accounts: Array<{ id: string; itemId: string; name: string }>;
  }>('Accounts', `query Accounts { accounts { id itemId name } }`, {});

  const rawAccount = rawData?.accounts?.find((a) => a.id === accountId);
  if (!rawAccount?.itemId) {
    fatal(`Could not resolve itemId for account ${accountId}`);
  }

  const timeFrame = parseTimeFrame(flags['timeframe']);
  const history = await getBalanceHistory(rawAccount.itemId, accountId, timeFrame as AccountHistoryTimeFrame | undefined);

  if (flags['json']) {
    outputJson(history);
  } else {
    outputText(formatBalanceHistoryTable(history, account.name));
  }
}

async function cmdTransactionWrite(rest: string[], flags: Record<string, string | boolean>): Promise<void> {
  const { flags: parsedFlags, positional } = parseArgs(rest);
  const mergedFlags = { ...flags, ...parsedFlags };
  const subcommand = positional[0];

  if (subcommand === 'create') {
    const accountId = mergedFlags['account'] as string;
    const amount = Number(mergedFlags['amount']);
    const name = mergedFlags['name'] as string;
    const date = mergedFlags['date'] as string;

    if (!accountId || !Number.isFinite(amount) || !name || !date) {
      fatal('Usage: finance transaction create --account <id> --amount <n> --name <name> --date <YYYY-MM-DD> [--confirm]');
    }

    // Resolve itemId from accountId
    const rawData = await getClient().graphql<{
      accounts: Array<{ id: string; itemId: string }>;
    }>('Accounts', `query Accounts { accounts { id itemId } }`, {});

    const rawAccount = rawData?.accounts?.find((a) => a.id === accountId);
    if (!rawAccount?.itemId) {
      fatal(`Could not resolve itemId for account ${accountId}`);
    }

    await createTransaction(
      { accountId, itemId: rawAccount.itemId, amount, name, date },
      !!mergedFlags['confirm']
    );
  } else if (subcommand === 'delete') {
    const txId = positional[1];
    if (!txId) fatal('Usage: finance transaction delete <tx-id> [--confirm]');

    // Resolve itemId + accountId from tx
    const rawData = await getClient().graphql<{
      transactions: {
        edges: Array<{ node: { id: string; itemId: string; accountId: string } }>;
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

    const match = rawData?.transactions?.edges?.[0]?.node;
    if (!match) {
      fatal(`Transaction ${txId} not found`);
    }

    await deleteTransaction(match.itemId, match.accountId, txId, !!mergedFlags['confirm']);
  } else {
    fatal(`Unknown transaction subcommand: ${subcommand}. Use: create, delete`);
  }
}

async function cmdExport(flags: Record<string, string | boolean>): Promise<void> {
  const month = flags['month'] as string | undefined;

  let result;
  if (month) {
    result = await exportTransactionsByMonth(month);
  } else {
    result = await exportTransactions();
  }

  if (flags['json']) {
    outputJson(result);
  } else {
    if (result) {
      outputText(`Export URL: ${result.url}`);
      outputText(`Expires: ${result.expiresAt}`);
    } else {
      outputText('Export failed or returned no data.');
    }
  }
}

async function cmdSummary(flags: Record<string, string | boolean>): Promise<void> {
  const month = flags['month'] as string | undefined;

  let summary;
  if (month) {
    summary = await getTransactionSummaryByMonth(month);
  } else {
    summary = await getTransactionSummary();
  }

  if (flags['json']) {
    outputJson(summary);
  } else {
    outputText(formatSummaryTable(summary));
  }
}

async function cmdRefresh(flags: Record<string, string | boolean>): Promise<void> {
  const connections = await refreshAllConnections();
  if (flags['json']) {
    outputJson(connections);
  } else {
    outputText(formatRefreshResult(connections));
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    process.stdout.write(
      [
        'Finance OS CLI',
        '',
        'Read commands:',
        '  finance accounts [--json]',
        '  finance balances [--json]',
        '  finance transactions [--limit N] [--unreviewed] [--search TEXT] [--json]',
        '  finance categories [--json]',
        '  finance spending [--month YYYY-MM] [--json]',
        '  finance budget [--month YYYY-MM] [--json]',
        '  finance budget set <category-id> <amount> [--month YYYY-MM] [--confirm]',
        '  finance networth [--history] [--json]',
        '  finance snapshot [--print]',
        '  finance doctor [--json]',
        '',
        'Investment commands:',
        '  finance holdings [--aggregated] [--timeframe 1M|3M|6M|1Y|ALL] [--json]',
        '  finance performance [--timeframe 1M|3M|6M|1Y|ALL] [--json]',
        '  finance allocation [--json]',
        '',
        'Tag commands:',
        '  finance tags [--json]',
        '  finance tag create <name> [--color <colorName>] [--confirm]',
        '  finance tag edit <id> --name <new-name> [--confirm]',
        '  finance tag delete <id> [--confirm]',
        '',
        'Recurring commands:',
        '  finance recurring [--json]',
        '  finance recurring <id> --metrics [--json]',
        '',
        'Account history:',
        '  finance account-history <account-id> [--timeframe 1M|3M|6M|1Y|ALL] [--json]',
        '',
        'Category management (dry-run by default):',
        '  finance category create <name> [--color <colorName>] [--excluded] [--confirm]',
        '  finance category edit <id> --name <new-name> [--color <colorName>] [--excluded] [--confirm]',
        '  finance category delete <id> [--confirm]',
        '',
        'Transaction management (dry-run by default):',
        '  finance transaction create --account <id> --amount <n> --name <name> --date <YYYY-MM-DD> [--confirm]',
        '  finance transaction delete <tx-id> [--confirm]',
        '',
        'Export & summary:',
        '  finance export [--month YYYY-MM]',
        '  finance summary [--month YYYY-MM] [--json]',
        '',
        'Connections:',
        '  finance refresh [--json]',
        '',
        'Crypto commands:',
        '  finance crypto [--json]              — full snapshot (all sources)',
        '  finance crypto kraken [--json]       — Kraken only',
        '  finance crypto gemini [--json]       — Gemini only',
        '  finance crypto wallet [--json]       — on-chain ETH + SOL',
        '  finance crypto summary [--json]      — top holdings aggregated',
        '',
        'Write commands (dry-run by default, add --confirm to execute):',
        '  finance set-category <tx-id> <category-id> [--confirm]',
        '  finance mark-reviewed <tx-id> [--confirm]',
        '  finance set-notes <tx-id> <notes...> [--confirm]',
        '  finance mark-all-reviewed [--confirm]',
        '',
      ].join('\n')
    );
    process.exit(0);
  }

  const command = argv[0];
  const rest = argv.slice(1);
  const { flags, positional } = parseArgs(rest);

  try {
    switch (command) {
      case 'accounts':
        await cmdAccounts(flags);
        break;
      case 'balances':
        await cmdBalances(flags);
        break;
      case 'transactions':
        await cmdTransactions(flags);
        break;
      case 'categories':
        await cmdCategories(flags);
        break;
      case 'spending':
        await cmdSpending(flags);
        break;
      case 'budget':
        await cmdBudget(rest, flags);
        break;
      case 'networth':
        await cmdNetworth(flags);
        break;
      case 'snapshot':
        await cmdSnapshot(flags);
        break;
      case 'doctor':
        await cmdDoctor(flags);
        break;
      case 'set-category':
        await cmdSetCategory(positional, flags);
        break;
      case 'mark-reviewed':
        await cmdMarkReviewed(positional, flags);
        break;
      case 'set-notes':
        await cmdSetNotes(positional, flags);
        break;
      case 'mark-all-reviewed':
        await cmdMarkAllReviewed(flags);
        break;
      case 'category':
        await cmdCategoryWrite(rest, flags);
        break;
      case 'holdings':
        await cmdHoldings(flags);
        break;
      case 'performance':
        await cmdPerformance(flags);
        break;
      case 'allocation':
        await cmdAllocation(flags);
        break;
      case 'tags':
        await cmdTags(flags);
        break;
      case 'tag':
        await cmdTagWrite(rest, flags);
        break;
      case 'recurring':
        await cmdRecurring(flags, positional);
        break;
      case 'account-history':
        await cmdAccountHistory(positional, flags);
        break;
      case 'transaction':
        await cmdTransactionWrite(rest, flags);
        break;
      case 'export':
        await cmdExport(flags);
        break;
      case 'summary':
        await cmdSummary(flags);
        break;
      case 'refresh':
        await cmdRefresh(flags);
        break;
      case 'crypto':
        await cmdCrypto(rest);
        break;
      default:
        fatal(`Unknown command: ${command}. Run 'finance' for help.`);
    }
  } catch (err) {
    fatal((err as Error).message);
  }
}

main();
