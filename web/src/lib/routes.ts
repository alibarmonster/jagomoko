export const routes = {
  home: "/",
  onboarding: "/onboarding",
  /** every realm; with only one it goes straight into it */
  realms: "/realms",
  realm: (handle: string) => `/c/${handle}`,
  treasury: (handle: string) => `/c/${handle}/treasury`,
  overlay: (handle: string) => `/overlay/${handle}`,
  me: "/me",
  jury: "/jury",
  board: "/board",
  studio: "/studio",
  studioQuests: "/studio/quests",
  studioBattles: "/studio/battles",
  studioOverlay: "/studio/overlay",
  studioSettings: "/studio/settings",
  design: "/design",
} as const;
