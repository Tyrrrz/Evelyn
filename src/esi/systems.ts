import systemData from "./systemData.json";

export type SolarSystem = {
  systemId: number;
  name: string;
};

/** All bundled solar systems, sorted alphabetically by name. */
export const getSolarSystems = (): SolarSystem[] => {
  return (systemData as { systemId: number; name: string }[]).map((s) => ({
    systemId: s.systemId,
    name: s.name,
  }));
};
