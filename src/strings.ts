const en = {
  start_card: "Start card",
  card_width: "Card width (CSS, e.g. 300px)",
  follow: "Switch card by entity state",
  follow_hint:
    "Assign an entity to each person. When the entity of the person viewing the dashboard changes state, the slide that lists this state is shown.",
  person: "Person",
  user: "User name or id",
  entity: "Entity",
  now: "Now",
  add_person: "Add person",
  remove: "Remove",
  interaction_pause: "Pause after interaction (seconds, 0 = off)",
  slides: "Slides",
  add_slide: "Add slide",
  states: "States that show this slide",
  states_hint: "Exactly as the entity reports them. States not listed do nothing.",
  new_state: "New state",
  add_state: "Add state",
  show_code: "Show code editor",
  show_visual: "Show visual editor",
  move_before: "Move before",
  move_after: "Move after",
  duplicate: "Duplicate",
  delete: "Delete slide",
  parameters: "Swiper parameters (YAML)",
};

export type Strings = typeof en;

const pl: Strings = {
  start_card: "Karta startowa",
  card_width: "Szerokość karty (CSS, np. 300px)",
  follow: "Przełączanie według stanu encji",
  follow_hint:
    "Przypisz każdej osobie encję. Gdy encja osoby oglądającej dashboard zmieni stan, wyświetli się slajd, który ma ten stan na liście.",
  person: "Osoba",
  user: "Nazwa lub id użytkownika",
  entity: "Encja",
  now: "Teraz",
  add_person: "Dodaj osobę",
  remove: "Usuń",
  interaction_pause: "Pauza po interakcji (sekundy, 0 = wyłączona)",
  slides: "Slajdy",
  add_slide: "Dodaj slajd",
  states: "Stany, które pokazują ten slajd",
  states_hint: "Dokładnie tak, jak podaje je encja. Stany spoza list nic nie zmieniają.",
  new_state: "Nowy stan",
  add_state: "Dodaj stan",
  show_code: "Pokaż edytor kodu",
  show_visual: "Pokaż edytor wizualny",
  move_before: "Przesuń wcześniej",
  move_after: "Przesuń dalej",
  duplicate: "Duplikuj",
  delete: "Usuń slajd",
  parameters: "Parametry Swipera (YAML)",
};

const ALL: Record<string, Strings> = { en, pl };

export function strings(language: string | undefined): Strings {
  const lang = (language || "en").split("-")[0];
  return ALL[lang] || en;
}
