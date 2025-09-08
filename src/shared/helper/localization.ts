// stats名の各国言語対応
export function getLocalizedStatName(statKey: string, locale: string = 'ja'): string {
  const statTranslations: Record<string, Record<string, string>> = {
    'HP': {
      'ja': 'HP',
      'en': 'HP',
      'zh': 'HP',
      'ko': 'HP',
      'vi': 'HP'
    },
    'Speed': {
      'ja': '速度',
      'en': 'Speed',
      'zh': '速度',
      'ko': '속도',
      'vi': 'Tốc độ'
    },
    'CriticalChance': {
      'ja': '会心率',
      'en': 'Critical Chance',
      'zh': '暴击率',
      'ko': '치명타 확률',
      'vi': 'Tỷ lệ chí mạng'
    },
    'CriticalDamage': {
      'ja': '会心ダメージ',
      'en': 'Critical Damage',
      'zh': '暴击伤害',
      'ko': '치명타 피해',
      'vi': 'Sát thương chí mạng'
    },
    'CurrentStance': {
      'ja': '靭性値',
      'en': 'Stance',
      'zh': '韧性值',
      'ko': '인성',
      'vi': 'Độ bền'
    }
  };

  return statTranslations[statKey]?.[locale] || statKey;
}

// AttackTypeの各国言語対応
export function getLocalizedAttackType(type: number | undefined, locale: string = 'ja'): string {
  if (type === undefined) return "";
  
  const attackTypeTranslations: Record<number, Record<string, string>> = {
    0: { 'ja': '天賦', 'en': 'Talent' },
    1: { 'ja': '通常攻撃', 'en': 'Basic Attack' },
    2: { 'ja': 'スキル', 'en': 'Skill' },
    3: { 'ja': '必殺技', 'en': 'Ultimate' },
    4: { 'ja': 'QTE', 'en': 'QTE' },
    5: { 'ja': '継続ダメージ', 'en': 'DOT' },
    6: { 'ja': '追撃', 'en': 'Pursued' },
    7: { 'ja': '秘技', 'en': 'Technique' },
    8: { 'ja': '秘技通常', 'en': 'Maze Normal' },
    9: { 'ja': '追撃攻撃', 'en': 'Follow-up' },
    10: { 'ja': '属性ダメージ', 'en': 'Elemental Damage' },
    11: { 'ja': 'レベル', 'en': 'Level' },
    12: { 'ja': '召喚',  'en': 'Summon' },
    13: { 'ja': '確定ダメージ', 'en': 'True   Damage' }
  };

  return attackTypeTranslations[type]?.[locale] || attackTypeTranslations[type]?.['en'] || `Unknown(${type})`;
}

// 環境変数からロケールを取得
export function getCurrentLocale(): string {
  return process.env.CHAR_NAME_LANG || 'ja';
}
