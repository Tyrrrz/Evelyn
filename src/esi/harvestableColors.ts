// Maps a harvestable's base substance name (i.e. its name with any "Compressed " prefix
// stripped, since that only affects packaging and not the substance itself) to the hex color
// its icon/name uses in-game. Intentionally not exhaustive — types without an entry here just
// keep the table's default text color.
//
// To regenerate the full list of base names that need a color (after running `yarn
// generate-data`), run:
//
//   node -e "const d = require('./src/esi/harvestableData.json'); console.log([...new Set(d.map((t) => t.name.replace(/^Compressed /, '')))].sort().join('\n'))"
export const HARVESTABLE_COLORS: Record<string, string> = {};

/** Looks up the in-game color for a harvestable type by name, ignoring any "Compressed " prefix. */
export function getHarvestableColor(typeName: string): string | undefined {
  return HARVESTABLE_COLORS[typeName.replace(/^Compressed /, "")];
}
