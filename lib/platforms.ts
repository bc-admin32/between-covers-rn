const S3_BASE = "https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/platforms";

export type Platform = {
  id: string;
  name: string;
  logoUrl: string;
  baseUrl: string;
  regions?: string[]; // undefined = available everywhere
};

export const PLATFORMS: Record<string, Platform> = {
  // ── GLOBAL ──
  apple: {
    id: "apple",
    name: "Apple TV+",
    logoUrl: `${S3_BASE}/apple.png`,
    baseUrl: "https://tv.apple.com",
  },
  disney: {
    id: "disney",
    name: "Disney+",
    logoUrl: `${S3_BASE}/disney.png`,
    baseUrl: "https://www.disneyplus.com",
  },
  netflix: {
    id: "netflix",
    name: "Netflix",
    logoUrl: `${S3_BASE}/netflix.png`,
    baseUrl: "https://www.netflix.com",
  },
  prime: {
    id: "prime",
    name: "Prime Video",
    logoUrl: `${S3_BASE}/prime.png`,
    baseUrl: "https://www.amazon.com/primevideo",
  },
  spotify: {
    id: "spotify",
    name: "Spotify",
    logoUrl: `${S3_BASE}/spotify.png`,
    baseUrl: "https://open.spotify.com",
  },

  // ── US ONLY ──
  amc: {
    id: "amc",
    name: "AMC+",
    logoUrl: `${S3_BASE}/amc.png`,
    baseUrl: "https://www.amcplus.com",
    regions: ["US"],
  },
  hallmark: {
    id: "hallmark",
    name: "Hallmark+",
    logoUrl: `${S3_BASE}/hallmark.png`,
    baseUrl: "https://www.hallmarkmoviesandmysteries.com",
    regions: ["US"],
  },
  hulu: {
    id: "hulu",
    name: "Hulu",
    logoUrl: `${S3_BASE}/hulu.png`,
    baseUrl: "https://www.hulu.com",
    regions: ["US"],
  },
  lifetime: {
    id: "lifetime",
    name: "Lifetime",
    logoUrl: `${S3_BASE}/lifetime.png`,
    baseUrl: "https://www.mylifetime.com",
    regions: ["US"],
  },
  max: {
    id: "max",
    name: "Max",
    logoUrl: `${S3_BASE}/max.png`,
    baseUrl: "https://www.max.com",
    regions: ["US"],
  },
  passionflix: {
    id: "passionflix",
    name: "Passionflix",
    logoUrl: `${S3_BASE}/passionflix.png`,
    baseUrl: "https://www.passionflix.com",
    regions: ["US"],
  },
  peacock: {
    id: "peacock",
    name: "Peacock",
    logoUrl: `${S3_BASE}/peacock.png`,
    baseUrl: "https://www.peacocktv.com",
    regions: ["US"],
  },
  starz: {
    id: "starz",
    name: "Starz",
    logoUrl: `${S3_BASE}/starz.png`,
    baseUrl: "https://www.starz.com",
    regions: ["US"],
  },
  tubi: {
    id: "tubi",
    name: "Tubi",
    logoUrl: `${S3_BASE}/tubi.png`,
    baseUrl: "https://tubitv.com",
    regions: ["US"],
  },

  // ── CA ONLY ──
  crave: {
    id: "crave",
    name: "Crave",
    logoUrl: `${S3_BASE}/crave.png`,
    baseUrl: "https://www.crave.ca",
    regions: ["CA"],
  },
  cbcgem: {
    id: "cbcgem",
    name: "CBC Gem",
    logoUrl: `${S3_BASE}/cbcgem.png`,
    baseUrl: "https://gem.cbc.ca",
    regions: ["CA"],
  },

  // ── UK ONLY ──
  bbc: {
    id: "bbc",
    name: "BBC iPlayer",
    logoUrl: `${S3_BASE}/bbc.png`,
    baseUrl: "https://www.bbc.co.uk/iplayer",
    regions: ["UK"],
  },
  itvx: {
    id: "itvx",
    name: "ITVX",
    logoUrl: `${S3_BASE}/itvx.png`,
    baseUrl: "https://www.itv.com",
    regions: ["UK"],
  },
  channel4: {
    id: "channel4",
    name: "Channel 4",
    logoUrl: `${S3_BASE}/channel4.png`,
    baseUrl: "https://www.channel4.com",
    regions: ["UK"],
  },

  // ── AU ONLY ──
  stan: {
    id: "stan",
    name: "Stan",
    logoUrl: `${S3_BASE}/stan.png`,
    baseUrl: "https://www.stan.com.au",
    regions: ["AU"],
  },
  binge: {
    id: "binge",
    name: "Binge",
    logoUrl: `${S3_BASE}/binge.png`,
    baseUrl: "https://binge.com.au",
    regions: ["AU"],
  },
  abc: {
    id: "abc",
    name: "ABC iview",
    logoUrl: `${S3_BASE}/abc.png`,
    baseUrl: "https://iview.abc.net.au",
    regions: ["AU"],
  },
};

export function getPlatform(id: string): Platform | undefined {
  return PLATFORMS[id.toLowerCase()];
}

export function getPlatformLogo(id: string): string {
  return PLATFORMS[id.toLowerCase()]?.logoUrl ?? "";
}

export function getPlatformRegionLabel(id: string): string | null {
  const regions = PLATFORMS[id.toLowerCase()]?.regions;
  if (!regions || regions.length === 0) return null;
  const flags: Record<string, string> = {
    US: "🇺🇸", CA: "🇨🇦", UK: "🇬🇧", AU: "🇦🇺",
  };
  return regions.map(r => `${flags[r] ?? r} only`).join(", ");
}

export const PLATFORM_OPTIONS = Object.values(PLATFORMS).map((p) => ({
  value: p.id,
  label: p.name,
}));

export const WATCH_PLATFORM_OPTIONS = PLATFORM_OPTIONS.filter(
  (p) => p.value !== "spotify"
);

export const PLAYLIST_PLATFORM_OPTIONS = PLATFORM_OPTIONS.filter(
  (p) => p.value === "spotify"
);