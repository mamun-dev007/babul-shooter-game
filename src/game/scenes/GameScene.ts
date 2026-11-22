import { Math as PhaserMath, Scene } from 'phaser';
import {
    BOARD_VIEW_BOTTOM,
    BOARD_VIEW_TOP,
    BUBBLE_DIAMETER,
    BUBBLE_RADIUS,
    GAME_HEIGHT,
    GAME_WIDTH,
    FONT_DISPLAY,
    LAUNCH_SPEED,
    SHOOTER_Y,
    WALL_LEFT,
    WALL_RIGHT,
    type BubbleColorName,
} from '../config';
import { loadPowerUpInventory, consumePowerUp, grantPowerUp, getPowerUpQuantity } from '../powerups/inventory';
import { emptyFireChargeProgress, resolveFireChargeProgress } from '../systems/fireChargeProgress';
import type { PowerUpInventory } from '../powerups/inventory';
import { AimController } from '../input/AimController';
import { Bubble } from '../objects/Bubble';
import { Shooter } from '../objects/Shooter';
import { CollisionSystem } from '../systems/CollisionSystem';
import { GridSystem } from '../systems/GridSystem';
import { LevelSystem } from '../systems/LevelSystem';
import { MatchSystem } from '../systems/MatchSystem';
import { computeShooterQueueUpdate, pickRandomDifferentColor, pickSmartShooterColor, type ColorStat } from '../systems/shooterQueue';
import { levelOutcomeFor } from '../data/levels/scoring';
import { addCoins, loadProgress, takePendingBonusShots, recordScore, markLevelCompleted, toggleMusic, toggleSound } from '../utils/storage';
import { CHAIN_REACTION_MIN_BUBBLES, EFFICIENT_SHOT_LIMIT, recordDailyEvent } from '../daily/dailyTasks';
import { AimGuide } from '../../ui/AimGuide';
import { SettingsPanel } from '../../ui/SettingsPanel';
import { extraBallsRewardFor, showRewardedAd } from '../../ads/rewardedAds';
import { hideBannerAd, recordLevelCompletedForInterstitial, showInterstitialAd } from '../../services/admob';
import { gameAudio, installUiAudio } from '../audio/GameAudio';
import { BoardScrollController } from '../input/BoardScrollController';
import { isModalInputLocked, resetModalInputLock } from '../input/modalInputLock';
import { GameOverPanel } from '../../ui/GameOverPanel';
import { HUD, type PowerUpId } from '../../ui/HUD';
import { PausePanel } from '../../ui/PausePanel';
import { BackConfirmationPanel } from '../../ui/BackConfirmationPanel';
import { clearTransition, goToSceneInstant } from './transitions';
import { bubbleTexture } from '../config';
import { acquireModalInputLock, releaseModalInputLock } from '../input/modalInputLock';
import {
    INTRO_BUBBLE_RISE_MS,
    INTRO_POPUP_ENTER_EASE,
    INTRO_POPUP_ENTER_MS,
    INTRO_POPUP_EXIT_EASE,
    INTRO_POPUP_EXIT_MS,
    INTRO_POPUP_HOLD_MS,
    INTRO_BUBBLE_RISE_EASE,
    introBubbleRiseOffset,
    introPopupEnterX,
    introPopupExitX,
} from './levelIntroAnimation';

interface GameSceneData {
    level?: number;
    snapshot?: import('../utils/gameplaySnapshot').GameplaySnapshot;
}

type ShotPower = 'bomb' | 'fireball' | null;

const POWER_UP_INVENTORY_KEY: Record<PowerUpId, keyof PowerUpInventory> = {
    bomb: 'bomb',
    colorChanger: 'colorChanger',
    lightning: 'lightning',
    fireball: 'fireball',
};

export class GameScene extends Scene {
    private levelSystem = new LevelSystem();
    private grid!: GridSystem;
    private collision!: CollisionSystem;
    private matchSystem!: MatchSystem;
    private shooter!: Shooter;
    private aimGuide!: AimGuide;
    private aimController!: AimController;
    private hud!: HUD;
    private boardScroll: BoardScrollController | null = null;
    private boardMaskShape: Phaser.GameObjects.Graphics | null = null;
    private pausePanel: PausePanel | null = null;
    private leaveGamePanel: BackConfirmationPanel | null = null;
    private get anyModalOpen(): boolean {
        return (
            isModalInputLocked() ||
            this.paused ||
            (this.settingsPanel?.isOpen ?? false) ||
            (this.gameOverPanel?.isOpen ?? false)
        );
    }
    private settingsPanel: SettingsPanel | null = null;
    private gameOverPanel!: GameOverPanel;
    private activeBubble: Bubble | null = null;
    private projectileIcon: Phaser.GameObjects.Image | null = null;
    private fireTrail: Phaser.GameObjects.Graphics | null = null;
    private fireParticleAccumulator = 0;
    private bubbleVelocity = { x: 0, y: 0 };
    private score = 0;
    private paused = false;
    private pauseRestarting = false;
    private ended = false;
    private currentLevelIndex = 0;
    private activeShotPower: ShotPower = null;
    private dropAfterShot = false;
    private boardUpdatesPending = 0;
    /** Cached Bomb availability flag, always synced to shared inventory. */
    private availableBombs = 0;
    private pendingShotDirectRemoved = 0;
    private pendingShotUnsupportedRemoved = 0;
    private shotResultRecorded = false;
    private pendingShotPower: ShotPower | 'lightning' = null;
    /** Fire charge cycle (1/3 successful normal shots) gated on empty stock. */
    private fireChargeProgressState = emptyFireChargeProgress();
    /** True while a bomb projectile is armed/launched; prevents duplicate launches. */
    private bombLaunchInFlight = false;
    /** Lock for the rewarded extra-balls flow; guards duplicate claims. */
    private extraBallsInProgress = false;
    /** True once this attempt's +5 completion coins have been paid out. */
    private completionRewardGranted = false;
    /** Daily Tasks: any power-up actually spent during this level attempt. */
    private levelPowerUsed = false;
    /** Daily Tasks: bubbles cleared in the current run of non-missing shots. */
    private streakBubbles = 0;
    private introPopup: Phaser.GameObjects.Container | null = null;
    private introBlocker: Phaser.GameObjects.Rectangle | null = null;
    private introHoldTimer: Phaser.Time.TimerEvent | null = null;
    private introRise: {
        readonly bubbles: Bubble[];
        readonly finalYs: number[];
        readonly state: { offset: number };
    } | null = null;
    private introEpoch = 0;
    private introLockHeld = false;
    /** Bumped on shutdown so a completed ad callback can't pay into a new attempt. */
    private extraBallsAdEpoch = 0;
    private selectedPower: ShotPower = null;

    constructor() {
        super('GameScene');
    }

