// NPC corporations rarely change, so instead of relying on the ESI search endpoint (which does
// not reliably return NPC corporations), this data is bundled at build time from CCP's official
// Static Data Export (SDE). See scripts/generate-npc-corporations.mjs for how
// npcCorporationData.json is generated, and regenerate it there when new corporations are added.
import npcCorporationData from "./npcCorporationData.json";

// EVE's ESI API does not expose blueprint manufacturing recipes (materials/products). Blueprint
// recipes are static game data that only changes when CCP ships an expansion or balance pass, so
// instead of resolving them at runtime against a third-party API, this data is bundled at build
// time from CCP's official Static Data Export (SDE). See scripts/generate-blueprint-data.mjs for
// how blueprintData.json is generated, and regenerate it there when new blueprints are added.
import blueprintData from "./blueprintData.json";

const ESI_BASE = "https://esi.evetech.net/latest";

export interface Corporation {
  corporation_id: number;
  name: string;
}

export interface LpOffer {
  offer_id: number;
  type_id: number;
  quantity: number;
  lp_cost: number;
  isk_cost: number;
  required_items: { type_id: number; quantity: number }[];
}

export interface MarketOrder {
  order_id: number;
  type_id: number;
  price: number;
  volume_remain: number;
  is_buy_order: boolean;
}

export interface MarketHistoryEntry {
  date: string;
  average: number;
  volume: number;
}

export interface TypeInfo {
  name: string;
  type_id: number;
}

export interface BlueprintInfo {
  productTypeId: number;
  productQuantity: number;
  materials: { typeId: number; quantity: number }[];
}

/** All blueprint item type names in EVE end with this suffix. */
export function isBlueprintTypeName(typeName: string): boolean {
  return typeName.endsWith(" Blueprint");
}

/**
 * Looks up the manufacturing recipe (product + materials) for a blueprint type. Returns null if
 * the type isn't a manufacturable blueprint or isn't present in the bundled dataset.
 */
export function getBlueprintInfo(blueprintTypeId: number): BlueprintInfo | null {
  return (blueprintData as Record<string, BlueprintInfo>)[blueprintTypeId] ?? null;
}

// Long-lived in-memory cache for type info (names don't change often)
const typeInfoCache = new Map<number, TypeInfo>();

async function esiGet<T>(path: string, cacheable = false): Promise<T> {
  const url = `${ESI_BASE}${path}`;
  const init: RequestInit = cacheable ? { cache: "default" } : { cache: "no-store" };
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`ESI ${res.status}: ${url}`);
  }
  return res.json() as Promise<T>;
}

async function esiPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${ESI_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`ESI ${res.status}: ${url}`);
  }
  return res.json() as Promise<T>;
}

async function esiGetAllPages<T>(path: string, extraSep = "&"): Promise<T[]> {
  const url = `${ESI_BASE}${path}`;
  // Price data is never cached
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`ESI ${res.status}: ${url}`);
  const totalPages = parseInt(res.headers.get("X-Pages") ?? "1", 10);
  const firstPage = (await res.json()) as T[];
  if (totalPages <= 1) return firstPage;
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      esiGet<T[]>(`${path}${extraSep}page=${i + 2}`),
    ),
  );
  return firstPage.concat(...rest);
}

/**
 * All NPC corporations from the bundled dataset (see scripts/generate-npc-corporations.mjs),
 * sorted alphabetically. The ESI search endpoint does not reliably return NPC corporations, so
 * this data is bundled locally instead.
 */
