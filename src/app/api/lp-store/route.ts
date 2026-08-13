import { NextRequest, NextResponse } from "next/server";
import {
  getLpOffers,
  getMarketOrders,
  getMarketHistory,
  getTypeInfoBatch,
  bestBuyPrice,
  bestSellPrice,
  avgDailyVolume,
} from "@/lib/esi";

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
}

export async function GET(req: NextRequest) {
  const corporationIdStr = req.nextUrl.searchParams.get("corporationId");
  if (!corporationIdStr) {
    return NextResponse.json({ error: "corporationId required" }, { status: 400 });
  }
  const corporationId = parseInt(corporationIdStr, 10);
  if (isNaN(corporationId)) {
    return NextResponse.json({ error: "Invalid corporationId" }, { status: 400 });
  }

  try {
    const offers = await getLpOffers(corporationId);

    // Collect all unique type IDs we need to resolve
    const allTypeIds = new Set<number>();
    for (const offer of offers) {
      allTypeIds.add(offer.type_id);
      for (const req of offer.required_items) {
        allTypeIds.add(req.type_id);
      }
    }

    // Resolve names for all types in parallel with market data
    const typeInfoMap = await getTypeInfoBatch([...allTypeIds]);

    // For each offer, fetch market orders + history for the output item
    // Batch fetching: limit concurrency to avoid overwhelming ESI
    const rows: LpStoreRow[] = [];

    const BATCH_SIZE = 10;
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

            // Calculate total ISK cost of required items (using sell prices)
            // We fetch sell prices for required items if any
            let requiredIskCost = offer.isk_cost;

            // Fetch market orders for required items
            const reqItemMarkets = await Promise.all(
              offer.required_items.map(async (ri) => {
                const riOrders = await getMarketOrders(ri.type_id);
                const riSell = bestSellPrice(riOrders);
                return { type_id: ri.type_id, quantity: ri.quantity, sellPrice: riSell };
              })
            );

            for (const ri of reqItemMarkets) {
              if (ri.sellPrice !== null) {
                requiredIskCost += ri.sellPrice * ri.quantity;
              }
            }

            // LP-to-ISK: (revenue - total ISK costs) / LP
            // Using buy orders as conservative revenue estimate
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
              dailyVolume: dailyVol,
              normalizedDailyVolume: normalizedDailyVol,
              lpToIskBuy,
              lpToIskSell,
              totalRequiredIskCost: requiredIskCost,
            } as LpStoreRow;
          } catch {
            return null;
          }
        })
      );
      rows.push(...(batchRows.filter(Boolean) as LpStoreRow[]));
    }

    return NextResponse.json(rows);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch LP store data" }, { status: 500 });
  }
}