    create(data?: GameSceneData): void {
        // Repeated Gameplay entries must always start from a clean timing/modal
        // state. A previous attempt can be left paused (e.g. exited from the
        // pause menu), which would freeze intro tweens/timers and wedge input.
        this.time.paused = false;
        this.time.removeAllEvents();
        this.tweens.killAll();
        // Start every attempt with a clean modal lock so a stale popup from
        // a previous scene can never wedge gameplay input. Popups register
        // themselves in the lock while they are visible.
        resetModalInputLock();
        clearTransition(this);
        void hideBannerAd();
        installUiAudio(this);
        gameAudio.setMusicMode('gameplay');
        // Only the top-most interactive object (dim overlay, popup buttons)
        // may receive a pointer event, so popup clicks cannot fall through
        // to the HUD/board underneath.
        this.input.topOnly = true;
        const requestedLevel = data?.level;
        this.currentLevelIndex =
            typeof requestedLevel === 'number' && Number.isFinite(requestedLevel)
                ? requestedLevel
                : 0;
        this.levelSystem.load(this.currentLevelIndex);
        this.score = 0;
        this.paused = false;
        this.pauseRestarting = false;
        this.ended = false;
        this.introPopup = null;
        this.introBlocker = null;
        this.introHoldTimer = null;
        this.introRise = null;
        this.introLockHeld = false;
        this.completionRewardGranted = false;
        this.levelPowerUsed = false;
        this.streakBubbles = 0;
        this.activeBubble = null;
        this.projectileIcon = null;
        this.fireTrail = null;
        this.activeShotPower = null;
        this.dropAfterShot = false;
        this.boardUpdatesPending = 0;
        this.pendingShotDirectRemoved = 0;
        this.pendingShotUnsupportedRemoved = 0;
        this.shotResultRecorded = false;
        this.pendingShotPower = null;
        this.availableBombs = getPowerUpQuantity('bomb');
        this.bombLaunchInFlight = false;
        this.selectedPower = null;
        this.boardScroll = null;
        this.boardMaskShape = null;
        this.settingsPanel = new SettingsPanel(this);

        this.cameras.main.setBackgroundColor('#94d8ff');
        const background = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg-game');
        const coverScale = Math.max(GAME_WIDTH / background.width, GAME_HEIGHT / background.height);
        background.setScale(coverScale);
        const visibleWidth = GAME_WIDTH / coverScale;
        const visibleHeight = GAME_HEIGHT / coverScale;
        background.setCrop(
            (background.width - visibleWidth) / 2,
            (background.height - visibleHeight) / 2,
            visibleWidth,
            visibleHeight
        );
        background.setDepth(-20);

        this.grid = new GridSystem(this);
        this.boardMaskShape = this.make.graphics({ x: 0, y: 0 });
        this.boardMaskShape.fillStyle(0xffffff, 1);
        this.boardMaskShape.fillRect(
            0,
            BOARD_VIEW_TOP,
            GAME_WIDTH,
            BOARD_VIEW_BOTTOM - BOARD_VIEW_TOP
        );
        this.grid.setMask(this.boardMaskShape.createGeometryMask());
        // Progression boards are fixed: no ceiling rows are ever added after
        // the initial deterministic layout.
        this.grid.setCeilingDropsEnabled(false);
        this.collision = new CollisionSystem(this.grid);
        this.matchSystem = new MatchSystem(this.grid);
        this.levelSystem.buildBoard(this.grid);
        // Purchased bonus shots (Coin Store) apply to this attempt exactly
        // once, then clear so they can never pay out twice.
        const pendingShots = takePendingBonusShots();
        if (pendingShots > 0) {
            this.levelSystem.addExtraShots(pendingShots);
        }
        // Fire charge cycle: 1/3 successful normal shots (grants only at 0 stock).
        this.fireChargeProgressState = emptyFireChargeProgress(this.levelSystem.maxShots);
        // The formation starts in the upper-middle of the playfield: its
        // frontier sits at the viewport's vertical midpoint and the mass
        // extends upward, leaving the lower half clear for the shooter and
        // trajectory. Bubbles are born horizontally centered and never outside
        // the playable area; nothing is generated later and the board keeps
        // this fixed position — user input never moves it.
        this.grid.followBoard();
        // The bubble formation is FIXED on every device: touch drag, swipe,
        // mouse drag, mouse wheel and trackpad pan can never move the board.
        // `canScroll: () => false` makes every scroll path on the controller
        // inert — the grid is only repositioned by followBoard() between
        // shots, never by user input. The controller stays registered because
        // its wheel handling still swallows trackpad pinch zoom (ctrl+wheel),
        // which must never scale the board or the page.
        this.boardScroll = new BoardScrollController(this, {
            grid: this.grid,
            canScroll: () => false,
        });

        this.shooter = new Shooter(this, GAME_WIDTH / 2, SHOOTER_Y);
        this.shooter.setColorPool([...this.levelSystem.level.colors]);
        this.shooter.setColorPicker(() => {
            const stats = this.boardColorStats();
            const picked = pickSmartShooterColor(stats, this.shooter.currentColor);
            return picked ?? this.levelSystem.randomColor();
        });
        this.aimGuide = new AimGuide(this, this.shooter, this.collision);
        this.gameOverPanel = new GameOverPanel(this);
        this.hud = new HUD(this, {
            onPause: () => this.togglePause(),
            onPowerUp: (powerUp) => this.activatePowerUp(powerUp),
            onPlusButton: () => this.openCoinStoreFromPlus(),
        });

        const limits = this.levelSystem.shotStarLimits;
        this.hud.setLevel(
            this.levelSystem.levelNumber,
            this.levelSystem.level.name,
            this.levelSystem.objectiveLabel,
            [limits.threeStarLimit, limits.twoStarLimit, limits.oneStarLimit]
        );
        this.refreshPowerUpCounts();
        this.syncShooterColors();
        // Coin Store round-trip: restore the exact attempt left behind.
        if (data?.snapshot) {
            this.applySnapshot(data.snapshot);
        }
        // Level intro banner on fresh level entries (not on store return).
        if (!data?.snapshot) {
            this.showLevelIntro();
        }

        // The aim band follows the responsive layout: it spans exactly from
        // the top Progress Bar's bottom edge (aimBandTopY) down to the
        // launcher's topmost edge (aimBandBottomY), so touch and mouse aiming
        // stay strictly inside that strip while the Progress Bar, HUD, launcher
        // and bottom controls remain fixed and non-aimable.
        this.aimController = new AimController(this, {
            shooter: this.shooter,
            canAim: () =>
                !this.anyModalOpen &&
                !this.ended &&
                !(this.boardScroll?.isDragging ?? false),
            canFire: () =>
                !this.anyModalOpen &&
                !this.ended &&
                this.activeBubble === null &&
                !this.boardScroll?.isEngaged &&
                this.levelSystem.canShoot,
            onFire: () => this.fireBubble(),
            onPause: () => this.togglePause(),
        });

        this.shooter.setOnBubbleSwap(() => {
            if (this.anyModalOpen || this.ended || this.activeBubble || this.selectedPower) {
                // Also blocked during Fire Launcher Mode: the bubble icon is
                // hidden behind the flame, so slot swaps must not happen.
                return false;
            }
            this.aimController.cancelPointerInput();
            gameAudio.playSfx('swap');
            return true;
        });

        this.refreshHud();
        if (loadProgress().aimGuide !== false) {
            this.aimGuide.show();
        }

        this.events.once('shutdown', this.handleShutdown, this);
    }

    /**
     * Restores a Gameplay attempt captured before a Coin Store round-trip.
     * Board, score, shots, shooter colours and selected power return exactly
     * as left; inventories/coins are shared stores, re-read here.
     */
    private applySnapshot(snapshot: import('../utils/gameplaySnapshot').GameplaySnapshot): void {
        this.score = snapshot.score;
        this.grid.restoreCells(snapshot.cells);
        this.grid.followBoard();
        this.levelSystem.restoreShotsUsed(snapshot.shotsUsed);
        this.shooter.setCurrentColor(snapshot.currentColor);
        this.shooter.setNextColor(snapshot.nextColor);
        this.fireChargeProgressState = snapshot.fireCharge;
        this.levelPowerUsed = snapshot.levelPowerUsed === true;
        this.streakBubbles = Math.max(0, Math.floor(snapshot.streakBubbles ?? 0));
        this.selectedPower = null;
        if (snapshot.selectedPower) {
            this.selectPower(snapshot.selectedPower);
        }
        this.refreshPowerUpCounts();
    }

    /** Plus-badge navigation: stops Gameplay instantly and opens the existing
     * Coin Store, handing it a snapshot of this attempt. Coin Store Back
     * hands the snapshot straight back, so the attempt resumes exactly as
     * left (level, board, shooter, score, shots, selected power) with no
     * level restart — inventories/coins live in shared persistent stores.
     * Ignored while a bubble is flying or the level has ended.
     */
    private openCoinStoreFromPlus(): void {
        if (this.paused || this.ended || this.activeBubble || this.bombLaunchInFlight || this.settingsPanel?.isOpen) {
            return;
        }
        const snapshot: import('../utils/gameplaySnapshot').GameplaySnapshot = {
            level: this.currentLevelIndex,
            score: this.score,
            shotsUsed: this.levelSystem.shotsUsedCount,
            cells: this.grid.getBubbles().map((bubble) => ({ row: bubble.row, col: bubble.col, color: bubble.color })),
            currentColor: this.shooter.currentColor,
            nextColor: this.shooter.nextColor,
            selectedPower: this.selectedPower,
            fireCharge: this.fireChargeProgressState,
            levelPowerUsed: this.levelPowerUsed,
            streakBubbles: this.streakBubbles,
        };
        goToSceneInstant(this, 'CoinStoreScene', {
            returnTo: 'GameScene',
            level: this.currentLevelIndex,
            instant: true,
            snapshot,
        });
    }

    update(_time: number, delta: number): void {
        this.aimController.update(delta);
        this.boardScroll?.update(delta);

        if (this.paused || this.ended) {
            return;
        }

        if (this.activeBubble) {
            if (this.activeShotPower === 'fireball') {
                this.moveFireball(delta);
            } else {
                const impact = this.collision.step(
                    this.activeBubble,
                    this.bubbleVelocity,
                    delta,
                    () => gameAudio.playSfx('bounce')
                );

                if (impact) {
                    this.resolveImpact(impact.hitCell);
                }
            }

            if (this.activeBubble) {
                this.projectileIcon?.setPosition(this.activeBubble.x, this.activeBubble.y);
                this.projectileIcon?.setRotation(this.projectileIcon.rotation + delta * 0.006);
                this.drawFireTrail();

                if (this.activeShotPower === 'fireball' && this.activeBubble.y <= BUBBLE_RADIUS) {
                    this.resolveImpact(null);
                } else if (this.activeBubble.y > GAME_HEIGHT + BUBBLE_RADIUS) {
                    this.resolveImpact(null);
                }
            }
        }

        if (!this.activeBubble && loadProgress().aimGuide !== false) {
            this.aimGuide.show();
        } else if (loadProgress().aimGuide === false) {
            this.aimGuide.hide();
        }
    }

