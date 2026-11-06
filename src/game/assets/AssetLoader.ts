import { Scene } from 'phaser';

export class AssetLoader {
    private scene: Scene;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    preload(): void {
        // Loading artwork
        this.scene.load.image('loading-background', 'assets/backgrounds/loading.png');

        // Main menu artwork
        this.scene.load.image('bg-menu', 'assets/backgrounds/main-menu.png');

        // Gameplay background artwork
        this.scene.load.image('bg-game', 'assets/backgrounds/gameplay.jpg.png');

        // Level map artwork
        this.scene.load.image('bg-level-map', 'assets/backgrounds/level.png');

        // Logo
        this.scene.load.svg('logo-main', 'assets/logo/bubble-shooter-logo.svg', { width: 512, height: 256 });
        
        // Bubbles
        this.scene.load.svg('bubble-red-svg', 'assets/bubbles/bubble-red.svg', { width: 64, height: 64 });
        this.scene.load.svg('bubble-blue-svg', 'assets/bubbles/bubble-blue.svg', { width: 64, height: 64 });
        this.scene.load.svg('bubble-green-svg', 'assets/bubbles/bubble-green.svg', { width: 64, height: 64 });
        this.scene.load.svg('bubble-yellow-svg', 'assets/bubbles/bubble-yellow.svg', { width: 64, height: 64 });
        this.scene.load.svg('bubble-purple-svg', 'assets/bubbles/bubble-purple.svg', { width: 64, height: 64 });
        
        // Icons
        this.scene.load.svg('icon-star', 'assets/icons/icon-star-gold.svg', { width: 48, height: 48 });
        this.scene.load.svg('icon-coin', 'assets/icons/icon-coin.svg', { width: 48, height: 48 });
        this.scene.load.svg('icon-play', 'assets/icons/icon-play.svg', { width: 64, height: 64 });
        this.scene.load.svg('icon-settings', 'assets/icons/icon-settings-gear.svg', { width: 48, height: 48 });
        this.scene.load.svg('icon-sound', 'assets/icons/icon-sound.svg', { width: 48, height: 48 });
        this.scene.load.svg('icon-music', 'assets/icons/icon-music.svg', { width: 48, height: 48 });
        this.scene.load.svg('icon-pause', 'assets/icons/icon-pause.svg', { width: 48, height: 48 });
        this.scene.load.svg('icon-lock', 'assets/icons/icon-lock.svg', { width: 48, height: 48 });
        this.scene.load.svg('icon-unlock', 'assets/icons/icon-unlock.svg', { width: 48, height: 48 });
        this.scene.load.svg('icon-level-marker', 'assets/icons/icon-level-marker.svg', { width: 48, height: 56 });
        
        // Power-ups
        this.scene.load.svg('powerup-bomb', 'assets/icons/powerup-bomb.svg', { width: 56, height: 56 });
        // ?v=3 cache-buster: the small plus badge on the glossy bubble was
        // removed; the query forces every browser to fetch the new file
        // instead of a cached copy of the old artwork.
        this.scene.load.svg('powerup-color', 'assets/icons/powerup-color-changer.svg?v=3', { width: 56, height: 56 });
        this.scene.load.svg('powerup-lightning', 'assets/icons/powerup-lightning.svg', { width: 56, height: 56 });
        this.scene.load.svg('powerup-fireball', 'assets/icons/powerup-fireball.svg', { width: 56, height: 56 });
        this.scene.load.svg('icon-fire', 'assets/icons/icon-fire.svg', { width: 56, height: 56 });
        
        // UI
        this.scene.load.svg('ui-button-primary', 'assets/ui/button-primary.svg', { width: 320, height: 86 });
        this.scene.load.svg('ui-button-play', 'assets/ui/button-play-green.svg', { width: 320, height: 86 });
        this.scene.load.svg('ui-button-gold', 'assets/ui/button-gold.svg', { width: 320, height: 86 });
        this.scene.load.svg('ui-panel', 'assets/ui/panel-glass.svg', { width: 400, height: 200 });
        this.scene.load.svg('ui-loading-bar', 'assets/ui/loading-bar.svg', { width: 280, height: 24 });
    }
}
