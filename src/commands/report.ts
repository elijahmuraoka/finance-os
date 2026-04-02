import { writeFileSync } from "node:fs";
import { getBudgetStatus } from "../primitives/budgets";
import { getHoldings } from "../primitives/holdings";
import { getCurrentNetworth } from "../primitives/networth";
import { getUnreviewed } from "../primitives/transactions";

export async function cmdReport(): Promise<void> {
  const currentNetworth = await getCurrentNetworth();
  const budgets = await getBudgetStatus();
  const holdings = await getHoldings();
  const unreviewed = await getUnreviewed();

  const titleDate = new Date().toISOString().split("T")[0];
  const totalNetworth = currentNetworth?.total ?? 0;

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  const budgetHtml = budgets
    .map((b) => {
      const pct = b.budgeted > 0 ? Math.min(100, Math.round((b.actual / b.budgeted) * 100)) : 0;
      const color = b.isOverBudget ? "bg-red-500" : "bg-green-500";
      return `
      <div class="mb-4">
        <div class="flex justify-between text-sm mb-1">
          <span class="font-medium text-gray-700">${b.categoryName}</span>
          <span class="text-gray-500">${formatter.format(b.actual)} / ${formatter.format(b.budgeted)}</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2.5">
          <div class="${color} h-2.5 rounded-full" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
    })
    .join("");

  const unreviewedHtml = unreviewed
    .slice(0, 10)
    .map(
      (t) => `
    <tr class="border-b">
      <td class="py-2 text-sm text-gray-800">${t.date}</td>
      <td class="py-2 text-sm text-gray-800">${t.name}</td>
      <td class="py-2 text-sm text-gray-800 text-right font-medium">${formatter.format(t.amount)}</td>
    </tr>
  `,
    )
    .join("");

  const unreviewedTable =
    unreviewed.length > 0
      ? `
                  <table class="w-full text-left">
                    <thead>
                      <tr class="text-xs text-gray-500 uppercase border-b">
                        <th class="pb-2">Date</th>
                        <th class="pb-2">Name</th>
                        <th class="pb-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>${unreviewedHtml}</tbody>
                  </table>
                `
      : '<p class="text-sm text-gray-500">All caught up!</p>';

  const holdingsHtml = holdings
    .slice(0, 10)
    .map(
      (h) => `
    <tr class="border-b">
      <td class="py-2 text-sm text-gray-800 font-medium">${h.symbol}</td>
      <td class="py-2 text-sm text-gray-500">${h.name}</td>
      <td class="py-2 text-sm text-gray-800 text-right">${formatter.format(h.value)}</td>
    </tr>
  `,
    )
    .join("");

  const holdingsTable =
    holdings.length > 0
      ? `
              <table class="w-full text-left">
                <thead>
                  <tr class="text-xs text-gray-500 uppercase border-b">
                    <th class="pb-2">Symbol</th>
                    <th class="pb-2">Name</th>
                    <th class="pb-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>${holdingsHtml}</tbody>
              </table>
            `
      : '<p class="text-sm text-gray-500">No holdings found.</p>';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Finance Report - ${titleDate}</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 p-8 font-sans">
    <div class="max-w-4xl mx-auto">
        <header class="mb-8">
            <h1 class="text-3xl font-bold text-gray-900">Finance Report</h1>
            <p class="text-gray-500">Generated on ${titleDate}</p>
        </header>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Net Worth</h2>
                <div class="text-4xl font-bold text-gray-900">${formatter.format(totalNetworth)}</div>
            </div>
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Unreviewed Transactions</h2>
                <div class="text-4xl font-bold text-gray-900">${unreviewed.length}</div>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 class="text-xl font-bold text-gray-900 mb-4">Budgets</h2>
                ${budgetHtml || '<p class="text-sm text-gray-500">No budget data available.</p>'}
            </div>

            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 class="text-xl font-bold text-gray-900 mb-4">Top Unreviewed (Up to 10)</h2>
                ${unreviewedTable}
            </div>
        </div>

        <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 class="text-xl font-bold text-gray-900 mb-4">Top Holdings</h2>
            ${holdingsTable}
        </div>
    </div>
</body>
</html>`;

  const filename = `finance-report-${titleDate}.html`;
  writeFileSync(filename, html, "utf-8");
  console.log(`Report generated successfully: ${filename}`);
}
