import { useEffect, useMemo, useRef } from "react";
import AsyncStatus from "../components/asyncStatus.tsx";
import AutocompleteSelect from "../components/autocompleteSelect.tsx";
import Layout from "../components/layout.tsx";
import LpStoreTable from "../components/lpStoreTable.tsx";
import { getCorporations } from "../esi/client.ts";
import { fetchLpStoreRows } from "../esi/lpStore.ts";
import { DEFAULT_REGION_ID, getRegions } from "../esi/regions.ts";
import { useAsyncCallback } from "../hooks/useAsyncCallback.ts";
import {
  boolSearchParam,
  numberSearchParam,
  useSearchParamState,
} from "../hooks/useSearchParamState.ts";

export default function LpStorePage() {
  const corporations = useMemo(() => getCorporations(), [getCorporations]);
  const regions = useMemo(() => getRegions(), [getRegions]);

  const [corpId, setCorpId] = useSearchParamState<number | null>("corp", null, {
    serialize: (value) => (value === null ? undefined : String(value)),
    deserialize: numberSearchParam.deserialize,
  });
  const selectedCorp = useMemo(
    () => corporations.find((c) => c.corporation_id === corpId) ?? null,
    [corporations, corpId],
  );
  const [regionId, setRegionId] = useSearchParamState<number>("region", DEFAULT_REGION_ID, {
    ...numberSearchParam,
    deserialize: (raw) => {
      const parsed = numberSearchParam.deserialize?.(raw);
      return parsed !== undefined && regions.some((r) => r.regionId === parsed)
        ? parsed
        : undefined;
    },
  });
  const [includeOtherItems, setIncludeOtherItems] = useSearchParamState(
    "includeOtherItems",
    true,
    boolSearchParam,
  );
  const [includeBlueprints, setIncludeBlueprints] = useSearchParamState(
    "includeBlueprints",
    false,
    boolSearchParam,
  );
  const [includeVolatileMarkets, setIncludeVolatileMarkets] = useSearchParamState(
    "includeVolatileMarkets",
    false,
    boolSearchParam,
  );
  const [includeUnpricedItems, setIncludeUnpricedItems] = useSearchParamState(
    "includeUnpricedItems",
    false,
    boolSearchParam,
  );

  // `execute()` reads this at call time instead of closing over `includeBlueprints` directly, so
  // that `handleIncludeBlueprintsChange` can force a reload with the not-yet-committed value.
  const includeBlueprintsRef = useRef(includeBlueprints);
  useEffect(() => {
    includeBlueprintsRef.current = includeBlueprints;
  }, [includeBlueprints]);

  const {
    data: rows,
    error,
    loading,
    progress,
    timestamp,
    execute: loadLpStoreData,
  } = useAsyncCallback(({ onProgress }) => {
    if (!selectedCorp) throw new Error("No corporation selected");
    return fetchLpStoreRows(
      selectedCorp.corporation_id,
      regionId,
      includeBlueprintsRef.current,
      onProgress,
    );
  });

  const handleSearch = () => {
    if (selectedCorp) loadLpStoreData();
  };

  // Immediately search when the page is loaded with an NPC corp already selected via query params.
  useEffect(() => {
    if (!selectedCorp) return;
    const timeoutId = setTimeout(() => {
      loadLpStoreData();
    }, 0);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleIncludeBlueprintsChange = (checked: boolean) => {
    if (loading) return;

    setIncludeBlueprints(checked);

    // Blueprint reward offers are only ever included in `rows` when the previous fetch requested
    // them, so unchecking never requires a reload (blueprint rows are simply filtered out below),
    // and checking only requires one if the currently-loaded data doesn't already have them.
    const hasBlueprintRows = (rows ?? []).some(
      (row) => row.blueprintMaterials.length > 0 || row.typeName.endsWith(" Blueprint"),
    );
    if (checked && !hasBlueprintRows && selectedCorp && timestamp) {
      includeBlueprintsRef.current = checked;
      loadLpStoreData();
    }
  };

  const filteredRows = (rows ?? []).filter(
    (row) =>
      (includeOtherItems || row.requiredItems.length === 0) &&
      (includeBlueprints || row.blueprintMaterials.length === 0) &&
      (includeVolatileMarkets || !row.isMarketVolatile) &&
      (includeUnpricedItems ||
        // The reward item itself may have no market data at all (e.g. non-marketable container
        // reward items, which can't be bought or sold directly), which is also an "unpriced" item.
        ((row.bestBuy !== null || row.bestSell !== null) &&
          row.requiredItems.every((i) => i.sellPrice !== null) &&
          row.blueprintMaterials.every((i) => i.sellPrice !== null))),
  );

  return (
    <Layout
      title="LP Store"
      subtitle="LP-to-ISK conversion helper — find the most profitable LP store exchanges"
    >
      {/* Corporation & region selection */}
      <div className="mb-4 flex flex-col items-center gap-2">
        <form
          className="flex flex-wrap items-end justify-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-400">NPC Corporation</label>
            <AutocompleteSelect
              value={selectedCorp ? String(selectedCorp.corporation_id) : ""}
              onChange={(nextCorpId) => setCorpId(Number(nextCorpId))}
              options={corporations.map((c) => ({
                value: String(c.corporation_id),
                label: c.name,
              }))}
              placeholder="Select a corporation…"
              disabled={loading}
              className="w-64"
            />
          </div>
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
            disabled={loading || !selectedCorp}
            title="Search"
            aria-label="Search"
            className="shrink-0 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            Search
          </button>
        </form>
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
        <label className="flex items-center gap-2 text-zinc-300">
          <input
            type="checkbox"
            checked={includeUnpricedItems}
            disabled={loading}
            onChange={(e) => setIncludeUnpricedItems(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800"
          />
          Include offers with unpriced items
        </label>
      </div>

      <AsyncStatus
        error={error}
        loading={loading}
        progress={progress}
        timestamp={timestamp}
        summary={`${filteredRows.length} offers`}
      />

      {filteredRows.length > 0 && <LpStoreTable rows={filteredRows} />}

      {!loading && timestamp && (rows ?? []).length === 0 && !error && (
        <div className="text-center text-sm text-zinc-500">
          No LP store offers found for {selectedCorp?.name}.
        </div>
      )}

      {!loading && timestamp && (rows ?? []).length > 0 && filteredRows.length === 0 && !error && (
        <div className="text-center text-sm text-zinc-500">
          No LP store offers match the current filters.
        </div>
      )}
    </Layout>
  );
}