export function getCorporations(): Corporation[] {
  return (npcCorporationData as { corporationId: number; name: string }[])
    .map((c) => ({ corporation_id: c.corporationId, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getLpOffers(corporationId: number): Promise<LpOffer[]> {
  // LP store offers don't change often
  return esiGet<LpOffer[]>(`/loyalty/stores/${corporationId}/offers/`, true);
}

export async function getMarketOrders(typeId: number, regionId: number): Promise<MarketOrder[]> {
  // Market orders: always fresh
  return esiGetAllPages<MarketOrder>(`/markets/${regionId}/orders/?type_id=${typeId}`, "&");
}

export async function getMarketHistory(
  typeId: number,
  regionId: number,
): Promise<MarketHistoryEntry[]> {
  // History updates once a day — cacheable
  return esiGet<MarketHistoryEntry[]>(`/markets/${regionId}/history/?type_id=${typeId}`, true);
}

export async function getTypeInfo(typeId: number): Promise<TypeInfo> {
  const cached = typeInfoCache.get(typeId);
  if (cached) return cached;
  const t = await esiGet<{ name: string }>(`/universe/types/${typeId}/`, true);
  const info: TypeInfo = { type_id: typeId, name: t.name };
  typeInfoCache.set(typeId, info);
  return info;
}

export async function getTypeInfoBatch(typeIds: number[]): Promise<Map<number, TypeInfo>> {
  const unique = [...new Set(typeIds)];
  const results = await Promise.all(unique.map((id) => getTypeInfo(id)));
  return new Map(results.map((t) => [t.type_id, t]));
}

/** Max number of names ESI's /universe/ids/ endpoint accepts per request. */
const RESOLVE_NAMES_BATCH_SIZE = 500;

/**
 * Resolves item type names (as copy-pasted from the in-game inventory) to their type IDs, via
 * ESI's name-resolution endpoint. Names are matched exactly (case-sensitive); names that don't
 * match any known item type (of any kind — not just inventory types) are omitted from the result.
 */
export async function resolveTypeIdsByName(names: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(names)];
  const result = new Map<string, number>();

  for (let i = 0; i < unique.length; i += RESOLVE_NAMES_BATCH_SIZE) {
    const batch = unique.slice(i, i + RESOLVE_NAMES_BATCH_SIZE);
    const response = await esiPost<{ inventory_types?: { id: number; name: string }[] }>(
      "/universe/ids/",
      batch,
    );
    for (const t of response.inventory_types ?? []) {
      result.set(t.name, t.id);
    }
  }

  return result;
}

/**
 * "5% method" price, as used by evetycoon/buzzwork: outlier orders are
 * dropped first (buy orders below 10% of the highest buy price, or sell
 * orders above 10x the lowest sell price — these usually exist to prey on
 * careless players rather than reflect the real market), then the price is
 * the volume-weighted average over the best 5% of the remaining volume.
 */
function fivePercentPrice(orders: MarketOrder[], isBuyOrder: boolean): number | null {
  const side = orders
    .filter((o) => o.is_buy_order === isBuyOrder)
    .sort((a, b) => (isBuyOrder ? b.price - a.price : a.price - b.price));
  if (!side.length) return null;

  const bestPrice = side[0].price;
  const filtered = side.filter((o) =>
    isBuyOrder ? o.price >= bestPrice * 0.1 : o.price <= bestPrice * 10,
  );

  const totalVolume = filtered.reduce((s, o) => s + o.volume_remain, 0);
  if (totalVolume <= 0) return bestPrice;

  const targetVolume = totalVolume * 0.05;
  let accumulatedVolume = 0;
  let weightedSum = 0;
  for (const o of filtered) {
    const remainingNeeded = targetVolume - accumulatedVolume;
    if (remainingNeeded <= 0) break;
    const volumeToTake = Math.min(o.volume_remain, remainingNeeded);
    weightedSum += o.price * volumeToTake;
    accumulatedVolume += volumeToTake;
  }

  return accumulatedVolume > 0 ? weightedSum / accumulatedVolume : bestPrice;
}

/** Highest buy order price, using the 5% method to filter out outliers */
export function bestBuyPrice(orders: MarketOrder[]): number | null {
  return fivePercentPrice(orders, true);
}

/** Lowest sell order price, using the 5% method to filter out outliers */
export function bestSellPrice(orders: MarketOrder[]): number | null {
  return fivePercentPrice(orders, false);
}

export interface BuyOrderLevel {
  price: number;
  volume: number;
}

/**
 * Returns buy orders priced within `pct` of `referencePrice`, sorted from
 * highest to lowest price — i.e. the order in which they would realistically
 * be filled when dumping items onto the market.
 */
export function buyOrderLevels(
  orders: MarketOrder[],
  referencePrice: number,
  pct = 0.05,
): BuyOrderLevel[] {
  return orders
    .filter(
      (o) =>
        o.is_buy_order &&
        o.price >= referencePrice * (1 - pct) &&
        o.price <= referencePrice * (1 + pct),
    )
    .sort((a, b) => b.price - a.price)
    .map((o) => ({ price: o.price, volume: o.volume_remain }));
}

/** Average daily volume over the last 30 days of market history */
export function avgDailyVolume(history: MarketHistoryEntry[]): number {
  const recent = history.slice(-30);
  if (!recent.length) return 0;
  return recent.reduce((s, h) => s + h.volume, 0) / recent.length;
}

/**
 * Detects whether a market looks volatile or manipulated and is therefore risky to rely on for
 * liquidation, even if the raw sell price looks attractive:
 * - The average price has jumped sharply over the last few days relative to the prior week — a
 *   potential hallmark of a market being pumped (or wash-traded) rather than one that has settled
 *   at a new, sustainable price.
 */
export function isMarketVolatile(
  history: MarketHistoryEntry[],
  buy: number | null,
  sell: number | null,
): boolean {
  if (buy !== null && sell !== null && buy > 0 && sell / buy >= 1.5) return true;

  const recent = history.slice(-3);
  const prior = history.slice(-10, -3);
  if (recent.length && prior.length) {
    const recentAvgPrice = recent.reduce((s, h) => s + h.average, 0) / recent.length;
    const priorAvgPrice = prior.reduce((s, h) => s + h.average, 0) / prior.length;

    if (priorAvgPrice > 0 && recentAvgPrice / priorAvgPrice >= 1.3) return true;
  }

  return false;
}
