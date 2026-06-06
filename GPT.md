# AGENTS.md

このファイルは、このリポジトリで作業する Codex への運用ガイドです。新しい会話でもこのファイルを読めば、リポジトリの性質・規約・作業フローが把握できるようにしています。

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
   - 原則は Browser skill を読み、`iab` バックエンドで対象ページを開く。
   - ユーザーが `@chrome` の使用を指定した場合、または対象サイトへのログインが必要だと言及した場合は Chrome skill を読み、`chrome` バックエンドでログイン済み Chrome を使う。
   - `tab.playwright.domSnapshot()` / `tab.playwright.screenshot()` / `tab.dev.logs(...)` などを使って、必要なセレクタ・DOM構造・イベントの発火タイミングを実地で確認する。
   - **推測でセレクタを書かない。** 実際のページで DOM 構造と表示を確認してから採用してください。
2. セクション 3 のヘッダ規約に沿って `tampermonkey/{フォルダ名}/script.js` を作成する。
3. 次セクションのデバッグが通るまで**完成宣言しない**。

## 5. デバッグ方針

- **重要:** Browser / in-app browser ではブラウザの Tampermonkey 拡張機能に MCP からアクセスできません。原則として **スクリプトを対象ページに直接注入して検証**します。
- **Chrome を使う場合:** ログインが必要なサイトやユーザー指定で `@chrome` を使う場合は、Chrome の安全ポリシーにより `javascript:` URL や低レベル注入などのスクリプト注入が弾かれることがあります。その場合は、ユーザーに一度 `script.js` を Tampermonkey へ手動追加・更新してもらい、その状態のページを Chrome で読み取ってデバッグします。
- `@match` に合う URL を先に選んでから注入してください。たとえば `watch` ではなく `live_chat` に `@match` しているスクリプトは、最初から `https://www.youtube.com/live_chat?...` 側を開きます。
- `GM_addStyle` や `GM_getValue` / `GM_setValue` など、一部の `GM_*` は shim で近似できます。ただし、Tampermonkey の本物の権限モデルは再現されません。
- 期待どおりの挙動が確認できるまで、修正 → 再注入 を繰り返します。**デバッグが通って初めて完成宣言**してください。動かないまま「完成しました」と言わないこと。

詳細な注入手順、`GM_*` shim テンプレート、`__iabRpc` 不在時の named pipe fallback、確認方法の優先順位は [tampermonkey/DEBUGGING.md](G:/バイブコード/github/tampermonkey/DEBUGGING.md) を参照してください。

## 6. Chrome を使うケース

- ユーザーが `@chrome` の使用を指定した場合、またはログインが必要なサイトだと言及した場合は、Browser ではなく Chrome skill を使います。
- Chrome ではユーザーのログイン済みセッション・既存タブ・拡張機能が使えるため、認証後のダッシュボードや管理画面の DOM 調査に向いています。
- 一方で Chrome 経由では、`javascript:` URL による実行や任意スクリプト注入が安全ポリシーで拒否されることがあります。Tampermonkey スクリプトの動作確認が必要な場合は、ユーザーに `script.js` を Tampermonkey へ手動で追加・更新してもらってから、ページを再読み込みしてもらい、Chrome で表示・DOM・console log を確認します。
- Chrome の Playwright wrapper では通常の `locator(...).evaluate(...)` のような任意 JS 実行 API が使えない場合があります。computed style や座標などが必要なときは、可能な範囲で `domSnapshot()`、`screenshot()`、locator の `innerText()` / `getAttribute()`、`tab.dev.logs(...)` を組み合わせて確認します。
- Chrome 作業後は、必要なタブだけ `handoff` または `deliverable` として残し、それ以外は `browser.tabs.finalize(...)` で整理します。

