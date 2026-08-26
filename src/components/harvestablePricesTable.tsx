import { useState } from "react";
import { getHarvestableColor } from "../esi/harvestableColors.ts";
import type { HarvestablePriceRow } from "../esi/harvestablePrices.ts";
import type { HarvestableCategory } from "../esi/harvestables.ts";
import { fmt } from "../utils/fmt.ts";

type SortKey = "typeName" | "sellPricePerM3" | "buyPricePerM3";
type SortDir = "asc" | "desc";

const CATEGORY_LABELS: Record<HarvestableCategory, string> = {
  ore: "Ore",
  gas: "Gas",
  ice: "Ice",
};

function sortRows(rows: HarvestablePriceRow[], key: SortKey, dir: SortDir): HarvestablePriceRow[] {
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
function columnRange(rows: HarvestablePriceRow[], key: SortKey): { min: number; max: number } {
  const values = rows.map((r) => r[key]).filter((v): v is number => typeof v === "number");
  if (!values.length) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
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

function formatIsk(value: number | null, unit: string): string {
  return value === null ? "—" : `${fmt(value)} ISK/${unit}`;
}

/** Merged cell showing the price per m³ (primary, colored by its rank within the column) and the
 * price per unit below it. */
function PriceCell({
  pricePerM3,
  pricePerUnit,
  range,
}: {
  pricePerM3: number | null;
  pricePerUnit: number | null;
  range: { min: number; max: number };
}) {
  return (
    <td className="px-3 py-2 tabular-nums">
      <div
        className="font-semibold"
        style={{ color: ratioColor(pricePerM3, range.min, range.max) }}
      >
        {formatIsk(pricePerM3, "m³")}
      </div>
      <div className="text-xs text-zinc-500">{formatIsk(pricePerUnit, "unit")}</div>
    </td>
  );
}

function HarvestableTable({
  category,
  rows,
  sortKey,
  sortDir,
  onSort,
}: {
  category: HarvestableCategory;
  rows: HarvestablePriceRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const sorted = sortRows(rows, sortKey, sortDir);
  const thProps = { sortKey, sortDir, onSort };

  if (rows.length === 0) return null;

  const sellRange = columnRange(rows, "sellPricePerM3");
  const buyRange = columnRange(rows, "buyPricePerM3");

  return (
    <div className="mb-8">
      <h2 className="mb-2 text-lg font-semibold text-zinc-100">{CATEGORY_LABELS[category]}</h2>
      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-800 text-zinc-300">
            <tr>
              <Th col="typeName" {...thProps}>
                Item
              </Th>
              <Th col="sellPricePerM3" title="Best sell order price" {...thProps}>
                Sell
              </Th>
              <Th col="buyPricePerM3" title="Best buy order price" {...thProps}>
                Buy
              </Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.typeId} className={i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900"}>
                <td
                  className="px-3 py-2 font-medium"
                  style={{ color: getHarvestableColor(row.typeName) }}
                >
                  {row.typeName}
                </td>
                <PriceCell
                  pricePerM3={row.sellPricePerM3}
                  pricePerUnit={row.sellPricePerUnit}
                  range={sellRange}
                />
                <PriceCell
                  pricePerM3={row.buyPricePerM3}
                  pricePerUnit={row.buyPricePerUnit}
                  range={buyRange}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function HarvestablePricesTable({ rows }: { rows: HarvestablePriceRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("buyPricePerM3");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "typeName" ? "asc" : "desc");
    }
  };

  const categories: HarvestableCategory[] = ["ore", "gas", "ice"];

  return (
    <div>
      {categories.map((category) => (
        <HarvestableTable
          key={category}
          category={category}
          rows={rows.filter((r) => r.category === category)}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
        />
      ))}
    </div>
  );
}
