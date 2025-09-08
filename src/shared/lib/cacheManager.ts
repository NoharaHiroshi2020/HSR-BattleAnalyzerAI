interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number; // 21日 = 21 * 24 * 60 * 60 * 1000 = 1,814,400,000 ms
}

class CacheManager {
  private static instance: CacheManager;
  private cache: Map<string, CacheItem<any>>;
  private readonly defaultTTL = 21 * 24 * 60 * 60 * 1000; // 21日

  private constructor() {
    this.cache = new Map();
    this.loadFromStorage();
  }

  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  // キャッシュにデータを保存
  public set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      ttl
    };
    
    this.cache.set(key, item);
    this.saveToStorage();
  }

  // キャッシュからデータを取得
  public get<T>(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    // TTLチェック
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      this.saveToStorage();
      return null;
    }

    return item.data;
  }

  // キャッシュの有効性をチェック
  public has(key: string): boolean {
    const item = this.cache.get(key);
    
    if (!item) {
      return false;
    }

    // TTLチェック
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      this.saveToStorage();
      return false;
    }

    return true;
  }

  // キャッシュをクリア
  public clear(): void {
    this.cache.clear();
    this.saveToStorage();
  }

  // 特定のキーを削除
  public delete(key: string): void {
    this.cache.delete(key);
    this.saveToStorage();
  }

  // 期限切れのキャッシュをクリーンアップ
  public cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    for (const [key, item] of entries) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
      }
    }
    this.saveToStorage();
  }

  // ローカルストレージに保存
  private saveToStorage(): void {
    if (typeof window !== 'undefined') {
      try {
        const cacheData = Object.fromEntries(this.cache);
        localStorage.setItem('hakushi_cache', JSON.stringify(cacheData));
      } catch (error) {
        console.warn('Failed to save cache to localStorage:', error);
      }
    }
  }

  // ローカルストレージから読み込み
  private loadFromStorage(): void {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('hakushi_cache');
        if (cached) {
          const cacheData = JSON.parse(cached);
          // Mapオブジェクトを正しく復元
          const restoredCache = new Map();
          for (const [key, value] of Object.entries(cacheData)) {
            if (value && typeof value === 'object' && 'lang' in value) {
              // langプロパティをMapとして復元
              const restoredValue = { ...value };
              if (value.lang && typeof value.lang === 'object' && !(value.lang instanceof Map)) {
                restoredValue.lang = new Map(Object.entries(value.lang));
              }
              restoredCache.set(key, restoredValue);
            } else {
              restoredCache.set(key, value);
            }
          }
          this.cache = restoredCache;
        }
      } catch (error) {
        console.warn('Failed to load cache from localStorage:', error);
      }
    }
  }

  // キャッシュの統計情報を取得
  public getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

export default CacheManager;
