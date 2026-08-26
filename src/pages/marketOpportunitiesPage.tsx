import { useEffect, useMemo, useRef, useState } from "react";
import Layout from "../components/layout.tsx";
import MarketOpportunitiesTable from "../components/marketOpportunitiesTable.tsx";
import type { RawMarketOpportunity } from "../esi/marketOpportunities.ts";
import {
  ACCOUNTING_TAX_RATES,
  computeMarketOpportunityRows,
  DEFAULT_ACCOUNTING_SKILL_LEVEL,
  fetchRawMarketOpportunities,
} from "../esi/marketOpportunities.ts";
import { getRegions } from "../esi/regions.ts";
import { boolSearchParam, useSearchParamState } from "../hooks/useSearchParamState.ts";

function TaxSelect({
  skillLevel,
  setSkillLevel,
  disabled,
}: {
  skillLevel: number;
  setSkillLevel: (level: number) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label
        htmlFor="market-opportunities-tax"
        className="mb-1 block text-sm font-medium text-zinc-400"
      >
        Accounting skill
      </label>
      <select
        id="market-opportunities-tax"
        value={skillLevel}
        onChange={(e) => setSkillLevel(Number(e.target.value))}
        disabled={disabled}
        className="w-64 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {ACCOUNTING_TAX_RATES.map((rate, level) => (
          <option key={level} value={level}>
            Level {level} ({(rate * 100).toFixed(2)}% tax)
          </option>
        ))}
      </select>
    </div>
  );
}

export default function MarketOpportunitiesPage() {
  const [rawOpportunities, setRawOpportunities] = useState<RawMarketOpportunity[]>([]);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<{ label: string; done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountingSkillLevel, setAccountingSkillLevel] = useState(DEFAULT_ACCOUNTING_SKILL_LEVEL);
  const [includeNpcToNpc, setIncludeNpcToNpc] = useSearchParamState(
    "includeNpcToNpc",
    true,
    boolSearchParam,
  );

  const rows = useMemo(
    () =>
      computeMarketOpportunityRows(
        rawOpportunities,
        ACCOUNTING_TAX_RATES[accountingSkillLevel] ??
          ACCOUNTING_TAX_RATES[DEFAULT_ACCOUNTING_SKILL_LEVEL]!,
        includeNpcToNpc,
      ),
    [rawOpportunities, accountingSkillLevel, includeNpcToNpc],
  );

  const loadOpportunities = async () => {
    setLoading(true);
    setStage(null);
    setError(null);
    setRawOpportunities([]);
    setFetchedAt(null);
    try {
      const regionIds = getRegions().map((r) => r.regionId);
      const data = await fetchRawMarketOpportunities(regionIds, (label, done, total) =>
        setStage({ label, done, total }),
      );
      setRawOpportunities(data);
      setFetchedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      setStage(null);
    }
  };

  const handleSearch = () => void loadOpportunities();

  // Scan all regions as soon as the page opens — there's no region selection anymore.
  const didAutoSearch = useRef(false);
  useEffect(() => {
    if (didAutoSearch.current) return;
    didAutoSearch.current = true;
    void loadOpportunities();
  }, []);

  return (
    <Layout
      title="Market Opportunities"
      subtitle="Items that can be bought from sell orders in one place and sold to buy orders in another, with a profit"
    >
      <div className="mb-4 flex flex-col items-center gap-2">
        <div className="flex flex-wrap items-end justify-center gap-2">
          <TaxSelect
            skillLevel={accountingSkillLevel}
            setSkillLevel={setAccountingSkillLevel}
            disabled={loading}
          />
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
        <p className="max-w-xl text-center text-xs text-zinc-500">
          Scans every region in New Eden, so this can take a while.
        </p>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={includeNpcToNpc}
            disabled={loading}
            onChange={(e) => setIncludeNpcToNpc(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800"
          />
          Include NPC-to-NPC opportunities
        </label>
      </div>

      {fetchedAt && (
        <div className="mb-2 text-center text-xs text-zinc-500">
          {rows.length} opportunities • fetched {fetchedAt.toLocaleString()}
        </div>
      )}

      {loading && (
        <div className="mb-4 text-center text-sm text-zinc-400">
          {stage?.label ?? "Loading…"}
          {stage && stage.total > 0 && (
            <span className="ml-2 text-zinc-500">
              ({stage.done}/{stage.total})
            </span>
          )}
        </div>
      )}

      {error && <div className="mb-4 text-center text-sm text-red-400">Error: {error}</div>}

      {!loading && rows.length > 0 && <MarketOpportunitiesTable rows={rows} />}

      {!loading && fetchedAt && rows.length === 0 && !error && (
        <div className="text-center text-sm text-zinc-500">No profitable opportunities found.</div>
      )}
    </Layout>
  );
}
