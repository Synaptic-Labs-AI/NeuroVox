// src/types.ts

import { NeuroVoxSettings } from './settings/Settings';

export interface Position {
    x: number;
    y: number;
}

export interface PluginData extends NeuroVoxSettings {
    buttonPosition?: Position;
}
