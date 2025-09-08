import { BattleEndType } from '@/shared/types/battle';
import { DamageDetailType } from '@/shared/types/attack';
import { SkillBattleInfo, TurnBattleInfo, AvatarInfo, EnemyInfo, BattleDataStateJson } from '@/shared/types/mics';
import { getLocalizedAttackType, getCurrentLocale } from '@/shared/helper/localization';
import { getCharacterListApi } from '@/shared/lib/api';
import { BattleAnalysisInput } from '@/shared/types/battleState';
import characterPathElementData from '@/shared/data/character_path_element.json';



// 型定義
interface AvatarAction {
    avatarId: number;
    avatarName: string;
    stats: Record<string, number | string | boolean>;
    damageDetail: EnhancedDamageDetail[];
    totalDamage: number;
    skillType: number;
    skillName: string;
    turnBattleId: number;
}

interface EnemyAction {
    enemyId: number;
    name: string;
    stats: Record<string, number | string | boolean>;
    damageDetail: DamageDetailType[];
    totalDamage: number;
    turnBattleId: number;
    isEnemy: true;
}

interface EnhancedDamageDetail extends DamageDetailType {
    damageTypeLocalized: string;
    overkillDamage?: number;
}

interface TurnData {
    actionValue: number;
    waveIndex: number;
    round: number;
    actions: (AvatarAction | EnemyAction)[];
    avatarStats: {
        avatarId: number;
        avatarName: string;
        stats: Record<string, number | string | boolean>;
    }[];
}

interface OverkillSkill {
    avatarId: number;
    avatarName: string;
    skillName: string;
    damage: number;
    skillType: number;
    skillTypeLocalized: string;
    actionValue: number;
    overkillAmount: number;
}

interface AvatarOverkillSummary {
    avatarId: number;
    avatarName: string;
    totalDamage: number;
    totalOverkillAmount: number;
    skillCount: number;
    skills: {
        skillName: string;
        skillType: number;
        skillTypeLocalized: string;
        damage: number;
        overkillAmount: number;
    }[];
}

interface AvatarPercentData {
    avatarId: number;
    avatarName: string;
    totalDamage: number;
    percentage: number;
}

interface TypePercentData {
    totalDamage: number;
    skillCount: number;
    averageDamage: number;
}

// 分析結果の型定義
export interface BattleAnalysisResult {
    lineups:any[];
    damageLines: Record<string, TurnData>;
    overkillSummary: AvatarOverkillSummary[];
    percentByAvatar: Record<number, AvatarPercentData>;
    percentByType: Record<string, TypePercentData>;
    waveAnalysis: Record<number, {
        waveIndex: number;
        enemyNames: string[];
        enemyMaxHP: Record<string, number>;
        enemyCurrentStance: Record<string, number>;
        totalDamage: number;
        actionValueInWave: number;
        dpav: number;
    }>;
    //cycleWaveAnalysis: { byCycle: Record<string, number>; byWave: Record<string, number> };
    battleSummary: {
        totalDamage: number;
        totalAV: number;
        damagePerAV: number;
        // maxCycle: number;
        // maxWave: number;
        // currentRound: number;
        // currentWave: number;
    };
}

// 分析ペイロード作成に必要なデータ構造の型定義
export interface BattleAnalysisData {
    lineups:any[];
    damageLines: Record<string, any>;
    overkillSummary: any[];
    percentByAvatar: Record<number, number>;
    percentByType: Record<string, any>;
    waveAnalysis: Record<number, {
        waveIndex: number;
        enemyNames: string[];
        enemyMaxHP: Record<string, number>;
        enemyCurrentStance: Record<string, number>;
        totalDamage: number;
        actionValueInWave: number;
        dpav: number;
    }>;
    //cycleWaveAnalysis: { byCycle: Record<string, number>; byWave: Record<string, number> };
    battleSummary: {
        totalDamage: number;
        totalAV: number;
        damagePerAV: number;
        survivalStats: {
            allies: {
                total: number;
                alive: number;
                dead: number;
                survivalRate: number;
            };
            enemies: {
                total: number;
                alive: number;
                dead: number;
                defeatRate: number;
            };
        };
        missionComplete: boolean;
        // maxCycle: number;
        // maxWave: number;
        // currentCycle: number;
        // currentWave: number;
    };
}


