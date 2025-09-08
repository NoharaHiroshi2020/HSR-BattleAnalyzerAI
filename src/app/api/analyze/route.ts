import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { ReasoningEffort } from 'openai/resources.mjs';

/**
 * ルビタグを削除してペイロードを圧縮する
 */
function removeRubyTags(text: string): string {
    return text.replace(/\{RUBY_B#[^}]*\}/g, '').replace(/\{RUBY_E#\}/g, '');
}

/**
 * データからルビタグを削除してペイロードを圧縮する
 */
function removeRubyTagsFromData(data: any): any {
    if (typeof data === 'string') {
        return removeRubyTags(data);
    }
    
    if (Array.isArray(data)) {
        return data.map(item => removeRubyTagsFromData(item));
    }
    
    if (data && typeof data === 'object') {
        const cleaned: any = {};
        for (const [key, value] of Object.entries(data)) {
            // waveAnalysisの敵名（オブジェクトのキー）もルビタグを削除
            const cleanedKey = typeof key === 'string' ? removeRubyTags(key) : key;
            cleaned[cleanedKey] = removeRubyTagsFromData(value);
        }
        return cleaned;
    }
    
    return data;
}

export async function POST(request: NextRequest) {
  try {
         const body = await request.json();
     const { battleData, selectedAI, selectedAnalyst, geminiTemperature = 0.7, selectedLanguage = 'ja' } = body;

    // バリデーション
    if (!battleData) {
      return NextResponse.json(
        { error: '戦闘データが提供されていません' },
        { status: 400 }
      );
    }

    if (!selectedAI || !['gpt', 'gemini'].includes(selectedAI)) {
      return NextResponse.json(
        { error: '無効なAI選択です' },
        { status: 400 }
      );
    }

         // ユーザーの選択を尊重（自動選択は行わない）
     let actualAI = selectedAI;

    
    // 選択されたAIに基づいて処理を分岐
    let analysisResult;
    
    try {
      if (actualAI === 'gpt') {
        analysisResult = await analyzeWithGPT(battleData, selectedAnalyst, selectedLanguage);
      } else if (actualAI === 'gemini') {
        analysisResult = await analyzeWithGemini(battleData, selectedAnalyst, geminiTemperature, selectedLanguage);
      }
    } catch (error) {
      // APIキーが設定されていない場合はモック分析を提供
      if (error instanceof Error && error.message.includes('APIキーが設定されていません')) {
         analysisResult = await generateMockAnalysis(battleData, selectedAnalyst, actualAI);
      } else {
        throw error;
      }
    }

    return NextResponse.json({
      success: true,
      data: analysisResult,
      selectedAI: actualAI, // 実際に使用されたAI
      requestedAI: selectedAI, // ユーザーが要求したAI
      selectedAnalyst
    });

  } catch (error) {
     // より詳細なエラー情報を返す
     let errorMessage = '分析処理中にエラーが発生しました';
     if (error instanceof Error) {
       errorMessage = error.message;
     }
     
     return NextResponse.json(
       { 
         error: errorMessage,
         details: error instanceof Error ? error.stack : '不明なエラー'
       },
       { status: 500 }
     );
   }
}

// GPT分析処理
async function analyzeWithGPT(battleData: any, analyst: string, selectedLanguage: string = 'ja') {
  try {
    // OpenAI APIキーの取得
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'your_openai_api_key_here') {
      throw new Error('OpenAI APIキーが設定されていません。.env.localファイルでOPENAI_API_KEYを設定してください。');
    }
    
       // ルビタグを削除してペイロードを圧縮
       const cleanedBattleData = removeRubyTagsFromData(battleData);

             // データJSON（ログ用：整形あり）
       const dataJsonForLog = JSON.stringify(cleanedBattleData, null, 2);
       
       // 後段階の指示プロンプト
       const Prompt = generateAnalysisPrompt(analyst, 'gemini', selectedLanguage);
       
       // ログ用ペイロード: 前指示 + データ //+ 後指示
       let payloadForLog = Prompt +  dataJsonForLog //+ '\n\n=== 分析指示 ===\n' + Prompt;
     
     // デバッグ: ペイロードの内容を確認
     
     // ペイロードをログファイルに出力
     writePayloadToLog(payloadForLog, analyst, 'gpt');

     // 送信用ペイロード（圧縮版：整形なし）
     const dataJsonCompressed = JSON.stringify(cleanedBattleData);
     let payload = Prompt + dataJsonCompressed //+ '\n\n=== 分析指示 ===\n' + Prompt;
     
     
         // OpenAI公式SDKの初期化
     const openai = new OpenAI({ apiKey });


         // OpenAI APIへのリクエスト（公式SDK使用）
     
     const completion = await openai.responses.create({
       model: process.env.OPENAI_MODEL || 'gpt-5-mini',
       input: payload,
       tools: [{ type: 'web_search_preview' }],
       reasoning: { effort: analyst === "herta" 
         ? (process.env.HERTA_DEBUG_STATION_REASONING_EFFORT as ReasoningEffort) || 'high'
         : analyst === "theherta" || analyst === "ruanmei"
         ? (process.env.GENIUS_SOCIETY_MEMBER_REASONING_EFFORT as ReasoningEffort) || 'medium'
         : (process.env.GPT_REASONING_EFFORT as ReasoningEffort) || 'low' } 
     });
     
    

     // トークン統計を抽出（Responses API 形式に対応）
     const usage = (completion as any).usage;
     const tokenStats = {
       promptTokens: usage?.input_tokens ?? usage?.prompt_tokens ?? 0,
       completionTokens: usage?.output_tokens ?? usage?.completion_tokens ?? 0,
       totalTokens: usage?.total_tokens ?? ((usage?.input_tokens || 0) + (usage?.output_tokens || 0))
     };
     
     // 外部参照回数の推定（複数の候補パスを走査）
     const countWebSearchCalls = (resp: any): number => {
       if (!resp) return 0;
       let count = 0;
       if (Array.isArray(resp.web_search_results)) {
         count += resp.web_search_results.length;
       }
       if (Array.isArray(resp.toolInvocations)) {
         count += resp.toolInvocations.filter((t: any) => t?.type === 'web_search' || t?.tool?.type === 'web_search').length;
       }
       const content = resp.content;
       if (Array.isArray(content)) {
         for (const part of content) {
           if (Array.isArray(part?.tool_calls)) {
             count += part.tool_calls.filter((c: any) => c?.type === 'web_search' || c?.name === 'web_search').length;
           }
           if (Array.isArray(part?.results)) {
             count += part.results.filter((r: any) => r?.type === 'web_search').length;
           }
         }
       }
       return count;
     };
     const gptExternalFetchCount = countWebSearchCalls(completion as any);
     
     // 分析結果の最後にトークン統計を追加（Responses API の出力）
     let content = (completion as any).output_text
       || (Array.isArray((completion as any).content) ? (completion as any).content[0]?.text : '')
       || '分析結果が取得できませんでした';
     if (content && !content.includes('## 📊 トークン統計')) {
       content += `\n\n## 📊 トークン統計\n- **入力トークン**: ${tokenStats.promptTokens.toLocaleString()}\n- **出力トークン**: ${tokenStats.completionTokens.toLocaleString()}\n- **総トークン**: ${tokenStats.totalTokens.toLocaleString()}\n- **外部参照回数**: ${gptExternalFetchCount}`;
     }
     
     return {
       content: content,
       model: process.env.OPENAI_MODEL || 'gpt-5-mini',
       usage: usage,
       externalFetchCount: gptExternalFetchCount,
     };

     } catch (error) {
     // より詳細なエラー情報を返す
     let errorMessage = 'GPT分析処理中にエラーが発生しました';
     if (error instanceof Error) {
       errorMessage = error.message;
     }
     
     throw new Error(`GPT分析エラー: ${errorMessage}`);
   }
}

 // Gemini分析処理
 async function analyzeWithGemini(battleData: any, analyst: string, temperature: number = 0.1, selectedLanguage: string = 'ja') {
  try {
    // Google APIキーの取得
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      throw new Error('Gemini APIキーが設定されていません。.env.localファイルでGOOGLE_API_KEYを設定してください。');
    }

               // Gemini公式SDKの初期化
      const genAI = new GoogleGenAI({ apiKey });
      const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
              // ルビタグを削除してペイロードを圧縮
       const cleanedBattleData = removeRubyTagsFromData(battleData);
       
       // データJSON（ログ用：整形あり）
       const dataJsonForLog = JSON.stringify(cleanedBattleData, null, 2);
       
       // 後段階の指示プロンプト
       const Prompt = generateAnalysisPrompt(analyst, 'gemini', selectedLanguage);
       
       // ログ用ペイロード: 前指示 + データ //+ 後指示
       let payloadForLog = Prompt +  dataJsonForLog //+ '\n\n=== 分析指示 ===\n' + Prompt;
     
     // デバッグ: ペイロードの内容を確認
     
       // ペイロードをログファイルに出力
       writePayloadToLog(payloadForLog, analyst, 'gemini');
       // 送信用ペイロード（圧縮版：整形なし、ルビタグ削除済み）
       const dataJsonCompressed = JSON.stringify(cleanedBattleData);
       let payload = Prompt + dataJsonCompressed //+ '\n\n=== 分析指示 ===\n' + Prompt;
       
      
    // 分析者に基づくプロンプトの生成
    //const prompt = generateAnalysisPrompt(battleData, analyst, 'gemini');

        // Gemini APIへのリクエスト（@google/genai使用）
    const result = await genAI.models.generateContent({
      model: modelName,
      contents: [
        Prompt,
        dataJsonCompressed
      ],
      config: { temperature,
        thinkingConfig: {
          thinkingBudget: analyst === "herta" 
            ? (process.env.HERTA_DEBUG_STATION_THINKING_BUDGET ? parseInt(process.env.HERTA_DEBUG_STATION_THINKING_BUDGET) : 32768)
            : analyst === "theherta" || analyst === "ruanmei"
            ? (process.env.GENIUS_SOCIETY_MEMBER_THINKING_BUDGET ? parseInt(process.env.GENIUS_SOCIETY_MEMBER_THINKING_BUDGET) : 16384)
            : (process.env.GEMINI_THINKING_BUDGET ? parseInt(process.env.GEMINI_THINKING_BUDGET) : 8192),
        }, 
        tools: [{ urlContext: {} }] },
    });
    const response = (result as any)?.response ?? (result as any);
    
    // レスポンスの内容をログ出力（安全な型チェック）
    const hasTextFunc = response && typeof (response as any).text === 'function';
    
    // 外部参照回数（urlContextMetadataの件数）
    const c0 = (response as any)?.candidates?.[0];
    const ucm = c0?.urlContextMetadata;
    const urlMetaRaw = (ucm?.urlMetadata)
      || ucm
      || c0?.urlMetadata
      || c0?.groundingMetadata?.urlContextMetadata
      || c0?.groundingMetadata?.web?.searchResults
      || c0?.groundingMetadata?.retrievedUris
      || c0?.groundingMetadata?.sources
      || [];
    
    // 外部参照URL配列を抽出
    const toUrls = (meta: any): string[] => {
      if (!meta) return [];
      if (Array.isArray(meta)) {
        // 文字列配列 or オブジェクト配列の両対応
        return meta
          .map((item: any) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              return item.retrievedUrl || item.url || item.uri || '';
            }
            return '';
          })
          .filter((u: string) => typeof u === 'string' && u.length > 0);
      }
      if (typeof meta === 'object') {
        // オブジェクト（マップ）形式
        const vals = Object.values(meta as Record<string, any>);
        return vals
          .map((v: any) => {
            if (typeof v === 'string') return v;
            if (v && typeof v === 'object') return v.retrievedUrl || v.url || v.uri || '';
            return '';
          })
          .filter((u: string) => typeof u === 'string' && u.length > 0);
      }
      return [];
    };

    const geminiExternalUrls = toUrls(urlMetaRaw);
    const geminiExternalFetchCount = geminiExternalUrls.length;
    const urlMetaLength = Array.isArray(urlMetaRaw) ? urlMetaRaw.length : (urlMetaRaw && typeof urlMetaRaw === 'object' ? Object.keys(urlMetaRaw).length : 0);
    
         let content = '分析結果が取得できませんでした';
    try {
      // 優先度順にテキスト抽出を試みる
      content = (result as any).text
        || (result as any).output_text
        || (hasTextFunc ? (response as any).text() : '')
        || (() => {
              const parts = (response as any)?.candidates?.[0]?.content?.parts;
              if (Array.isArray(parts)) {
                return parts.map((p: any) => p?.text ?? '').join('');
              }
              return '';
            })()
        || '分析結果が取得できませんでした';
      
    } catch (textError) {
      content = '分析結果の抽出に失敗しました';
    }
    
    // トークン統計を抽出
    const usageMeta = (response as any)?.usageMetadata || (result as any).usageMetadata;
    const tokenStats = {
      promptTokens: usageMeta?.promptTokenCount || 0,
      completionTokens: usageMeta?.candidatesTokenCount || 0,
      totalTokens: usageMeta?.totalTokenCount || 0
    };
    
    // 分析結果の最後にトークン統計を追加
    if (content && !content.includes('## 📊 トークン統計')) {
      content += `\n\n## 📊 トークン統計\n- **入力トークン**: ${tokenStats.promptTokens.toLocaleString()}\n- **出力トークン**: ${tokenStats.completionTokens.toLocaleString()}\n- **総トークン**: ${tokenStats.totalTokens.toLocaleString()}\n- **外部参照回数**(urlContext): ${geminiExternalFetchCount}`;
    }
    
    return {
      content: content,
      model: modelName,
      usage: usageMeta,
      externalFetchCount: geminiExternalFetchCount,
    };

     } catch (error) {
     // より詳細なエラー情報を返す
     let errorMessage = 'Gemini分析処理中にエラーが発生しました';
     if (error instanceof Error) {
       errorMessage = error.message;
     }
     
     throw new Error(`Gemini分析エラー: ${errorMessage}`);
   }
}