    private activatePowerUp(powerUp: PowerUpId): boolean {
        if (this.anyModalOpen || this.ended) {
            return false;
        }
        // swaps the loaded bubble to a fresh random colour; once spent the
        // button stays the rewarded-ad entry it already was (one full video
        // pays exactly 3 extra shots — see requestExtraBalls).
        if (powerUp === 'colorChanger') {
            if (this.changeShooterColor()) {
                this.levelPowerUsed = true;
                return true;
            }

            this.requestExtraBalls();
            return false;
        }

        if (this.activeBubble) {
            return false;
        }

        // Every power-up that fires something consumes a shot; selecting a
        // loaded shot power only prepares the next shot.
        if (powerUp === 'lightning' && !this.levelSystem.canShoot) {
            return false;
        }

        if (powerUp === 'fireball') {
            // Fire is launched only from shared inventory stock.
            if (getPowerUpQuantity('fireball') <= 0) return false;
            this.selectPower(this.selectedPower === 'fireball' ? null : 'fireball');
            if (this.selectedPower === 'fireball') gameAudio.playSfx('powerup');
            return true;
        }

        if (powerUp === 'bomb') {
            if (this.availableBombs <= 0 || this.bombLaunchInFlight) return false;
            this.selectPower(this.selectedPower === 'bomb' ? null : 'bomb');
            if (this.selectedPower === 'bomb') gameAudio.playSfx('powerup');
            return true;
        }

        const inventoryKey = POWER_UP_INVENTORY_KEY[powerUp];

        if (loadPowerUpInventory()[inventoryKey] <= 0) {
            return false;
        }

        if (powerUp === 'lightning') {
            if (!consumePowerUp(inventoryKey)) {
                return false;
            }

            if (!this.activateLightning()) {
                return false;
            }

            this.levelPowerUsed = true;
            gameAudio.playSfx('lightning');
            this.refreshPowerUpCounts();
            return true;
        }

        if (!consumePowerUp(inventoryKey)) {
            return false;
        }

        this.launchPowerShot(powerUp);
        this.refreshPowerUpCounts();
        return true;
    }

    /**
     * Colour-change charge: loads a fresh random colour that is guaranteed
     * different from the current one. Colours still on the board are
     * preferred — the charge buys a colour the player can actually use, and
     * the smart queue (synced after every shot, only re-serving colours that
     * still exist) then keeps the choice in place instead of reverting it.
     * Deliberately outside the shooting system — clicking the button never
     * aims, fires or disturbs a bubble already in flight.
     */
    private changeShooterColor(): boolean {
        // While a shot is flying or a loaded shot-power (bomb/fireball) is
        // prepared the loaded bubble must not be retextured.
        if (this.activeBubble || this.selectedPower) {
            return false;
        }

        // A Color Change use also spends one main shooting ball; with no
        // balls left nothing launches (and no inventory is consumed).
        if (!this.levelSystem.canShoot) {
            return false;
        }

        const boardColors = this.boardColorStats().map((stat) => stat.color);
        const nextColor =
            pickRandomDifferentColor(boardColors, this.shooter.currentColor) ??
            pickRandomDifferentColor(this.levelSystem.level.colors, this.shooter.currentColor);

        // No different colour at all (single-colour level): keep the charge
        // unspent (the button then keeps opening the rewarded ad).
        if (nextColor === null) {
            return false;
        }

        if (!consumePowerUp(POWER_UP_INVENTORY_KEY.colorChanger)) {
            return false;
        }

        // Successful Color Change use: exactly one main ball + one item.
        this.registerShot();
        this.shooter.setCurrentColor(nextColor);
        gameAudio.playSfx('colorSwitch');
        this.refreshPowerUpCounts();
        // Transient feedback in the game's own banner style, so the change
        // is unmistakable even when the two colours are hard to tell apart.
        this.showFireReadyText(false, 'NEW COLOUR!');
        return true;
    }

    private selectPower(power: ShotPower): void {
        this.selectedPower = power;
        if (power === 'bomb') {
            this.shooter.setLoadedBomb(true);
        } else {
            this.shooter.setLoadedPower(power, power === 'fireball' ? 'icon-fire' : null);
        }
        this.shooter.setCurrentFireTint(power === 'fireball');
        // Fireball selection IS Fire Launcher Mode: the loaded bubble is
        // swapped for the animated flame inside the launcher. Every other
        // state (bomb, none, post-shot clear) restores the normal bubble.
        this.shooter.setFireLauncherMode(power === 'fireball');
        this.hud.setActivePowerUp(power === 'fireball' ? 'fireball' : power === 'bomb' ? 'bomb' : null);
        this.hud.setBombState(this.availableBombs > 0, power === 'bomb');
        this.aimGuide.setFireMode(
            power === 'fireball',
            power === 'fireball' ? (impact) => this.fireExplosionBubbles(impact.x, impact.y) : null
        );
        this.aimGuide.setBombMode(
            power === 'bomb',
            power === 'bomb' ? (impact) => this.bombExplosionBubbles(impact.x, impact.y) : null
        );
        this.aimGuide.show();
        if (power) this.showFireReadyText(power === 'fireball', power === 'bomb' ? 'BOMB READY' : undefined);
    }

    private launchPowerShot(power: Exclude<ShotPower, null>): void {
        this.levelPowerUsed = true;
        this.alignBoardForShot();
        const muzzle = this.shooter.getMuzzlePosition();
        const color = this.shooter.currentColor;

        // A launched power shot spends exactly ONE main shooting ball
        // (centralised here, once per launch) plus its ONE inventory item
        // (already deducted once at the fire trigger in fireBubble).
        this.registerShot();

        this.activeBubble = new Bubble(this, muzzle.x, muzzle.y, color);
        this.activeShotPower = power;
        this.activeBubble.setTint(power === 'bomb' ? 0xffa05a : 0xffa32f);
        this.activeBubble.setScale(this.activeBubble.scale * 1.16);
        const velocity = this.shooter.getLaunchVelocity(LAUNCH_SPEED * (power === 'fireball' ? 1.2 : 1));
        this.bubbleVelocity.x = velocity.x;
        this.bubbleVelocity.y = velocity.y;
        this.projectileIcon = this.add
            .image(muzzle.x, muzzle.y, power === 'bomb' ? 'powerup-bomb' : 'icon-fire')
            .setDisplaySize(power === 'bomb' ? BUBBLE_DIAMETER : BUBBLE_DIAMETER * 1.1, power === 'bomb' ? BUBBLE_DIAMETER : BUBBLE_DIAMETER * 1.1)
            .setDepth(32);
        gameAudio.playSfx(power === 'bomb' ? 'bombLaunch' : 'fireLaunch');

        if (power === 'fireball') {
            this.fireParticleAccumulator = 0;
            this.fireTrail = this.add.graphics().setDepth(29);
            this.projectileIcon.setTint(0xfff1c0);
            return;
        }

        if (power === 'bomb') {
            this.projectileIcon.setTint(0xfff0d8);
            return;
        }
    }

    private fireBubble(): void {
        if (
            this.paused ||
            this.ended ||
            this.activeBubble ||
            !this.levelSystem.canShoot
        ) {
            return;
        }

        this.alignBoardForShot();
        const muzzle = this.shooter.getMuzzlePosition();
        if (this.selectedPower === 'bomb') {
            // Bomb is consumed only when the projectile actually launches.
            if (this.availableBombs <= 0 || this.bombLaunchInFlight) return;
            if (!consumePowerUp('bomb')) return;
            this.availableBombs = getPowerUpQuantity('bomb');
            this.bombLaunchInFlight = true;
            this.shooter.setLoadedPower(null);
            this.selectPower(null);
            this.refreshPowerUpCounts();
            this.launchPowerShot('bomb');
            return;
        }
        if (this.selectedPower === 'fireball') {
            // This click is the shot: inventory is untouched until the
            // projectile actually launches here.
            if (getPowerUpQuantity('fireball') <= 0 || !consumePowerUp('fireball')) return;
            this.fireChargeProgressState = emptyFireChargeProgress(this.levelSystem.maxShots);
            this.shooter.setLoadedPower(null);
            this.selectPower(null);
            this.launchPowerShot('fireball');
            this.refreshPowerUpCounts();
            return;
        }
        this.activeBubble = new Bubble(this, muzzle.x, muzzle.y, this.shooter.currentColor);
        const velocity = this.shooter.getLaunchVelocity(LAUNCH_SPEED);
        this.bubbleVelocity.x = velocity.x;
        this.bubbleVelocity.y = velocity.y;
        this.activeShotPower = null;
        gameAudio.playSfx('shoot');
        this.registerShot();
        this.shooter.consume();
        this.aimGuide.hide();
        this.refreshHud();
    }

