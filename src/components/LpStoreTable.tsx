import { useState } from "react";
import type { LpStoreRow } from "../esi/lpStore.ts";

type SortKey = keyof Pick<
  LpStoreRow,
  | "typeName"
  | "lpCost"
  | "bestBuy"
  | "bestSell"
  | "dailyVolume"
  | "normalizedDailyVolume"
  | "lpToIskBuy"
  | "lpToIskSell"
  | "quantity"
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
      className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold tracking-wide uppercase transition-colors hover:bg-zinc-700"
      onClick={() => onSort(col)}
      title={title}
    >
      {children}
      <SortIcon active={col === sortKey} dir={sortDir} />
    </th>
  );
}

export function LpStoreTable({ rows }: { rows: LpStoreRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("lpToIskSell");
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
        {sorted.length} offers · prices from Jita (The Forge) ·{" "}
        <span className="text-zinc-400">Buy = highest buy order</span>,{" "}
        <span className="text-zinc-400">Sell = lowest sell order</span>
      </div>
      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-800 text-zinc-300">
            <tr>
              <Th col="typeName" title="Item name" {...thProps}>
                Item
              </Th>
              <Th col="quantity" title="Items received per exchange" {...thProps}>
                Qty
              </Th>
              <Th col="lpCost" title="LP required per exchange" {...thProps}>
                LP Cost
              </Th>
              <Th col="lpToIskSell" title="(Sell revenue – total costs) / LP" {...thProps}>
                LP/ISK (Sell)
              </Th>
              <Th col="lpToIskBuy" title="(Buy revenue – total costs) / LP" {...thProps}>
                LP/ISK (Buy)
              </Th>
              <Th col="bestSell" title="Lowest sell order in Jita" {...thProps}>
                Best Sell
              </Th>
              <Th col="bestBuy" title="Highest buy order in Jita" {...thProps}>
                Best Buy
              </Th>
              <Th col="dailyVolume" title="Average daily volume (last 30 days) in Jita" {...thProps}>
                Daily Vol
              </Th>
              <Th
                col="normalizedDailyVolume"
                title="Daily volume ÷ exchange quantity = full exchanges sold per day"
                {...thProps}
              >
                Norm. Daily Vol
              </Th>
              <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide uppercase">
                Required Items
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.offerId} className={i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900"}>
                <td className="px-3 py-2 font-medium">
                  <a
                    href={`https://market.fuzzwork.co.uk/type/${row.typeId}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="transition-colors hover:text-amber-400"
                    title={`View ${row.typeName} on Fuzzwork`}
                  >
                    {row.typeName}
                  </a>
                </td>
                <td className="px-3 py-2 text-zinc-300">{fmt(row.quantity)}</td>
                <td className="px-3 py-2 text-zinc-300">{fmt(row.lpCost)}</td>
                <td
                  className={`px-3 py-2 font-semibold tabular-nums ${
                    row.lpToIskSell !== null && row.lpToIskSell > 0
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {row.lpToIskSell !== null ? fmtIsk(row.lpToIskSell) + " ISK/LP" : "—"}
                </td>
                <td
                  className={`px-3 py-2 tabular-nums ${
                    row.lpToIskBuy !== null && row.lpToIskBuy > 0
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}
                >
                  {row.lpToIskBuy !== null ? fmtIsk(row.lpToIskBuy) + " ISK/LP" : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums text-zinc-300">{fmtIsk(row.bestSell)}</td>
                <td className="px-3 py-2 tabular-nums text-zinc-400">{fmtIsk(row.bestBuy)}</td>
                <td className="px-3 py-2 tabular-nums text-zinc-300">
                  {fmt(Math.round(row.dailyVolume))}
                </td>
                <td className="px-3 py-2 tabular-nums text-zinc-400">
                  {fmt(row.normalizedDailyVolume, 2)}
                </td>
                <td className="max-w-xs px-3 py-2 text-xs text-zinc-400">
                  {row.iskCost > 0 && (
                    <span className="mr-2 text-zinc-500">{fmtIsk(row.iskCost)} ISK</span>
                  )}
                  {row.requiredItems.map((ri) => (
                    <span key={ri.typeId} className="mr-2">
                      {fmt(ri.quantity)} × {ri.typeName}
                    </span>
                  ))}
                  {row.iskCost === 0 && row.requiredItems.length === 0 && (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
