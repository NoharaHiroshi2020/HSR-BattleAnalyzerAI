import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Container,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Stack,
  Paper,
  useTheme,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Snackbar,
  CircularProgress,
  LinearProgress,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Chip,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Psychology as BrainIcon,
  Settings as SettingsIcon,
  Bolt as ZapIcon,
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
  CheckCircle as CheckIcon,
  RadioButtonUnchecked as UncheckedIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { onBattleEndService } from '@/features/analysis/services/battleAnalyzer';

interface MaterialMenuProps {
  initialContent?: string;
  isPreviewMode?: boolean;
}

export const MaterialMenu: React.FC<MaterialMenuProps> = ({ 
  initialContent = '', 
  isPreviewMode = false 
}) => {
  const theme = useTheme();
  
  // AIモデル名の設定
  const openaiModel = process.env.NEXT_PUBLIC_OPENAI_MODEL || 'GPT-5-mini';
  const geminiModel = process.env.NEXT_PUBLIC_GEMINI_MODEL || 'Gemini-2.5-Pro';

  // 解説者アイコンの設定（後でご指定のパスに差し替え可能）
  const sparkleIconSrc = process.env.NEXT_PUBLIC_SPARKLE_ICON || process.env.NEXT_PUBLIC_HANABI_ICON || 'https://cdn.wikiwiki.jp/to/w/star-rail/%E3%82%A2%E3%82%A4%E3%82%B3%E3%83%B3/::ref/%E8%8A%B1%E7%81%AB%E3%83%BB%E3%82%A4%E3%83%AA%E3%83%A5%E3%83%BC%E3%82%B8%E3%83%A7%E3%83%B3.webp?rev=8ecd4d95fc86eae50c7fd5f1c349b088&t=20240221230045';
  const pelaIconSrc = process.env.NEXT_PUBLIC_PELA_ICON || process.env.NEXT_PUBLIC_PERA_ICON || 'https://cdn.wikiwiki.jp/to/w/star-rail/%E3%82%A2%E3%82%A4%E3%82%B3%E3%83%B3/::ref/%E3%83%9A%E3%83%A9.webp?rev=514eab089fc40fecae50aed2982c6b08&t=20230510014429';
  const ruanmeiIconSrc = 'https://cdn.wikiwiki.jp/to/w/star-rail/%E3%82%A2%E3%82%A4%E3%82%B3%E3%83%B3/::ref/%E3%83%AB%E3%82%A2%E3%83%B3%E3%83%BB%E3%83%A1%E3%82%A7%E3%82%A4.webp?rev=59562f545d399df2aa9ace41505ebba4&t=20240221230451';
  const thehertaIconSrc = 'https://cdn.wikiwiki.jp/to/w/star-rail/%E3%82%A2%E3%82%A4%E3%82%B3%E3%83%B3/::ref/%E3%83%9E%E3%83%80%E3%83%A0%E3%83%BB%E3%83%98%E3%83%AB%E3%82%BF%E3%83%BB%E3%83%86%E3%82%A3%E3%83%BC%E3%82%BF%E3%82%A4%E3%83%A0.webp?rev=3a9d2d096359364e15d9aaa9e5a66e7a&t=20250120110222';
  const hertaIconSrc = 'https://cdn.wikiwiki.jp/to/w/star-rail/%E3%82%A2%E3%82%A4%E3%82%B3%E3%83%B3/::ref/%E3%83%98%E3%83%AB%E3%82%BF.webp?rev=1433cdddd3ad1d429fbfcff08f3138b3&t=20230510014324';
  
  // 状態管理
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileContent, setFileContent] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedAI, setSelectedAI] = useState<string>('');
  const [selectedAnalyst, setSelectedAnalyst] = useState<string>('auto');
  const [geminiTemperature, setGeminiTemperature] = useState<number>(0.1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string>(isPreviewMode ? initialContent : '');
  const [payloadData, setPayloadData] = useState<any>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info'
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 言語選択
  const [selectedLanguage, setSelectedLanguage] = useState<'ja' | 'en'>('ja');

  // ステップ管理
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // ステップの定義
  const steps = [
    {
      label: 'ファイルアップロード',
      description: '戦闘ログのJSONファイルをアップロードしてください',
      icon: <UploadIcon />,
      completed: !!uploadedFile,
    },
    {
      label: '解説者選択',
      description: '分析スタイルを選択してください',
      icon: <BrainIcon />,
      completed: uploadedFile && selectedAnalyst !== 'auto',
    },
    {
      label: 'AI選択',
      description: '使用するAIモデルを選択してください',
      icon: <SettingsIcon />,
      completed: uploadedFile && selectedAnalyst !== 'auto' && selectedAI !== '',
    },
    {
      label: 'AI分析実行',
      description: '選択した設定で分析を実行します',
      icon: <ZapIcon />,
      completed: uploadedFile && selectedAnalyst !== 'auto' && selectedAI !== '' && analysisResult,
    },
  ];

  // ステップ完了チェック
  const updateCompletedSteps = () => {
    const newCompleted = new Set<number>();
    if (uploadedFile) newCompleted.add(0);
    if (uploadedFile && selectedAnalyst !== 'auto') newCompleted.add(1);
    if (uploadedFile && selectedAnalyst !== 'auto' && selectedAI !== '') newCompleted.add(2);
    if (uploadedFile && selectedAnalyst !== 'auto' && selectedAI !== '' && analysisResult) newCompleted.add(3);
    setCompletedSteps(newCompleted);
  };

  // 状態変更時にステップ完了を自動更新
  useEffect(() => {
    updateCompletedSteps();
  }, [uploadedFile, selectedAnalyst, selectedAI, analysisResult]);

  // ステップ変更時の処理（過去へは常に戻れる／先へは順番のみ）
  const handleStepChange = (step: number) => {
    if (step <= activeStep) {
      setActiveStep(step);
      return;
    }
    // 先へ進むのは1つ先のみ、かつ現ステップの要件を満たしている場合
    const canAdvanceFrom = (curr: number) => {
      if (curr === 0) return !!uploadedFile;
      if (curr === 1) return selectedAnalyst !== 'auto';
      if (curr === 2) return selectedAI !== '';
      return true;
    };
    if (step === activeStep + 1 && canAdvanceFrom(activeStep)) {
      setActiveStep(step);
    } else if (completedSteps.has(step)) {
      // 既に完了済みの先のステップには移動可
      setActiveStep(step);
    }
  };

  // ファイル処理関数
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // ファイル拡張子チェック
    if (!file.name.endsWith('.json')) {
      setSnackbar({
        open: true,
        message: 'JSONファイルのみアップロード可能です',
        severity: 'error'
      });
      return;
    }

    setIsUploading(true);
    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);
      
      setUploadedFile(file);
      setFileName(file.name);
      setFileContent(jsonData);
      
      // ステップ1完了、次のステップへ
      setActiveStep(1);
      updateCompletedSteps();
      
      setSnackbar({
        open: true,
        message: `${file.name} のアップロードが完了しました`,
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'JSONファイルの解析に失敗しました',
        severity: 'error'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // 解説者選択時の処理
  const handleAnalystChange = (analyst: string) => {
    setSelectedAnalyst(analyst);
    // 自動でAIモデルを変更しない（ユーザーの選択を尊重）
    updateCompletedSteps();
  };

  // AI選択時の処理
  const handleAIChange = (ai: string) => {
    setSelectedAI(ai);
    updateCompletedSteps();
  };

  const handleSnackbarClose = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  // 分析結果をコピー
  const handleCopyResult = async () => {
    try {
      await navigator.clipboard.writeText(analysisResult);
      setSnackbar({
        open: true,
        message: '分析結果をクリップボードにコピーしました',
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'コピーに失敗しました',
        severity: 'error'
      });
    }
  };

  // 分析結果をダウンロード
  const handleDownloadResult = () => {
    const blob = new Blob([analysisResult], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `戦闘分析結果_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setSnackbar({
      open: true,
      message: '分析結果をダウンロードしました',
      severity: 'success'
    });
  };

  // 全ペイロードデータをダウンロード（開発時のみ）
  const handleDownloadAllPayloads = () => {
    if (!payloadData) {
      setSnackbar({
        open: true,
        message: 'ペイロードデータがありません',
        severity: 'error'
      });
      return;
    }

    const allPayloads = {
      timestamp: payloadData.timestamp,
      selectedAnalyst: payloadData.selectedAnalyst,
      gpt: payloadData.gpt,
      gemini: payloadData.gemini
    };

    const blob = new Blob([JSON.stringify(allPayloads, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `all-payloads-${payloadData.timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setSnackbar({
      open: true,
      message: '全ペイロードデータをダウンロードしました',
      severity: 'success'
    });
  };

  // 分析開始
  const handleAnalysisStart = async () => {
    if (!uploadedFile || !fileContent) {
      setSnackbar({
        open: true,
        message: '先にJSONファイルをアップロードしてください',
        severity: 'error'
      });
      return;
    }
    if (selectedAnalyst === 'auto') {
      setSnackbar({
        open: true,
        message: '先に解説者を選択してください',
        severity: 'error'
      });
      return;
    }
    if (selectedAI === '') {
      setSnackbar({
        open: true,
        message: '先にAIモデルを選択してください',
        severity: 'error'
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const battleEndData = {
          avatars: fileContent.lineup.map((item: any) => ({ 
              id: item.avatarId, 
              name: `Avatar_${item.avatarId}` 
          })),
          turn_history: [],
          av_history: [],
          turn_count: fileContent.turnHistory.length,
          total_damage: fileContent.totalDamage,
          action_value: fileContent.totalAV,
          stage_id: 1
      };
      
      const battleAnalysisData = await onBattleEndService({
          battleEnd: battleEndData,
          turnHistory: fileContent.turnHistory,
          skillHistory: fileContent.skillHistory,
          avatarDetail: fileContent.avatarDetail,
          enemyDetail: fileContent.enemyDetail,
          cycleInfo: {
              maxCycle: fileContent.maxCycle,
              maxWave: fileContent.maxWave,
              cycleIndex: fileContent.cycleIndex,
              waveIndex: fileContent.waveIndex,
              characterNameMap: fileContent.characterNameMap,
          },
          autoAnalyzeBattle: true,
          gptAnalysisLoading: false,
          geminiAnalysisLoading: false,
      });

      const payloadData = {
        timestamp: new Date().toISOString().replace(/[:.]/g, '-'),
        selectedAnalyst,
        battleData: battleAnalysisData,
      };
      setPayloadData(payloadData);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          battleData: battleAnalysisData,
          selectedAI,
          selectedAnalyst,
          geminiTemperature,
          selectedLanguage,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`分析リクエストが失敗しました: ${response.status}`);
      }

      const analysisResult = await response.json();
      
      const resultText = analysisResult.data?.content || '分析結果が受信できませんでした';
      setAnalysisResult(resultText);
      setActiveStep(3);
      updateCompletedSteps();
      setSnackbar({ open: true, message: 'AI分析が完了しました', severity: 'success' });

    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        setSnackbar({ open: true, message: '分析を中止しました', severity: 'info' });
      } else {
        
        setSnackbar({
          open: true,
          message: `ペイロード作成中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
          severity: 'error'
        });
      }
    } finally {
      setIsAnalyzing(false);
      abortControllerRef.current = null;
    }
  };

  // 再分析関数
  const handleReanalyze = async () => {
    if (!payloadData) {
      setSnackbar({
        open: true,
        message: 'ペイロードデータがありません',
        severity: 'error'
      });
      return;
    }
    if (selectedAnalyst === 'auto') {
      setSnackbar({
        open: true,
        message: '先に解説者を選択してください',
        severity: 'error'
      });
      return;
    }
    if (selectedAI === '') {
      setSnackbar({
        open: true,
        message: '先にAIモデルを選択してください',
        severity: 'error'
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          battleData: payloadData.battleData,
          selectedAI,
          selectedAnalyst,
          geminiTemperature,
          selectedLanguage,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`再分析リクエストが失敗しました: ${response.status}`);
      }

      const analysisResult = await response.json();
      
      const resultText = analysisResult.data?.content || '再分析結果が受信できませんでした';
      setAnalysisResult(resultText);
      setActiveStep(3);
      updateCompletedSteps();
      setSnackbar({ open: true, message: 'AI再分析が完了しました', severity: 'success' });

    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        setSnackbar({ open: true, message: '再分析を中止しました', severity: 'info' });
      } else {
        
        setSnackbar({
          open: true,
          message: `再分析中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
          severity: 'error'
        });
      }
    } finally {
      setIsAnalyzing(false);
      abortControllerRef.current = null;
    }
  };

  // プレビューモードの場合はMarkdownのみ
  if (isPreviewMode) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: theme.palette.grey[50], py: 4 }}>
        <Container maxWidth="lg">
          <Paper elevation={3} sx={{ p: 4, borderRadius: 3, bgcolor: 'white' }}>
            <Box
              sx={{
                '& h1, & h2, & h3, & h4, & h5, & h6': {
                  color: theme.palette.primary.main,
                  fontWeight: 'bold',
                  mb: 1,
                },
                '& p': {
                  mb: 1,
                  lineHeight: 1.6,
                },
                '& ul, & ol': {
                  mb: 1,
                  pl: 2,
                },
                '& li': {
                  mb: 0.5,
                },
                '& strong': {
                  fontWeight: 'bold',
                },
                '& em': {
                  fontStyle: 'italic',
                },
                '& table': {
                  borderCollapse: 'collapse',
                  width: '100%',
                  mb: 2,
                  fontSize: '0.9rem',
                  boxShadow: theme.shadows[1],
                },
                '& th, & td': {
                  border: `1px solid ${theme.palette.divider}`,
                  padding: '8px 12px',
                  textAlign: 'left',
                  verticalAlign: 'top',
                },
                '& th': {
                  bgcolor: theme.palette.primary.main,
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '0.95rem',
                },
                '& tr:nth-of-type(even)': {
                  bgcolor: theme.palette.grey[50],
                },
                '& tr:hover': {
                  bgcolor: theme.palette.action.hover,
                },
              }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult}</ReactMarkdown>
            </Box>
          </Paper>
        </Container>
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', p: 2 }}>
        <Box sx={{ width: '80%', maxWidth: 1200, display: 'flex', flexDirection: 'column', height: '90vh', mt: '3vh', mb: '3vh' }}>
          {/* ヘッダーカード */}
          <Card
            sx={{
              width: '100%',
              height: '12%',
              borderRadius: 3,
              boxShadow: theme.shadows[8],
              overflow: 'hidden',
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              mb: 1.5,
            }}
          >
            <CardContent sx={{ textAlign: 'center', p: 3, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Stack spacing={2} alignItems="center">
                <img
                  src="/icon.png"
                  alt="app icon"
                  width={64}
                  height={64}
                  style={{
                    marginBottom: 8,
                  }}
                />
                
                <Typography
                  variant="h4"
                  component="h1"
                  sx={{
                    fontWeight: 'bold',
                    color: theme.palette.text.primary,
                    mb: 1,
                  }}
                >
                  崩壊スターレイル戦闘分析
                </Typography>
                
                <Typography
                  variant="body2"
                  sx={{
                    color: theme.palette.text.secondary,
                    fontSize: '0.9rem',
                  }}
                >
                  段階的な選択で戦闘ログを分析
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          {/* ステップインジケーター */}
          <Card
            sx={{
              width: '100%',
              height: '14%',
              borderRadius: 3,
              boxShadow: theme.shadows[6],
              overflow: 'hidden',
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              mb: 1,
            }}
          >
            <CardContent sx={{ p: 3, height: '100%' }}>
              <Stepper activeStep={activeStep} alternativeLabel>
                {steps.map((step, index) => (
                  <Step key={step.label} completed={completedSteps.has(index)}>
                    <StepLabel
                      onClick={() => { if (!isAnalyzing) handleStepChange(index); }}
                      sx={{
                        cursor: !isAnalyzing && completedSteps.has(index) ? 'pointer' : 'default',
                        '&:hover': {
                          opacity: !isAnalyzing && completedSteps.has(index) ? 0.8 : 1,
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Box sx={{ mb: 1 }}>
                          {completedSteps.has(index) ? (
                            <CheckIcon color="success" />
                          ) : (
                            <UncheckedIcon color="action" />
                          )}
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                          {step.label}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center' }}>
                          {step.description}
                        </Typography>
                      </Box>
                    </StepLabel>
                  </Step>
                ))}
              </Stepper>
            </CardContent>
          </Card>

          {/* メインコンテンツエリア */}
          <Card
            sx={{
              width: '100%',
              height: '72%',
              borderRadius: 3,
              boxShadow: theme.shadows[6],
              overflow: 'hidden',
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <CardContent sx={{ p: 4, height: '100%', overflow: 'auto' }}>
              {/* ステップ1: ファイルアップロード */}
              {activeStep === 0 && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <UploadIcon sx={{ fontSize: 80, color: theme.palette.primary.main, mb: 3 }} />
                  <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold' }}>
                    ステップ1: ファイルアップロード
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 4, color: 'text.secondary' }}>
                    戦闘ログのJSONファイルをアップロードしてください
                  </Typography>
                  
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<UploadIcon />}
                    onClick={handleUploadClick}
                    disabled={isUploading}
                    sx={{
                      py: 2,
                      px: 6,
                      fontSize: '1.1rem',
                      borderRadius: 3,
                      minWidth: 250,
                    }}
                  >
                    {isUploading ? 'アップロード中...' : 'ファイルを選択'}
                  </Button>
                  
                  {/* 隠しファイル入力 */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                  
                  <Typography variant="body2" sx={{ mt: 3, color: 'text.secondary' }}>
                    対応形式: JSONファイル (.json)
                  </Typography>
                </Box>
              )}

              {/* ステップ2: 解説者選択 */}
              {activeStep === 1 && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <BrainIcon sx={{ fontSize: 80, color: theme.palette.secondary.main, mb: 3 }} />
                  <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold' }}>
                    ステップ2: 解説者選択
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 4, color: 'text.secondary' }}>
                    分析スタイルを選択してください
                  </Typography>
                  
                  <Stack direction="row" spacing={3} justifyContent="center" sx={{ mb: 4 }}>
                    <Card
                      sx={{
                        width: 200,
                        cursor: 'pointer',
                        border: selectedAnalyst === 'sparkle' ? `3px solid ${theme.palette.primary.main}` : '1px solid #ddd',
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          transform: 'translateY(-4px)',
                          boxShadow: theme.shadows[8],
                        },
                      }}
                      onClick={() => handleAnalystChange('sparkle')}
                    >
                      <CardContent sx={{ textAlign: 'center', p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                          <img
                            src={sparkleIconSrc}
                            alt="花火"
                            width={72}
                            height={72}
                            style={{
                              borderRadius: '50%',
                              objectFit: 'cover',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                              border: '2px solid rgba(255,255,255,0.9)'
                            }}
                          />
                        </Box>
                        <Typography variant="h6" sx={{ mb: 1, color: theme.palette.primary.main }}>
                          花火
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                          演劇的でドラマチックな分析
                        </Typography>
                        <Chip 
                          label="Gemini推奨" 
                          color="success" 
                          size="small" 
                          sx={{ fontSize: '0.7rem' }}
                        />
                      </CardContent>
                    </Card>
                    
                    <Card
                      sx={{
                        width: 200,
                        cursor: 'pointer',
                        border: selectedAnalyst === 'pela' ? `3px solid ${theme.palette.primary.main}` : '1px solid #ddd',
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          transform: 'translateY(-4px)',
                          boxShadow: theme.shadows[8],
                        },
                      }}
                      onClick={() => handleAnalystChange('pela')}
                    >
                      <CardContent sx={{ textAlign: 'center', p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                          <img
                            src={pelaIconSrc}
                            alt="ペラ"
                            width={72}
                            height={72}
                            style={{
                              borderRadius: '50%',
                              objectFit: 'cover',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                              border: '2px solid rgba(255,255,255,0.9)'
                            }}
                          />
                        </Box>
                        <Typography variant="h6" sx={{ mb: 1, color: theme.palette.secondary.main }}>
                          ペラ
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                          論理的で戦術的な分析
                        </Typography>
                        <Chip 
                          label="GPT推奨" 
                          color="info" 
                          size="small" 
                          sx={{ fontSize: '0.7rem' }}
                        />
                      </CardContent>
                    </Card>
                  </Stack>

                  <Stack direction="row" spacing={3} justifyContent="center" sx={{ mb: 4 }}>
                    <Card
                      sx={{
                        width: 200,
                        cursor: 'pointer',
                        border: selectedAnalyst === 'ruanmei' ? `3px solid ${theme.palette.primary.main}` : '1px solid #ddd',
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          transform: 'translateY(-4px)',
                          boxShadow: theme.shadows[8],
                        },
                        position: 'relative',
                      }}
                      onClick={() => handleAnalystChange('ruanmei')}
                    >
                      <CardContent sx={{ textAlign: 'center', p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                          <img
                            src={ruanmeiIconSrc}
                            alt="ルアン・メェイ"
                            width={72}
                            height={72}
                            style={{
                              borderRadius: '50%',
                              objectFit: 'cover',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                              border: '2px solid rgba(255,255,255,0.9)'
                            }}
                          />
                        </Box>
                        <Typography variant="h6" sx={{ mb: 1, color: theme.palette.warning.main }}>
                          ルアン・メェイ
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                          生命科学の専門家による分析
                        </Typography>
                        <Stack direction="row" spacing={1} justifyContent="center">
                          <Chip 
                            label="Gemini推奨" 
                            color="success" 
                            size="small" 
                            sx={{ fontSize: '0.7rem' }}
                          />
                          <Chip 
                            label="実験的機能" 
                            color="warning" 
                            size="small" 
                            sx={{ fontSize: '0.7rem' }}
                          />
                        </Stack>
                      </CardContent>
                    </Card>
                    
                    <Card
                      sx={{
                        width: 200,
                        cursor: 'pointer',
                        border: selectedAnalyst === 'theherta' ? `3px solid ${theme.palette.primary.main}` : '1px solid #ddd',
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          transform: 'translateY(-4px)',
                          boxShadow: theme.shadows[8],
                        },
                        position: 'relative',
                      }}
                      onClick={() => handleAnalystChange('theherta')}
                    >
                      <CardContent sx={{ textAlign: 'center', p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                          <img
                            src={thehertaIconSrc}
                            alt="マダム・ヘルタ"
                            width={72}
                            height={72}
                            style={{
                              borderRadius: '50%',
                              objectFit: 'cover',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                              border: '2px solid rgba(255,255,255,0.9)'
                            }}
                          />
                        </Box>
                        <Typography variant="h6" sx={{ mb: 1, color: theme.palette.warning.main }}>
                          マダム・ヘルタ
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                          天才クラブによる独創性評価
                        </Typography>
                        <Stack direction="row" spacing={1} justifyContent="center">
                          <Chip 
                            label="Gemini推奨" 
                            color="success" 
                            size="small" 
                            sx={{ fontSize: '0.7rem' }}
                          />
                          <Chip 
                            label="実験的機能" 
                            color="warning" 
                            size="small" 
                            sx={{ fontSize: '0.7rem' }}
                          />
                        </Stack>
                      </CardContent>
                    </Card>
                    
                    <Card
                      sx={{
                        width: 200,
                        cursor: 'pointer',
                        border: selectedAnalyst === 'herta' ? `3px solid ${theme.palette.primary.main}` : '1px solid #ddd',
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          transform: 'translateY(-4px)',
                          boxShadow: theme.shadows[8],
                        },
                        position: 'relative',
                      }}
                      onClick={() => handleAnalystChange('herta')}
                    >
                      <CardContent sx={{ textAlign: 'center', p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                          <img
                            src={hertaIconSrc}
                            alt="ヘルタ"
                            width={72}
                            height={72}
                            style={{
                              borderRadius: '50%',
                              objectFit: 'cover',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                              border: '2px solid rgba(255,255,255,0.9)'
                            }}
                          />
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                          🤖 ヘルタ
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                          Herta debug station
                        </Typography>
                        <Stack direction="row" spacing={1} justifyContent="center">
                          <Chip 
                            label="デバッグ" 
                            color="info" 
                            size="small" 
                            sx={{ fontSize: '0.7rem' }}
                          />
                        </Stack>
                      </CardContent>
                    </Card>
                  </Stack>
                  
                                     <Stack direction="row" spacing={2} justifyContent="center">
                     <Button
                       variant="outlined"
                       size="large"
                       onClick={() => setActiveStep(2)}
                       disabled={selectedAnalyst === 'auto'}
                       sx={{
                         py: 2,
                         px: 4,
                         fontSize: '1rem',
                         borderRadius: 3,
                       }}
                     >
                       次へ進む
                     </Button>
                   </Stack>
                </Box>
              )}

              {/* ステップ3: AI選択 */}
              {activeStep === 2 && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <SettingsIcon sx={{ fontSize: 80, color: theme.palette.info.main, mb: 3 }} />
                  <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold' }}>
                    ステップ3: AI選択
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 4, color: 'text.secondary' }}>
                    使用するAIモデルを選択してください
                  </Typography>
                  
                  <Stack spacing={3} alignItems="center" sx={{ mb: 4 }}>
                                         <FormControl sx={{ minWidth: 300 }}>
                       <InputLabel>AIモデル選択</InputLabel>
                       <Select
                         label="AIモデル選択"
                         value={selectedAI}
                         onChange={(e) => handleAIChange(e.target.value)}
                         size="medium"
                       >
                         <MenuItem value="gpt">{openaiModel}</MenuItem>
                         <MenuItem value="gemini">{geminiModel}</MenuItem>
                       </Select>
                     </FormControl>
                    
                                         {/* Gemini Temperature設定（Gemini選択時のみ表示） */}
                     {selectedAI === 'gemini' && (
                       <FormControl sx={{ minWidth: 300 }}>
                         <InputLabel>Temperature設定</InputLabel>
                         <Select
                           label="Temperature設定"
                           value={geminiTemperature}
                           onChange={(e) => setGeminiTemperature(Number(e.target.value))}
                           size="medium"
                         >
                           <MenuItem value={0.1}>0.1 (保守的)</MenuItem>
                           <MenuItem value={0.3}>0.3 (安定)</MenuItem>
                           <MenuItem value={0.5}>0.5 (バランス)</MenuItem>
                           <MenuItem value={0.7}>0.7 (創造的)</MenuItem>
                           <MenuItem value={0.9}>0.9 (独創的)</MenuItem>
                           <MenuItem value={1.0}>1.0 (最大創造性)</MenuItem>
                         </Select>
                       </FormControl>
                     )}
                  </Stack>
                  
                                     <Stack direction="row" spacing={2} justifyContent="center">
                     <Button
                       variant="outlined"
                       size="large"
                       onClick={() => setActiveStep(1)}
                       sx={{
                         py: 2,
                         px: 4,
                         fontSize: '1rem',
                         borderRadius: 3,
                       }}
                     >
                       戻る
                     </Button>
                     
                     <Button
                       variant="contained"
                       size="large"
                       onClick={() => setActiveStep(3)}
                       disabled={selectedAI === ''}
                       sx={{
                         py: 2,
                         px: 6,
                         fontSize: '1.1rem',
                         borderRadius: 3,
                         minWidth: 200,
                       }}
                     >
                       次へ進む
                     </Button>
                   </Stack>
                   
                   {/* 分析中のプログレスバー */}
                   {isAnalyzing && (
                     <Box sx={{ width: '100%', mt: 3 }}>
                       <LinearProgress
                         variant="indeterminate"
                         sx={{
                           height: 8,
                           borderRadius: 4,
                           backgroundColor: 'rgba(0, 0, 0, 0.1)',
                           '& .MuiLinearProgress-bar': {
                             background: 'linear-gradient(90deg, #4CAF50, #8BC34A, #4CAF50)',
                             backgroundSize: '200% 100%',
                             animation: 'shimmer 2s ease-in-out infinite',
                           },
                           '@keyframes shimmer': {
                             '0%': { backgroundPosition: '200% 0' },
                             '100%': { backgroundPosition: '-200% 0' },
                           },
                         }}
                       />
                       <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary', textAlign: 'center' }}>
                         AI分析中... しばらくお待ちください
                       </Typography>
                     </Box>
                   )}
                </Box>
              )}

              {/* ステップ4: AI分析実行 */}
              {activeStep === 3 && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold' }}>
                    ステップ4: AI分析実行
                  </Typography>
                  
                  {!analysisResult ? (
                    <>
                      <Typography variant="body1" sx={{ mb: 4, color: 'text.secondary' }}>
                        選択した設定で分析を実行します
                      </Typography>
                      
                      <Paper sx={{ p: 3, mb: 4, bgcolor: 'grey.50', borderRadius: 2 }}>
                        <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
                          選択内容の確認
                        </Typography>
                        <Stack spacing={1} alignItems="center">
                          <Typography variant="body2">
                            ファイル: {fileName}
                          </Typography>
                          <Typography variant="body2">
                            解説者: {selectedAnalyst === 'sparkle' ? '🎭 花火' : selectedAnalyst === 'pela' ? '🧠 ペラ' : selectedAnalyst === 'ruanmei' ? '🔬 ルアン・メェイ' : selectedAnalyst === 'theherta' ? '🪐 マダム・ヘルタ' : selectedAnalyst === 'herta' ? '🤖 ヘルタ' : '自動選択'}
                          </Typography>
                          <Typography variant="body2">
                            AI: {selectedAI === 'gpt' ? openaiModel : geminiModel}
                          </Typography>
                          {selectedAI === 'gemini' && (
                            <Typography variant="body2">
                              Temperature: {geminiTemperature}
                            </Typography>
                          )}
                        </Stack>
                      </Paper>
                      
                      <Stack direction="row" spacing={2} justifyContent="center">
                        <Button
                          variant="outlined"
                          size="large"
                          onClick={() => setActiveStep(2)}
                          disabled={isAnalyzing}
                          sx={{
                            py: 2,
                            px: 4,
                            fontSize: '1rem',
                            borderRadius: 3,
                          }}
                        >
                          戻る
                        </Button>
                        
                        <Button
                          variant="contained"
                          size="large"
                          startIcon={<BrainIcon />}
                          onClick={handleAnalysisStart}
                          disabled={isAnalyzing}
                          sx={{
                            py: 2,
                            px: 6,
                            fontSize: '1.1rem',
                            borderRadius: 3,
                            bgcolor: theme.palette.success.main,
                            minWidth: 200,
                            '&:hover': {
                              bgcolor: theme.palette.success.dark,
                            },
                          }}
                        >
                          {isAnalyzing ? (
                            <>
                              <CircularProgress size={20} sx={{ mr: 1 }} />
                              分析中...
                            </>
                          ) : (
                            'AI分析開始'
                          )}
                        </Button>
                        {isAnalyzing && (
                          <Button
                            variant="contained"
                            size="large"
                            onClick={() => abortControllerRef.current?.abort()}
                            sx={{
                              py: 2,
                              px: 4,
                              fontSize: '1rem',
                              borderRadius: 3,
                              minWidth: 160,
                              bgcolor: theme.palette.error.main,
                              '&:hover': {
                                bgcolor: theme.palette.error.dark,
                              },
                            }}
                          >
                            中止
                          </Button>
                        )}
                        <FormControl sx={{ minWidth: 200 }}>
                          <InputLabel>言語 / Language</InputLabel>
                          <Select label="言語 / Language" value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value as 'ja' | 'en')} disabled={isAnalyzing}>
                            <MenuItem value="ja">日本語</MenuItem>
                            <MenuItem value="en">English (Experimental)</MenuItem>
                          </Select>
                        </FormControl>
                      </Stack>
                      
                      {/* 分析中のプログレスバー */}
                      {isAnalyzing && (
                        <Box sx={{ width: '100%', mt: 3 }}>
                          <LinearProgress
                            variant="indeterminate"
                            sx={{
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: 'rgba(0, 0, 0, 0.1)',
                              '& .MuiLinearProgress-bar': {
                                background: 'linear-gradient(90deg, #4CAF50, #8BC34A, #4CAF50)',
                                backgroundSize: '200% 100%',
                                animation: 'shimmer 2s ease-in-out infinite',
                              },
                              '@keyframes shimmer': {
                                '0%': { backgroundPosition: '200% 0' },
                                '100%': { backgroundPosition: '-200% 0' },
                              },
                            }}
                          />
                          <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary', textAlign: 'center' }}>
                            AI分析中... しばらくお待ちください
                          </Typography>
                        </Box>
                      )}
                    </>
                  ) : (
                    <>
                      {/* 既に結果がある場合の操作 */}
                                             <Stack direction="row" spacing={2} justifyContent="center" sx={{ mb: 2 }}>
                         <Button
                           variant="outlined"
                           size="large"
                           onClick={() => setActiveStep(2)}
                           disabled={isAnalyzing}
                           sx={{ py: 1.5, px: 4, borderRadius: 3 }}
                         >
                           戻る
                         </Button>
                         <Button
                           variant="contained"
                           size="large"
                           startIcon={<RefreshIcon />}
                           onClick={handleReanalyze}
                           disabled={isAnalyzing}
                           sx={{
                             py: 1.5,
                             px: 4,
                             borderRadius: 3,
                             bgcolor: theme.palette.success.main,
                             '&:hover': { bgcolor: theme.palette.success.dark },
                           }}
                         >
                           {isAnalyzing ? (
                             <>
                               <CircularProgress size={20} sx={{ mr: 1 }} />
                               再分析中...
                             </>
                           ) : (
                             '再分析実行'
                           )}
                         </Button>
                         {isAnalyzing && (
                           <Button
                             variant="contained"
                             size="large"
                             onClick={() => abortControllerRef.current?.abort()}
                             sx={{ 
                               py: 1.5, 
                               px: 4, 
                               borderRadius: 3,
                               bgcolor: theme.palette.error.main,
                               '&:hover': {
                                 bgcolor: theme.palette.error.dark,
                               },
                             }}
                           >
                             中止
                           </Button>
                         )}
                         <FormControl sx={{ minWidth: 200 }}>
                           <InputLabel>言語 / Language</InputLabel>
                           <Select
                             label="言語 / Language"
                             value={selectedLanguage}
                             onChange={(e) => setSelectedLanguage(e.target.value as 'ja' | 'en')}
                             size="medium"
                             disabled={isAnalyzing}
                           >
                             <MenuItem value="ja">日本語</MenuItem>
                             <MenuItem value="en">English (Experimental)</MenuItem>
                           </Select>
                         </FormControl>
                       </Stack>
 
                      <Typography variant="h6" sx={{ color: 'success.main', fontWeight: 'bold', mb: 3 }}>
                        {selectedAnalyst === 'sparkle' ? (
                          <>
                            <img
                              src={sparkleIconSrc}
                              alt="花火"
                              width={48}
                              height={48}
                              style={{
                                borderRadius: '50%',
                                objectFit: 'cover',
                                marginRight: '12px',
                                verticalAlign: 'middle'
                              }}
                            />
                            花火の演劇的解説 (for {selectedAI === 'gpt' ? openaiModel : geminiModel})
                          </>
                        ) : selectedAnalyst === 'pela' ? (
                          <>
                            <img
                              src={pelaIconSrc}
                              alt="ペラ"
                              width={48}
                              height={48}
                              style={{
                                borderRadius: '50%',
                                objectFit: 'cover',
                                marginRight: '12px',
                                verticalAlign: 'middle'
                              }}
                            />
                            ペラの戦術指南 (for {selectedAI === 'gpt' ? openaiModel : geminiModel})
                          </>
                        ) : selectedAnalyst === 'ruanmei' ? (
                          <>
                            <img
                              src={ruanmeiIconSrc}
                              alt="ルアン・メェイ"
                              width={48}
                              height={48}
                              style={{
                                borderRadius: '50%',
                                objectFit: 'cover',
                                marginRight: '12px',
                                verticalAlign: 'middle'
                              }}
                            />
                            ルアン・メェイの生命科学分析 (for {selectedAI === 'gpt' ? openaiModel : geminiModel})
                          </>
                        ) : selectedAnalyst === 'theherta' ? (
                          <>
                            <img
                              src={thehertaIconSrc}
                              alt="マダム・ヘルタ"
                              width={48}
                              height={48}
                              style={{
                                borderRadius: '50%',
                                objectFit: 'cover',
                                marginRight: '12px',
                                verticalAlign: 'middle'
                              }}
                            />
                            マダム・ヘルタの独創性評価 (for {selectedAI === 'gpt' ? openaiModel : geminiModel})
                          </>
                        ) : selectedAnalyst === 'herta' ? (
                          <>
                            <img
                              src={hertaIconSrc}
                              alt="ヘルタ"
                              width={48}
                              height={48}
                              style={{
                                borderRadius: '50%',
                                objectFit: 'cover',
                                marginRight: '12px',
                                verticalAlign: 'middle'
                              }}
                            />
                            Herta debug station (for {selectedAI === 'gpt' ? openaiModel : geminiModel})
                          </>
                        ) : (
                          <>
                            <img
                              src={sparkleIconSrc}
                              alt="自動選択"
                              width={48}
                              height={48}
                              style={{
                                borderRadius: '50%',
                                objectFit: 'cover',
                                marginRight: '12px',
                                verticalAlign: 'middle'
                              }}
                            />
                            自動選択による分析 (for {selectedAI === 'gpt' ? openaiModel : geminiModel})
                          </>
                        )}
                      </Typography>
                      
                      {/* 分析結果表示 - 強調されたカード */}
                      <Paper
                        elevation={8}
                        sx={{
                          p: 4,
                          bgcolor: 'white',
                          borderRadius: 3,
                          overflow: 'hidden',
                          textAlign: 'left',
                          border: `2px solid ${theme.palette.success.main}`,
                          position: 'relative',
                          '&::before': {
                            content: '""',
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '4px',
                            background: `linear-gradient(90deg, ${theme.palette.success.main}, ${theme.palette.primary.main})`,
                          },
                        }}
                      >
                        {/* アクションボタン - 結果カードの上部に固定 */}
                        <Box sx={{ 
                          position: 'sticky', 
                          top: 0, 
                          bgcolor: 'white', 
                          pt: 0, 
                          pb: 2, 
                          mb: 2,
                          borderBottom: `1px solid ${theme.palette.divider}`,
                          zIndex: 1
                        }}>
                          <Stack direction="row" spacing={2} sx={{ justifyContent: 'center' }}>
                            <Button
                              variant="contained"
                              size="medium"
                              startIcon={<CopyIcon />}
                              onClick={handleCopyResult}
                              sx={{
                                borderRadius: 2,
                                px: 4,
                                py: 1,
                                bgcolor: theme.palette.primary.main,
                                '&:hover': { bgcolor: theme.palette.primary.dark },
                              }}
                            >
                              コピー
                            </Button>
                            <Button
                              variant="contained"
                              size="medium"
                              startIcon={<DownloadIcon />}
                              onClick={handleDownloadResult}
                              sx={{
                                borderRadius: 2,
                                px: 4,
                                py: 1,
                                bgcolor: theme.palette.secondary.main,
                                '&:hover': { bgcolor: theme.palette.secondary.dark },
                              }}
                            >
                              分析結果
                            </Button>
                          </Stack>
                        </Box>
                        
                        {/* 結果コンテンツ */}
                        <Box
                          sx={{
                            maxHeight: '500px',
                            overflow: 'auto',
                            '& h1, & h2, & h3, & h4, & h5, & h6': {
                              color: theme.palette.primary.main,
                              fontWeight: 'bold',
                              mb: 1,
                            },
                            '& p': {
                              mb: 1,
                              lineHeight: 1.6,
                            },
                            '& ul, & ol': {
                              mb: 1,
                              pl: 2,
                            },
                            '& li': {
                              mb: 0.5,
                            },
                            '& strong': {
                              fontWeight: 'bold',
                            },
                            '& em': {
                              fontStyle: 'italic',
                            },
                            '& table': {
                              borderCollapse: 'collapse',
                              width: '100%',
                              mb: 2,
                              fontSize: '0.9rem',
                              boxShadow: theme.shadows[1],
                            },
                            '& th, & td': {
                              border: `1px solid ${theme.palette.divider}`,
                              padding: '8px 12px',
                              textAlign: 'left',
                              verticalAlign: 'top',
                            },
                            '& th': {
                              bgcolor: theme.palette.primary.main,
                              color: 'white',
                              fontWeight: 'bold',
                              fontSize: '0.95rem',
                            },
                            '& tr:nth-of-type(even)': {
                              bgcolor: theme.palette.grey[50],
                            },
                            '& tr:hover': {
                              bgcolor: theme.palette.action.hover,
                            },
                          }}
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult}</ReactMarkdown>
                        </Box>
                      </Paper>
                      
                      <Button
                        variant="contained"
                        size="large"
                        onClick={() => {
                          setActiveStep(0);
                          setUploadedFile(null);
                          setFileName('');
                          setFileContent(null);
                          setSelectedAI('');
                          setSelectedAnalyst('auto');
                          setAnalysisResult('');
                          setPayloadData(null);
                          setCompletedSteps(new Set());
                        }}
                        sx={{
                          mt: 3,
                          py: 2,
                          px: 6,
                          fontSize: '1rem',
                          borderRadius: 3,
                          bgcolor: theme.palette.info.main,
                        }}
                      >
                        新しいファイルをアップロード
                      </Button>
                    </>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
        
        {/* スナックバー */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={handleSnackbarClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={handleSnackbarClose}
            severity={snackbar.severity}
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </>
  );
};
