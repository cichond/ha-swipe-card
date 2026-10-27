// The parts of Home Assistant's frontend objects this card uses.

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface HassUser {
  id: string;
  name: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  user?: HassUser;
  language: string;
  translationMetadata?: {
    translations: Record<string, { isRTL?: boolean }>;
  };
  selectedLanguage?: string;
}

export interface LovelaceCardConfig {
  type: string;
  [key: string]: unknown;
}

export interface LovelaceCard extends HTMLElement {
  hass?: HomeAssistant;
  getCardSize?(): number | Promise<number>;
}

export interface CardHelpers {
  createCardElement(config: LovelaceCardConfig): LovelaceCard;
}

/** One person (or HA user) and the entity whose state they follow. */
export interface FollowUser {
  /** `person.*` entity; matched by its `user_id` attribute. */
  person?: string;
  /** Home Assistant user name or user id (alternative to `person`). */
  user?: string;
  entity: string;
}

export interface FollowConfig {
  users?: FollowUser[];
  /** Seconds without automatic switching after an interaction; default 10. */
  interaction_pause?: number;
}

export interface SlideConfig {
  card: LovelaceCardConfig;
  /** States of the followed entity that show this slide. */
  states?: string[];
}

export interface SwipeCardConfig {
  type: string;
  slides: SlideConfig[];
  start_card?: number;
  card_width?: string;
  reset_after?: number;
  parameters?: Record<string, unknown>;
  follow?: FollowConfig;
}

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<CardHelpers>;
    customCards?: Array<Record<string, unknown>>;
  }
  const __VERSION__: string;
}
