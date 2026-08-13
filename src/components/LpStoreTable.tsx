import { useState } from "react";
import type { LpStoreRow } from "../esi/lpStore.ts";

type SortKey = keyof Pick<
  LpStoreRow,
  | "typeName"
  | "lpCost"
  | "normalizedVolumePer1000Lp"
  | "lpToIskBuy"
  | "lpToIskSell"
  | "immediateLiquidityLp"
>;

type SortDir = "asc" | "desc";

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function fmtIsk(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(0) + " B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(0) + " M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + " K";
  return n.toFixed(0);
}

/** Formats an ISK/LP ratio without K/M/B abbreviation — LP values never get large enough to warrant it. */
function fmtIskPerLp(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function sortRows(rows: LpStoreRow[], key: SortKey, dir: SortDir): LpStoreRow[] {
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (typeof av === "string" && typeof bv === "string") {
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });
}

/** Returns the value to sort by for a given row/key, treating empty (dash-displayed) liquidity as 0. */
function sortValue(row: LpStoreRow, key: SortKey): number | string | null {
  if (key === "immediateLiquidityLp") {
    return row.lpCost > 0 && row.immediateLiquidityIsk > 0 ? row.immediateLiquidityLp : 0;
  }
  return row[key] as number | string | null;
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

function IskLpCell({ ratio, bestPrice }: { ratio: number | null; bestPrice: number | null }) {
  return (
    <td className="px-3 py-2 tabular-nums">
      <div className="font-semibold" style={{ color: ratioColor(ratio, 1000) }}>
        {ratio !== null ? fmtIskPerLp(ratio) + " ISK/LP" : "—"}
      </div>
      <div className="text-xs text-zinc-500">{fmtIsk(bestPrice)} ISK</div>
    </td>
  );
}

export function LpStoreTable({ rows, fetchedAt }: { rows: LpStoreRow[]; fetchedAt: Date | null }) {
  const [sortKey, setSortKey] = useState<SortKey>("lpToIskBuy");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [excludeRequiredItems, setExcludeRequiredItems] = useState(false);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = rows.filter((row) => {
    if (excludeRequiredItems && row.requiredItems.length > 0) return false;
    return true;
  });

  const sorted = sortRows(filtered, sortKey, sortDir);
  const thProps = { sortKey, sortDir, onSort: handleSort };

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
        <span>{sorted.length} offers</span>
        {fetchedAt && <span>Data fetched at {fetchedAt.toLocaleString()}</span>}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2 text-zinc-300">
          <input
            type="checkbox"
            checked={excludeRequiredItems}
            onChange={(e) => setExcludeRequiredItems(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800"
          />
          Exclude exchanges requiring other items
        </label>
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
                Sell
              </Th>
              <Th
                col="lpToIskBuy"
                title="(Buy revenue – total ISK costs) / LP cost — how much ISK each LP is worth if you sell instantly into buy orders"
                {...thProps}
              >
                Buy
              </Th>
              <Th
                col="normalizedVolumePer1000Lp"
                title="Volume normalized per 1000 LP — the daily volume (normalized by exchange quantity) per 1000 LP spent, indicating how liquid the offer is relative to how much LP it takes to unlock it. Followed by the raw average daily volume traded in Jita (last 30 days, 5% method) and, in parentheses, the normalized volume — that volume divided by the exchange quantity, i.e. how many full exchanges could be sold per day (rounded down)"
                {...thProps}
              >
                Daily Volume
              </Th>
              <Th
                col="immediateLiquidityLp"
                title="How much LP (and the resulting net ISK) can be liquidated right now by selling into the existing buy orders within 5% of the best buy price, filling only whole exchanges. Empty when the exchange doesn't cost LP or the net ISK would be zero or negative"
                {...thProps}
              >
                Immediate Liquidity
              </Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const otherIskCost = row.totalRequiredIskCost - row.iskCost;
              const showLiquidity = row.lpCost > 0 && row.immediateLiquidityIsk > 0;
              return (
                <tr key={row.offerId} className={i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900"}>
                  <td className="px-3 py-2 font-medium">
                    {row.requiredItems.length > 0 ? (
                      <details>
                        <summary className="cursor-pointer list-inside marker:text-zinc-500">
                          {row.quantity > 1 ? `${fmt(row.quantity)} × ` : ""}
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
                        {row.quantity > 1 ? `${fmt(row.quantity)} × ` : ""}
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
                      <div className="text-zinc-500">+ {fmtIsk(otherIskCost)} ISK in items</div>
                    )}
                  </td>
                  <IskLpCell ratio={row.lpToIskSell} bestPrice={row.bestSell} />
                  <IskLpCell ratio={row.lpToIskBuy} bestPrice={row.bestBuy} />
                  <td className="px-3 py-2 text-zinc-300 tabular-nums">
                    <div
                      className="font-semibold"
                      style={{ color: ratioColor(row.normalizedVolumePer1000Lp, 20) }}
                    >
                      {row.normalizedVolumePer1000Lp !== null
                        ? fmt(row.normalizedVolumePer1000Lp, 2) + " / 1K LP"
                        : "—"}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {fmt(Math.round(row.dailyVolume))} (
                      {fmt(Math.floor(row.normalizedDailyVolume))})
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {showLiquidity ? (
                      <>
                        <div
                          className="font-semibold"
                          style={{ color: ratioColor(row.lpToIskBuy, 1000) }}
                        >
                          {fmt(row.immediateLiquidityLp)} LP
                        </div>
                        <div className="text-xs text-zinc-500">
                          {fmtIsk(row.immediateLiquidityIsk)} ISK
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
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
