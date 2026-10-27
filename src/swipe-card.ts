import { LitElement, css, html, nothing, unsafeCSS, type PropertyValues } from "lit";
import { state } from "lit/decorators.js";
import { keyed } from "lit/directives/keyed.js";
import { styleMap } from "lit/directives/style-map.js";
import Swiper from "swiper/bundle";
import type { SwiperOptions } from "swiper/types";
import swiperCss from "swiper/css/bundle";

import {
  buildStateIndex,
  initialSlide,
  interactionWait,
  resolveFollowEntity,
  startSlide,
  validateConfig,
} from "./follow";
import type {
  CardHelpers,
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
  SwipeCardConfig,
} from "./types";
import "./editor";

const computeCardSize = async (card: LovelaceCard): Promise<number> => {
  if (typeof card.getCardSize === "function") {
    return card.getCardSize();
  }
  if (!customElements.get(card.localName)) {
    await customElements.whenDefined(card.localName);
    return computeCardSize(card);
  }
  return 1;
};

// Swiper features a YAML user enables by just writing the key
// (`navigation:` -> null) get turned on with their defaults.
const SWITCHES = ["navigation", "pagination", "scrollbar"] as const;

export class SwipeCard extends LitElement {
  @state() private _config?: SwipeCardConfig;
  @state() private _cards: LovelaceCard[] = [];
  // New value = new swiper DOM (config changed).
  @state() private _generation = 0;

  private _hass?: HomeAssistant;
  private _swiper?: Swiper;
  private _cardsReady?: Promise<void>;
  private _buildId = 0;

  private _stateIndex = new Map<string, number>();
  private _followEntity?: string;
  private _followResolved = false;
  private _followState?: string;
  private _followSlide?: number;
  private _lastInteraction?: number;
  private _followTimer?: number;
  private _resetTimer?: number;

  constructor() {
    super();
    // Any touch, click, wheel or key inside the card (inner cards included)
    // counts as an interaction and pauses automatic switching.
    const mark = () => {
      this._lastInteraction = Date.now();
    };
    for (const type of ["pointerdown", "wheel", "keydown"]) {
      this.addEventListener(type, mark, { passive: true });
    }
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("swipe-card-editor");
  }

  static getStubConfig(): Partial<SwipeCardConfig> {
    return { slides: [] };
  }

  setConfig(config: SwipeCardConfig): void {
    this._config = validateConfig(config);
    this._stateIndex = buildStateIndex(this._config.slides);
    this._followResolved = false;
    this._followEntity = undefined;
    this._followState = undefined;
    this._followSlide = undefined;
    this._destroySwiper();
    this._resolveFollow();
    this._cardsReady = this._buildCards();
  }

