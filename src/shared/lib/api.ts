import { EnemyHakushiRawType, EnemyHakushType } from "@/shared/types/enemy";
import { AvatarHakushType, AvatarHakushRawType } from "@/shared/types/avatar";
import CacheManager from './cacheManager';
import axios from 'axios';

// キャッシュキー定数
const CACHE_KEYS = {
  CHARACTERS: 'hakushi_characters',
  ENEMIES: 'hakushi_enemies'
} as const;

// 起動後最初の1回目のみ保存するフラグ
let hasSavedCharacterData = false;

// サーバーにキャラクターデータを送信して保存する関数
async function saveCharacterDataToServer(characterData: Record<string, AvatarHakushRawType>): Promise<void> {
    try {
        const response = await fetch('/api/save-character-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ characterData }),
        });

        if (!response.ok) {
            throw new Error(`サーバー保存エラー: ${response.status}`);
        }

        const result = await response.json();
        
    } catch (error) {
        console.error('サーバーへのデータ送信エラー:', error);
        throw error;
    }
}


export async function getCharacterListApi(): Promise<AvatarHakushType[]> {
    const cacheManager = CacheManager.getInstance();
    
    // キャッシュから取得を試行
    const cached = cacheManager.get<AvatarHakushType[]>(CACHE_KEYS.CHARACTERS);
    if (cached) {
        // キャッシュされたデータのlangプロパティが正しいMapかチェック
        const isValidCache = cached.every(character => character.lang instanceof Map);
        if (isValidCache) {
            
            return cached;
        } else {
            
            cacheManager.delete(CACHE_KEYS.CHARACTERS);
        }
    }

    try {
        
        const res = await axios.get<Record<string, AvatarHakushRawType>>(
            'https://api.hakush.in/hsr/data/character.json',
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );
        // 取得直後に特定IDの日本語名を上書き
        const renameMap: Record<string, string> = {
            '1224': '三月なのか-巡狩',
            '8001': '開拓者-壊滅',
            '8002': '開拓者-壊滅',
            '8003': '開拓者-存護',
            '8004': '開拓者-存護',
            '8005': '開拓者-調和',
            '8006': '開拓者-調和',
            '8007': '開拓者-記憶',
            '8008': '開拓者-記憶',
        };
        let overrideCount = 0;
        for (const [id, newName] of Object.entries(renameMap)) {
            const item = (res.data as Record<string, AvatarHakushRawType>)[id];
            if (item) {
                // ルビ除去後の日本語名を上書き
                item.jp = newName;
                overrideCount += 1;
            }
        }
        if (overrideCount > 0) {
            
        }

        const data = new Map(Object.entries(res.data));
        const result = Array.from(data.entries()).map(([id, it]) => {
            // ルビタグを除去
            const cleanedItem = {
                ...it,
                en: it.en ? it.en.replace(/\{RUBY_B#[^}]*\}|\{RUBY_E#\}/g, '') : it.en,
                jp: it.jp ? it.jp.replace(/\{RUBY_B#[^}]*\}|\{RUBY_E#\}/g, '') : it.jp,
                kr: it.kr ? it.kr.replace(/\{RUBY_B#[^}]*\}|\{RUBY_E#\}/g, '') : it.kr,
                cn: it.cn ? it.cn.replace(/\{RUBY_B#[^}]*\}|\{RUBY_E#\}/g, '') : it.cn,
            };
            return convertAvatar(id, cleanedItem);
        });
        
        // キャッシュに保存
        cacheManager.set(CACHE_KEYS.CHARACTERS, result);
        
        // 起動後最初の1回目のみ、ローカルcharacter.jsonを更新
        if (!hasSavedCharacterData) {
            try {
                if (typeof window === 'undefined') {
                    // サーバー環境: 直接ファイルに書き込み
                    const { default: nodeFs } = await import('fs');
                    const { default: nodePath } = await import('path');
                    const dataDir = nodePath.join(process.cwd(), 'src', 'shared', 'data');
                    if (!nodeFs.existsSync(dataDir)) {
                        nodeFs.mkdirSync(dataDir, { recursive: true });
                    }
                    const simplified: Record<string, string> = {};
                    for (const [cid, ch] of Object.entries(res.data)) {
                        // ルビを除去済みのjp/enを優先して保存
                        const jp = ch.jp ? ch.jp.replace(/\{RUBY_B#[^}]*\}|\{RUBY_E#\}/g, '') : '';
                        const en = ch.en ? ch.en.replace(/\{RUBY_B#[^}]*\}|\{RUBY_E#\}/g, '') : '';
                        simplified[cid] = jp || en || `Character_${cid}`;
                    }
                    const filePath = nodePath.join(dataDir, 'character.json');
                    nodeFs.writeFileSync(filePath, JSON.stringify(simplified, null, 2), 'utf8');
                    
                } else {
                    // ブラウザ環境: API経由でサーバーに保存依頼
                    await saveCharacterDataToServer(res.data);
                    
                }
                hasSavedCharacterData = true;
            } catch (saveError) {
                console.warn('ローカルcharacter.jsonの更新に失敗:', saveError);
            }
        }
        
        return result;
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            
        } else {
            
        }
        // フォールバック: public配下のローカルJSONを試行（/public/data/character.json）
        try {
            
            const res = await fetch('/data/character.json', { headers: { 'Content-Type': 'application/json' } });
            if (res.ok) {
                const local = await res.json();
                const entries = Object.entries(local) as Array<[string, any]>;
                const result: AvatarHakushType[] = entries.map(([id, value]) => {
                    // 値が文字列（名前）の簡易フォーマットにも対応
                    if (typeof value === 'string') {
                        const raw: AvatarHakushRawType = {
                            release: '', icon: '', rank: 0, baseType: '', damageType: '', desc: '',
                            en: value, jp: value, kr: value, cn: value
                        } as unknown as AvatarHakushRawType;
                        return convertAvatar(id, raw);
                    }
                    // Hakushi形式（AvatarHakushRawType準拠）
                    return convertAvatar(id, value as AvatarHakushRawType);
                });
                cacheManager.set(CACHE_KEYS.CHARACTERS, result);
                
                return result;
            } else {
                
            }
        } catch (localErr) {
            
        }
        return [];
    }
}

export async function getEnemyListApi(): Promise<EnemyHakushType[]> {
    const cacheManager = CacheManager.getInstance();
    
    // キャッシュから取得を試行
    const cached = cacheManager.get<EnemyHakushType[]>(CACHE_KEYS.ENEMIES);
    if (cached) {
        // キャッシュされたデータのlangプロパティが正しいMapかチェック
        const isValidCache = cached.every(enemy => enemy.lang instanceof Map);
        if (isValidCache) {
            
            return cached;
        } else {
            
            cacheManager.delete(CACHE_KEYS.ENEMIES);
        }
    }

    try {
        
        const res = await axios.get<Record<string, EnemyHakushiRawType>>(
            'https://api.hakush.in/hsr/data/monster.json',
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        const data = new Map(Object.entries(res.data));
        const result = Array.from(data.entries()).map(([id, it]) => convertMonster(id, it));
        
        // キャッシュに保存
        cacheManager.set(CACHE_KEYS.ENEMIES, result);
        
        return result;
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            
        } else {
            
        }
        return [];
    }
}

function convertAvatar(id: string, item: AvatarHakushRawType): AvatarHakushType {
    const lang = new Map<string, string>([
        ['en', item.en],
        ['ja', item.jp], // 日本語ロケール用に'ja'キーを追加
        ['kr', item.kr],
        ['cn', item.cn],
        ['jp', item.jp]
    ]);

    const result: AvatarHakushType = {
        release: item.release,
        icon: item.icon,
        rank: item.rank,
        baseType: item.baseType,
        damageType: item.damageType,
        desc: item.desc,
        lang: lang,
        id: id  
    };

    return result;
}

export function convertMonster(id: string, item: EnemyHakushiRawType): EnemyHakushType {
    const lang = new Map<string, string>([
        ['en', item.en],
        ['ja', item.jp], // 日本語ロケール用に'ja'キーを追加
        ['kr', item.kr],
        ['cn', item.cn],
        ['jp', item.jp]
    ]);
    const result: EnemyHakushType = {
        id: id,
        rank: item.rank,
        camp: item.camp,
        icon: item.icon,
        child: item.child,
        weak: item.weak,
        desc: item.desc,
        lang: lang
    };

    return result;
}

// キャッシュを手動でクリアする関数
export function clearHakushiCache(): void {
    const cacheManager = CacheManager.getInstance();
    cacheManager.delete(CACHE_KEYS.CHARACTERS);
    cacheManager.delete(CACHE_KEYS.ENEMIES);
    
}

// キャッシュの統計情報を取得する関数
export function getHakushiCacheStats(): { size: number; keys: string[] } {
    const cacheManager = CacheManager.getInstance();
    return cacheManager.getStats();
}

// 初期化時に既存のキャッシュをクリア（Map形式の問題を解決）
export async function initializeHakushiCache(): Promise<void> {
    const cacheManager = CacheManager.getInstance();
    const stats = cacheManager.getStats();
    
    if (stats.size > 0) {
        
        clearHakushiCache();
    }

    try {
        // サーバー起動時にも最新を取得してキャッシュ構築
        
        await getCharacterListApi();
    } catch (e) {
        console.warn('起動時プリフェッチ失敗:', e);
    }
}

// 初期化を実行
// サーバー・ブラウザ双方で起動時に初期化（SSRでも実行可）
initializeHakushiCache();