    private registerShot(): void {
        this.pendingShotDirectRemoved = 0;
        this.pendingShotUnsupportedRemoved = 0;
        this.shotResultRecorded = false;
        this.pendingShotPower = null;
        this.dropAfterShot = this.levelSystem.registerShot();
        this.aimGuide.hide();
        this.refreshHud();
    }

    /**
     * Records the outcome of a power shot (bomb, fireball, lightning). These
     * shots destroy bubbles outside the normal match flow, so their success is
     * recorded explicitly without feeding the big-match fire-charge reward.
     */
    private recordPowerShotOutcome(_removedCount: number, power: ShotPower | 'lightning' = null): void {
        if (this.shotResultRecorded) {
            return;
        }

        this.pendingShotDirectRemoved = 0;
        this.pendingShotUnsupportedRemoved = 0;
        this.pendingShotPower = power;
        this.shotResultRecorded = true;
    }

    private resolveImpact(hitCell: { row: number; col: number } | null): void {
        const bubble = this.activeBubble;

        if (!bubble) {
            return;
        }

        const power = this.activeShotPower;
        this.activeBubble = null;
        this.destroyProjectileEffects();

        if (power === 'bomb') {
            // Bomb resolves at the snap location (existing collision result) and
            // destroys up to 10 nearest bubbles in a circular radius around the
            // exact impact point (not a fixed grid). It does not count as a
            // normal bubble shot and does not feed Fire charging/rewards.
            const cell = this.collision.resolveCell(bubble.x, bubble.y, hitCell);
            const impactPoint = cell ? this.grid.positionFor(cell.row, cell.col) : { x: bubble.x, y: bubble.y };
            const removed = this.bombExplosionBubbles(impactPoint.x, impactPoint.y);
            if (removed.length > 0) {
                recordDailyEvent('bombBubbles', removed.length);
                recordDailyEvent('bubblesCleared', removed.length);
            }
            this.createBombImpact(impactPoint.x, impactPoint.y);
            gameAudio.playSfx('bomb');
            bubble.destroy();
            this.bombLaunchInFlight = false;
            this.availableBombs = getPowerUpQuantity('bomb');
            this.score += this.removeBubblesAndFloats(removed, 18);
            this.refreshPowerUpCounts();
            this.refreshHud();
            this.activeShotPower = null;
            // Keep board/HUD consistent without treating this as a shot.
            this.syncShooterColors();
            this.levelSystem.syncBoard(this.grid);
            this.checkLevelEnd();
            if (!this.ended) {
                this.aimGuide.show();
            }
            return;
        } else if (power === 'fireball') {
            const removed = this.fireExplosionBubbles(bubble.x, bubble.y);
            if (removed.length > 0) {
                recordDailyEvent('fireBubbles', removed.length);
                recordDailyEvent('bubblesCleared', removed.length);
            }
            this.recordPowerShotOutcome(removed.length, 'fireball');
            this.score += this.removeBubblesAndFloats(removed, 20);
            this.createFireImpact(bubble.x, bubble.y);
            gameAudio.playSfx('fire');
            bubble.destroy();
        } else {
            const cell = this.collision.resolveCell(bubble.x, bubble.y, hitCell);

            if (!cell) {
                bubble.destroy();
                this.recordPowerShotOutcome(0);
                this.finishShotResolution();
                this.finishShot();
                return;
            }

            this.grid.placeBubble(bubble, cell.row, cell.col);
            gameAudio.playSfx('collide');
            const outcome = this.matchSystem.resolve(cell.row, cell.col);
            if (outcome.matched.length > 0) {
                gameAudio.playSfx('match');
            }
            this.animateRemovedBubbles([...outcome.matched, ...outcome.floating], outcome.matched.length, outcome.floating.length, true);
            this.score += outcome.score;
        }

        this.activeShotPower = null;
        if (power === 'fireball') {
            this.finishShot();
        } else if (power === null) {
            this.finishShot();
        } else {
            // Bomb: keep board/HUD consistent without treating this as a shot.
            this.syncShooterColors();
            this.levelSystem.syncBoard(this.grid);
            this.checkLevelEnd();
            if (!this.ended) {
                this.aimGuide.show();
            }
        }
    }

    private fireExplosionBubbles(x: number, y: number): Bubble[] {
        const bubbles = this.grid.shootableBubbles();
        if (bubbles.length === 0) {
            return [];
        }

        // The center is the grid bubble nearest to the real impact point.
        const center = bubbles.reduce((nearest, candidate) =>
            PhaserMath.Distance.Between(x, y, candidate.x, candidate.y) <
            PhaserMath.Distance.Between(x, y, nearest.x, nearest.y)
                ? candidate
                : nearest
        );

        const removed: Bubble[] = [];
        for (let row = center.row - 1; row <= center.row + 1; row++) {
            for (let col = center.col - 1; col <= center.col + 1; col++) {
                const bubble = this.grid.bubbleAt(row, col);
                if (bubble) {
                    removed.push(bubble);
                }
            }
        }
        return removed;
    }

