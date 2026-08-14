// NPC corporations rarely change, so instead of relying on the ESI search endpoint (which does
// not reliably return NPC corporations), this data is bundled at build time from CCP's official
// Static Data Export (SDE). See scripts/generate-npc-corporations.mjs for how
// npcCorporationData.json is generated, and regenerate it there when new corporations are added.
import npcCorporationData from "./npcCorporationData.json";

export interface NpcCorporation {
  corporationId: number;
  name: string;
}

export const NPC_CORPORATIONS: NpcCorporation[] = npcCorporationData;
