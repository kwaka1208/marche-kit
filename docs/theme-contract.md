# テーマ仕様

コア（Halle）とテーマ（Auvent）の境界です。

- **コアの約束** — 決められたクラス名とDOM構造を出力する。見た目は決めない
- **テーマの約束** — そのクラス名にスタイルを当てる。DOM構造を前提にしたJSは書かない

この2つを守る限り、テーマを丸ごと入れ替えてもサイトは動きます。

## 1. デザイントークン（CSS変数）

テーマが定義すべき変数です。**すべてに値を与えてください。**

### 配色

| 変数 | 用途 |
|---|---|
| `--primary-color` | 基調色。ボタン、リンク、アクセント |
| `--primary-color-dark` | ホバー時など、基調色より暗い状態 |
| `--primary-color-light` | 淡いアクセント、選択状態の背景 |
| `--error-color` | エラー表示、完売の帯 |
| `--text-color-dark` | 本文と見出し |
| `--text-color-light` | 補足文、キャプション |
| `--white` | カードなどの前面の背景 |
| `--gray-light` / `--gray-medium` / `--gray-dark` | 入力欄の背景、罫線、無効状態 |

### 文字

| 変数 | 用途 |
|---|---|
| `--font-family-main` | 全体のフォントスタック |
| `--font-size-base` / `--font-size-small` / `--font-size-large` | 基準・補足・強調のサイズ |

### 余白・形

| 変数 | 用途 |
|---|---|
| `--spacing-xs` 〜 `--spacing-xl` | 余白の段階（xs / small / medium / large / xl の5段） |
| `--border-radius-small` / `--border-radius-medium` / `--border-radius-pill` | 角丸 |
| `--shadow-soft` / `--shadow-medium` | 影 |
| `--grid-gap` | グリッドの間隔 |

### レイアウト

| 変数 | 用途 |
|---|---|
| `--max-content-width` | コンテンツの最大幅 |
| `--bottom-nav-height` | 下部ナビの高さ。本文の下余白の確保に使う |
| `--item-card-min-height` | 商品カードの最低高さ |

装飾用の背景SVGなど、テーマ固有の変数を追加するのは自由です。
**上記の変数を削ることだけが禁止です。**

## 2. コアが探す器

**テーマのHTMLに用意してください。** 無いと該当機能が動きません。

### 出店者グリッド

カテゴリごとに器を1つ置きます。属性値は `shops.json` のカテゴリIDです。

```html
<div class="shop-grid" data-marche-shops="breweries"></div>
<div class="shop-grid" data-marche-shops="foodstores"></div>
```

**カテゴリを増やすときはこの1行を足すだけです。** コアの変更は要りません。

### そのほかの器

| セレクタ | 役割 |
|---|---|
| `[data-marche-items]` | 商品カードの描画先。**段組みはgridで書くこと**（下の注記） |
| `[data-marche-announcements]` | お知らせの描画先 |
| `[data-marche-announcements-status]` | お知らせの状態表示（読み込み中・エラー） |
| `[data-marche-announcements-section]` | お知らせセクション全体。**0件時にここごと隠す** |
| `[data-marche-announcements-past]` | 過去のお知らせの折りたたみ領域 |
| `[data-marche-face-value]` | チケット1枚の額面の案内。金額運用では隠される |
| `[data-marche-social]` | イベント公式SNSのリンクの置き場。**中身はコアが作る。** ページ内にいくつ置いてもよい（ヘッダーとフッターの両方など） |
| `[data-marche-form="<種別>"]` | 問い合わせフォームの置き場。**中身はコアが作る**（`forms/<種別>.json` から） |
| `[data-marche-form-section]` | フォームのセクション全体。**定義が読めないときここごと隠す** |
| `.top-navigation` / `.navigation-list` / `.menu-toggle-button` | ナビゲーションと開閉 |
| `.item-filter-buttons` | フィルタボタンの置き場。**中身はコアが作る** |
| `.show-more-button` | 商品の続きを表示するボタン |
| `.announcements-toggle-button` | 過去のお知らせを開くボタン |
| `.faq-list` / `.faq-item` / `.faq-question` / `.faq-answer` | FAQの開閉 |
| `.item-popup-*` | 商品詳細ポップアップの各パーツ |
| `.shop-popup-*` | 店舗詳細ポップアップの各パーツ |

