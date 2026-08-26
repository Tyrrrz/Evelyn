// Ore, gas and ice harvestable types rarely change, so instead of resolving them at runtime,
// this data is bundled at build time from CCP's official Static Data Export (SDE). See
// scripts/generate-harvestable-data.mjs for how harvestableData.json is generated, and
// regenerate it there when new harvestables (or compressed variants) are added.
import harvestableData from "./harvestableData.json";

export type HarvestableCategory = "ore" | "gas" | "ice";

export interface Harvestable {
  typeId: number;
  name: string;
  /** Packaged volume, in m³ per unit. */
  volume: number;
  category: HarvestableCategory;
}

/** All bundled harvestable types (ore, gas, ice — including their variants and compressed forms), sorted alphabetically by name within each category. */
export function getHarvestables(): Harvestable[] {
  return harvestableData as Harvestable[];
}
