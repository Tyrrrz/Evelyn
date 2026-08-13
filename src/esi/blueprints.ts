// EVE's ESI API does not expose blueprint manufacturing recipes (materials/products), so this
// data is sourced from Fuzzwork's community blueprint API instead, which wraps the game's static
// data export. See https://developers.eveonline.com/docs/community/fuzzwork/ for background on
// Fuzzwork as a recognized community data source.
const FUZZWORK_BLUEPRINT_API = "https://www.fuzzwork.co.uk/blueprint/api/blueprint.php";

// EVE's static data export activity ID for manufacturing (as opposed to invention, copying, etc.)
const MANUFACTURING_ACTIVITY_ID = "1";

export interface BlueprintInfo {
  productTypeId: number;
  productQuantity: number;
  materials: { typeId: number; quantity: number }[];
}

interface FuzzworkActivityMaterial {
  typeid: number;
  quantity: number;
}

interface FuzzworkBlueprintResponse {
  blueprintDetails?: {
    productTypeID?: number;
    productQuantity?: number;
  };
  activityMaterials?: Record<string, FuzzworkActivityMaterial[]>;
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
    const productTypeId = data.blueprintDetails?.productTypeID;
    const productQuantity = data.blueprintDetails?.productQuantity;
    const materials = data.activityMaterials?.[MANUFACTURING_ACTIVITY_ID];
    if (!productTypeId || !productQuantity || !materials?.length) return null;
    // Fuzzwork echoes the input type as its own product for some non-blueprint types — treat
    // that as "no recipe" rather than a self-referential blueprint.
    if (productTypeId === blueprintTypeId) return null;

    return {
      productTypeId,
      productQuantity,
      materials: materials
        .filter((m) => m.typeid > 0 && m.quantity > 0)
        .map((m) => ({ typeId: m.typeid, quantity: m.quantity })),
    };
  } catch (e) {
    console.error("Failed to fetch blueprint info", blueprintTypeId, e);
    return null;
  }
}