ポップアップの中身の器は次の名前です。**要らないものは器ごと消して構いません。**
コアは器のあるものだけを埋めます。

| 商品ポップアップ | 店舗ポップアップ |
|---|---|
| `.item-popup-overlay` / `.item-popup-close-button` | `.shop-popup-overlay` / `.shop-popup-close-button` |
| `.item-popup-image` / `.item-popup-name` | `.shop-popup-logo` / `.shop-popup-name` |
| `.item-popup-shop-name` / `.item-popup-description` | `.shop-popup-link` / `.shop-popup-comment` |
| `.item-popup-price` / `.item-popup-sale-day` / `.item-popup-sold-out` | `.shop-popup-items`（取り扱い一覧） |
| `.item-popup-other-items` / `.item-popup-other-items-list` | |

### 商品グリッドはgridで組む

**折りたたみ時に何件描くかは、コアが `grid-template-columns` を読んで決めます。**
列数 × 3行が最初に見える件数です。flexなど他の方法で段組みすると列数を読めず、
1行分しか描かれません。

### 隠すのは `hidden` 属性

条件に合わない要素を、コアは `hidden` 属性で隠します。
**テーマがその要素に `display` を指定すると `hidden` が効かなくなります。**

そのため、テーマは次の1行を**無条件で**書いてください。

```css
[hidden] { display: none !important; }
```

「`display` を当てた要素にだけ書けばよい」と考えると、いずれ漏れます。
`.shop-popup-link` を `inline-block` にする、`.item-popup-sale-day` を `flex` にする——
そうした変更は後から入り、**URLを登録していない店のポップアップだけが壊れます。**
最初に1行書いておけば起きません。

### テーマが用意する仕掛け

**器とクラス名だけでは動きません。**
開閉するものについて、コアがするのは状態クラスの付け外しだけです。
**見せる・隠すの判断はテーマのCSSが持ちます。**
次の7つは、書かないと機能そのものが動きません。

| 仕掛け | コアがすること | 無いとどうなるか |
|---|---|---|
| ポップアップ | `*-overlay` に `active` を付け外し | 常に開いたまま見える |
| `hidden` 属性 | 条件に合わない要素に付ける | 隠れない（`display` を当てた要素が出たとたんに） |
| FAQ | `.faq-item` に `active` を付け外し | 答えが開いたまま |
| 過去のお知らせ | 折りたたみ領域に `is-expanded` を付け外し | 過去分が最初から見えている |
| スクロール抑止 | `body` に `no-scroll` を付け外し | ポップアップの背後が動く |
| 商品グリッド | `grid-template-columns` を読む | 折りたたみが1行分しか描かれない |
| ハニーポット | `.courier-honeypot` を出力する | **来場者の問い合わせが黙って捨てられる**（下記） |

ハニーポットだけは性質が違います。他の6つは「見た目が崩れる」で済みますが、
これは**書き忘れると実害が出ます。** コアはおとり欄に値が入っていたらボットとみなし、
送信せずに完了したように見せます。画面に出したままだと来場者が親切に入力し、
**その問い合わせは届きません。**

```css
/* display: none にしないこと。それを見分けて避けるボットがいる */
.courier-honeypot {
    position: absolute;
    left: -9999px;
    width: 1px;
    height: 1px;
    overflow: hidden;
}
```

最小形は次のとおりです。**これは見た目ではなく機構です。**