  set hass(hass: HomeAssistant) {
    const first = !this._hass;
    this._hass = hass;
    for (const card of this._cards) {
      card.hass = hass;
    }
    this._resolveFollow();
    if (this._swiper) {
      this._followStateChange();
    }
    if (first) {
      this.requestUpdate();
    }
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  async getCardSize(): Promise<number> {
    await this._cardsReady;
    const sizes = await Promise.all(this._cards.map(computeCardSize));
    return Math.max(1, ...sizes);
  }

  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 3 };
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._swiper?.update();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this._followTimer);
    window.clearTimeout(this._resetTimer);
  }

  protected render() {
    if (!this._config || !this._hass) {
      return nothing;
    }
    const width = this._config.card_width;
    return keyed(
      this._generation,
      html`
        <div class="swiper" dir=${this._isRtl() ? "rtl" : "ltr"}>
          <div class="swiper-wrapper">
            ${this._cards.map(
              (card) => html`
                <div class="swiper-slide" style=${styleMap(width ? { width } : {})}>${card}</div>
              `,
            )}
          </div>
        </div>
      `,
    );
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (this._swiper) {
      if (changed.has("_cards")) {
        this._swiper.update();
      }
      return;
    }
    if (this._config && this._hass && this._cards.length && this.isConnected) {
      this._initSwiper();
    }
  }

  private _isRtl(): boolean {
    const hass = this._hass!;
    const lang = hass.selectedLanguage || hass.language;
    return Boolean(hass.translationMetadata?.translations[lang]?.isRTL);
  }

  private async _buildCards(): Promise<void> {
    const id = ++this._buildId;
    const helpers = await window.loadCardHelpers?.();
    if (!helpers || id !== this._buildId || !this._config) {
      return;
    }
    this._cards = this._config.slides.map((slide, i) => this._createCard(helpers, slide.card, i));
    this._generation++;
  }

  private _createCard(
    helpers: CardHelpers,
    config: LovelaceCardConfig,
    index: number,
  ): LovelaceCard {
    const card = helpers.createCardElement(config);
    if (this._hass) {
      card.hass = this._hass;
    }
    // A card whose element was not loaded yet asks to be built again.
    card.addEventListener(
      "ll-rebuild",
      (ev) => {
        ev.stopPropagation();
        const cards = [...this._cards];
        cards[index] = this._createCard(helpers, config, index);
        this._cards = cards;
      },
      { once: true },
    );
    return card;
  }

  private _initSwiper(): void {
    const el = this.renderRoot.querySelector<HTMLElement>(".swiper");
    if (!el || !this._config) {
      return;
    }
    const params: SwiperOptions & Record<string, unknown> = JSON.parse(
      JSON.stringify(this._config.parameters ?? {}),
    );
    for (const key of SWITCHES) {
      if (key in params && params[key] == null) {
        params[key] = true;
      }
    }
    // Swiper creates the pagination / navigation / scrollbar elements itself.
    params.createElements ??= true;

    const entityState = this._followEntity
      ? this._hass?.states[this._followEntity]?.state
      : undefined;
    this._followState = entityState;
    if (entityState !== undefined && this._stateIndex.has(entityState)) {
      this._followSlide = this._stateIndex.get(entityState);
    }
    params.initialSlide = initialSlide(this._config, this._stateIndex, entityState);

    this._swiper = new Swiper(el, params);
    if (this._config.reset_after) {
      this._swiper.on("slideChange", () => this._setResetTimer());
      this._swiper.on("touchEnd", () => this._setResetTimer());
      this._swiper.on("click", () => this._setResetTimer());
    }
  }

  private _destroySwiper(): void {
    window.clearTimeout(this._followTimer);
    window.clearTimeout(this._resetTimer);
    this._swiper?.destroy(true, true);
    this._swiper = undefined;
  }

  private _resolveFollow(): void {
    if (this._followResolved || !this._config || !this._hass) {
      return;
    }
    this._followResolved = true;
    this._followEntity = resolveFollowEntity(
      this._config.follow?.users,
      this._hass.user,
      this._hass.states,
    );
  }

  // Act on state changes only; attribute-only updates do nothing.
  private _followStateChange(): void {
    if (!this._followEntity || !this._hass) {
      return;
    }
    const entityState = this._hass.states[this._followEntity]?.state;
    if (entityState === this._followState) {
      return;
    }
    this._followState = entityState;
    if (entityState === undefined || !this._stateIndex.has(entityState)) {
      return;
    }
    this._followSlide = this._stateIndex.get(entityState);
    this._slideToFollow();
  }

  // Slide now, or once the interaction pause has passed.
  private _slideToFollow(): void {
    window.clearTimeout(this._followTimer);
    const wait = interactionWait(
      this._lastInteraction,
      this._config?.follow?.interaction_pause,
      Date.now(),
    );
    if (wait > 0) {
      this._followTimer = window.setTimeout(() => this._slideToFollow(), wait);
      return;
    }
    if (this._swiper && this._followSlide !== undefined) {
      if (this._swiper.activeIndex !== this._followSlide) {
        this._swiper.slideTo(this._followSlide);
      }
    }
  }

  private _setResetTimer(): void {
    window.clearTimeout(this._resetTimer);
    this._resetTimer = window.setTimeout(() => {
      // With follow, return to the last followed slide.
      const target = this._followSlide ?? startSlide(this._config!);
      this._swiper?.slideTo(target);
    }, this._config!.reset_after! * 1000);
  }

  static styles = css`
    :host {
      display: block;
      --swiper-theme-color: var(--primary-color);
    }
    ${unsafeCSS(swiperCss)}
  `;
}

if (!customElements.get("swipe-card")) {
  customElements.define("swipe-card", SwipeCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "swipe-card",
    name: "Swipe Card",
    description:
      "Swipe through cards; can switch the visible card by the state of an entity assigned to the viewer.",
    documentationURL: "https://github.com/cichond/ha-swipe-card",
  });
  console.info(
    `%c SWIPE-CARD %c ${__VERSION__} `,
    "color: white; font-weight: bold; background: #03a9f4",
    "color: white; font-weight: bold; background: dimgray",
  );
}
