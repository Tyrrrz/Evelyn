import { getBlueprintInfo, isBlueprintTypeName } from "./blueprints.ts";
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
  /** Name of the blueprint that must be manufactured to obtain `typeName`, if this offer's reward is a blueprint copy. */
  viaBlueprintName: string | null;
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

  // Resolve all directly-referenced type names first, so blueprint offers can be identified
  const baseTypeIds = new Set<number>();
  for (const offer of offers) {
    baseTypeIds.add(offer.type_id);
    for (const ri of offer.required_items) baseTypeIds.add(ri.type_id);
  }
  const baseTypeInfoMap = await getTypeInfoBatch([...baseTypeIds]);

  // Some LP offers reward a blueprint copy instead of an item outright. Those need to be
  // manufactured to yield something valuable, so look up their recipe (product + materials) —
  // the blueprint's materials are treated the same as an offer's other required items.
  const blueprintInfoByOfferTypeId = new Map<number, ReturnType<typeof getBlueprintInfo>>();
  for (const offer of offers) {
    if (!isBlueprintTypeName(baseTypeInfoMap.get(offer.type_id)?.name ?? "")) continue;
    blueprintInfoByOfferTypeId.set(offer.type_id, getBlueprintInfo(offer.type_id));
  }

  // Resolve names for any newly-discovered product/material types from blueprint recipes
  const extraTypeIds = new Set<number>();
  for (const info of blueprintInfoByOfferTypeId.values()) {
    if (!info) continue;
    extraTypeIds.add(info.productTypeId);
    for (const m of info.materials) extraTypeIds.add(m.typeId);
  }
  const extraTypeInfoMap = extraTypeIds.size
    ? await getTypeInfoBatch([...extraTypeIds])
    : new Map<number, { name: string; type_id: number }>();
  const typeInfoMap = new Map([...baseTypeInfoMap, ...extraTypeInfoMap]);

  const rows: LpStoreRow[] = [];
  let done = 0;

  for (let i = 0; i < offers.length; i += BATCH_SIZE) {
    const batch = offers.slice(i, i + BATCH_SIZE);
    const batchRows = await Promise.all(
      batch.map(async (offer) => {
        try {
          // If this offer's reward is a blueprint, value the item it manufactures instead of
          // the blueprint copy itself, scaled by how many units a single run produces. The
          // blueprint's materials are folded into the offer's required items, since they're
          // both just additional ISK costs incurred to complete the exchange.
          const blueprintInfo = blueprintInfoByOfferTypeId.get(offer.type_id) ?? null;
          const effectiveTypeId = blueprintInfo ? blueprintInfo.productTypeId : offer.type_id;
          const effectiveQuantity = blueprintInfo
            ? offer.quantity * blueprintInfo.productQuantity
            : offer.quantity;
          const effectiveRequiredItems = blueprintInfo
            ? [
                ...offer.required_items,
                ...blueprintInfo.materials.map((m) => ({
                  type_id: m.typeId,
                  quantity: m.quantity * offer.quantity,
                })),
              ]
            : offer.required_items;

          const [orders, history] = await Promise.all([
            getCachedMarketOrders(effectiveTypeId),
            getCachedMarketHistory(effectiveTypeId),
          ]);

          const buy = bestBuyPrice(orders);
          const sell = bestSellPrice(orders);
          const levels = buy !== null ? buyOrderLevels(orders, buy) : [];
          const dailyVol = avgDailyVolume(history);
          const normalizedDailyVol = effectiveQuantity > 0 ? dailyVol / effectiveQuantity : 0;
          const dailyLpVolume = offer.lp_cost > 0 ? normalizedDailyVol * offer.lp_cost : null;

          // Required ISK cost = base ISK cost + required items (and blueprint materials, if any)
          // at their sell price
          let requiredIskCost = offer.isk_cost;
          const reqItemMarkets = await Promise.all(
            effectiveRequiredItems.map(async (ri) => {
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

          const buyRevenue = buy !== null ? buy * effectiveQuantity : null;
          const sellRevenue = sell !== null ? sell * effectiveQuantity : null;

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
            effectiveQuantity,
            requiredIskCost,
          );

          return {
            offerId: offer.offer_id,
            typeName: typeInfoMap.get(effectiveTypeId)?.name ?? `Type ${effectiveTypeId}`,
            typeId: effectiveTypeId,
            lpCost: offer.lp_cost,
            iskCost: offer.isk_cost,
            requiredItems: effectiveRequiredItems.map((ri) => ({
              typeId: ri.type_id,
              typeName: typeInfoMap.get(ri.type_id)?.name ?? `Type ${ri.type_id}`,
              quantity: ri.quantity,
            })),
            quantity: effectiveQuantity,
            viaBlueprintName: blueprintInfo
              ? (typeInfoMap.get(offer.type_id)?.name ?? `Type ${offer.type_id}`)
              : null,
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
