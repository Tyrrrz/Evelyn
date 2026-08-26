import type { MarketOrder } from "./client.ts";
import {
  getAllMarketOrders,
  getRouteJumps,
  getSystemSecurityBatch,
  getTypeInfoBatch,
  getTypeVolumeBatch,
  isNpcOrder,
  isPlayerStructure,
  resolveStationNames,
} from "./client.ts";

/** A place items can be bought/sold from (an NPC station or a player-owned structure). */
export interface MarketLocation {
  locationId: number;
  systemId: number;
  /** `null` for player-owned structures, whose names ESI won't resolve without a docking token. */
  name: string | null;
  isPlayerStructure: boolean;
  securityStatus: number;
}

export interface MarketOpportunityRow {
  typeId: number;
  typeName: string;
  origin: MarketLocation;
  destination: MarketLocation;
  jumps: number;
  /** Quantity actually tradeable at this origin/destination price pairing. */
  quantity: number;
  /** Weighted-average price actually paid across the matched sell orders. */
  sellPrice: number;
  /** Whether (any of) the matched sell orders were NPC-seeded rather than player-placed. */
  sellIsNpc: boolean;
  /** Weighted-average price actually received across the matched buy orders. */
  buyPrice: number;
  /** Whether (any of) the matched buy orders were NPC-seeded rather than player-placed. */
  buyIsNpc: boolean;
  /** Profit after sales tax is deducted from the buy-side (destination) proceeds. */
  profitTotal: number;
  profitPerJump: number;
  profitPerM3: number | null;
}

/**
 * Sales tax rates by Accounting skill level (0-5), deducted from the proceeds of selling into a
 * buy order (or having a sell order filled). Level 5 (the maximum) is assumed by default.
 */
export const ACCOUNTING_TAX_RATES = [0.075, 0.0668, 0.0585, 0.0503, 0.042, 0.0337] as const;

export const DEFAULT_ACCOUNTING_SKILL_LEVEL = 5;

/** Opportunities whose after-tax profit is this fraction (or less) of the sell price are noise. */
const MIN_PROFIT_TO_SELL_PRICE_RATIO = 0.1;

/** Orders within this fraction of a price band's anchor price are considered the same "stock level". */
const STOCK_PRICE_DEVIATION = 0.05;

/** One or more orders at (near-)identical prices, at a single location, treated as one unit of stock. */
interface StockLevel {
  locationId: number;
  systemId: number;
  /** Underlying orders that make up this level, cheapest-to-take-first for sell / best-for-seller-first for buy. */
  orders: { price: number; quantity: number; isNpc: boolean }[];
  totalQuantity: number;
}

/**
 * Groups same-side orders at a location into price "stock levels": orders within
 * {@link STOCK_PRICE_DEVIATION} of the level's anchor (best) price are pooled into a single level
 * whose quantity is their combined volume, while each order's own price is preserved so profit can
 * be computed precisely rather than off a blended average.
 */
function buildStockLevels(orders: MarketOrder[], isBuySide: boolean): StockLevel[] {
  const byLocation = new Map<number, MarketOrder[]>();
  for (const order of orders) {
    const list = byLocation.get(order.location_id);
    if (list) list.push(order);
    else byLocation.set(order.location_id, [order]);
  }

  const levels: StockLevel[] = [];
  for (const [locationId, locationOrders] of byLocation) {
    // Sell orders: cheapest first (best for a buyer). Buy orders: highest first (best for a seller).
    const sorted = [...locationOrders].sort((a, b) =>
      isBuySide ? b.price - a.price : a.price - b.price,
    );

    let i = 0;
    while (i < sorted.length) {
      const anchorPrice = sorted[i]!.price;
      const bandOrders: MarketOrder[] = [];
      while (
        i < sorted.length &&
        (isBuySide
          ? sorted[i]!.price >= anchorPrice * (1 - STOCK_PRICE_DEVIATION)
          : sorted[i]!.price <= anchorPrice * (1 + STOCK_PRICE_DEVIATION))
      ) {
        bandOrders.push(sorted[i]!);
        i++;
      }

      levels.push({
        locationId,
        systemId: bandOrders[0]!.system_id,
        orders: bandOrders.map((o) => ({
          price: o.price,
          quantity: o.volume_remain,
          isNpc: isNpcOrder(o),
        })),
        totalQuantity: bandOrders.reduce((s, o) => s + o.volume_remain, 0),
      });
    }
  }

  return levels;
}

