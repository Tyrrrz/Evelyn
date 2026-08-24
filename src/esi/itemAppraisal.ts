import { bestBuyPrice, bestSellPrice, getMarketOrders, resolveTypeIdsByName } from "./client.ts";

/** A single line parsed from a copy-pasted inventory list. */
export interface AppraisalItem {
  name: string;
  quantity: number;
}

export interface AppraisalRow {
  typeId: number;
  typeName: string;
  quantity: number;
  /** Best buy price, or `null` if the region has no buy orders for it. */
  buyPrice: number | null;
  /** Best sell price, or `null` if the region has no sell orders for it. */
  sellPrice: number | null;
  buyTotal: number | null;
  sellTotal: number | null;
}

const BATCH_SIZE = 10;

/**
 * Parses a copy-pasted EVE inventory list, one item per line, where each line is an item name
 * inventory window) or any run of whitespace. Duplicate item names are collapsed by summing their
 * quantities. Lines that don't end in a quantity are ignored.
 */
export function parseItemList(text: string): AppraisalItem[] {
  const quantityByName = new Map<string, number>();
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = /^(?<name>.*\S)\s+(?<quantity>[\d,]+)$/u.exec(line);
    if (!match?.groups) continue;

    const name = match.groups.name.trim();
    const quantity = parseInt(match.groups.quantity.replace(/,/gu, ""), 10);
    if (!name || !Number.isFinite(quantity) || quantity <= 0) continue;

    quantityByName.set(name, (quantityByName.get(name) ?? 0) + quantity);
  }
  return [...quantityByName].map(([name, quantity]) => ({ name, quantity }));
}

/**
 * Resolves each item's name to a type ID and fetches its best buy/sell price in the given region.
 * Items whose name can't be resolved to a known item type are returned in `unresolvedNames`
 * rather than being silently dropped, so the UI can flag them.
 */
export async function fetchAppraisalRows(
  items: AppraisalItem[],
  regionId: number,
  onProgress?: (done: number, total: number) => void,
): Promise<{ rows: AppraisalRow[]; unresolvedNames: string[] }> {
  const typeIdByName = await resolveTypeIdsByName(items.map((i) => i.name));
  const unresolvedNames = items
    .map((i) => i.name)
    .filter((name) => !typeIdByName.has(name))
    .filter((name, i, arr) => arr.indexOf(name) === i);

  const resolvedItems = items.filter((i) => typeIdByName.has(i.name));

  const rows: AppraisalRow[] = [];
  let done = 0;
  for (let i = 0; i < resolvedItems.length; i += BATCH_SIZE) {
    const batch = resolvedItems.slice(i, i + BATCH_SIZE);
    const batchRows = await Promise.all(
      batch.map(async (item) => {
        const typeId = typeIdByName.get(item.name)!;
        const orders = await getMarketOrders(typeId, regionId);
        const buyPrice = bestBuyPrice(orders);
        const sellPrice = bestSellPrice(orders);
        return {
          typeId,
          typeName: item.name,
          quantity: item.quantity,
          buyPrice,
          sellPrice,
          buyTotal: buyPrice !== null ? buyPrice * item.quantity : null,
          sellTotal: sellPrice !== null ? sellPrice * item.quantity : null,
        } satisfies AppraisalRow;
      }),
    );

    done += batch.length;
    onProgress?.(done, resolvedItems.length);
    rows.push(...batchRows);
  }

  return { rows, unresolvedNames };
}
