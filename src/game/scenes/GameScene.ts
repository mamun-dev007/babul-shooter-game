import { Math as PhaserMath, Scene } from 'phaser';
import {
    BOARD_VIEW_BOTTOM,
    BOARD_VIEW_TOP,
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
import { computeShooterQueueUpdate, pickSmartShooterColor, type ColorStat } from '../systems/shooterQueue';
import { consumeFireCharge, resolveFireChargeReward } from '../systems/FireChargeSystem';
import { resolveStreakRewards, type StreakTracking } from '../systems/streakRewards';
import { levelOutcomeFor } from '../data/levels/scoring';
import { addCoins, loadProgress, recordScore, markLevelCompleted, toggleMusic, toggleSound } from '../utils/storage';
import { AimGuide } from '../../ui/AimGuide';
import { SettingsPanel } from '../../ui/SettingsPanel';
import { extraBallsRewardFor, showRewardedAd } from '../../ads/rewardedAds';
import { gameAudio } from '../audio/GameAudio';
import { BoardScrollController } from '../input/BoardScrollController';
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
    private settingsPanel: SettingsPanel | null = null;
    private gameOverPanel!: GameOverPanel;
    private activeBubble: Bubble | null = null;
    private projectileIcon: Phaser.GameObjects.Image | null = null;
    private fireTrail: Phaser.GameObjects.Graphics | null = null;
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
    private pendingShotDirectRemoved = 0;
    private pendingShotUnsupportedRemoved = 0;
    private pendingShotDestroyedAny = false;
    private shotResultRecorded = false;
    private streakTracking: StreakTracking = { powerStreak: 0, bombStreak: 0 };
    /** Lock for the rewarded extra-balls flow; guards duplicate claims. */
    private extraBallsInProgress = false;
    /** Bumped on shutdown so a completed ad callback can't pay into a new attempt. */
    private extraBallsAdEpoch = 0;
    private selectedPower: ShotPower = null;

    constructor() {
        super('GameScene');
    }

    create(data?: GameSceneData): void {
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
                !this.paused &&
                !this.ended &&
                !(this.boardScroll?.isDragging ?? false),
            canFire: () =>
                !this.paused &&
                !this.ended &&
                this.activeBubble === null &&
                !this.boardScroll?.isEngaged &&
                this.levelSystem.canShoot,
            onFire: () => this.fireBubble(),
            onPause: () => this.togglePause(),
        });

        this.shooter.setOnBubbleSwap(() => {
            if (this.paused || this.ended || this.activeBubble) {
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
        if (this.paused || this.ended) {
            return false;
        }

        // The bottom colour-change button doubles as the rewarded-ad entry:
        // one full video pays exactly 3 extra shots (see requestExtraBalls).
        if (powerUp === 'colorChanger') {
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
            const inventoryKey = POWER_UP_INVENTORY_KEY.bomb;
            if (loadPowerUpInventory()[inventoryKey] <= 0) return false;
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

    private selectPower(power: ShotPower): void {
        this.selectedPower = power;
        this.shooter.setLoadedPower(power, power === 'bomb' ? 'powerup-bomb' : power === 'fireball' ? 'icon-fire' : null);
        this.shooter.setCurrentFireTint(power === 'fireball');
        this.hud.setActivePowerUp(power === 'fireball' ? 'fireball' : power === 'bomb' ? 'bomb' : null);
        this.aimGuide.show();
        if (power) this.showFireReadyText(power === 'fireball');
    }

    private launchPowerShot(power: Exclude<ShotPower, null>): void {
        this.alignBoardForShot();
        const angle = this.shooter.getAimAngle();
        const muzzle = this.shooter.getMuzzlePosition();
        const color = this.shooter.currentColor;

        this.activeBubble = new Bubble(this, muzzle.x, muzzle.y, color);
        this.activeShotPower = power;
        this.activeBubble.setTint(power === 'bomb' ? 0xff613d : 0xffa32f);
        this.activeBubble.setScale(this.activeBubble.scale * 1.16);
        this.bubbleVelocity.x = Math.sin(angle) * LAUNCH_SPEED * (power === 'fireball' ? 1.2 : 1);
        this.bubbleVelocity.y = -Math.cos(angle) * LAUNCH_SPEED * (power === 'fireball' ? 1.2 : 1);
        this.projectileIcon = this.add
            .image(muzzle.x, muzzle.y, power === 'bomb' ? 'powerup-bomb' : 'icon-fire')
            .setDisplaySize(power === 'bomb' ? 38 : 42, power === 'bomb' ? 38 : 42)
            .setDepth(32);

        if (power === 'fireball') {
            this.fireTrail = this.add.graphics().setDepth(29);
            this.projectileIcon.setTint(0xfff1c0);
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
            if (!consumePowerUp('bomb')) return;
            this.shooter.setLoadedPower(null);
            this.selectPower(null);
            this.refreshPowerUpCounts();
            this.launchPowerShot('bomb');
            return;
        }
        if (this.selectedPower === 'fireball' && this.fireCharges > 0) {
            this.fireCharges = consumeFireCharge(this.fireCharges);
            this.shooter.setLoadedPower(null);
            this.selectPower(null);
            this.refreshPowerUpCounts();
            this.launchPowerShot('fireball');
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
        this.dropAfterShot = this.levelSystem.registerShot();
        this.aimGuide.hide();
        this.refreshHud();
    }

    /**
     * Records the outcome of a power shot (bomb, fireball, lightning). These
     * shots destroy bubbles outside the normal match flow, so their success is
     * recorded explicitly without feeding the big-match fire-charge reward.
     */
    private recordPowerShotOutcome(removedCount: number): void {
        if (this.shotResultRecorded) {
            return;
        }

        this.pendingShotDirectRemoved = 0;
        this.pendingShotUnsupportedRemoved = 0;
        this.pendingShotDestroyedAny = removedCount > 0;
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
            const removed = this.grid
                .shootableBubbles()
                .filter((target) => PhaserMath.Distance.Between(bubble.x, bubble.y, target.x, target.y) <= BUBBLE_RADIUS * 3.2);
            this.recordPowerShotOutcome(removed.length);
            this.score += this.removeBubblesAndFloats(removed, 15);
            bubble.destroy();
        } else if (power === 'fireball') {
            const removed = this.grid.shootableBubbles().filter((target) =>
                PhaserMath.Distance.Between(bubble.x, bubble.y, target.x, target.y) <= BUBBLE_RADIUS * 2.15
            );
            this.recordPowerShotOutcome(removed.length);
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
        this.finishShot();
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
        this.recordPowerShotOutcome(rowBubbles.length);
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
        const reward = resolveFireChargeReward(
            this.fireCharges,
            this.pendingShotDirectRemoved,
            this.pendingShotUnsupportedRemoved
        );
        this.fireCharges = reward.charges;

        // Consecutive successful-shot streaks: the fireball charge (10 shots)
        // and a bomb (5 shots), tracked independently. The big-match charge
        // above is applied first, so a single shot can complete both rewards
        // but never grants the same reward twice or overwrites a held one.
        const streak = resolveStreakRewards(
            this.streakTracking,
            this.pendingShotDestroyedAny ||
                this.pendingShotDirectRemoved + this.pendingShotUnsupportedRemoved > 0,
            this.fireCharges,
            loadPowerUpInventory().bomb
        );
        this.streakTracking = streak.tracking;

        this.pendingShotDirectRemoved = 0;
        this.pendingShotUnsupportedRemoved = 0;
        this.pendingShotDestroyedAny = false;

        if (streak.powerEarned) {
            // The fireball charge slot holds at most one charge.
            this.fireCharges = Math.min(1, this.fireCharges + 1);
        }

        if (streak.bombEarned) {
            grantPowerUp('bomb');
        }

        if (reward.earned || streak.powerEarned || streak.bombEarned) {
            const grantedPower = reward.earned || streak.powerEarned;
            const message = grantedPower && streak.bombEarned
                ? 'POWER + BOMB READY!'
                : streak.bombEarned
                    ? 'BOMB READY!'
                    : 'POWER READY!';
            this.showFireReadyText(false, message);
            this.refreshPowerUpCounts();
        }
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

        let coinReward = 0;
        if (outcome.unlocksNext) {
            const newlyCompleted = markLevelCompleted(this.levelSystem.levelIndex, outcome.stars);
            if (newlyCompleted) {
                coinReward = 25 + outcome.stars * 10;
                addCoins(coinReward);
            }
        }

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
        const core = this.add.circle(x, y, 12, 0xfff4a6).setDepth(45);
        const ring = this.add.circle(x, y, 16, 0xff6a22, 0.55).setDepth(44);
        this.tweens.add({ targets: [core, ring], scale: 3, alpha: 0, duration: 280,
            onComplete: () => { core.destroy(); ring.destroy(); } });
    }

    private refreshPowerUpCounts(): void {
        const inventory = loadPowerUpInventory();
        this.hud.setPowerUpCount('bomb', inventory.bomb);
        this.hud.setPowerUpCount('colorChanger', inventory.colorChanger);
        this.hud.setPowerUpCount('lightning', inventory.lightning);
        this.hud.setPowerUpCount('fireball', this.fireCharges);
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
