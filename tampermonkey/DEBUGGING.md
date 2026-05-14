# Tampermonkey Debugging Guide

このドキュメントは、Codex in-app browser を使って Tampermonkey スクリプトを調査・直接注入・デバッグするための詳細手順です。  
リポジトリ全体の基本ルールは [AGENTS.md](G:/バイブコード/github/AGENTS.md) を参照してください。

## 1. 前提

- ブラウザの Tampermonkey 拡張機能には MCP からアクセスできません。
- そのため、Tampermonkey に登録した状態で動作確認する経路は使えません。
- この環境では、原則として **対象ページに `script.js` を直接注入して検証**します。
- ただし、ユーザーが `@chrome` の使用を指定した場合、またはログインが必要なサイトだと言及した場合は、Chrome skill を使います。Chrome では安全ポリシーによりスクリプト注入が弾かれることがあるため、ユーザーに `script.js` を Tampermonkey へ手動追加・更新してもらってから、その状態のページを Chrome で確認します。
- 期待どおりの挙動が確認できるまで、修正 → 再注入 を繰り返します。動かないまま完成宣言しないこと。

## 2. サイト調査の基本方針

1. まず使用するブラウザ skill を決める。
   - 原則は Browser skill を読み、`iab` バックエンドで対象ページを開く。
   - ユーザーが `@chrome` の使用を指定した場合、または対象サイトへのログインが必要だと言及した場合は Chrome skill を読み、`chrome` バックエンドでログイン済み Chrome を使う。
2. 対象ページを実地で調査する。
   - `tab.playwright.domSnapshot()`
   - `tab.playwright.screenshot()`
   - `tab.dev.logs(...)`
   - locator の `innerText()` / `getAttribute()` など
3. 推測でセレクタを書かない。
   - 実際のページで DOM 構造・表示・イベントの発火タイミングを確認してから採用する。

## 3. 対象 URL の選び方

- `@match` に合う URL を先に選ぶ。
- `watch` ページ本体ではなく `live_chat` に `@match` しているスクリプトは、最初から `https://www.youtube.com/live_chat?...` 側を開く。
- 例: `https://www.youtube.com/watch?v=VIDEO_ID` 用のライブチャットは `https://www.youtube.com/live_chat?v=VIDEO_ID&is_popout=1`
- Twitch は配信ページ本体でも、オフライン状態だとチャット DOM が無く検証にならない。
- DOM が無い状態でストライプやボタンが出ない場合は、まず「注入失敗」ではなく「対象 UI 不在」を疑う。


## 4. Chrome 初期化（ログイン必須サイト）

ユーザーが `@chrome` を指定した場合、またはログインが必要なサイトでは Chrome skill を使う。Chrome はユーザーのログイン済みセッションと Tampermonkey を含む拡張機能状態を利用できる。

```javascript
if (!globalThis.agent) {
  const { setupAtlasRuntime } = await import(
    'C:/Users/koei0/.codex/plugins/cache/openai-bundled/chrome/0.1.7/scripts/browser-client.mjs'
  );
  await setupAtlasRuntime({ globals: globalThis });
}
if (!globalThis.browser) {
  globalThis.browser = await agent.browsers.get('extension');
}
await browser.nameSession('site userscript debug');
if (typeof tab === 'undefined' || !globalThis.tab) {
  globalThis.tab = await browser.tabs.new();
}
```

Chrome では、`javascript:` URL や低レベルの任意スクリプト注入が安全ポリシーで拒否されることがある。その場合は注入で検証しようとせず、ユーザーに `script.js` を Tampermonkey へ手動追加・更新してもらう。以後はページを再読み込みしてもらい、Chrome で `screenshot()` / `domSnapshot()` / `tab.dev.logs(...)` を使って表示と挙動を確認する。

今回確認した制約:

- Chrome の安全ポリシーにより `javascript:` URL 実行は拒否される。
- Chrome の Playwright wrapper では `locator(...).evaluate(...)` のような任意 JS 実行が使えない場合がある。
- computed style や座標の詳細確認は制限されるため、公式 DOM の class / 属性、スクリーンショット、表示テキスト、console log を組み合わせて判断する。
- Tampermonkey への追加・更新は MCP から直接できないため、ユーザーに手動で読み込んでもらう必要がある。
- Chrome 作業後は `browser.tabs.finalize({ keep: [...] })` を呼び、続きの確認が必要なタブだけ残す。

