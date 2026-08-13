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

async function esiGet<T>(path: string): Promise<T> {
  const url = `${ESI_BASE}${path}`;
  const res = await fetch(url, {
    next: { revalidate: 300 },
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`ESI request failed: ${url} -> ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function esiGetAllPages<T>(
  path: string,
  separator = "?"
): Promise<T[]> {
  const firstUrl = `${ESI_BASE}${path}`;
  const res = await fetch(firstUrl, {
    next: { revalidate: 300 },
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`ESI request failed: ${firstUrl} -> ${res.status}`);
  }
  const totalPages = parseInt(res.headers.get("X-Pages") ?? "1", 10);
  const firstPage = (await res.json()) as T[];

  if (totalPages <= 1) return firstPage;

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      esiGet<T[]>(`${path}${separator}page=${i + 2}`)
    )
  );
  return firstPage.concat(...rest);
}

export async function searchCorporations(query: string): Promise<Corporation[]> {
  if (!query.trim()) return [];
  const results = await esiGet<{ corporation?: number[] }>(
    `/search/?categories=corporation&search=${encodeURIComponent(query)}&strict=false`
  );
  const ids = results.corporation ?? [];
  if (ids.length === 0) return [];
  const limit = ids.slice(0, 20);
  const corps = await Promise.all(
    limit.map((id) =>
      esiGet<{ name: string; ticker: string }>(
        `/corporations/${id}/`
      ).then((c) => ({ corporation_id: id, name: c.name, ticker: c.ticker }))
    )
  );
  return corps.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getLpOffers(corporationId: number): Promise<LpOffer[]> {
  return esiGet<LpOffer[]>(`/loyalty/stores/${corporationId}/offers/`);
}

export async function getMarketOrders(typeId: number): Promise<MarketOrder[]> {
  return esiGetAllPages<MarketOrder>(
    `/markets/${JITA_REGION_ID}/orders/?type_id=${typeId}`,
    "&"
  );
}

export async function getMarketHistory(
  typeId: number
): Promise<MarketHistoryEntry[]> {
  return esiGet<MarketHistoryEntry[]>(
    `/markets/${JITA_REGION_ID}/history/?type_id=${typeId}`
  );
}

export async function getTypeInfo(typeId: number): Promise<TypeInfo> {
  const t = await esiGet<{ name: string }>(`/universe/types/${typeId}/`);
  return { type_id: typeId, name: t.name };
}

export async function getTypeInfoBatch(
  typeIds: number[]
): Promise<Map<number, TypeInfo>> {
  const unique = [...new Set(typeIds)];
  const results = await Promise.all(unique.map((id) => getTypeInfo(id)));
  return new Map(results.map((t) => [t.type_id, t]));
}

/** Compute best buy price (highest buy order) */
export function bestBuyPrice(orders: MarketOrder[]): number | null {
  const buys = orders.filter((o) => o.is_buy_order).map((o) => o.price);
  return buys.length ? Math.max(...buys) : null;
}

/** Compute best sell price (lowest sell order) */
export function bestSellPrice(orders: MarketOrder[]): number | null {
  const sells = orders.filter((o) => !o.is_buy_order).map((o) => o.price);
  return sells.length ? Math.min(...sells) : null;
}

/** Average daily volume over the last 30 days */
export function avgDailyVolume(history: MarketHistoryEntry[]): number {
  const recent = history.slice(-30);
  if (recent.length === 0) return 0;
  const total = recent.reduce((s, h) => s + h.volume, 0);
  return total / recent.length;
}
