const ESI_BASE = "https://esi.evetech.net/latest";

// The Forge (Jita) region ID
const JITA_REGION_ID = 10000002;

export interface Corporation {
  corporation_id: number;
  name: string;
  ticker: string;
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

// Long-lived in-memory cache for type info (names don't change often)
const typeInfoCache = new Map<number, TypeInfo>();

async function esiGet<T>(path: string, cacheable = false): Promise<T> {
  const url = `${ESI_BASE}${path}`;
  const init: RequestInit = cacheable
    ? { cache: "default" }
    : { cache: "no-store" };
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json" },
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

export async function searchCorporations(query: string): Promise<Corporation[]> {
  if (!query.trim()) return [];
  const results = await esiGet<{ corporation?: number[] }>(
    `/search/?categories=corporation&search=${encodeURIComponent(query)}&strict=false`,
    true,
  );
  const ids = results.corporation ?? [];
  if (ids.length === 0) return [];
  const limited = ids.slice(0, 20);
  const corps = await Promise.all(
    limited.map((id) =>
      esiGet<{ name: string; ticker: string }>(`/corporations/${id}/`, true).then((c) => ({
        corporation_id: id,
        name: c.name,
        ticker: c.ticker,
      })),
    ),
  );
  return corps.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getLpOffers(corporationId: number): Promise<LpOffer[]> {
  // LP store offers don't change often
  return esiGet<LpOffer[]>(`/loyalty/stores/${corporationId}/offers/`, true);
}

export async function getMarketOrders(typeId: number): Promise<MarketOrder[]> {
  // Market orders: always fresh
  return esiGetAllPages<MarketOrder>(
    `/markets/${JITA_REGION_ID}/orders/?type_id=${typeId}`,
    "&",
  );
}

export async function getMarketHistory(typeId: number): Promise<MarketHistoryEntry[]> {
  // History updates once a day — cacheable
  return esiGet<MarketHistoryEntry[]>(
    `/markets/${JITA_REGION_ID}/history/?type_id=${typeId}`,
    true,
  );
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

/** Highest buy order price */
export function bestBuyPrice(orders: MarketOrder[]): number | null {
  const prices = orders.filter((o) => o.is_buy_order).map((o) => o.price);
  return prices.length ? Math.max(...prices) : null;
}

/** Lowest sell order price */
export function bestSellPrice(orders: MarketOrder[]): number | null {
  const prices = orders.filter((o) => !o.is_buy_order).map((o) => o.price);
  return prices.length ? Math.min(...prices) : null;
}

/** Average daily volume over the last 30 days of market history */
export function avgDailyVolume(history: MarketHistoryEntry[]): number {
  const recent = history.slice(-30);
  if (!recent.length) return 0;
  return recent.reduce((s, h) => s + h.volume, 0) / recent.length;
}
