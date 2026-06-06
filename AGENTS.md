# AGENTS.md

このファイルは、このリポジトリで作業するAIエージェントへの運用ガイドです。新しい会話でもこのファイルを読めば、リポジトリの性質・規約・作業フローが把握できるようにしています。

## 1. このリポジトリについて

- **Tampermonkey 用のユーザースクリプトをまとめて管理するリポジトリ**です。
- `tampermonkey/` 配下のサブフォルダがそれぞれ独立した1スクリプトに対応します。
- **フォルダ間に関連はありません**。あるフォルダの作業中に他のフォルダを参照する必要はなく、依存関係も共有モジュールもありません。1フォルダ＝1スクリプトとして閉じて扱ってください。
- 各サブフォルダの中身は基本的に `script.js`（必須）と `icon_128.png`（任意、128×128 PNG）の2ファイル構成です。

## 2. ファイル命名規則

- スクリプト本体のファイル名は **`script.js` で統一**します。`main.js` や `フォルダ名.user.js` のような名前にはしません。
- アイコンを置く場合は `icon_128.png` というファイル名で配置します。

## 3. UserScript ヘッダの規約

ヘッダで以下を必ず守ってください:

- `@name` はそのスクリプトが属する**フォルダ名と完全一致**させる（日本語フォルダ名であればそのまま日本語で書く）。
- `@updateURL` / `@downloadURL` / `@icon` は以下の URL 形式を使う。`{フォルダ名}` 部分は実際のフォルダ名にそのまま置き換える（URL エンコードは Tampermonkey 側で行われるので、生の日本語で記述してよい）:
  - `@updateURL`   `https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/{フォルダ名}/script.js`
  - `@downloadURL` `https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/{フォルダ名}/script.js`
  - `@icon`        `https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/{フォルダ名}/icon_128.png`

### ヘッダのお手本

新規作成時はこれをコピペして、`{フォルダ名}` と説明・`@match` などを書き換えてください:

```javascript
// ==UserScript==
// @name         {フォルダ名}
// @namespace    https://tampermonkey.net/
// @version      1.0.0
// @description  （スクリプトの説明）
// @match        https://example.com/*
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/{フォルダ名}/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/{フォルダ名}/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/{フォルダ名}/icon_128.png
// @grant        none
// ==/UserScript==
```

## 4. 新規スクリプト作成依頼を受けたときのワークフロー

1. **対象サイトの構造調査をブラウザで行う。**
   - **推測でセレクタを書かない。** 実際のページで DOM 構造と表示を確認してから採用してください。
2. セクション 3 のヘッダ規約に沿って `tampermonkey/{フォルダ名}/script.js` を作成する。
3. 次セクションのデバッグが通るまで**完成宣言しない**。

## 5. デバッグ方針

- `@match` に合う URL を先に選んでから注入してください。たとえば `watch` ではなく `live_chat` に `@match` しているスクリプトは、最初から `https://www.youtube.com/live_chat?...` 側を開きます。
- `GM_addStyle` や `GM_getValue` / `GM_setValue` など、一部の `GM_*` は shim で近似できます。ただし、Tampermonkey の本物の権限モデルは再現されません。
- 期待どおりの挙動が確認できるまで、修正 → 再注入 を繰り返します。**デバッグが通って初めて完成宣言**してください。動かないまま「完成しました」と言わないこと。