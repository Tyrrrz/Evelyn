import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import LpStoreTable from "../components/lpStoreTable.tsx";
import { getCorporations } from "../esi/client.ts";
import type { LpStoreRow } from "../esi/lpStore.ts";
import { fetchLpStoreRows } from "../esi/lpStore.ts";
import { DEFAULT_REGION_ID, getRegions } from "../esi/regions.ts";

interface Corporation {
  corporation_id: number;
  name: string;
}

const CORP_PARAM = "corp";
const REGION_PARAM = "region";
const OTHER_ITEMS_PARAM = "includeOtherItems";
const BLUEPRINTS_PARAM = "includeBlueprints";
const VOLATILE_MARKETS_PARAM = "includeVolatileMarkets";

function parseBoolParam(value: string | null, defaultValue: boolean): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return defaultValue;
}

export default function LpStorePage() {
  const corporations = useMemo(() => getCorporations(), [getCorporations]);
  const regions = useMemo(() => getRegions(), [getRegions]);
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedCorp, setSelectedCorp] = useState<Corporation | null>(() => {
    const corpId = searchParams.get(CORP_PARAM);
    return corporations.find((c) => String(c.corporation_id) === corpId) ?? null;
  });
  const [regionId, setRegionId] = useState(() => {
    const paramRegionId = Number(searchParams.get(REGION_PARAM));
    return regions.some((r) => r.regionId === paramRegionId) ? paramRegionId : DEFAULT_REGION_ID;
  });
  const [rows, setRows] = useState<LpStoreRow[]>([]);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeOtherItems, setIncludeOtherItems] = useState(() =>
    parseBoolParam(searchParams.get(OTHER_ITEMS_PARAM), true),
  );
  const [includeBlueprints, setIncludeBlueprints] = useState(() =>
    parseBoolParam(searchParams.get(BLUEPRINTS_PARAM), false),
  );
  const [includeVolatileMarkets, setIncludeVolatileMarkets] = useState(() =>
    parseBoolParam(searchParams.get(VOLATILE_MARKETS_PARAM), false),
  );

  // Keep the query params in sync with the current selection and filters.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (selectedCorp) {
          params.set(CORP_PARAM, String(selectedCorp.corporation_id));
        } else {
          params.delete(CORP_PARAM);
        }
        params.set(REGION_PARAM, String(regionId));
        params.set(OTHER_ITEMS_PARAM, String(includeOtherItems));
        params.set(BLUEPRINTS_PARAM, String(includeBlueprints));
        params.set(VOLATILE_MARKETS_PARAM, String(includeVolatileMarkets));
        return params;
      },
      { replace: true },
    );
  }, [
    selectedCorp,
    regionId,
    includeOtherItems,
    includeBlueprints,
    includeVolatileMarkets,
    setSearchParams,
  ]);

  const handleCorpChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const corp = corporations.find((c) => String(c.corporation_id) === e.target.value) ?? null;
    setSelectedCorp(corp);
  };

  const loadLpStoreData = async (corp: Corporation, region: number, withBlueprints: boolean) => {
    setLoading(true);
    setProgress(null);
    setError(null);
    setRows([]);
    setFetchedAt(null);
    try {
      const data = await fetchLpStoreRows(
        corp.corporation_id,
        region,
        withBlueprints,
        (done, total) => setProgress({ done, total }),
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

  const handleSearch = () => {
    if (selectedCorp) void loadLpStoreData(selectedCorp, regionId, includeBlueprints);
  };

  // Immediately search when the page is loaded with an NPC corp already selected via query params.
  const didAutoSearch = useRef(false);
  useEffect(() => {
    if (didAutoSearch.current) return;
    didAutoSearch.current = true;

    if (!selectedCorp) return;
    const timeoutId = setTimeout(() => {
      void loadLpStoreData(selectedCorp, regionId, includeBlueprints);
    }, 0);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleIncludeBlueprintsChange = (checked: boolean) => {
    if (loading) return;

    setIncludeBlueprints(checked);
    if (selectedCorp && fetchedAt) void loadLpStoreData(selectedCorp, regionId, checked);
  };

  const filteredRows = rows.filter(
    (row) =>
      (includeOtherItems || row.requiredItems.length === 0) &&
      (includeVolatileMarkets || !row.isMarketVolatile),
  );

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
          LP-to-ISK conversion helper — find the most profitable LP store exchanges
        </p>
      </header>

      <main className="mx-auto max-w-screen-2xl px-6 py-6">
        {/* Corporation & region selection */}
        <div className="mb-4 flex flex-col items-center gap-2">
          <div className="flex flex-wrap items-end justify-center gap-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-400">
                NPC Corporation
              </label>
              <select
                value={selectedCorp?.corporation_id ?? ""}
                onChange={handleCorpChange}
                disabled={loading}
                className="w-64 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" disabled>
                  Select a corporation…
                </option>
                {corporations.map((c) => (
                  <option key={c.corporation_id} value={c.corporation_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-400">Market Region</label>
              <select
                value={regionId}
                onChange={(e) => setRegionId(Number(e.target.value))}
                disabled={loading}
                className="w-64 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {regions.map((r) => (
                  <option key={r.regionId} value={r.regionId}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleSearch}
              disabled={loading || !selectedCorp}
              title="Search"
              aria-label="Search"
              className="shrink-0 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              Search
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center justify-center gap-4 text-sm">
          <label className="flex items-center gap-2 text-zinc-300">
            <input
              type="checkbox"
              checked={includeOtherItems}
              disabled={loading}
              onChange={(e) => setIncludeOtherItems(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800"
            />
            Include exchanges requiring other items
          </label>
          <label className="flex items-center gap-2 text-zinc-300">
            <input
              type="checkbox"
              checked={includeBlueprints}
              disabled={loading}
              onChange={(e) => handleIncludeBlueprintsChange(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800"
            />
            Include blueprints
          </label>
          <label className="flex items-center gap-2 text-zinc-300">
            <input
              type="checkbox"
              checked={includeVolatileMarkets}
              disabled={loading}
              onChange={(e) => setIncludeVolatileMarkets(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800"
            />
            Include volatile markets
          </label>
        </div>

        {fetchedAt && (
          <div className="mb-4 text-center text-xs text-zinc-500">
            {filteredRows.length} offers • fetched {fetchedAt.toLocaleString()}
          </div>
        )}

        {/* Loading / progress */}
        {loading && (
          <div className="mb-4 text-center text-sm text-zinc-400">
            Loading LP store data for <span className="text-zinc-100">{selectedCorp?.name}</span>…
            {progress && (
              <span className="ml-2 text-zinc-500">
                ({progress.done}/{progress.total} offers processed)
              </span>
            )}
          </div>
        )}

        {error && <div className="mb-4 text-center text-sm text-red-400">Error: {error}</div>}

        {filteredRows.length > 0 && <LpStoreTable rows={filteredRows} />}

        {!loading && fetchedAt && rows.length === 0 && !error && (
          <div className="text-center text-sm text-zinc-500">
            No LP store offers found for {selectedCorp?.name}.
          </div>
        )}

        {!loading && fetchedAt && rows.length > 0 && filteredRows.length === 0 && !error && (
          <div className="text-center text-sm text-zinc-500">
            No LP store offers match the current filters.
          </div>
        )}
      </main>
    </div>
  );
}
