# Bubble Pop Adventure - Design System

> Premium casual Bubble Shooter UI/UX design system. Created for Web (first) and Android (later) via Capacitor.

## Design Direction
- **Style:** Glossy, colorful, premium casual mobile game
- **Theme:** Bright blue/purple fantasy with rounded, bubbly aesthetic
- **Feel:** Friendly cartoon-style, polished and smooth
- **Platform:** Portrait mobile-first (540×960 base), responsive for desktop

## Color Palette
All colors are original and follow the specified palette:

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Primary Blue | `#168BFF` | 22, 139, 255 | Primary buttons, CTAs |
| Deep Blue | `#173A8A` | 23, 58, 138 | Deep accents, borders |
| Purple | `#692BC2` | 105, 43, 194 | Fantasy elements, level map |
| Bright Green | `#38D94A` | 56, 217, 74 | Success/play buttons |
| Gold | `#FFC928` | 255, 201, 40 | Stars, coins, rewards |
| Red | `#FF454F` | 255, 69, 79 | Danger/loss states |
| Light Blue Background | `#8EB8FF` | 142, 184, 255 | Light backgrounds |
| Dark Text | `#17264D` | 23, 38, 77 | Primary text on light |

### Extended Palette (for depth)
| Name | Hex | Usage |
|------|-----|-------|
| Sky Blue | `#8FE3FF` | Highlights, secondary text |
| Cyan Accent | `#4FC8F5` | Interactive elements |
| Violet Glow | `#A855F7` | Magical/fantasy glows |
| Deep Purple BG | `#1E0B3B` | Level map background |
| Midnight Blue | `#050915` | Game background |
| Slate Text | `#9FB7DD` | Secondary UI text |
| Gold Dark | `#F59E0B` | Coin/badge accents |

## Typography
- **Display Font:** `"Arial Black", "Trebuchet MS", Arial, sans-serif` - For game titles, big buttons
- **Body/UI Font:** `"Trebuchet MS", "Segoe UI", Arial, sans-serif` - For body text, HUD, labels
- **Scale:** Use appropriate sizes for 540×960 base resolution
- **Weights:** Bold for display, regular/medium for UI
- **Effects:** Text strokes and shadows for depth on game titles

## Spacing System
Base unit: 4px

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Tight spacing |
| `sm` | 8px | Small gaps |
| `md` | 12px | Default spacing |
| `lg` | 16px | Section spacing |
| `xl` | 24px | Large spacing |
| `2xl` | 32px | Major sections |
| `3xl` | 48px | Hero spacing |

## Border Radius
| Token | Value | Usage |
|-------|-------|-------|
| `sm` | 8px | Small elements |
| `md` | 12px | Cards, inputs |
| `lg` | 16px | Buttons, panels |
| `xl` | 22px | Pills, badges |
| `full` | 9999px | Circular buttons |

## Shadows
| Token | Value | Usage |
|-------|-------|-------|
| `sm` | `0 2px 8px rgba(0, 0, 0, 0.3)` | Subtle elevation |
| `md` | `0 4px 12px rgba(0, 0, 0, 0.4)` | Cards, buttons |
| `lg` | `0 8px 24px rgba(0, 0, 0, 0.5)` | Panels, modals |
| `glow-blue` | `0 0 20px rgba(22, 139, 255, 0.6)` | Blue glow effects |
| `glow-gold` | `0 0 16px rgba(255, 201, 40, 0.5)` | Gold/star glows |

## Gradients

### Button Gradients
- **Play/Success:** `linear-gradient(180deg, #6DFF9B 0%, #38D94A 100%)`
- **Primary CTA:** `linear-gradient(180deg, #4FC8F5 0%, #168BFF 100%)`
- **Gold/Reward:** `linear-gradient(180deg, #FFE38A 0%, #FFC928 100%)`
- **Danger:** `linear-gradient(180deg, #FF6B6B 0%, #FF454F 100%)`

### Background Gradients
- **Game BG:** `radial-gradient(circle at 50% 0%, #1a2f5c 0%, #0b1734 40%, #050915 100%)`
- **Menu BG:** `radial-gradient(circle at 50% 16%, #14244d 0%, #070b16 55%, #02040a 100%)`
- **Level Map BG:** `linear-gradient(180deg, #6D28D9 0%, #4C1D95 50%, #1E0B3B 100%)`

## Component Architecture

### Reusable UI Primitives
Located in `src/ui/design/` (to be created):
- `Button.ts` - Rounded gradient buttons with press/hover states
- `Panel.ts` - Consistent panel containers with borders/glow
- `IconButton.ts` - Circular icon buttons
- `Text.ts` - Typography helpers with stroke/shadow
- `Badge.ts` - Level badges, stars, coins
- `Card.ts` - Level cards, menu cards

### Asset Generation
- All visuals procedurally generated via Canvas/Phaser Graphics (no external images)
- Bubbles, icons, backgrounds created at runtime
- Consistent with existing pattern in `BootScene`

### Layout Principles
- **Game vs UI separation:** Gameplay elements (grid, bubbles, shooter) separate from menu/HUD
- **Responsive:** Use `Scale.FIT` with 540×960 base, handle safe areas
- **Touch targets:** Minimum 44×44px for interactive elements
- **Depth layers:** Use consistent z-depths for proper layering

## Screen Specifications

| Screen | Background | Key Elements | Notes |
|--------|------------|--------------|-------|
| Loading | Midnight gradient | Animated bubbles, logo, progress bar | Quick splash, no loading assets |
| Main Menu | Menu gradient | Logo cluster, play button, settings/sound/music | Coin balance, decorative bubbles |
| Level Selection | Purple fantasy map | Winding path concept, level cards, chapter nav | Star field, chapter headers |
| Gameplay | Blue game gradient | Grid, shooter, HUD, aim guide | Clean, focused on gameplay |
| Settings | Menu gradient | Toggles, reset progress | Consistent with menu style |
| Pause Menu | Overlay on game | Resume, restart, menu buttons | Modal overlay |
| Level Complete | Overlay | Stars, score, next/replay/menu | Celebration feel |
| Level Failed | Overlay | Retry, menu options | Friendly, encouraging |

## Implementation Notes
- Preserve existing working code and architecture
- Fix any incorrect Phaser imports if found (project uses Phaser 4.0.0, not Phaser 3)
- No Tailwind (not installed) - use CSS/Phaser Graphics
- Keep procedural asset generation pattern
- Maintain performance optimizations already in place
- All assets must be original
