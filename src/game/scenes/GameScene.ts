import { Math as PhaserMath, Scene } from 'phaser';
import {
    BOARD_VIEW_BOTTOM,
    BOARD_VIEW_TOP,
    BUBBLE_DIAMETER,
    BUBBLE_RADIUS,
    GAME_HEIGHT,
    GAME_WIDTH,
    LAUNCH_SPEED,
    SHOOTER_Y,
    WALL_LEFT,
    WALL_RIGHT,
    type BubbleColorName,
} from '../config';
import { loadPowerUpInventory, consumePowerUp, grantPowerUp } from '../powerups/inventory';
import type { PowerUpInventory } from '../powerups/inventory';
import { AimController } from '../input/AimController';
import { Bubble } from '../objects/Bubble';
import { Shooter } from '../objects/Shooter';
import { CollisionSystem } from '../systems/CollisionSystem';
import { GridSystem } from '../systems/GridSystem';
import { LevelSystem } from '../systems/LevelSystem';
import { MatchSystem } from '../systems/MatchSystem';
import { computeShooterQueueUpdate, pickRandomDifferentColor, pickSmartShooterColor, type ColorStat } from '../systems/shooterQueue';
import { consumeFireCharge } from '../systems/FireChargeSystem';
import { emptyFireChargeProgress, resolveFireChargeProgress } from '../systems/fireChargeProgress';
import { resolveStreakRewards, type StreakTracking } from '../systems/streakRewards';
import { levelOutcomeFor } from '../data/levels/scoring';
import { addCoins, loadProgress, takePendingBonusShots, recordScore, markLevelCompleted, toggleMusic, toggleSound } from '../utils/storage';
import { recordDailyEvent } from '../daily/dailyTasks';
import { AimGuide } from '../../ui/AimGuide';
import { SettingsPanel } from '../../ui/SettingsPanel';
import { extraBallsRewardFor, showRewardedAd } from '../../ads/rewardedAds';
import { gameAudio } from '../audio/GameAudio';
import { BoardScrollController } from '../input/BoardScrollController';
import { isModalInputLocked, resetModalInputLock } from '../input/modalInputLock';
import { GameOverPanel } from '../../ui/GameOverPanel';
import { HUD, type PowerUpId } from '../../ui/HUD';
import { PausePanel } from '../../ui/PausePanel';
import { goToScene } from './transitions';

interface GameSceneData {
    level?: number;
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
    private fireCharges = 0;
    /**
     * Dedicate consecutive-successful-shot charging for the Fire button:
     * the streak toward ceil(availableShots / 3), reset on any miss, in
     * percent form for the button's charge ring.
     */
    private fireChargeProgressState = emptyFireChargeProgress();
    /** At most one Bomb Shot can be stored per level attempt (disabled at start). */
    private availableBombs = 0;
    private pendingShotDirectRemoved = 0;
    private pendingShotUnsupportedRemoved = 0;
    private pendingShotDestroyedAny = false;
    private shotResultRecorded = false;
    /** True while a bomb projectile is armed/launched; prevents duplicate launches. */
    private bombLaunchInFlight = false;
    /** Power type of the shot currently resolving rewards (null after resolution). */
    private pendingShotPower: ShotPower | 'lightning' = null;
    private streakTracking: StreakTracking = { powerStreak: 0, bombStreak: 0 };
    /** Lock for the rewarded extra-balls flow; guards duplicate claims. */
    private extraBallsInProgress = false;
    /** True once this attempt's +5 completion coins have been paid out. */
    private completionRewardGranted = false;
    /** Bumped on shutdown so a completed ad callback can't pay into a new attempt. */
    private extraBallsAdEpoch = 0;
    private selectedPower: ShotPower = null;

    constructor() {
        super('GameScene');
    }

