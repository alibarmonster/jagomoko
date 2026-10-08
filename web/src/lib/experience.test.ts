import { describe, expect, it } from "vitest";
import type { Activity } from "./data/types";
import { DEFAULT_EXPERIENCE, forExperience, getExperience, isExperience, setExperience, subscribeExperience } from "./experience";

const USD = 1_000_000n;
const wallet = `0x3f2a${"0".repeat(32)}91c4`;

const act = (over: Partial<Activity>): Activity => ({
  id: "1-1",
  creatorId: "1",
  actor: wallet,
  actorName: "0x3f2a…91c4",
  kind: "Tip",
  amount: 5n * USD,
  refId: "1",
  text: "gg from Sepolia",
  timestamp: 1,
  via: 40161,
  ...over,
});

describe("the experience switch", () => {
  it("starts in web2 and takes only the two modes", () => {
    expect(DEFAULT_EXPERIENCE).toBe("web2");
    expect(getExperience()).toBe("web2");
    expect(isExperience("web3")).toBe(true);
    expect(isExperience("web4")).toBe(false);
    expect(isExperience(undefined)).toBe(false);
  });

  it("tells every listener when it changes, and only then", () => {
    let calls = 0;
    const stop = subscribeExperience(() => (calls += 1));
    setExperience("web3");
    expect(getExperience()).toBe("web3");
    setExperience("web3");
    expect(calls).toBe(1);
    stop();
    setExperience("web2");
    expect(calls).toBe(1);
    expect(getExperience()).toBe("web2");
  });
});

describe("forExperience", () => {
  it("shows web3 everything as it is", () => {
    const a = act({});
    expect(forExperience(a, "web3")).toBe(a);
  });

  it("hides the chain and the wallet address in web2, but keeps what the tipper wrote", () => {
    expect(forExperience(act({}), "web2")).toMatchObject({ actorName: "A viewer", via: undefined, text: "gg from Sepolia", actor: wallet });
  });

  it("keeps a real name and Anonymous as they are", () => {
    expect(forExperience(act({ actorName: "Alice" }), "web2").actorName).toBe("Alice");
    expect(forExperience(act({ actorName: "Anonymous", anonymous: true, actor: "" }), "web2").actorName).toBe("Anonymous");
  });

  it("drops the other chain from a bounced tip's sentence", () => {
    const bounced = act({ kind: "TipBounced", text: "sent a tip from another chain that could not reach this guild, so it went back to them" });
    expect(forExperience(bounced, "web2").text).toBe("sent a tip that could not reach this guild, so it went back to them");
  });

  it("leaves activity from Monad itself alone", () => {
    const local = act({ via: undefined, actorName: "Alice" });
    expect(forExperience(local, "web2")).toBe(local);
  });
});
