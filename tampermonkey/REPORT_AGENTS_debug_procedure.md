# AGENTS.md デバッグ手順検証レポート

## 1. 概要

このレポートは、[AGENTS.md](G:/バイブコード/github/AGENTS.md) に書かれている「Tampermonkey 拡張を直接操作できないため、Codex の in-app browser に `script.js` を直接注入して検証する」というデバッグ手順を、2026-05-06 時点のこの環境で確認した結果をまとめたものです。

結論を先に書くと、**基本方針は妥当**です。  
一方で、`AGENTS.md` の手順 4 にある低レベル RPC 経由の fallback は、**その場に既に低レベルフックがあることを前提にしており、手順単体では再現性が少し弱い**です。

この文書では、技術的な説明と、非エンジニア向けの言い換えを並べて説明します。

## 2. 結論サマリー

- Tampermonkey 拡張そのものは MCP から操作できないため、通常の「拡張に登録してそのまま動かす」確認経路は使えません。
- Browser skill の公開 API では、DOM の観察、スクリーンショット取得、クリックや入力などの操作はできますが、**ページに任意の JavaScript を直接流し込む公開 API は見当たりません**。
- そのため、ページ上で `script.js` の本体をその場で実行したい場合、**CDP の `Runtime.evaluate`** まで降りるのは理にかなっています。
- ただし、`globalThis.__iabRpc` / `globalThis.__iabPipe` はこのセッションでは自動では存在しませんでした。したがって、`AGENTS.md` の fallback 部分は「毎回そのまま使える完成済み手順」ではなく、「過去の会話で低レベル経路が用意済みなら使える補助手順」と読むのが正確です。
- さらに今回の検証では、**sandbox の内側からは browser-use の named pipe に接続できず、sandbox の外側では接続できました**。つまり、低レベル fallback は「コード例があるかどうか」だけでなく、「その実行コンテキストが pipe へ到達できるか」にも依存します。

## 3. デフォルト経路で詰まる理由

### 3.1 何が原因で詰まるのか

原因は、**MCP から見えている操作面が Tampermonkey 拡張の内部まで届いていない**ことです。

技術的には、今回使えるのは主に次の層です。

- Node REPL
- Browser skill の `agent.browser.*`
- in-app browser のタブ操作
- `tab.playwright.*` / `tab.dev.logs(...)` / `tab.cua.*`

しかし、これらは **ブラウザタブやページの操作 API** であり、**Tampermonkey 拡張の管理画面や、拡張が内部で行う UserScript の注入処理そのものを制御する API ではありません**。

非エンジニア向けに言うと、これは「Web ページの中を見るリモコン」は渡されているが、「ブラウザ拡張の裏側を操作する管理者キー」は渡されていない、という状態です。

### 3.2 デフォルトの状態で何ができるか

この環境では、以下は実際に成立しました。

- `nodeRepl.requestMeta['x-codex-turn-metadata']` の取得
- `browser-client.mjs` の存在確認
- `setupAtlasRuntime({ globals: globalThis, backend: 'iab' })` の実行
- `agent.browser.tabs.selected()` による現在タブ取得
- `tab.playwright.domSnapshot()` 利用可能
- `tab.playwright.screenshot()` 利用可能
- `tab.dev.logs(...)` 利用可能

つまり、**観察と通常操作はできる**、ということです。

非エンジニア向けに言うと、「画面を見る」「ボタンを押す」「画面の状態を読む」はできるが、「拡張機能の中で何が動くかを強制的に差し替える」はそのままではできません。

### 3.3 デフォルトの状態で何ができないか

Browser skill の公開 API 一覧を確認した限り、`tab.playwright` にも `agent.browser` にも、**Playwright の `evaluate` に相当する公開メソッドがありません**。  
つまり、ページコンテキストで任意の JavaScript を直接評価する、という経路が表に出ていません。

ここでいう「ページコンテキスト」とは、実際にその Web ページが動いている JavaScript 実行空間のことです。  
`script.js` を Tampermonkey なしでテストしたいなら、最終的にはその空間でコードを実行する必要があります。

非エンジニア向けには、「ページの中でスクリプトを走らせたいのに、そのための再生ボタンが標準リモコンには付いていない」ということです。

## 4. 迂回策の仕組み

### 4.1 なぜ迂回策が必要なのか

Tampermonkey の通常ルートが閉じていて、公開 Browser API にも任意スクリプト注入機能がないため、**より下の層へ降りてブラウザに直接命令する**必要があります。

このとき使うのが **CDP (Chrome DevTools Protocol)** です。  
CDP は、Chrome 系ブラウザに対して、開発者ツールが使うのと同種の命令を送るためのプロトコルです。

