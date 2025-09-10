import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { ReasoningEffort } from 'openai/resources.mjs';
import { generateAnalysisPrompt, getAnalystInfo } from './prompt';

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
     try {
       console.error('[POST /api/analyze] Error:', error instanceof Error ? error.message : error);
       if (error instanceof Error && error.stack) console.error(error.stack);
     } catch {}
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
     // 以下GPT-5系では制御不能
     /*
     let set_top_p = 0.95;
     if (analyst === 'sparkle') {  set_top_p   = process.env.SPARKLE_TOP_P ? parseFloat(process.env.SPARKLE_TOP_P) : 0.95; }
     if (analyst === 'pela') { set_top_p = process.env.PELA_TOP_P ? parseFloat(process.env.PELA_TOP_P) : 0.0; }
     if (analyst === 'theherta') { set_top_p = process.env.THEHERTA_TOP_P ? parseFloat(process.env.THEHERTA_TOP_P) : 0.0; }
     if (analyst === 'ruanmei') { set_top_p = process.env.RUANMEI_TOP_P ? parseFloat(process.env.RUANMEI_TOP_P) : 0.5; }
     if (analyst === 'herta') { set_top_p = process.env.HERTA_TOP_P ? parseFloat(process.env.HERTA_TOP_P) : 0.5; }
     console.log(analyst,'set_top_p:', set_top_p);
     */
         // OpenAI APIへのリクエスト（公式SDK使用）
     
     const completion = await openai.responses.create({
       model: process.env.OPENAI_MODEL || 'gpt-5',
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
       model: process.env.OPENAI_MODEL || 'gpt-5',
       usage: usage,
       externalFetchCount: gptExternalFetchCount,
     };

     } catch (error) {
     // より詳細なエラー情報を返す
     try {
       console.error('[analyzeWithGPT] Error:', error instanceof Error ? error.message : error);
       if (error instanceof Error && error.stack) console.error(error.stack);
     } catch {}
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
       
    let set_top_k = 40;
    let set_top_p = 0.95;
    if (analyst === 'sparkle') { set_top_k = process.env.SPARKLE_TOP_K ? parseInt(process.env.SPARKLE_TOP_K) : 40; set_top_p = process.env.SPARKLE_TOP_P ? parseFloat(process.env.SPARKLE_TOP_P) : 0.95; }
    if (analyst === 'pela') { set_top_k = process.env.PELA_TOP_K ? parseInt(process.env.PELA_TOP_K) : 1; set_top_p = process.env.PELA_TOP_P ? parseFloat(process.env.PELA_TOP_P) : 0.0; }
    if (analyst === 'theherta') { set_top_k = process.env.THEHERTA_TOP_K ? parseInt(process.env.THEHERTA_TOP_K) : 1; set_top_p = process.env.THEHERTA_TOP_P ? parseFloat(process.env.THEHERTA_TOP_P) : 0.0; }
    if (analyst === 'ruanmei') { set_top_k = process.env.RUANMEI_TOP_K ? parseInt(process.env.RUANMEI_TOP_K) : 20; set_top_p = process.env.RUANMEI_TOP_P ? parseFloat(process.env.RUANMEI_TOP_P) : 0.5; }
    if (analyst === 'herta') { set_top_k = process.env.HERTA_TOP_K ? parseInt(process.env.HERTA_TOP_K) : 20; set_top_p = process.env.HERTA_TOP_P ? parseFloat(process.env.HERTA_TOP_P) : 0.5; }
    console.log(analyst,'set_top_k:', set_top_k,'set_top_p:', set_top_p);
    // 分析者に基づくプロンプトの生成
    //const prompt = generateAnalysisPrompt(battleData, analyst, 'gemini');

        // Gemini APIへのリクエスト（@google/genai使用）
    const result = await genAI.models.generateContent({
      model: modelName,
      contents: [
        Prompt,
        dataJsonCompressed
      ],
      config: { temperature,topP: set_top_p,topK: set_top_k,
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
     try {
       console.error('[analyzeWithGemini] Error:', error instanceof Error ? error.message : error);
       if (error instanceof Error && error.stack) console.error(error.stack);
     } catch {}
     let errorMessage = 'Gemini分析処理中にエラーが発生しました';
     if (error instanceof Error) {
       errorMessage = error.message;
     }
     
     throw new Error(`Gemini分析エラー: ${errorMessage}`);
   }
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
