/**
 * onchain.ts — Blockchain balance queries via DeBank (multi-chain EVM) + Solana public RPC
 *
 * Multi-chain EVM (ETH/BNB/Base/Arb/Polygon/etc): DeBank public API (api.rabby.io)
 *   — returns all chains + tokens for an address in one call, no key needed
 *   — 30-min disk cache prevents rate-limit (1 cron/day is safe)
 * SOL balance: Solana mainnet public JSON-RPC (getBalance)
 * SOL tokens: Solana mainnet JSON-RPC (getTokenAccountsByOwner) + Jupiter metadata
 * Price data: CoinGecko free API (no key needed), cached 5 minutes — used for Solana path
 *
 * Dust filter: exclude any token with USD value < $1.00
 */

import { getOnchainConfig } from './config';

// ── Price cache ────────────────────────────────────────────────────────────

interface PriceCache {
  prices: Record<string, number>; // symbol → USD price
  fetchedAt: number;
}

let priceCache: PriceCache | null = null;
const PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// CoinGecko coin IDs for common assets
const COINGECKO_ID_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  WETH: 'weth',
  WBTC: 'wrapped-bitcoin',
  MATIC: 'matic-network',
  POL: 'matic-network',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  COMP: 'compound-governance-token',
  MKR: 'maker',
  SNX: 'havven',
  GRT: 'the-graph',
  LTC: 'litecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  DOT: 'polkadot',
  AVAX: 'avalanche-2',
  ATOM: 'cosmos',
  NEAR: 'near',
  ALGO: 'algorand',
  FIL: 'filecoin',
  DOGE: 'dogecoin',
  SHIB: 'shiba-inu',
  ARB: 'arbitrum',
  OP: 'optimism',
  APE: 'apecoin',
  CRV: 'curve-dao-token',
  LDO: 'lido-dao',
  RPL: 'rocket-pool',
  PEPE: 'pepe',
  WIF: 'dogwifcoin',
  BONK: 'bonk',
  JUP: 'jupiter-exchange-solana',
  PYTH: 'pyth-network',
  JTO: 'jito-governance-token',
  W: 'wormhole',
  RAY: 'raydium',
  ORCA: 'orca',
  BNB: 'binancecoin',
  MNT: 'mantle',
  SAND: 'the-sandbox',
  GALA: 'gala',
  SUPER: 'superfarm',
  KPER: 'kperp',
};

/** Fetch USD prices for a set of symbols from CoinGecko. Cached 5 min. */
export async function getUsdPrices(symbols: string[]): Promise<Record<string, number>> {
  const now = Date.now();

  // Return cache if fresh
  if (priceCache && now - priceCache.fetchedAt < PRICE_CACHE_TTL_MS) {
    return priceCache.prices;
  }

  // Map symbols → CoinGecko IDs (skip unknowns)
  const symbolsToFetch = [...new Set([...symbols, 'ETH', 'SOL', 'BTC', 'USDC', 'BNB', 'MNT', 'POL'])];
  const coinIds = symbolsToFetch
    .map((s) => COINGECKO_ID_MAP[s.toUpperCase()])
    .filter(Boolean);

  const uniqueIds = [...new Set(coinIds)];

  if (uniqueIds.length === 0) return {};

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${uniqueIds.join(',')}&vs_currencies=usd`;

  let data: Record<string, { usd: number }> = {};
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'finance-skill/0.1.0' },
    });
    if (response.ok) {
      data = (await response.json()) as typeof data;
    }
  } catch {
    // Price fetch failed — return stale cache if available, else empty
    if (priceCache) return priceCache.prices;
    return {};
  }

  // Build symbol → price map
  const prices: Record<string, number> = {};
  // USD stables are always 1
  prices['USD'] = 1;
  prices['USDC'] = 1;
  prices['USDT'] = 1;
  prices['DAI'] = 1;
  prices['BUSD'] = 1;
  prices['GUSD'] = 1;

  for (const [symbol, cgId] of Object.entries(COINGECKO_ID_MAP)) {
    if (data[cgId]?.usd !== undefined) {
      prices[symbol] = data[cgId].usd;
    }
  }

  priceCache = { prices, fetchedAt: now };
  return prices;
}

// ── Shared types ───────────────────────────────────────────────────────────

export interface TokenBalance {
  symbol: string;
  name: string;
  contractAddress: string;
  balance: number;          // human-readable amount (decimals applied)
  decimals: number;
  usdPrice: number | null;
  usdValue: number | null;
}

// ── Solana (public JSON-RPC) ───────────────────────────────────────────────

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const SOL_DECIMALS = 9;
// SPL Token program IDs
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

interface SolanaRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function solanaRpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'finance-skill/0.1.0',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Solana RPC HTTP ${response.status}`);
  }

  const json = (await response.json()) as SolanaRpcResponse<T>;

  if (json.error) {
    throw new Error(`Solana RPC error ${json.error.code}: ${json.error.message}`);
  }

  if (json.result === undefined) {
    throw new Error('Solana RPC: no result in response');
  }

  return json.result;
}

