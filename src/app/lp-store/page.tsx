"use client";

import { useState, useCallback, useRef } from "react";
import type { LpStoreRow } from "@/app/api/lp-store/route";

interface Corporation {
  corporation_id: number;
  name: string;
  ticker: string;
}

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
    const an = av as number;
    const bn = bv as number;
    return dir === "asc" ? an - bn : bn - an;
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
  onSort: (key: SortKey) => void;
}) {
  return (
    <th
      className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide cursor-pointer select-none hover:bg-zinc-700 transition-colors"
      onClick={() => onSort(col)}
      title={title}
    >
      {children}
      <SortIcon active={col === sortKey} dir={sortDir} />
    </th>
  );
}

export default function LpStorePage() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Corporation[]>([]);
  const [selectedCorp, setSelectedCorp] = useState<Corporation | null>(null);
  const [rows, setRows] = useState<LpStoreRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("lpToIskSell");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchCorps = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/corporations?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSuggestions(Array.isArray(data) ? data : []);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchCorps(val), 400);
  };

  const selectCorp = async (corp: Corporation) => {
    setSelectedCorp(corp);
    setQuery(corp.name);
    setSuggestions([]);
    setLoading(true);
    setError(null);
    setRows([]);
    try {
      const res = await fetch(`/api/lp-store?corporationId=${corp.corporation_id}`);
      if (!res.ok) throw new Error("Failed to load LP store data");
      const data: LpStoreRow[] = await res.json();
      setRows(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedRows = sortRows(rows, sortKey, sortDir);

  const thProps = { sortKey, sortDir, onSort: handleSort };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <header className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="text-amber-400">Evelyn</span>
          <span className="text-zinc-400 font-normal ml-2">/ LP Store</span>
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          LP-to-ISK conversion helper — find the most profitable LP store exchanges in Jita
        </p>
      </header>

      <main className="px-6 py-6 max-w-screen-2xl mx-auto">
        {/* Corporation search */}
        <div className="relative max-w-md mb-8">
          <label className="block text-sm font-medium text-zinc-400 mb-1">
            NPC Corporation
          </label>
          <input
            type="text"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search corporation name…"
            className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded border border-zinc-700 bg-zinc-800 shadow-lg max-h-60 overflow-y-auto">
              {suggestions.map((c) => (
                <li
                  key={c.corporation_id}
                  className="cursor-pointer px-3 py-2 text-sm hover:bg-zinc-700 flex justify-between"
                  onClick={() => selectCorp(c)}
                >
                  <span>{c.name}</span>
                  <span className="text-zinc-500 ml-4">[{c.ticker}]</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Status */}
        {loading && (
          <div className="text-zinc-400 text-sm mb-4">
            Loading LP store data for <span className="text-zinc-100">{selectedCorp?.name}</span>…
            <span className="ml-2 text-zinc-500 text-xs">(this may take a moment)</span>
          </div>
        )}
        {error && (
          <div className="text-red-400 text-sm mb-4">Error: {error}</div>
        )}

        {/* Table */}
        {sortedRows.length > 0 && (
          <>
            <div className="text-xs text-zinc-500 mb-2">
              {sortedRows.length} offers · prices from Jita (The Forge) ·{" "}
              <span className="text-zinc-400">Buy = highest buy order</span>,{" "}
              <span className="text-zinc-400">Sell = lowest sell order</span>
            </div>
            <div className="overflow-x-auto rounded border border-zinc-800">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-800 text-zinc-300">
                  <tr>
                    <Th col="typeName" title="Item name" {...thProps}>Item</Th>
                    <Th col="quantity" title="Items received per exchange" {...thProps}>Qty</Th>
                    <Th col="lpCost" title="LP required per exchange" {...thProps}>LP Cost</Th>
                    <Th col="lpToIskSell" title="(Sell revenue – total costs) / LP" {...thProps}>
                      LP/ISK (Sell)
                    </Th>
                    <Th col="lpToIskBuy" title="(Buy revenue – total costs) / LP" {...thProps}>
                      LP/ISK (Buy)
                    </Th>
                    <Th col="bestSell" title="Lowest sell order in Jita" {...thProps}>Best Sell</Th>
                    <Th col="bestBuy" title="Highest buy order in Jita" {...thProps}>Best Buy</Th>
                    <Th
                      col="dailyVolume"
                      title="Average daily volume (last 30 days) in Jita"
                      {...thProps}
                    >
                      Daily Vol
                    </Th>
                    <Th
                      col="normalizedDailyVolume"
                      title="Daily volume ÷ exchange quantity = full exchanges sold per day"
                      {...thProps}
                    >
                      Norm. Daily Vol
                    </Th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">
                      Required Items
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, i) => (
                    <tr
                      key={row.offerId}
                      className={i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900"}
                    >
                      <td className="px-3 py-2 font-medium">
                        <a
                          href={`https://market.fuzzwork.co.uk/type/${row.typeId}/`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-amber-400 transition-colors"
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
                        {row.lpToIskSell !== null
                          ? fmtIsk(row.lpToIskSell) + " ISK/LP"
                          : "—"}
                      </td>
                      <td
                        className={`px-3 py-2 tabular-nums ${
                          row.lpToIskBuy !== null && row.lpToIskBuy > 0
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {row.lpToIskBuy !== null
                          ? fmtIsk(row.lpToIskBuy) + " ISK/LP"
                          : "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-zinc-300">
                        {fmtIsk(row.bestSell)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-zinc-400">
                        {fmtIsk(row.bestBuy)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-zinc-300">
                        {fmt(Math.round(row.dailyVolume))}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-zinc-400">
                        {fmt(row.normalizedDailyVolume, 2)}
                      </td>
                      <td className="px-3 py-2 text-zinc-400 text-xs max-w-xs">
                        {row.iskCost > 0 && (
                          <span className="mr-2 text-zinc-500">
                            {fmtIsk(row.iskCost)} ISK
                          </span>
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
        )}

        {!loading && selectedCorp && rows.length === 0 && !error && (
          <div className="text-zinc-500 text-sm">
            No LP store offers found for {selectedCorp.name}.
          </div>
        )}
      </main>
    </div>
  );
}

