import { useState } from "react";
import type { LpStoreRow } from "../esi/lpStore.ts";

type SortKey = keyof Pick<
  LpStoreRow,
  "typeName" | "lpCost" | "dailyLpVolume" | "lpToIskBuy" | "lpToIskSell" | "immediateLiquidityLp"
>;

type SortDir = "asc" | "desc";

/**
 * Universal number formatter: values below 10,000 are shown rounded (no
 * decimals, no abbreviation); values at or above 10,000 are abbreviated
 * using k/m/b, with 1 decimal point of precision.
 */
function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return trimTrailingZeroDecimal((n / 1e9).toFixed(1)) + "b";
  if (abs >= 1e6) return trimTrailingZeroDecimal((n / 1e6).toFixed(1)) + "m";
  if (abs >= 1e4) return trimTrailingZeroDecimal((n / 1e3).toFixed(1)) + "k";
  return Math.round(n).toLocaleString("en-US");
}

/** Formats a number with 1 decimal of precision, dropping it entirely if it's all zeroes. */
function fmtDecimal(n: number): string {
  return trimTrailingZeroDecimal(n.toFixed(1));
}

/** Drops a trailing ".0" from a fixed-precision number string. */
function trimTrailingZeroDecimal(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
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
 * Interpolates a red -> green color for a value on a [min, max] scale.
 * Values at or below min are red; values at/above max are green.
 */
function ratioColor(value: number | null, min: number, max: number): string {
  if (value === null) return "#71717a"; // zinc-500, unknown

  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
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
      className="px-3 py-2 text-left text-xs font-semibold tracking-wide whitespace-nowrap uppercase transition-colors hover:bg-zinc-700"
      title={title}
      scope="col"
      aria-sort={col === sortKey ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-2 select-none"
        onClick={() => onSort(col)}
      >
        <span>{children}</span>
        <SortIcon active={col === sortKey} dir={sortDir} />
      </button>
    </th>
  );
}

function IskLpCell({ ratio, bestPrice }: { ratio: number | null; bestPrice: number | null }) {
  return (
    <td className="px-3 py-2 tabular-nums">
      <div className="font-semibold" style={{ color: ratioColor(ratio, 200, 1200) }}>
        {ratio !== null ? fmt(ratio) + " ISK/LP" : "—"}
      </div>
      <div className="text-xs text-zinc-500">{fmt(bestPrice)} ISK</div>
    </td>
  );
}

export function LpStoreTable({
  rows,
  fetchedAt,
  includeOtherItems,
  onIncludeOtherItemsChange,
  includeBlueprints,
  onIncludeBlueprintsChange,
}: {
  rows: LpStoreRow[];
  fetchedAt: Date | null;
  includeOtherItems: boolean;
  onIncludeOtherItemsChange: (checked: boolean) => void;
  includeBlueprints: boolean;
  onIncludeBlueprintsChange: (checked: boolean) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("lpToIskBuy");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = rows.filter((row) => {
    if (!includeOtherItems && row.requiredItems.length > 0) return false;
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
            checked={includeOtherItems}
            onChange={(e) => onIncludeOtherItemsChange(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800"
          />
          Include exchanges requiring other items
        </label>
        <label className="flex items-center gap-2 text-zinc-300">
          <input
            type="checkbox"
            checked={includeBlueprints}
            onChange={(e) => onIncludeBlueprintsChange(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800"
          />
          Include blueprints
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
                col="dailyLpVolume"
                title="Daily volume multiplied by LP cost — how much LP can be sold daily through this exchange. Followed by the raw average daily volume traded in Jita (last 30 days, 5% method) and, when more than 1 item is required per exchange, the normalized volume in parentheses — that volume divided by the exchange quantity, i.e. how many exchanges could be sold per day"
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
              const hasItemLists =
                row.requiredItems.length > 0 || row.blueprintMaterials.length > 0;
              const itemLabel = `${row.quantity > 1 ? `${fmt(row.quantity)} × ` : ""}${row.typeName}${row.producedFromBlueprint ? " (Blueprint)" : ""}`;
              return (
                <tr key={row.offerId} className={i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900"}>
                  <td className="px-3 py-2 font-medium">
                    {hasItemLists ? (
                      <details>
                        <summary className="cursor-pointer list-inside marker:text-zinc-500">
                          {itemLabel}
                        </summary>
                        {row.requiredItems.length > 0 && (
                          <ul className="mt-1 ml-4 text-xs font-normal text-zinc-400">
                            <li className="text-zinc-500 uppercase">Required items</li>
                            {[...row.requiredItems]
                              .sort((a, b) => a.typeName.localeCompare(b.typeName))
                              .map((ri) => (
                                <li key={ri.typeId}>
                                  {fmt(ri.quantity)} × {ri.typeName}
                                </li>
                              ))}
                          </ul>
                        )}
                        {row.blueprintMaterials.length > 0 && (
                          <ul className="mt-1 ml-4 text-xs font-normal text-zinc-400">
                            <li className="text-zinc-500 uppercase">Blueprint materials</li>
                            {[...row.blueprintMaterials]
                              .sort((a, b) => a.typeName.localeCompare(b.typeName))
                              .map((ri) => (
                                <li key={ri.typeId}>
                                  {fmt(ri.quantity)} × {ri.typeName}
                                </li>
                              ))}
                          </ul>
                        )}
                      </details>
                    ) : (
                      itemLabel
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-300">
                    <div>{fmt(row.lpCost)} LP</div>
                    {row.iskCost > 0 && (
                      <div className="text-zinc-500">+ {fmt(row.iskCost)} ISK</div>
                    )}
                    {otherIskCost > 0 && (
                      <div className="text-zinc-500">+ {fmt(otherIskCost)} ISK in items</div>
                    )}
                  </td>
                  <IskLpCell ratio={row.lpToIskSell} bestPrice={row.bestSell} />
                  <IskLpCell ratio={row.lpToIskBuy} bestPrice={row.bestBuy} />
                  <td className="px-3 py-2 text-zinc-300 tabular-nums">
                    <div
                      className="font-semibold"
                      style={{ color: ratioColor(row.dailyLpVolume, 100_000, 1_000_000) }}
                    >
                      {row.dailyLpVolume !== null ? fmt(row.dailyLpVolume) + " LP" : "—"}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {fmt(row.dailyVolume)}
                      {row.quantity > 1 && ` (${fmtDecimal(row.normalizedDailyVolume)})`}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {showLiquidity ? (
                      <>
                        <div
                          className="font-semibold"
                          style={{ color: ratioColor(row.lpToIskBuy, 200, 1200) }}
                        >
                          {fmt(row.immediateLiquidityLp)} LP
                        </div>
                        <div className="text-xs text-zinc-500">
                          {fmt(row.immediateLiquidityIsk)} ISK
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
