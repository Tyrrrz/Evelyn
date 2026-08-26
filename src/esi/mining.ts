// Ore, gas and ice mining types rarely change, so instead of resolving them at runtime, this
// data is bundled at build time from CCP's official Static Data Export (SDE). See
// scripts/generate-mining-data.mjs for how miningData.json is generated, and regenerate it
// there when new mining types (or compressed variants) are added.
import miningData from "./miningData.json";

export type MiningCategory = "ore" | "gas" | "ice";

export interface MiningItem {
  typeId: number;
  name: string;
  /** Packaged volume, in m³ per unit. */
  volume: number;
  category: MiningCategory;
}

/** All bundled mining types (ore, gas, ice — including their variants and compressed forms), sorted alphabetically by name within each category. */
export function getMiningItems(): MiningItem[] {
  return miningData as MiningItem[];
}
