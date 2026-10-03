import * as React from "react";
import { ROLES, ROLE_META, type Role } from "@/lib/roles";
import { PhotoFrame, type Scene } from "@/components/ui/photo-frame";
import { RoleSigil } from "@/components/ui/sigil";
import { Section } from "./section";

const SCENES: Record<Role, Scene> = { Knight: "knight", Seer: "seer", Judge: "judge", Bard: "bard" };

/**
 * Four tall role cards. Roles are told apart by sigil and name, never by color.
 * On phones they become a horizontal scroll-snap row.
 */
export function BuiltFor() {
  return (
    <Section
      id="roles"
      eyebrow="Built for"
      title="Four roles. One party."
      aside="Everyone starts by choosing a role. Roles don't give power over anyone's money — they decide what you earn XP for, and what you unlock."
    >
      <ul
        className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 lg:gap-6"
        data-rise
      >
        {ROLES.map((role) => (
          <li key={role} className="w-[72%] shrink-0 snap-start sm:w-[44%] md:w-auto">
            <article className="group relative overflow-hidden rounded-md">
              <PhotoFrame scene={SCENES[role]} className="aspect-[3/4] rounded-md transition-transform duration-(--dur-section) ease-out group-hover:scale-[1.03]">
                <span className="sr-only">Illustration for the {role} role</span>
              </PhotoFrame>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/75 via-ink/35 to-transparent p-4 pt-16 text-on-inverse transition-transform duration-(--dur-section) ease-out group-hover:-translate-y-1">
                <RoleSigil role={role} className="size-6" />
                <h3 className="mt-2 text-lg">{role}</h3>
                <p className="mt-0.5 text-sm text-on-inverse-muted">Earns XP from {ROLE_META[role].earns}</p>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </Section>
  );
}
