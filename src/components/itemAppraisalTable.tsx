import { useState } from "react";
import type { AppraisalRow } from "../esi/itemAppraisal.ts";
import { fmt } from "../utils/fmt.ts";

type SortKey = keyof Pick<
  AppraisalRow,
  "typeName" | "quantity" | "buyPrice" | "sellPrice" | "buyTotal" | "sellTotal"
>;

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

  const totalBuy = rows.reduce((s, r) => s + (r.buyTotal ?? 0), 0);
  const totalSell = rows.reduce((s, r) => s + (r.sellTotal ?? 0), 0);

  const buyPriceRange = columnRange(rows, "buyPrice");
  const sellPriceRange = columnRange(rows, "sellPrice");
  const buyTotalRange = columnRange(rows, "buyTotal");
  const sellTotalRange = columnRange(rows, "sellTotal");

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
            <Th col="buyPrice" title="Best buy order price per unit" {...thProps}>
              Buy Price
            </Th>
            <Th col="sellPrice" title="Best sell order price per unit" {...thProps}>
              Sell Price
            </Th>
            <Th col="buyTotal" title="Buy price × quantity" {...thProps}>
              Buy Total
            </Th>
            <Th col="sellTotal" title="Sell price × quantity" {...thProps}>
              Sell Total
            </Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.typeId} className={i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900"}>
              <td className="px-3 py-2 font-medium">{row.typeName}</td>
              <td className="px-3 py-2 tabular-nums">{fmt(row.quantity)}</td>
              <td
                className="px-3 py-2 font-semibold tabular-nums"
                style={{ color: ratioColor(row.buyPrice, buyPriceRange.min, buyPriceRange.max) }}
              >
                {fmt(row.buyPrice)}
              </td>
              <td
                className="px-3 py-2 font-semibold tabular-nums"
                style={{
                  color: ratioColor(row.sellPrice, sellPriceRange.min, sellPriceRange.max),
                }}
              >
                {fmt(row.sellPrice)}
              </td>
              <td
                className="px-3 py-2 font-semibold tabular-nums"
                style={{ color: ratioColor(row.buyTotal, buyTotalRange.min, buyTotalRange.max) }}
              >
                {fmt(row.buyTotal)}
              </td>
              <td
                className="px-3 py-2 font-semibold tabular-nums"
                style={{
                  color: ratioColor(row.sellTotal, sellTotalRange.min, sellTotalRange.max),
                }}
              >
                {fmt(row.sellTotal)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-zinc-800 font-semibold text-zinc-100">
          <tr>
            <td className="px-3 py-2" colSpan={4}>
              Total
            </td>
            <td className="px-3 py-2 tabular-nums">{fmt(totalBuy)}</td>
            <td className="px-3 py-2 tabular-nums">{fmt(totalSell)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
