import { bestBuyPrice, bestSellPrice, getMarketOrders } from "./client.ts";
import type { Harvestable, HarvestableCategory } from "./harvestables.ts";
import { getHarvestables } from "./harvestables.ts";

export interface HarvestablePriceRow {
  typeId: number;
  typeName: string;
  category: HarvestableCategory;
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
 * Fetches the current best buy/sell prices (per unit and per m³) for every bundled harvestable
 * type (ore, gas, ice) in the given region.
 */
export async function fetchHarvestablePriceRows(
  regionId: number,
  onProgress?: (done: number, total: number) => void,
): Promise<HarvestablePriceRow[]> {
  const harvestables = getHarvestables();

  const rows: HarvestablePriceRow[] = [];
  let done = 0;
  for (let i = 0; i < harvestables.length; i += BATCH_SIZE) {
    const batch = harvestables.slice(i, i + BATCH_SIZE);
    const batchRows = await Promise.all(
      batch.map(async (harvestable: Harvestable) => {
        const orders = await getMarketOrders(harvestable.typeId, regionId);
        const buyPricePerUnit = bestBuyPrice(orders);
        const sellPricePerUnit = bestSellPrice(orders);
        return {
          typeId: harvestable.typeId,
          typeName: harvestable.name,
          category: harvestable.category,
          volume: harvestable.volume,
          buyPricePerUnit,
          sellPricePerUnit,
          buyPricePerM3: pricePerM3(buyPricePerUnit, harvestable.volume),
          sellPricePerM3: pricePerM3(sellPricePerUnit, harvestable.volume),
        } satisfies HarvestablePriceRow;
      }),
    );

    done += batch.length;
    onProgress?.(done, harvestables.length);
    rows.push(...batchRows);
  }

  return rows;
}