/**
 * Get native SOL balance for an address.
 */
export async function getSolBalance(
  address: string
): Promise<{ sol: number; usdValue: number }> {
  // getBalance returns lamports
  const result = await solanaRpc<{ value: number }>('getBalance', [
    address,
    { commitment: 'confirmed' },
  ]);

  const sol = (result?.value ?? 0) / Math.pow(10, SOL_DECIMALS);
  const prices = await getUsdPrices(['SOL']);
  const solPrice = prices['SOL'] ?? 0;

  return { sol, usdValue: sol * solPrice };
}

/**
 * Get SPL token balances for a Solana address.
 * Uses getTokenAccountsByOwner with both standard token programs.
 * Filters dust (< $1 USD).
 */
export async function getSolTokenBalances(address: string): Promise<TokenBalance[]> {
  type TokenAccountInfo = {
    account: {
      data: {
        parsed: {
          info: {
            mint: string;
            tokenAmount: {
              amount: string;
              decimals: number;
              uiAmount: number | null;
              uiAmountString: string;
            };
          };
          type: string;
        };
        program: string;
        space: number;
      };
      executable: boolean;
      lamports: number;
      owner: string;
    };
    pubkey: string;
  };

  type TokenAccountsResult = {
    value: TokenAccountInfo[];
  };

  const allAccounts: TokenAccountInfo[] = [];

  // Query both token programs
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const result = await solanaRpc<TokenAccountsResult>('getTokenAccountsByOwner', [
        address,
        { programId },
        { encoding: 'jsonParsed', commitment: 'confirmed' },
      ]);
      if (result?.value) {
        allAccounts.push(...result.value);
      }
    } catch {
      // If one program fails, continue with the other
    }
  }

  // Group by mint, accumulate balances
  const mintToBalance: Record<string, { amount: number; decimals: number }> = {};

  for (const acct of allAccounts) {
    const info = acct.account?.data?.parsed?.info;
    if (!info) continue;
    const mint = info.mint;
    const decimals = info.tokenAmount.decimals;
    const uiAmount = info.tokenAmount.uiAmount ?? parseFloat(info.tokenAmount.uiAmountString) ?? 0;

    if (!mintToBalance[mint]) {
      mintToBalance[mint] = { amount: 0, decimals };
    }
    mintToBalance[mint].amount += uiAmount;
  }

  // Look up token metadata from Jupiter's token list
  let tokenMetaMap: Record<string, { symbol: string; name: string }> = {};
  try {
    const listResp = await fetch('https://token.jup.ag/strict', {
      headers: { 'User-Agent': 'finance-skill/0.1.0' },
    });
    if (listResp.ok) {
      type JupToken = { address: string; symbol: string; name: string };
      const list = (await listResp.json()) as JupToken[];
      for (const t of list) {
        tokenMetaMap[t.address] = { symbol: t.symbol, name: t.name };
      }
    }
  } catch {
    // Metadata unavailable — fall back to mint address as symbol
  }

  // Build TokenBalance array with prices
  const symbols = Object.keys(mintToBalance)
    .map((mint) => tokenMetaMap[mint]?.symbol?.toUpperCase())
    .filter(Boolean) as string[];

  const prices = await getUsdPrices(symbols);

  const balances: TokenBalance[] = [];
  for (const [mint, { amount, decimals }] of Object.entries(mintToBalance)) {
    if (amount === 0) continue;

    const meta = tokenMetaMap[mint];
    const symbol = meta?.symbol?.toUpperCase() ?? mint.slice(0, 8);
    const name = meta?.name ?? 'Unknown';
    const usdPrice = prices[symbol] ?? null;
    const usdValue = usdPrice !== null ? amount * usdPrice : null;

    // Dust filter
    if (usdValue !== null && usdValue < 1) continue;

    balances.push({
      symbol,
      name,
      contractAddress: mint,
      balance: amount,
      decimals,
      usdPrice,
      usdValue,
    });
  }

  return balances.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
}

// ── DeBank multi-chain EVM fetcher ───────────────────────────────────────
// Uses Rabby's public DeBank API — no key needed, returns all chains automatically

