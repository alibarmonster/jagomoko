import { SAMPLE_HANDLE } from "./config";

export const routes = {
  home: "/",
  onboarding: "/onboarding",
  realm: (handle: string = SAMPLE_HANDLE) => `/c/${handle}`,
  treasury: (handle: string = SAMPLE_HANDLE) => `/c/${handle}/treasury`,
  overlay: (handle: string = SAMPLE_HANDLE) => `/overlay/${handle}`,
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