## 5. Browser 初期化

Node REPL で in-app browser を初期化し、現在のタブを取得する。

```javascript
if (!globalThis.agent) {
  const { setupAtlasRuntime } = await import(
    'C:/Users/koei0/.codex/plugins/cache/openai-bundled/browser-use/0.1.0-alpha1/scripts/browser-client.mjs'
  );
  await setupAtlasRuntime({ globals: globalThis, backend: 'iab' });
}
await agent.browser.nameSession('YouTube userscript debug');
if (typeof tab === 'undefined') {
  globalThis.tab = await agent.browser.tabs.selected();
}
```

## 6. `script.js` の読み込み

- UserScript ヘッダを除いて対象ページで実行する。
- ヘッダを含めたままでも JavaScript コメントなので通常は動くが、注入対象は実体の IIFE 部分だけにしておくと原因切り分けがしやすい。
- 注入前に、同じスクリプトの既存 UI や `window` 上のデバッグ用フラグを必要に応じて消す。

```javascript
const fs = await import('node:fs/promises');
const path = 'G:/バイブコード/github/tampermonkey/YouTubeのソートを改善する/script.js';
let source = await fs.readFile(path, 'utf8');
source = source.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');
```

## 7. `GM_*` shim テンプレート

### 7.1 方針

- `GM_addStyle` は `style` 要素を自前で挿す shim で近似できる。
- `GM_getValue` / `GM_setValue` / `GM_deleteValue` / `GM_listValues` は `localStorage` ベースで近似できる。
- `GM_xmlhttpRequest` / `GM_registerMenuCommand` / `GM_setClipboard` は原則としてそのまま再現できない。
- これらに依存する本番挙動は最後に Tampermonkey 実機で確認する。
- 同じページに何度も再注入する場合は、以前の shim `style` やデバッグ用フラグを掃除してから入れる。

### 7.2 早見表

| API | デバッグ時の扱い | 備考 |
| --- | --- | --- |
| `GM_addStyle` | shim 推奨 | UI 変化確認にはかなり有効 |
| `GM_getValue` / `GM_setValue` | shim 推奨 | `localStorage` で近似可能 |
| `GM_deleteValue` / `GM_listValues` | shim 推奨 | 同上 |
| `GM_xmlhttpRequest` | 原則再現不可 | 拡張権限や CORS 回避は再現できない |
| `GM_registerMenuCommand` | 原則再現不要 | 必要なら一時ボタンや `prompt()` で代替 |
| `GM_setClipboard` | 原則再現不可 | 最終的な確認は Tampermonkey 実機で行う |

### 7.3 `GM_addStyle` の最小 shim

```javascript
const gmAddStyleShim = `
if (typeof window.GM_addStyle !== "function") {
  window.GM_addStyle = function(cssText) {
    let style = document.querySelector('style[data-codex-gm-addstyle-shim="1"]');
    if (!style) {
      style = document.createElement("style");
      style.setAttribute("data-codex-gm-addstyle-shim", "1");
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent += "\\n" + String(cssText ?? "");
    return style;
  };
}
`;
```

### 7.4 `GM_*Value` の最小 shim

```javascript
const gmValueShim = `
(() => {
  const prefix = "__codex_gmshim__:";
  const keyOf = (key) => prefix + String(key);

  if (typeof window.GM_getValue !== "function") {
    window.GM_getValue = function(key, fallback) {
      const raw = localStorage.getItem(keyOf(key));
      if (raw == null) return fallback;
      try { return JSON.parse(raw); } catch { return fallback; }
    };
  }

  if (typeof window.GM_setValue !== "function") {
    window.GM_setValue = function(key, value) {
      localStorage.setItem(keyOf(key), JSON.stringify(value));
    };
  }

  if (typeof window.GM_deleteValue !== "function") {
    window.GM_deleteValue = function(key) {
      localStorage.removeItem(keyOf(key));
    };
  }

  if (typeof window.GM_listValues !== "function") {
    window.GM_listValues = function() {
      return Object.keys(localStorage)
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length));
    };
  }
})();
`;
```

