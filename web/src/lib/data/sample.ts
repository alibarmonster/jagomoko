/**
 * The sample world: one coherent, clearly-labelled story used by every screen
 * until the GraphQL indexer is wired in. All people and handles are fictional.
 */
import { usd } from "../money";
import { levelForXp } from "../xp";
import type { Role } from "../roles";
import type { Activity, Battle, Creator, JuryCase, Player, Proposal, Quest, World } from "./types";

const SEC = 1_000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Deterministic fake address (40 hex chars) so avatars/crests are stable. */
export function sampleAddress(seed: string): string {
  let h = 2166136261 >>> 0;
  const parts: string[] = [];
  for (let i = 0; i < 5; i++) {
    for (const ch of `${seed}:${i}`) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619) >>> 0;
    }
    parts.push(h.toString(16).padStart(8, "0"));
  }
  return `0x${parts.join("")}`;
}

type PlayerSeed = [name: string, role: Role, xp: number, backed: number, tipped: number, won: number, wins: number, jury: number];

const PLAYER_SEEDS: PlayerSeed[] = [
  ["Alice", "Knight", 3740, 412, 96, 38, 4, 0],
  ["Carol", "Judge", 2625, 120, 40, 0, 0, 14],
  ["Bob", "Seer", 2210, 88, 30, 164, 11, 0],
  ["Dave", "Judge", 1890, 60, 22, 0, 0, 9],
  ["Erin", "Judge", 1710, 54, 18, 0, 0, 7],
  ["Faye", "Bard", 1420, 40, 55, 12, 1, 0],
  ["Gus", "Knight", 1240, 262, 20, 6, 1, 0],
  ["Hana", "Seer", 980, 30, 12, 91, 7, 0],
  ["Ivo", "Bard", 760, 22, 35, 0, 0, 0],
  ["Jun", "Knight", 540, 118, 8, 0, 0, 0],
  ["Kai", "Seer", 310, 14, 5, 22, 3, 0],
  ["Lena", "Judge", 190, 10, 5, 0, 0, 1],
];

export function buildPlayers(now: number): Player[] {
  return PLAYER_SEEDS.map(([name, role, xp, backed, tipped, won, wins, jury], i) => ({
    id: sampleAddress(name.toLowerCase()),
    name,
    role,
    xp: BigInt(xp),
    level: levelForXp(BigInt(xp)),
    totalTipped: usd(tipped),
    totalBacked: usd(backed),
    totalWon: usd(won),
    battlesWon: wins,
    juryVotes: jury,
    enlisted: role === "Judge" && xp >= 1600,
    createdAt: now - (40 - i * 3) * DAY,
  }));
}