```css
[hidden] { display: none !important; }

.item-popup-overlay,
.shop-popup-overlay { display: none; }
.item-popup-overlay.active,
.shop-popup-overlay.active { display: block; }

body.no-scroll { overflow: hidden; }

.faq-answer { display: none; }
.faq-item.active .faq-answer { display: block; }

[data-marche-announcements-past] { display: none; }
[data-marche-announcements-past].is-expanded { display: block; }

[data-marche-items] { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
```

そのまま動くものが [`examples/demo/mechanics.css`](../examples/demo/mechanics.css) にあります。
デモはテーマを当てずにこの1枚だけで動いているので、**テーマの下限**がそこに見えます。

スマートフォンのメニューを畳むテーマでは、`.navigation-list` の `open`
（と `.menu-toggle-button` の `active`、`.top-navigation` の `menu-open`）にも
同じ関係があります。畳まないテーマでは要りません。
**畳まないなら `.menu-toggle-button` の器ごと消して構いません**（器の無い機能は動かないだけです）。

ポップアップの `*-overlay` / `*-close-button` / `*-image` / `*-name` / `*-price` /
`*-description` などは、**テーマが用意した空の器にコアが値を流し込む**構造です。
器の見た目はテーマの自由ですが、クラス名と入れ子の関係は維持してください。

### ナビゲーションはどこに固定してもよい

`.top-navigation` を画面の上に固定するか、下に固定するか、固定しないかはテーマが決めます（[決定11](decisions.md)）。
コアはページ内リンクの着地を補正しますが、**上端に貼り付いているナビの高さだけを差し引きます。**
下に固定したナビは移動先を隠さないため、差し引きません。

`scrolled`（上端から離れると `.top-navigation` に付く）は、上に固定したテーマのための手がかりです。
下に固定するテーマでは意味がないので、当てなくて構いません。

下に固定するときは、本文の末尾がナビに隠れないよう `--bottom-nav-height` を
実際の高さにして `body` の下余白に使ってください（既定テーマはこの値が `0px` です）。

## 3. コアが出力するクラス名

**テーマ側で改名できません。** スタイルはこの名前に当ててください。

### 出店者カード

| クラス | 要素 |
|---|---|
| `shop-card-info` | カード本体 |
| `shop-card--<variant>` | 見た目のバリエーション（`standard` / `compact` / `feature`） |
| `shop-logo` | ロゴ画像 |
| `shop-name` | 店名（見出し） |
| `shop-card-official-link` | 公式サイトへのリンク |

カード本体には `data-category="<カテゴリID>"` も付きます。使い分けは次節を参照してください。

### 商品カード

| クラス | 要素 |
|---|---|
| `item-card` | カード本体。完売の商品には `is-sold-out` も付く |
| `item-card-top` | カード上部 |
| `item-card-shop-logo` | カード内の店ロゴ |
| `item-card-price-info` | 対価と販売日の行 |
| `item-price` | 対価の3要素（数値・単位・但し書き）を包む |
| `price-value` | **対価の数値のみ**（`600` / `2`） |
| `price-unit` | **単位のみ**（`円` / `枚`） |
| `price-note` | 但し書き（`税込` など）。設定に文言が無ければ**要素ごと出力されない** |
| `item-image-wrapper` / `item-image` | 商品画像とその枠 |
| `item-text-content` | テキスト領域 |
| `item-name` | 商品名 |
| `item-shop-name` | 商品カードに出す店名 |
| `item-detail-button` | 詳細を開くボタン |
| `item-sold-out-badge` | 完売の帯 |
| `item-sale-day` | 販売日の表記。**開催が1日だけなら出力されない** |

商品カード本体には、商品カテゴリがあれば `data-category="<カテゴリID>"` も付きます。
使い分けは出店者カードと同じで、**カテゴリIDに直接スタイルを当てないのが基本**です。

カードの中身は、**この順で出力されます。**