### 7.5 再注入前のクリーンアップ例

```javascript
document.querySelectorAll('style[data-codex-gm-addstyle-shim="1"]').forEach((el) => el.remove());
delete window.GM_addStyle;
delete window.GM_getValue;
delete window.GM_setValue;
delete window.GM_deleteValue;
delete window.GM_listValues;
delete window.__codexUserscriptDebug;
```

## 8. 低レベル注入の優先順位

1. `__iabRpc` / `__iabPipe` があるか確認する
2. あればそのまま使う
3. 無ければ named pipe fallback を使う
4. named pipe fallback に入った時点で、sandbox 外の PowerShell を第一候補にする

今回の検証では、named pipe は sandbox 内の Node で `EPERM`、sandbox 内の PowerShell で access denied になったため、**named pipe fallback は最初から sandbox 外を第一候補にしたほうが手戻りが少ない**。

## 9. CDP `Runtime.evaluate` による注入

- 少なくとも公開されている Browser API の範囲では、ページへ任意 JavaScript を注入する手段は確認できない。
- そのため、必要に応じて in-app browser の CDP に直接 `Runtime.evaluate` を送る。
- `nodeRepl.requestMeta['x-codex-turn-metadata']` はターンごとに変わるため、実行直前に必ず取り直す。
- `tab.id` は文字列なので、CDP 側では数値に変換する。
- `__iabRpc` / `__iabPipe` は Browser skill の通常初期化だけで自動的に生えるとは限らない。使えるかどうかは `typeof globalThis.__iabRpc === 'function'` と `typeof globalThis.__iabPipe === 'string'` で確認する。

```javascript
const meta = nodeRepl.requestMeta['x-codex-turn-metadata'];
const session = {
  session_id: meta.session_id,
  turn_id: meta.turn_id,
};

const expression = `
(() => {
  ${typeof gmAddStyleShim === 'string' ? gmAddStyleShim : ''}
  ${typeof gmValueShim === 'string' ? gmValueShim : ''}
  ${source}
})()
//# sourceURL=codex-userscript-injection.js
`;

await globalThis.__iabRpc(globalThis.__iabPipe, 'attach', {
  ...session,
  tabId: Number(tab.id),
}, 10000);

await globalThis.__iabRpc(globalThis.__iabPipe, 'executeCdp', {
  ...session,
  target: { tabId: Number(tab.id) },
  method: 'Runtime.evaluate',
  commandParams: {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  },
}, 30000);
```

## 10. `__iabRpc` 不在時の fallback

- `__iabRpc` / `__iabPipe` が無い場合は、named pipe fallback を使う。
- 今回の実地確認では、sandbox 内の Node / PowerShell から `codex-browser-use-*` の named pipe に接続しようとすると、`EPERM` や access denied になった。
- そのため、named pipe fallback に入った時点で sandbox 外の PowerShell `NamedPipeClientStream` を第一候補にする。
- sandbox 外の PowerShell で `codex-browser-use-*` pipe に接続し、`getTabs` → `attach` → `executeCdp` を行う。
- これは通常経路より下位の最終 fallback であり、権限昇格が必要な場合がある。
- まず `getTabs` で、どの pipe が今の `tab` を持っているかを特定してから `attach` / `executeCdp` する。

