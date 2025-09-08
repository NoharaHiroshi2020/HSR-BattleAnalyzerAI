'use client';

import { useState } from 'react';
import { MaterialMenu } from '@/features/analysis/ui/MaterialMenu';

export default function PreviewPage() {
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && (file.type === 'text/markdown' || file.name.endsWith('.md'))) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setMarkdownContent(content);
      };
      reader.readAsText(file);
    } else {
      alert('Markdownファイル（.md）を選択してください。');
    }
  };

  const handleTextAreaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMarkdownContent(event.target.value);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
          レポートプレビュー
        </h1>
        
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex gap-4 mb-4">
            <button
              onClick={() => setIsPreviewMode(false)}
              className={`px-4 py-2 rounded-md font-medium ${
                !isPreviewMode
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              編集モード
            </button>
            <button
              onClick={() => setIsPreviewMode(true)}
              className={`px-4 py-2 rounded-md font-medium ${
                isPreviewMode
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              プレビューモード
            </button>
          </div>

          {!isPreviewMode ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Markdownファイルをアップロード
                </label>
                <input
                  type="file"
                  accept=".md,text/markdown"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  または直接Markdownを入力
                </label>
                <textarea
                  value={markdownContent}
                  onChange={handleTextAreaChange}
                  placeholder="Markdownコンテンツをここに入力してください..."
                  className="w-full h-96 p-4 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>
            </div>
          ) : (
            <div className="border border-gray-300 rounded-md p-4 min-h-96">
              {markdownContent ? (
                <MaterialMenu 
                  initialContent={markdownContent}
                  isPreviewMode={true}
                />
              ) : (
                <div className="text-gray-500 text-center py-8">
                  プレビューするコンテンツがありません。
                  <br />
                  編集モードでMarkdownファイルをアップロードするか、直接入力してください。
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
