import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAddress, isAddress } from "viem";
import { EMPTY_NAME_BOOK, nameKey, type NameBook } from "../profile-name";

/**
 * Character names, kept off chain (see lib/profile-name.ts).
 *
 * For the demo they live in one JSON file (PROFILE_STORE_PATH, default web/.data/profiles.json,
 * git-ignored), read once and then kept in memory. Like the overlay test queue this needs a single
 * server process; behind several instances, or on a host without a disk, put a database behind the
 * same ProfileStore interface.
 */

export interface Profile {
  /** checksummed smart-account address */
  address: string;
  name: string;
  /** the Privy user who set it */
  userId: string;
  /** when the signed change was issued (ms); every change must be newer than the last */
  updatedAt: number;
}

export type ClaimResult = { ok: true } | { ok: false; reason: "taken" | "stale" };

export interface ProfileStore {
  book(): Promise<NameBook>;
  byUser(userId: string): Promise<Profile | null>;
  claim(profile: Profile): Promise<ClaimResult>;
}

type StoreFile = { version: 1; profiles: Profile[] };

const checksum = (address: string) => (isAddress(address, { strict: false }) ? getAddress(address) : address);

export class FileProfileStore implements ProfileStore {
  private loading: Promise<void> | null = null;
  private readonly byAddress = new Map<string, Profile>();
  private readonly holders = new Map<string, string>(); // name key -> address
  private readonly users = new Map<string, string>(); // Privy user -> address
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly path: string) {}

  async book(): Promise<NameBook> {
    await this.load();
    return {
      nameOf: (address) => this.byAddress.get(checksum(address))?.name,
      holderOf: (key) => this.holders.get(key),
    };
  }

  async byUser(userId: string): Promise<Profile | null> {
    await this.load();
    const address = this.users.get(userId);
    return (address && this.byAddress.get(address)) || null;
  }

  /** Sets an account's name, unless another account holds it or a newer change was saved already. */
  claim(profile: Profile): Promise<ClaimResult> {
    // one change at a time, so two people can never take the same name at once
    const run = this.queue.then(async (): Promise<ClaimResult> => {
      await this.load();
      const next = { ...profile, address: getAddress(profile.address) };
      const before = this.byAddress.get(next.address);
      if (before && next.updatedAt <= before.updatedAt) return { ok: false, reason: "stale" };
      const holder = this.holders.get(nameKey(next.name));
      if (holder && holder !== next.address) return { ok: false, reason: "taken" };

      this.put(next);
      try {
        await this.save();
      } catch (error) {
        // keep memory and disk in step: undo, and let the caller say it failed
        if (before) this.put(before);
        else this.drop(next);
        throw error;
      }
      return { ok: true };
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private load(): Promise<void> {
    this.loading ??= (async () => {
      let text: string;
      try {
        text = await readFile(this.path, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return; // nobody has a name yet
        throw error;
      }
      // a damaged file throws here (and every save is refused) rather than being written over
      const data = JSON.parse(text) as StoreFile;
      for (const p of data.profiles) this.put(p);
    })().catch((error: unknown) => {
      this.loading = null; // try again on the next request
      throw error;
    });
    return this.loading;
  }

  private put(p: Profile) {
    const previous = this.byAddress.get(p.address);
    if (previous) this.holders.delete(nameKey(previous.name));
    this.byAddress.set(p.address, p);
    this.holders.set(nameKey(p.name), p.address);
    this.users.set(p.userId, p.address);
  }

  private drop(p: Profile) {
    this.byAddress.delete(p.address);
    if (this.holders.get(nameKey(p.name)) === p.address) this.holders.delete(nameKey(p.name));
    if (this.users.get(p.userId) === p.address) this.users.delete(p.userId);
  }

  private async save() {
    const data: StoreFile = { version: 1, profiles: [...this.byAddress.values()] };
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.tmp`;
    await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    // swap it in whole; OneDrive or a virus scanner can hold the file for a moment, so retry briefly
    for (let attempt = 1; ; attempt++) {
      try {
        await rename(temp, this.path);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (attempt >= 5 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw error;
        await new Promise((resolve) => setTimeout(resolve, 60 * attempt));
      }
    }
  }
}

// kept on globalThis so a dev-server hot reload does not read the file again mid-write
const g = globalThis as typeof globalThis & { __jagomokoProfiles?: ProfileStore };

export function profileStore(): ProfileStore {
  g.__jagomokoProfiles ??= new FileProfileStore(process.env.PROFILE_STORE_PATH || join(process.cwd(), ".data", "profiles.json"));
  return g.__jagomokoProfiles;
}

/** Who holds which name, for the data layer. Never throws: without it, screens show on-chain names. */
export async function nameBook(): Promise<NameBook> {
  try {
    return await profileStore().book();
  } catch (error) {
    console.error("The name store could not be read; showing on-chain names.", error);
    return EMPTY_NAME_BOOK;
  }
}
