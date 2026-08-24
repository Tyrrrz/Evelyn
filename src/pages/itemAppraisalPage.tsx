import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ItemAppraisalTable from "../components/itemAppraisalTable.tsx";
import type { AppraisalItem, AppraisalRow } from "../esi/itemAppraisal.ts";
import { fetchAppraisalRows, parseItemList } from "../esi/itemAppraisal.ts";
import { DEFAULT_REGION_ID, getRegions } from "../esi/regions.ts";
import { decodeStateFromUrlParam, encodeStateToUrlParam } from "../utils/urlState.ts";

const STATE_PARAM = "items";
const REGION_PARAM = "region";

interface EncodedState {
  text: string;
  region: number;
}

const EXAMPLE_TEXT = `Sisters Core Scanner Probe\t8\nAtavum\t3\nCarbon\t19`;

export default function ItemAppraisalPage() {
  const regions = getRegions();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialState = (() => {
    const encoded = searchParams.get(STATE_PARAM);
    return encoded ? decodeStateFromUrlParam<EncodedState>(encoded) : null;
  })();

  const [text, setText] = useState(initialState?.text ?? "");
  const [regionId, setRegionId] = useState(() => {
    const region = initialState?.region;
    return region && regions.some((r) => r.regionId === region) ? region : DEFAULT_REGION_ID;
  });
  const [rows, setRows] = useState<AppraisalRow[]>([]);
  const [unresolvedNames, setUnresolvedNames] = useState<string[]>([]);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAppraisal = async (items: AppraisalItem[], region: number) => {
    setLoading(true);
    setProgress(null);
    setError(null);
    setRows([]);
    setUnresolvedNames([]);
    setFetchedAt(null);
    try {
      const { rows: data, unresolvedNames: unresolved } = await fetchAppraisalRows(
        items,
        region,
        (done, total) => setProgress({ done, total }),
      );
      setRows(data);
      setUnresolvedNames(unresolved);
      setFetchedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const handleEvaluate = () => {
    const items = parseItemList(text);
    if (items.length === 0) return;

    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set(STATE_PARAM, encodeStateToUrlParam({ text, region: regionId }));
        params.delete(REGION_PARAM);
        return params;
      },
      { replace: true },
    );

    void loadAppraisal(items, regionId);
  };

  // Immediately evaluate when the page is loaded with items already encoded in the URL.
  const didAutoEvaluate = useRef(false);
  useEffect(() => {
    if (didAutoEvaluate.current) return;
    didAutoEvaluate.current = true;

    const items = parseItemList(text);
    if (items.length === 0) return;
    const timeoutId = setTimeout(() => void loadAppraisal(items, regionId), 0);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          <a href="/" className="text-amber-400 hover:text-amber-300">
            Evelyn
          </a>
          <span className="mx-2 font-normal text-zinc-600">/</span>
          <span className="font-normal text-zinc-300">Item Appraisal</span>
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Paste a list of items copied from your inventory to get their Buy/Sell prices and totals
        </p>
      </header>

      <main className="mx-auto max-w-screen-2xl px-6 py-6">
        <div className="mb-4 flex flex-col items-center gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
            placeholder={EXAMPLE_TEXT}
            rows={10}
            spellCheck={false}
            className="w-full max-w-2xl rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-100 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />

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
              onClick={handleEvaluate}
              disabled={loading || parseItemList(text).length === 0}
              title="Evaluate"
              aria-label="Evaluate"
              className="shrink-0 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              Evaluate
            </button>
          </div>
        </div>

        {fetchedAt && (
          <div className="mb-4 text-center text-xs text-zinc-500">
            {rows.length} items • fetched {fetchedAt.toLocaleString()}
          </div>
        )}

        {loading && (
          <div className="mb-4 text-center text-sm text-zinc-400">
            Fetching item prices…
            {progress && (
              <span className="ml-2 text-zinc-500">
                ({progress.done}/{progress.total} items processed)
              </span>
            )}
          </div>
        )}

        {error && <div className="mb-4 text-center text-sm text-red-400">Error: {error}</div>}

        {unresolvedNames.length > 0 && (
          <div className="mb-4 text-center text-sm text-yellow-500">
            Could not recognize {unresolvedNames.length} item
            {unresolvedNames.length === 1 ? "" : "s"}: {unresolvedNames.join(", ")}
          </div>
        )}

        {rows.length > 0 && <ItemAppraisalTable rows={rows} />}

        {!loading && fetchedAt && rows.length === 0 && !error && (
          <div className="text-center text-sm text-zinc-500">
            None of the pasted items could be recognized.
          </div>
        )}
      </main>
    </div>
  );
}
