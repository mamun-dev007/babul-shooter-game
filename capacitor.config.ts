import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.example.bubbleshooter',
    appName: 'Bubble Shooter',
    webDir: 'dist',
    server: {
        androidScheme: 'https',
    },
    android: {
        backgroundColor: '#050915',
    },
};

export default config;
