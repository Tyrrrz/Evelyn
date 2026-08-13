import { useCallback, useRef, useState } from "react";
import { searchCorporations } from "../esi/client.ts";
import type { LpStoreRow } from "../esi/lpStore.ts";
import { fetchLpStoreRows } from "../esi/lpStore.ts";
import { LpStoreTable } from "../components/LpStoreTable.tsx";

interface Corporation {
  corporation_id: number;
  name: string;
  ticker: string;
}

export function LpStorePage() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Corporation[]>([]);
  const [selectedCorp, setSelectedCorp] = useState<Corporation | null>(null);
  const [rows, setRows] = useState<LpStoreRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSuggestions([]);
      return;
    }
    try {
      const corps = await searchCorporations(q);
      setSuggestions(corps);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 400);
  };

  const selectCorp = async (corp: Corporation) => {
    setSelectedCorp(corp);
    setQuery(corp.name);
    setSuggestions([]);
    setLoading(true);
    setProgress(null);
    setError(null);
    setRows([]);
    try {
      const data = await fetchLpStoreRows(corp.corporation_id, (done, total) =>
        setProgress({ done, total }),
      );
      setRows(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight">
          <a href="/" className="text-amber-400 hover:text-amber-300">
            Evelyn
          </a>
          <span className="ml-2 font-normal text-zinc-400">/ LP Store</span>
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          LP-to-ISK conversion helper — find the most profitable LP store exchanges in Jita
        </p>
      </header>

      <main className="mx-auto max-w-screen-2xl px-6 py-6">
        {/* Corporation search */}
        <div className="relative mb-8 max-w-md">
          <label className="mb-1 block text-sm font-medium text-zinc-400">
            NPC Corporation
          </label>
          <input
            type="text"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search corporation name…"
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:outline-none"
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border border-zinc-700 bg-zinc-800 shadow-lg">
              {suggestions.map((c) => (
                <li
                  key={c.corporation_id}
                  className="flex cursor-pointer justify-between px-3 py-2 text-sm hover:bg-zinc-700"
                  onClick={() => selectCorp(c)}
                >
                  <span>{c.name}</span>
                  <span className="ml-4 text-zinc-500">[{c.ticker}]</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Loading / progress */}
        {loading && (
          <div className="mb-4 text-sm text-zinc-400">
            Loading LP store data for{" "}
            <span className="text-zinc-100">{selectedCorp?.name}</span>…
            {progress && (
              <span className="ml-2 text-zinc-500">
                ({progress.done}/{progress.total} offers processed)
              </span>
            )}
          </div>
        )}

        {error && <div className="mb-4 text-sm text-red-400">Error: {error}</div>}

        {rows.length > 0 && <LpStoreTable rows={rows} />}

        {!loading && selectedCorp && rows.length === 0 && !error && (
          <div className="text-sm text-zinc-500">
            No LP store offers found for {selectedCorp.name}.
          </div>
        )}
      </main>
    </div>
  );
}