非エンジニア向けには、「正面玄関が閉じているので、建物の管理用通路から中の装置に直接指示を出す」イメージです。

### 4.2 `Runtime.evaluate` は何をしているか

CDP の `Runtime.evaluate` は、**指定した JavaScript 文字列を、そのページの実行環境でそのまま実行する命令**です。

今回の用途では、`script.js` から UserScript ヘッダを除いた本体を文字列として作り、その文字列を `Runtime.evaluate` に渡してページ内で実行します。

これは Tampermonkey 拡張を経由した注入ではなく、**ページへ直接コードを流し込む手動注入**です。

非エンジニア向けには、「本来は自動配達で部屋に届くはずの荷物を、配達員を通さず自分で部屋まで持って行く」やり方です。

### 4.3 なぜヘッダを外すのか

UserScript ヘッダはコメントなので、そのままでも JavaScript として壊れないことは多いです。  
ただし、デバッグでは「実際に動く本体だけ」を実行したほうが、問題が起きたときの切り分けがしやすくなります。

これは「説明書きやラベルを剥がして、中身だけ動かして確認する」と考えるとわかりやすいです。

### 4.4 この迂回策で再現できないもの

`Runtime.evaluate` による直接注入は便利ですが、**Tampermonkey そのものの再現ではありません**。そのため、少なくとも以下は自動では再現されません。

- `GM_*` API
- `@grant` に依存する権限
- `@match` / `@include` による URL 一致判定
- Tampermonkey 固有の注入タイミングやサンドボックス差異

技術的には、**拡張が提供する実行環境をバイパスしている**からです。  
非エンジニア向けには、「本番と同じ舞台装置は使わず、演者だけ同じ部屋に立たせて動きを見る」状態です。

### 4.5 sandbox は何に影響したか

今回の検証では、CDP 直叩きそのものより前に、**その CDP 経路へ到達するための OS レベルの接続制約** に引っかかりました。

具体的には、browser-use の低レベル経路は Windows の named pipe (`codex-browser-use-*`) を通っていました。  
ところが、sandbox 内の Node REPL からこの pipe に接続しようとすると `EPERM` が返り、sandbox 内の PowerShell から `NamedPipeClientStream` を使っても access denied になりました。

一方で、sandbox 外に権限を上げた PowerShell では同じ pipe に接続でき、`getTabs`、`attach`、`executeCdp` を実行できました。

技術的に言うと、問題は JavaScript の書き方ではなく、**実行プロセスに付与されている OS レベルのアクセス権** にありました。  
非エンジニア向けには、「裏口そのものは存在したが、普通の入館証ではその扉が開かず、管理権限付きの通行証が必要だった」という話です。

## 5. `AGENTS.md` 手順の検証結果

### 5.1 確認できた事実

2026-05-06 時点のこの環境で、次を確認しました。

- `nodeRepl.requestMeta['x-codex-turn-metadata']` は取得できる
- `C:/Users/koei0/.codex/plugins/cache/openai-bundled/browser-use/0.1.0-alpha1/scripts/browser-client.mjs` は存在する
- `setupAtlasRuntime({ globals: globalThis, backend: 'iab' })` は成立する
- `agent.browser.tabs.selected()` は成立する
- 取得した `tab` に対して `tab.playwright.domSnapshot()` / `tab.playwright.screenshot()` / `tab.dev.logs(...)` は利用可能

したがって、`AGENTS.md` の手順 1, 2, 5, 6 の大筋は、現環境と整合しています。

### 5.2 公開 API だけでは注入手段が見当たらない

Browser skill の公開 API を読む限り、`evaluate` 相当の公開インターフェースは見当たりませんでした。  
このため、`AGENTS.md` の「通常 API だけで注入できない場合」という書き方は、やや控えめです。

より正確に書くなら、次のようになります。

> 少なくとも公開されている Browser API の範囲では、ページへ任意 JavaScript を注入する手段は確認できないため、必要に応じて CDP `Runtime.evaluate` のような低レベル経路を使う。

### 5.3 fallback の弱い点

`AGENTS.md` では、fallback として `globalThis.__iabRpc` / `globalThis.__iabPipe` を使う例が示されています。  
しかし今回のセッションでは、Browser skill の通常初期化後でも **これらは自動では存在しませんでした**。

確認結果:

