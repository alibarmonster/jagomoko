/**
 * Test alerts: the streamer presses a button in the studio and the overlay in OBS shows a sample
 * alert, so they can check the scene without waiting for a real viewer. The content is fixed here;
 * a request can only choose which one, never what it says.
 */

export const TEST_KINDS = ["tip", "anonymous", "quest", "battle", "result"] as const;
export type TestKind = (typeof TEST_KINDS)[number];

export function isTestKind(value: unknown): value is TestKind {
  return typeof value === "string" && (TEST_KINDS as readonly string[]).includes(value);
}

/** Labels for the studio's buttons. */
export const TEST_LABELS: Record<TestKind, string> = {
  tip: "Tip",
  anonymous: "Anonymous tip",
  quest: "Quest backed",
  battle: "Battle pick",
  result: "Quest complete",
};