```
.item-card
├── .item-card-top          … 店ロゴと対価
├── .item-image-wrapper     … 商品画像（完売の帯もこの中）
└── .item-text-content      … 商品名・店名・詳細ボタン
```

段を積むだけのテーマは順序を気にせずに済みます。
**画像をカード全面に敷いて文字を重ねるテーマは、`z-index` を明示してください。**
画像は上段より後に出力されるため、`position` を与えただけでは上段が画像の下に隠れます
（`themes/night-market/` がこの作りです）。

### 商品のサムネイル

店舗ポップアップの取り扱い一覧と、商品ポップアップの「他の商品」で使う小さなカードです。

| クラス | 要素 |
|---|---|
| `item-thumb` | サムネイル本体 |
| `item-thumb-image` | 画像 |
| `item-thumb-name` | 商品名 |

完売の帯（`item-sold-out-badge`）と販売日（`item-sale-day`）は、カードと同じ名前で入ります。

### イベント公式のSNS

`marche.config.json` の `site.social` から、コアが `[data-marche-social]` の中にリンクを並べます。

| クラス | 要素 |
|---|---|
| `social-link` | リンク1件（`<a>`） |
| `social-link--<platform>` | プラットフォームごとの見た目（`social-link--x` など） |
| `social-link-label` | 表記（`X` / `Instagram` …）を包む要素 |

```html
<a class="social-link social-link--x" data-platform="x" href="…"
   target="_blank" rel="noopener noreferrer" title="X">
  <span class="social-link-label">X</span>
</a>
```

**アイコンはテーマの持ち物です**（決定12）。代替画像（`images/noimage/`）と同じ扱いで、
コアはリンクとクラス名しか出しません。既定テーマは表記をそのまま出しますが、
アイコンにするテーマは画像を敷いてラベルを読み上げ用に残してください。

```css
.social-link--x {
  background: url("../images/social/x.svg") center / 60% no-repeat;
}
/* display: none にすると読み上げからも消える。位置をずらして残す */
.social-link--x .social-link-label {
  position: absolute;
  width: 1px; height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
```

**プラットフォームの種類は増えます。** `data-platform` を持たない未知のIDでも
リンクは出るので、アイコンを用意していないIDでも表記が読める形にしておくと安全です
（`social-link` 側に文字の見え方を、`social-link--<platform>` 側に画像を書く）。

### お知らせ

| クラス | 要素 |
|---|---|
| `announcement` | 1件。`<details>` 要素。**開閉はブラウザ任せでJSは要らない** |
| `announcement--latest` | 最新の1件。初期状態で開いている |
| `announcement-summary` | 見出しの行（`<summary>`） |
| `announcement-date` | 日付 |
| `announcement-badge-new` | 最新の1件に付くバッジ |
| `announcement-title` | 見出し |
| `announcement-toggle` | 開閉ラベルの置き場。中に `toggle-text--open` / `--close` が入る |
| `announcement-body` | 本文。**ここだけHTMLが入る**（運営しか書けないため） |

### 問い合わせフォーム

