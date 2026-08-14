import { useState } from "react";
import { LpStoreTable } from "../components/LpStoreTable.tsx";
import { searchCorporations } from "../esi/client.ts";
import type { LpStoreRow } from "../esi/lpStore.ts";
import { fetchLpStoreRows } from "../esi/lpStore.ts";

interface Corporation {
  corporation_id: number;
  name: string;
}

export function LpStorePage() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Corporation[]>([]);
  const [selectedCorp, setSelectedCorp] = useState<Corporation | null>(null);
  const [rows, setRows] = useState<LpStoreRow[]>([]);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeOtherItems, setIncludeOtherItems] = useState(true);
  const [includeBlueprints, setIncludeBlueprints] = useState(false);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setSuggestions(searchCorporations(val));
  };

  const handleQueryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && suggestions.length > 0) {
      selectCorp(suggestions[0]);
    }
  };

  const selectCorp = async (corp: Corporation) => {
    setSelectedCorp(corp);
    setQuery(corp.name);
    setSuggestions([]);
    await loadLpStoreData(corp, includeBlueprints);
  };

  const loadLpStoreData = async (corp: Corporation, withBlueprints: boolean) => {
    setLoading(true);
    setProgress(null);
    setError(null);
    setRows([]);
    setFetchedAt(null);
    try {
      const data = await fetchLpStoreRows(corp.corporation_id, withBlueprints, (done, total) =>
        setProgress({ done, total }),
      );
      setRows(data);
      setFetchedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const handleRefresh = () => {
    if (selectedCorp) void loadLpStoreData(selectedCorp, includeBlueprints);
  };

  const handleIncludeBlueprintsChange = (checked: boolean) => {
    setIncludeBlueprints(checked);
    if (selectedCorp) void loadLpStoreData(selectedCorp, checked);
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
          <label className="mb-1 block text-sm font-medium text-zinc-400">NPC Corporation</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={handleQueryKeyDown}
              placeholder="Search corporation name…"
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
            {selectedCorp && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                title="Refresh LP store data"
                aria-label="Refresh LP store data"
                className="shrink-0 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                ⟳
              </button>
            )}
          </div>
          {suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border border-zinc-700 bg-zinc-800 shadow-lg">
              {suggestions.map((c) => (
                <li key={c.corporation_id}>
                  <button
                    type="button"
                    className="w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-zinc-700"
                    onClick={() => selectCorp(c)}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Loading / progress */}
        {loading && (
          <div className="mb-4 text-sm text-zinc-400">
            Loading LP store data for <span className="text-zinc-100">{selectedCorp?.name}</span>…
            {progress && (
              <span className="ml-2 text-zinc-500">
                ({progress.done}/{progress.total} offers processed)
              </span>
            )}
          </div>
        )}

        {error && <div className="mb-4 text-sm text-red-400">Error: {error}</div>}

        {rows.length > 0 && (
          <LpStoreTable
            rows={rows}
            fetchedAt={fetchedAt}
            includeOtherItems={includeOtherItems}
            onIncludeOtherItemsChange={setIncludeOtherItems}
            includeBlueprints={includeBlueprints}
            onIncludeBlueprintsChange={handleIncludeBlueprintsChange}
          />
        )}

        {!loading && selectedCorp && rows.length === 0 && !error && (
          <div className="text-sm text-zinc-500">
            No LP store offers found for {selectedCorp.name}.
          </div>
        )}
      </main>
    </div>
  );
}
