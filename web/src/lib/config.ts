/** Every screen renders typed sample data (clearly labelled) until the GraphQL indexer is wired in. */
export const SAMPLE_DATA = process.env.NEXT_PUBLIC_SAMPLE_DATA !== "false";

/**
 * Real sign-in (Privy) and real transactions on Monad testnet with sponsored gas. Independent of
 * SAMPLE_DATA: this one is about what a tap DOES, that one is about what the screens SHOW. Both
 * can be on, which is the state until the indexer feeds the screens live data.
 */
export const CHAIN_MODE = process.env.NEXT_PUBLIC_CHAIN_MODE === "true";

export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/alibarmonster/jagomoko";

export const SITE = {
  name: "jagomoko",
  title: "jagomoko — turn your stream into a co-op game",
  description:
    "Viewers back quests, call the match and level up a character. Every dollar splits instantly between the creator, the community and the players.",
} as const;

/** The realm used by every sample screen. */
export const SAMPLE_HANDLE = "neonblade";
