import { FONT, FONT_DISPLAY } from '../../game/config';

// Design System Tokens for Bubble Pop Adventure

export const DesignTokens = {
    colors: {
        // Primary Palette
        primaryBlue: 0x168BFF,
        deepBlue: 0x173A8A,
        purple: 0x692BC2,
        brightGreen: 0x38D94A,
        gold: 0xFFC928,
        red: 0xFF454F,
        lightBlueBg: 0x8EB8FF,
        darkText: 0x17264D,
        
        // Extended Palette
        skyBlue: 0x8FE3FF,
        cyanAccent: 0x4FC8F5,
        violetGlow: 0xA855F7,
        deepPurpleBg: 0x1E0B3B,
        midnightBlue: 0x050915,
        slateText: 0x9FB7DD,
        goldDark: 0xF59E0B,
        
        // UI States
        success: 0x38D94A,
        warning: 0xFFC928,
        danger: 0xFF454F,
        info: 0x168BFF,
        
        // Glass/Panel
        panelBg: 0x0B1730,
        panelBorder: 0x31507F,
        panelBgDark: 0x02050D,
    },
    
    typography: {
        fontDisplay: FONT_DISPLAY,
        fontBody: FONT,
        sizes: {
            xs: '9px',
            sm: '10px',
            md: '12px',
            lg: '14px',
            xl: '16px',
            '2xl': '18px',
            '3xl': '21px',
            '4xl': '27px',
            '5xl': '38px',
            '6xl': '52px',
            '7xl': '62px',
            '8xl': '70px',
            '9xl': '78px',
        },
        weights: {
            normal: '400',
            medium: '500',
            semibold: '600',
            bold: '700',
            black: '900',
        }
    },
    
    spacing: {
        xs: 4,
        sm: 8,
        md: 12,
        lg: 16,
        xl: 24,
        '2xl': 32,
        '3xl': 48,
        '4xl': 64,
    },
    
    radius: {
        sm: 8,
        md: 12,
        lg: 16,
        xl: 22,
        '2xl': 28,
        full: 9999,
    },
    
    shadows: {
        sm: '0 2px 8px rgba(0, 0, 0, 0.3)',
        md: '0 4px 12px rgba(0, 0, 0, 0.4)',
        lg: '0 8px 24px rgba(0, 0, 0, 0.5)',
        xl: '0 12px 32px rgba(0, 0, 0, 0.6)',
        glowBlue: '0 0 20px rgba(22, 139, 255, 0.6)',
        glowGold: '0 0 16px rgba(255, 201, 40, 0.5)',
        glowGreen: '0 0 16px rgba(56, 217, 74, 0.5)',
    },
    
    gradients: {
        buttonPlay: [0x6DFF9B, 0x38D94A],
        buttonPrimary: [0x4FC8F5, 0x168BFF],
        buttonGold: [0xFFE38A, 0xFFC928],
        buttonDanger: [0xFF6B6B, 0xFF454F],
        bgGame: ['#1a2f5c', '#0b1734', '#050915'],
        bgMenu: ['#14244d', '#070b16', '#02040a'],
        bgLevelMap: ['#6D28D9', '#4C1D95', '#1E0B3B', '#0F0524'],
    }
} as const;

export type DesignColor = keyof typeof DesignTokens.colors;
export type DesignSize = keyof typeof DesignTokens.spacing;
export type DesignRadius = keyof typeof DesignTokens.radius;