    create(data?: GameSceneData): void {
        // Start every attempt with a clean modal lock so a stale popup from
        // a previous scene can never wedge gameplay input. Popups register
        // themselves in the lock while they are visible.
        resetModalInputLock();
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
        this.completionRewardGranted = false;
        this.activeBubble = null;
        this.projectileIcon = null;
        this.fireTrail = null;
        this.activeShotPower = null;
        this.dropAfterShot = false;
        this.boardUpdatesPending = 0;
        this.fireCharges = 0;
        this.pendingShotDirectRemoved = 0;
        this.pendingShotUnsupportedRemoved = 0;
        this.pendingShotDestroyedAny = false;
        this.shotResultRecorded = false;
        this.availableBombs = 0;
        this.bombLaunchInFlight = false;
        this.pendingShotPower = null;
        // Streak rewards restart with every new level.
        this.streakTracking = { powerStreak: 0, bombStreak: 0 };
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
        // Requirement: every new level starts an untouched charge cycle —
        // the Fire button is disabled at 0% and the required successful
        // shots are derived from this level's available shots (1/3 target).
        this.fireChargeProgressState = emptyFireChargeProgress(this.levelSystem.maxShots);
        // The formation starts in the upper-middle of the playfield: its
        // frontier sits at the viewport's vertical midpoint and the mass
        // extends upward, leaving the lower half clear for the shooter and
        // trajectory. Bubbles are born horizontally centered and never outside
        // the playable area; nothing is generated later and the board keeps
        // this fixed position — user input never moves it.
        this.grid.followBoard();
        // Daily Tasks: count one play per attempt — only now that the board
        // and launcher exist and actual gameplay is starting.
        recordDailyEvent('play');
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
            return true;
        });

        this.refreshHud();
        if (loadProgress().aimGuide !== false) {
            this.aimGuide.show();
        }

        this.events.once('shutdown', this.handleShutdown, this);
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
                const impact = this.collision.step(this.activeBubble, this.bubbleVelocity, delta);

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
            if (this.fireCharges <= 0) return false;
            this.selectPower(this.selectedPower === 'fireball' ? null : 'fireball');
            return true;
        }

        if (powerUp === 'bomb') {
            if (this.availableBombs <= 0 || this.bombLaunchInFlight) return false;
            this.selectPower(this.selectedPower === 'bomb' ? null : 'bomb');
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

        this.shooter.setCurrentColor(nextColor);
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
        this.alignBoardForShot();
        const angle = this.shooter.getAimAngle();
        const muzzle = this.shooter.getMuzzlePosition();
        const color = this.shooter.currentColor;

        this.activeBubble = new Bubble(this, muzzle.x, muzzle.y, color);
        this.activeShotPower = power;
        this.activeBubble.setTint(power === 'bomb' ? 0xffa05a : 0xffa32f);
        this.activeBubble.setScale(this.activeBubble.scale * 1.16);
        this.bubbleVelocity.x = Math.sin(angle) * LAUNCH_SPEED * (power === 'fireball' ? 1.2 : 1);
        this.bubbleVelocity.y = -Math.cos(angle) * LAUNCH_SPEED * (power === 'fireball' ? 1.2 : 1);
        this.projectileIcon = this.add
            .image(muzzle.x, muzzle.y, power === 'bomb' ? 'powerup-bomb' : 'icon-fire')
            .setDisplaySize(power === 'bomb' ? 38 : 42, power === 'bomb' ? 38 : 42)
            .setDepth(32);

        if (power === 'fireball') {
            recordDailyEvent('fire');
            this.fireParticleAccumulator = 0;
            // The ONLY charge-consumption trigger in the game: a Fire
            // Projectile that actually leaves the launcher. Button clicks,
            // mode toggles, aiming changes and animation events never touch
            // the charge. The guard keeps one full charge worth exactly one
            // projectile (a second launch attempt sees 0 charges and runs).
            if (this.fireCharges > 0) {
                this.fireCharges = consumeFireCharge(this.fireCharges);
                // The consumed cycle restarts here: 0% charge, 0 consecutive
                // successful shots, button disabled again.
                this.fireChargeProgressState = emptyFireChargeProgress(this.levelSystem.maxShots);
            }
            this.fireTrail = this.add.graphics().setDepth(29);
            this.projectileIcon.setTint(0xfff1c0);
            return;
        }

        if (power === 'bomb') {
            recordDailyEvent('bomb');
            // Bomb projectile is launched but is NOT a normal bubble shot and
            // NOT a Fire charging shot. registerShot() is intentionally skipped.
            this.projectileIcon.setTint(0xfff0d8);
            return;
        }

        this.registerShot();
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
        const angle = this.shooter.getAimAngle();
        const muzzle = this.shooter.getMuzzlePosition();
        if (this.selectedPower === 'bomb') {
            // Bomb is consumed only when the projectile actually launches.
            if (this.availableBombs <= 0 || this.bombLaunchInFlight) return;
            this.availableBombs = 0;
            this.bombLaunchInFlight = true;
            this.shooter.setLoadedPower(null);
            this.selectPower(null);
            this.refreshPowerUpCounts();
            this.launchPowerShot('bomb');
            return;
        }
        if (this.selectedPower === 'fireball' && this.fireCharges > 0) {
            // This click is the shot: the mode was already armed and the
            // charge is untouched until the projectile actually launches.
            // Restore the normal launcher, then launch — the launch event
            // itself consumes the charge and restarts the cycle (and the
            // fire launcher dies with selectPower(null) right above).
            this.shooter.setLoadedPower(null);
            this.selectPower(null);
            this.launchPowerShot('fireball');
            this.refreshPowerUpCounts();
            return;
        }
        this.activeBubble = new Bubble(this, muzzle.x, muzzle.y, this.shooter.currentColor);
        this.bubbleVelocity.x = Math.sin(angle) * LAUNCH_SPEED;
        this.bubbleVelocity.y = -Math.cos(angle) * LAUNCH_SPEED;
        this.activeShotPower = null;
        this.registerShot();
        this.shooter.consume();
        this.aimGuide.hide();
        this.refreshHud();
    }

    private registerShot(): void {
        this.pendingShotDirectRemoved = 0;
        this.pendingShotUnsupportedRemoved = 0;
        this.pendingShotDestroyedAny = false;
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
    private recordPowerShotOutcome(removedCount: number, power: ShotPower | 'lightning' = null): void {
        if (this.shotResultRecorded) {
            return;
        }

        this.pendingShotDirectRemoved = 0;
        this.pendingShotUnsupportedRemoved = 0;
        this.pendingShotDestroyedAny = removedCount > 0;
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
            this.createBombImpact(impactPoint.x, impactPoint.y);
            bubble.destroy();
            this.bombLaunchInFlight = false;
            this.availableBombs = 0;
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
            this.recordPowerShotOutcome(removed.length, 'fireball');
            this.score += this.removeBubblesAndFloats(removed, 20);
            this.createFireImpact(bubble.x, bubble.y);
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
            const outcome = this.matchSystem.resolve(cell.row, cell.col);
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

        const step = Math.max(0, Math.min(delta, 50)) / 1000;
        bubble.x += this.bubbleVelocity.x * step;
        bubble.y += this.bubbleVelocity.y * step;

        if (bubble.x < WALL_LEFT || bubble.x > WALL_RIGHT) {
            bubble.x = PhaserMath.Clamp(bubble.x, WALL_LEFT, WALL_RIGHT);
            this.bubbleVelocity.x *= -1;
        }

        this.fireParticleAccumulator += delta;
        if (this.fireParticleAccumulator >= 55) {
            this.fireParticleAccumulator = 0;
            this.spawnFireProjectileParticle(bubble.x, bubble.y);
        }

        const hit = this.grid.shootableBubbles().filter(
            (target) =>
                PhaserMath.Distance.Between(bubble.x, bubble.y, target.x, target.y) <= BUBBLE_RADIUS * 1.5
        );

        if (hit.length > 0) {
            const target = hit[0];
            this.resolveImpact({ row: target.row, col: target.col });
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
            this.pendingShotDestroyedAny =
                this.pendingShotDirectRemoved + this.pendingShotUnsupportedRemoved > 0;
            this.shotResultRecorded = true;
        }

        if (unique.length === 0) {
            this.finishShotResolution();
            return;
        }

        this.boardUpdatesPending += unique.length;
        this.levelSystem.recordBubbleRemovals(unique.length);
        this.levelSystem.syncBoard(this.grid);
        this.refreshHud();

        for (const bubble of unique) {
            this.tweens.add({
                targets: bubble,
                scale: 0.2,
                alpha: 0,
                duration: 170,
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
        if (totalDestroyed > 0) {
            recordDailyEvent('destroy', totalDestroyed);
        }
        const shotDestroyedAny =
            this.pendingShotDestroyedAny || totalDestroyed > 0;
        // Consecutive-bomb streak (5 successful shots) is unchanged. The
        // legacy 10-shot fireball streak is superseded by the dedicated
        // Fire charge progress below; holding that slot permanently keeps
        // its streak paused so fire charges can never be double-granted.
        const streak = resolveStreakRewards(
            this.streakTracking,
            shotDestroyedAny,
            1,
            loadPowerUpInventory().bomb
        );
        this.streakTracking = streak.tracking;

        this.pendingShotDirectRemoved = 0;
        this.pendingShotUnsupportedRemoved = 0;
        this.pendingShotDestroyedAny = false;

        const shotPower = this.pendingShotPower;
        this.pendingShotPower = null;

        // Fire Power charging: ONLY successful NORMAL Bubble Launcher shots
        // advance the cycle. Fire/Bomb projectiles never count. A miss resets
        // to 0% only while NOT fully charged/ready; once 100% is reached it
        // stays locked until a Fire projectile actually launches.
        let fireReady = false;
        if (shotPower === null) {
            const fireLocked = this.fireCharges > 0 || this.fireChargeProgressState.percent >= 100;
            if (!fireLocked || shotDestroyedAny) {
                const chargeStep = resolveFireChargeProgress(
                    this.fireChargeProgressState,
                    shotDestroyedAny,
                    this.levelSystem.maxShots
                );
                this.fireChargeProgressState = chargeStep.progress;

                if (chargeStep.reset && !fireLocked) {
                    this.fireCharges = 0;
                }

                if (chargeStep.reachedFull) {
                    this.fireCharges = Math.min(1, this.fireCharges + 1);
                    this.fireChargeProgressState = {
                        ...this.fireChargeProgressState,
                        percent: 100,
                        requiredShots: this.fireChargeProgressState.requiredShots,
                        streak: this.fireChargeProgressState.requiredShots,
                    };
                    fireReady = true;
                } else if (fireLocked) {
                    this.fireCharges = 1;
                    this.fireChargeProgressState = {
                        ...this.fireChargeProgressState,
                        percent: 100,
                        requiredShots: this.fireChargeProgressState.requiredShots,
                        streak: this.fireChargeProgressState.requiredShots,
                    };
                }
            }
        }

        // Bomb unlock (per individual normal shot): destroying 10+ bubbles in a
        // SINGLE successful normal shot awards exactly ONE stored Bomb Shot.
        // Never while a Bomb is already stored; never from bomb/fire power shots.
        let bombEarned = false;
        if (shotPower === null && totalDestroyed >= 10 && this.availableBombs <= 0) {
            this.availableBombs = 1;
            bombEarned = true;
        }

        if (streak.bombEarned) {
            // Keep inventory streak reward behavior, but the UI/shot system uses
            // the single stored bomb slot; clamp to max 1.
            grantPowerUp('bomb');
            if (this.availableBombs <= 0) {
                this.availableBombs = 1;
                bombEarned = true;
            }
        }

        if (fireReady || bombEarned) {
            const message = fireReady && bombEarned
                ? 'POWER + BOMB READY!'
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
            recordDailyEvent('complete');
        }

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
            continuationEnabled: outcome.won ? undefined : false,
            onReplay: () => this.scene.restart({ level: this.currentLevelIndex }),
            onPrimary: () => {
                if (!outcome.won) {
                    this.scene.restart({ level: this.currentLevelIndex });
                } else if (this.levelSystem.hasNext) {
                    this.scene.restart({ level: this.levelSystem.levelIndex + 1 });
                } else {
                    goToScene(this, 'LevelSelectionScene');
                }
            },
            onSecondary: () => goToScene(this, 'LevelSelectionScene'),
        });
    }

    private togglePause(): void {
        if (this.ended) {
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
                this.aimController.cancelPointerInput();
                goToScene(this, 'LevelSelectionScene');
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
        this.hud.setFireChargeProgress(this.shownFireChargePercent());
        this.hud.setBombState(this.availableBombs > 0, this.selectedPower === 'bomb');
    }

    /** Charge percent for the button: full while a charge is being held. */
    private shownFireChargePercent(): number {
        return this.fireCharges > 0 ? 100 : this.fireChargeProgressState.percent;
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

    private handleShutdown(): void {
        this.extraBallsAdEpoch += 1;
        this.pausePanel?.destroy();
        this.pausePanel = null;
        this.settingsPanel?.destroy();
        this.settingsPanel = null;
        this.gameOverPanel?.destroy();
        resetModalInputLock();
        this.boardScroll?.destroy();
        this.boardScroll = null;
        this.aimController?.destroy();
        this.aimGuide?.destroy();
        this.hud?.destroy();
        this.grid?.destroyAll();
        this.boardMaskShape?.destroy();
        this.boardMaskShape = null;
        this.destroyProjectileEffects();
    }
}
