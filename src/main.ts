import { AUTO, Game, Scale } from 'phaser';
import './styles/game.css';
import { computeWorldSize, setWorldSize, worldSize } from './game/layout';
import { BootScene } from './game/scenes/BootScene';
import { LoadingScene } from './game/scenes/LoadingScene';
import { MenuScene } from './game/scenes/MenuScene';
import { LevelSelectionScene } from './game/scenes/LevelSelectionScene';
import { SettingsScene } from './game/scenes/SettingsScene';
import { CoinStoreScene } from './game/scenes/CoinStoreScene';
import { DailyTasksScene } from './game/scenes/DailyTasksScene';
import { GameScene } from './game/scenes/GameScene';
import { gameAudio } from './game/audio/GameAudio';
// Registers the active rewarded-ad provider (Yandex Games SDK) at boot.
import './ads/config';
import { syncHudAnchors } from './ui/hudAnchors';

const initialWorld = computeWorldSize(window.innerWidth, window.innerHeight);
setWorldSize(initialWorld);
syncHudAnchors();

const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: initialWorld.width,
    height: initialWorld.height,
    parent: 'game-container',
    backgroundColor: '#050915',
    disableContextMenu: true,
    scale: {
        // A world-sized viewport keeps every scene's coordinates tied to the
        // actual device aspect. Resize recalculates this viewport below.
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH,
        expandParent: true,
    },
    input: {
        // Two active pointers: the primary finger aims/fires while a second
        // touch (multi-gesture) has its own pointer instead of hijacking the
        // first one. With the default of 1 both fingers share a single pointer
        // and releases can be misattributed mid-gesture.
        activePointers: 2,
    },
    render: {
        antialias: true,
        roundPixels: false,
        powerPreference: 'high-performance',
    },
    // The game uses its own tiny Web Audio engine for original, zero-download
    // music and effects. Disabling Phaser's audio manager saves memory.
    audio: {
        noAudio: true,
    },
    scene: [BootScene, LoadingScene, MenuScene, LevelSelectionScene, SettingsScene, CoinStoreScene, DailyTasksScene, GameScene],
};

const unlockAudio = (): void => {
    gameAudio.unlock();
};

window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
window.addEventListener('keydown', unlockAudio, { capture: true });

const startGame = (): void => {
    try {
        const container = document.getElementById('game-container');
        if (!container) {
            console.error('game-container not found');
            return;
        }
        const game = new Game(config);
        let resizeFrame = 0;

        const fitToViewport = (): void => {
            cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(() => {
                const viewport = window.visualViewport;
                const availableWidth = viewport?.width ?? window.innerWidth;
                const availableHeight = viewport?.height ?? window.innerHeight;
                const nextWorld = computeWorldSize(availableWidth, availableHeight);
                const current = worldSize();

                if (nextWorld.width !== current.width || nextWorld.height !== current.height) {
                    setWorldSize(nextWorld);
                    syncHudAnchors();
                }
                game.scale.setGameSize(nextWorld.width, nextWorld.height);
                game.scale.refresh();
            });
        };

        window.addEventListener('resize', fitToViewport, { passive: true });
        window.addEventListener('orientationchange', fitToViewport, { passive: true });
        window.visualViewport?.addEventListener('resize', fitToViewport, { passive: true });
        fitToViewport();
    } catch (e) {
        console.error('Failed to initialize Phaser game:', e);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startGame, { once: true });
} else {
    startGame();
}
