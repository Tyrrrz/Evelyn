// Regions rarely change, so instead of resolving them at runtime, this data is bundled at build
// time from CCP's official Static Data Export (SDE). See scripts/generate-region-data.mjs for how
// regionData.json is generated, and regenerate it there when regions change.
import regionData from "./regionData.json";

export interface Region {
  regionId: number;
  name: string;
}

/** The Forge (Jita), the most active trade hub in the game — used as the default region. */
export const DEFAULT_REGION_ID = 10000002;

/** All bundled regions, sorted alphabetically by name. */
export function getRegions(): Region[] {
  return (regionData as { regionId: number; name: string }[]).map((r) => ({
    regionId: r.regionId,
    name: r.name,
  }));
}
