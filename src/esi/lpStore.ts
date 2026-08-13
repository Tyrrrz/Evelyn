import {
  avgDailyVolume,
  bestBuyPrice,
  bestSellPrice,
  buyOrderDepth,
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
  buyOrderCount: number;
  buyOrderVolume: number;
  normalizedBuyOrderVolume: number;
  dailyVolume: number;
  normalizedDailyVolume: number;
  lpToIskBuy: number | null;
  lpToIskSell: number | null;
  totalRequiredIskCost: number;
  recommendationFactor: number;
}

const BATCH_SIZE = 10;

/**
 * Amount of LP that can be reliably liquidated in one go (i.e. via existing
 * buy orders within 5% of the best buy price, without waiting for the market
 * to refill) for an offer to be considered perfectly liquid.
 */
const TARGET_LP_LIQUIDATION = 200_000;

/**
 * Rates an offer from 0 to 100, combining profitability (ISK/LP when selling
 * instantly into buy orders) with reliable liquidity — how much LP worth of
 * the resulting items can actually be dumped into existing buy orders right
 * now, without relying on sell orders (which may never be filled) or on
 * average trading volume (which may take days to materialize).
 */
function computeRecommendationFactor(
  lpToIskBuy: number | null,
  lpCost: number,
  quantity: number,
  buyOrderVolume: number,
): number {
  if (lpToIskBuy === null || lpCost <= 0) return 0;

  // Profitability score: 0 ISK/LP or below -> 0, 1000+ ISK/LP -> 100.
  const profitScore = Math.max(0, Math.min(1, lpToIskBuy / 1000)) * 100;
  if (profitScore === 0) return 0;

  // Liquidity score: how much LP worth of exchanges can be reliably sold in
  // one go into the existing buy order book, scaled up to a full multiplier
  // once it reaches TARGET_LP_LIQUIDATION, with diminishing returns below that.
  const exchangesSellable = quantity > 0 ? buyOrderVolume / quantity : 0;
  const lpSellableInOneGo = exchangesSellable * lpCost;
  const liquidityMultiplier = Math.max(
    0,
    Math.min(1, Math.sqrt(lpSellableInOneGo / TARGET_LP_LIQUIDATION)),
  );

  return profitScore * liquidityMultiplier;
}

export async function fetchLpStoreRows(
  corporationId: number,
  onProgress?: (done: number, total: number) => void,
): Promise<LpStoreRow[]> {
  const offers = await getLpOffers(corporationId);

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
            getMarketOrders(offer.type_id),
            getMarketHistory(offer.type_id),
          ]);

          const buy = bestBuyPrice(orders);
          const sell = bestSellPrice(orders);
          const depth = buy !== null ? buyOrderDepth(orders, buy) : { orderCount: 0, volume: 0 };
          const dailyVol = avgDailyVolume(history);
          const normalizedDailyVol = offer.quantity > 0 ? dailyVol / offer.quantity : 0;

          // Required ISK cost = base ISK cost + required items at their sell price
          let requiredIskCost = offer.isk_cost;
          const reqItemMarkets = await Promise.all(
            offer.required_items.map(async (ri) => {
              const riOrders = await getMarketOrders(ri.type_id);
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
            buyOrderCount: depth.orderCount,
            buyOrderVolume: depth.volume,
            normalizedBuyOrderVolume: offer.quantity > 0 ? depth.volume / offer.quantity : 0,
            dailyVolume: dailyVol,
            normalizedDailyVolume: normalizedDailyVol,
            lpToIskBuy,
            lpToIskSell,
            totalRequiredIskCost: requiredIskCost,
            recommendationFactor: computeRecommendationFactor(
              lpToIskBuy,
              offer.lp_cost,
              offer.quantity,
              depth.volume,
            ),
          } satisfies LpStoreRow;
        } catch {
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
