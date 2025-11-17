Mermaid Local Previewer

※本拡張機能は開発初期段階のテスト版です。現在は Mermaid 図のプレビューおよび画像としての書き出しに対応しています。

VS Code 上で 完全ローカル で Mermaid 図をプレビューできる拡張機能です。
描画処理はすべてローカルで完結し、外部サーバーへの通信は発生しません。

プライバシーとセキュリティ

完全ローカル動作

外部リクエストなし（Mermaid ライブラリ同梱）

テレメトリ、データ収集なし

オープンソースでコードを確認可能

機能

リアルタイムプレビュー

全画面表示（ズーム、ドラッグ操作に対応）

SVG / PNG 形式での書き出し

Classic / Dark テーマ切り替え

日本語インターフェース対応

インストール方法
VSIX ファイルからのインストール

Releases ページ
より .vsix ファイルをダウンロード

以下のコマンドでインストール

code --install-extension mermaid-0.0.2.vsix


または VS Code の拡張機能画面 → 「…」メニュー → 「VSIX からインストール」を選択。

ソースコードからインストール
git clone https://github.com/1haku/mermaid-vscode-extensions-localVer.git
cd mermaid-vscode-extensions-localVer
npm install
npm run compile

使い方

.mmd、.mermaid、または Mermaid 記法を含む Markdown ファイルを開く

エディタ内を右クリック

「Mermaid: Preview Diagram」を選択

編集内容がリアルタイムでプレビューされます

ツールバーから以下の操作が可能

テーマ切り替え

プレビューの更新

全画面表示

SVG / PNG 形式で書き出し

サンプル
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E

開発手順
npm install
npm run compile       # TypeScript のコンパイル
npm run watch         # 監視モード
npx vsce package      # パッケージ作成

現在の制限事項

本拡張機能は開発初期段階のため、以下の機能に限定されます。

Mermaid 図の表示

SVG / PNG 形式での書き出し

基本的なテーマ変更

今後、利用者の要望に応じて機能を追加予定です。

リンク

GitHub リポジトリ
https://github.com/1haku/mermaid-vscode-extensions-localVer

Issue 受付
https://github.com/1haku/mermaid-vscode-extensions-localVer/issues


MIT License

by@ yibocho