const DEBANK_API = 'https://api.rabby.io/v1/user/token_list';
const DEBANK_CHAIN_NAMES: Record<string, string> = {
  eth: 'Ethereum', bsc: 'BNB Chain', base: 'Base', arb: 'Arbitrum',
  op: 'Optimism', matic: 'Polygon', mnt: 'Mantle', avax: 'Avalanche',
  ftm: 'Fantom', celo: 'Celo', linea: 'Linea', zksync: 'zkSync',
  scroll: 'Scroll', blast: 'Blast', zora: 'Zora', mode: 'Mode',
  monad: 'Monad', solana: 'Solana',
};

interface DebankToken {
  id: string;
  chain: string;
  name: string;
  symbol: string;
  decimals: number;
  price: number;
  amount: number;
  usd_value?: number | null;
  is_verified: boolean;
  is_suspicious: boolean;
}

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const DEBANK_CACHE_DIR = join(homedir(), '.openclaw', 'cache', 'finance');
const DEBANK_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCachePath(address: string): string {
  return join(DEBANK_CACHE_DIR, `debank-${address.toLowerCase()}.json`);
}

function loadCache(address: string): { tokens: DebankToken[]; fetchedAt: number } | null {
  try {
    const raw = readFileSync(getCachePath(address), 'utf8');
    const parsed = JSON.parse(raw) as { tokens: DebankToken[]; fetchedAt: number };
    if (Date.now() - parsed.fetchedAt < DEBANK_CACHE_TTL_MS) return parsed;
  } catch { /* no cache or stale */ }
  return null;
}

function saveCache(address: string, tokens: DebankToken[]): void {
  try {
    mkdirSync(DEBANK_CACHE_DIR, { recursive: true });
    writeFileSync(getCachePath(address), JSON.stringify({ tokens, fetchedAt: Date.now() }));
  } catch { /* best-effort */ }
}

const DEBANK_UA_LIST = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

async function getDebankTokenList(address: string): Promise<DebankToken[]> {
  // Return cached data if fresh
  const cached = loadCache(address);
  if (cached) return cached.tokens;

  const url = `${DEBANK_API}?id=${address}&is_all=false&has_balance=true`;
  const ua = DEBANK_UA_LIST[Math.floor(Math.random() * DEBANK_UA_LIST.length)];

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 3000 * attempt)); // 3s, 6s
    try {
      const response = await fetch(url, {
        headers: {
          'accept': 'application/json',
          'User-Agent': ua,
          'Origin': 'https://rabby.io',
          'Referer': 'https://rabby.io/',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (response.status === 429) {
        if (attempt === 2) throw new Error('DeBank rate limited — try again in a few minutes (cached data used when available)');
        continue;
      }
      if (!response.ok) throw new Error(`DeBank HTTP ${response.status}`);
      const data = await response.json() as DebankToken[];
      if (!Array.isArray(data)) throw new Error('DeBank: unexpected response format');
      saveCache(address, data);
      return data;
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  throw new Error('DeBank: failed after retries');
}

export interface EvmChainSnapshot {
  chainId: string;
  chainName: string;
  address: string;
  nativeSymbol: string;
  nativeBalance: number;
  nativeUsd: number;
  tokens: TokenBalance[];
  totalUsd: number;
}

/**
 * Use DeBank API to get all EVM chain balances for an address in one call.
 * Groups tokens by chain, returns non-eth chains as EvmChainSnapshot[].
 * Returns { ethMainnet, extraChains } so caller can split them.
 */
async function getDebankEVMBalances(address: string): Promise<{
  ethMainnet: { eth: number; ethUsd: number; tokens: TokenBalance[] };
  extraChains: EvmChainSnapshot[];
}> {
  const tokens = await getDebankTokenList(address);

  // Group by chain
  const byChain = new Map<string, DebankToken[]>();
  for (const t of tokens) {
    if (!byChain.has(t.chain)) byChain.set(t.chain, []);
    byChain.get(t.chain)!.push(t);
  }

  // ETH mainnet
  const ethTokens = byChain.get('eth') ?? [];
  const ethNative = ethTokens.find((t) => t.id === 'eth');
  const calcUsd = (t: DebankToken) => t.price > 0 ? t.amount * t.price : (t.usd_value ?? 0);

  const ethMainnetTokens: TokenBalance[] = ethTokens
    .filter((t) => t.id !== 'eth' && calcUsd(t) >= 1 && !t.is_suspicious)
    .map((t) => ({
      symbol: t.symbol,
      name: t.name,
      contractAddress: t.id,
      balance: t.amount,
      decimals: t.decimals,
      usdPrice: t.price,
      usdValue: calcUsd(t),
    }))
    .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));

  const ethMainnet = {
    eth: ethNative?.amount ?? 0,
    ethUsd: calcUsd(ethNative ?? { price: 0, amount: 0, usd_value: 0 } as DebankToken),
    tokens: ethMainnetTokens,
  };

  // Extra chains (everything except 'eth' and 'solana' — SOL handled separately)
  const extraChains: EvmChainSnapshot[] = [];
  for (const [chainId, chainTokens] of byChain.entries()) {
    if (chainId === 'eth' || chainId === 'solana') continue;

    // Find native token (id === chain id, e.g. id='bsc' for BNB)
    const native = chainTokens.find((t) => t.id === chainId);
    const tokenList: TokenBalance[] = chainTokens
      .filter((t) => t.id !== chainId && calcUsd(t) >= 1 && !t.is_suspicious)
      .map((t) => ({
        symbol: t.symbol,
        name: t.name,
        contractAddress: t.id,
        balance: t.amount,
        decimals: t.decimals,
        usdPrice: t.price,
        usdValue: calcUsd(t),
      }))
      .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));

    const nativeUsd = native ? calcUsd(native) : 0;
    const tokenUsd = tokenList.reduce((s, t) => s + (t.usdValue ?? 0), 0);
    const total = nativeUsd + tokenUsd;
    if (total < 1) continue;

    extraChains.push({
      chainId,
      chainName: DEBANK_CHAIN_NAMES[chainId] ?? chainId.toUpperCase(),
      address,
      nativeSymbol: native?.symbol ?? chainId.toUpperCase(),
      nativeBalance: native?.amount ?? 0,
      nativeUsd,
      tokens: tokenList,
      totalUsd: total,
    });
  }

  // Sort extra chains by value descending
  extraChains.sort((a, b) => b.totalUsd - a.totalUsd);

  return { ethMainnet, extraChains };
}

