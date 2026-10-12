import { describe, expect, it } from "vitest";
import { authStep } from "./auth-step";

const base = { ready: true, signedIn: false, pendingEmail: null, hasCharacter: false, hasGold: false };

describe("authStep", () => {
  it("asks for the email, then the code once one was sent", () => {
    expect(authStep(base)).toBe("email");
    expect(authStep({ ...base, pendingEmail: "a@b.co" })).toBe("code");
    // before the session is restored the form still shows (its button waits)
    expect(authStep({ ...base, ready: false })).toBe("email");
  });

  it("waits on the account after a right code instead of flashing back to the email step", () => {
    expect(authStep({ ...base, signedIn: true, ready: false })).toBe("loading");
  });

  it("then a role and a name, practice gold, and done", () => {
    expect(authStep({ ...base, signedIn: true })).toBe("role");
    expect(authStep({ ...base, signedIn: true, hasCharacter: true })).toBe("gold");
    expect(authStep({ ...base, signedIn: true, hasCharacter: true, hasGold: true })).toBe("done");
  });
});
