import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AsyncStatus from "../components/asyncStatus.tsx";
import AutocompleteSelect from "../components/autocompleteSelect.tsx";
import ItemAppraisalTable from "../components/itemAppraisalTable.tsx";
import Layout from "../components/layout.tsx";
import type { AppraisalItem, AppraisalRow } from "../esi/itemAppraisal.ts";
import { fetchAppraisalRows, parseItemList } from "../esi/itemAppraisal.ts";
import { DEFAULT_REGION_ID, getRegions } from "../esi/regions.ts";
import { usePromise } from "../hooks/usePromise.ts";
import { decodeStateFromUrlParam, encodeStateToUrlParam } from "../utils/urlState.ts";

const STATE_PARAM = "items";
const REGION_PARAM = "region";

interface EncodedState {
  text: string;
  region: number;
}

const PLACEHOLDER_TEXT = "Copy-paste items from your inventory here";
const REGION_SELECT_ID = "item-appraisal-region";
const ITEM_LIST_TEXTAREA_ID = "item-appraisal-items";

function isEncodedState(value: unknown): value is EncodedState {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.text === "string" &&
    typeof value.region === "number" &&
    Number.isFinite(value.region)
  );
}

function RegionSelect({
  regionId,
  setRegionId,
  disabled,
}: {
  regionId: number;
  setRegionId: (id: number) => void;
  disabled: boolean;
}) {
  const regions = getRegions();
  return (
    <div>
      <label htmlFor={REGION_SELECT_ID} className="mb-1 block text-sm font-medium text-zinc-400">
        Market Region
      </label>
      <AutocompleteSelect
        id={REGION_SELECT_ID}
        value={regionId}
        onChange={setRegionId}
        options={regions.map((r) => ({ value: r.regionId, label: r.name }))}
        disabled={disabled}
        className="w-64"
      />
    </div>
  );
}

function ItemListTextarea({
  text,
  setText,
  disabled,
}: {
  text: string;
  setText: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="w-full max-w-2xl">
      <label
        htmlFor={ITEM_LIST_TEXTAREA_ID}
        className="mb-1 block text-sm font-medium text-zinc-400"
      >
        Item List
      </label>
      <textarea
        id={ITEM_LIST_TEXTAREA_ID}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        placeholder={PLACEHOLDER_TEXT}
        rows={10}
        spellCheck={false}
        className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-100 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

export default function ItemAppraisalPage() {
  const regions = getRegions();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialState = useMemo(() => {
    const encoded = searchParams.get(STATE_PARAM);
    if (!encoded) return null;

    try {
      const decoded = decodeStateFromUrlParam<unknown>(encoded);
      return isEncodedState(decoded) ? decoded : null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [text, setText] = useState(initialState?.text ?? "");
  const [regionId, setRegionId] = useState(() => {
    const region = initialState?.region;
    return region && regions.some((r) => r.regionId === region) ? region : DEFAULT_REGION_ID;
  });
  const {
    data: appraisal,
    error,
    loading,
    progress,
    timestamp,
    run,
  } = usePromise<{ rows: AppraisalRow[]; unresolvedNames: string[] }>();
  const rows = appraisal?.rows ?? [];
  const unresolvedNames = appraisal?.unresolvedNames ?? [];

  const parsedItems = parseItemList(text);

  const loadAppraisal = (items: AppraisalItem[], regionId: number) =>
    run((onProgress) => fetchAppraisalRows(items, regionId, onProgress));

  const handleEvaluate = () => {
    if (parsedItems.length === 0) return;

    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set(STATE_PARAM, encodeStateToUrlParam({ text, region: regionId }));
        params.delete(REGION_PARAM);
        return params;
      },
      { replace: true },
    );

    loadAppraisal(parsedItems, regionId);
  };

  // Automatically evaluate items when the page is loaded from a shared link with state.
  useEffect(() => {
    if (!initialState) return;

    const items = parseItemList(initialState.text);
    if (items.length === 0) return;

    loadAppraisal(items, regionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout
      title="Item Appraisal"
      subtitle="Paste a list of items copied from your inventory to get their Buy/Sell prices and totals"
    >
      <div className="mb-4 flex flex-col items-center gap-2">
        <RegionSelect regionId={regionId} setRegionId={setRegionId} disabled={loading} />
        <ItemListTextarea text={text} setText={setText} disabled={loading} />

        <button
          type="button"
          onClick={handleEvaluate}
          disabled={loading || parsedItems.length === 0}
          title="Evaluate"
          aria-label="Evaluate"
          className="shrink-0 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          Evaluate
        </button>
      </div>

      <AsyncStatus
        error={error}
        loading={loading}
        progress={progress}
        timestamp={timestamp}
        summary={`${rows.length} items`}
      />

      {unresolvedNames.length > 0 && (
        <div className="mb-4 text-center text-sm text-yellow-500">
          Could not recognize {unresolvedNames.length} item
          {unresolvedNames.length === 1 ? "" : "s"}: {unresolvedNames.join(", ")}
        </div>
      )}

      {rows.length > 0 && <ItemAppraisalTable rows={rows} />}

      {!loading && timestamp && rows.length === 0 && !error && (
        <div className="text-center text-sm text-zinc-500">
          None of the pasted items could be recognized.
        </div>
      )}
    </Layout>
  );
}
