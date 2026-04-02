/**
 * export.ts — Transaction export read primitive
 */
import { getClient } from '../client';
import { EXPORT_TRANSACTIONS_QUERY } from '../queries';

export interface ExportResult {
  url: string;
  expiresAt: string;
}

interface ExportTransactionsData {
  exportTransactions: {
    url: string;
    expiresAt: string;
  };
}

export interface ExportFilter {
  startDate?: string;
  endDate?: string;
}

function getMonthRange(month: string): { startDate: string; endDate: string } {
  const [year, mon] = month.split('-').map(Number);
  const startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

export async function exportTransactions(
  filter?: ExportFilter
): Promise<ExportResult | null> {
  try {
    const variables: Record<string, unknown> = {};
    if (filter) {
      const txFilter: Record<string, unknown> = {};
      if (filter.startDate) txFilter['startDate'] = filter.startDate;
      if (filter.endDate) txFilter['endDate'] = filter.endDate;
      if (Object.keys(txFilter).length > 0) {
        variables['filter'] = txFilter;
      }
    }

    const data = await getClient().graphql<ExportTransactionsData>(
      'ExportTransactions',
      EXPORT_TRANSACTIONS_QUERY,
      variables
    );

    const result = data?.exportTransactions;
    if (!result?.url) return null;

    return {
      url: result.url,
      expiresAt: result.expiresAt ?? '',
    };
  } catch (err) {
    console.warn(`[export] Warning: ${(err as Error).message}`);
    return null;
  }
}

export async function exportTransactionsByMonth(
  month: string
): Promise<ExportResult | null> {
  const range = getMonthRange(month);
  return exportTransactions(range);
}
