export const routes = {
  home: "/",
  onboarding: "/onboarding",
  /** every realm; with only one it goes straight into it */
  realms: "/realms",
  realm: (handle: string) => `/c/${handle}`,
  clips: (handle: string) => `/c/${handle}/clips`,
  members: (handle: string) => `/c/${handle}/members`,
  treasury: (handle: string) => `/c/${handle}/treasury`,
  overlay: (handle: string) => `/overlay/${handle}`,
  /** tip from another chain (the QR on stream points here) */
  tip: (handle: string) => `/tip/${handle}`,
  me: "/me",
  jury: "/jury",
  board: "/board",
  studio: "/studio",
  studioQuests: "/studio/quests",
  studioBattles: "/studio/battles",
  studioClips: "/studio/clips",
  studioPool: "/studio/pool",
  studioOverlay: "/studio/overlay",
  studioSettings: "/studio/settings",
  design: "/design",
} as const;