    /** Bomb: circular radial blast, up to 10 nearest bubbles within radius (not a grid). */
    private bombExplosionBubbles(x: number, y: number): Bubble[] {
        const blastRadius = BUBBLE_RADIUS * 4.2;
        const maxDestroyed = 10;
        return this.grid
            .shootableBubbles()
            .map((bubble) => ({
                bubble,
                distance: PhaserMath.Distance.Between(x, y, bubble.x, bubble.y),
            }))
            .filter((entry) => entry.distance <= blastRadius)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, maxDestroyed)
            .map((entry) => entry.bubble);
    }

    private createBombImpact(x: number, y: number): void {
        const blastRadius = BUBBLE_RADIUS * 4.2;
        const core = this.add.circle(x, y, 14, 0xfff0c8).setDepth(45);
        const blast = this.add.circle(x, y, 18, 0xff7a2a, 0.28).setDepth(43);
        const ring = this.add.circle(x, y, 18, 0xffb347, 0).setDepth(44).setStrokeStyle(4, 0xffe0a0, 0.95);
        const shock = this.add.circle(x, y, 12, 0xffffff, 0).setDepth(46).setStrokeStyle(3, 0xfff0c8, 0.85);
        this.tweens.add({ targets: core, scale: 2.4, alpha: 0, duration: 260, ease: 'Quad.easeOut', onComplete: () => core.destroy() });
        this.tweens.add({ targets: blast, radius: blastRadius, alpha: 0, duration: 380, ease: 'Cubic.easeOut', onComplete: () => blast.destroy() });
        this.tweens.add({ targets: ring, scale: blastRadius / 18, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
        this.tweens.add({ targets: shock, scale: blastRadius / 12, alpha: 0, duration: 460, ease: 'Cubic.easeOut', onComplete: () => shock.destroy() });

        const sparks = [0xfff1a8, 0xffc04a, 0xff8a1f, 0xff5a2a];
        for (let index = 0; index < 22; index++) {
            const angle = (Math.PI * 2 * index) / 22 + PhaserMath.FloatBetween(-0.08, 0.08);
            const distance = PhaserMath.FloatBetween(blastRadius * 0.35, blastRadius);
            const particle = this.add.circle(x, y, PhaserMath.Between(2, 4), sparks[index % sparks.length], 1).setDepth(47);
            this.tweens.add({
                targets: particle,
                x: x + Math.cos(angle) * distance,
                y: y + Math.sin(angle) * distance,
                scale: 0.2,
                alpha: 0,
                duration: PhaserMath.Between(260, 520),
                ease: 'Quad.easeOut',
                onComplete: () => particle.destroy(),
            });
        }

        for (let index = 0; index < 10; index++) {
            const smoke = this.add.circle(
                x + PhaserMath.Between(-12, 12),
                y + PhaserMath.Between(-10, 10),
                PhaserMath.Between(7, 13),
                0x8a8f99,
                0.36
            ).setDepth(42);
            this.tweens.add({
                targets: smoke,
                y: smoke.y - PhaserMath.Between(18, 38),
                x: smoke.x + PhaserMath.Between(-14, 14),
                scale: 1.7,
                alpha: 0,
                duration: PhaserMath.Between(460, 760),
                ease: 'Quad.easeOut',
                onComplete: () => smoke.destroy(),
            });
        }
    }

    private spawnFireProjectileParticle(x: number, y: number): void {
        const colors = [0xfff1a8, 0xffd229, 0xff8a1f, 0xff3d14];
        const particle = this.add
            .circle(
                x + PhaserMath.Between(-7, 7),
                y + PhaserMath.Between(-5, 5),
                PhaserMath.Between(2, 5),
                colors[PhaserMath.Between(0, colors.length - 1)],
                PhaserMath.FloatBetween(0.72, 1)
            )
            .setDepth(31);
        this.tweens.add({
            targets: particle,
            x: particle.x - this.bubbleVelocity.x * 0.055 + PhaserMath.Between(-8, 8),
            y: particle.y - this.bubbleVelocity.y * 0.055 + PhaserMath.Between(-8, 8),
            scale: 0.15,
            alpha: 0,
            duration: PhaserMath.Between(260, 430),
            ease: 'Quad.easeOut',
            onComplete: () => particle.destroy(),
        });
    }

    private moveFireball(delta: number): void {
        const bubble = this.activeBubble;

        if (!bubble) {
            return;
        }

        const totalMs = Math.max(0, Math.min(delta, 100));
        const speed = Math.hypot(this.bubbleVelocity.x, this.bubbleVelocity.y);
        const distance = (speed * totalMs) / 1000;
        // Small enough slices that a fast fireball can never jump past a
        // bubble between two frames (proximity checks are per-substep).
        const steps = Math.max(1, Math.ceil(distance / (BUBBLE_RADIUS * 0.75)));
        const sliceMs = steps > 0 ? totalMs / steps : 0;
        const targets = this.grid.shootableBubbles();

        for (let index = 0; index < steps; index += 1) {
            const step = sliceMs / 1000;
            bubble.x += this.bubbleVelocity.x * step;
            bubble.y += this.bubbleVelocity.y * step;

            if (bubble.x < WALL_LEFT || bubble.x > WALL_RIGHT) {
                bubble.x = PhaserMath.Clamp(bubble.x, WALL_LEFT, WALL_RIGHT);
                this.bubbleVelocity.x *= -1;
                gameAudio.playSfx('bounce');
            }

            const hit = targets.find(
                (target) =>
                    PhaserMath.Distance.Between(bubble.x, bubble.y, target.x, target.y) <=
                    BUBBLE_RADIUS * 1.5
            );
            if (hit) {
                this.resolveImpact({ row: hit.row, col: hit.col });
                return;
            }
        }

        this.fireParticleAccumulator += totalMs;
        if (this.fireParticleAccumulator >= 55) {
            this.fireParticleAccumulator = 0;
            this.spawnFireProjectileParticle(bubble.x, bubble.y);
        }
    }

    private activateLightning(): boolean {
        if (!this.levelSystem.canShoot) {
            return false;
        }

        this.alignBoardForShot();
        const path = this.collision.predict(this.shooter.getMuzzlePosition(), this.shooter.getAimAngle());
        const impact = path[path.length - 1];
        const candidates = this.grid.shootableBubbles();
        const target = impact
            ? candidates.sort(
                  (left, right) =>
                      PhaserMath.Distance.Between(impact.x, impact.y, left.x, left.y) -
                      PhaserMath.Distance.Between(impact.x, impact.y, right.x, right.y)
              )[0]
            : undefined;

        if (!target) {
            return false;
        }

        this.registerShot();
        const row = target.row;
        const rowBubbles = candidates.filter((bubble) => bubble.row === row);
        this.recordPowerShotOutcome(rowBubbles.length, 'lightning');
        this.score += this.removeBubblesAndFloats(rowBubbles, 12);
        this.drawLightning(target.x, target.y);
        this.refreshHud();
        this.checkLevelEnd();
        return true;
    }

    private removeBubblesAndFloats(bubbles: Bubble[], pointsPerBubble: number): number {
        const unique = new Set(bubbles);
        const removed: Bubble[] = [];

        for (const bubble of unique) {
            this.grid.clearBubble(bubble);
            removed.push(bubble);
        }

        const floating = this.grid.floatingBubbles();

        for (const bubble of floating) {
            this.grid.clearBubble(bubble);
            removed.push(bubble);
        }

        this.animateRemovedBubbles(removed);
        return removed.length * pointsPerBubble;
    }

    private animateRemovedBubbles(bubbles: Bubble[], directRemoved = 0, unsupportedRemoved = 0, trackReward = false): void {
        const unique = Array.from(new Set(bubbles));

        // Record the shot outcome even when nothing was removed: a failed shot
        // must resolve (and reset the reward streaks) like any other shot.
        if (trackReward && !this.shotResultRecorded) {
            this.pendingShotDirectRemoved = Math.max(0, Math.floor(directRemoved));
            this.pendingShotUnsupportedRemoved = Math.max(0, Math.floor(unsupportedRemoved));
            this.shotResultRecorded = true;
        }

        if (unique.length === 0) {
            this.finishShotResolution();
            return;
        }

        gameAudio.playPopCascade(unique.length);
        this.boardUpdatesPending += unique.length;
        this.levelSystem.recordBubbleRemovals(unique.length);
        this.levelSystem.syncBoard(this.grid);
        this.refreshHud();

        for (const bubble of unique) {
            this.tweens.add({
                targets: bubble,
                scale: 0.2,
                alpha: 0,
                duration: 120,
                ease: 'Quad.easeIn',
                onComplete: () => {
                    bubble.destroy();
                    this.boardUpdatesPending = Math.max(0, this.boardUpdatesPending - 1);
                    if (this.boardUpdatesPending === 0) {
                        this.finishShotResolution();
                        this.checkLevelEnd();
                    }
                },
            });
        }
    }

    private finishShotResolution(): void {
        if (!this.shotResultRecorded) return;
        this.shotResultRecorded = false;
        const totalDestroyed =
            this.pendingShotDirectRemoved + this.pendingShotUnsupportedRemoved;
        const shotDestroyedAny = totalDestroyed > 0;
        const shotPower = this.pendingShotPower;
        this.pendingShotDirectRemoved = 0;
        this.pendingShotUnsupportedRemoved = 0;

        // Daily Tasks: only ordinary matches feed the bubble total, the
        // no-miss streak and the big-chain counter. Power shots are tracked
        // at their own launch/impact sites with their actual destruction.
        if (shotPower === null) {
            if (totalDestroyed > 0) {
                recordDailyEvent('bubblesCleared', totalDestroyed);
                this.streakBubbles += totalDestroyed;
                recordDailyEvent('streakBubbles', totalDestroyed);
                if (totalDestroyed >= CHAIN_REACTION_MIN_BUBBLES) {
                    recordDailyEvent('chainBubbles', totalDestroyed);
                }
            } else {
                // A shot that clears nothing breaks the consecutive run.
                this.streakBubbles = 0;
            }
        }

        // Gameplay rewards (normal shots only; power shots never count):
        // Fire after the 1/3 successful-shot cycle and Bomb after a 12+
        // destruction burst — each ONLY while its inventory is empty, so
        // purchased/task/gift stock is never topped up by gameplay.
        this.pendingShotPower = null;
        let fireEarned = false;
        let bombEarned = false;
        if (shotPower === null) {
            const step = resolveFireChargeProgress(
                this.fireChargeProgressState,
                shotDestroyedAny,
                this.levelSystem.maxShots
            );
            this.fireChargeProgressState = step.progress;
            if (step.reachedFull) {
                if (getPowerUpQuantity('fireball') <= 0) {
                    grantPowerUp('fireball', 1);
                    fireEarned = true;
                }
                this.fireChargeProgressState = emptyFireChargeProgress(this.levelSystem.maxShots);
            }
            if (shotDestroyedAny && totalDestroyed >= 12 && getPowerUpQuantity('bomb') <= 0) {
                grantPowerUp('bomb', 1);
                bombEarned = true;
            }
        }

        if (fireEarned || bombEarned) {
            gameAudio.playSfx('powerup');
            const message = fireEarned && bombEarned
                ? 'FIRE + BOMB READY!'
                : bombEarned
                    ? 'BOMB READY!'
                    : 'FIRE POWER READY!';
            this.showFireReadyText(false, message);
        }

        this.refreshPowerUpCounts();
    }

    private finishShot(): void {
        if (this.dropAfterShot && !this.grid.isEmpty()) {
            if (!this.grid.dropRow(() => this.levelSystem.randomColor())) {
                this.endLevel('lost');
                return;
            }
            gameAudio.playSfx('drop');
        }

        this.dropAfterShot = false;
        this.refreshHud();
        this.checkLevelEnd();

        if (!this.ended) {
            this.aimGuide.show();
        }
    }

    private checkLevelEnd(): void {
        if (this.boardUpdatesPending > 0 || this.activeBubble) {
            return;
        }

        // Keep the scroll position where the player left it, clamped to the
        // board as rows clear. This only moves existing bubbles; no row is
        // ever added to a fixed board.
        this.grid.setScrollOffset(this.grid.scrollOffsetY);
        this.syncShooterColors();
        this.levelSystem.syncBoard(this.grid);
        const status = this.levelSystem.resolveStatus({
            score: this.score,
            boardEmpty: this.grid.isEmpty(),
            danger: this.levelSystem.level.dangerEnabled && this.grid.isDanger(),
        });

        if (status !== 'playing') {
            this.endLevel(status);
        }
    }

    /** True when the final level of the catalogue has just been won. */
    private isFinalVictory(): boolean {
        return this.levelSystem.levelIndex === this.levelSystem.levelCount - 1;
    }

    private endLevel(status: 'won' | 'lost'): void {
        if (this.ended) {
            return;
        }

        this.ended = true;
        gameAudio.playSfx(status === 'won' ? 'win' : 'lose');
        this.activeBubble?.destroy();
        this.activeBubble = null;
        this.destroyProjectileEffects();
        this.aimGuide.hide();
        const newRecord = recordScore(this.score);
        const shotsUsed = this.levelSystem.shotsUsedCount;
        const outcome = levelOutcomeFor(this.levelSystem.shotStarLimits, status === 'won', shotsUsed);

        if (outcome.unlocksNext) {
            markLevelCompleted(this.levelSystem.levelIndex, outcome.stars);
        }

        if (status === 'won') {
            // Daily Tasks: each objective is earned from the actual outcome of
            // this attempt. `perLevel` missions deduplicate by level id, so a
            // replay of the same level can never count twice.
            const levelId = this.levelSystem.levelIndex;
            const dailyOptions = { levelId };
            recordDailyEvent('completeLevel', 1, dailyOptions);
            if (!this.levelPowerUsed) {
                recordDailyEvent('cleanLevel', 1, dailyOptions);
            }
            if (shotsUsed <= EFFICIENT_SHOT_LIMIT) {
                recordDailyEvent('efficientLevel', 1, dailyOptions);
            }
            if (outcome.stars >= 2) {
                recordDailyEvent('starLevel', 1, dailyOptions);
            }
        }
        this.levelPowerUsed = false;
        this.streakBubbles = 0;

        // Flat completion reward: exactly 5 Coins for every successful
        // completion (first time or replay), once per attempt. The ended
        // guard above plus this flag make repeated callbacks/reopens inert.
        let completionCoinReward = 0;
        if (status === 'won' && !this.completionRewardGranted) {
            this.completionRewardGranted = true;
            completionCoinReward = 5;
            addCoins(completionCoinReward);
        }
        const coinReward = status === 'won' ? completionCoinReward : undefined;

        this.gameOverPanel.show({
            title: outcome.won ? (this.isFinalVictory() ? 'GAME COMPLETE!' : 'LEVEL COMPLETE!') : 'LEVEL FAILED',
            subtitle: outcome.won
                ? (this.isFinalVictory()
                    ? `Final Victory! All 1000 levels conquered in ${shotsUsed} shots. You are the bubble champion!`
                    : `Cleared in ${shotsUsed} ${shotsUsed === 1 ? 'shot' : 'shots'} · ${outcome.stars}/3 stars.`)
                : `Out of shots after ${shotsUsed}. Give it another try!`,
            score: this.score,
            best: loadProgress().bestScore,
            stars: outcome.stars,
            win: outcome.won,
            newRecord,
            primaryLabel:
                outcome.won ? (this.levelSystem.hasNext ? 'NEXT LEVEL' : 'LEVEL MAP') : 'TRY AGAIN',
            secondaryLabel: 'LEVEL MAP',
            replayLabel: outcome.won ? 'REPLAY' : 'RETRY',
            coinReward: outcome.won ? coinReward : undefined,
            completionCoinReward: outcome.won && completionCoinReward > 0 ? completionCoinReward : undefined,
            onContinue: outcome.won ? undefined : () => this.continueAfterFailAd(),
            onReplay: () => this.scene.restart({ level: this.currentLevelIndex }),
            onPrimary: () => {
                if (!outcome.won) {
                    this.scene.restart({ level: this.currentLevelIndex });
                } else if (this.levelSystem.hasNext) {
                    this.scene.restart({ level: this.levelSystem.levelIndex + 1 });
                } else {
                    goToSceneInstant(this, 'LevelSelectionScene');
                }
            },
            onSecondary: () => goToSceneInstant(this, 'LevelSelectionScene'),
        });

        if (status === 'won' && !this.paused && recordLevelCompletedForInterstitial()) {
            void showInterstitialAd();
        }
    }

    /**
     * FAIL Continue: a fully watched rewarded ad grants exactly 3 extra
     * balls (the shared ad lock blocks duplicate callbacks) and resumes
     * this exact attempt — board, score, shooter, shots and inventory were
     * never destroyed. Failed/skipped/unavailable ads grant nothing and
     * keep the FAIL popup open.
     */
    private async continueAfterFailAd(): Promise<'granted' | 'failed' | 'unavailable' | 'busy'> {
        if (!this.ended || this.extraBallsInProgress) {
            return 'busy';
        }
        this.extraBallsInProgress = true;
        const epoch = this.extraBallsAdEpoch;
        const hud = this.hud;
        const outcome = await showRewardedAd();
        if (this.hud !== hud || epoch !== this.extraBallsAdEpoch) {
            this.extraBallsInProgress = false;
            return 'busy';
        }
        this.extraBallsInProgress = false;
        if (outcome !== 'granted') {
            return outcome === 'unavailable' ? 'unavailable' : 'failed';
        }
        this.levelSystem.addExtraShots(3);
        this.ended = false;
        this.refreshHud();
        this.gameOverPanel.hide();
        return 'granted';
    }

    public handleAndroidBack(): void {
        if (this.leaveGamePanel?.isOpen || this.ended) {
            return;
        }

        if (this.settingsPanel?.isOpen) {
            this.settingsPanel.hide();
            return;
        }

        if (this.paused && this.pausePanel) {
            this.closePause();
            return;
        }

        if (this.introLockHeld || isModalInputLocked() || this.paused) {
            return;
        }

        this.setPaused(true);
        this.aimController.cancelPointerInput();
        this.leaveGamePanel = new BackConfirmationPanel(this, {
            title: 'Leave Game?',
            description: 'Are you sure you want to leave this level and return to the level selection screen?',
            confirmLabel: 'OK',
            cancelLabel: 'Resume',
            onConfirm: () => {
                this.leaveGamePanel?.destroy();
                this.leaveGamePanel = null;
                this.time.paused = false;
                this.tweens.resumeAll();
                this.aimController.cancelPointerInput();
                goToSceneInstant(this, 'LevelSelectionScene');
            },
            onCancel: () => {
                this.leaveGamePanel?.destroy();
                this.leaveGamePanel = null;
                this.setPaused(false);
            },
        });
    }

    private togglePause(): void {
        if (this.ended) {
            return;
        }

        // Intro, modals and overlays own input/flow. Freezing scene time/tweens
        // during the intro would stall its auto-complete timer and wedge the lock.
        if (!this.paused && (isModalInputLocked() || this.introLockHeld)) {
            return;
        }

        // While a sub-popup is open, the pause key must not change game state.
        if (this.settingsPanel?.isOpen) {
            return;
        }

        if (this.paused) {
            this.closePause();
            return;
        }

        this.setPaused(true);
        this.aimController.cancelPointerInput();
        this.pausePanel = new PausePanel(this, {
            onResume: () => this.closePause(),
            onRestart: () => {
                if (!this.pausePanel || !this.paused || this.pauseRestarting) return;
                this.pauseRestarting = true;
                // Ensure the restarted attempt never inherits a paused clock.
                this.time.paused = false;
                this.tweens.resumeAll();
                this.pausePanel.destroy();
                this.pausePanel = null;
                this.scene.restart({ level: this.currentLevelIndex });
            },
            onSettings: () => {
                if (this.settingsPanel?.isOpen) {
                    return;
                }

                this.aimController.cancelPointerInput();
                this.settingsPanel?.show({
                    soundEnabled: loadProgress().sound,
                    musicEnabled: loadProgress().music,
                    onSoundToggle: () => {
                        const enabled = toggleSound();
                        if (enabled) {
                            gameAudio.playSfx('click');
                        }
                        return enabled;
                    },
                    onMusicToggle: () => toggleMusic(),
                    // Returning keeps the game frozen behind the popup.
                    onBack: () => this.settingsPanel?.hide(),
                });
            },
            onLevelMap: () => {
                // Never leave the scene instance paused across navigation/re-entry.
                this.time.paused = false;
                this.tweens.resumeAll();
                this.aimController.cancelPointerInput();
                goToSceneInstant(this, 'LevelSelectionScene');
            },
            onClose: () => this.closePause(),
        });
    }

    /** Closes all pause layers and continues from the exact paused state. */
    private closePause(): void {
        this.aimController.cancelPointerInput();
        this.settingsPanel?.hide();
        this.setPaused(false);
    }

    private setPaused(paused: boolean): void {
        this.paused = paused;
        this.hud.setPaused(paused);

        if (paused) {
            this.time.paused = true;
            this.tweens.pauseAll();
            this.aimGuide.hide();
        } else {
            this.time.paused = false;
            this.tweens.resumeAll();
            this.pausePanel?.destroy();
            this.pausePanel = null;
            if (loadProgress().aimGuide !== false) {
                this.aimGuide.show();
            } else {
                this.aimGuide.hide();
            }
        }
    }

    /**
     * Rewarded-ad flow behind the bottom colour-change button. The reward is
     * granted only on a completed watch; skipped/failed/unavailable never
     * grant. The button is locked for the whole ad cycle so one video can
     * never pay twice.
     */
    private async requestExtraBalls(): Promise<void> {
        if (this.extraBallsInProgress || this.ended) {
            return;
        }

        const hud = this.hud;
        const epoch = this.extraBallsAdEpoch;
        this.extraBallsInProgress = true;
        hud.setColorAdLoading(true);

        const outcome = await showRewardedAd();

        // The scene may have shut down (or fully restarted) while the video
        // was playing: a stale callback must not touch the new attempt.
        if (this.hud !== hud || epoch !== this.extraBallsAdEpoch) {
            this.extraBallsInProgress = false;
            return;
        }

        const reward = extraBallsRewardFor(outcome);
        if (reward > 0) {
            this.levelSystem.addExtraShots(reward);
            this.refreshHud();
        } else if (outcome === 'unavailable') {
            hud.showExtraBallsNotice('ADS NOT AVAILABLE HERE — TRY ON YANDEX GAMES');
        } else {
            hud.showExtraBallsNotice("AD DIDN'T FINISH — NO BALLS ADDED");
        }

        hud.setColorAdLoading(false);
        this.extraBallsInProgress = false;
    }

    private refreshHud(): void {
        this.levelSystem.syncBoard(this.grid);
        this.hud.setScore(this.score);
        this.hud.setTargetProgress(
            this.levelSystem.initialTargetCount,
            this.levelSystem.remainingTargetCount
        );
        this.hud.setShots(
            this.levelSystem.shotsRemaining,
            this.levelSystem.maxShots,
            this.levelSystem.shotsUsedCount,
            this.levelSystem.untilNextDrop
        );
    }

    private alignBoardForShot(): void {
        // Every shot starts with the formation's frontier at the playfield's
        // vertical midpoint: full trajectory space below, mass extending
        // upward. This only repositions existing bubbles.
        this.grid.followBoard();
        this.aimGuide.hide();
    }

    private showFireReadyText(fireMode = false, customLabel?: string): void {
        const label = this.add.text(GAME_WIDTH / 2, 180, customLabel ?? (fireMode ? 'FIRE MODE' : 'POWER READY!'), {
            fontFamily: 'Arial Black', fontSize: '24px', color: '#fff3b0',
            stroke: '#d84720', strokeThickness: 6, align: 'center'
        }).setOrigin(0.5).setDepth(120);
        this.tweens.add({
            targets: label, y: 160, alpha: 0, duration: 900, ease: 'Quad.easeOut',
            onComplete: () => label.destroy()
        });
    }

    private createFireImpact(x: number, y: number): void {
        const core = this.add.circle(x, y, 14, 0xfff7a6).setDepth(45);
        const ring = this.add.circle(x, y, 18, 0xff6a22, 0.6).setDepth(44);
        this.tweens.add({
            targets: core,
            scale: 4.4,
            alpha: 0,
            duration: 360,
            ease: 'Quad.easeOut',
            onComplete: () => core.destroy(),
        });
        this.tweens.add({
            targets: ring,
            scale: 8,
            alpha: 0,
            duration: 480,
            ease: 'Cubic.easeOut',
            onComplete: () => ring.destroy(),
        });

        const colors = [0xffd229, 0xff8a1f, 0xff3d14, 0xfff1a8];
        for (let index = 0; index < 32; index++) {
            const angle = (Math.PI * 2 * index) / 32 + PhaserMath.FloatBetween(-0.08, 0.08);
            const distance = PhaserMath.Between(BUBBLE_RADIUS, BUBBLE_DIAMETER * 4);
            const particle = this.add.circle(x, y, PhaserMath.Between(2, 5), colors[index % colors.length], 1).setDepth(46);
            this.tweens.add({
                targets: particle,
                x: x + Math.cos(angle) * distance,
                y: y + Math.sin(angle) * distance,
                scale: 0.15,
                alpha: 0,
                duration: PhaserMath.Between(360, 620),
                ease: 'Quad.easeOut',
                onComplete: () => particle.destroy(),
            });
        }
    }

    private refreshPowerUpCounts(): void {
        this.availableBombs = getPowerUpQuantity('bomb');
        this.hud.setPowerUpCounts(this.availableBombs, getPowerUpQuantity('fireball'), getPowerUpQuantity('colorChanger'));
        this.hud.setBombState(this.availableBombs > 0, this.selectedPower === 'bomb');
    }

    private drawFireTrail(): void {
        if (!this.fireTrail || !this.activeBubble) {
            return;
        }

        const muzzle = this.shooter.getMuzzlePosition();
        this.fireTrail.clear();
        this.fireTrail.lineStyle(10, 0xff642e, 0.17);
        this.fireTrail.lineBetween(muzzle.x, muzzle.y, this.activeBubble.x, this.activeBubble.y);
        this.fireTrail.lineStyle(3, 0xffb34d, 0.68);
        this.fireTrail.lineBetween(muzzle.x, muzzle.y, this.activeBubble.x, this.activeBubble.y);
    }

    private drawLightning(targetX: number, targetY: number): void {
        const start = this.shooter.getMuzzlePosition();
        const bolt = this.add.graphics().setDepth(40);
        const points: Array<[number, number]> = [[start.x, start.y]];
        const segments = 10;

        for (let index = 1; index < segments; index++) {
            const ratio = index / segments;
            points.push([
                PhaserMath.Linear(start.x, targetX, ratio) + PhaserMath.Between(-20, 20),
                PhaserMath.Linear(start.y, targetY, ratio),
            ]);
        }

        points.push([targetX, targetY]);
        bolt.lineStyle(12, 0x75dfff, 0.24);
        bolt.beginPath();
        bolt.moveTo(points[0][0], points[0][1]);
        points.slice(1).forEach(([x, y]) => bolt.lineTo(x, y));
        bolt.strokePath();
        bolt.lineStyle(4, 0xf6fdff, 1);
        bolt.beginPath();
        bolt.moveTo(points[0][0], points[0][1]);
        points.slice(1).forEach(([x, y]) => bolt.lineTo(x, y));
        bolt.strokePath();

        this.tweens.add({
            targets: bolt,
            alpha: 0,
            duration: 240,
            onComplete: () => bolt.destroy(),
        });
    }

    private destroyProjectileEffects(): void {
        this.projectileIcon?.destroy();
        this.projectileIcon = null;
        this.fireTrail?.destroy();
        this.fireTrail = null;
    }

    /**
     * Per-colour statistics of the board: how many bubbles of each colour are
     * left and how many same-colour adjacency pairs exist (a pair means one
     * shot can complete a match of three).
     */
    private boardColorStats(): ColorStat[] {
        const stats: Record<string, { color: BubbleColorName; count: number; pairs: number }> = {};

        const bump = (color: BubbleColorName, pairs: number): void => {
            const entry = stats[color] ?? { color, count: 0, pairs: 0 };
            entry.count += 1;
            entry.pairs += pairs;
            stats[color] = entry;
        };

        for (const bubble of this.grid.getBubbles()) {
            let sameColorNeighbours = 0;

            for (const neighbour of this.grid.neighbourCells(bubble.row, bubble.col)) {
                const cell = this.grid.bubbleAt(neighbour.row, neighbour.col);
                if (cell && cell.color === bubble.color) {
                    sameColorNeighbours += 1;
                }
            }

            bump(bubble.color, sameColorNeighbours);
        }

        // Each pair is counted from both sides; halves it into distinct pairs.
        return Object.values(stats).map((entry) => ({
            color: entry.color,
            count: entry.count,
            pairs: Math.ceil(entry.pairs / 2),
        }));
    }

    /**
     * Keeps the launcher queue aligned with the board state: only colours that
     * still exist are served, match-capable ones are prioritised, and when a
     * single colour remains both the loaded bubble and the preview become it.
     */
    private syncShooterColors(): void {
        if (this.paused || this.ended || this.activeBubble || this.selectedPower) {
            return;
        }

        const stats = this.boardColorStats();

        if (stats.length === 0) {
            return;
        }

        const update = computeShooterQueueUpdate(
            {
                currentColor: this.shooter.currentColor,
                nextColor: this.shooter.nextColor,
            },
            stats
        );

        if (update.current !== null) {
            this.shooter.setCurrentColor(update.current);
        }

        if (update.next !== null) {
            this.shooter.setNextColor(update.next);
        }
    }

    /**
     * Level intro: the banner slides in from the left, holds centred for ~2s
     * and slides off to the right while the whole formation rises from below
     * the visible board floor into its exact final cells. Gameplay input is
     * modal-locked for the entire sequence. Bubbles are only translated by one
     * shared offset, so the formation, colours, sizes and spacing are never
     * altered — the rise ends precisely on the predefined positions.
     */
    private showLevelIntro(): void {
        this.hideLevelIntro();
        const scene = this;
        const epoch = this.introEpoch;
        const w = Math.min(360, GAME_WIDTH - 48);
        const h = 156;
        const centerX = GAME_WIDTH / 2;
        const centerY = GAME_HEIGHT / 2;
        const isCurrent = (): boolean =>
            this.introEpoch === epoch && this.introPopup !== null;

        // Full-screen absorber kept OUTSIDE the sliding container so HUD and
        // board input stay blocked from the very first entrance frame.
        const blocker = scene.add
            .rectangle(centerX, centerY, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0.001)
            .setDepth(249)
            .setInteractive();

        const popup = scene.add.container(introPopupEnterX(w), centerY).setDepth(250);
        popup.setName('level-intro');
        const panel = scene.add.graphics();
        panel.fillStyle(0x020617, 0.45);
        panel.fillRoundedRect(-w / 2, -h / 2 + 7, w, h, 26);
        panel.fillGradientStyle(0x47b9c8, 0x47b9c8, 0x157a9b, 0x157a9b, 1);
        panel.fillRoundedRect(-w / 2, -h / 2, w, h, 26);
        panel.fillStyle(0xffffff, 0.16);
        panel.fillRoundedRect(-w / 2 + 12, -h / 2 + 8, w - 24, 30, 12);
        panel.lineStyle(3, 0xffd166, 0.95);
        panel.strokeRoundedRect(-w / 2, -h / 2, w, h, 26);

        const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;
        const spots: [number, number, number][] = [
            [-w / 2 + 10, -h / 2 + 8, 52], [-w / 2 + 34, -h / 2 - 2, 40],
            [w / 2 - 10, -h / 2 + 8, 52], [w / 2 - 34, -h / 2 - 2, 40],
            [-w / 2 + 10, h / 2 - 8, 52], [-w / 2 + 34, h / 2 + 2, 40],
            [w / 2 - 10, h / 2 - 8, 52], [w / 2 - 34, h / 2 + 2, 40],
        ];
        const decor = spots.map(([x, y, size], index) => {
            const img = scene.add.image(x, y, bubbleTexture(colors[index % colors.length]));
            img.setDisplaySize(size, size);
            img.setName(`intro-bubble-${index}`);
            return img;
        });
        if (scene.textures.exists('spark')) {
            decor.push(scene.add.image(-w / 2 + 60, h / 2 - 16, 'spark').setDisplaySize(22, 22));
            decor.push(scene.add.image(w / 2 - 60, -h / 2 + 16, 'spark').setDisplaySize(22, 22));
        }

        const title = scene.add.text(0, -24, 'POP ALL BUBBLES', {
            fontFamily: FONT_DISPLAY, fontSize: '26px', color: '#ffd166',
            stroke: '#7c2d12', strokeThickness: 5, align: 'center',
        }).setOrigin(0.5);
        title.setName('intro-title');
        const level = scene.add.text(0, 20, `LEVEL ${this.currentLevelIndex + 1}`, {
            fontFamily: FONT_DISPLAY, fontSize: '17px', color: '#ffffff',
            stroke: '#075a8a', strokeThickness: 3, align: 'center',
        }).setOrigin(0.5);
        level.setName('intro-level');

        popup.add([panel, ...decor, title, level]);
        acquireModalInputLock('levelIntro');
        this.introLockHeld = true;
        this.introPopup = popup;
        this.introBlocker = blocker;

        // The epoch token (bumped by every hide) stops callbacks from a
        // previous intro touching a later popup after a scene restart.
        scene.tweens.add({
            targets: popup,
            x: centerX,
            duration: INTRO_POPUP_ENTER_MS,
            ease: INTRO_POPUP_ENTER_EASE,
            onComplete: () => {
                if (!isCurrent()) {
                    return;
                }

                this.introHoldTimer = scene.time.delayedCall(INTRO_POPUP_HOLD_MS, () => {
                    this.introHoldTimer = null;

                    if (!isCurrent()) {
                        return;
                    }

                    scene.tweens.add({
                        targets: popup,
                        x: introPopupExitX(GAME_WIDTH, w),
                        duration: INTRO_POPUP_EXIT_MS,
                        ease: INTRO_POPUP_EXIT_EASE,
                        onComplete: () => {
                            if (!isCurrent()) {
                                return;
                            }

                            this.hideLevelIntro();
                        },
                    });
                });
            },
        });

        this.riseBubblesForIntro(epoch);
    }

    /**
     * Translates the existing formation up from below the visible board floor
     * to its exact final coordinates. One tween drives a single shared offset,
     * so every bubble moves together and relative spacing is preserved.
     */
    private riseBubblesForIntro(epoch: number): void {
        const bubbles = this.grid.getBubbles();

        if (bubbles.length === 0) {
            return;
        }

        const finalYs = bubbles.map((bubble) => bubble.y);
        const offset = introBubbleRiseOffset(finalYs, BOARD_VIEW_BOTTOM, BUBBLE_RADIUS);

        if (offset <= 0) {
            return;
        }

        const state = { offset };
        this.introRise = { bubbles, finalYs, state };

        for (let index = 0; index < bubbles.length; index += 1) {
            bubbles[index].y = finalYs[index] + offset;
        }

        this.tweens.add({
            targets: state,
            offset: 0,
            duration: INTRO_BUBBLE_RISE_MS,
            ease: INTRO_BUBBLE_RISE_EASE,
            onUpdate: () => {
                if (this.introEpoch !== epoch || !this.introRise) {
                    return;
                }

                for (let index = 0; index < bubbles.length; index += 1) {
                    const bubble = bubbles[index];

                    if (bubble.active) {
                        bubble.y = finalYs[index] + state.offset;
                    }
                }
            },
            onComplete: () => {
                if (this.introEpoch !== epoch) {
                    return;
                }

                this.snapIntroBubblesToFinal();
                this.introRise = null;
            },
        });
    }

    /** Restores every intro bubble to its exact final Y coordinate. */
    private snapIntroBubblesToFinal(): void {
        const rise = this.introRise;

        if (!rise) {
            return;
        }

        for (let index = 0; index < rise.bubbles.length; index += 1) {
            const bubble = rise.bubbles[index];

            if (bubble.active) {
                bubble.y = rise.finalYs[index];
            }
        }
    }

    private hideLevelIntro(): void {
        this.introEpoch += 1;
        if (this.introHoldTimer) {
            this.introHoldTimer.remove(false);
            this.introHoldTimer = null;
        }

        if (this.introPopup) {
            this.tweens.killTweensOf(this.introPopup);
        }

        if (this.introRise) {
            this.tweens.killTweensOf(this.introRise.state);
        }

        // Any interrupted rise still lands on the predefined cells.
        this.snapIntroBubblesToFinal();
        this.introRise = null;

        if (this.introLockHeld) {
            this.introLockHeld = false;
            releaseModalInputLock('levelIntro');
        }

        if (this.introPopup) {
            const popup = this.introPopup;
            this.introPopup = null;
            if (popup.active) {
                popup.destroy(true);
            }
        }

        if (this.introBlocker) {
            const blocker = this.introBlocker;
            this.introBlocker = null;
            if (blocker.active) {
                blocker.destroy();
            }
        }
    }

    private handleShutdown(): void {
        this.extraBallsAdEpoch += 1;
        // Targeted intro cleanup first (timer/tween handles), then a blanket
        // timing reset so no stale callback can outlive this gameplay session.
        this.hideLevelIntro();
        this.time.paused = false;
        this.time.removeAllEvents();
        this.tweens.killAll();
        this.pausePanel?.destroy();
        this.pausePanel = null;
        this.leaveGamePanel?.destroy();
        this.leaveGamePanel = null;
        this.settingsPanel?.destroy();
        this.settingsPanel = null;
        this.gameOverPanel?.destroy();
        this.boardScroll?.destroy();
        this.boardScroll = null;
        this.aimController?.destroy();
        this.aimGuide?.destroy();
        this.hud?.destroy();
        this.grid?.destroyAll();
        this.boardMaskShape?.destroy();
        this.boardMaskShape = null;
        this.destroyProjectileEffects();
        resetModalInputLock();
        clearTransition(this);
    }
}
