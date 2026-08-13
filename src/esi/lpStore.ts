import {
  avgDailyVolume,
  bestBuyPrice,
  bestSellPrice,
  buyOrderLevels,
  getLpOffers,
  getMarketHistory,
  getMarketOrders,
  getTypeInfoBatch,
} from "./client.ts";

export interface LpStoreRow {
  offerId: number;
  typeName: string;
  typeId: number;
  lpCost: number;
  iskCost: number;
  requiredItems: { typeId: number; typeName: string; quantity: number }[];
  quantity: number;
  bestBuy: number | null;
  bestSell: number | null;
  dailyVolume: number;
  normalizedDailyVolume: number;
  dailyLpVolume: number | null;
  lpToIskBuy: number | null;
  lpToIskSell: number | null;
  totalRequiredIskCost: number;
  immediateLiquidityLp: number;
  immediateLiquidityIsk: number;
}

const BATCH_SIZE = 10;

function memoizeByTypeId<T>(
  fetcher: (typeId: number) => Promise<T>,
): (typeId: number) => Promise<T> {
  const cache = new Map<number, Promise<T>>();

  return (typeId) => {
    const cached = cache.get(typeId);
    if (cached) return cached;

    const result = fetcher(typeId);
    cache.set(typeId, result);
    return result;
  };
}

/**
 * Computes how much LP (and the resulting net ISK) can be immediately
 * liquidated by selling into the existing buy order book — walking the buy
 * orders within 5% of the best buy price from highest to lowest, filling
 * only whole exchanges (since partial exchanges can't be redeemed).
 */
function computeImmediateLiquidity(
  levels: { price: number; volume: number }[],
  lpCost: number,
  quantity: number,
  requiredIskCostPerExchange: number,
): { lp: number; isk: number } {
  if (lpCost <= 0 || quantity <= 0) return { lp: 0, isk: 0 };

  const totalVolume = levels.reduce((s, l) => s + l.volume, 0);
  const exchanges = Math.floor(totalVolume / quantity);
  if (exchanges <= 0) return { lp: 0, isk: 0 };

  let itemsRemaining = exchanges * quantity;
  let grossIsk = 0;
  for (const level of levels) {
    if (itemsRemaining <= 0) break;
    const itemsTaken = Math.min(level.volume, itemsRemaining);
    grossIsk += itemsTaken * level.price;
    itemsRemaining -= itemsTaken;
  }

  const netIsk = grossIsk - exchanges * requiredIskCostPerExchange;
  return { lp: exchanges * lpCost, isk: netIsk };
}

export async function fetchLpStoreRows(
  corporationId: number,
  onProgress?: (done: number, total: number) => void,
): Promise<LpStoreRow[]> {
  const offers = await getLpOffers(corporationId);
  const getCachedMarketOrders = memoizeByTypeId(getMarketOrders);
  const getCachedMarketHistory = memoizeByTypeId(getMarketHistory);

  // Resolve all type names in parallel
  const allTypeIds = new Set<number>();
  for (const offer of offers) {
    allTypeIds.add(offer.type_id);
    for (const ri of offer.required_items) allTypeIds.add(ri.type_id);
  }
  const typeInfoMap = await getTypeInfoBatch([...allTypeIds]);

  const rows: LpStoreRow[] = [];
  let done = 0;

  for (let i = 0; i < offers.length; i += BATCH_SIZE) {
    const batch = offers.slice(i, i + BATCH_SIZE);
    const batchRows = await Promise.all(
      batch.map(async (offer) => {
        try {
          const [orders, history] = await Promise.all([
            getCachedMarketOrders(offer.type_id),
            getCachedMarketHistory(offer.type_id),
          ]);

          const buy = bestBuyPrice(orders);
          const sell = bestSellPrice(orders);
          const levels = buy !== null ? buyOrderLevels(orders, buy) : [];
          const dailyVol = avgDailyVolume(history);
          const normalizedDailyVol = offer.quantity > 0 ? dailyVol / offer.quantity : 0;
          const dailyLpVolume = offer.lp_cost > 0 ? normalizedDailyVol * offer.lp_cost : null;

          // Required ISK cost = base ISK cost + required items at their sell price
          let requiredIskCost = offer.isk_cost;
          const reqItemMarkets = await Promise.all(
            offer.required_items.map(async (ri) => {
              const riOrders = await getCachedMarketOrders(ri.type_id);
              return {
                type_id: ri.type_id,
                quantity: ri.quantity,
                sellPrice: bestSellPrice(riOrders),
              };
            }),
          );
          for (const ri of reqItemMarkets) {
            if (ri.sellPrice !== null) requiredIskCost += ri.sellPrice * ri.quantity;
          }

          const buyRevenue = buy !== null ? buy * offer.quantity : null;
          const sellRevenue = sell !== null ? sell * offer.quantity : null;

          const lpToIskBuy =
            buyRevenue !== null && offer.lp_cost > 0
              ? (buyRevenue - requiredIskCost) / offer.lp_cost
              : null;
          const lpToIskSell =
            sellRevenue !== null && offer.lp_cost > 0
              ? (sellRevenue - requiredIskCost) / offer.lp_cost
              : null;

          const immediateLiquidity = computeImmediateLiquidity(
            levels,
            offer.lp_cost,
            offer.quantity,
            requiredIskCost,
          );

          return {
            offerId: offer.offer_id,
            typeName: typeInfoMap.get(offer.type_id)?.name ?? `Type ${offer.type_id}`,
            typeId: offer.type_id,
            lpCost: offer.lp_cost,
            iskCost: offer.isk_cost,
            requiredItems: offer.required_items.map((ri) => ({
              typeId: ri.type_id,
              typeName: typeInfoMap.get(ri.type_id)?.name ?? `Type ${ri.type_id}`,
              quantity: ri.quantity,
            })),
            quantity: offer.quantity,
            bestBuy: buy,
            bestSell: sell,
            dailyVolume: dailyVol,
            normalizedDailyVolume: normalizedDailyVol,
            dailyLpVolume,
            lpToIskBuy,
            lpToIskSell,
            totalRequiredIskCost: requiredIskCost,
            immediateLiquidityLp: immediateLiquidity.lp,
            immediateLiquidityIsk: immediateLiquidity.isk,
          } satisfies LpStoreRow;
        } catch (e) {
          console.error("Failed to process LP offer", offer.offer_id, "type", offer.type_id, e);
          return null;
        }
      }),
    );

    done += batch.length;
    onProgress?.(done, offers.length);
    rows.push(...(batchRows.filter(Boolean) as LpStoreRow[]));
  }

  return rows;
}
