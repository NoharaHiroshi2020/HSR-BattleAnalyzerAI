import { SkillBattleInfo, TurnBattleInfo, AvatarInfo, EnemyInfo } from './mics';

export interface BattleDataState {
    lineup: any[];
    turnHistory: TurnBattleInfo[];
    skillHistory: SkillBattleInfo[];
    dataAvatar: any[];
    totalAV: number;
    totalDamage: number;
    damagePerAV: number;
    cycleIndex: number;
    waveIndex: number;
    maxWave: number;
    maxCycle: number;
    version?: string;
    avatarDetail?: Record<number, AvatarInfo>;
    enemyDetail?: Record<number, EnemyInfo>;
    characterNameMap?: Record<number, string>;
    enemyNameMap?: Record<number, string>;
    autoAnalyzeBattle: boolean;
    gptAnalysisLoading: boolean;
    geminiAnalysisLoading: boolean;
    gptAnalysisText?: string;
    geminiAnalysisText?: string;
}

// 新しく追加：onBattleEndServiceに必要なデータを統合
export interface BattleAnalysisInput {
    battleEnd: any; // BattleEndType
    turnHistory: TurnBattleInfo[];
    skillHistory: SkillBattleInfo[];
    avatarDetail?: Record<number, AvatarInfo>;
    enemyDetail?: Record<number, EnemyInfo>;
    cycleInfo: {
        maxCycle: number;
        maxWave: number;
        cycleIndex: number;
        waveIndex: number;
        characterNameMap?: Record<number, string>;
    };
    autoAnalyzeBattle: boolean;
    gptAnalysisLoading: boolean;
    geminiAnalysisLoading: boolean;
}