/**
 * Consumes up to `quantity` units from a stock level's constituent orders (in the order they're
 * listed — already best-price-first) and returns the quantity actually taken, the total ISK
 * involved (summed per-order price, not the level's average), and whether any consumed order was
 * NPC-seeded.
 */
function takeFromLevel(
  level: StockLevel,
  quantity: number,
): { quantity: number; total: number; isNpc: boolean } {
  let remaining = quantity;
  let total = 0;
  let taken = 0;
  let isNpc = false;
  for (const order of level.orders) {
    if (remaining <= 0) break;
    const take = Math.min(order.quantity, remaining);
    if (take > 0 && order.isNpc) isNpc = true;
    total += take * order.price;
    taken += take;
    remaining -= take;
  }
  return { quantity: taken, total, isNpc };
}

/** Builds every profitable (sell level, buy level) pairing for a single item type. */
function buildOpportunities(
  typeId: number,
  sellLevels: StockLevel[],
  buyLevels: StockLevel[],
): {
  typeId: number;
  origin: { locationId: number; systemId: number };
  destination: { locationId: number; systemId: number };
  quantity: number;
  sellPrice: number;
  sellIsNpc: boolean;
  buyPrice: number;
  buyIsNpc: boolean;
}[] {
  const results: {
    typeId: number;
    origin: { locationId: number; systemId: number };
    destination: { locationId: number; systemId: number };
    quantity: number;
    sellPrice: number;
    sellIsNpc: boolean;
    buyPrice: number;
    buyIsNpc: boolean;
  }[] = [];

  for (const sellLevel of sellLevels) {
    // A level's own weighted-average price is a reasonable band anchor for the "is this even
    // profitable" pre-check; the actual profit is computed per matched order below regardless.
    const sellAvgPrice =
      sellLevel.orders.reduce((s, o) => s + o.price * o.quantity, 0) / sellLevel.totalQuantity;

    for (const buyLevel of buyLevels) {
      // Same station, same price band pair — not a real trade.
      if (sellLevel.locationId === buyLevel.locationId) continue;

      const buyAvgPrice =
        buyLevel.orders.reduce((s, o) => s + o.price * o.quantity, 0) / buyLevel.totalQuantity;
      if (buyAvgPrice <= sellAvgPrice) continue;

      const quantity = Math.min(sellLevel.totalQuantity, buyLevel.totalQuantity);
      if (quantity <= 0) continue;

      const bought = takeFromLevel(sellLevel, quantity);
      const sold = takeFromLevel(buyLevel, quantity);
      const matchedQuantity = Math.min(bought.quantity, sold.quantity);
      if (matchedQuantity <= 0) continue;

      // Pre-tax profit is a cheap necessary (but not sufficient) condition for post-tax
      // profitability; the definitive after-tax filtering happens in computeMarketOpportunityRows.
      if (sold.total - bought.total <= 0) continue;

      results.push({
        typeId,
        origin: { locationId: sellLevel.locationId, systemId: sellLevel.systemId },
        destination: { locationId: buyLevel.locationId, systemId: buyLevel.systemId },
        quantity: matchedQuantity,
        sellPrice: bought.total / matchedQuantity,
        sellIsNpc: bought.isNpc,
        buyPrice: sold.total / matchedQuantity,
        buyIsNpc: sold.isNpc,
      });
    }
  }

  return results;
}

/** Intermediate result of a region scan, before sales tax is applied and rows are finalized. */
export interface RawMarketOpportunity {
  typeId: number;
  typeName: string;
  origin: MarketLocation;
  destination: MarketLocation;
  jumps: number;
  quantity: number;
  sellPrice: number;
  sellIsNpc: boolean;
  buyPrice: number;
  buyIsNpc: boolean;
  volume: number;
}

