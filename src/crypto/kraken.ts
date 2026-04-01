/**
 * kraken.ts — Kraken exchange client
 *
 * Auth: HMAC-SHA512 signed POST requests.
 * Signing algorithm:
 *   API-Sign = base64( HMAC-SHA512( path + SHA256(nonce + urlencode(body)), base64decode(secret) ) )
 *
 * Endpoints:
 *   POST https://api.kraken.com/0/private/Balance
 *   POST https://api.kraken.com/0/private/BalanceEx
 *   POST https://api.kraken.com/0/private/Ledgers
 */

import * as crypto from 'crypto';
import { getKrakenConfig } from './config';

const BASE_URL = 'https://api.kraken.com';

// Kraken uses non-standard asset names — map to readable symbols
export const KRAKEN_ASSET_MAP: Record<string, string> = {
  XXBT: 'BTC',
  XETH: 'ETH',
  ZUSD: 'USD',
  XLTC: 'LTC',
  XXRP: 'XRP',
  XXLM: 'XLM',
  XZEC: 'ZEC',
  XMLN: 'MLN',
  XREP: 'REP',
  XXDG: 'DOGE',
  XXMR: 'XMR',
  ZCAD: 'CAD',
  ZEUR: 'EUR',
  ZGBP: 'GBP',
  ZJPY: 'JPY',
  SOL: 'SOL',
  DOT: 'DOT',
  ADA: 'ADA',
  LINK: 'LINK',
  MATIC: 'MATIC',
  POL: 'POL',
  AVAX: 'AVAX',
  ATOM: 'ATOM',
  UNI: 'UNI',
  AAVE: 'AAVE',
  COMP: 'COMP',
  MKR: 'MKR',
  SNX: 'SNX',
  GRT: 'GRT',
  ALGO: 'ALGO',
  FIL: 'FIL',
  NEAR: 'NEAR',
  SAND: 'SAND',
  MANA: 'MANA',
  ENJ: 'ENJ',
  CHZ: 'CHZ',
  BAT: 'BAT',
  USDT: 'USDT',
  USDC: 'USDC',
  DAI: 'DAI',
  BUSD: 'BUSD',
  // Staking variants (strip suffix to get base asset)
};

/** Strip Kraken staking suffixes (.S, .M, .B, .F, .T) and map to readable symbol */
function normalizeKrakenAsset(raw: string): string {
  // Strip staking/earn suffixes
  const stripped = raw.replace(/\.(S|M|B|F|T)$/, '');
  return KRAKEN_ASSET_MAP[stripped] ?? stripped;
}

export interface KrakenBalance {
  asset: string;       // normalized symbol (BTC, ETH, etc.)
  rawAsset: string;    // original Kraken asset name (XXBT, XETH, etc.)
  balance: number;
  usdValue: number | null;
}

export interface KrakenExtendedBalance {
  asset: string;
  rawAsset: string;
  balance: number;
  holdTrade: number;
  credit: number;
  creditUsed: number;
  availableBalance: number; // balance + credit - creditUsed - holdTrade
  usdValue: number | null;
}

export interface KrakenLedgerEntry {
  id: string;
  refid: string;
  time: number;
  type: string;
  subtype: string;
  aclass: string;
  asset: string;
  amount: number;
  fee: number;
  balance: number;
}

export class KrakenError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'KrakenError';
  }
}

function sign(urlPath: string, nonce: string, postData: string, secret: string): string {
  // SHA256(nonce + postData)
  const sha256 = crypto.createHash('sha256');
  sha256.update(nonce + postData);
  const sha256Digest = sha256.digest();

  // HMAC-SHA512(path + sha256Digest, base64decode(secret))
  const secretBuf = Buffer.from(secret, 'base64');
  const message = Buffer.concat([Buffer.from(urlPath), sha256Digest]);
  const mac = crypto.createHmac('sha512', secretBuf);
  mac.update(message);
  return mac.digest('base64');
}

