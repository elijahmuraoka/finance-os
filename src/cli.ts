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

    try {
      const snapshot = await getAllOnchainBalances();
      const wallet = snapshot.ethereum.find((entry) => entry.address.toLowerCase() === address.toLowerCase());
      const chainCount = wallet ? 1 + (wallet.extraChains?.length ?? 0) : 0;
      const prefix = cacheAgeMinutes !== null && cacheAgeMinutes <= 30 ? `cached (${cacheAgeMinutes} min old)` : 'reachable';
      checks.push({
        key: 'debank',
        label: 'DeBank (EVM)',
        ok: Boolean(wallet),
        message: wallet ? `${prefix} — ${chainCount} address${chainCount === 1 ? '' : 'es'}` : 'no wallet data returned',
        meta: { address, cachePath, cacheAgeMinutes, chainCount },
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

  if (!onchainCfg.solAddress) {
    checks.push({
      key: 'solana',
      label: 'Solana RPC',
      ok: false,
      message: 'no SOL address configured',
    });
  } else {
    try {
      await getSolBalance(onchainCfg.solAddress);
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
