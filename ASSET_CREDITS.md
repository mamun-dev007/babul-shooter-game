# Asset credits and licences

This build does not ship any downloaded artwork, sample packs or music files.

## Graphics

Every in-game visual is original and generated at runtime:

- **Bubble, background, spark, ring and star textures** are painted into Phaser canvas textures by `src/game/scenes/BootScene.ts`.
- **Board chrome, shooter, HUD, panels, buttons and icons** are drawn with Phaser Graphics in the scene and UI classes.
- **The favicon** is an original glossy-bubble icon created for this project.

No proprietary graphics from reference screenshots or other games are used. The
old template background (`bg.png`), logo (`logo.png`) and template menu
screenshot (`screenshot.png`) are kept in `legacy-assets/` for reference only
and are not copied into the production build.

## Audio

All audio is original and synthesised at runtime by
`src/game/audio/GameAudio.ts` using the Web Audio API:

- Shooting, bounce, pop, drop, click, star, win and lose effects are built from
  oscillators, filters and generated noise.
- The background music is an original four-bar loop rendered once into a short
  mono buffer with `OfflineAudioContext`, then looped.

There are no WAV/MP3/OGG files in `public/` and no third-party samples.

## Fonts

The UI uses the device's system fonts through the CSS stacks
`"Trebuchet MS", "Segoe UI", Arial, sans-serif` and
`"Arial Black", "Trebuchet MS", Arial, sans-serif`. No font files are bundled or
redistributed.

## Engine

- **Phaser 4.0.0** — MIT licence, Copyright (c) 2025 Phaser Studio Inc.
  The licence text is in [`LICENSE`](LICENSE).

## Verification

- `npm run build` copies only `public/favicon.ico` plus the empty placeholder
  folders under `public/assets/`.
- `npm run validate:levels` checks the 100 level configurations. It does not
  prove gameplay balance; all levels still need human playtesting.
