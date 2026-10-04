import { parse, stringify } from "../persist";

/**
 * JSON for the wire between our /api routes and the browser. Money and XP are bigint, which plain
 * JSON cannot carry, so this reuses the bigint-safe encoder that localStorage already uses.
 */
export const toWire = (value: unknown): string => stringify(value);
export const fromWire = <T>(text: string): T | null => parse<T>(text);
