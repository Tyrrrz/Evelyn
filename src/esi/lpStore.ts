import {
  avgDailyVolume,
  bestBuyPrice,
  bestSellPrice,
  buyOrderLevels,
  getBlueprintInfo,
  getLpOffers,
  getMarketHistory,
  getMarketOrders,
  getTypeInfoBatch,
  isBlueprintTypeName,
} from "./client.ts";

export interface LpStoreRow {
  offerId: number;
  typeName: string;
  typeId: number;
  lpCost: number;
  iskCost: number;
  /** Items the corporation requires directly, in addition to LP (and ISK, if any). */
  requiredItems: { typeId: number; typeName: string; quantity: number }[];
  /** Materials needed to manufacture `typeName`, if this offer's reward is a blueprint copy. */
  blueprintMaterials: { typeId: number; typeName: string; quantity: number }[];
  quantity: number;
  bestBuy: number | null;
  bestSell: number | null;
  dailyVolume: number;
  normalizedDailyVolume: number;
  dailyLpVolume: number | null;
  lpToIskBuy: number | null;
  lpToIskSell: number | null;
  totalRequiredIskCost: number;
  /** ISK cost (at sell price) of the offer's directly-required items, if any. */
  requiredItemsIskCost: number;
  /** ISK cost (at sell price) of the blueprint's materials, if any. */
  blueprintMaterialsIskCost: number;
  immediateLiquidityLp: number;
  immediateLiquidityIsk: number;
  /** Heuristic 0-3 rating of the offer's economics — see {@link computeRating}. */
  rating: number;
  /**
   * Continuous, sortable score behind {@link rating}. The integer part always matches
   * `rating` (so sorting respects star-tier boundaries first), while the fractional part
   * ranks the offer against the other offers in the same batch — see {@link computeRatingScores}.
   */
  ratingScore: number;
}

const BATCH_SIZE = 10;

// Thresholds for the heuristic 0-3 star rating (see `computeRating`). "Volume" is the
// daily sell-side market volume, in LP terms (ongoing liquidity, but requires
// holding/relisting the item); "liquidity" is how much LP can be sold right now into the
// existing buy-order book (immediate, but capped by depth).
const RATING_3_BUY_ISK_PER_LP = 1000;
const RATING_2_BUY_ISK_PER_LP = 900;
const RATING_1_BUY_ISK_PER_LP = 700;
const VOLUME_LP_THRESHOLD = 500_000;
const LIQUIDITY_LP_THRESHOLD = 300_000;

/** How much LP can be liquidated right now, or 0 if the offer isn't liquid at all (see `rating`). */
function effectiveLiquidityLp(row: {
  lpCost: number;
  immediateLiquidityLp: number;
  immediateLiquidityIsk: number;
}): number {
  return row.lpCost > 0 && row.immediateLiquidityIsk > 0 ? row.immediateLiquidityLp : 0;
}

/**
 * Heuristically rates an offer's economics from 0 to 3 stars:
 * - 3 stars: buy price above 1000 ISK/LP, volume above 500k LP AND liquidity above 300k LP
 * - 2 stars: buy price above 900 ISK/LP, volume above 500k LP OR liquidity above 300k LP
 * - 1 star: buy price above 700 ISK/LP, volume above 500k LP OR liquidity above 300k LP
 * - 0 stars: everything else
 */
function computeRating(row: {
  lpCost: number;
  lpToIskBuy: number | null;
  immediateLiquidityLp: number;
  immediateLiquidityIsk: number;
  dailyLpVolume: number | null;
}): number {
  const liquidityLp = effectiveLiquidityLp(row);

  const hasVolume = row.dailyLpVolume !== null && row.dailyLpVolume > VOLUME_LP_THRESHOLD;
  const hasLiquidity = liquidityLp > LIQUIDITY_LP_THRESHOLD;

  if (row.lpToIskBuy === null) return 0;
  if (row.lpToIskBuy > RATING_3_BUY_ISK_PER_LP && hasVolume && hasLiquidity) return 3;
  if (row.lpToIskBuy > RATING_2_BUY_ISK_PER_LP && (hasVolume || hasLiquidity)) return 2;
  if (row.lpToIskBuy > RATING_1_BUY_ISK_PER_LP && (hasVolume || hasLiquidity)) return 1;
  return 0;
}

