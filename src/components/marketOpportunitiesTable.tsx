import { useState } from "react";
import { FaExclamationTriangle } from "react-icons/fa";
import type { MarketLocation, MarketOpportunityRow } from "../esi/marketOpportunities.ts";
import { fmt } from "../utils/fmt.ts";

type SortKey =
  "typeName" | "origin" | "destination" | "jumps" | "volume" | "sellPrice" | "buyPrice" | "profit";
type SortDir = "asc" | "desc";

function sortRows(
  rows: MarketOpportunityRow[],
  key: SortKey,
  dir: SortDir,
): MarketOpportunityRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (key) {
      case "typeName":
        return sign * a.typeName.localeCompare(b.typeName);
      case "origin":
        return sign * locationLabel(a.origin).localeCompare(locationLabel(b.origin));
      case "destination":
        return sign * locationLabel(a.destination).localeCompare(locationLabel(b.destination));
      case "jumps":
        return sign * (a.jumps - b.jumps);
      case "volume":
        return sign * (a.totalVolumeM3 - b.totalVolumeM3);
      case "sellPrice":
        return sign * (a.sellPrice - b.sellPrice);
      case "buyPrice":
        return sign * (a.buyPrice - b.buyPrice);
      case "profit":
        return sign * (a.profitTotal - b.profitTotal);
    }
  });
}

function locationLabel(location: MarketLocation): string {
  return location.name ?? `Structure #${location.locationId}`;
}

/** Tailwind text color class for a system's security status: high sec green, low sec yellow, null sec dark purple. */
function securityColorClass(securityStatus: number): string {
  const rounded = Math.round(securityStatus * 10) / 10;
  if (rounded >= 0.5) return "text-emerald-400";
  if (rounded > 0) return "text-yellow-400";
  return "text-purple-700";
}

const VOLUME_LOW_M3 = 10_000;
const VOLUME_MID_M3 = 50_000;
const VOLUME_HIGH_M3 = 60_000;
const VOLUME_COLOR_LOW = [52, 211, 153] as const; // emerald-400
const VOLUME_COLOR_MID = [250, 204, 21] as const; // yellow-400
const VOLUME_COLOR_HIGH = [248, 113, 113] as const; // red-400

