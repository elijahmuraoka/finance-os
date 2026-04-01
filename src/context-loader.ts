/**
 * context-loader.ts — Finance snapshot builder
 *
 * Aggregates financial state from Copilot Money and writes a markdown
 * snapshot to memory/finance-snapshot.md for Bob's context.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getAccountBalances } from './primitives/accounts';
import { getMonthlySpend } from './primitives/budgets';
import { getSpendingByCategory } from './primitives/categories';
import { getCurrentNetworth } from './primitives/networth';
import { getUnreviewed } from './primitives/transactions';
import { getBudgetStatus } from './primitives/budgets';
import { getCryptoSnapshot } from './crypto/index';
import { getKrakenConfig, getGeminiConfig, getOnchainConfig } from './crypto/config';

const SNAPSHOT_PATH = path.join(
  process.env['HOME'] ?? '/Users/bob',
  '.openclaw/workspace/memory/finance-snapshot.md'
);

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDollars(n: number): string {
  return `$${fmt(Math.abs(n))}`;
}

function nowET(): string {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function currentMonthLabel(): string {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    year: 'numeric',
  });
}

function currentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export async function buildFinanceSnapshot(): Promise<void> {
  const sections: string[] = [];

  sections.push(`# Finance Snapshot`);
  sections.push(`_Updated: ${nowET()} ET_`);
  sections.push('');

  // ── Accounts ────────────────────────────────────────────────────────────
  try {
    const balances = await getAccountBalances();

    let totalAssets = 0;
    let totalDebt = 0;
    const accountLines: string[] = [];

    // Accounts with known stale/unreliable data — excluded from totals and flagged
    const STALE_ACCOUNT_IDS: Record<string, string> = {
      'Og0xjkaM0EiKwZMKmj9DtbjRNPzz0MUPJkDxx9': 'Bilt 2.0 upgrade pending — not yet activated with Column Bank',
    };

    for (const acct of balances) {
      const typeLabel = acct.type.toLowerCase();
      const isDebt = typeLabel === 'credit' || typeLabel === 'loan';
      const balance = acct.balance ?? 0;
      const staleReason = STALE_ACCOUNT_IDS[acct.id];

      if (staleReason) {
        // Exclude from totals, flag in output
        const sub = acct.subType ? ` (${acct.subType})` : '';
        accountLines.push(`- ~~${acct.name}${sub}~~ [${acct.type}]: ⚠️ stale — ${staleReason}`);
        continue;
      }

      if (isDebt) {
        totalDebt += Math.abs(balance);
      } else {
        totalAssets += balance;
      }

      const sub = acct.subType ? ` (${acct.subType})` : '';
      const balStr = balance >= 0 ? `$${fmt(balance)}` : `-$${fmt(Math.abs(balance))}`;
      accountLines.push(`- ${acct.name}${sub} [${acct.type}]: ${balStr}`);
    }

    sections.push('## Accounts');
    sections.push(...accountLines);
    sections.push('');
    sections.push(
      `**Total assets:** ${fmtDollars(totalAssets)} | **Total debt:** ${fmtDollars(totalDebt)}`
    );
  } catch {
    sections.push('## Accounts');
    sections.push('[unavailable]');
  }

  sections.push('');

  // ── Monthly Spend ────────────────────────────────────────────────────────
  const month = currentMonth();
  const monthLabel = currentMonthLabel();

  try {
    const [monthlySpend, spendByCategory, budgetStatus] = await Promise.all([
      getMonthlySpend(month),
      getSpendingByCategory(month),
      getBudgetStatus(month),
    ]);

    sections.push(`## This Month (${monthLabel})`);

    const spentLine = (() => {
      const spent = fmtDollars(monthlySpend.total);
      if (monthlySpend.budgeted !== null && monthlySpend.budgeted > 0) {
        const pct = Math.round((monthlySpend.total / monthlySpend.budgeted) * 100);
        return `- Spent: ${spent} of ${fmtDollars(monthlySpend.budgeted)} budgeted (${pct}% used)`;
      }
      return `- Spent: ${spent}`;
    })();

    sections.push(spentLine);

    // Top 5 categories by spend
    const topCats = [...spendByCategory]
      .filter((c) => c.actual > 0)
      .sort((a, b) => b.actual - a.actual)
      .slice(0, 5);

    if (topCats.length > 0) {
      const topStr = topCats.map((c) => `${c.categoryName} ${fmtDollars(c.actual)}`).join(', ');
      sections.push(`- **Top categories:** ${topStr}`);
    }

    // Over-budget categories
    const overBudget = budgetStatus.filter((b) => b.isOverBudget);
    if (overBudget.length > 0) {
      const overStr = overBudget
        .map((b) => `${b.categoryName} ${fmtDollars(Math.abs(b.remaining))} over`)
        .join(', ');
      sections.push(`- **Over budget:** ${overStr}`);
    } else {
      sections.push('- **Over budget:** None');
    }
  } catch {
    sections.push(`## This Month (${monthLabel})`);
    sections.push('[unavailable]');
  }

  sections.push('');

  // ── Net Worth ────────────────────────────────────────────────────────────
  try {
    const nw = await getCurrentNetworth();
    sections.push('## Net Worth');
    if (nw) {
      sections.push(
        `Assets: ${fmtDollars(nw.assets)} | Debt: ${fmtDollars(nw.debt)} | **Net: ${nw.net >= 0 ? fmtDollars(nw.net) : `-${fmtDollars(Math.abs(nw.net))}`}**`
      );
    } else {
      sections.push('[no data]');
    }
  } catch {
    sections.push('## Net Worth');
    sections.push('[unavailable]');
  }

  sections.push('');

  // ── Action Needed ────────────────────────────────────────────────────────
  sections.push('## Action Needed');

  try {
    const unreviewed = await getUnreviewed();
    const count = unreviewed.length;

    if (count > 0) {
      sections.push(
        `- **${count} unreviewed transactions** (run: \`finance transactions --unreviewed --json\`)`
      );
    } else {
      sections.push('- No unreviewed transactions ✓');
    }
  } catch {
    sections.push('- Unreviewed transaction count: [unavailable]');
  }

  // Re-use overBudget from spending section (re-fetch if needed — simple approach)
  try {
    const budgetStatus = await getBudgetStatus(month);
    const overBudget = budgetStatus.filter((b) => b.isOverBudget);
    for (const b of overBudget) {
      sections.push(
        `- **${b.categoryName}** is over budget by ${fmtDollars(Math.abs(b.remaining))} (run: \`finance budget --json\`)`
      );
    }
  } catch {
    // already handled above
  }

  sections.push('');

  // ── Crypto Holdings ──────────────────────────────────────────────────────
  const krakenCfg = getKrakenConfig();
  const geminiCfg = getGeminiConfig();
  const onchainCfg = getOnchainConfig();
  const anyCryptoConfigured =
    krakenCfg.configured ||
    geminiCfg.configured ||
    Boolean(onchainCfg.ethAddresses.length > 0 || onchainCfg.solAddress);

  sections.push('## Crypto Holdings');

  if (!anyCryptoConfigured) {
    sections.push('_Not configured — add keys to run `finance crypto`_');
    sections.push('_Edit `~/.openclaw/secrets/crypto-keys.env` to configure Kraken, Gemini, and/or wallet addresses_');
  } else {
    try {
      const crypto = await getCryptoSnapshot();
      const { summary, exchanges, onchain, onchainError } = crypto;

      sections.push(`_Sources: ${[
        exchanges.kraken !== null ? 'Kraken' : null,
        exchanges.gemini !== null ? 'Gemini' : null,
        onchain?.ethereum ? 'ETH wallet' : null,
        onchain?.solana ? 'SOL wallet' : null,
      ].filter(Boolean).join(', ') || 'none configured'}_`);
      sections.push('');

      sections.push(`**Total crypto: ${fmtDollars(summary.totalUsd)}**`);

      // Top holdings by USD value (up to 8)
      const topHoldings = Object.entries(summary.byAsset)
        .filter(([, d]) => d.usdValue > 0)
        .sort(([, a], [, b]) => b.usdValue - a.usdValue)
        .slice(0, 8);

      for (const [symbol, data] of topHoldings) {
        const amount = data.amount.toLocaleString('en-US', { maximumFractionDigits: 6 });
        sections.push(`- ${symbol}: ${amount} (${fmtDollars(data.usdValue)})`);
      }

      sections.push('');

      const exchangeParts: string[] = [];
      if (exchanges.kraken !== null) {
        const kTotal = exchanges.kraken.reduce((s, b) => s + (b.usdValue ?? 0), 0);
        exchangeParts.push(`Kraken ${fmtDollars(kTotal)}`);
      } else if (exchanges.krakenError) {
        exchangeParts.push(`Kraken [error]`);
      }
      if (exchanges.gemini !== null) {
        const gTotal = exchanges.gemini.reduce((s, b) => s + (b.usdValue ?? 0), 0);
        exchangeParts.push(`Gemini ${fmtDollars(gTotal)}`);
      } else if (exchanges.geminiError) {
        exchangeParts.push(`Gemini [error]`);
      }
      if (onchain?.totalUsd !== undefined) {
        exchangeParts.push(`Wallet ${fmtDollars(onchain.totalUsd)}`);
      } else if (onchainError) {
        exchangeParts.push(`Wallet [error]`);
      }

      if (exchangeParts.length > 0) {
        sections.push(`**By source:** ${exchangeParts.join(' | ')}`);
      }
    } catch (err) {
      sections.push(`[crypto snapshot failed: ${(err as Error).message}]`);
    }
  }

  sections.push('');

  // ── Write ────────────────────────────────────────────────────────────────
  const content = sections.join('\n');
  const dir = path.dirname(SNAPSHOT_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SNAPSHOT_PATH, content, 'utf8');
}

export function getSnapshotPath(): string {
  return SNAPSHOT_PATH;
}
