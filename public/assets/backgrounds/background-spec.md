# Background Artwork Specifications

## Backgrounds Requiring Image Generation

The following backgrounds are too complex for clean vector reproduction and require AI image generation or hand-crafted raster artwork. Use the specifications below with a separate image generation step.

### 1. Game Background (Gameplay)
**File:** `background-game.png` (or `background-game.webp`)
**Dimensions:** 540 × 960 px (portrait, mobile-optimized)
**Format:** PNG/WebP with transparency considerations

**Description:**
- Bright blue gradient sky/background suitable for bubble shooter gameplay
- Subtle cloud formations or bokeh effects
- Gentle vertical gradient from lighter blue at top to deeper blue at bottom
- Soft, dreamy atmosphere that doesn't distract from colorful bubbles
- Clean, uncluttered design

**Color Palette:**
- Top: `#8EB8FF` (light blue)
- Middle-top: `#5B9BFF` 
- Middle: `#3A86FF`
- Bottom: `#1E4A8A` / `#173A8A` (deeper blue)
- Accent: subtle white/cream cloud wisps

**Style:** Clean, minimal, premium casual game background

---

### 2. Level Selection Map Background
**File:** `background-level-map.png` (or `background-level-map.webp`)
**Dimensions:** 540 × 960 px (portrait)
**Format:** PNG/WebP

**Description:**
- Purple fantasy theme matching level selection
- Rolling hills or floating islands
- Winding path/road that connects level markers
- Mystical elements: stars, sparkles, magical foliage
- Rich purple/violet color scheme
- Atmospheric lighting with soft glows

**Color Palette:**
- Sky top: `#6D28D9` (violet)
- Sky middle: `#4C1D95` (deep purple)
- Ground/far: `#1E0B3B` (very deep purple)
- Accents: `#A855F7`, `#C084FC` (magical glows)
- Path: golden/amber stone path
- Decorative: soft pink/magenta highlights

**Style:** Whimsical fantasy, but polished for mobile game

---

### 3. Menu Background (Enhanced)
**File:** `background-menu.png` (or `background-menu.webp`)
**Dimensions:** 540 × 960 px (portrait)
**Format:** PNG/WebP

**Description:**
- Enhanced version of current menu background
- More atmospheric with subtle particle effects
- Could include floating bubbles in background
- Gentle gradient with depth
- Cohesive with overall theme

**Note:** Current implementation uses gradient + procedural bubbles. This is an optional enhancement.

---

## Generation Guidelines
- Use AI image tools (DALL-E, Midjourney, Stable Diffusion, Bing Image Creator) or professional illustration
- Maintain consistent art style across all backgrounds
- Optimize for mobile (keep file size reasonable, < 200KB each if possible)
- Ensure backgrounds don't interfere with UI readability
- Test at various screen sizes
- All artwork must be original (no copyrighted game assets)

## Integration Notes
Once generated, place in `public/assets/backgrounds/` and update `BootScene.ts` or relevant scenes to load them as textures.
