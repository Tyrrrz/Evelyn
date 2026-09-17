import { useEffect } from "react";
import AsyncStatus from "../components/asyncStatus.tsx";
import AutocompleteSelect from "../components/autocompleteSelect.tsx";
import Layout from "../components/layout.tsx";
import MiningPricesTable from "../components/miningPricesTable.tsx";
import type { MiningPriceRow } from "../esi/miningPrices.ts";
import { fetchMiningPriceRows } from "../esi/miningPrices.ts";
import { DEFAULT_REGION_ID, getRegions } from "../esi/regions.ts";
import { usePromise } from "../hooks/usePromise.ts";
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
  const { data: rows, error, loading, progress, timestamp, run } = usePromise<MiningPriceRow[]>();

  const loadPrices = (regionId: number) =>
    run((onProgress) => fetchMiningPriceRows(regionId, onProgress));

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

      <AsyncStatus
        error={error}
        loading={loading}
        progress={progress}
        timestamp={timestamp}
        summary={`${rows?.length ?? 0} items`}
      />

      {!loading && rows && rows.length > 0 && <MiningPricesTable rows={rows} />}

      {!loading && timestamp && rows && rows.length === 0 && !error && (
        <div className="text-center text-sm text-zinc-500">No mining types found.</div>
      )}
    </Layout>
  );
}
