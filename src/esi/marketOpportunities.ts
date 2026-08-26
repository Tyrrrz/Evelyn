import type { MarketOrder } from "./client.ts";
import {
  getAllMarketOrders,
  getRouteJumps,
  getTypeInfoBatch,
  getTypeVolumeBatch,
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
  /** Weighted-average price actually received across the matched buy orders. */
  buyPrice: number;
  profitTotal: number;
  profitPerJump: number;
  profitPerM3: number | null;
}

/** Orders within this fraction of a price band's anchor price are considered the same "stock level". */
const STOCK_PRICE_DEVIATION = 0.05;

/** One or more orders at (near-)identical prices, at a single location, treated as one unit of stock. */
interface StockLevel {
  locationId: number;
  systemId: number;
  /** Underlying orders that make up this level, cheapest-to-take-first for sell / best-for-seller-first for buy. */
  orders: { price: number; quantity: number }[];
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
        orders: bandOrders.map((o) => ({ price: o.price, quantity: o.volume_remain })),
        totalQuantity: bandOrders.reduce((s, o) => s + o.volume_remain, 0),
      });
    }
  }

  return levels;
}

/**
 * Consumes up to `quantity` units from a stock level's constituent orders (in the order they're
 * listed — already best-price-first) and returns the quantity actually taken and the total ISK
 * involved (summed per-order price, not the level's average).
 */
function takeFromLevel(level: StockLevel, quantity: number): { quantity: number; total: number } {
  let remaining = quantity;
  let total = 0;
  let taken = 0;
  for (const order of level.orders) {
    if (remaining <= 0) break;
    const take = Math.min(order.quantity, remaining);
    total += take * order.price;
    taken += take;
    remaining -= take;
  }
  return { quantity: taken, total };
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
  buyPrice: number;
  profitTotal: number;
}[] {
  const results: {
    typeId: number;
    origin: { locationId: number; systemId: number };
    destination: { locationId: number; systemId: number };
    quantity: number;
    sellPrice: number;
    buyPrice: number;
    profitTotal: number;
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

      const profitTotal = sold.total - bought.total;
      if (profitTotal <= 0) continue;

      results.push({
        typeId,
        origin: { locationId: sellLevel.locationId, systemId: sellLevel.systemId },
        destination: { locationId: buyLevel.locationId, systemId: buyLevel.systemId },
        quantity: matchedQuantity,
        sellPrice: bought.total / matchedQuantity,
        buyPrice: sold.total / matchedQuantity,
        profitTotal,
      });
    }
  }

  return results;
}

/**
 * Finds profitable "buy low here, sell high there" opportunities across one or two regions: items
 * that can be bought from sell orders in one place and sold back to buy orders in another (in the
 * same region or a different one), taking into account that stock at nearly the same price (within
 * 5%) should be treated as a single tradeable level, while profit is still computed off each
 * order's own price rather than a blended average.
 */
export async function fetchMarketOpportunities(
  regionIds: number[],
  onProgress?: (stage: string, done: number, total: number) => void,
): Promise<MarketOpportunityRow[]> {
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
    buyPrice: number;
    profitTotal: number;
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
  for (let i = 0; i < systemPairs.length; i += 20) {
    const batch = systemPairs.slice(i, i + 20);
    await Promise.all(
      batch.map(async (pair) => {
        const jumps = await getRouteJumps(pair.origin, pair.destination);
        jumpsByPair.set(`${pair.origin}-${pair.destination}`, jumps);
      }),
    );
    routesDone += batch.length;
    onProgress?.("Resolving stations & routes", routesDone, systemPairs.length);
  }

  const volumesByType = await getTypeVolumeBatch([
    ...new Set(rawOpportunities.map((o) => o.typeId)),
  ]);

  const toLocation = (locationId: number, systemId: number): MarketLocation => ({
    locationId,
    systemId,
    isPlayerStructure: isPlayerStructure(locationId),
    name: stationNames.get(locationId) ?? null,
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
      buyPrice: o.buyPrice,
      profitTotal: o.profitTotal,
      profitPerJump: o.profitTotal / (jumps + 1),
      profitPerM3: volume > 0 ? o.profitTotal / (volume * o.quantity) : null,
    } satisfies MarketOpportunityRow;
  });
}
