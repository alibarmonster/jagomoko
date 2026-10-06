export const ROLES = ["Knight", "Seer", "Judge", "Bard"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_META: Record<Role, { tagline: string; earns: string; blurb: string }> = {
  Knight: {
    tagline: "Backs quests",
    earns: "backing quests",
    blurb: "You put your name behind the challenge. Every dollar you back earns bonus XP.",
  },
  Seer: {
    tagline: "Calls the match",
    earns: "winning battles",
    blurb: "You read the game before it happens. Right calls earn bonus XP and a streak.",
  },
  Judge: {
    tagline: "Settles disputes",
    earns: "honest jury votes",
    blurb: "When a result is challenged, you decide what really happened. Level 5 to serve.",
  },
  Bard: {
    tagline: "Makes the clips",
    earns: "clips and bounties",
    blurb: "You turn moments into clips. The community votes, and the best clip takes the bounty.",
  },
};
