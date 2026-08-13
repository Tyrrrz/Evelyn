import { useState } from "react";
import type { LpStoreRow } from "../esi/lpStore.ts";

type SortKey = keyof Pick<
  LpStoreRow,
  | "typeName"
  | "lpCost"
  | "normalizedDailyVolume"
  | "lpToIskBuy"
  | "lpToIskSell"
  | "recommendationFactor"
>;

type SortDir = "asc" | "desc";

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function fmtIsk(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + " B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + " M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + " K";
  return n.toFixed(2);
}

function sortRows(rows: LpStoreRow[], key: SortKey, dir: SortDir): LpStoreRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key] as number | string | null;
    const bv = b[key] as number | string | null;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (typeof av === "string" && typeof bv === "string") {
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });
}

/**
 * Interpolates a red -> green color for a value on a [0, max] scale.
 * Values at or below 0 (or null) are dark red; values at/above max are green.
 */
function ratioColor(value: number | null, max: number): string {
  if (value === null) return "#71717a"; // zinc-500, unknown
  if (value <= 0) return "#7f1d1d"; // dark red (negative or zero)

  const t = Math.max(0, Math.min(1, value / max));
  const hue = t * 120; // 0 = red, 120 = green
  return `hsl(${hue}, 75%, 45%)`;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 opacity-30">↕</span>;
  return <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>;
}

function Th({
  col,
  children,
  title,
  sortKey,
  sortDir,
  onSort,
}: {
  col: SortKey;
  children: React.ReactNode;
  title?: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  return (
    <th
      className="cursor-pointer px-3 py-2 text-left text-xs font-semibold tracking-wide whitespace-nowrap uppercase transition-colors select-none hover:bg-zinc-700"
      onClick={() => onSort(col)}
      title={title}
    >
      {children}
      <SortIcon active={col === sortKey} dir={sortDir} />
    </th>
  );
}

function IskLpCell({
  ratio,
  bestPrice,
  priceLabel,
}: {
  ratio: number | null;
  bestPrice: number | null;
  priceLabel: string;
}) {
  return (
    <td className="px-3 py-2 tabular-nums">
      <div className="font-semibold" style={{ color: ratioColor(ratio, 1000) }}>
        {ratio !== null ? fmtIsk(ratio) + " ISK/LP" : "—"}
      </div>
      <div className="text-xs text-zinc-500">
        {priceLabel}: {fmtIsk(bestPrice)}
      </div>
    </td>
  );
}

export function LpStoreTable({ rows }: { rows: LpStoreRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("recommendationFactor");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = sortRows(rows, sortKey, sortDir);
  const thProps = { sortKey, sortDir, onSort: handleSort };

  return (
    <>
      <div className="mb-2 text-xs text-zinc-500">
        {sorted.length} offers · prices from Jita (The Forge), 5% method ·{" "}
        <span className="text-zinc-400">Sell = lowest sell orders</span>,{" "}
        <span className="text-zinc-400">Buy = highest buy orders</span>
      </div>
      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-800 text-zinc-300">
            <tr>
              <Th
                col="typeName"
                title="Item received in exchange (prefixed with quantity, if more than 1). Expand to see required items."
                {...thProps}
              >
                Item
              </Th>
              <Th
                col="lpCost"
                title="Total cost per exchange: LP required, plus any ISK cost paid directly to the corporation, plus the market value of any required items"
                {...thProps}
              >
                Cost
              </Th>
              <Th
                col="lpToIskSell"
                title="(Sell revenue – total ISK costs) / LP cost — how much ISK each LP is worth if you sell the item"
                {...thProps}
              >
                ISK/LP (Sell)
              </Th>
              <Th
                col="lpToIskBuy"
                title="(Buy revenue – total ISK costs) / LP cost — how much ISK each LP is worth if you sell instantly into buy orders"
                {...thProps}
              >
                ISK/LP (Buy)
              </Th>
              <Th
                col="normalizedDailyVolume"
                title="Average daily volume traded in Jita (last 30 days, 5% method). For exchanges giving more than 1 item, the number in parentheses is that volume divided by the exchange quantity — i.e. how many full exchanges could be sold per day"
                {...thProps}
              >
                Daily Volume
              </Th>
              <Th
                col="recommendationFactor"
                title="Overall recommendation score (0–100) combining ISK/LP profitability with market liquidity, assuming a typical player spends around 1M LP on this exchange"
                {...thProps}
              >
                Recommendation
              </Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const otherIskCost = row.totalRequiredIskCost - row.iskCost;
              return (
                <tr key={row.offerId} className={i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900"}>
                  <td className="px-3 py-2 font-medium">
                    {row.requiredItems.length > 0 ? (
                      <details>
                        <summary className="cursor-pointer list-inside marker:text-zinc-500">
                          {row.quantity > 1 ? `${fmt(row.quantity)}× ` : ""}
                          {row.typeName}
                        </summary>
                        <ul className="mt-1 ml-4 text-xs font-normal text-zinc-400">
                          {row.requiredItems.map((ri) => (
                            <li key={ri.typeId}>
                              {fmt(ri.quantity)} × {ri.typeName}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <>
                        {row.quantity > 1 ? `${fmt(row.quantity)}× ` : ""}
                        {row.typeName}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-300">
                    <div>{fmt(row.lpCost)} LP</div>
                    {row.iskCost > 0 && (
                      <div className="text-zinc-500">+ {fmtIsk(row.iskCost)} ISK</div>
                    )}
                    {otherIskCost > 0 && (
                      <div className="text-zinc-500">+ {fmtIsk(otherIskCost)} ISK (items)</div>
                    )}
                  </td>
                  <IskLpCell ratio={row.lpToIskSell} bestPrice={row.bestSell} priceLabel="Sell" />
                  <IskLpCell ratio={row.lpToIskBuy} bestPrice={row.bestBuy} priceLabel="Buy" />
                  <td className="px-3 py-2 text-zinc-300 tabular-nums">
                    {fmt(Math.round(row.dailyVolume))}
                    {row.quantity > 1 && (
                      <span className="text-zinc-500">
                        {" "}
                        ({fmt(row.normalizedDailyVolume, 2)}/exchange)
                      </span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2 font-semibold tabular-nums"
                    style={{ color: ratioColor(row.recommendationFactor, 100) }}
                  >
                    {fmt(row.recommendationFactor, 1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