/**
 * Finds every "buy low here, sell high there" candidate across one or two regions: items that can
 * be bought from sell orders in one place and sold back to buy orders in another (in the same
 * region or a different one), taking into account that stock at nearly the same price (within 5%)
 * should be treated as a single tradeable level, while profit is still computed off each order's
 * own price rather than a blended average. Sales tax is not applied yet — see
 * {@link computeMarketOpportunityRows} for the final, tax-aware, deduplicated row list.
 */
export async function fetchRawMarketOpportunities(
  regionIds: number[],
  onProgress?: (stage: string, done: number, total: number) => void,
): Promise<RawMarketOpportunity[]> {
  const uniqueRegionIds = [...new Set(regionIds)];

  onProgress?.("Fetching market orders", 0, uniqueRegionIds.length);
  const ordersByRegion = await Promise.all(
    uniqueRegionIds.map(async (regionId, i) => {
      const orders = await getAllMarketOrders(regionId);
      onProgress?.("Fetching market orders", i + 1, uniqueRegionIds.length);
      return orders;
    }),
  );
  const allOrders = ordersByRegion.flat();

  const ordersByType = new Map<number, MarketOrder[]>();
  for (const order of allOrders) {
    const list = ordersByType.get(order.type_id);
    if (list) list.push(order);
    else ordersByType.set(order.type_id, [order]);
  }

  onProgress?.("Finding opportunities", 0, ordersByType.size);
  const rawOpportunities: {
    typeId: number;
    origin: { locationId: number; systemId: number };
    destination: { locationId: number; systemId: number };
    quantity: number;
    sellPrice: number;
    sellIsNpc: boolean;
    buyPrice: number;
    buyIsNpc: boolean;
  }[] = [];
  let done = 0;
  for (const [typeId, orders] of ordersByType) {
    const sellOrders = orders.filter((o) => !o.is_buy_order);
    const buyOrders = orders.filter((o) => o.is_buy_order);
    if (sellOrders.length && buyOrders.length) {
      const sellLevels = buildStockLevels(sellOrders, false);
      const buyLevels = buildStockLevels(buyOrders, true);
      rawOpportunities.push(...buildOpportunities(typeId, sellLevels, buyLevels));
    }
    done++;
    if (done % 200 === 0) onProgress?.("Finding opportunities", done, ordersByType.size);
  }
  onProgress?.("Finding opportunities", ordersByType.size, ordersByType.size);

  if (rawOpportunities.length === 0) return [];

  const locationIds = [
    ...new Set(rawOpportunities.flatMap((o) => [o.origin.locationId, o.destination.locationId])),
  ];
  const stationIds = locationIds.filter((id) => !isPlayerStructure(id));

  onProgress?.("Resolving stations & routes", 0, 1);
  const [stationNames, typeInfos] = await Promise.all([
    resolveStationNames(stationIds),
    getTypeInfoBatch([...new Set(rawOpportunities.map((o) => o.typeId))]),
  ]);

  const systemPairs = [
    ...new Map(
      rawOpportunities.map((o) => [
        `${o.origin.systemId}-${o.destination.systemId}`,
        { origin: o.origin.systemId, destination: o.destination.systemId },
      ]),
    ).values(),
  ];
  const jumpsByPair = new Map<string, number>();
  let routesDone = 0;
  const ROUTE_BATCH_SIZE = 5;
  for (let i = 0; i < systemPairs.length; i += ROUTE_BATCH_SIZE) {
    const batch = systemPairs.slice(i, i + ROUTE_BATCH_SIZE);
    await Promise.all(
      batch.map(async (pair) => {
        const jumps = await getRouteJumps(pair.origin, pair.destination);
        jumpsByPair.set(`${pair.origin}-${pair.destination}`, jumps);
      }),
    );
    routesDone += batch.length;
    onProgress?.("Resolving stations & routes", routesDone, systemPairs.length);
  }

  const systemIds = [
    ...new Set(rawOpportunities.flatMap((o) => [o.origin.systemId, o.destination.systemId])),
  ];
  const [volumesByType, securityBySystem] = await Promise.all([
    getTypeVolumeBatch([...new Set(rawOpportunities.map((o) => o.typeId))]),
    getSystemSecurityBatch(systemIds),
  ]);

  const toLocation = (locationId: number, systemId: number): MarketLocation => ({
    locationId,
    systemId,
    isPlayerStructure: isPlayerStructure(locationId),
    name: stationNames.get(locationId) ?? null,
    securityStatus: securityBySystem.get(systemId) ?? 0,
  });

  return rawOpportunities.map((o) => {
    const volume = volumesByType.get(o.typeId) ?? 0;
    const jumps = jumpsByPair.get(`${o.origin.systemId}-${o.destination.systemId}`) ?? 0;
    return {
      typeId: o.typeId,
      typeName: typeInfos.get(o.typeId)?.name ?? `Type #${o.typeId}`,
      origin: toLocation(o.origin.locationId, o.origin.systemId),
      destination: toLocation(o.destination.locationId, o.destination.systemId),
      jumps,
      quantity: o.quantity,
      sellPrice: o.sellPrice,
      sellIsNpc: o.sellIsNpc,
      buyPrice: o.buyPrice,
      buyIsNpc: o.buyIsNpc,
      volume,
    } satisfies RawMarketOpportunity;
  });
}

