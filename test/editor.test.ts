import { afterEach, describe, expect, it } from "vitest";
import "../src/editor";
import type { HaSwipeCardEditor } from "../src/editor";
import type { HomeAssistant, SwipeCardConfig } from "../src/types";

const hass: HomeAssistant = {
  language: "pl",
  user: { id: "u-alice", name: "Alice" },
  states: {
    "sensor.alice": { entity_id: "sensor.alice", state: "active", attributes: {} },
  },
};

const baseConfig = (): SwipeCardConfig => ({
  type: "custom:ha-swipe-card",
  follow: { users: [{ person: "person.alice", entity: "sensor.alice" }] },
  slides: [
    { card: { type: "a" }, states: ["one", "two"] },
    { card: { type: "b" } },
    { card: { type: "c" }, states: ["three"] },
  ],
});

async function mount(config = baseConfig()) {
  const editor = document.createElement("ha-swipe-card-editor") as HaSwipeCardEditor;
  const emitted: SwipeCardConfig[] = [];
  editor.addEventListener("config-changed", (ev) =>
    emitted.push((ev as CustomEvent).detail.config),
  );
  editor.setConfig(config);
  editor.hass = hass;
  document.body.appendChild(editor);
  await editor.updateComplete;
  // HA hands the emitted config back, like the real card dialog does.
  editor.addEventListener("config-changed", (ev) =>
    editor.setConfig((ev as CustomEvent).detail.config),
  );
  const root = editor.shadowRoot!;
  const last = () => emitted[emitted.length - 1];
  const fire = (el: Element, value: unknown) =>
    el.dispatchEvent(new CustomEvent("value-changed", { detail: { value }, bubbles: true }));
  const click = async (el: Element) => {
    (el as HTMLElement).click();
    await editor.updateComplete;
  };
  return { editor, root, emitted, last, fire, click };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("editor rendering", () => {
  it("renders without errors and shows one tab per slide plus add", async () => {
    const { root } = await mount();
    const tabs = [...root.querySelectorAll(".tab")].map((t) => t.textContent!.trim());
    expect(tabs).toEqual(["1", "2", "3"]);
    expect(root.querySelector(".tabs ha-icon-button")).not.toBeNull();
  });

  it("shows the current entity state under the entity picker", async () => {
    const { root } = await mount();
    const now = root.querySelector(".person-row .column .now");
    expect(now?.textContent).toContain("Teraz: active");
  });

  it("puts the new-state field above the states of the selected slide", async () => {
    const { root } = await mount();
    const rows = [...root.querySelectorAll(".states .row ha-selector")];
    expect((rows[0] as unknown as { label: string }).label).toBe("Nowy stan");
    expect(rows.slice(1).map((r) => (r as unknown as { value: string }).value)).toEqual([
      "one",
      "two",
    ]);
  });

  it("renders an empty config", async () => {
    const { root } = await mount({ type: "custom:ha-swipe-card", slides: [] });
    expect(root.querySelectorAll(".tab")).toHaveLength(0);
    expect(root.querySelector("h3")).not.toBeNull();
  });
});

describe("states", () => {
  it("adds a new state at the top of the list", async () => {
    const { root, last, fire, click } = await mount();
    const field = root.querySelector(".states .row ha-selector")!;
    fire(field, "zero");
    await click(root.querySelector(".states .row ha-icon-button")!);
    expect(last().slides[0].states).toEqual(["zero", "one", "two"]);
  });

  it("removes a state and drops an empty list", async () => {
    const { root, last, click } = await mount();
    await click(root.querySelectorAll(".tab")[2]);
    const deletes = root.querySelectorAll(".states .row ha-icon-button");
    await click(deletes[1]);
    expect(last().slides[2]).toEqual({ card: { type: "c" } });
  });
});

describe("slides", () => {
  it("moves a slide together with its states", async () => {
    const { root, last, click } = await mount();
    await click(root.querySelectorAll(".tab")[2]);
    const [, before] = root.querySelectorAll(".toolbar ha-icon-button");
    await click(before);
    expect(last().slides.map((s) => s.card.type)).toEqual(["a", "c", "b"]);
    expect(last().slides[1].states).toEqual(["three"]);
  });

  it("duplicates and deletes slides", async () => {
    const { root, last, click } = await mount();
    const toolbar = () => root.querySelectorAll(".toolbar ha-icon-button");
    await click(toolbar()[3]);
    expect(last().slides.map((s) => s.card.type)).toEqual(["a", "a", "b", "c"]);
    await click(toolbar()[4]);
    expect(last().slides.map((s) => s.card.type)).toEqual(["a", "b", "c"]);
  });
});

describe("follow users", () => {
  it("keeps a new row until a person is picked, then emits it", async () => {
    const { root, last, emitted, fire, click } = await mount();
    const before = emitted.length;
    await click(root.querySelector("ha-button")!);
    expect(root.querySelectorAll(".person-row")).toHaveLength(2);
    expect(emitted.length).toBe(before);

    fire(root.querySelectorAll(".person-row")[1].querySelector("ha-selector")!, "person.bob");
    expect(last().follow!.users).toEqual([
      { person: "person.alice", entity: "sensor.alice" },
      { person: "person.bob", entity: "" },
    ]);
  });

  it("removes follow when the last person is deleted", async () => {
    const { root, last, click } = await mount();
    await click(root.querySelector(".person-row ha-icon-button")!);
    expect(last().follow).toBeUndefined();
  });

  it("stores the interaction pause only when it differs from 10", async () => {
    const { root, last, fire } = await mount();
    const pause = root.querySelector("ha-selector.pause")!;
    fire(pause, 5);
    expect(last().follow!.interaction_pause).toBe(5);
    fire(pause, 10);
    expect(last().follow!.interaction_pause).toBeUndefined();
  });
});
