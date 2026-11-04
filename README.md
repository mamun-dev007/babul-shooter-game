# Bubble Shooter

A portrait bubble shooter built with **Phaser 4**, **TypeScript** and **Vite**.
Aim with the pointer (or arrow keys), release to fire, and match three or more
bubbles of the same colour. Floating clusters drop automatically. Every level
uses a fixed board and a shot budget: clear every bubble before the shots run
out. Tall boards scroll so the whole layout can be inspected, and stars are
awarded by how few shots were used.

- Bubbles are born in the upper-middle of the playfield: the formation's
  frontier sits at the viewport's vertical midpoint and extends upward, the
  lower half stays open for the shooter's trajectory, and the layout remains
  horizontally centered with consistent hex spacing, never outside the play
  area.
- Tall boards scroll by dragging the board itself (swipe on mobile, mouse drag
  on desktop, mouse wheel) — there are no visible scroll controls, and a
  scrolling gesture never fires a bubble.
- The shot budget of every attempt is computed from the generated puzzle's
  verified shot requirement plus a mistake allowance that shrinks from 85% at
  level 1 to ~23% at level 1000, so accuracy is demanded as levels climb.
- The launcher is fed by a smart queue: it only serves colours that still exist
  on the board, prioritises colours that can complete a match, and when a
  single colour remains both the loaded bubble and the preview become it.
- Consecutive successful shots earn rewards: 10 successful shots in a row grant
  one fireball charge and 5 grant one bomb (a shot that destroys nothing resets
  the counter). At most one of each can be held — no stacking or overwriting —
  and using a stored reward starts a new streak. Counters restart each level.

Every attempt of a level generates a fresh random board: the bubble count,
palette, shot budget and star limits are fixed level configuration, while the
arrangement (pattern, colours, seed) differs on every start and is validated for
solvability before play.

## Project structure

```
bubble-shooter/
├── public/
│   ├── assets/                 # empty placeholders for future art/audio
│   └── favicon.ico             # original glossy-bubble icon
├── legacy-assets/              # old template art, not copied to dist/
├── src/
│   ├── main.ts
│   ├── game/
│   │   ├── audio/GameAudio.ts
│   │   ├── config.ts
│   │   ├── data/               # 1000 level configurations + progress helpers
│   │   ├── input/AimController.ts
│   │   ├── objects/            # Bubble, Shooter
│   │   ├── powerups/           # inventory scaffolding (not wired into play)
│   │   ├── scenes/             # Boot, Loading, Menu, LevelSelection, Settings, Game
│   │   ├── systems/            # Grid, Collision, Match, Level
│   │   └── utils/storage.ts
│   ├── ui/                     # HUD, panels, aim guide, effects, icons
│   └── styles/game.css
├── scripts/sample-random-layouts.mjs
├── scripts/validate-levels.mjs
├── ASSET_CREDITS.md
├── capacitor.config.ts
├── package.json
└── README.md
```

## Visuals and audio

The game has no external art or audio dependency:

- Glossy bubbles, the background, sparks, rings and stars are painted into
  canvas textures at boot.
- The board, shooter, HUD, panels and icons are drawn with Phaser Graphics.
- Shooting, bounce, pop, drop, click, star, win and lose sounds are synthesised
  with Web Audio. The music loop is an original four-bar phrase rendered once
  with `OfflineAudioContext` and looped.
- Sound and music preferences are persisted and respected. Music starts only
  after a real pointer/key gesture, pauses when the page is hidden, and fades
  out when disabled.

All graphics and audio are original. See [`ASSET_CREDITS.md`](ASSET_CREDITS.md)
for licences and provenance.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Aim | Move the mouse, or `A` / `D` / arrow keys | Drag on the board |
| Fire | Click, release, or `Space` | Release the drag |
| Scroll the board | Drag the board vertically, or mouse wheel | Swipe up / down on the board |
| Pause / resume | `P` or the pause button | Pause button |
| Sound on / off | Speaker button in the HUD or menu | Speaker button in the HUD or menu |

## Scripts

```bash
npm install
npm run dev            # Vite dev server on http://localhost:8080
npm run typecheck      # TypeScript check
npm test               # Vitest unit tests
npm run validate:levels # Structural checks for all 1000 level configurations
npm run build          # Production build in dist/
npm run preview        # Serve the production build
node scripts/sample-random-layouts.mjs  # Sample generated boards for key levels
```

## Gameplay and levels

- `GridSystem` owns the hex grid, viewport scrolling, cell positions, snapping,
  neighbour lookups and floating-cluster detection. Fixed boards never add a
  ceiling row or respawn a removed bubble.
