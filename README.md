# HA Swipe Card

A Lovelace card that puts several cards in a touch slider ([Swiper](https://swiperjs.com/)) and can switch the
visible slide by itself, based on the state of an entity assigned to the person viewing the dashboard.

## Features

- Swipe through any Lovelace cards. Every [Swiper parameter](https://swiperjs.com/swiper-api#parameters) is
  available: effects (coverflow, cube, fade, flip, cards, creative), pagination, arrows, scrollbar, slides per
  view, loop, autoplay, keyboard and mouse wheel control…
- **Switch slide by entity state.** Each person gets an entity; when the entity of the person looking at the
  dashboard changes to a state listed on a slide, the slider moves to that slide.
- **Interaction pause.** After the viewer touches, clicks or scrolls the card, it does not move by itself for a
  while (10 s by default).
- **Visual editor** for everything: options, persons and their entities, slides (Home Assistant's own card
  editor and card picker in tabs) with the states that show them, Swiper parameters as YAML.

## Installation

### HACS

1. HACS → ⋮ → **Custom repositories** → `https://github.com/cichond/ha-swipe-card`, type **Dashboard**.
2. Install **HA Swipe Card** and reload the browser.

### Manual

1. Download `ha-swipe-card.js` from the [latest release](https://github.com/cichond/ha-swipe-card/releases/latest)
   to `/config/www/`.
2. Settings → Dashboards → ⋮ → **Resources** → add `/local/ha-swipe-card.js` as a **JavaScript module**.
3. Reload the browser.

The browser console shows `HA-SWIPE-CARD <version>` when the card is loaded.

## Configuration

```yaml
type: custom:ha-swipe-card
slides:
  - card:
      type: entity
      entity: sensor.outside_temperature
  - card:
      type: entity
      entity: sensor.outside_humidity
parameters:
  pagination:
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `slides` | list | **required** | The slides, see below. |
| `start_card` | number | `1` | Slide shown when the dashboard opens (1-based), unless `follow` selects one. |
| `card_width` | string | | CSS width of every slide, e.g. `300px` or `80%`. Use with `slidesPerView: auto`. |
| `reset_after` | number | | Seconds after the last swipe or click before the card returns to `start_card` (or to the slide selected by `follow`). |
| `parameters` | object | | [Swiper parameters](#swiper-parameters). |
| `follow` | object | | [Switch slide by entity state](#switch-slide-by-entity-state). |

### Slides

| Option | Type | Description |
| --- | --- | --- |
| `card` | object | **Required.** Any Lovelace card configuration. |
| `states` | list | States of the followed entity that show this slide. |

## Switch slide by entity state

```yaml
type: custom:ha-swipe-card
follow:
  users:
    - person: person.alice
      entity: input_select.alice_view
    - user: Bob
      entity: sensor.bob_mode
  interaction_pause: 10
slides:
  - card: { type: markdown, content: Overview }
    states: [overview, idle]
  - card: { type: markdown, content: Media }
    states: [media]
  - card: { type: markdown, content: Climate }
    states: [climate, heating]
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `users` | list | | `person` (a `person.*` entity) or `user` (Home Assistant user name or id), and `entity` (any entity). |
| `interaction_pause` | number | `10` | Seconds after an interaction during which the card does not move by itself; `0` turns the pause off. |

How it works:

- The card uses the entry of the **logged-in user**. A `person` entry matches the user linked to that person
  (its `user_id`), so renaming the user changes nothing. The first matching entry wins.
- When the dashboard opens, the card shows the slide that lists the entity's current state.
- When the entity **changes** to a listed state, the slider moves to that slide. Updates that do not change the
  state (only attributes) do nothing, so a slide you swiped to stays until the state changes again.
- States that are not listed — including `unknown` and `unavailable` — do nothing.
- States are compared exactly as the entity reports them. If two slides list the same state, the first wins.
- A user without an entry gets `start_card`.

### Interaction pause

Any touch, click, mouse wheel or key press inside the card — including the cards inside it — counts as an
interaction. For `interaction_pause` seconds after the last one the card does not move by itself. A state change
during the pause is applied once the pause has passed without another interaction.

## Visual editor

- **Start card** and **card width** (`reset_after` is set in YAML).
- **Switch slide by entity state:** a row per person with a person picker and an entity picker; the entity's
  current state is shown under it, which helps to type exact state names. The interaction pause.
- **Slides:** one tab per slide and **+** to add a slide with Home Assistant's card picker. Each slide has a
  toolbar (visual/code editor, move, duplicate, delete), its states (a field for a new state on top, Enter or **+**
  adds it) and the card editor.
- **Swiper parameters** as YAML.

## Swiper parameters

`parameters` is passed to Swiper (version 14) as is, so any of its options works. Writing `navigation:`,
`pagination:` or `scrollbar:` without a value turns the feature on with its defaults; the card creates the
elements.

```yaml
# arrows and a progress bar
parameters:
  navigation:
  pagination:
    type: progressbar
```

```yaml
# coverflow with fixed-width slides
card_width: 300px
parameters:
  effect: coverflow
  grabCursor: true
  centeredSlides: true
  slidesPerView: auto
  coverflowEffect:
    rotate: 50
    depth: 100
    slideShadows: true
```

```yaml
# two slides at once, endless, change every 5 s
parameters:
  slidesPerView: 2
  spaceBetween: 16
  loop: true
  autoplay:
    delay: 5000
```

## Development

```bash
npm install
npm run check   # typecheck, tests, build -> dist/ha-swipe-card.js
npm run watch   # rebuild on change
```

- `src/follow.ts` — config validation and the follow logic (no DOM)
- `src/ha-swipe-card.ts` — the card
- `src/editor.ts`, `src/strings.ts` — the visual editor and its texts (English, Polish)

Releases: bump `version` in `package.json`, push a `vX.Y.Z` tag. The release workflow runs the checks and
attaches `ha-swipe-card.js` to the GitHub release, which HACS installs.

## License

MIT. Inspired by [swipe-card](https://github.com/bramkragten/swipe-card) by Bram Kragten.
