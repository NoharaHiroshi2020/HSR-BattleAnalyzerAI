import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { characterData } = body;

    if (!characterData || typeof characterData !== 'object') {
      return NextResponse.json(
        { error: 'characterDataが提供されていません' },
        { status: 400 }
      );
    }

    // 保存先ディレクトリの作成
    const dataDir = path.join(process.cwd(), 'src', 'shared', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

         // 簡易形式（ID→名前）で保存
     const simplifiedData: Record<string, string> = {};
     for (const [id, character] of Object.entries(characterData)) {
       if (character && typeof character === 'object' && 'jp' in character) {
         // Hakushi形式の場合
         const char = character as any;
         // ルビタグを除去
         const cleanJp = char.jp ? char.jp.replace(/\{RUBY_B#[^}]*\}|\{RUBY_E#\}/g, '') : char.jp;
         const cleanEn = char.en ? char.en.replace(/\{RUBY_B#[^}]*\}|\{RUBY_E#\}/g, '') : char.en;
         simplifiedData[id] = cleanJp || cleanEn || `Character_${id}`;
       } else if (typeof character === 'string') {
         // 既に簡易形式の場合（ルビタグ除去済み）
         simplifiedData[id] = character;
       }
     }

    const filePath = path.join(dataDir, 'character.json');
    fs.writeFileSync(filePath, JSON.stringify(simplifiedData, null, 2), 'utf8');

    return NextResponse.json({ success: true, path: filePath });

  } catch (error) {
    return NextResponse.json({ success: false, error: '保存に失敗しました' }, { status: 500 });
  }
}
