import {
  avgDailyVolume,
  bestBuyPrice,
  bestSellPrice,
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
  lpToIskBuy: number | null;
  lpToIskSell: number | null;
  totalRequiredIskCost: number;
  recommendationFactor: number;
}

const BATCH_SIZE = 10;

/** Assumed amount of LP a typical player wants to spend in one sitting. */
const TARGET_LP_BUDGET = 1_000_000;

/**
 * Rates an offer from 0 to 100, combining profitability (ISK/LP) with
 * liquidity (how quickly the resulting items could realistically be sold on
 * the market, assuming a player redeems the offer enough times to spend
 * around `TARGET_LP_BUDGET` LP).
 */
function computeRecommendationFactor(
  lpToIsk: number | null,
  lpCost: number,
  quantity: number,
  dailyVolume: number,
): number {
  if (lpToIsk === null || lpCost <= 0) return 0;

  // Profitability score: 0 ISK/LP or below -> 0, 1000+ ISK/LP -> 100.
  const profitScore = Math.max(0, Math.min(1, lpToIsk / 1000)) * 100;
  if (profitScore === 0) return 0;

  // Liquidity score: how many days of average volume it would take to sell
  // everything produced by spending TARGET_LP_BUDGET worth of LP on this offer.
  const exchangesForBudget = TARGET_LP_BUDGET / lpCost;
  const totalQuantityProduced = exchangesForBudget * quantity;
  const daysToSell = dailyVolume > 0 ? totalQuantityProduced / dailyVolume : Infinity;
  const liquidityMultiplier = daysToSell <= 1 ? 1 : 1 / Math.sqrt(daysToSell);

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

          const bestLpToIsk =
            lpToIskSell !== null && lpToIskBuy !== null
              ? Math.max(lpToIskSell, lpToIskBuy)
              : (lpToIskSell ?? lpToIskBuy);

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
            lpToIskBuy,
            lpToIskSell,
            totalRequiredIskCost: requiredIskCost,
            recommendationFactor: computeRecommendationFactor(
              bestLpToIsk,
              offer.lp_cost,
              offer.quantity,
              dailyVol,
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
