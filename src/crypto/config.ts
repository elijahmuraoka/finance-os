/**
 * config.ts — Crypto credentials loader
 *
 * Priority: process.env > ~/.openclaw/secrets/crypto-keys.env > empty string
 * Never throws — missing keys surface as empty strings; callers check and
 * degrade gracefully rather than hard-crashing.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SECRETS_FILE = path.join(os.homedir(), '.openclaw', 'secrets', 'crypto-keys.env');

interface ParsedEnv {
  [key: string]: string;
}

function parseEnvFile(filePath: string): ParsedEnv {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const result: ParsedEnv = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key) result[key] = val;
    }
    return result;
  } catch {
    return {};
  }
}

// Load the env file once at module load time
const fileEnv: ParsedEnv = parseEnvFile(SECRETS_FILE);

function get(key: string): string {
  return process.env[key] ?? fileEnv[key] ?? '';
}

export interface KrakenConfig {
  apiKey: string;
  apiSecret: string;
  configured: boolean;
}

export interface GeminiConfig {
  apiKey: string;
  apiSecret: string;
  configured: boolean;
}

export interface OnchainConfig {
  ethAddresses: string[];   // all ETH addresses (main + alts)
  solAddress: string;
  etherscanApiKey: string;
}

export function getKrakenConfig(): KrakenConfig {
  const apiKey = get('KRAKEN_API_KEY');
  const apiSecret = get('KRAKEN_API_SECRET');
  return {
    apiKey,
    apiSecret,
    configured: Boolean(apiKey && apiSecret),
  };
}

export function getGeminiConfig(): GeminiConfig {
  const apiKey = get('GEMINI_API_KEY');
  const apiSecret = get('GEMINI_API_SECRET');
  return {
    apiKey,
    apiSecret,
    configured: Boolean(apiKey && apiSecret),
  };
}

export function getOnchainConfig(): OnchainConfig {
  // Collect all ETH addresses: RABBY_ETH_ADDRESS, RABBY_ETH_ADDRESS_MAIN, RABBY_ETH_ADDRESS_ALT1..9
  const ethAddresses: string[] = [];
  const candidates = [
    'RABBY_ETH_ADDRESS',
    'RABBY_ETH_ADDRESS_MAIN',
    ...Array.from({ length: 9 }, (_, i) => `RABBY_ETH_ADDRESS_ALT${i + 1}`),
  ];
  for (const key of candidates) {
    const val = get(key);
    if (val && !ethAddresses.includes(val)) ethAddresses.push(val);
  }

  return {
    ethAddresses,
    solAddress: get('RABBY_SOL_ADDRESS'),
    etherscanApiKey: get('ETHERSCAN_API_KEY'),
  };
}
