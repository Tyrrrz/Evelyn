// EVE's ESI API does not expose blueprint manufacturing recipes (materials/products). Blueprint
// recipes are static game data that only changes when CCP ships an expansion or balance pass, so
// instead of resolving them at runtime against a third-party API, this data is bundled at build
// time from CCP's official Static Data Export (SDE). See scripts/generate-blueprint-data.mjs for
// how blueprintData.json is generated, and regenerate it there when new blueprints are added.
import blueprintData from "./blueprintData.json";

export interface BlueprintInfo {
  productTypeId: number;
  productQuantity: number;
  materials: { typeId: number; quantity: number }[];
}

/** All blueprint item type names in EVE end with this suffix. */
export function isBlueprintTypeName(typeName: string): boolean {
  return typeName.endsWith(" Blueprint");
}

/**
 * Looks up the manufacturing recipe (product + materials) for a blueprint type. Returns null if
 * the type isn't a manufacturable blueprint or isn't present in the bundled dataset.
 */
export function getBlueprintInfo(blueprintTypeId: number): BlueprintInfo | null {
  return (blueprintData as Record<string, BlueprintInfo>)[blueprintTypeId] ?? null;
}