export function buildSampleWorld(now: number = Date.now()): World {
  const players = buildPlayers(now);
  const p = (name: string) => players.find((x) => x.name === name)!;

  const creator: Creator = {
    id: "1",
    owner: sampleAddress("neonblade-owner"),
    handle: "NeonBlade",
    handleKey: "neonblade",
    creatorBps: 9_800,
    treasuryBps: 100,
    communityBps: 100,
    creatorBalance: usd(1574.08),
    treasuryBalance: usd(24.86),
    communityBalance: usd(16.06),
    totalReceived: usd(1606.2),
    tipCount: 214,
    createdAt: now - 48 * DAY,
  };

  const owner = creator.owner;
  const twitch = "https://www.twitch.tv/videos/2301100921?t=1h12m4s";

  const quests: Quest[] = [
    {
      id: "1",
      creatorId: "1",
      title: "Beat the Ender Dragon in under 1 hour",
      goalDeadline: now + 42 * MIN + 10 * SEC,
      pool: usd(340),
      backers: 12,
      status: "Open",
      proposedVerdict: "None",
      toCreatorVault: 0n,
      toTreasury: 0n,
      refundable: 0n,
      createdAt: now - 18 * MIN,
    },
    {
      id: "5",
      creatorId: "1",
      title: "Speedrun the tutorial in under 5 minutes",
      goalDeadline: now - 4 * MIN,
      pool: usd(120),
      backers: 7,
      status: "Proposed",
      proposedVerdict: "Yes",
      proposer: owner,
      proofUrl: "https://www.twitch.tv/videos/2301100921?t=0h3m12s",
      challengeDeadline: now + 6 * MIN + 12 * SEC,
      toCreatorVault: 0n,
      toTreasury: 0n,
      refundable: 0n,
      createdAt: now - 41 * MIN,
    },
    {
      id: "2",
      creatorId: "1",
      title: "No-death run of the Water Temple",
      goalDeadline: now - 22 * MIN,
      pool: usd(95),
      backers: 5,
      status: "Disputed",
      proposedVerdict: "Yes",
      proposer: owner,
      proofUrl: twitch,
      challengeDeadline: now - 9 * MIN,
      disputer: p("Gus").id,
      juryCaseId: "7",
      toCreatorVault: 0n,
      toTreasury: 0n,
      refundable: 0n,
      createdAt: now - 70 * MIN,
    },
    {
      id: "3",
      creatorId: "1",
      title: "Clear 100 chat requests before midnight",
      goalDeadline: now - 2 * DAY,
      pool: usd(210),
      backers: 9,
      status: "Succeeded",
      proposedVerdict: "Yes",
      proposer: owner,
      proofUrl: "https://www.twitch.tv/videos/2299004411?t=2h4m10s",
      toCreatorVault: usd(210),
      toTreasury: 0n,
      refundable: 0n,
      createdAt: now - 2 * DAY - 6 * HOUR,
      resolvedAt: now - 2 * DAY + 20 * MIN,
    },
    {
      id: "4",
      creatorId: "1",
      title: "Win a ranked match with a pistol only",
      goalDeadline: now - 3 * DAY,
      pool: usd(64),
      backers: 4,
      status: "Failed",
      proposedVerdict: "No",
      proposer: owner,
      toCreatorVault: 0n,
      toTreasury: usd(6.4),
      refundable: usd(57.6),
      createdAt: now - 3 * DAY - 5 * HOUR,
      resolvedAt: now - 3 * DAY + 40 * MIN,
    },
  ];

  const battles: Battle[] = [
    {
      id: "1",
      creatorId: "1",
      question: "Does NeonBlade win this Valorant match?",
      sideA: "Win",
      sideB: "Lose",
      closeTime: now + 4 * MIN + 38 * SEC,
      pointsMode: false,
      poolA: usd(182),
      poolB: usd(96),
      playersA: 14,
      playersB: 8,
      status: "Open",
      proposedVerdict: "None",
      refundAll: false,
      toTreasury: 0n,
      winnings: 0n,
      createdAt: now - 12 * MIN,
    },
    {
      id: "2",
      creatorId: "1",
      question: "First blood this round?",
      sideA: "Yes",
      sideB: "No",
      closeTime: now + 1 * MIN + 50 * SEC,
      pointsMode: true,
      poolA: 0n,
      poolB: 0n,
      playersA: 31,
      playersB: 17,
      status: "Open",
      proposedVerdict: "None",
      refundAll: false,
      toTreasury: 0n,
      winnings: 0n,
      createdAt: now - 6 * MIN,
    },
    {
      id: "3",
      creatorId: "1",
      question: "Clutch the 1v3 on Ascent?",
      sideA: "Clutch",
      sideB: "Choke",
      closeTime: now - 2 * DAY,
      pointsMode: false,
      poolA: usd(64),
      poolB: usd(120),
      playersA: 6,
      playersB: 11,
      status: "Succeeded",
      proposedVerdict: "Yes",
      proposer: owner,
      proofUrl: "https://tracker.gg/valorant/match/demo",
      refundAll: false,
      toTreasury: usd(2.4),
      winnings: usd(117.6),
      createdAt: now - 2 * DAY - 2 * HOUR,
      resolvedAt: now - 2 * DAY + 30 * MIN,
    },
  ];

  const juryCases: JuryCase[] = [
    {
      id: "7",
      marketType: "Quest",
      marketId: "2",
      creatorId: "1",
      claim: "NeonBlade says “No-death run of the Water Temple” was completed.",
      proofUrl: twitch,
      jurors: 3,
      deadline: now + 18 * MIN,
      yesVotes: 1,
      noVotes: 1,
      resolved: false,
      verdict: "None",
    },
    {
      id: "6",
      marketType: "Quest",
      marketId: "4",
      creatorId: "1",
      claim: "NeonBlade says “Win a ranked match with a pistol only” failed.",
      jurors: 3,
      deadline: now - 3 * DAY + 20 * MIN,
      yesVotes: 0,
      noVotes: 3,
      resolved: true,
      verdict: "No",
    },
  ];

  const proposals: Proposal[] = [
    {
      id: "1",
      creatorId: "1",
      proposer: p("Alice").id,
      recipient: p("Faye").id,
      recipientName: "Faye",
      amount: usd(20),
      description: "Clip bounty: the best clutch of the week goes to Faye for the 1v4 on Haven.",
      endsAt: now + 19 * HOUR,
      forWeight: 61n,
      againstWeight: 12n,
      voters: 9,
      status: "Active",
      createdAt: now - 5 * HOUR,
    },
    {
      id: "2",
      creatorId: "1",
      proposer: p("Gus").id,
      recipient: owner,
      recipientName: "NeonBlade",
      amount: usd(15),
      description: "Chat giveaway: three $5 game gift cards for the next stream. NeonBlade picks the winners live.",
      endsAt: now + 31 * HOUR,
      forWeight: 41n,
      againstWeight: 38n,
      voters: 14,
      status: "Active",
      createdAt: now - 17 * HOUR,
    },
    {
      id: "3",
      creatorId: "1",
      proposer: p("Ivo").id,
      recipient: p("Ivo").id,
      recipientName: "Ivo",
      amount: usd(10),
      description: "Pay Ivo for editing the April highlight reel.",
      endsAt: now - 2 * DAY,
      forWeight: 77n,
      againstWeight: 5n,
      voters: 18,
      status: "Executed",
      createdAt: now - 3 * DAY,
    },
  ];

  const act = (
    n: number,
    ago: number,
    actorName: string | undefined,
    kind: Activity["kind"],
    text: string,
    amount = 0n,
    refId = "",
  ): Activity => {
    const actor = actorName ? p(actorName) : undefined;
    return {
      id: `a${n}`,
      creatorId: "1",
      actor: actor?.id ?? owner,
      actorName: actor?.name ?? "NeonBlade",
      actorRole: actor?.role,
      actorLevel: actor?.level,
      kind,
      amount,
      refId,
      text,
      timestamp: now - ago,
    };
  };

  const activity: Activity[] = [
    act(1, 12 * SEC, "Alice", "Tip", "Let’s gooo! Beat that boss", usd(10), "x1"),
    act(2, 64 * SEC, "Gus", "QuestBacked", "Gus backed “Beat the Ender Dragon in under 1 hour”", usd(25), "1"),
    act(3, 2 * MIN + 10 * SEC, "Hana", "BattleJoined", "Hana picked Win", usd(20), "1"),
    act(4, 3 * MIN, "Kai", "BattleJoined", "Kai picked Yes", 0n, "2"),
    act(5, 4 * MIN, undefined, "QuestProposed", "“Speedrun the tutorial in under 5 minutes” reported as completed — open for challenges", 0n, "5"),
    act(6, 9 * MIN, "Gus", "QuestDisputed", "“No-death run of the Water Temple” was disputed", 0n, "2"),
    act(7, 9 * MIN + 5 * SEC, undefined, "JuryCaseOpened", "Quest #2 goes to a jury of 3", 0n, "7"),
    act(8, 14 * MIN, "Bob", "ProposalVoted", "Voted for", 0n, "1"),
    act(9, 21 * MIN, "Jun", "QuestBacked", "Jun backed “No-death run of the Water Temple”", usd(15), "2"),
    act(10, 33 * MIN, "Lena", "CharacterMinted", "Lena joined as a Judge", 0n, "12"),
    act(11, 48 * MIN, "Faye", "Tip", "that 1v4 was unreal", usd(5), "x2"),
    act(12, 70 * MIN, undefined, "QuestCreated", "No-death run of the Water Temple", 0n, "2"),
    act(13, 3 * HOUR, "Ivo", "Tip", "clip bounty fund", usd(20), "x3"),
    act(14, 5 * HOUR, "Alice", "ProposalCreated", "Clip bounty: the best clutch of the week goes to Faye…", usd(20), "1"),
  ];

  const protocol = {
    creators: 6,
    players: 214,
    totalVolume: usd(18_420),
    totalTreasury: usd(2_760),
    quests: 58,
    battles: 41,
    questsCompleted: 37,
  };

  return { now, creator, players, quests, battles, juryCases, proposals, activity, protocol };
}

/** Fictional creators for the leaderboard. */
export const SAMPLE_CREATORS = [
  { handle: "neonblade", received: usd(1606.2), quests: 12, supporters: 214 },
  { handle: "pixelpriya", received: usd(1342.8), quests: 9, supporters: 188 },
  { handle: "chefmarco", received: usd(982.4), quests: 7, supporters: 143 },
  { handle: "glitchgrandma", received: usd(870.1), quests: 11, supporters: 131 },
  { handle: "tofutactics", received: usd(611.5), quests: 5, supporters: 96 },
  { handle: "nightowlnat", received: usd(402.0), quests: 4, supporters: 61 },
] as const;
