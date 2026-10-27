import { LitElement, css, html, nothing } from "lit";
import { property, query, state } from "lit/decorators.js";
import { keyed } from "lit/directives/keyed.js";

import { strings, type Strings } from "./strings";
import type {
  FollowUser,
  HomeAssistant,
  LovelaceCardConfig,
  SlideConfig,
  SwipeCardConfig,
} from "./types";

const mdiPlus = "M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z";
const mdiDelete =
  "M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z";
const mdiContentCopy =
  "M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z";
const mdiCodeBraces =
  "M8,3A2,2 0 0,0 6,5V9A2,2 0 0,1 4,11H3V13H4A2,2 0 0,1 6,15V19A2,2 0 0,0 8,21H10V19H8V14A2,2 0 0,0 6,12A2,2 0 0,0 8,10V5H10V3M16,3A2,2 0 0,1 18,5V9A2,2 0 0,0 20,11H21V13H20A2,2 0 0,0 18,15V19A2,2 0 0,1 16,21H14V19H16V14A2,2 0 0,1 18,12A2,2 0 0,1 16,10V5H14V3H16Z";
const mdiListBoxOutline =
  "M19,5V19H5V5H19M21,3H3V21H21V3M17,17H7V15H17V17M17,13H7V11H17V13M17,9H7V7H17V9Z";
const mdiChevronLeft = "M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z";
const mdiChevronRight = "M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z";

// Elements HA loads lazily. Building a vertical-stack editor pulls in the
// card editor and card picker; an entities editor pulls in ha-form.
const HA_ELEMENTS = ["ha-form", "ha-selector", "hui-card-element-editor", "hui-card-picker"];

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<void>((resolve) => setTimeout(resolve, ms))]);

async function loadHaElements(): Promise<void> {
  if (!window.loadCardHelpers || HA_ELEMENTS.every((n) => customElements.get(n))) {
    return;
  }
  const helpers = await window.loadCardHelpers();
  for (const type of ["vertical-stack", "entities"]) {
    const card = helpers.createCardElement({ type, cards: [], entities: [] });
    await withTimeout(customElements.whenDefined(card.localName), 5000);
    const cls = customElements.get(card.localName) as
      { getConfigElement?: () => Promise<HTMLElement> } | undefined;
    await cls?.getConfigElement?.();
  }
}

interface CardElementEditor extends HTMLElement {
  toggleMode(): void;
}

// User rows as edited: a row may lack its person until it is picked.
interface UserRow {
  person?: string;
  user?: string;
  entity: string;
}

const isComplete = (row: UserRow) => Boolean(row.person || row.user);

const toUsers = (rows: UserRow[]): FollowUser[] =>
  rows
    .filter(isComplete)
    .map((row) =>
      row.user !== undefined
        ? { user: row.user, entity: row.entity }
        : { person: row.person, entity: row.entity },
    );

