import systemData from "./systemData.json";

export interface SolarSystem {
  systemId: number;
  name: string;
}

/** All bundled solar systems, sorted alphabetically by name. */
export function getSolarSystems(): SolarSystem[] {
  return (systemData as { systemId: number; name: string }[]).map((s) => ({
    systemId: s.systemId,
    name: s.name,
  }));
}
