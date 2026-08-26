import { bestBuyPrice, bestSellPrice, getMarketOrders } from "./client.ts";
import type { MiningCategory, MiningItem } from "./mining.ts";
import { getMiningItems } from "./mining.ts";

export interface MiningPriceRow {
  typeId: number;
  typeName: string;
  category: MiningCategory;
  volume: number;
  /** Best buy price per unit, or `null` if the region has no buy orders for it. */
  buyPricePerUnit: number | null;
  /** Best sell price per unit, or `null` if the region has no sell orders for it. */
  sellPricePerUnit: number | null;
  buyPricePerM3: number | null;
  sellPricePerM3: number | null;
}

const BATCH_SIZE = 10;

function pricePerM3(pricePerUnit: number | null, volume: number): number | null {
  return pricePerUnit !== null && volume > 0 ? pricePerUnit / volume : null;
}

/**
 * Fetches the current best buy/sell prices (per unit and per m³) for every bundled mining
 * type (ore, gas, ice) in the given region.
 */
export async function fetchMiningPriceRows(
  regionId: number,
  onProgress?: (done: number, total: number) => void,
): Promise<MiningPriceRow[]> {
  const miningItems = getMiningItems();

  const rows: MiningPriceRow[] = [];
  let done = 0;
  for (let i = 0; i < miningItems.length; i += BATCH_SIZE) {
    const batch = miningItems.slice(i, i + BATCH_SIZE);
    const batchRows = await Promise.all(
      batch.map(async (miningItem: MiningItem) => {
        const orders = await getMarketOrders(miningItem.typeId, regionId);
        const buyPricePerUnit = bestBuyPrice(orders);
        const sellPricePerUnit = bestSellPrice(orders);
        return {
          typeId: miningItem.typeId,
          typeName: miningItem.name,
          category: miningItem.category,
          volume: miningItem.volume,
          buyPricePerUnit,
          sellPricePerUnit,
          buyPricePerM3: pricePerM3(buyPricePerUnit, miningItem.volume),
          sellPricePerM3: pricePerM3(sellPricePerUnit, miningItem.volume),
        } satisfies MiningPriceRow;
      }),
    );

    done += batch.length;
    onProgress?.(done, miningItems.length);
    rows.push(...batchRows);
  }

  return rows;
}
