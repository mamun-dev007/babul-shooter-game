import { GAME_HEIGHT, GAME_WIDTH } from '../game/config';

/**
 * Draws a lightweight fantasy landscape behind the live bubble grid.
 */
export class PlayfieldBackdrop {
    constructor(scene: Phaser.Scene) {
        this.drawLandscape(scene);
    }

    private drawLandscape(scene: Phaser.Scene): void {
        const skyGlow = scene.add
            .ellipse(GAME_WIDTH / 2, 286, 470, 340, 0xffffff, 0.1)
            .setDepth(-19);

        scene.tweens.add({
            targets: skyGlow,
            alpha: 0.17,
            duration: 4200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        const mountains = scene.add.graphics().setDepth(-16);
        mountains.fillStyle(0x84b9df, 0.58);
        mountains.beginPath();
        mountains.moveTo(0, 558);
        mountains.lineTo(42, 504);
        mountains.lineTo(91, 548);
        mountains.lineTo(154, 474);
        mountains.lineTo(226, 544);
        mountains.lineTo(294, 490);
        mountains.lineTo(366, 548);
        mountains.lineTo(442, 482);
        mountains.lineTo(540, 557);
        mountains.lineTo(540, GAME_HEIGHT);
        mountains.lineTo(0, GAME_HEIGHT);
        mountains.closePath();
        mountains.fillPath();

        mountains.fillStyle(0x6fa5d3, 0.48);
        mountains.beginPath();
        mountains.moveTo(0, 590);
        mountains.lineTo(54, 540);
        mountains.lineTo(116, 579);
        mountains.lineTo(193, 519);
        mountains.lineTo(267, 584);
        mountains.lineTo(347, 532);
        mountains.lineTo(426, 584);
        mountains.lineTo(497, 528);
        mountains.lineTo(540, 564);
        mountains.lineTo(540, GAME_HEIGHT);
        mountains.lineTo(0, GAME_HEIGHT);
        mountains.closePath();
        mountains.fillPath();

        const farHills = scene.add.graphics().setDepth(-15);
        farHills.fillStyle(0x4d9b8e, 0.68);
        farHills.fillEllipse(76, 655, 290, 190);
        farHills.fillEllipse(490, 657, 330, 210);
        farHills.fillStyle(0x328c7e, 0.72);
        farHills.fillEllipse(38, 744, 310, 260);
        farHills.fillEllipse(520, 758, 350, 280);

        this.drawRiver(scene);
        this.drawForest(scene);
        this.drawClouds(scene);
    }

    private drawRiver(scene: Phaser.Scene): void {
        const river = scene.add.graphics().setDepth(-13);
        const left: Array<[number, number]> = [
            [230, 538],
            [222, 582],
            [254, 627],
            [281, 674],
            [278, 719],
            [242, 767],
            [235, 826],
            [250, 878],
            [222, GAME_HEIGHT],
        ];
        const right: Array<[number, number]> = [
            [306, 538],
            [296, 580],
            [330, 625],
            [355, 674],
            [348, 719],
            [310, 767],
            [305, 826],
            [321, 878],
            [296, GAME_HEIGHT],
        ];

        river.fillStyle(0x75d8df, 0.74);
        river.beginPath();
        river.moveTo(left[0][0], left[0][1]);
        left.slice(1).forEach(([x, y]) => river.lineTo(x, y));
        right.reverse().forEach(([x, y]) => river.lineTo(x, y));
        river.closePath();
        river.fillPath();

        river.lineStyle(3, 0xe4ffff, 0.55);
        river.beginPath();
        left.forEach(([x, y], index) => {
            if (index === 0) {
                river.moveTo(x, y);
            } else {
                river.lineTo(x, y);
            }
        });
        river.strokePath();
        river.lineStyle(2, 0xffffff, 0.34);
        river.lineBetween(261, 597, 293, 633);
        river.lineBetween(295, 688, 276, 724);
        river.lineBetween(274, 791, 265, 821);
    }

    private drawForest(scene: Phaser.Scene): void {
        const forest = scene.add.graphics().setDepth(-12);

        for (let index = 0; index < 18; index++) {
            const leftSide = index < 9;
            const column = index % 9;
            const x = leftSide ? 8 + column * 13 : GAME_WIDTH - 8 - column * 13;
            const y = 606 + (column % 4) * 44;
            const height = 60 + (column % 3) * 18;
            const width = 25 + (column % 2) * 6;

            forest.fillStyle(column % 2 === 0 ? 0x247e70 : 0x1b7167, 0.84);
            forest.fillTriangle(x, y - height, x - width / 2, y + 6, x + width / 2, y + 6);
            forest.fillStyle(0x1d685f, 0.88);
            forest.fillTriangle(
                x,
                y - height * 0.64,
                x - width * 0.62,
                y + height * 0.2,
                x + width * 0.62,
                y + height * 0.2
            );
            forest.fillStyle(0x72583e, 0.62);
            forest.fillRect(x - 2, y + 3, 4, 17);
        }

        forest.fillStyle(0x1c786b, 0.3);
        forest.fillEllipse(GAME_WIDTH / 2, GAME_HEIGHT + 22, GAME_WIDTH + 90, 110);
    }

    private drawClouds(scene: Phaser.Scene): void {
        const clouds = scene.add.graphics().setDepth(-18);

        clouds.fillStyle(0xffffff, 0.13);
        clouds.fillEllipse(80, 352, 155, 34);
        clouds.fillEllipse(432, 392, 174, 42);
        clouds.fillEllipse(170, 446, 130, 26);

        const cloud = scene.add.ellipse(80, 352, 155, 34, 0xffffff, 0.1).setDepth(-17);
        scene.tweens.add({
            targets: cloud,
            x: 104,
            duration: 7400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }
}
