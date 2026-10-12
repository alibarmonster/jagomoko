/**
 * Where the sign-in / create-character flow is, from the session alone, so closing and reopening a
 * popup resumes it. "loading" is the moment after a right code, while the account starts: without
 * it the screen would flash back to the email step.
 */
export type AuthStep = "email" | "code" | "loading" | "role" | "gold" | "done";

export function authStep(s: {
  ready: boolean;
  signedIn: boolean;
  pendingEmail: string | null;
  hasCharacter: boolean;
  /** practice gold is in (or was just claimed) */
  hasGold: boolean;
}): AuthStep {
  if (!s.signedIn) return s.pendingEmail ? "code" : "email";
  if (!s.ready) return "loading";
  if (!s.hasCharacter) return "role";
  return s.hasGold ? "done" : "gold";
}

/** "Step n of 4" in the create-character flow. */
export const AUTH_STEP_NUMBER: Record<AuthStep, 1 | 2 | 3 | 4> = { email: 1, code: 2, loading: 2, role: 3, gold: 4, done: 4 };
