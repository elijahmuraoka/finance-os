/**
 * commands/investments.ts — holdings, performance, allocation
 */

import type { TimeFrame as HoldingsTimeFrame } from "../primitives/holdings";
import {
  formatAggregatedHoldingsTable,
  formatHoldingsTable,
  getAggregatedHoldings,
  getHoldings,
} from "../primitives/holdings";
import type { TimeFrame as InvestmentsTimeFrame } from "../primitives/investments";
import {
  formatAllocationTable,
  formatPerformanceTable,
  getInvestmentAllocation,
  getInvestmentPerformance,
} from "../primitives/investments";
import { outputJson, outputText, parseTimeFrame } from "../utils";

export async function cmdHoldings(
  _positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const aggregated = !!flags.aggregated;
  const timeFrame = parseTimeFrame(flags.timeframe);

  if (aggregated) {
    const holdings = await getAggregatedHoldings(timeFrame as HoldingsTimeFrame | undefined);
    if (flags.json) {
      outputJson(holdings);
    } else {
      outputText(formatAggregatedHoldingsTable(holdings));
    }
  } else {
    const holdings = await getHoldings();
    if (flags.json) {
      outputJson(holdings);
    } else {
      outputText(formatHoldingsTable(holdings));
    }
  }
}

export async function cmdPerformance(
  _positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const timeFrame = parseTimeFrame(flags.timeframe);
  const data = await getInvestmentPerformance(timeFrame as InvestmentsTimeFrame | undefined);
  if (flags.json) {
    outputJson(data);
  } else {
    outputText(formatPerformanceTable(data));
  }
}

export async function cmdAllocation(
  _positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const data = await getInvestmentAllocation();
  if (flags.json) {
    outputJson(data);
  } else {
    outputText(formatAllocationTable(data));
  }
}
