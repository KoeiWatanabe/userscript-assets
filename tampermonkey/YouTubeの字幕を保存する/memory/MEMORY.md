# YouTubeの字幕を保存する - Memory

## YouTube Transcript DOM変更 (2026年3月確認)

YouTubeのトランスクリプトUIが新しい形式（`PAmodern_transcript_view`）に移行。

### 旧DOM
- コンテナ: `#segments-container`
- セグメント: `ytd-transcript-segment-renderer`
- タイムスタンプ: `.segment-timestamp` / `yt-formatted-string.segment-timestamp`
- テキスト: `yt-formatted-string.segment-text`
- ヘッダー注入点: `#information-button`（visible）

### 新DOM
- パネル: `[target-id="PAmodern_transcript_view"]` が `ENGAGEMENT_PANEL_VISIBILITY_EXPANDED` になる
- セグメント: `transcript-segment-view-model.ytwTranscriptSegmentViewModelHost`
- タイムスタンプ: `.ytwTranscriptSegmentViewModelTimestamp`（aria hidden）
- テキスト: `span.yt-core-attributed-string`
- ヘッダー注入点: `#action-buttons`（空・visible） ← ここに appendChild

### 「Show transcript」ボタンの場所
説明欄の下部に `Transcript` セクションがある → `Show transcript` ボタン

### CSP注意点
YouTubeページのTrustedTypes制限でコンソールからinnerHTML直接設定不可。
Tampermonkeyスクリプトは別worldで動作するため影響なし。

## スクリプトバージョン
- v0.4.0: 新旧両DOM対応（後方互換あり）
