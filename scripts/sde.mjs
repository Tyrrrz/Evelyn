// Shared helpers for extracting individual YAML files from CCP's Static Data Export (SDE) zip.
//
// CCP has changed the internal layout of the SDE zip before (e.g. dropping the `fsd/` directory
// prefix in a rework), so lookups try a list of known candidate paths for a given file instead of
// a single hardcoded path, to be more resilient to future reshuffles.

import { unzipSync } from "fflate";
import { load as loadYaml } from "js-yaml";

export const SDE_ZIP_URL =
  "https://developers.eveonline.com/static-data/eve-online-static-data-latest-yaml.zip";

/** Downloads the SDE zip and returns it as a byte buffer. */
export async function downloadSdeZip() {
  console.log(`Downloading SDE from ${SDE_ZIP_URL}...`);
  const res = await fetch(SDE_ZIP_URL);
  if (!res.ok) throw new Error(`Failed to download SDE: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Whether `moduleUrl` (an `import.meta.url`) refers to the script that was run directly from
 * the CLI, as opposed to one that was merely `import`-ed by another script. Generator scripts
 * use this to only download the SDE zip themselves when run standalone; when orchestrated by
 * generate-data.mjs, they instead reuse the single zip it already downloaded. */
export function isMainModule(moduleUrl) {
  return moduleUrl === `file://${process.argv[1]}`;
}

/**
 * Extracts and parses a single YAML file from the SDE zip, trying each of `candidatePaths` in
 * order until one is found. Throws a descriptive error (listing any similarly-named entries
 * found in the zip) if none of the candidates match.
 */
export function extractYamlFile(zipBuffer, candidatePaths) {
  const candidateSet = new Set(candidatePaths);
  const allNames = [];
  const files = unzipSync(zipBuffer, {
    filter: (file) => {
      allNames.push(file.name);
      return candidateSet.has(file.name);
    },
  });

  const path = candidatePaths.find((p) => files[p]);
  if (path) {
    console.log(`Extracting ${path}...`);
    return loadYaml(new TextDecoder().decode(files[path]));
  }

  const fileName = candidatePaths[candidatePaths.length - 1].split("/").pop();
  const baseName = fileName.replace(/\.yaml$/, "").toLowerCase();
  const similar = allNames.filter((n) => n.toLowerCase().includes(baseName));

  throw new Error(
    `None of the following paths were found in the SDE zip: ${candidatePaths.join(", ")}. ` +
      `CCP may have moved or renamed ${fileName} again.` +
      (similar.length > 0 ? ` Similarly-named entries found: ${similar.join(", ")}` : ""),
  );
}