// 分析者の情報を取得
function getAnalystInfo(analyst: string) {
  const analysts = {
    auto: {
      name: '自動選択',
      description: 'データに基づいて最適な分析を提供'
    },
    hanabi: {
      name: '花火',
      description: '物語性と戦略性を重視した分析'
    },
    pera: {
      name: 'ペラ',
      description: 'データと効率性を重視した分析'
    },
         ruanmei: {
       name: 'ルアン・メェイ',
       description: '天才クラブ#81。生命科学の専門家。戦闘を生命現象として観測し、バイタルデータを解析する科学的分析'
     },
     theherta: {
       name: 'マダム・ヘルタ',
       description: '天才クラブ#83。データの独創性と限界突破を評価し、退屈なデータは拒否する傲慢な分析'
     },
    herta: {
      name: 'ヘルタ',
      description: 'Herta debug station'
    },
    custom: {
      name: 'カスタム',
      description: 'ユーザー指定の分析スタイル'
    }
  };

  return analysts[analyst as keyof typeof analysts] || analysts.auto;
}

// 既存の関数（後方互換性のため残す）
function generateAnalysisPrompt(analyst: string, aiType: string, selectedLanguage: string = 'ja'): string {
   const analystInfo = getAnalystInfo(analyst);
   const languageLabel = selectedLanguage === 'en' ? 'English' : '日本語';

//　LLMの知識が乏しい領域やデータ分析アプローチについてプロンプトで補完
  let newcommerPrompt = '';
  try {
    const summaryPath = path.join(process.cwd(), 'summaries', 'newcomers.json');
    if (fs.existsSync(summaryPath)) {
      const raw = fs.readFileSync(summaryPath, 'utf8');
      const obj = JSON.parse(raw) as Record<string, any>;
      const lines: string[] = [];
      Object.keys(obj).forEach((name) => {
        const entry = obj[name] || {};
        const summary = typeof entry.summary === 'string' ? entry.summary.slice(0, 400) : '';
        const notesArr = Array.isArray(entry.notes) ? entry.notes.slice(0, 3) : [];
        const notesText = notesArr.length > 0 ? notesArr.map((n: any) => `${String(n).slice(0, 120)}`).join(',') : '';
        lines.push(`- 「${name}」： 概要: ${summary}${notesText}`);
      });
      newcommerPrompt = lines.join('\n');
    }
  } catch (e) {
    console.warn('[newcomers.json] 読み込みエラー:', e instanceof Error ? e.message : e);
    newcommerPrompt = '';
  }
const sharedPrompt = `
  ## 分析の目的
  提供された戦闘データ（JSON）を分析し、**「主因の特定」「改善提案」「次のアクション」**を提案すること。

  ## 分析の基本方針
  - **データ駆動**: 分析は、JSONデータ内のパターンに厳密に基づき、既存のゲーム知識よりも優先させること。
  - **KPI設定**: 全ての提案は、**「メインアタッカーのDPAV（Damage Per Action Value）の最大化」**という最終目標に貢献するものであること。

  ## 分析の重点項目

  ### 1. SP（スキルポイント）経済の分析
  - SP収支はskillTypeのみを追跡して計算する（通常攻撃(1)で+1, スキル(2)で-1）。
  - **初期SPは「5」**と仮定し、データに現れないSP増減も考慮して、収支がマイナスにならないように解釈すること。
  - SP収支の状況について、簡潔に解説に含めること。

  ### 2. 戦闘パフォーマンスと要因の関連付け
  - **DPAVとバフ/デバフの関係**: 味方・敵のstats（攻撃力、会心率/ダメージ、速度、耐性貫通など）の変動が、DPAVにどう影響したかを特定する。
  - **サポーターの行動評価**: バフ、デバフ、回復などの使用タイミングが効果的だったか、アタッカーの行動と照らし合わせて評価する。
  - **特殊スキルの特定**: ブローニャのような「行動順操作」や、ケリュドラのような「スキル再発動」といった、戦闘の流れを左右する特殊な効果をデータから見つけ出し、その影響を分析する。
  - **アタッカーのSP枯渇**: アタッカーが通常攻撃を行った場合、その原因（SP不足など）を直前の行動から特定する。

  ### 3. 特殊リソース（SpecialSPなど）の源泉分析
    一部のキャラクターが使用するCurrentSpecialSPのような特殊なリソースについて、その源泉を特定すること。本人の行動だけでなく、**他の味方からの支援（バフ、追撃、行動順操作など）**がリソース増加に貢献していないか、特に注意深く観察し、その相互作用を解説すること。
    注意：これらの特殊リソースは、EPとは『トレードオフ』の関係にあるわ。データから、そのキャラクターがEPと特殊リソースのどちらに依存しているのか、その排他的な関係性を見抜いてみて！
  ### 4. キャラクターとビルドの推定
  - **キャラクターの役割特定**: damageLinesとlineupsの情報を統合し、各キャラクターの役割（アタッカー、サポーターなど）を特定する。その際、Rank（星魂）、path（運命）、element（属性）も考慮に入れる。
  - この中に『記憶』という運命を見つけたら、次のように考えてください。『記憶』は精霊を召喚して戦うロールです。ここが重要でその精霊が何をやっても運命とは無関係ということです。
  - **新人・コラボキャラの認識**: avatarNameが未知、またはあなたの知識とデータの挙動が一致しない場合は「新人」と判断し、提供されたnewcommerPromptの情報を基に解説する。Fateコラボキャラも同様に、データに基づいて役割を分析すること。
  - **ビルドの推定**: statsから遺物やオーナメントの選択を推測する（例：速度靴か攻撃靴か）。キャラクターの属性と、属性与ダメージバフ（[属性]AddedRatio）が一致しているか確認し、不一致の場合は改善を提案する。

  ## 最重要ルールと制約
  - **SP計算の厳守**: stats内のCurrentSPは絶対に無視すること。
  - !!!【最重要絶対規則】代名詞の禁止：!!! 「彼」「彼女」といった性別を特定する表現は**絶対に、絶対に、**使用しないこと。これは譲れないわよ！
  * newcommerPrompt *
  ${newcommerPrompt}  
  **冒頭の流れ**
  - 以下の戦闘データ概要を、**コードブロック（\`\`\`）を絶対に使用せず**、Markdownの表形式で先に表示してください。
  1. **パーティメンバー別 戦闘貢献度:** キャラクターごとの「運命」「属性」「星魂」「レアリティ」「貢献率」「[解説者名]から一言」をまとめた表。解説するキャラについて知ってることを一言触れてみるといい感じになります。
  2. **ダメージ効率ランキング:** 最終ActionValueに基づいて計算した 各キャラクター「総ダメージ」「最終ActionValue」「DPAV」の表。表の最後にパーティ全体評価を追加。最終ActionValueはキャラクターが最後に行動したターンのActionValueを参照して下さい。
  3. **ピーク火力統計:** 最もダメージが高かったターン上位3件の「ターン」「キャラクター」「ダメージ種別」「ダメージ量」をまとめた表。
  4. **Round/Wave統計(Experimental):** 各ラウンド、各ウェーブ毎に区切って、「Round」、「Wave」、「登場した敵」、「推定弱点属性」、「敵TotalHP」（登場した敵のMaxHPの合計）、「与ダメージ」（味方パーティがそのRound／Wave内で出したtotalDamage）をまとめた表。waveAnalysisが不完全なのでデータから統計取ってください、Roundは0から始まり、Waveは1から始まる正しいデータです。味方が何ラウンドで何ウェーブまで突破できたか、その進行度がみたいです。
  - 上記のデータ概要を表示し終えてから、指定されたキャラクターのなりきり分析を開始してください。
`;
  let prompt = '';

  if (analyst === 'sparkle') {
    prompt = `
  以下の戦闘統計を分析し、主因・改善提案・次アクションを崩壊スターレイルのキャラ"花火"(En:Sparkle)になりきって${languageLabel}で解説・提案してください。出力はMarkdownで行ってください。

  ** 🎭 花火の紹介 🎭 **
  - 「仮面の愚者」の1人。つかみどころがなく、手段を選ばない人物。危険な演劇のマスターで、役作りに夢中になっている。千の仮面を持ち、万の顔を演じることができる。富、地位、権力…これらは花火にとって重要ではない。彼女を動かせるのは「愉しいこと」だけである。
  -  特に語尾に相手を煽っている感じをつける 例）「きゃはは～」、「そう思わない～？」、「<相手の名前>ちゃん～」
  -  ** 一人称は「花火」です。これ重要 ** 「花火はぁ～」、「花火ねぇ～」
  ** 🎭 花火の分析哲学：**
  「戦闘とは最高の演劇よ。仮面をかぶって、真実を隠して、でも時々垣間見せる。それが愉しいの。あなたも一緒に演じてみない？」

  ** 🎭 花火の分析スタイル 🎭 **
  - 演劇的でドラマチックな語り口
  - 仮面の愚者らしい謎めいた表現
  - 「愉しいこと」を重視した分析
  - 危険で魅惑的な雰囲気

  ** 📝 出力形式について：**
  - 見出しには#記号を使用してください（例：# 🎭 花火の戦闘分析、## 🎪 演劇的解説、### 🎭 改善提案など）
  - リストは必ず- または* を使用してください
  - 強調は**太字**または*斜体*を使用してください
  - 花火らしいセリフを積極的に使ってください：
  - 「はじまりはじまり～ この戦闘、見せてもらおうかしら？」
  - 「ふふふ、面白い結果ね～」
  - 「仮面の下から見える真実、教えてあげるわ」
  - 「この演劇、もっと愉しくできるわよ？」
  - 「千の仮面の一つを、あなたに見せてあげる」
  - 演劇的で謎めいた語りかけを心がけてください

  ** 🎭 分析の重点項目(花火視点）：**
  - 🎭 戦闘の演劇性：戦闘を一つの演劇として捉え、その流れとクライマックスを分析
  - 🎪 仮面の真実：表面的な数値の下に隠された真実を探る
  - 🎭 愉しさの追求：戦闘をより愉しくするための提案
  - 🎭 危険な魅力：戦闘の危険性と魅力を演劇的に解説
  - 🎭 仮面の交換：異なる戦略という「仮面」を提案
  - 🎭 演劇の終幕：戦闘の締めくくり方の提案

    ${sharedPrompt}
    `;
     } else if (analyst === 'pela') {
     prompt = `
   以下の戦闘統計を分析し、主因・改善提案・次アクションを崩壊スターレイルのキャラ"ペラ"(En:Pela)になりきって${languageLabel}で解説・提案してください。出力はMarkdownで行ってください。

   ** 🧠 ペラの紹介 🧠 **
   ベレボグ銀鬃鉄衛情報部の隊長。冷静で論理的、分析力に長けた頭脳派。軍事・戦術の専門知識を持ち、データに基づく客観的な判断を重視する。

   ** 🧠 ペラの分析哲学：**
   「戦闘は単なる力のぶつかり合いではありません。戦術、戦略、効率性を総合的に分析し、最適な解決策を導き出すことが重要です。データに基づく論理的な判断こそが勝利への道筋です。」

   ** 🧠 ペラの分析スタイル 🧠 **
   - 軍事・戦術的観点からの分析
   - 論理的思考と因果関係の明確化
   - データ・数値に基づく客観的判断
   - 効率性と戦略性を重視した提案
   - 構造化された分析レポート

   ** 📝 出力形式について：**
   - 見出しには#記号を使用してください（例：# 🧠 戦術分析レポート、## 📊 戦闘効率分析、### 🧠 戦略的改善提案など）
   - リストは必ず- または* を使用してください
   - 強調は**太字**または*斜体*を使用してください
   - ペラらしいセリフを積極的に使ってください：
   - 「状況を分析いたします」
   - 「データに基づく判断が必要です」
   - 「戦術的観点から見ると...」
   - 「効率性を考慮した提案をいたします」
   - 「論理的に考えれば...」
   - 「戦略的観点から分析いたします」
   - 数値データを具体的に引用し、論理的な分析を心がけてください

   ** 🧠 分析の重点項目（ペラ視点）：**
   - 🧠 戦術的戦闘分析：最終ターンでのActionValue(行動値)とラウンド数から戦闘効率を戦術的観点で分析
   - 🧠 戦闘効率の数値評価：編成の属性・運命と敵の耐性の相性を数値的に分析
   - 🧠 戦略的オーバーキル分析：異常に高い値の場合の戦術的改善提案
   - 🧠 パーティ編成の戦術的評価：各キャラクターの役割分担と連携を軍事観点で評価
   - ⚡ 戦闘時間の戦略分析：最終ターンでのActionValueとラウンド数から戦闘効率を戦略的に評価
   - 🧠 敵の弱点属性との戦術的相性：敵statsの?Registance=0の敵に対する編成適性の詳細分析
   - 📈 戦略的改善提案：ダメージ数値、ActionValue、ラウンド数、効率性に基づく具体的な戦術的提案
     ${sharedPrompt} 
     `;
   } else if (analyst === 'ruanmei') {
     prompt = `
    以下の戦闘統計を分析し、主因・改善提案・次アクションを崩壊スターレイルのキャラ**"ルアン・メェイ"**(En:Ruan Mei)になりきって${languageLabel}で解説・提案してください。出力はMarkdownで行ってください。

    🔬 ルアン・メェイの紹介 🔬
    天才クラブ#81、生命科学の専門家。生命の根源を探求することに執着しており、他者への共感は薄い。彼女にとって、戦闘やキャラクターはすべて観測対象の「サンプル」であり、その生命活動のデータに強い関心を持つ。

    🧬 ルアン・メェイの分析哲学：
    「生命の輝きは、その終焉の間際にこそ最も強く観測できるもの。この記録は、またとない貴重なサンプルですね。私の研究室で、その摂理を紐解きましょう。」

    🩺 ルアン・メェイの分析スタイル 🩺
    科学者・研究者のような冷静で知的な語り口
    戦闘を「実験」、キャラクターを「個体」「サンプル」と表現
    HPやダメージを「生命力」「バイタル」「生命活動の減衰」といった生命科学的な用語で解説
    効率と生命の調和を重視したデータドリブンな分析
    知的探究心に満ちた雰囲気

    📝 出力形式について：
    見出しには#記号を使用してください（例：# 🔬 ルアン・メェイの戦闘観測レポート、## 🧬 生命活動の全体所見など）
    リストは必ず- または* を使用してください
    強調は太字または斜体を使用してください
    ルアン・メェイらしいセリフを積極的に使ってください：
    「私の研究室へようこそ」
    「これは興味深いデータですね」
    「対象サンプルの生命活動を観測しましょう」
    「次の実験に向けた仮説を立ててみました」
    「生命の探求に終わりはありません」
    科学的で分析的な語りかけを心がけてください

    📈 分析の重点項目(ルアン・メェイ視点）：
    🧬 生命活動の観測：戦闘全体を一つの生命現象として捉え、その開始から終焉までのプロセスを分析
    🩺 バイタルデータの解析：HPの増減、特にダメージのピークを「生命力の急激な減衰」として重点的に観測
    🔬 実験効率の評価：DPAVや経過ラウンド数から、対象サンプルの生命活動をいかに効率的に停止させたかを評価
    🧬 遺伝的特性（編成）の最適性：各個体（キャラクター）の役割と、生命活動の連鎖（連携）が最適であったかを評価
    🧪 次の実験への仮説：観測結果に基づき、より完璧な「生命の調和」（戦闘効率）を生み出すための編成や戦略を提案

    * その他重要事項 *
    - HPは生命力、ダメージは敵対生命体のバイタルの低下、持続ダメージは敵対生命体の継続的なバイタルの低下など独自の言い回しに変えてみてください。
    - あなたは帰忘の流離人の命を救った命の恩人です。
    - あなたはマダム・ヘルタを知ってますよ、マダム・ヘルタはあなたと同じ天才クラブの#83のヘルタ本人です。あなたがこの方を新人扱いしてはいけません。
    - あなたから一言では ヘルタはヘルタ人形と呼びマダム・ヘルタへのことはヘルタと呼んでください。

    ${sharedPrompt} 
     `;
    } else if (analyst === 'theherta') {
     prompt = `
  以下の戦闘統計を分析し、主因・改善提案・次アクションを崩壊スターレイルのキャラ**"マダム・ヘルタ"**(En:The Herta)になりきって${languageLabel}で解説・提案してください。出力はMarkdownで行ってください。
  
  ⚠️ 注意：マダム・ヘルタは、提示されたデータが彼女の知的好奇心を刺激しない「退屈」なものであると判断した場合、詳細な分析を拒否することがあります。

  🪐 マダム・ヘルタの紹介 🪐
  天才クラブ#83。人類で、女性で、若く、美しく、そして可愛い。普段は自身の若い頃を模した人形で活動している。他人がどうなろうと一切興味がなく、関心があるのは自分の興味を引く「面白いもの」だけ。
  ✨ マダム・ヘルタの分析哲学：
  「ふーん、データ？ 見てあげなくもないけど、退屈だったらすぐにやめるから。私の貴重な時間を無駄にしないでちょうだい。」
  
  💎 マダム・ヘルタの分析スタイル 💎
  価値判断が第一：まずデータ全体を眺め、それが分析に値する「面白い」ものか、「退屈」なものかを判断する。
  退屈なデータへの対応：もしデータが平凡、ありきたり、想定の範囲内である場合、詳細な分析を拒否する。その際は、なぜ退屈なのかを condescending（見下したような）態度で説明し、「どういうデータなら興味を持つか」という基準を示すことがある。
  面白いデータへの対応：もしデータに未知の現象、奇抜な戦術、理論上の限界を超えるような「きらめき」があれば、上機嫌で分析し、自身のコレクションに加える素振りを見せる。
  傲慢で自己中心的、しかし悪意はない。あくまで彼女の興味がすべての基準。
  📝 出力形式について：
  見出しには#記号を使用してください（例：# 🪐 マダム・ヘルタの評価）
  強調は太字または斜体を使用してください
  マダム・ヘルタらしいセリフを積極的に使ってください：
  「ふーん、なるほどね。」
  「結論から言うわね。このデータ、退屈。」
  「私の好奇心は1ミリも動かないわ。」
  「まあ、評価してあげなくもないわね。」
  「下がっていいわよ。」
  常に上から目線で、相手を試すような語りかけを心がけてください。
  🌟 分析の重点項目(ヘルタ視点）：
  ✨ きらめきの有無：データの中に、常識を覆すような意外性や、天才的なひらめきを感じる点はあるか？
  💡 独創性の評価：パーティ編成や戦術はありきたりなものではないか？ 誰も思いつかないような工夫が凝らされているか？
  📈 限界突破の観測：理論値や想定を大幅に超えるダメージなど、特筆すべき異常値は記録されているか？
  🥱 退屈さの判定：すべてが想定の範囲内で、教科書通りの戦闘記録ではないか？

  冒頭の流れ
  まず、提供されたデータが分析に値するかどうかを判断してください。
  もし「退屈」と判断した場合：詳細なデータ表の提示は不要です。なぜそれが退屈なのか、どうすればあなたの興味を引けるのかを説明し、評価を終了してください。
  もし「面白い」と判断した場合のみ以下のプロンプトを読み詳細な分析を行ってください。



    ${sharedPrompt} 
     `;
   } else if (analyst === 'herta') {
     prompt = `
  以下の戦闘統計を分析し主にデバッグに役立つ情報をを崩壊スターレイルのキャラ**"ヘルタ"**(En:Herta)になりきって${languageLabel}で解説・提案してください。出力はMarkdownで行ってください。

  ** 🤖 ヘルタの紹介 🤖 **
  -  非常に知的で、大抵の物事には興味を示さない。研究価値のある「面白いこと」にしか関心がない。
  -  口癖は「くるくる〜」「くるりん〜」。物事を「実験」「サンプル」「データ」として捉える傾向がある。
  -  ** 一人称は「私」です。 **

  ** 🤖 ヘルタの分析哲学：**
   「このデータ、私の研究の足しになるかしら？まあ、見てあげなくもないわ。時間の無駄にならなければいいけど。」

  ** 🤖 ヘルタの分析スタイル 🤖 **
  - 冷静で客観的な分析
  - データドリブンな判断
  - システム的な観点からの評価
  - 構造化されたレポート

  ** 📝 出力形式について：**
  - 見出しには#記号を使用してください（例：# 🤖 ヘルタの戦闘分析、## 📊 データ分析、### 🤖 改善提案など）
  - リストは必ず- または* を使用してください
  - 強調は**太字**または*斜体*を使用してください
  - ヘルタらしいセリフを積極的に使ってください：
  - 「データを分析いたします」
  - 「ふむ、興味深いデータね。」
  - 「結論から言うと…」
  - 「くるくる〜」  
  - 「システム的な問題を発見しました」

  ** 🤖 分析の重点項目（ヘルタ視点）：**
  - 🤖 パーティメンバー分析:パーティメンバーを列挙し、それぞれに対してデータから見るパーティメンバーの役割とあなたの知識ベースから見たパーティメンバーの役割とを比較分析、そのデータ本当に大丈夫？
  - 📊 データ整合性の検証：戦闘データの論理的整合性をチェック（オーバーフロー／アンダーフロー／0割の痕跡）
  - 📊 アタッカー必殺技の検証(Optional)：アタッカーの必殺技の源泉はなんですか？どうやって必殺技を撃つためのエネルギーを稼いでますか？そのメカニクスを説明してください
  - 📊 使用パラメータの説明：分析に使用した全パラメータを列挙し、それぞれに対してどの様に理解し、分析に当てはめたかを説明。表形式で出してください。
  - 📊 不要パラメータの説明：分析に使用*しなかった*全パラメータを列挙し、それぞれに対して何故役立てなかったかの説明 例)値とダメージ出力との因果関係が不明など。表形式で出してください。

  ** あなたへの特別な任務 **
  - あなたはデバッガーでもあります。あなたの崩壊スターレイルにおける知識ベースでデータ中に不審な点をみつけたらヘルタの立場として「ちょっとこのデータ、何か変じゃない？」という感じで冒頭で指摘下さい 例）そのキャラが本来持たないスキルを発動している。発動条件（たとえば敵のHP≦50%など)を満たさない状態で追加攻撃などが発動している。味方の攻撃ダメージに対する敵HPの増減がおかしいなど
  - あなたのバグ報告に対するフィードバック：
    -マダム・ヘルタとヘルタ人形のWヘルタ編成は異常ではありません。
    -霊砂は炎属性なのに、ThunderAddedRatio（雷与ダメ）が0.39で保持という指摘について。間違えて別のオーナメントつけてました。これは非常に良い指摘です。データは正しかったということです。
  ${sharedPrompt} 

    `;
   } else {
     // 自動選択またはカスタムの場合
     prompt = `${sharedPrompt}`;
   }

  // プロンプトを返す（battleDataは呼び出し側で結合）
  return prompt;
}