**クラス名とCSS変数は [astro-courier](https://github.com/kwaka1208/astro-courier) の
Courier と同じです**（決定13）。上流のCSSをそのまま持ってこられるようにするためで、
`courier-` の接頭辞はテーマ側で改名しないでください。

| クラス | 要素 |
|---|---|
| `courier` | 器そのもの。**CSS変数はここに置く** |
| `courier-form` | `<form>` |
| `courier-field` | 1項目のまとまり |
| `courier-label` | ラベル。`radio` / `checkbox` では `<span>` になる |
| `courier-required` | 必須の印 |
| `courier-desc` | 補足テキスト（`description`） |
| `courier-field-error` | 項目ごとのエラー。**エラーが無いときは `hidden`** |
| `courier-options` / `courier-option` | 選択肢群と1つぶん |
| `courier-consent` | 単一の同意チェック |
| `courier-honeypot` | おとり欄。**必ず画面外に置くこと**（上記） |
| `courier-error` | 送信全体のエラー |
| `courier-submit` | 「内容を確認する」ボタン |
| `courier-success` | 送信後の完了表示 |
| `courier-mock-notice` | モックモードの断り書き |
| `courier-modal` / `__backdrop` / `__panel` / `__heading` / `__preview` / `__actions` / `__cancel` / `__confirm` | 確認モーダル |
| `courier-preview-row` / `courier-preview-value` / `courier-preview-empty` | 確認内容の1行 |

不正な入力欄には `aria-invalid="true"` が付きます。**枠の色はこれに当ててください。**
コアは `:invalid` を使いません（ブラウザ既定の検証メッセージだと辞書の言語と食い違うため）。

上書きできるCSS変数は次のとおりです。`.courier` に置きます。

| 変数 | 用途 |
|---|---|
| `--courier-accent` / `--courier-accent-contrast` | 送信ボタンの地色と、その上の文字色 |
| `--courier-text` / `--courier-muted` | 本文と補足の文字色 |
| `--courier-border` / `--courier-bg` | 枠線と入力欄の地色 |
| `--courier-error` | エラーの色 |
| `--courier-radius` / `--courier-gap` / `--courier-max-width` | 角丸・項目の間隔・フォームの最大幅 |

### 状態・共通

コアが付け外しするクラスです。**上の7つ以外は、当てなくても機能は動きます**
（見た目の手がかりとして使ってください）。

| クラス | 要素 | 当てないと |
|---|---|---|
| `loading-message` | 読み込み中・エラーの表示 | 素のまま出る |
| `active-filter` | 選択中のフィルタボタン | どれを選んでいるか分からない |
| `toggle-text--open` / `toggle-text--close` | 開閉ラベルの出し分け | 両方の文言が出る |
| `is-sold-out` | 完売の商品カード | 帯（`item-sold-out-badge`）だけで示される |
| `is-collapsed` | 折りたたみ中の商品グリッド | 何も起きない（件数の制御はコアがする） |
| `scrolled` | 上端から離れたときの `.top-navigation` | 何も起きない |
| `active` | 現在位置の `.navigation-item` | 現在位置が分からない |

**機能が動くために必要なもの**（`active` / `is-expanded` / `no-scroll` / `open`）は、
[テーマが用意する仕掛け](#テーマが用意する仕掛け)を参照してください。

## 4. カテゴリごとに見た目を変える

コアはカードに**2つの手がかり**を出力します。

```html
<div class="shop-card-info shop-card--feature" data-category="breweries">
```

| 手段 | 用途 | テーマの使い回し |
|---|---|---|
| `shop-card--<variant>` | **こちらを主に使う** | ○ 他イベントでも当たる |
| `[data-category="..."]` | このイベント専用の微調整 | ✗ カテゴリ名が変わると当たらない |

```css
/* 推奨: variant に当てる。どのイベントでも通用する */
.shop-card--feature { ... }

/* 逃げ道: このイベント専用。他イベントに持っていくと当たらない */
[data-category="breweries"] .shop-logo { ... }
```

`breweries` のようなカテゴリIDは**イベント固有**です。テーマがそれを直接知ると、
そのテーマは他のイベントで使えなくなります。**`variant` だけを見て書くのが基本です。**

## 5. 対価の表示

数値と単位を**別の要素に分けて出力します。**

```html
<span class="price-value">600</span><span class="price-unit">円</span>
```

分ける理由は2つあります。

1. **チケット運用に対応するため** — 同じ `price: 2` が「2円」にも「2枚」にもなります。
   単位はサイト設定から来るので、コアが文字列として埋め込んではいけません
2. **単位を小さく表示するデザインが多いため** — 数値と単位が同じ要素だと、
   テーマ側で `円` だけフォントサイズを落とすことができません

但し書き（`税込` など）も `price-note` として分けます。
チケット運用では税の概念がないため、**設定に文言が無ければ要素ごと出力しません。**
テーマは `price-note` が存在しない場合を想定してスタイルを書いてください。

## 6. 出力されない場合がある要素

条件によってコアが**要素ごと出力しない**ものがあります。
テーマは「無い状態」でレイアウトが崩れないようにしてください。

| 要素 | 出力されない条件 |
|---|---|
| `price-note` | `pricing.note` が空。**商品カードと詳細の両方に出ます** |
| `price-unit` | 単位の設定が空 |
| `item-sale-day` | 開催日が1日だけ（`days` が1件）、または全日販売の商品 |
| `item-sold-out-badge` | 販売中の商品 |
| `filter-button` | `itemCategories` が未定義（1つも作られない） |
| `[data-marche-announcements-section]` | お知らせが0件、または `announcements.source` が空 |
| `[data-marche-face-value]` | 金額運用、または `ticket.showFaceValue` が偽 |
| `[data-marche-social]` | `site.social` が未定義・空、または `http(s)` で始まるURLが1件も無い（**器ごと `hidden`**） |
| `[data-marche-form-section]` | `forms/<種別>.json` が読めない（**セクションごと `hidden`**）。器を包んでいないときは器だけが隠れ、**見出しが残ります** |
| `courier-desc` | その項目に `description` が無い |
| `courier-required` | その項目が必須でない |
| `shop-card-official-link` | 店が公式サイトを登録していない |
| `shop-popup-link` / `shop-popup-comment` | 店がURL・紹介文を登録していない（`hidden`） |

## 7. テーマ側の演出

コアはカードを描き終えるたびに `marche:rendered` を `document` へ投げます。
`detail.section` は `'shops'` / `'items'` / `'social'` のいずれかです。

```js
document.addEventListener('marche:rendered', (e) => {
  if (e.detail.section === 'items') { /* あとから増えたカードにも効果をかけ直す */ }
});
```

スクロール連動などの演出はテーマの領分です。ただし**データの描画には触れないでください。**
既定テーマは演出を持たないため、このJSも置いていません。

## 8. 表示順の固定

**`?fixed` を付けたURLでは、店舗と商品の並びがデータ順のまま出ます。**
通常のアクセスでは読み込みのたびにシャッフルされるため、
表示の確認をするときはこれを使ってください。

## 9. テーマを作るときの手順

1. `themes/default/` をコピーして名前を変える
2. `tokens.css` の変数の値を差し替える
3. `layout.css` のレイアウトを調整する（**商品グリッドはgridのまま**）
4. 「2. コアが探す器」がすべて存在することを確認する
5. カテゴリIDではなく `variant` にスタイルを当てているか見直す
6. `?fixed` を付けて、条件によって出ない要素（`price-note`・`item-sale-day`）が
   無くても崩れないか確かめる

## 10. まだ決まっていないこと

- **フォント読み込み**をテーマ側で完結させるか、サイト設定側に置くか
- **ダークモード**への対応。暗い配色のテーマは作れますが（`themes/night-market/`）、
  1つのテーマが明暗を切り替える仕組みは持っていません
- **トークンの名前が色を名指ししている**こと。`--white` の役割は「前面の背景」、
  `--gray-light` は「沈んだ面」で、暗い配色ではその名前どおりの色が入りません。
  名前は仕様なので変えられず、値のほうを役割に合わせる形になっています
- **イベント名・会期・会場を出す器**がありません。`marche.config.json` に
  `site.name` や `days` がありますが、コアはこれを描画しないため、
  テーマのHTMLに直接書くことになります（テーマがイベント固有の記述を持つ唯一の場所です）。
  SNSのリンクだけは器（`[data-marche-social]`）を持ちます。**リンク先が運用中に変わり、
  テーマを触らずに直せる必要があるため**です（決定12）。同じ理由が当てはまる項目が
  他にもあるなら、器を足す形になります
