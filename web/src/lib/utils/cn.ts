import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge our custom font-size token (text-num) so it is not
// mistaken for a text color and merged away next to text-ink / text-muted.
const twMerge = extendTailwindMerge({
  extend: {
    theme: { text: ["num"] },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