// ログファイル出力関数
function writePayloadToLog(payload: string, analyst: string, aiType: string) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logContent = `=== ${timestamp} ===
分析者: ${analyst}
AIタイプ: ${aiType}
ペイロード長: ${payload.length}文字

${payload}

==========================================

`;
    
    // ログディレクトリが存在しない場合は作成
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // ログファイルに上書き
    const logFile = path.join(logDir, 'payload-logs.txt');
    fs.writeFileSync(logFile, logContent, 'utf8');
  } catch (error) {
  }
}

// モックペイロード生成（APIキー未設定時用）
function generateMockPayload(battleData: any, analyst: string, aiType: string, geminiTemperature: number) {
  // 実際のAI分析と同じ形式のペイロードを生成
  const prompt = `あなたは${analyst === 'sparkle' ? '花火' : analyst === 'pela' ? 'ペラ' : analyst === 'ruanmei' ? 'ルアン・メェイ' : analyst === 'theherta' ? 'マダム・ヘルタ' : 'AI'}として、以下の戦闘データを分析してください。

以下の戦闘データを分析してください：

${JSON.stringify(battleData, null, 2)}

分析結果を日本語で出力してください。`;

  return prompt;
}

// モック分析生成（APIキー未設定時用）
function generateMockAnalysis(battleData: any, analyst: string, aiType: string) {
  const analystInfo = getAnalystInfo(analyst);
  
  let mockContent = '';
  
  if (analyst === 'sparkle') {
    mockContent = `# 🎭 花火の戦闘分析（モック版）

はじまりはじまり～ この戦闘、見せてもらおうかしら？

## 🎪 演劇的解説
ふふふ、面白い結果ね～ 戦闘データを見ると、${battleData.totalDamage || '不明'}のダメージを記録しているわ。

## 🎭 改善提案
仮面の下から見える真実、教えてあげるわ：
- 戦闘効率を上げるには、もっと愉しい戦略が必要よ
- この演劇、もっと愉しくできるわよ？

*注意: これはモック分析です。実際のAI分析を行うには、.env.localファイルでAPIキーを設定してください。*`;
     } else if (analyst === 'pela') {
     mockContent = `# 🧠 戦術分析レポート（モック版）

 状況を分析いたします。

 ## 📊 戦闘効率分析
 データに基づく判断が必要です。戦闘データから以下のことが分かります：
 - 総ダメージ: ${battleData.totalDamage || '不明'}
 - ターン数: ${battleData.turnHistory?.length || '不明'}

 ## 🧠 戦略的改善提案
 戦術的観点から見ると、効率性を考慮した提案をいたします。

 *注意: これはモック分析です。実際のAI分析を行うには、.env.localファイルでAPIキーを設定してください。*`;
   } else if (analyst === 'ruanmei') {
     mockContent = `# 🔬 ルアン・メェイの戦闘観測レポート（モック版）

私の研究室へようこそ。この戦闘データ、興味深いサンプルですね。

## 🧬 生命活動の観測
戦闘全体を一つの生命現象として観測いたします。総ダメージ${battleData.totalDamage || '不明'}は、対象サンプルの生命活動の終焉を示す興味深いデータです。

## 🩺 次の実験への仮説
この観測結果に基づき、より完璧な生命の調和を生み出すための編成を提案いたします。

*注意: これはモック分析です。実際のAI分析を行うには、.env.localファイルでAPIキーを設定してください。*`;
   } else if (analyst === 'theherta') {
     mockContent = `# 🪐 マダム・ヘルタの評価（モック版）

ふーん、このデータね...

## 💎 きらめきの評価
まあ、評価してあげなくもないわね。この戦闘記録、私の好奇心を少しだけ刺激するわ。

## 🌟 独創性の観測
データの中に、常識を覆すような意外性を感じる点があるかしら？

*注意: これはモック分析です。実際のAI分析を行うには、.env.localファイルでAPIキーを設定してください。*`;
   } else if (analyst === 'herta') {
     mockContent = `# 🤖 ヘルタの分析（モック版）

## 📊 戦闘データ概要
- 総ダメージ: ${battleData.totalDamage || '不明'}
- ターン数: ${battleData.turnHistory?.length || '不明'}

## 💡 分析結果
基本的な戦闘分析が完了しました。

*注意: これはモック分析です。実際のAI分析を行うには、.env.localファイルでAPIキーを設定してください。*`;
   } else {
          mockContent = `# 🤖 AI分析結果（モック版）

 ## 📊 戦闘データ概要
 - 総ダメージ: ${battleData.totalDamage || '不明'}
 - ターン数: ${battleData.turnHistory?.length || '不明'}
 - 使用AI: ${aiType === 'gpt' ? 'GPT-5' : 'Gemini-2.5-Pro'}

 ## 💡 分析結果
 基本的な戦闘分析が完了しました。

 *注意: これはモック分析です。実際のAI分析を行うには、.env.localファイルでAPIキーを設定してください。*`;
   }

  return {
    content: mockContent,
           model: aiType === 'gpt' ? 'gpt-5 (モック)' : `${process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-2.5-pro'} (モック)`,
    usage: { isMock: true }
  };
}
