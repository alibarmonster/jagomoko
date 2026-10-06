import { routes } from "./routes";

/**
 * Where someone goes right after signing in on the front page. Pure, so every case is tested.
 *
 *  - A visitor who was already signed in when the page loaded stays put: the front page stays reachable.
 *  - A streamer (has a realm) goes to the studio; a returning viewer (has a character) to the realms.
 *  - A brand-new viewer goes nowhere: the sign-in window is still taking them through picking a role,
 *    and it takes them into the app when they finish.
 *  - It decides once per sign-in; signing out and in again decides again.
 */
export interface RouterState {
  /** whether the visitor was signed in when the session first became ready (null until then) */
  seen: boolean | null;
  /** this sign-in has already been dealt with */
  handled: boolean;
}

export const INITIAL_ROUTER: RouterState = { seen: null, handled: false };

export interface Who {
  ready: boolean;
  signedIn: boolean;
  hasCharacter: boolean;
  hasRealm: boolean;
}

export function stepSignInRouter(state: RouterState, who: Who): { state: RouterState; to: string | null } {
  if (!who.ready) return { state, to: null };
  if (state.seen === null) return { state: { seen: who.signedIn, handled: who.signedIn }, to: null };
  if (!who.signedIn) return { state: { ...state, handled: false }, to: null };
  if (state.handled) return { state, to: null };
  const to = who.hasRealm ? routes.studio : who.hasCharacter ? routes.realms : null;
  return { state: { ...state, handled: true }, to };
}