- `typeof globalThis.__iabRpc === 'function'` は `false`
- `typeof globalThis.__iabPipe === 'string'` は `false`
- sandbox 内の Node REPL から named pipe 接続を試みると `EPERM`
- sandbox 内の PowerShell から `NamedPipeClientStream` を試みると access denied
- sandbox 外の PowerShell では named pipe 接続と `getTabs` / `attach` / `executeCdp` が成立

このため、手順 4 は「そのまま毎回コピペで動く既定手順」ではなく、**低レベル RPC の足場が別途あるセッションで使える補助手順**です。

非エンジニア向けには、「管理通路を使う方法は書いてあるが、通路の鍵が最初から配られているとは限らない」という状態です。

### 5.4 総合評価

- 技術的評価: 方針自体は妥当
- 運用評価: fallback の再現性は弱く、補足説明が必要
- sandbox 評価: 低レベル fallback は sandbox 制約の影響を強く受けるため、「コード例がある」だけでは足りず、「どの実行経路なら pipe に届くか」まで手順書に書いたほうがよい

つまり、**考え方は正しいが、手順書としては一部が“この会話ではたまたま使えた裏口”に依存している**、というのが実態です。

## 6. 制約・注意点

### 6.1 直接注入は Tampermonkey 完全再現ではない

前述の通り、`Runtime.evaluate` はページでコードを実行できますが、Tampermonkey の権限モデルや実行文脈までは持ち込みません。  
そのため、`@grant none` に近いスクリプトの UI 挙動確認には向いていても、`GM_*` 依存が強いスクリプトでは検証精度が下がります。

### 6.2 SPA では状態の残留に注意が必要

YouTube のような SPA では、同じページに古い UI 状態やイベントハンドラが残ることがあります。  
そのため、修正後に `tab.reload()` してから再注入する、という `AGENTS.md` の注意は合理的です。

非エンジニア向けには、「前回の試験で置いた部品がまだ残っているかもしれないので、一度机を片付けてから再テストする」必要があります。

### 6.3 セッション依存情報は毎回取り直す必要がある

`nodeRepl.requestMeta['x-codex-turn-metadata']` に含まれる `session_id` / `turn_id` はターンごとに変わり得るため、実行直前に取得する、という注意は妥当です。

これは「その場限りの通行証番号は、毎回新しいものを確認する必要がある」という意味です。

### 6.4 sandbox の内外で成功条件が変わる

今回の実地確認では、同じ named pipe 接続でも「sandbox の内側では失敗し、外側では成功する」という差がありました。  
したがって、低レベル fallback を使う手順は、単に API の呼び方を説明するだけでは不十分で、**どの実行コンテキストなら OS レベルの接続が通るか** までセットで書く必要があります。

これは非エンジニア向けには、「同じ鍵穴でも、建物の外から持っている鍵と、管理室から持ってくる鍵では開くかどうかが違った」という話です。

## 7. 非エンジニア向け要約

今回の話をできるだけ簡単に言うと、こうです。

- Codex は Web ページの中を見ることや、画面を操作することはできる
- でも Tampermonkey 拡張の内部までは、そのままでは触れない
- だから「Tampermonkey に登録して自然に動かす」確認はできない
- 代わりに、ブラウザの開発者向けの裏口を使って、`script.js` の中身をページへ直接流し込んでテストする

これは、たとえば次のようなイメージです。

- 通常ルート: 正面玄関から入って、受付を通して部屋に入る
- 今回の制約: 受付のシステムには触れられない
- 迂回策: 管理通路から部屋へ入って、中で装置だけ動かしてみる

この方法は、**「ページ上でこのコードがどう動くか」を確かめるにはかなり有効**です。  
ただし、**Tampermonkey という受付システムそのものの挙動までは完全には再現していない**ので、そこは割り切って使う必要があります。

## 付録: 今回の検証で確認した主な事実

- 日付: 2026-05-06
- 対象環境: Codex desktop / bundled `browser-use` plugin / `iab` backend
- `browser-client.mjs` は存在した
- `setupAtlasRuntime({ globals: globalThis, backend: 'iab' })` は成功した
- `agent.browser.tabs.selected()` でタブを取得できた
- `tab.playwright.domSnapshot()` / `tab.playwright.screenshot()` / `tab.dev.logs(...)` は利用可能だった
- 公開 API には `evaluate` 相当が見当たらなかった
- `globalThis.__iabRpc` / `globalThis.__iabPipe` は自動では生えていなかった
- sandbox 内の Node REPL から browser-use named pipe へは `EPERM` で接続できなかった
- sandbox 内の PowerShell から `NamedPipeClientStream` を使っても access denied だった
- sandbox 外の PowerShell では browser-use named pipe に接続でき、`getTabs` / `attach` / `executeCdp` が成功した
