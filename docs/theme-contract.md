# テーマ契約

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
| `[data-marche-items]` | 商品カードの描画先 |
| `[data-marche-announcements]` | お知らせの描画先 |
| `[data-marche-announcements-status]` | お知らせの状態表示（読み込み中・エラー） |
| `[data-marche-announcements-section]` | お知らせセクション全体。**0件時にここごと隠す** |
| `[data-marche-announcements-past]` | 過去のお知らせの折りたたみ領域 |
| `.top-navigation` / `.navigation-list` / `.menu-toggle-button` | ナビゲーションと開閉 |
| `.item-filter-buttons` | フィルタボタンの置き場 |
| `.show-more-button` | 商品の続きを表示するボタン |
| `.faq-list` / `.faq-answer` | FAQの開閉 |
| `.item-popup-*` | 商品詳細ポップアップの各パーツ |
| `.shop-popup-*` | 店舗詳細ポップアップの各パーツ |

ポップアップの `*-overlay` / `*-close-button` / `*-image` / `*-name` / `*-price` /
`*-description` などは、**テーマが用意した空の器にコアが値を流し込む**構造です。
器の見た目はテーマの自由ですが、クラス名と入れ子の関係は維持してください。

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
| `item-card-top` | カード上部 |
| `item-card-shop-logo` | カード内の店ロゴ |
| `item-card-price-info` | 対価と販売日の行 |
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

### 状態・共通

| クラス | 要素 |
|---|---|
| `loading-message` | 読み込み中の表示 |
| `active-filter` | 選択中のフィルタボタン |
| `toggle-text--open` / `toggle-text--close` | 開閉ラベルの出し分け |
| `no-scroll` | `body` に付く。ポップアップ表示中のスクロール抑止 |

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
| `price-note` | `pricing.note` が空 |
| `item-sale-day` | 開催日が1日だけ（`days` が1件） |
| `[data-marche-announcements-section]` の中身 | お知らせが0件 |
| `shop-card-official-link` | 店が公式サイトを登録していない |

## 7. テーマを作るときの手順（予定）

1. `themes/default/` をコピーして名前を変える
2. CSS変数の値を差し替える
3. レイアウトCSSを調整する
4. 「2. コアが探す器」がすべて存在することを確認する
5. カテゴリIDではなく `variant` にスタイルを当てているか見直す

## 8. まだ決まっていないこと

- **フォント読み込み**をテーマ側で完結させるか、サイト設定側に置くか
- **ダークモード**への対応。現状は考慮していません
