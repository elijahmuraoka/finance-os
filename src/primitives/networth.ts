/**
 * networth.ts — Net worth read primitives
 */
import { getClient } from '../client';
import { NETWORTH_QUERY } from '../queries';

export interface NetworthEntry {
  date: string;
  assets: number;
  debt: number;
  net: number;
}

interface RawNetworthFields {
  assets: number;
  debt: number;
  date: string;
  __typename: string;
}

interface NetworthData {
  networthHistory: RawNetworthFields[];
}

// Valid timeframe values for the Copilot API
export type TimeFrame = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | 'ALL_TIME';

export async function getNetworthHistory(
  timeframe?: TimeFrame
): Promise<NetworthEntry[]> {
  try {
    const variables: Record<string, unknown> = {};
    if (timeframe) {
      variables['timeFrame'] = timeframe;
    }

    const data = await getClient().graphql<NetworthData>(
      'Networth',
      NETWORTH_QUERY,
      variables
    );

    const history = data?.networthHistory ?? [];
    return history
      .map((entry) => ({
        date: entry.date,
        assets: entry.assets ?? 0,
        debt: entry.debt ?? 0,
        net: (entry.assets ?? 0) - (entry.debt ?? 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    console.warn(`[networth] Warning: ${(err as Error).message}`);
    return [];
  }
}

export async function getCurrentNetworth(): Promise<NetworthEntry | null> {
  const history = await getNetworthHistory();
  if (history.length === 0) return null;
  // Return the most recent entry
  return history[history.length - 1] ?? null;
}

export function formatNetworthTable(history: NetworthEntry[]): string {
  if (history.length === 0) return 'No net worth data found.';

  const lines: string[] = [`Net Worth History (${history.length} entries):`, ''];

  // Show last 12 entries for readability
  const entries = history.slice(-12);
  for (const e of entries) {
    const net = e.net >= 0 ? `+$${e.net.toFixed(2)}` : `-$${Math.abs(e.net).toFixed(2)}`;
    lines.push(
      `  ${e.date}  Assets: $${e.assets.toFixed(2)}  Debt: $${e.debt.toFixed(2)}  Net: ${net}`
    );
  }

  const latest = history[history.length - 1];
  if (latest && history.length > 12) {
    lines.push('');
    lines.push(`  Latest: ${latest.date}  Net: $${latest.net.toFixed(2)}`);
  }

  return lines.join('\n');
}

export function formatCurrentNetworth(entry: NetworthEntry | null): string {
  if (!entry) return 'No net worth data available.';

  const lines: string[] = [`Net Worth (${entry.date}):`, ''];
  lines.push(`  Assets: $${entry.assets.toFixed(2)}`);
  lines.push(`  Debt:   $${entry.debt.toFixed(2)}`);
  const net = entry.net >= 0 ? `+$${entry.net.toFixed(2)}` : `-$${Math.abs(entry.net).toFixed(2)}`;
  lines.push(`  Net:    ${net}`);
  return lines.join('\n');
}
