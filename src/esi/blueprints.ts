// EVE's ESI API does not expose blueprint manufacturing recipes (materials/products), so this
// data is sourced from Fuzzwork's community blueprint API instead, which wraps the game's static
// data export. See https://developers.eveonline.com/docs/community/fuzzwork/ for background on
// Fuzzwork as a recognized community data source.
const FUZZWORK_BLUEPRINT_API = "https://www.fuzzwork.co.uk/blueprint/api/blueprintJSON.php";

// EVE's static data export activity ID for manufacturing (as opposed to invention, copying, etc.)
const MANUFACTURING_ACTIVITY_ID = "1";

export interface BlueprintInfo {
  productTypeId: number;
  productQuantity: number;
  materials: { typeId: number; quantity: number }[];
}

interface FuzzworkActivityMaterial {
  typeID: number;
  quantity: number;
}

interface FuzzworkActivityProduct {
  typeID: number;
  quantity: number;
}

interface FuzzworkBlueprintResponse {
  activityMaterials?: Record<string, FuzzworkActivityMaterial[]>;
  activityProducts?: Record<string, FuzzworkActivityProduct[]>;
}

/** All blueprint item type names in EVE end with this suffix. */
export function isBlueprintTypeName(typeName: string): boolean {
  return typeName.endsWith(" Blueprint");
}

/**
 * Fetches the manufacturing recipe (product + materials) for a blueprint type. Returns null if
 * the type isn't a manufacturable blueprint or the data can't be resolved.
 */
export async function getBlueprintInfo(blueprintTypeId: number): Promise<BlueprintInfo | null> {
  try {
    const res = await fetch(`${FUZZWORK_BLUEPRINT_API}?typeid=${blueprintTypeId}`, {
      cache: "default",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as FuzzworkBlueprintResponse;
    const products = data.activityProducts?.[MANUFACTURING_ACTIVITY_ID];
    const materials = data.activityMaterials?.[MANUFACTURING_ACTIVITY_ID];
    if (!products?.length || !materials?.length) return null;

    return {
      productTypeId: products[0].typeID,
      productQuantity: products[0].quantity,
      materials: materials.map((m) => ({ typeId: m.typeID, quantity: m.quantity })),
    };
  } catch (e) {
    console.error("Failed to fetch blueprint info", blueprintTypeId, e);
    return null;
  }
}
