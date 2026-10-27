// Pure logic of the card: config validation, which entity the viewer
// follows, which slide a state selects, and the interaction pause.
// No DOM here, so all of it is unit-tested.

import type { FollowUser, HassEntity, HassUser, SlideConfig, SwipeCardConfig } from "./types";

export const DEFAULT_INTERACTION_PAUSE = 10;

export function validateConfig(config: unknown): SwipeCardConfig {
  if (!config || typeof config !== "object") {
    throw new Error("Invalid configuration");
  }
  const c = config as Partial<SwipeCardConfig>;
  if (!Array.isArray(c.slides)) {
    throw new Error("'slides' must be a list of { card, states }");
  }
  c.slides.forEach((slide, i) => {
    if (!slide || typeof slide.card !== "object" || !slide.card) {
      throw new Error(`slides[${i}]: 'card' is required`);
    }
    if (slide.states !== undefined && !Array.isArray(slide.states)) {
      throw new Error(`slides[${i}]: 'states' must be a list`);
    }
  });
  const users = c.follow?.users;
  if (users !== undefined) {
    if (!Array.isArray(users)) {
      throw new Error("follow.users must be a list of { person | user, entity }");
    }
    users.forEach((u, i) => {
      if (!u || (!u.person && !u.user)) {
        throw new Error(`follow.users[${i}]: 'person' or 'user' is required`);
      }
    });
  }
  return c as SwipeCardConfig;
}

/**
 * Entity followed by the logged-in user: a `person` entry matches the
 * person whose `user_id` is the user's id; a `user` entry matches the user
 * name or id. First match wins.
 */
export function resolveFollowEntity(
  users: FollowUser[] | undefined,
  user: HassUser | undefined,
  states: Record<string, HassEntity>,
): string | undefined {
  if (!users || !user) {
    return undefined;
  }
  const match = users.find((u) => {
    if (u.person) {
      return states[u.person]?.attributes.user_id === user.id;
    }
    return u.user === user.name || u.user === user.id;
  });
  return match?.entity || undefined;
}

/** state -> slide index; when a state is listed twice, the first slide wins. */
export function buildStateIndex(slides: SlideConfig[]): Map<string, number> {
  const index = new Map<string, number>();
  slides.forEach((slide, i) => {
    (slide.states || []).forEach((state) => {
      const key = String(state);
      if (key !== "" && !index.has(key)) {
        index.set(key, i);
      }
    });
  });
  return index;
}

/** Slide shown when the card starts: the followed state's slide, else start_card. */
export function initialSlide(
  config: SwipeCardConfig,
  index: Map<string, number>,
  state: string | undefined,
): number {
  if (state !== undefined && index.has(state)) {
    return index.get(state)!;
  }
  return startSlide(config);
}

export function startSlide(config: SwipeCardConfig): number {
  const start = Number(config.start_card ?? 1) - 1;
  const last = Math.max(config.slides.length - 1, 0);
  return Number.isFinite(start) ? Math.min(Math.max(start, 0), last) : 0;
}

/** Milliseconds left before the card may move by itself; 0 = now. */
export function interactionWait(
  lastInteraction: number | undefined,
  pauseSeconds: number | undefined,
  now: number,
): number {
  if (lastInteraction === undefined) {
    return 0;
  }
  const pause = (pauseSeconds ?? DEFAULT_INTERACTION_PAUSE) * 1000;
  return Math.max(lastInteraction + pause - now, 0);
}
