/**
 * crypto/index.ts — Unified crypto snapshot aggregator
 *
 * Combines Kraken, Gemini, and on-chain (ETH + SOL) balances into
 * a single CryptoSnapshot. Never throws — always returns partial results
 * with error fields when sources fail.
 */

import { createKrakenClient, KrakenBalance, KrakenError } from './kraken';
import { createGeminiClient, GeminiBalance, GeminiError } from './gemini';
import { getAllOnchainBalances, getUsdPrices, OnchainSnapshot } from './onchain';
import { getKrakenConfig, getGeminiConfig, getOnchainConfig } from './config';

// ── Types ──────────────────────────────────────────────────────────────────

export interface HoldingSummary {
  symbol: string;
  totalAmount: number;
  usdValue: number;
  pct: number;        // % of total crypto portfolio
  sources: string[];  // which exchanges/wallets hold this asset
}

export interface CryptoSnapshot {
  fetchedAt: string;  // ISO timestamp
  exchanges: {
    kraken: KrakenBalance[] | null;
    krakenError: string | null;
    gemini: GeminiBalance[] | null;
    geminiError: string | null;
  };
  onchain: OnchainSnapshot | null;
  onchainError: string | null;
  summary: {
    totalUsd: number;
    exchangeUsd: number;
    onchainUsd: number;
    byAsset: Record<string, { amount: number; usdValue: number; sources: string[] }>;
    topHoldings: HoldingSummary[];  // top 5 by USD value
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Map of well-known USD stablecoins — price is always $1 */
const USD_STABLES = new Set(['USD', 'USDC', 'USDT', 'DAI', 'BUSD', 'GUSD', 'PYUSD', 'FDUSD']);

function isStable(symbol: string): boolean {
  return USD_STABLES.has(symbol.toUpperCase());
}

/** Merge asset into byAsset accumulator */
function mergeAsset(
  byAsset: Record<string, { amount: number; usdValue: number; sources: string[] }>,
  symbol: string,
  amount: number,
  usdValue: number,
  source: string
): void {
  const key = symbol.toUpperCase();
  if (!byAsset[key]) {
    byAsset[key] = { amount: 0, usdValue: 0, sources: [] };
  }
  byAsset[key].amount += amount;
  byAsset[key].usdValue += usdValue;
  if (!byAsset[key].sources.includes(source)) {
    byAsset[key].sources.push(source);
  }
}

// ── Price enrichment ───────────────────────────────────────────────────────

async function enrichKrakenBalances(balances: KrakenBalance[]): Promise<KrakenBalance[]> {
  const symbols = balances.map((b) => b.asset);
  const prices = await getUsdPrices(symbols);

  return balances.map((b) => ({
    ...b,
    usdValue: isStable(b.asset)
      ? b.balance
      : (prices[b.asset] !== undefined ? b.balance * prices[b.asset] : null),
  }));
}

async function enrichGeminiBalances(balances: GeminiBalance[]): Promise<GeminiBalance[]> {
  const symbols = balances.map((b) => b.currency);
  const prices = await getUsdPrices(symbols);

  return balances.map((b) => ({
    ...b,
    usdValue: isStable(b.currency)
      ? b.amount
      : (prices[b.currency] !== undefined ? b.amount * prices[b.currency] : null),
  }));
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Build a full crypto snapshot from all configured sources.
 * Never throws. Returns partial results + error fields on failure.
 */
export async function getCryptoSnapshot(): Promise<CryptoSnapshot> {
  const fetchedAt = new Date().toISOString();
  const byAsset: Record<string, { amount: number; usdValue: number; sources: string[] }> = {};

  // ── Kraken ──
  let krakenBalances: KrakenBalance[] | null = null;
  let krakenError: string | null = null;

  const krakenConfig = getKrakenConfig();
  if (!krakenConfig.configured) {
    krakenError = 'Kraken keys not configured — set KRAKEN_API_KEY + KRAKEN_API_SECRET';
  } else {
    try {
      const client = createKrakenClient()!;
      const raw = await client.getBalances();
      krakenBalances = await enrichKrakenBalances(raw);

      for (const b of krakenBalances) {
        mergeAsset(byAsset, b.asset, b.balance, b.usdValue ?? 0, 'kraken');
      }
    } catch (err) {
      krakenError = err instanceof KrakenError
        ? err.message
        : `Kraken error: ${(err as Error).message}`;
    }
  }

  // ── Gemini ──
  let geminiBalances: GeminiBalance[] | null = null;
  let geminiError: string | null = null;

  const geminiConfig = getGeminiConfig();
  if (!geminiConfig.configured) {
    geminiError = 'Gemini keys not configured — set GEMINI_API_KEY + GEMINI_API_SECRET';
  } else {
    try {
      const client = createGeminiClient()!;
      const raw = await client.getBalances();
      geminiBalances = await enrichGeminiBalances(raw);

      for (const b of geminiBalances) {
        mergeAsset(byAsset, b.currency, b.amount, b.usdValue ?? 0, 'gemini');
      }
    } catch (err) {
      geminiError = err instanceof GeminiError
        ? err.message
        : `Gemini error: ${(err as Error).message}`;
    }
  }

  // ── On-chain ──
  let onchain: OnchainSnapshot | null = null;
  let onchainError: string | null = null;

  const onchainConfig = getOnchainConfig();
  if (onchainConfig.ethAddresses.length === 0 && !onchainConfig.solAddress) {
    onchainError = 'No wallet addresses configured — set RABBY_ETH_ADDRESS_MAIN and/or RABBY_SOL_ADDRESS';
  } else {
    try {
      onchain = await getAllOnchainBalances();

      // ethereum is now an array of wallets (each with mainnet + extra EVM chains)
      for (const wallet of onchain.ethereum) {
        mergeAsset(byAsset, 'ETH', wallet.eth, wallet.ethUsd, 'wallet');
        for (const t of wallet.tokens) {
          mergeAsset(byAsset, t.symbol, t.balance, t.usdValue ?? 0, 'wallet');
        }
        for (const chain of wallet.extraChains) {
          if (chain.nativeBalance > 0) {
            mergeAsset(byAsset, chain.nativeSymbol, chain.nativeBalance, chain.nativeUsd, chain.chainId);
          }
          for (const t of chain.tokens) {
            mergeAsset(byAsset, t.symbol, t.balance, t.usdValue ?? 0, chain.chainId);
          }
        }
      }
      if (onchain.solana) {
        mergeAsset(byAsset, 'SOL', onchain.solana.sol, onchain.solana.solUsd, 'wallet');
        for (const t of onchain.solana.tokens) {
          mergeAsset(byAsset, t.symbol, t.balance, t.usdValue ?? 0, 'wallet');
        }
      }
      if (onchain.errors.length > 0) {
        onchainError = onchain.errors.join('; ');
      }
    } catch (err) {
      onchainError = `On-chain error: ${(err as Error).message}`;
    }
  }

  // ── Summary ──
  const exchangeUsd =
    (krakenBalances?.reduce((s, b) => s + (b.usdValue ?? 0), 0) ?? 0) +
    (geminiBalances?.reduce((s, b) => s + (b.usdValue ?? 0), 0) ?? 0);

  const onchainUsd = onchain?.totalUsd ?? 0;
  const totalUsd = exchangeUsd + onchainUsd;

  // Top 5 holdings by USD value
  const topHoldings: HoldingSummary[] = Object.entries(byAsset)
    .map(([symbol, data]) => ({
      symbol,
      totalAmount: data.amount,
      usdValue: data.usdValue,
      pct: totalUsd > 0 ? (data.usdValue / totalUsd) * 100 : 0,
      sources: data.sources,
    }))
    .filter((h) => h.usdValue > 0)
    .sort((a, b) => b.usdValue - a.usdValue)
    .slice(0, 5);

  return {
    fetchedAt,
    exchanges: {
      kraken: krakenBalances,
      krakenError,
      gemini: geminiBalances,
      geminiError,
    },
    onchain,
    onchainError,
    summary: {
      totalUsd,
      exchangeUsd,
      onchainUsd,
      byAsset,
      topHoldings,
    },
  };
}
