## トラブルシューティング

### よくある問題
1. 500エラー: `.env.local` のAPIキー設定を確認
2. 分析結果が空: 入力JSONの形式と `battleData` 整形処理を確認
3. 分析結果にそのステージに存在しない敵が表示される
   - 戦闘ログを記録する前に[Firefly-Sranalysis](http://localhost:3000/)をリロードしてください。
   - なにもない状態でConnectionSetting→バトル終了後にExport data battle を行ってください

<div align="left">
  <img src="images/screenshots/fireflyanalysis.png" width="35%" alt="fireflyanalysis">
</div>

### ログ
- サーバ側ペイロード: `logs/payload-logs.txt`（他のLLMで試すときに利用できます）

### サポート
- GitHub Issues へ最小再現のJSONとスクリーンショットを添付してください