export class HaSwipeCardEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) lovelace?: unknown;

  @state() private _config?: SwipeCardConfig;
  @state() private _rows: UserRow[] = [];
  @state() private _selected = 0;
  @state() private _guiMode = true;
  @state() private _guiModeAvailable = true;
  @state() private _newState = "";
  @state() private _loaded = false;

  @query("hui-card-element-editor") private _cardEditor?: CardElementEditor;

  // Key per slide editor, so switching or moving slides builds a fresh one.
  private _keys = new Map<string, string>();

  setConfig(config: SwipeCardConfig): void {
    this._config = config;
    const users = config.follow?.users ?? [];
    // Keep half-filled rows when HA hands back the config we just emitted.
    if (JSON.stringify(toUsers(this._rows)) !== JSON.stringify(users)) {
      this._rows = users.map((u) => ({ ...u, entity: u.entity ?? "" }));
    }
    const count = config.slides?.length ?? 0;
    if (this._selected > count) {
      this._selected = count;
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
    loadHaElements()
      .catch(() => undefined)
      .then(() => {
        this._loaded = true;
      });
  }

  private get _t(): Strings {
    return strings(this.hass?.language);
  }

  private get _slides(): SlideConfig[] {
    return this._config?.slides ?? [];
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }
    const t = this._t;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
        .schema=${[
          {
            type: "grid",
            name: "",
            schema: [
              {
                name: "start_card",
                selector: {
                  number: { min: 1, max: Math.max(this._slides.length, 1), mode: "box" },
                },
              },
              { name: "card_width", selector: { text: {} } },
            ],
          },
        ]}
        .computeLabel=${(s: { name: keyof Strings }) => t[s.name]}
        @value-changed=${this._basicChanged}
      ></ha-form>

      ${this._renderFollow(t)} ${this._renderSlides(t)}

      <h3>${t.parameters}</h3>
      <ha-selector
        .hass=${this.hass}
        .selector=${{ object: {} }}
        .value=${this._config.parameters ?? {}}
        @value-changed=${this._parametersChanged}
      ></ha-selector>
    `;
  }

  private _renderFollow(t: Strings) {
    const pause = this._config!.follow?.interaction_pause;
    return html`
      <h3>${t.follow}</h3>
      <p class="hint">${t.follow_hint}</p>
      ${this._rows.map((row, i) => {
        const current = row.entity ? this.hass!.states[row.entity] : undefined;
        const byUser = row.user !== undefined;
        return html`
          <div class="row person-row">
            <ha-selector
              .hass=${this.hass}
              .selector=${byUser ? { text: {} } : { entity: { domain: "person" } }}
              .value=${byUser ? row.user : (row.person ?? "")}
              .label=${byUser ? t.user : t.person}
              @value-changed=${(ev: CustomEvent) =>
                this._rowChanged(i, byUser ? "user" : "person", ev)}
            ></ha-selector>
            <div class="column">
              <ha-selector
                .hass=${this.hass}
                .selector=${{ entity: {} }}
                .value=${row.entity}
                .label=${t.entity}
                @value-changed=${(ev: CustomEvent) => this._rowChanged(i, "entity", ev)}
              ></ha-selector>
              ${current ? html`<div class="hint now">${t.now}: ${current.state}</div>` : nothing}
            </div>
            <ha-icon-button
              .path=${mdiDelete}
              .label=${t.remove}
              @click=${() => this._setRows(this._rows.filter((_, j) => j !== i))}
            ></ha-icon-button>
          </div>
        `;
      })}
      <ha-button @click=${() => (this._rows = [...this._rows, { person: "", entity: "" }])}>
        ${t.add_person}
      </ha-button>
      <ha-selector
        class="pause"
        .hass=${this.hass}
        .selector=${{ number: { min: 0, mode: "box" } }}
        .value=${pause ?? 10}
        .label=${t.interaction_pause}
        @value-changed=${this._pauseChanged}
      ></ha-selector>
    `;
  }

  private _renderSlides(t: Strings) {
    const slides = this._slides;
    const selected = this._selected;
    return html`
      <h3>${t.slides}</h3>
      <div class="tabs" role="tablist">
        ${slides.map(
          (_slide, i) => html`
            <button
              class="tab ${i === selected ? "active" : ""}"
              role="tab"
              aria-selected=${i === selected}
              @click=${() => this._select(i)}
            >
              ${i + 1}
            </button>
          `,
        )}
        <ha-icon-button
          class=${selected === slides.length ? "active" : ""}
          .path=${mdiPlus}
          .label=${t.add_slide}
          @click=${() => this._select(slides.length)}
        ></ha-icon-button>
      </div>
      ${
        selected < slides.length
          ? this._renderSlide(t, slides[selected], selected)
          : this._loaded
            ? html`
                <hui-card-picker
                  .hass=${this.hass}
                  .lovelace=${this.lovelace}
                  @config-changed=${this._cardPicked}
                ></hui-card-picker>
              `
            : nothing
      }
    `;
  }

  private _renderSlide(t: Strings, slide: SlideConfig, index: number) {
    const count = this._slides.length;
    const states = slide.states ?? [];
    return html`
      <div class="toolbar">
        <ha-icon-button
          .disabled=${!this._guiModeAvailable}
          .label=${this._guiMode ? t.show_code : t.show_visual}
          .path=${this._guiMode ? mdiCodeBraces : mdiListBoxOutline}
          @click=${() => this._cardEditor?.toggleMode()}
        ></ha-icon-button>
        <ha-icon-button
          .disabled=${index === 0}
          .label=${t.move_before}
          .path=${mdiChevronLeft}
          @click=${() => this._move(index, -1)}
        ></ha-icon-button>
        <ha-icon-button
          .disabled=${index === count - 1}
          .label=${t.move_after}
          .path=${mdiChevronRight}
          @click=${() => this._move(index, 1)}
        ></ha-icon-button>
        <ha-icon-button
          .label=${t.duplicate}
          .path=${mdiContentCopy}
          @click=${() => this._duplicate(index)}
        ></ha-icon-button>
        <ha-icon-button
          .label=${t.delete}
          .path=${mdiDelete}
          @click=${() => this._delete(index)}
        ></ha-icon-button>
      </div>

      <div class="states">
        <div class="states-title">${t.states}</div>
        <p class="hint">${t.states_hint}</p>
        <div class="row">
          <ha-selector
            .hass=${this.hass}
            .selector=${{ text: {} }}
            .value=${this._newState}
            .label=${t.new_state}
            @value-changed=${(ev: CustomEvent) => {
              ev.stopPropagation();
              this._newState = ev.detail.value ?? "";
            }}
            @keydown=${(ev: KeyboardEvent) => ev.key === "Enter" && this._addState(index)}
          ></ha-selector>
          <ha-icon-button
            .path=${mdiPlus}
            .label=${t.add_state}
            @click=${() => this._addState(index)}
          ></ha-icon-button>
        </div>
        ${states.map(
          (value, k) => html`
            <div class="row">
              <ha-selector
                .hass=${this.hass}
                .selector=${{ text: {} }}
                .value=${value}
                @value-changed=${(ev: CustomEvent) => {
                  ev.stopPropagation();
                  this._setStates(index, (list) =>
                    list.map((s, j) => (j === k ? (ev.detail.value ?? "") : s)),
                  );
                }}
              ></ha-selector>
              <ha-icon-button
                .path=${mdiDelete}
                .label=${t.remove}
                @click=${() => this._setStates(index, (list) => list.filter((_, j) => j !== k))}
              ></ha-icon-button>
            </div>
          `,
        )}
      </div>

      ${
        this._loaded
          ? keyed(
              this._key(index),
              html`
                <hui-card-element-editor
                  .hass=${this.hass}
                  .value=${slide.card}
                  .lovelace=${this.lovelace}
                  @config-changed=${(ev: CustomEvent) => this._cardChanged(index, ev)}
                  @GUImode-changed=${this._guiModeChanged}
                ></hui-card-element-editor>
              `,
            )
          : nothing
      }
    `;
  }

  private _key(index: number): string {
    const key = `${index}-${this._slides.length}`;
    if (!this._keys.has(key)) {
      this._keys.set(key, Math.random().toString());
    }
    return this._keys.get(key)!;
  }

  private _select(index: number): void {
    this._selected = index;
    this._guiMode = true;
    this._guiModeAvailable = true;
    this._newState = "";
  }

  private _basicChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail.value as SwipeCardConfig;
    const config: SwipeCardConfig = { ...this._config!, ...value };
    if (value.start_card == null || (value.start_card as unknown) === "") {
      delete config.start_card;
    }
    if (!value.card_width) {
      delete config.card_width;
    }
    this._emit(config);
  }

  private _parametersChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail.value;
    const config = { ...this._config! };
    if (value && typeof value === "object" && Object.keys(value).length) {
      config.parameters = value;
    } else {
      delete config.parameters;
    }
    this._emit(config);
  }

  private _rowChanged(index: number, field: keyof UserRow, ev: CustomEvent): void {
    ev.stopPropagation();
    const rows = this._rows.map((row) => ({ ...row }));
    rows[index][field] = ev.detail.value ?? "";
    this._setRows(rows);
  }

  private _setRows(rows: UserRow[]): void {
    this._rows = rows;
    this._updateFollow({ users: toUsers(rows) });
  }

  private _pauseChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail.value;
    // 10 is the default; keep the YAML clean.
    const pause = value == null || value === "" || Number(value) === 10 ? undefined : Number(value);
    this._updateFollow({ interaction_pause: pause });
  }

  private _updateFollow(change: Partial<NonNullable<SwipeCardConfig["follow"]>>): void {
    const follow = { ...(this._config!.follow ?? {}), ...change };
    if (!follow.users?.length) {
      delete follow.users;
    }
    if (follow.interaction_pause === undefined) {
      delete follow.interaction_pause;
    }
    const config = { ...this._config! };
    if (Object.keys(follow).length) {
      config.follow = follow;
    } else {
      delete config.follow;
    }
    this._emit(config);
  }

  // New states go to the top of the list, next to the field they came from.
  private _addState(index: number): void {
    const value = this._newState.trim();
    this._newState = "";
    if (value) {
      this._setStates(index, (list) => [value, ...list.filter((s) => s !== value)]);
    }
  }

  private _setStates(index: number, change: (list: string[]) => string[]): void {
    this._setSlides(
      this._slides.map((slide, i) => {
        if (i !== index) {
          return slide;
        }
        const states = change(slide.states ?? []);
        const next: SlideConfig = { ...slide, states };
        if (!states.length) {
          delete next.states;
        }
        return next;
      }),
    );
  }

  private _cardChanged(index: number, ev: CustomEvent): void {
    ev.stopPropagation();
    this._guiModeAvailable = ev.detail.guiModeAvailable ?? true;
    const card = ev.detail.config as LovelaceCardConfig;
    this._setSlides(this._slides.map((slide, i) => (i === index ? { ...slide, card } : slide)));
  }

  private _cardPicked(ev: CustomEvent): void {
    ev.stopPropagation();
    const card = ev.detail.config as LovelaceCardConfig;
    this._keys.clear();
    this._setSlides([...this._slides, { card }]);
    this._select(this._slides.length - 1);
  }

  private _guiModeChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    this._guiMode = ev.detail.guiMode;
    this._guiModeAvailable = ev.detail.guiModeAvailable;
  }

  private _move(index: number, by: number): void {
    const slides = [...this._slides];
    const [slide] = slides.splice(index, 1);
    slides.splice(index + by, 0, slide);
    this._keys.clear();
    this._setSlides(slides);
    this._select(index + by);
  }

  private _duplicate(index: number): void {
    const slides = [...this._slides];
    slides.splice(index + 1, 0, JSON.parse(JSON.stringify(slides[index])));
    this._keys.clear();
    this._setSlides(slides);
    this._select(index + 1);
  }

  private _delete(index: number): void {
    this._keys.clear();
    this._setSlides(this._slides.filter((_, i) => i !== index));
    this._select(Math.max(0, index - 1));
  }

  private _setSlides(slides: SlideConfig[]): void {
    this._emit({ ...this._config!, slides });
  }

  private _emit(config: SwipeCardConfig): void {
    this._config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      }),
    );
  }

  static styles = css`
    ha-form,
    ha-selector {
      display: block;
    }
    h3 {
      margin: 24px 0 4px;
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: 0.9em;
      margin: 0 0 8px;
    }
    .now {
      margin: 6px 0 0 4px;
    }
    .row {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    .row > ha-selector,
    .column {
      flex: 1;
      min-width: 0;
    }
    .row ha-icon-button {
      margin-top: 4px;
    }
    /* Person and entity pickers have their label above the field. */
    .person-row ha-icon-button {
      margin-top: 28px;
    }
    .pause {
      margin-top: 16px;
    }
    .tabs {
      display: flex;
      align-items: center;
      gap: 4px;
      border-bottom: 1px solid var(--divider-color);
      margin-bottom: 8px;
      overflow-x: auto;
    }
    .tab {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--secondary-text-color);
      cursor: pointer;
      font: inherit;
      min-width: 40px;
      padding: 12px 8px 10px;
    }
    .tab.active,
    ha-icon-button.active {
      border-bottom-color: var(--primary-color);
      color: var(--primary-color);
    }
    .toolbar {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 8px;
    }
    .states {
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      margin-bottom: 16px;
      padding: 12px;
    }
    .states-title {
      font-weight: 500;
      margin-bottom: 4px;
    }
  `;
}

if (!customElements.get("ha-swipe-card-editor")) {
  customElements.define("ha-swipe-card-editor", HaSwipeCardEditor);
}
