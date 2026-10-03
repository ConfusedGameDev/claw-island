import { CLASSIC_LEVELS, type LevelDef } from './Levels';
import { SPOOKY_LEVELS } from './LevelsHalloween';

export type CampaignId = 'halloween' | 'classic';

export interface Campaign {
  id: CampaignId;
  title: string;
  subtitle: string;
  /** Short label for the title-screen picker, and the name of its icon (see ui/Icons). */
  tab: string;
  tabIcon: 'pumpkin' | 'island';
  levels: LevelDef[];
  /** Crane, rails and claw: toy plastic or bones. */
  look: 'plastic' | 'bone';
  /** Class put on <body> so the HUD can restyle itself. */
  bodyClass: string;
  /** localStorage keys for progress and best total. */
  progressKey: string;
  bestKey: string;
  /** Each cleared island awards a monster body piece. */
  rewardsPieces: boolean;
  /** Each cleared island opens a booster pack with a power-up for the next one. */
  boosters: boolean;
}

export const CAMPAIGNS: Record<CampaignId, Campaign> = {
  halloween: {
    id: 'halloween',
    title: 'Claw Island',
    subtitle: 'Spooky Night: build a monster, one claw at a time',
    tab: 'Spooky Night',
    tabIcon: 'pumpkin',
    levels: SPOOKY_LEVELS,
    look: 'bone',
    bodyClass: 'halloween',
    progressKey: 'clawisland.halloween.progress',
    bestKey: 'clawisland.halloween.best',
    rewardsPieces: true,
    boosters: true,
  },
  classic: {
    id: 'classic',
    title: 'Claw Island',
    subtitle: 'a tiny UFO-catcher adventure',
    tab: 'Classic',
    tabIcon: 'island',
    levels: CLASSIC_LEVELS,
    look: 'plastic',
    bodyClass: 'classic',
    // The classic keys predate campaigns; keep them so existing saves still work.
    progressKey: 'clawisland.progress',
    bestKey: 'clawisland.best',
    rewardsPieces: false,
    boosters: false,
  },
};

/** The campaign shown when the player has not picked one. Switch to 'classic' after the season. */
export const DEFAULT_CAMPAIGN: CampaignId = 'halloween';

const CAMPAIGN_KEY = 'clawisland.campaign';

/**
 * Where shared cards and Facebook/X posts point people (web and apps alike).
 * The web build for now; swap in the store pages once the apps are approved.
 */
export const PUBLIC_GAME_URL = 'https://claw-island.vercel.app/';

/**
 * Debug shortcuts in the pause menu (open the gate, complete the island,
 * grant a power-up). Hidden until the music button is toggled 10 times in a
 * row in the pause menu (again to hide). Set to `import.meta.env.DEV` before
 * release to remove them from store builds entirely.
 */
export const DEBUG_TOOLS: boolean = true;

export function gameUrl(): string {
  if (PUBLIC_GAME_URL) return PUBLIC_GAME_URL;
  return /^https?:$/.test(location.protocol) ? location.origin + location.pathname : '';
}

const isCampaignId = (v: unknown): v is CampaignId => v === 'halloween' || v === 'classic';

/** `?campaign=` wins, then the last choice, then the default. */
export function resolveCampaign(): Campaign {
  const fromUrl = new URLSearchParams(location.search).get('campaign');
  if (isCampaignId(fromUrl)) return CAMPAIGNS[fromUrl];
  try {
    const saved = localStorage.getItem(CAMPAIGN_KEY);
    if (isCampaignId(saved)) return CAMPAIGNS[saved];
  } catch { /* ignore */ }
  return CAMPAIGNS[DEFAULT_CAMPAIGN];
}

/** Remember the choice and reload into it (every island is built up front). */
export function switchCampaign(id: CampaignId): void {
  try { localStorage.setItem(CAMPAIGN_KEY, id); } catch { /* ignore */ }
  const url = new URL(location.href);
  url.searchParams.set('campaign', id);
  url.searchParams.delete('seed');
  location.replace(url.toString());
}
