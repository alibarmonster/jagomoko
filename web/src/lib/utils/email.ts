import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().max(254).email();

/** The address to send a sign-in code to, trimmed and lowercased, or null when it isn't one. */
export function parseEmail(raw: string): string | null {
  const parsed = emailSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
