import { useEffect } from "react";
import AutocompleteSelect from "../components/autocompleteSelect.tsx";
import FetchStatus from "../components/fetchStatus.tsx";
import Layout from "../components/layout.tsx";
import MiningPricesTable from "../components/miningPricesTable.tsx";
import { fetchMiningPriceRows } from "../esi/miningPrices.ts";
import { DEFAULT_REGION_ID, getRegions } from "../esi/regions.ts";
import { useFetch } from "../hooks/useFetch.ts";
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
  const {
    data: rows,
    error,
    loading,
    progress,
    fetchedAt,
    run: loadPrices,
  } = useFetch((onProgress: (done: number, total: number) => void, region: number) =>
    fetchMiningPriceRows(region, onProgress),
  );

  const handleSearch = () => loadPrices(regionId);

  // Load prices for the default (or shared-link) region as soon as the page opens.
  useEffect(() => {
    loadPrices(regionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout
      title="Mining Profits"
      subtitle="Buy/Sell prices for all ore, gas and ice types (and their compressed forms) in a region"
    >
      <div className="mb-4 flex flex-col items-center gap-2">
        <form
          className="flex flex-wrap items-end justify-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-400">Market Region</label>
            <AutocompleteSelect
              value={regionId}
              onChange={setRegionId}
              options={regions.map((r) => ({ value: r.regionId, label: r.name }))}
              disabled={loading}
              className="w-64"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            title="Refresh"
            aria-label="Refresh"
            className="shrink-0 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            Refresh
          </button>
        </form>
      </div>

      <FetchStatus
        fetchedAt={fetchedAt}
        summary={`${rows?.length ?? 0} items`}
        summaryClassName="mb-2 text-center text-xs text-zinc-500"
        loading={loading}
        loadingLabel="Fetching prices…"
        progress={progress}
        progressLabel="items processed"
        error={error}
      />

      {!loading && rows && rows.length > 0 && <MiningPricesTable rows={rows} />}

      {!loading && fetchedAt && rows && rows.length === 0 && !error && (
        <div className="text-center text-sm text-zinc-500">No mining types found.</div>
      )}
    </Layout>
  );
}