function urlEncode(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export class KrakenClient {
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private async post<T = unknown>(urlPath: string, params: Record<string, string> = {}): Promise<T> {
    const nonce = String(Date.now() * 1000);
    const postParams = { nonce, ...params };
    const postData = urlEncode(postParams);
    const signature = sign(urlPath, nonce, postData, this.apiSecret);

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${urlPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'API-Key': this.apiKey,
          'API-Sign': signature,
          'User-Agent': 'finance-skill/0.1.0',
        },
        body: postData,
      });
    } catch (err) {
      throw new KrakenError(`Network error: ${(err as Error).message}`);
    }

    if (!response.ok) {
      throw new KrakenError(`HTTP ${response.status} ${response.statusText}`);
    }

    let json: { result?: T; error?: string[] };
    try {
      json = (await response.json()) as typeof json;
    } catch {
      throw new KrakenError('Failed to parse JSON response');
    }

    if (json.error && json.error.length > 0) {
      const msg = json.error.join('; ');
      throw new KrakenError(`Kraken API error: ${msg}`, json.error[0]);
    }

    if (json.result === undefined) {
      throw new KrakenError('No result field in Kraken response');
    }

    return json.result;
  }

  /** Get all account balances (balance amounts by asset). */
  async getBalances(): Promise<KrakenBalance[]> {
    // Result shape: { XXBT: "0.5", XETH: "1.2", ... }
    const result = await this.post<Record<string, string>>('/0/private/Balance');
    return Object.entries(result)
      .map(([rawAsset, balanceStr]) => ({
        asset: normalizeKrakenAsset(rawAsset),
        rawAsset,
        balance: parseFloat(balanceStr) || 0,
        usdValue: null, // enriched by aggregator
      }))
      .filter((b) => b.balance > 0); // skip zero balances
  }

  /**
   * Get extended balances including hold_trade amounts.
   * Available balance = balance + credit - creditUsed - holdTrade
   */
  async getExtendedBalances(): Promise<KrakenExtendedBalance[]> {
    // Result shape: { XXBT: { balance: "0.5", hold_trade: "0.1", credit: "0", credit_used: "0" } }
    const result = await this.post<Record<string, {
      balance: string;
      hold_trade: string;
      credit: string;
      credit_used: string;
    }>>('/0/private/BalanceEx');

    return Object.entries(result)
      .map(([rawAsset, data]) => {
        const balance = parseFloat(data.balance) || 0;
        const holdTrade = parseFloat(data.hold_trade) || 0;
        const credit = parseFloat(data.credit) || 0;
        const creditUsed = parseFloat(data.credit_used) || 0;
        return {
          asset: normalizeKrakenAsset(rawAsset),
          rawAsset,
          balance,
          holdTrade,
          credit,
          creditUsed,
          availableBalance: balance + credit - creditUsed - holdTrade,
          usdValue: null,
        };
      })
      .filter((b) => b.balance > 0);
  }

  /**
   * Get ledger entries (transaction history).
   */
  async getLedger(opts: { asset?: string; start?: number; end?: number } = {}): Promise<KrakenLedgerEntry[]> {
    const params: Record<string, string> = {};
    if (opts.asset) params['asset'] = opts.asset;
    if (opts.start !== undefined) params['start'] = String(opts.start);
    if (opts.end !== undefined) params['end'] = String(opts.end);

    const result = await this.post<{
      ledger: Record<string, {
        refid: string;
        time: number;
        type: string;
        subtype: string;
        aclass: string;
        asset: string;
        amount: string;
        fee: string;
        balance: string;
      }>;
      count: number;
    }>('/0/private/Ledgers', params);

    return Object.entries(result.ledger ?? {}).map(([id, entry]) => ({
      id,
      refid: entry.refid,
      time: entry.time,
      type: entry.type,
      subtype: entry.subtype,
      aclass: entry.aclass,
      asset: entry.asset,
      amount: parseFloat(entry.amount) || 0,
      fee: parseFloat(entry.fee) || 0,
      balance: parseFloat(entry.balance) || 0,
    }));
  }
}

/** Create a KrakenClient from config/env. Returns null if keys not configured. */
export function createKrakenClient(): KrakenClient | null {
  const { apiKey, apiSecret, configured } = getKrakenConfig();
  if (!configured) return null;
  return new KrakenClient(apiKey, apiSecret);
}
