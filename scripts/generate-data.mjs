#!/usr/bin/env node
// Regenerates all bundled SDE-derived datasets (src/esi/*.json) in one pass.
//
// CCP's SDE zip is ~100+ MB, and each individual generate-*.mjs script downloads its own copy
// when run standalone. Since `yarn generate-data` runs all of them together, this script instead
// downloads the zip once and reuses it across every generator.
//
// This is what `yarn generate-data` runs. Individual generators can still be run standalone to
// regenerate just one dataset (e.g. `node scripts/generate-blueprint-data.mjs`), in which case
// they download their own copy of the zip.

import { generate as generateBlueprintData } from "./generate-blueprint-data.mjs";
import { generate as generateHarvestableData } from "./generate-harvestable-data.mjs";
import { generate as generateNpcCorporations } from "./generate-npc-corporations.mjs";
import { generate as generateRegionData } from "./generate-region-data.mjs";
import { downloadSdeZip } from "./sde.mjs";

async function main() {
  const zipBuffer = await downloadSdeZip();

  await generateNpcCorporations(zipBuffer);
  await generateBlueprintData(zipBuffer);
  await generateRegionData(zipBuffer);
  await generateHarvestableData(zipBuffer);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