// onBattleEndServiceの関数化
export async function onBattleEndService(
    input: BattleAnalysisInput
): Promise<BattleAnalysisData> {
    // Hakushi APIからキャラクター名を取得
    let characterNameMap: Record<number, string> = {};
    try {
        const list = await getCharacterListApi();
        for (const av of list) {
            const key = Number(av.id);
            const raw = av.lang.get('jp') || av.lang.get('en') || 'Unknown';
            // stripRubiTags関数がない場合は、タグを除去する簡易処理
            const name = raw.replace(/<[^>]*>/g, '');
            if (!Number.isNaN(key)) characterNameMap[key] = name;
        }
    } catch (error) {
        console.warn('Failed to load character names from Hakushi API:', error);
        
        // フォールバック: 入力データのcharacterNameMapを使用
        characterNameMap = input.cycleInfo?.characterNameMap || {};
    }

    const lineups: any[] = [];
    for (const avatar of input.battleEnd.avatars) {
        const avatarName = characterNameMap[avatar.id] || `Avatar_${avatar.id}`;
        
        // character_path_element.jsonからpath/element/rarityを検索
        const characterInfo = characterPathElementData.find(char => char.name === avatarName);
        const path = characterInfo?.path || "???";
        const element = characterInfo?.element || "???";
        const rarity = (characterInfo as any)?.rarity ?? "?";
        
        if (!characterInfo) {
            
        }
        
        lineups.push({ 
            avatarId: avatar.id, 
            Rank: input.avatarDetail?.[avatar.id]?.stats?.['Rank']||0, 
            avatarName: avatarName,
            path: path,
            element: element,
            rarity: rarity
        });
    }
    
    let cycleLeft = input.turnHistory[0].cycleIndex;
    let lastValidCycleIndex = cycleLeft; // 最後の有効なcycleIndexを保持
    
    // AI分析を実行（自動分析が有効な場合）
    {
        // 詳細な分析データを構築
        const currentLocale = getCurrentLocale();
        
        // ターンベースの構造でdamageLinesを構築
        const damageLines = input.turnHistory.reduce((acc: any, turn: any, turnIndex: number) => {
            const turnKey = `Turn${turnIndex}`;
            
            // cycleIndexがnullの場合は前回の有効な値を使用
            const currentCycleIndex = turn.cycleIndex !== null ? turn.cycleIndex : lastValidCycleIndex;
            if (turn.cycleIndex !== null) {
                lastValidCycleIndex = turn.cycleIndex; // 有効な値の場合は更新
            }
            
            // そのターンで使用されたスキルを取得
            const turnSkills = input.skillHistory.filter((skill: any) => skill.turnBattleId === turnIndex);
            
            // プレイヤーのスキルアクション
            const playerActions = turnSkills.map(skill => {
                // Turn0の場合は空のstats、Turn1以降は変更があったstatsのみ
                let avatarStats={}
                if (turnIndex === 0) {
                    const avatarDetail = input.avatarDetail?.[skill.avatarId];
                    avatarStats = Object.entries(avatarDetail?.stats||{}).reduce((acc:any, [key, value]:[string, any]) => {
                        acc[key] = typeof value === 'number' ? Number(value.toFixed(2)) : value;
                        return acc;
                      }, {} as Record<string, any>);
                } else {
                    // Turn1以降: そのターンで変更があったstatsのみを取得
                    const avatarDetail = input.avatarDetail?.[skill.avatarId];
                    if (avatarDetail && avatarDetail.statsHistory) {
                        // そのターンのstatsHistoryからstatsを構築
                        const turnStats = avatarDetail.statsHistory
                            ?.filter((history: any) => history.turnBattleId === turnIndex)
                            .reduce((acc: any, history: any) => ({ ...acc, ...history.stats }), {});
                        
                        // 数値型の値のみを小数点2桁に丸める
                        avatarStats = Object.entries(turnStats || {}).reduce((acc: any, [key, value]: [string, any]) => {
                            acc[key] = typeof value === 'number' ? Number(value.toFixed(2)) : value;
                            return acc;
                        }, {} as Record<string, any>);
                    }
                }
                
                // オーバーキルダメージを計算（enemyDetailの情報を使用）
                const enhancedDamageDetail = skill.damageDetail.map(detail => {
                    // damage_typeを日本語にローカライズ
                    let damageTypeLocalized: string;
                    switch (detail.damage_type) {
                        case 0: // Unknown
                            damageTypeLocalized = '天賦';
                            break;
                        case 1: // Normal
                            damageTypeLocalized = '通常攻撃';
                            break;
                        case 2: // BPSkill
                            damageTypeLocalized = 'スキル';
                            break;
                        case 3: // Ultra
                            damageTypeLocalized = '必殺技';
                            break;
                        case 4: // QTE
                            damageTypeLocalized = 'QTEスキル';
                            break;
                        case 5: // DOT
                            damageTypeLocalized = '継続ダメージ';
                            break;
                        case 6: // Pursued
                            damageTypeLocalized = '追加ダメージ';
                            break;
                        case 7: // Maze
                            damageTypeLocalized = '秘技';
                            break;
                        case 8: // MazeNormal
                            damageTypeLocalized = '通常迷宮';
                            break;
                        case 9: // Insert
                            damageTypeLocalized = '追撃ダメージ';
                            break;
                        case 10: // ElementDamage
                            damageTypeLocalized = '撃破・超撃破ダメージ';
                            break;
                        case 11: // Level
                            damageTypeLocalized = 'レベル';
                            break;
                        case 12: // Servant
                            damageTypeLocalized = '召喚';
                            break;
                        case 13: // TrueDamage
                            damageTypeLocalized = '確定ダメージ';
                            break;
                        default:
                            damageTypeLocalized = `ダメージタイプ${detail.damage_type}`;
                    }
                    
                    const baseDetail = {
                        damage: Number(detail.damage.toFixed(2)),
                        damage_type: detail.damage_type,
                        damageTypeLocalized: damageTypeLocalized
                    };
                    
                    // オーバーキル計算
                    
                    return baseDetail;
                });
                
                return {
                    avatarId: skill.avatarId,
                    avatarName: characterNameMap[skill.avatarId] || `Avatar_${skill.avatarId}`,
                    stats: avatarStats,
                    damageDetail: enhancedDamageDetail,
                    totalDamage: Number(skill.totalDamage.toFixed(2)),
                    skillType: skill.skillType,
                    skillName: skill.skillName,
                    turnBattleId: skill.turnBattleId
                };
            });
            
            // 敵のアクション（ステータス情報）を追加
            const enemyActions: any[] = [];
            
            // 味方が行動したターンで、そのターンに存在する敵のHP情報を追加
            if (input.enemyDetail ) {
                // positionIndexでソートして、参加していない敵を除外
                const sortedEnemies = Object.values(input.enemyDetail)
                    .filter((enemy: any) => enemy.positionIndex !== undefined) // positionIndexが存在する敵のみ
                    .sort((a: any, b: any) => a.positionIndex - b.positionIndex); // positionIndexでソート
                 
                
                                   sortedEnemies.forEach((enemy: any) => {
                      // そのターンで敵のstats情報があるかチェック
                      const turnStatsEntries = enemy.statsHistory?.filter((history: any) => 
                        history.turnBattleId === turnIndex
                    );
                    
                      
                      if (turnStatsEntries && turnStatsEntries.length > 0) {
                          // そのターンでの全てのstatsを統合
                          const enemyStats = turnStatsEntries.reduce((acc: any, history: any) => {
                              // 各statsエントリの値を統合
                              Object.entries(history.stats).forEach(([key, value]) => {
                                  // 数値の場合は小数点2桁に丸める
                                    acc[key] = typeof value === 'number' ? Number(value.toFixed(2)) : value;
                              });
                                    return acc;
                          }, {});
                          
                          
                        
                        enemyActions.push({
                            enemyId: enemy.id,
                            name: enemy.name,
                            stats: enemyStats,
                            damageDetail: [], // 敵は通常ダメージを与えないため空
                            totalDamage: 0,
                            turnBattleId: turnIndex,
                            isEnemy: true // 敵フラグ
                        });
                          
                          
                      } else {
                          
                    }
                });
            }
            
            // プレイヤーと敵のアクションを結合
            const allActions = [...playerActions, ...enemyActions];
            
            // そのターンで変更があった味方のステータス情報を収集
            const avatarStats: any[] = [];
            if (turnIndex > 0) { // Turn0は初期状態なので除外
                // 全てのキャラクターのステータス変更を収集
                input.battleEnd.avatars.forEach((avatar: AvatarInfo) => {
                    const avatarDetail = input.avatarDetail?.[avatar.id];
                    if (avatarDetail && avatarDetail.statsHistory) {
                        // 前のターンのstatsを取得
                        const previousTurnStats: Record<string, any> = avatarDetail.statsHistory
                            ?.filter((history: any) => history.turnBattleId === turnIndex - 1)
                            .reduce((acc: any, history: any) => ({ ...acc, ...history.stats }), {});
                        
                        // 現在のターンのstatsを取得
                        const currentTurnStats: Record<string, any> = avatarDetail.statsHistory
                            ?.filter((history: any) => history.turnBattleId === turnIndex)
                            .reduce((acc: any, history: any) => ({ ...acc, ...history.stats }), {});
                        
                        // 前のターンからの変化量を計算
                        const changedStats: Record<string, any> = {};
                        Object.keys(currentTurnStats).forEach(key => {
                            const currentValue = currentTurnStats[key];
                            const previousValue = previousTurnStats[key];
                            if (key !== 'AV' && key !== 'CurrentSP' && key !== 'MaxSP' && key !== 'SPRatio' &&  currentValue !== previousValue) {
                                // 変化があったstatsの現在値を記録
                                changedStats[key] = typeof currentValue === 'number' ? 
                                    Number(currentValue.toFixed(2)) : currentValue;
                            }
                        });
                        
                        // 変化があった場合のみ追加
                        if (Object.keys(changedStats).length > 0) {
                            avatarStats.push({
                                avatarId: avatar.id,
                                avatarName: characterNameMap[avatar.id] || `Avatar_${avatar.id}`,
                                stats: changedStats
                            });
                        }
                    }
                });
            }
            
            if (allActions.length > 0) {
                acc[turnKey] = {
                    actionValue: Number(turn.actionValue.toFixed(2)),
                    waveIndex: turn.waveIndex,
                    round: cycleLeft - currentCycleIndex,
                    actions: allActions,
                    avatarStats: avatarStats
                };
            }
            
            return acc;
        }, {} as Record<string, any>);
        
        // ターン毎のアクションを時系列順に並べ、重複を削除
        const sortedDamageLines = Object.keys(damageLines).reduce((acc, turnKey) => {
            const actions = damageLines[turnKey].actions;
            
            // 重複を削除（avatarId, skillName, skillType, turnBattleIdの組み合わせで判定）
            const uniqueActions = actions.reduce((unique: any[], action: any) => {
                // 味方のtotalDamageが0の場合は除外（敵は除外しない、Turn0は除外しない）
                const turnIndex = parseInt(turnKey.replace('Turn', ''));
                
                const isDuplicate = unique.find(existing => 
                    existing.avatarId === action.avatarId &&
                    existing.skillName === action.skillName &&
                    existing.skillType === action.skillType &&
                    existing.totalDamage === action.totalDamage &&
                    existing.turnBattleId === action.turnBattleId
                );
                
                if (!isDuplicate) {
                    unique.push(action);
                }
                return unique;
            }, []);
            
            acc[turnKey] = {
                ...damageLines[turnKey],
                actions: uniqueActions.sort((a: any, b: any) => {
                    // stats['AV']（行動値）を使ってソート（少ない順）
                    const aAV = a.stats?.AV || 0;
                    const bAV = b.stats?.AV || 0;
                    return aAV - bAV; // 少ないAVを先に
                })
            };
            return acc;
        }, {} as Record<string, any>);
        
        // オーバーキルサマリーを構築
        const overkillSummary = input.skillHistory
            .map((skill: any) => {
                const turn = input.turnHistory[skill.turnBattleId];
                
                // オーバーキル計算
                let overkillAmount = 0;
                if (input.enemyDetail) {
                    // 各ターンでの敵のHPをstatsHistoryから取得
                    const enemyHPByTurn: Record<number, number> = {};
                    
                     // positionIndexでソートして、参加していない敵を除外
                     const sortedEnemies = Object.values(input.enemyDetail)
                         .filter((enemy: any) => enemy.positionIndex !== undefined) // positionIndexが存在する敵のみ
                         .sort((a: any, b: any) => a.positionIndex - b.positionIndex); // positionIndexでソート
                     
                     sortedEnemies.forEach((enemy: any) => {
                        if (enemy.statsHistory) {
                            // 各ターンでのHPを記録
                            enemy.statsHistory.forEach((history: any) => {
                                if (history.stats.HP !== undefined) {
                                    enemyHPByTurn[history.turnBattleId] = Math.max(
                                        enemyHPByTurn[history.turnBattleId] || 0,
                                        history.stats.HP
                                    );
                                }
                            });
                        }
                    });
                    
                    // スキルが使用されたターンでの敵のHPを取得
                    const skillTurn = skill.turnBattleId;
                    const targetHP = enemyHPByTurn[skillTurn];
                    if (targetHP !== undefined && targetHP > 0) {
                        // 与ダメのうち、攻撃者のskillTypeに一致するdamageDetailのみを逐次加算
                        let damageAmount = 0;
                        if (Array.isArray(skill.damageDetail)) {
                            for (const detail of skill.damageDetail) {
                                // 攻撃中に発生する各種ダメージ（追撃/撃破・超撃破/貫通など）も合算
                                damageAmount += detail.damage;
                                // HPを超えた時点でトラッキング停止（最小超過を採用）
                                if (damageAmount >= targetHP) break;
                            }
                        }
                        // 最小超過ダメージとしてオーバーキル量を算出
                        overkillAmount = Math.max(0, damageAmount - targetHP);
                    }
                }
                
                                    // オーバーキルがあれば計算
                    if (overkillAmount > 0) {
                        return {
                            avatarId: skill.avatarId,
                            avatarName: characterNameMap[skill.avatarId] || `Avatar_${skill.avatarId}`,
                            skillName: skill.skillName,
                            damage: Number(skill.totalDamage.toFixed(2)),
                            skillType: skill.skillType,
                            skillTypeLocalized: getLocalizedAttackType(skill.skillType, currentLocale),
                            actionValue: Number((turn?.actionValue || 0).toFixed(2)),
                            overkillAmount: Number(overkillAmount.toFixed(2))
                        };
                    }
                    return null;
                })
                .filter((skill: any) => skill !== null) // nullを除外
                .reduce((acc: any, skill: any) => {
                    // avatarId別に集約
                    if (!acc[skill.avatarId]) {
                        acc[skill.avatarId] = {
                            avatarId: skill.avatarId,
                            avatarName: skill.avatarName,
                            totalDamage: 0,
                            totalOverkillAmount: 0,
                            skillCount: 0,
                            skills: []
                        };
                    }
                    
                    // 重複チェック：同じスキルが既に追加されていないか確認
                    const skillKey = `${skill.skillName}-${skill.skillType}`;
                    const isDuplicateSkill = acc[skill.avatarId].skills.some((existing: any) => 
                        existing.skillName === skill.skillName &&
                        existing.skillType === skill.skillType
                    );
                    
                    if (!isDuplicateSkill) {
                        acc[skill.avatarId].totalDamage += skill.damage;
                        acc[skill.avatarId].totalOverkillAmount += skill.overkillAmount;
                        acc[skill.avatarId].skillCount += 1;
                        acc[skill.avatarId].skills.push({
                            skillName: skill.skillName,
                            skillType: skill.skillType,
                            skillTypeLocalized: skill.skillTypeLocalized,
                            damage: skill.damage,
                            overkillAmount: skill.overkillAmount
                        });
                    }
                    
                    return acc;
                }, {} as Record<number, any>);
            
            // 集約されたデータを配列に変換し、ダメージ棄却率を計算
            const aggregatedOverkillSummary = Object.values(overkillSummary)
                .map((avatar: any) => ({
                    avatarId: avatar.avatarId,
                    avatarName: avatar.avatarName,
                    totalDamage: Number(avatar.totalDamage.toFixed(2)),
                    totalOverkillAmount: Number(avatar.totalOverkillAmount.toFixed(2)),
                    skillCount: avatar.skillCount,
                    damageRejectionPercent: Number((avatar.totalOverkillAmount / avatar.totalDamage * 100).toFixed(2)), // ダメージ棄却率（%）
                    skills: avatar.skills
                }))
                .sort((a, b) => b.totalOverkillAmount - a.totalOverkillAmount); // オーバーキル量順でソート

            const percentByAvatar = input.skillHistory.reduce((acc: any, skill: any) => {
                if (!acc[skill.avatarId]) {
                    acc[skill.avatarId] = {
                        avatarId: skill.avatarId,
                        avatarName: characterNameMap[skill.avatarId] || `Avatar_${skill.avatarId}`,
                        totalDamage: 0,
                        percentage: 0
                    };
                }
                acc[skill.avatarId].totalDamage += skill.totalDamage;
                return acc;
            }, {} as Record<number, { avatarId: number; avatarName: string; totalDamage: number; percentage: number }>);
            
            // パーセンテージに変換（2桁に統一）
            Object.keys(percentByAvatar).forEach(avatarId => {
                const avatarData = percentByAvatar[parseInt(avatarId)];
                avatarData.percentage = Number(((avatarData.totalDamage / input.battleEnd.total_damage * 100)).toFixed(2));
                avatarData.totalDamage = Number(avatarData.totalDamage.toFixed(2));
            });
            
            // ダメージタイプ別（damageDetail.damage_type）で集計
            const percentByType = input.skillHistory.reduce((acc: any, skill: any) => {
            if (!Array.isArray(skill.damageDetail)) return acc;
            for (const detail of skill.damageDetail) {
            let localizedType: string;
                switch (detail.damage_type) {
                    case 0: localizedType = '天賦'; break; // Unknown -> 天賦（既存表現に合わせる）
                    case 1: localizedType = '通常攻撃'; break;
                    case 2: localizedType = 'スキル'; break;
                    case 3: localizedType = '必殺技'; break;
                    case 4: localizedType = 'QTE'; break; // QTEスキル
                    case 5: localizedType = '継続ダメージ'; break; // DOT
                    case 6: localizedType = '追加ダメージ'; break; // Pursued
                    case 7: localizedType = '秘技'; break; // Maze
                    case 8: localizedType = '通常迷宮'; break; // MazeNormal
                    case 9: localizedType = '追撃ダメージ'; break; // Insert
                    case 10: localizedType = '撃破・超撃破ダメージ'; break; // ElementDamage
                    case 11: localizedType = 'レベル'; break; // Level
                    case 12: localizedType = '召喚'; break; // Servant
                    case 13: localizedType = '確定ダメージ'; break; // TrueDamage
                    default: localizedType = `ダメージタイプ${detail.damage_type}`;
                }
            if (!acc[localizedType]) {
                acc[localizedType] = {
                    totalDamage: 0,
                    skillCount: 0,
                    averageDamage: 0
                };
            }
                acc[localizedType].totalDamage += Number(detail.damage.toFixed(2));
            acc[localizedType].skillCount += 1;
            }
            return acc;
        }, {} as Record<string, { totalDamage: number; skillCount: number; averageDamage: number }>);
        
        // パーセンテージと平均値を計算（2桁に統一）
        Object.keys(percentByType).forEach(type => {
            const typeData = percentByType[type];
            typeData.averageDamage = Number((typeData.totalDamage / typeData.skillCount).toFixed(2));
            // パーセンテージを計算（元の構造との互換性のため）
            (percentByType as any)[`${type}_percentage`] = Number((typeData.totalDamage / input.battleEnd.total_damage * 100).toFixed(2));
        });
        
        // サイクル/ウェーブ分析データも構築
        
        // Wave統計を作成
        const waveAnalysis = (() => {
            const waveStats: Record<number, {
                waveIndex: number;
                enemyNames: string[];
                enemyMaxHP: Record<string, number>;
                enemyCurrentStance: Record<string, number>;
                totalDamage: number;
                actionValueInWave: number;
                dpav: number;
            }> = {};
            
            // damageLinesをスキャンしてWave情報を収集
            Object.entries(sortedDamageLines).forEach(([turnKey, turnData]) => {
                const waveIndex = turnData.waveIndex;
                
                // Wave統計オブジェクトを初期化
                if (!waveStats[waveIndex]) {
                    waveStats[waveIndex] = {
                        waveIndex: waveIndex,
                        enemyNames: [],
                        enemyMaxHP: {},
                        enemyCurrentStance: {},
                        totalDamage: 0,
                        actionValueInWave: 0,
                        dpav: 0
                    };
                }
                
                // そのターンのスキルダメージを集計
                const turnSkills = input.skillHistory.filter((skill: any) => {
                    const turnIndex = parseInt(turnKey.replace('Turn', ''));
                    return skill.turnBattleId === turnIndex;
                });
                const turnDamage = turnSkills.reduce((sum: number, skill: any) => {
                    return sum + skill.totalDamage;
                }, 0);
                
                waveStats[waveIndex].totalDamage += turnDamage;
                
                // actionsをスキャンして敵の情報を収集
                for (const action of turnData.actions) {
                    if (action.isEnemy) {
                        const enemyName = action.name;
                        
                        // 敵の名前を記録（重複チェック）
                        if (!waveStats[waveIndex].enemyNames.includes(enemyName)) {
                            waveStats[waveIndex].enemyNames.push(enemyName);
                        }
                        
                        // HPの最大値を更新（全ターンで最大値を追跡）
                        if (action.stats.HP !== undefined) {
                            const currentMaxHP = waveStats[waveIndex].enemyMaxHP[enemyName] || 0;
                            waveStats[waveIndex].enemyMaxHP[enemyName] = Math.max(currentMaxHP, action.stats.HP);
                        }
                        
                        // CurrentStanceの最大値を更新（全ターンで最大値を追跡）
                        if (action.stats.CurrentStance !== undefined) {
                            const currentMaxStance = waveStats[waveIndex].enemyCurrentStance[enemyName] || 0;
                            waveStats[waveIndex].enemyCurrentStance[enemyName] = Math.max(currentMaxStance, action.stats.CurrentStance);
                        }
                    }
                }
            });
            
            // ActionValue差とDPAVを計算
            Object.keys(waveStats).forEach(waveKey => {
                const waveIndex = parseInt(waveKey);
                const wave = waveStats[waveIndex];
                
                // ActionValue差を計算
                if (waveIndex === 1) {
                    // waveIndex=1のとき：ウェーブ最後のターンActionValue
                    const wave1Turns = Object.entries(sortedDamageLines)
                        .filter(([turnKey, turnData]) => turnData.waveIndex === 1);
                    if (wave1Turns.length > 0) {
                        const lastTurn = wave1Turns[wave1Turns.length - 1][1];
                        wave.actionValueInWave = Number(lastTurn.actionValue.toFixed(2));
                    }
                } else if (waveIndex > 1) {
                    // waveIndex>1のとき：前ウェーブ最後のターンActionValueと当該ウェーブ最後のターンActionValueの差
                    const prevWaveTurns = Object.entries(sortedDamageLines)
                        .filter(([turnKey, turnData]) => turnData.waveIndex === waveIndex - 1);
                    const currentWaveTurns = Object.entries(sortedDamageLines)
                        .filter(([turnKey, turnData]) => turnData.waveIndex === waveIndex);
                    
                    if (prevWaveTurns.length > 0 && currentWaveTurns.length > 0) {
                        const prevWaveLastTurn = prevWaveTurns[prevWaveTurns.length - 1][1];
                        const currentWaveLastTurn = currentWaveTurns[currentWaveTurns.length - 1][1];
                        wave.actionValueInWave = Number((currentWaveLastTurn.actionValue - prevWaveLastTurn.actionValue).toFixed(2));
                    }
                }
                
                // DPAVを計算
                if (wave.actionValueInWave > 0) {
                    wave.dpav = Number((wave.totalDamage / wave.actionValueInWave).toFixed(2));
                }
                
                // 数値を2桁に丸める
                wave.totalDamage = Number(wave.totalDamage.toFixed(2));
            });
            
            return waveStats;
        })();
        
        // battleSummaryの計算処理（cleanedDamageLinesの前に実行）
        const battleSummaryData = (() => {
            // statsHistoryから最終HPを取得（生き返り対応）
            const avatarFinalHP: Record<number, number> = {};
            const enemyFinalHP: Record<number, number> = {};
            
            // 味方の最終HPをstatsHistoryから取得
            input.battleEnd.avatars.forEach((avatar: AvatarInfo) => {
                const avatarDetail = input.avatarDetail?.[avatar.id];
                if (avatarDetail && avatarDetail.statsHistory && avatarDetail.statsHistory.length > 0) {
                    const lastHPEntry = avatarDetail.statsHistory
                        .filter((history: any) => history.stats.HP !== undefined)
                        .sort((a: any, b: any) => b.turnBattleId - a.turnBattleId)[0];
                    
                    if (lastHPEntry) {
                        avatarFinalHP[avatar.id] = lastHPEntry.stats.HP;
                    }
                }
            });
            
            // 敵の最終HPをdamageLinesから取得
            Object.entries(sortedDamageLines).forEach(([turnKey, turnData]) => {
                turnData.actions?.forEach((action: any) => {
                    if (action.isEnemy && action.stats.HP !== undefined) {
                        enemyFinalHP[action.enemyId] = action.stats.HP;
                    }
                });
            });
            
            // 統計を計算
            let alliesAlive = 0;
            let alliesDead = 0;
            let enemiesAlive = 0;
            let enemiesDead = 0;
            
            // 味方の統計
            input.battleEnd.avatars.forEach((avatar: AvatarInfo) => {
                const finalHP = avatarFinalHP[avatar.id];
                if (finalHP !== undefined) {
                    if (finalHP > 0) {
                        alliesAlive++;
                    } else {
                        alliesDead++;
                    }
                } else {
                    // HP記録がない場合は生存とみなす
                    alliesAlive++;
                }
            });
            
            // 敵の統計（HP記録がある敵のみ）
            const appearedEnemies = Object.keys(enemyFinalHP).length;
            Object.entries(enemyFinalHP).forEach(([enemyId, hp]) => {
                if (hp > 0) {
                    enemiesAlive++;
                } else {
                    enemiesDead++;
                }
            });
            
            return {
                totalDamage: Number(input.battleEnd.total_damage.toFixed(2)),
                totalAV: Number(input.battleEnd.action_value.toFixed(2)),
                damagePerAV: Number((input.battleEnd.total_damage / (input.battleEnd.action_value === 0 ? 1 : input.battleEnd.action_value)).toFixed(2)),
                survivalStats: {
                    allies: {
                        total: input.battleEnd.avatars.length,
                        alive: alliesAlive,
                        dead: alliesDead,
                        survivalRate: Number(((alliesAlive / input.battleEnd.avatars.length) * 100).toFixed(2))
                    },
                    enemies: {
                        total: appearedEnemies,
                        alive: enemiesAlive,
                        dead: enemiesDead,
                        defeatRate: appearedEnemies > 0 ? 
                            Number(((enemiesDead / appearedEnemies) * 100).toFixed(2)) : 0
                    }
                },
                missionComplete: (() => {
                    // ミッション完了判定（味方全員生存または敵全滅）
                    const allAlliesAlive = alliesAlive === input.battleEnd.avatars.length;
                    const allEnemiesDefeated = appearedEnemies > 0 && enemiesDead === appearedEnemies;
                    return allAlliesAlive || allEnemiesDefeated;
                })()
            };
        })();
        
        // 各ターンでキャラクターの生死状況を動的に設定（生き返り対応）
        const avatarLastIsDie = new Map<number, boolean>(); // avatarId -> lastIsDie
        Object.entries(sortedDamageLines).forEach(([turnKey, turnData]) => {
            if (turnData.avatarStats) {
                turnData.avatarStats.forEach((avatarStat: any) => {
                    // そのターンのHPをstatsHistoryから取得
                    const avatarDetail = input.avatarDetail?.[avatarStat.avatarId];
                    if (avatarDetail && avatarDetail.statsHistory) {
                        const currentTurn = parseInt(turnKey.replace('Turn', ''));
                        const currentTurnStats = avatarDetail.statsHistory
                            ?.filter((history: any) => history.turnBattleId === currentTurn)
                            .reduce((acc: any, history: any) => ({ ...acc, ...history.stats }), {});
                        
                        // 現在の生死状況を計算
                        const currentIsDie = currentTurnStats.HP !== undefined && currentTurnStats.HP <= 0;
                        const lastIsDie = avatarLastIsDie.get(avatarStat.avatarId) ?? false;
                        
                        // 生死状況が変化した場合のみisDieフラグを設定
                        if (currentIsDie !== lastIsDie) {
                            avatarStat.stats.isDie = currentIsDie;
                            avatarLastIsDie.set(avatarStat.avatarId, currentIsDie);
                        }
                    }
                });
            }
        });
        
        // 異常値修正と不要パラメータ削除の処理
        const cleanedDamageLines = Object.keys(sortedDamageLines).reduce((acc, turnKey) => {
            const turn = sortedDamageLines[turnKey];
            
            // 異常値修正関数（2^31-1を超えた値を0に修正）
            const fixAnomalyValues = (value: any): any => {
                if (typeof value === 'number') {
                    return value > 2147483647 ? 0 : value; // 2^31-1
                }
                if (typeof value === 'object' && value !== null) {
                    const fixed: any = {};
                    for (const [key, val] of Object.entries(value)) {
                        fixed[key] = fixAnomalyValues(val);
                    }
                    return fixed;
                }
                return value;
            };
            
            // actions内のstatsを修正
            const cleanedActions = turn.actions.map((action: any) => {
                // statsの異常値修正と不要パラメータ削除
                const cleanedStats: Record<string, any> = {};
                Object.entries(action.stats).forEach(([key, value]) => {
                    // 不要パラメータを除外
                    if (key !== 'AV' && key !== 'CurrentSP' && key !== 'MaxSP' && key !== 'SPRatio') {
                        // 異常値修正を適用
                        cleanedStats[key] = fixAnomalyValues(value);
                    }
                });
                
                // turnBattleIdを削除
                const { turnBattleId, ...actionWithoutTurnBattleId } = action;
                
                // totalDamage==0のときdamageDetail[]とtotalDamageプロパティの削除
                const { damageDetail, totalDamage, ...actionWithoutDamage } = actionWithoutTurnBattleId;
                const cleanedAction = {
                    ...actionWithoutDamage,
                    stats: cleanedStats
                };
                
                // totalDamageが0より大きい場合のみdamageDetailとtotalDamageを追加
                if (totalDamage && totalDamage > 0) {
                    cleanedAction.damageDetail = damageDetail;
                    cleanedAction.totalDamage = totalDamage;
                }
                
                // avatarId,enemyIdプロパティの削除
                const { avatarId, enemyId, ...finalAction } = cleanedAction;
                
                return finalAction;
            });
            
            // avatarStatsのクリーニング処理
            const cleanedAvatarStats = (turn.avatarStats || []).map((avatarStat: any) => {
                // statsの異常値修正と不要パラメータ削除
                const cleanedStats: Record<string, any> = {};
                Object.entries(avatarStat.stats).forEach(([key, value]) => {
                    // 不要パラメータを除外
                    if (key !== 'AV' && key !== 'CurrentSP' && key !== 'MaxSP' && key !== 'SPRatio') {
                        // 異常値修正を適用
                        cleanedStats[key] = fixAnomalyValues(value);
                    }
                });
                
                // avatarIdを削除
                const { avatarId, ...avatarStatWithoutId } = avatarStat;
                
                return {
                    ...avatarStatWithoutId,
                    stats: cleanedStats
                };
            });
            
            acc[turnKey] = {
                ...turn,
                actions: cleanedActions,
                avatarStats: cleanedAvatarStats
            };
            
            return acc;
        }, {} as Record<string, any>);
        
        
                 // damageDetailの圧縮処理（ペイロード削減のため）
         const compressedDamageLines = Object.keys(cleanedDamageLines).reduce((acc, turnKey) => {
             const turn = cleanedDamageLines[turnKey];
             
             // 同じavatarIdのstats重複を削除するための処理
             const avatarStatsMap = new Map<number, Record<string, any>>();
             const compressedActions = turn.actions.map((action: any) => {
                 if (action.isEnemy) {
                     // 敵のアクションはそのまま
                     return action;
                 }
                 
                 // プレイヤーのアクション：damageDetailを圧縮
                 const compressedDamageDetail = (action.damageDetail || []).reduce((detailAcc: any[], detail: any) => {
                     const existingDetail = detailAcc.find(d => d.damage_type === detail.damage_type);
                     
                     if (existingDetail) {
                         // 既存のdamage_typeがあれば、damageを加算
                         existingDetail.damage = Number((existingDetail.damage + detail.damage).toFixed(2));
                     } else {
                         // 新しいdamage_typeなら追加
                         detailAcc.push({
                             damage: Number(detail.damage.toFixed(2)),
                             damage_type: detail.damage_type,
                             damageTypeLocalized: detail.damageTypeLocalized
                         });
                     }
                     
                     return detailAcc;
                 }, []);
                 
                 // statsの重複削除処理（isDieフラグも含む）
                 let compressedStats = action.stats;
                 if (avatarStatsMap.has(action.avatarId)) {
                     // 既に同じavatarIdのstatsが存在する場合、変更された値のみを保持
                     const previousStats = avatarStatsMap.get(action.avatarId)!;
                     const changedStats: Record<string, any> = {};
                     
                     Object.entries(action.stats).forEach(([key, value]) => {
                         // isDieフラグは常にチェック（生死状況の変化は重要）
                         if (key === 'isDie' || previousStats[key] !== value) {
                             changedStats[key] = value;
                         }
                     });
                     
                     // 変更された値がある場合のみstatsを更新
                     if (Object.keys(changedStats).length > 0) {
                         compressedStats = changedStats;
                         avatarStatsMap.set(action.avatarId, { ...previousStats, ...changedStats });
                     } else {
                         // 変更がない場合はstatsを削除
                         compressedStats = {};
                     }
                 } else {
                     // 初回登場の場合はstatsをそのまま保持
                     avatarStatsMap.set(action.avatarId, action.stats);
                 }
                 // totalDamageを計算
                 const totalDamage = Number(compressedDamageDetail.reduce((sum: number, detail: any) => sum + detail.damage, 0).toFixed(2));
                 
                 // totalDamage > 0の場合のみdamageDetailとtotalDamageを含める
                 if (totalDamage > 0) {
                     return {
                         ...action,
                         stats: compressedStats,
                         damageDetail: compressedDamageDetail,
                         totalDamage: totalDamage
                     };
                 } else {
                     return {
                         ...action,
                         stats: compressedStats
                     };
                 }
             });
             
             acc[turnKey] = {
                 ...turn,
                 actions: compressedActions,
                 avatarStats: turn.avatarStats || [] // avatarStatsも保持
             };
             
             return acc;
         }, {} as Record<string, any>);
        
        // 分析ペイロード作成に必要なデータ構造を返す
        const lineupData = lineups;  // ← 変数名を変更        
        
        return {
            lineups: lineupData,
            damageLines: compressedDamageLines,
            overkillSummary: aggregatedOverkillSummary,
            percentByAvatar: Object.fromEntries(
                Object.entries(percentByAvatar).map(([key, value]: [string, any]) => [key, value.percentage])
            ),
            percentByType,
            waveAnalysis,
            //cycleWaveAnalysis,
            battleSummary: battleSummaryData,
        };
    }
}
