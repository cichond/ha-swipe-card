import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HaSwipeCard } from "../src/ha-swipe-card";
import type { HomeAssistant, SwipeCardConfig } from "../src/types";

window.loadCardHelpers = async () => ({
  createCardElement: (config) => {
    const el = document.createElement("div") as unknown as HTMLElement & { hass?: unknown };
    el.textContent = String(config.type);
    return el as never;
  },
});

await import("../src/ha-swipe-card");

const hassWith = (state: string): HomeAssistant => ({
  language: "en",
  user: { id: "u-alice", name: "Alice" },
  states: {
    "person.alice": {
      entity_id: "person.alice",
      state: "home",
      attributes: { user_id: "u-alice" },
    },
    "sensor.alice": { entity_id: "sensor.alice", state, attributes: {} },
  },
});

const config = (extra: Partial<SwipeCardConfig> = {}): SwipeCardConfig => ({
  type: "custom:ha-swipe-card",
  follow: { users: [{ person: "person.alice", entity: "sensor.alice" }] },
  slides: [
    { card: { type: "a" }, states: ["one"] },
    { card: { type: "b" }, states: ["two"] },
    { card: { type: "c" }, states: ["three"] },
  ],
  ...extra,
});

async function mount(cfg: SwipeCardConfig, state: string) {
  const card = document.createElement("ha-swipe-card") as HaSwipeCard;
  card.setConfig(cfg);
  card.hass = hassWith(state);
  document.body.appendChild(card);
  // cards are built asynchronously, then Swiper starts in updated()
  await vi.waitFor(() => {
    if (!(card as unknown as { _swiper?: unknown })._swiper) throw new Error("no swiper yet");
  });
  const swiper = () => (card as unknown as { _swiper: { activeIndex: number } })._swiper;
  return { card, swiper };
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("card", () => {
  it("renders one slide per card", async () => {
    const { card } = await mount(config(), "one");
    const slides = card.shadowRoot!.querySelectorAll(".swiper-slide");
    expect([...slides].map((s) => s.textContent!.trim())).toEqual(["a", "b", "c"]);
  });

  it("starts on the slide of the followed state", async () => {
    const { swiper } = await mount(config(), "three");
    expect(swiper().activeIndex).toBe(2);
  });

  it("starts on start_card when the state is not listed", async () => {
    const { swiper } = await mount(config({ start_card: 2 }), "unavailable");
    expect(swiper().activeIndex).toBe(1);
  });

  it("switches when the state changes to a listed one, ignores others", async () => {
    const { card, swiper } = await mount(config(), "one");
    card.hass = hassWith("two");
    expect(swiper().activeIndex).toBe(1);
    card.hass = hassWith("not_listed");
    expect(swiper().activeIndex).toBe(1);
  });

  it("waits for the interaction pause before switching", async () => {
    const { card, swiper } = await mount(config(), "one");
    vi.useFakeTimers();
    card.dispatchEvent(new Event("pointerdown"));
    card.hass = hassWith("three");
    expect(swiper().activeIndex).toBe(0);
    vi.advanceTimersByTime(9000);
    expect(swiper().activeIndex).toBe(0);
    vi.advanceTimersByTime(1500);
    expect(swiper().activeIndex).toBe(2);
  });

  it("does not follow for a user without an entity", async () => {
    const cfg = config({ follow: { users: [{ user: "Someone else", entity: "sensor.alice" }] } });
    const { card, swiper } = await mount(cfg, "three");
    expect(swiper().activeIndex).toBe(0);
    card.hass = hassWith("two");
    expect(swiper().activeIndex).toBe(0);
  });

  it("reports an invalid config", () => {
    const card = document.createElement("ha-swipe-card") as HaSwipeCard;
    expect(() => card.setConfig({ type: "x" } as SwipeCardConfig)).toThrow(/slides/);
  });
});
