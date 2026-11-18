import type { Game, Scene } from 'phaser';
import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

export interface AndroidBackHandler {
    handleAndroidBack(): void;
}

type BackAwareScene = Scene & Partial<AndroidBackHandler>;

const IGNORED_SCENE_KEYS = new Set(['BootScene', 'LoadingScene']);

let listener: PluginListenerHandle | null = null;
let registered = false;
let disposed = false;
let destroyHandler: (() => void) | null = null;

const routeBack = (game: Game): void => {
    const scenes = game.scene.getScenes(true);
    for (let index = scenes.length - 1; index >= 0; index -= 1) {
        const scene = scenes[index];
        if (IGNORED_SCENE_KEYS.has(scene.scene.key)) {
            return;
        }

        // The topmost visible scene owns the event. Never fall through to a
        // lower scene: that could open a second confirmation popup (or exit
        // the app) while an overlay on the current scene is still open.
        const handler = (scene as BackAwareScene).handleAndroidBack;
        if (typeof handler === 'function') {
            handler.call(scene);
        }
        return;
    }
};

export const startAndroidBackNavigation = (game: Game): void => {
    if (registered || !Capacitor.isNativePlatform()) {
        return;
    }
    registered = true;
    disposed = false;

    destroyHandler = () => {
        void stopAndroidBackNavigation();
    };
    window.addEventListener('pagehide', destroyHandler);
    window.addEventListener('beforeunload', destroyHandler);

    void App.addListener('backButton', () => routeBack(game))
        .then((handle) => {
            if (disposed) {
                void handle.remove();
                return;
            }
            listener = handle;
        })
        .catch((error: unknown) => {
            console.warn('[androidBack] Failed to register back button listener:', error);
        });
};

export const stopAndroidBackNavigation = async (): Promise<void> => {
    if (!registered) {
        return;
    }
    registered = false;
    disposed = true;

    if (destroyHandler) {
        window.removeEventListener('pagehide', destroyHandler);
        window.removeEventListener('beforeunload', destroyHandler);
        destroyHandler = null;
    }

    const handle = listener;
    listener = null;
    if (handle) {
        await handle.remove();
    }
};

export const exitAndroidApp = (): void => {
    void App.exitApp().catch((error: unknown) => {
        console.warn('[androidBack] App.exitApp() failed:', error);
    });
};
