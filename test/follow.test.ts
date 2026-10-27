import { describe, expect, it } from "vitest";
import {
  buildStateIndex,
  initialSlide,
  interactionWait,
  resolveFollowEntity,
  startSlide,
  validateConfig,
} from "../src/follow";
import type { HassEntity, SwipeCardConfig } from "../src/types";

const person = (id: string, userId: string): HassEntity => ({
  entity_id: id,
  state: "home",
  attributes: { user_id: userId },
});

const states = {
  "person.alice": person("person.alice", "u-alice"),
  "person.bob": person("person.bob", "u-bob"),
};

const config = (extra: Partial<SwipeCardConfig> = {}): SwipeCardConfig => ({
  type: "custom:ha-swipe-card",
  slides: [
    { card: { type: "a" }, states: ["one", "two"] },
    { card: { type: "b" }, states: ["three", "one"] },
    { card: { type: "c" } },
  ],
  ...extra,
});

describe("validateConfig", () => {
  it("accepts a minimal config", () => {
    expect(() => validateConfig({ type: "x", slides: [] })).not.toThrow();
  });

  it("requires slides", () => {
    expect(() => validateConfig({ type: "x" })).toThrow(/slides/);
  });

  it("requires a card in every slide", () => {
    expect(() => validateConfig({ type: "x", slides: [{ states: [] }] })).toThrow(
      /slides\[0\]: 'card'/,
    );
  });

  it("requires states to be a list", () => {
    expect(() =>
      validateConfig({ type: "x", slides: [{ card: { type: "a" }, states: "on" }] }),
    ).toThrow(/states/);
  });

  it("requires person or user in follow.users", () => {
    expect(() =>
      validateConfig({ type: "x", slides: [], follow: { users: [{ entity: "sensor.a" }] } }),
    ).toThrow(/person' or 'user/);
  });
});

describe("resolveFollowEntity", () => {
  const users = [
    { person: "person.alice", entity: "sensor.alice" },
    { user: "Bob", entity: "sensor.bob_by_name" },
    { user: "u-carol", entity: "sensor.carol_by_id" },
  ];

  it("matches a person by user_id", () => {
    expect(resolveFollowEntity(users, { id: "u-alice", name: "Whatever" }, states)).toBe(
      "sensor.alice",
    );
  });

  it("matches a user by name or id", () => {
    expect(resolveFollowEntity(users, { id: "x", name: "Bob" }, states)).toBe("sensor.bob_by_name");
    expect(resolveFollowEntity(users, { id: "u-carol", name: "C" }, states)).toBe(
      "sensor.carol_by_id",
    );
  });

  it("returns undefined for an unknown user or a missing person entity", () => {
    expect(resolveFollowEntity(users, { id: "nobody", name: "Nobody" }, states)).toBeUndefined();
    expect(
      resolveFollowEntity(
        [{ person: "person.gone", entity: "sensor.x" }],
        { id: "u", name: "U" },
        states,
      ),
    ).toBeUndefined();
    expect(resolveFollowEntity(undefined, { id: "u", name: "U" }, states)).toBeUndefined();
    expect(resolveFollowEntity(users, undefined, states)).toBeUndefined();
  });

  it("treats an empty entity as no entity", () => {
    expect(
      resolveFollowEntity(
        [{ person: "person.alice", entity: "" }],
        { id: "u-alice", name: "A" },
        states,
      ),
    ).toBeUndefined();
  });
});

describe("buildStateIndex", () => {
  it("maps states to slides, first slide wins, empty states ignored", () => {
    const index = buildStateIndex([
      { card: { type: "a" }, states: ["one", "", "two"] },
      { card: { type: "b" }, states: ["one", "three"] },
    ]);
    expect([...index.entries()]).toEqual([
      ["one", 0],
      ["two", 0],
      ["three", 1],
    ]);
  });
});

describe("initialSlide / startSlide", () => {
  const c = config({ start_card: 3 });
  const index = buildStateIndex(c.slides);

  it("uses the followed state when it is listed", () => {
    expect(initialSlide(c, index, "three")).toBe(1);
  });

  it("falls back to start_card for unlisted or missing states", () => {
    expect(initialSlide(c, index, "unavailable")).toBe(2);
    expect(initialSlide(c, index, undefined)).toBe(2);
  });

  it("clamps start_card to the slides", () => {
    expect(startSlide(config())).toBe(0);
    expect(startSlide(config({ start_card: 99 }))).toBe(2);
    expect(startSlide(config({ start_card: 0 }))).toBe(0);
    expect(startSlide({ type: "x", slides: [] })).toBe(0);
  });
});

describe("interactionWait", () => {
  it("is 0 without an interaction", () => {
    expect(interactionWait(undefined, 10, 1000)).toBe(0);
  });

  it("counts down from the last interaction, default 10 s", () => {
    expect(interactionWait(1000, undefined, 4000)).toBe(7000);
    expect(interactionWait(1000, 5, 4000)).toBe(2000);
    expect(interactionWait(1000, 5, 9000)).toBe(0);
  });

  it("is 0 when the pause is off", () => {
    expect(interactionWait(1000, 0, 1000)).toBe(0);
  });
});