/**
 * Ranks each value's position among its peers, as a fraction from 0 (worst) to 1 (best).
 * `null` is treated as the worst possible value. Equal values (including groups of `null`)
 * share the same (average) rank, so e.g. if every offer has no buy orders, they all rank 0.
 */
function relativeRanks(values: (number | null)[]): number[] {
  const n = values.length;
  if (n <= 1) return values.map(() => 0.5);

  const indices = values.map((_, i) => i);
  indices.sort((a, b) => {
    const av = values[a];
    const bv = values[b];
    if (av === bv) return 0;
    if (av === null) return -1;
    if (bv === null) return 1;
    return av - bv;
  });

  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[indices[j + 1]] === values[indices[i]]) j++;
    const averageRank = (i + j) / 2 / (n - 1);
    for (let k = i; k <= j; k++) ranks[indices[k]] = averageRank;
    i = j + 1;
  }
  return ranks;
}

/**
 * Computes the continuous {@link LpStoreRow.ratingScore} for each row: the integer part is
 * always the row's absolute star `rating`, so sorting respects tier boundaries first; the
 * fractional part ranks the row's buy price, volume and liquidity against the other rows
 * passed in (i.e. relative to the current corporation's offers), breaking ties within a tier
 * so that, say, the "best" 3-star offers of a corp with mostly 3-star offers sort above the
 * rest, while a corp whose offers are all mediocre still spreads them out sensibly.
 */
