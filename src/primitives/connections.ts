/**
 * connections.ts — Refresh all financial connections
 */
import { getClient } from '../client';
import { REFRESH_ALL_CONNECTIONS_QUERY } from '../queries';

export interface ConnectionStatus {
  status: string;
  itemId: string;
  institutionName: string | null;
  institutionId: string | null;
}

interface RefreshData {
  refreshAllConnections: Array<{
    status: string;
    itemId: string;
    institution: {
      name: string;
      id: string;
    } | null;
  }>;
}

export async function refreshAllConnections(): Promise<ConnectionStatus[]> {
  try {
    const data = await getClient().graphql<RefreshData>(
      'RefreshAllConnections',
      REFRESH_ALL_CONNECTIONS_QUERY,
      {}
    );

    return (data?.refreshAllConnections ?? []).map((c) => ({
      status: c.status ?? '',
      itemId: c.itemId ?? '',
      institutionName: c.institution?.name ?? null,
      institutionId: c.institution?.id ?? null,
    }));
  } catch (err) {
    console.warn(`[connections] Warning: ${(err as Error).message}`);
    return [];
  }
}

export function formatRefreshResult(connections: ConnectionStatus[]): string {
  if (connections.length === 0) return 'No connections refreshed.';

  const lines: string[] = [`Refreshed ${connections.length} connection(s):`, ''];
  for (const c of connections) {
    const name = c.institutionName ?? c.itemId;
    lines.push(`  ${name}: ${c.status}`);
  }
  return lines.join('\n');
}