/**
 * Applies sales tax to raw opportunities, filters out ones that aren't (meaningfully) profitable
 * after tax, keeps only the single best opportunity per item, and sorts the result by profit. Pure
 * and synchronous — safe to recompute on every render when only the tax rate changes, without
 * re-fetching from ESI.
 */
export function computeMarketOpportunityRows(
  raw: RawMarketOpportunity[],
  taxRate: number,
  includeNpcToNpc = true,
): MarketOpportunityRow[] {
  const rows: MarketOpportunityRow[] = [];

  for (const o of raw) {
    if (!includeNpcToNpc && o.sellIsNpc && o.buyIsNpc) continue;

    const sellTotal = o.sellPrice * o.quantity;
    const buyTotal = o.buyPrice * o.quantity;
    const profitTotal = buyTotal * (1 - taxRate) - sellTotal;
    if (profitTotal <= 0) continue;
    if (profitTotal <= MIN_PROFIT_TO_SELL_PRICE_RATIO * sellTotal) continue;

    rows.push({
      typeId: o.typeId,
      typeName: o.typeName,
      origin: o.origin,
      destination: o.destination,
      jumps: o.jumps,
      quantity: o.quantity,
      sellPrice: o.sellPrice,
      sellIsNpc: o.sellIsNpc,
      buyPrice: o.buyPrice,
      buyIsNpc: o.buyIsNpc,
      profitTotal,
      profitPerJump: profitTotal / (o.jumps + 1),
      profitPerM3: o.volume > 0 ? profitTotal / (o.volume * o.quantity) : null,
    });
  }

  const bestByType = new Map<number, MarketOpportunityRow>();
  for (const row of rows) {
    const best = bestByType.get(row.typeId);
    if (!best || compareOpportunityRows(row, best) < 0) bestByType.set(row.typeId, row);
  }

  return [...bestByType.values()].sort(compareOpportunityRows);
}

/** Orders rows by profit total, then profit per jump, then profit per m³ (all descending). */
function compareOpportunityRows(a: MarketOpportunityRow, b: MarketOpportunityRow): number {
  if (a.profitTotal !== b.profitTotal) return b.profitTotal - a.profitTotal;
  if (a.profitPerJump !== b.profitPerJump) return b.profitPerJump - a.profitPerJump;
  const aPerM3 = a.profitPerM3 ?? -Infinity;
  const bPerM3 = b.profitPerM3 ?? -Infinity;
  return bPerM3 - aPerM3;
}
