import { describe, expect, it } from "vitest";
import { INITIAL_ROUTER, stepSignInRouter, type RouterState, type Who } from "./sign-in";

const who = (over: Partial<Who> = {}): Who => ({ ready: true, signedIn: false, hasCharacter: false, hasRealm: false, ...over });

/** Feeds a sequence of states through the machine and returns where it sent the visitor each time. */
function run(steps: Partial<Who>[]) {
  let state: RouterState = INITIAL_ROUTER;
  return steps.map((s) => {
    const r = stepSignInRouter(state, who(s));
    state = r.state;
    return r.to;
  });
}

describe("stepSignInRouter", () => {
  it("waits until the session is ready", () => {
    expect(run([{ ready: false }, { ready: false, signedIn: true, hasRealm: true }])).toEqual([null, null]);
  });

  it("leaves a returning visitor alone: the front page stays reachable", () => {
    expect(run([{ signedIn: true, hasCharacter: true }, { signedIn: true, hasCharacter: true }])).toEqual([null, null]);
    expect(run([{ signedIn: true, hasRealm: true }])).toEqual([null]);
  });

  it("sends a streamer to the studio the moment they sign in", () => {
    expect(run([{}, { signedIn: true, hasRealm: true }])).toEqual([null, "/studio"]);
  });

  it("sends a returning viewer to the realms", () => {
    expect(run([{}, { signedIn: true, hasCharacter: true }])).toEqual([null, "/realms"]);
  });

  it("prefers the studio for someone who is both", () => {
    expect(run([{}, { signedIn: true, hasCharacter: true, hasRealm: true }])).toEqual([null, "/studio"]);
  });

  it("does not hijack a brand-new viewer: the sign-in window takes them through picking a role", () => {
    // signs in (no character yet), then creates one: still no redirect from here
    expect(run([{}, { signedIn: true }, { signedIn: true, hasCharacter: true }])).toEqual([null, null, null]);
  });

  it("fires once per sign-in, not on every render", () => {
    expect(run([{}, { signedIn: true, hasCharacter: true }, { signedIn: true, hasCharacter: true }, { signedIn: true, hasCharacter: true }])).toEqual([
      null,
      "/realms",
      null,
      null,
    ]);
  });

  it("decides again after signing out and back in", () => {
    expect(
      run([{}, { signedIn: true, hasCharacter: true }, {}, { signedIn: true, hasRealm: true }]),
    ).toEqual([null, "/realms", null, "/studio"]);
  });

  it("waits through the moment the session reloads right after sign-in", () => {
    // signed in, the account is still loading (not ready), then it is: decide on the real data
    expect(run([{}, { ready: false, signedIn: true }, { signedIn: true, hasRealm: true }])).toEqual([null, null, "/studio"]);
  });
});