- `CollisionSystem` advances the flying bubble with delta-time sub-steps,
  bounces it off the walls and finds the snap cell. Only bubbles inside the
  visible board band are collidable. It also powers the trajectory preview.
- `MatchSystem` resolves same-colour clusters of three or more and removes any
  bubbles that lost their anchor to the top row.
- `LevelSystem` generates a fresh random layout at level start (see
  `data/levels/randomLayout.ts`), then loads the exact configured bubble count,
  shot budget and shot-based star limits. Fixed boards never add a ceiling row
  or respawn a removed bubble at any point afterwards.
- `randomLayout.ts` builds each board from a seeded RNG: one of nine pattern
  archetypes (zigzag, pyramid, diamond, cluster, scattered, wave, asymmetric,
  mixed complex, geometric) weighted by the level's difficulty milestone, with
  randomised colour placement that separates matching colours, pattern/seed
  memory to avoid repeats, and a greedy clearing simulation that rejects boards
  which cannot be finished inside the shot budget.
- `AimController` owns pointer, touch and keyboard input. It enforces the HUD
  dead zone, the upward aim clamp and the "one bubble in flight" rule.
- `BoardScrollController` owns drag/wheel scrolling: a vertical drag moves the
  existing bubbles through `GridSystem.setScrollOffset`, glides with inertia on
  release, and cancels any pending aim/fire so a scroll never shoots. It draws
  nothing — the board itself is the handle.
- `shooterQueue.ts` keeps the launcher aligned with the board: it never serves
  colours that no longer exist, prioritises match-ready colours, and forces the
  remaining colour when only one is left.
- `streakRewards.ts` converts consecutive successful shots into rewards
  (10 → fireball charge, 5 → bomb) with independent counters, a strict
  one-at-a-time cap per reward and resets on any failed shot or new level.
- `storage.ts` keeps best score, highest unlocked level, stars, settings and
  coins in `localStorage`.

The catalogue contains **1000 configurations** across 100 chapters (the first
ten chapters are hand-authored; chapters 11–100 are generated deterministically
from a shared shape/colour configuration system and stamped
`playtested: false`). Bubble counts follow a strictly increasing curve from 50
at level 1 to 1500 at level 1000, difficulty milestones are Normal (1–50),
Medium (51–100), Hard (101–200), Very Hard (201–300), Extreme Hard (301–500),
Very Extreme (501–700), Expert (701–900) and Insane (901–1000). Every level
generates exactly `totalBubbles` once at start. The per-attempt shot budget is
computed by `attemptShotBudgetFor` from the generated board's simulated shot
requirement plus a shrinking mistake allowance (capped by the catalog entry),
and stars are awarded at 50%, 75% and 100% of that attempt budget. `npm run
validate:levels` checks the authored configuration and
`scripts/sample-random-layouts.mjs` samples the runtime generator for the
milestone levels, but neither is a playtest: every level still needs a human
balance pass.

The level-selection map draws all 1000 stops along a snake-like winding road —
one full left/right S-cycle per page of ten nodes with increased spacing, 100 pages deep — and only the
nodes near the viewport are rendered while scrolling.

## Performance notes

- Particle counts and emitter caps scale with the `graphics` quality preference
  (low / medium / high). The default is medium.
- Particle emitters are created once per bubble colour and reused; bursts are
  hard-capped rather than spawning unbounded objects.
- Large matches play a short pop cascade instead of one voice per bubble, and
  the audio engine caps simultaneous voices.
- The aim guide only re-predicts the trajectory when the aim angle or loaded
  colour changes. Board changes invalidate it through the guide's hide/show
  lifecycle.
- The level map uses one static star field instead of dozens of tweened stars.
- The production payload is roughly 1.45 MB raw / 381 KB gzip. Phaser accounts
  for 1.32 MB raw / 342 KB gzip of that; there are no downloaded art or audio
  files beyond the 4.9 KB favicon. The unused template background, logo and
  screenshot are excluded from the production build.
- The canvas renders at 540×960 and is scaled with `Scale.FIT`. This keeps the
  fill rate predictable on low-end phones, at the cost of some softness on
  high-DPI screens.

## Debug overlay

Append `?debug` to the URL or press `F2` during play to toggle an overlay with
the current state, aim angle, pointer position, bubble count and FPS. The active
game scene is also exposed at `window.__debugScene` for quick inspection.
Neither affects gameplay.

## Capacitor (Android / iOS)

The web build is ready to be wrapped with Capacitor:

```bash
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
npm run build
npx cap sync
```

`capacitor.config.ts` already points at `dist` with the app id
`com.example.bubbleshooter`. Change the id and name before publishing.
