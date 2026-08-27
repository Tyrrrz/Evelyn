import { useState } from "react";
import type { AppraisalRow } from "../esi/itemAppraisal.ts";
import { fmt } from "../utils/fmt.ts";

type SortKey = keyof Pick<AppraisalRow, "typeName" | "quantity" | "sellTotal" | "buyTotal">;

type SortDir = "asc" | "desc";

function sortRows(rows: AppraisalRow[], key: SortKey, dir: SortDir): AppraisalRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (typeof av === "string" && typeof bv === "string") {
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });
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

/**
 * Interpolates a yellow -> green color for a value on a [min, max] scale.
 * Values at or below min are yellow; values at/above max are green.
 */
function ratioColor(value: number | null, min: number, max: number): string {
  if (value === null) return "#71717a"; // zinc-500, unknown

  const t = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 1;
  const hue = 60 + t * 60; // 60 = yellow, 120 = green
  return `hsl(${hue}, 75%, 45%)`;
}

/** Computes the [min, max] range of a column's non-null values, for use with {@link ratioColor}. */
function columnRange(rows: AppraisalRow[], key: SortKey): { min: number; max: number } {
  const values = rows.map((r) => r[key]).filter((v): v is number => typeof v === "number");
  if (!values.length) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function formatIsk(value: number | null): string {
  return value === null ? "—" : `${fmt(value)} ISK`;
}

function summarizeTotals(
  rows: AppraisalRow[],
  key: "buyTotal" | "sellTotal",
): { value: number; hasUnknown: boolean; allUnknown: boolean } {
  let value = 0;
  let hasUnknown = false;
  let hasKnown = false;

  for (const row of rows) {
    const total = row[key];
    if (total === null) {
      hasUnknown = true;
      continue;
    }

    value += total;
    hasKnown = true;
  }

  return { value, hasUnknown, allUnknown: hasUnknown && !hasKnown };
}

/** Merged cell showing the total value (colored) and, if quantity isn't 1, the per-item price below. */
function ValueCell({
  total,
  price,
  quantity,
  range,
}: {
  total: number | null;
  price: number | null;
  quantity: number;
  range: { min: number; max: number };
}) {
  return (
    <td className="px-3 py-2 tabular-nums">
      <div className="font-semibold" style={{ color: ratioColor(total, range.min, range.max) }}>
        {formatIsk(total)}
      </div>
      {quantity !== 1 && <div className="text-xs text-zinc-500">{formatIsk(price)} per item</div>}
    </td>
  );
}

export default function ItemAppraisalTable({ rows }: { rows: AppraisalRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("sellTotal");
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

  const totalQuantity = rows.reduce((s, r) => s + r.quantity, 0);
  const totalBuy = summarizeTotals(rows, "buyTotal");
  const totalSell = summarizeTotals(rows, "sellTotal");

  const sellTotalRange = columnRange(rows, "sellTotal");
  const buyTotalRange = columnRange(rows, "buyTotal");

  return (
    <div className="overflow-x-auto rounded border border-zinc-800">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-800 text-zinc-300">
          <tr>
            <Th col="typeName" {...thProps}>
              Item
            </Th>
            <Th col="quantity" {...thProps}>
              Quantity
            </Th>
            <Th col="sellTotal" title="Best sell order price × quantity" {...thProps}>
              Sell
            </Th>
            <Th col="buyTotal" title="Best buy order price × quantity" {...thProps}>
              Buy
            </Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.typeId} className={i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900"}>
              <td className="px-3 py-2 font-medium">{row.typeName}</td>
              <td className="px-3 py-2 tabular-nums">{fmt(row.quantity)}</td>
              <ValueCell
                total={row.sellTotal}
                price={row.sellPrice}
                quantity={row.quantity}
                range={sellTotalRange}
              />
              <ValueCell
                total={row.buyTotal}
                price={row.buyPrice}
                quantity={row.quantity}
                range={buyTotalRange}
              />
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-zinc-800 font-semibold text-zinc-100">
          <tr>
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 tabular-nums">{fmt(totalQuantity)}</td>
            <td
              className="px-3 py-2 tabular-nums"
              title={
                totalSell.hasUnknown
                  ? "At least one item has no sell orders in this region, so the true sell total may be higher than shown"
                  : undefined
              }
            >
              <div className="flex items-center gap-1">
                <span>
                  {totalSell.allUnknown
                    ? "—"
                    : `${fmt(totalSell.value)}${totalSell.hasUnknown ? "+" : ""} ISK`}
                </span>
                {totalSell.hasUnknown && (
                  <span className="text-amber-400" aria-label="Sell total is incomplete">
                    ⚠
                  </span>
                )}
              </div>
            </td>
            <td
              className="px-3 py-2 tabular-nums"
              title={
                totalBuy.hasUnknown
                  ? "At least one item has no buy orders in this region, so the true buy total may be higher than shown"
                  : undefined
              }
            >
              <div className="flex items-center gap-1">
                <span>
                  {totalBuy.allUnknown
                    ? "—"
                    : `${fmt(totalBuy.value)}${totalBuy.hasUnknown ? "+" : ""} ISK`}
                </span>
                {totalBuy.hasUnknown && (
                  <span className="text-amber-400" aria-label="Buy total is incomplete">
                    ⚠
                  </span>
                )}
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