// ── Aggregated on-chain snapshot ───────────────────────────────────────────

export interface EthWalletSnapshot {
  address: string;
  eth: number;
  ethUsd: number;
  tokens: TokenBalance[];
  totalUsd: number;
  extraChains: EvmChainSnapshot[];  // BSC, Optimism, Arbitrum, etc.
}

export interface OnchainSnapshot {
  ethereum: EthWalletSnapshot[];   // one entry per configured ETH address
  solana: {
    address: string;
    sol: number;
    solUsd: number;
    tokens: TokenBalance[];
    totalUsd: number;
  } | null;
  totalUsd: number;
  errors: string[];
}

/** Aggregate all on-chain balances for all configured addresses. */
export async function getAllOnchainBalances(): Promise<OnchainSnapshot> {
  const config = getOnchainConfig();
  const errors: string[] = [];
  let totalUsd = 0;

  // EVM — use DeBank for all chains in one call per address (serialized to avoid 429)
  const ethereum: EthWalletSnapshot[] = [];
  if (config.ethAddresses.length > 0) {
    const walletData: Array<{ status: 'fulfilled'; value: EthWalletSnapshot } | { status: 'rejected'; reason: Error }> = [];
    for (let i = 0; i < config.ethAddresses.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1200)); // rate-limit buffer
      const address = config.ethAddresses[i];
      try {
        const { ethMainnet, extraChains } = await getDebankEVMBalances(address);
        const tokenUsd = ethMainnet.tokens.reduce((sum, t) => sum + (t.usdValue ?? 0), 0);
        const extraUsd = extraChains.reduce((sum, c) => sum + c.totalUsd, 0);
        const walletTotal = ethMainnet.ethUsd + tokenUsd + extraUsd;
        walletData.push({ status: 'fulfilled', value: { address, eth: ethMainnet.eth, ethUsd: ethMainnet.ethUsd, tokens: ethMainnet.tokens, extraChains, totalUsd: walletTotal } });
      } catch (e) {
        walletData.push({ status: 'rejected', reason: e as Error });
      }
    }
    const results = walletData;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        ethereum.push(result.value);
        totalUsd += result.value.totalUsd;
      } else {
        errors.push(`ETH wallet: ${(result.reason as Error).message}`);
      }
    }
  }

  // Solana
  let solana: OnchainSnapshot['solana'] = null;
  if (config.solAddress) {
    try {
      const [solBal, tokens] = await Promise.all([
        getSolBalance(config.solAddress),
        getSolTokenBalances(config.solAddress),
      ]);
      const tokenUsd = tokens.reduce((sum, t) => sum + (t.usdValue ?? 0), 0);
      const total = solBal.usdValue + tokenUsd;
      totalUsd += total;
      solana = {
        address: config.solAddress,
        sol: solBal.sol,
        solUsd: solBal.usdValue,
        tokens,
        totalUsd: total,
      };
    } catch (err) {
      errors.push(`SOL: ${(err as Error).message}`);
    }
  }

  return { ethereum, solana, totalUsd, errors };
}