function computeRatingScores(
  rows: {
    rating: number;
    lpToIskBuy: number | null;
    dailyLpVolume: number | null;
    lpCost: number;
    immediateLiquidityLp: number;
    immediateLiquidityIsk: number;
  }[],
): number[] {
  const buyRanks = relativeRanks(rows.map((r) => r.lpToIskBuy));
  const volumeRanks = relativeRanks(rows.map((r) => r.dailyLpVolume));
  const liquidityRanks = relativeRanks(rows.map((r) => effectiveLiquidityLp(r)));

  return rows.map((r, i) => {
    const relativeScore = (buyRanks[i] + volumeRanks[i] + liquidityRanks[i]) / 3;
    // Scaled to less than 1 so it never crosses into an adjacent star tier.
    return r.rating + relativeScore * 0.999;
  });
}

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
  regionId: number,
  includeBlueprints: boolean,
  onProgress?: (done: number, total: number) => void,
): Promise<LpStoreRow[]> {
  const allOffers = await getLpOffers(corporationId);
  const getCachedMarketOrders = memoizeByTypeId((typeId) => getMarketOrders(typeId, regionId));
  const getCachedMarketHistory = memoizeByTypeId((typeId) => getMarketHistory(typeId, regionId));

  // Resolve all directly-referenced type names first, so blueprint offers can be identified
  const baseTypeIds = new Set<number>();
  for (const offer of allOffers) {
    baseTypeIds.add(offer.type_id);
    for (const ri of offer.required_items) baseTypeIds.add(ri.type_id);
  }
  const baseTypeInfoMap = await getTypeInfoBatch([...baseTypeIds]);

  // When blueprints are excluded, drop their offers upfront so no time is wasted resolving
  // their recipes or fetching market data for their (often numerous) materials.
  const offers = includeBlueprints
    ? allOffers
    : allOffers.filter((o) => !isBlueprintTypeName(baseTypeInfoMap.get(o.type_id)?.name ?? ""));

  // Some LP offers reward a blueprint copy instead of an item outright. Those need to be
  // manufactured to yield something valuable, so look up their recipe (product + materials).
  const blueprintInfoByOfferTypeId = new Map<number, ReturnType<typeof getBlueprintInfo>>();
  if (includeBlueprints) {
    for (const offer of offers) {
      if (!isBlueprintTypeName(baseTypeInfoMap.get(offer.type_id)?.name ?? "")) continue;
      blueprintInfoByOfferTypeId.set(offer.type_id, getBlueprintInfo(offer.type_id));
    }
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

  const rows: Omit<LpStoreRow, "ratingScore">[] = [];
  let done = 0;

  for (let i = 0; i < offers.length; i += BATCH_SIZE) {
    const batch = offers.slice(i, i + BATCH_SIZE);
    const batchRows = await Promise.all(
      batch.map(async (offer) => {
        try {
          // If this offer's reward is a blueprint, value the item it manufactures instead of
          // the blueprint copy itself, scaled by how many units a single run produces.
          const blueprintInfo = blueprintInfoByOfferTypeId.get(offer.type_id) ?? null;
          const effectiveTypeId = blueprintInfo ? blueprintInfo.productTypeId : offer.type_id;
          const effectiveQuantity = blueprintInfo
            ? offer.quantity * blueprintInfo.productQuantity
            : offer.quantity;
          const blueprintMaterials = blueprintInfo
            ? blueprintInfo.materials.map((m) => ({
                type_id: m.typeId,
                quantity: m.quantity * offer.quantity,
              }))
            : [];
          // Blueprint materials are folded in alongside the offer's required items for the
          // purposes of computing total ISK cost, since both are just additional costs incurred
          // to complete the exchange — but they're kept as separate lists for display.
          const allRequiredItems = [...offer.required_items, ...blueprintMaterials];

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
          const reqItemMarkets = await Promise.all(
            allRequiredItems.map(async (ri) => {
              const riOrders = await getCachedMarketOrders(ri.type_id);
              return {
                type_id: ri.type_id,
                quantity: ri.quantity,
                sellPrice: bestSellPrice(riOrders),
              };
            }),
          );
          const sellPriceByTypeId = new Map(reqItemMarkets.map((ri) => [ri.type_id, ri.sellPrice]));
          const iskCostOf = (items: { type_id: number; quantity: number }[]) =>
            items.reduce((sum, item) => {
              const sellPrice = sellPriceByTypeId.get(item.type_id);
              return sellPrice != null ? sum + sellPrice * item.quantity : sum;
            }, 0);
          const requiredItemsIskCost = iskCostOf(offer.required_items);
          const blueprintMaterialsIskCost = iskCostOf(blueprintMaterials);
          const requiredIskCost = offer.isk_cost + requiredItemsIskCost + blueprintMaterialsIskCost;

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

          const rating = computeRating({
            lpCost: offer.lp_cost,
            lpToIskBuy,
            immediateLiquidityLp: immediateLiquidity.lp,
            immediateLiquidityIsk: immediateLiquidity.isk,
            dailyLpVolume,
          });

          return {
            offerId: offer.offer_id,
            typeName: typeInfoMap.get(effectiveTypeId)?.name ?? `Type ${effectiveTypeId}`,
            typeId: effectiveTypeId,
            lpCost: offer.lp_cost,
            iskCost: offer.isk_cost,
            requiredItems: offer.required_items.map((ri) => ({
              typeId: ri.type_id,
              typeName: typeInfoMap.get(ri.type_id)?.name ?? `Type ${ri.type_id}`,
              quantity: ri.quantity,
            })),
            blueprintMaterials: blueprintMaterials.map((ri) => ({
              typeId: ri.type_id,
              typeName: typeInfoMap.get(ri.type_id)?.name ?? `Type ${ri.type_id}`,
              quantity: ri.quantity,
            })),
            quantity: effectiveQuantity,
            bestBuy: buy,
            bestSell: sell,
            dailyVolume: dailyVol,
            normalizedDailyVolume: normalizedDailyVol,
            dailyLpVolume,
            lpToIskBuy,
            lpToIskSell,
            totalRequiredIskCost: requiredIskCost,
            requiredItemsIskCost,
            blueprintMaterialsIskCost,
            immediateLiquidityLp: immediateLiquidity.lp,
            immediateLiquidityIsk: immediateLiquidity.isk,
            rating,
          } satisfies Omit<LpStoreRow, "ratingScore">;
        } catch (e) {
          console.error("Failed to process LP offer", offer.offer_id, "type", offer.type_id, e);
          return null;
        }
      }),
    );

    done += batch.length;
    onProgress?.(done, offers.length);
    rows.push(...(batchRows.filter(Boolean) as Omit<LpStoreRow, "ratingScore">[]));
  }

  const ratingScores = computeRatingScores(rows);
  return rows.map((row, i) => ({ ...row, ratingScore: ratingScores[i] }));
}