function lerpColor(a: readonly number[], b: readonly number[], t: number): string {
  const [r, g, bl] = a.map((v, i) => Math.round(v + (b[i]! - v) * t));
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Interpolated color for total transaction volume: <=10k green, <=50k yellow, >=60k red. */
function volumeColor(totalVolumeM3: number): string {
  if (totalVolumeM3 <= VOLUME_LOW_M3) return lerpColor(VOLUME_COLOR_LOW, VOLUME_COLOR_LOW, 0);
  if (totalVolumeM3 <= VOLUME_MID_M3) {
    const t = (totalVolumeM3 - VOLUME_LOW_M3) / (VOLUME_MID_M3 - VOLUME_LOW_M3);
    return lerpColor(VOLUME_COLOR_LOW, VOLUME_COLOR_MID, t);
  }
  if (totalVolumeM3 <= VOLUME_HIGH_M3) {
    const t = (totalVolumeM3 - VOLUME_MID_M3) / (VOLUME_HIGH_M3 - VOLUME_MID_M3);
    return lerpColor(VOLUME_COLOR_MID, VOLUME_COLOR_HIGH, t);
  }
  return lerpColor(VOLUME_COLOR_HIGH, VOLUME_COLOR_HIGH, 0);
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 opacity-30">↕</span>;
  return <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>;
}

function Th({
  col,
  children,
  title,
  sortKey,
  sortDir,
  onSort,
}: {
  col: SortKey;
  children: React.ReactNode;
  title?: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  return (
    <th
      className="px-3 py-2 text-left text-xs font-semibold tracking-wide whitespace-nowrap uppercase transition-colors hover:bg-zinc-700"
      title={title}
      scope="col"
      aria-sort={col === sortKey ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-2 select-none"
        onClick={() => onSort(col)}
      >
        <span>{children}</span>
        <SortIcon active={col === sortKey} dir={sortDir} />
      </button>
    </th>
  );
}

function LocationCell({ location }: { location: MarketLocation }) {
  return (
    <td className="px-3 py-2">
      <div className="flex items-center gap-1.5">
        {location.isPlayerStructure && (
          <FaExclamationTriangle
            className="shrink-0 text-amber-500"
            title="Player-owned structure — may require docking access"
          />
        )}
        <span className={securityColorClass(location.securityStatus)}>
          {locationLabel(location)}
        </span>
      </div>
    </td>
  );
}

function NpcTag() {
  return (
    <span
      className="ml-1 rounded border border-zinc-600 px-1 text-[10px] font-semibold text-zinc-400 uppercase"
      title="NPC-seeded order"
    >
      NPC
    </span>
  );
}

function formatIsk(value: number): string {
  return `${fmt(value)} ISK`;
}

export default function MarketOpportunitiesTable({ rows }: { rows: MarketOpportunityRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("profit");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "typeName" || key === "origin" || key === "destination" ? "asc" : "desc");
    }
  };

  const sorted = sortRows(rows, sortKey, sortDir);
  const thProps = { sortKey, sortDir, onSort: handleSort };

  return (
    <div className="overflow-x-auto rounded border border-zinc-800">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-800 text-zinc-300">
          <tr>
            <Th col="typeName" {...thProps}>
              Item
            </Th>
            <Th col="origin" title="Where to buy from sell orders" {...thProps}>
              Origin
            </Th>
            <Th col="destination" title="Where to sell to buy orders" {...thProps}>
              Destination
            </Th>
            <Th col="jumps" title="Jumps for the most direct route" {...thProps}>
              Jumps
            </Th>
            <Th
              col="volume"
              title="Total packaged volume (m³) of the matched quantity"
              {...thProps}
            >
              Volume
            </Th>
            <Th col="sellPrice" title="Weighted-average sell order price paid" {...thProps}>
              Sell
            </Th>
            <Th col="buyPrice" title="Weighted-average buy order price received" {...thProps}>
              Buy
            </Th>
            <Th
              col="profit"
              title="Total profit / profit per jump / profit per m³, for the matched quantity"
              {...thProps}
            >
              Profit
            </Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={`${row.typeId}-${row.origin.locationId}-${row.destination.locationId}-${row.sellPrice}-${row.buyPrice}`}
              className={i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900"}
            >
              <td className="px-3 py-2 font-medium">{row.typeName}</td>
              <LocationCell location={row.origin} />
              <LocationCell location={row.destination} />
              <td className="px-3 py-2 tabular-nums">{row.jumps}</td>
              <td
                className="px-3 py-2 tabular-nums"
                style={{ color: volumeColor(row.totalVolumeM3) }}
              >
                {fmt(row.totalVolumeM3)} m³
              </td>
              <td className="px-3 py-2 tabular-nums">
                {formatIsk(row.sellPrice)}
                {row.sellIsNpc && <NpcTag />}
                <div className="text-xs text-zinc-500">× {fmt(row.quantity)}</div>
              </td>
              <td className="px-3 py-2 tabular-nums">
                {formatIsk(row.buyPrice)}
                {row.buyIsNpc && <NpcTag />}
                <div className="text-xs text-zinc-500">× {fmt(row.quantity)}</div>
              </td>
              <td className="px-3 py-2 tabular-nums">
                <div className="font-semibold text-emerald-400">{formatIsk(row.profitTotal)}</div>
                <div className="text-xs text-zinc-500">
                  {formatIsk(row.profitPerJump)}/jump
                  {row.profitPerM3 !== null && <> · {formatIsk(row.profitPerM3)}/m³</>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