```powershell
$sessionId = '...'
$turnId = '...'
$pipeName = 'codex-browser-use-...'

function Invoke-Pipe($method, $params, $timeout = 10000) {
  $pipe = [System.IO.Pipes.NamedPipeClientStream]::new('.', $pipeName, [System.IO.Pipes.PipeDirection]::InOut)
  $pipe.Connect($timeout)
  $id = Get-Random
  $obj = @{ jsonrpc = '2.0'; method = $method; params = $params; id = $id }
  $json = ($obj | ConvertTo-Json -Compress -Depth 100)
  $body = [System.Text.Encoding]::UTF8.GetBytes($json)
  $len = [BitConverter]::GetBytes([UInt32]$body.Length)
  $pipe.Write($len, 0, 4)
  $pipe.Write($body, 0, $body.Length)
  $pipe.Flush()
  $hdr = New-Object byte[] 4
  [void]$pipe.Read($hdr, 0, 4)
  $n = [BitConverter]::ToUInt32($hdr, 0)
  $buf = New-Object byte[] $n
  $off = 0
  while ($off -lt $n) {
    $r = $pipe.Read($buf, $off, $n - $off)
    if ($r -le 0) { break }
    $off += $r
  }
  $pipe.Dispose()
  [System.Text.Encoding]::UTF8.GetString($buf, 0, $off) | ConvertFrom-Json
}

$session = @{ session_id = $sessionId; turn_id = $turnId }

Invoke-Pipe 'getTabs' $session
Invoke-Pipe 'attach' ($session + @{ tabId = 1 })
Invoke-Pipe 'executeCdp' ($session + @{
  target = @{ tabId = 1 }
  method = 'Runtime.evaluate'
  commandParams = @{
    expression = $expression
    awaitPromise = $true
    returnByValue = $true
    userGesture = $true
  }
}) 30000
```

## 11. 注入結果の確認

### 11.1 何を見ればよいか

- UI 変化確認が主目的なら `screenshot()`
- 実行エラー有無の確認なら `tab.dev.logs(...)`
- DOM 構造や対象ノードの存在確認なら `domSnapshot()`

`domSnapshot()` に属性や shim `style` が出ないことがあるため、**最終的な見た目の確認はスクリーンショットを優先**する。

- 画面変化が主目的なら、まず `screenshot()` を優先する。
- `domSnapshot()` に属性や shim `style` が出ないことがある。
- `tab.dev.logs(...)` は「実行エラーが出ていないか」を確認する用途で使う。
- 属性確認が取れなくても、画面上で縞やボタンやスタイル変化が見えていれば、UI 効果確認としては成功扱いにできる。

```javascript
await display(await tab.playwright.screenshot({ fullPage: false }));
console.log(await tab.playwright.domSnapshot());
console.log(await tab.dev.logs({ levels: ['log', 'warn', 'error'], limit: 50 }));
```

## 12. 再注入

- 修正したら、ページを再読み込みしてから再注入する。
- YouTube のような SPA では、修正前の UI や状態が残ることがあるので、`reload()` を挟んでから再確認する。

```javascript
await tab.reload();
await tab.playwright.waitForLoadState({ state: 'load', timeoutMs: 10000 });
```

## 13. 実例

### 13.1 YouTube live chat での実例

- `YTチャットをストライプにする/script.js` は `watch` ページではなく `https://www.youtube.com/live_chat?v=VIDEO_ID&is_popout=1` 側に `@match` している。
- そのため、`https://www.youtube.com/watch?v=ZAvy1UGwfVc` を開いても、そのままではデバッグ対象 URL と一致しない。
- 今回は live chat URL を直接開き、`GM_addStyle` shim を前置して `Runtime.evaluate` で注入した。
- `domSnapshot()` では `data-lcs-*` を拾えなかったが、スクリーンショットでは実際にストライプ表示を確認できた。

## 14. 注意点

- `Runtime.evaluate` の実行はページコンテキストで行われる。Tampermonkey の `GM_*` API や `@grant` 付き機能は使えない前提で確認する。
- `@match` / `@include` の一致判定も Tampermonkey 側では走らない。対象 URL を自分で開いてから注入する。
- `watch` ページに注入しても、`live_chat` 側にしか `@match` していないスクリプトは動かない。対象 URL を先に合わせる。
- `GM_addStyle` は shim で実用的に近似できる。今回の検証でも、YouTube live chat に対するストライプ表示はこの方法で確認できた。
- `GM_getValue` / `GM_setValue` / `GM_deleteValue` / `GM_listValues` は `localStorage` ベースの shim でかなり近似できるが、Tampermonkey の本物のストレージ実装とは別物だと意識する。
- `GM_xmlhttpRequest` / `GM_registerMenuCommand` / `GM_setClipboard` のような拡張依存 API は原則そのまま再現できない。これらが主機能のスクリプトは、ページ上の UI 部分と拡張権限部分を分けて考える。
- `domSnapshot()` だけでは注入結果を取りこぼすことがある。画面変化が主目的なら、最終判断はスクリーンショットを優先する。

