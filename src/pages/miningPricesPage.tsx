import { useEffect, useRef, useState } from "react";
import Layout from "../components/layout.tsx";
import MiningPricesTable from "../components/miningPricesTable.tsx";
import type { MiningPriceRow } from "../esi/miningPrices.ts";
import { fetchMiningPriceRows } from "../esi/miningPrices.ts";
import { DEFAULT_REGION_ID, getRegions } from "../esi/regions.ts";
import { numberSearchParam, useSearchParamState } from "../hooks/useSearchParamState.ts";

export default function MiningPricesPage() {
  const regions = getRegions();

  const [regionId, setRegionId] = useSearchParamState<number>("region", DEFAULT_REGION_ID, {
    ...numberSearchParam,
    deserialize: (raw) => {
      const parsed = numberSearchParam.deserialize?.(raw);
      return parsed !== undefined && regions.some((r) => r.regionId === parsed)
        ? parsed
        : undefined;
    },
  });
  const [rows, setRows] = useState<MiningPriceRow[]>([]);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPrices = async (region: number) => {
    setLoading(true);
    setProgress(null);
    setError(null);
    setRows([]);
    setFetchedAt(null);
    try {
      const data = await fetchMiningPriceRows(region, (done, total) =>
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

  const handleSearch = () => void loadPrices(regionId);

  // Load prices for the default (or shared-link) region as soon as the page opens.
  const didAutoSearch = useRef(false);
  useEffect(() => {
    if (didAutoSearch.current) return;
    didAutoSearch.current = true;
    void loadPrices(regionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout
      title="Mining Profits"
      subtitle="Buy/Sell prices for all ore, gas and ice types (and their compressed forms) in a region"
    >
      <div className="mb-4 flex flex-col items-center gap-2">
        <div className="flex flex-wrap items-end justify-center gap-2">
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
            disabled={loading}
            title="Refresh"
            aria-label="Refresh"
            className="shrink-0 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {fetchedAt && (
        <div className="mb-2 text-center text-xs text-zinc-500">
          {rows.length} items • fetched {fetchedAt.toLocaleString()}
        </div>
      )}

      {loading && (
        <div className="mb-4 text-center text-sm text-zinc-400">
          Fetching prices…
          {progress && (
            <span className="ml-2 text-zinc-500">
              ({progress.done}/{progress.total} items processed)
            </span>
          )}
        </div>
      )}

      {error && <div className="mb-4 text-center text-sm text-red-400">Error: {error}</div>}

      {!loading && rows.length > 0 && <MiningPricesTable rows={rows} />}

      {!loading && fetchedAt && rows.length === 0 && !error && (
        <div className="text-center text-sm text-zinc-500">No mining types found.</div>
      )}
    </Layout>
  );
}
