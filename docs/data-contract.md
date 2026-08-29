# データ契約

コア（Halle）が読み書きするJSONの形式です。
ここを変えると、描画JS・エディタ・PHPの3箇所を同時に直す必要があります。

形式は [`schema/`](../schema/) のJSON Schemaが正で、この文書はその解説です。
決定の経緯は [decisions.md](decisions.md) を参照してください。

## ファイル配置

```
marche.config.json          # サイト設定(生成側とPHP側が共有)
data/
├── shops.json              # 出店者ロスター + カテゴリ定義
├── news.json               # お知らせ
└── shop-data/
    └── <店舗ID>/
        ├── data.json       # 店の情報と商品
        ├── logo.webp       # ロゴ
        └── <店舗ID>-1.webp # 商品画像
forms/
└── contact.json            # フォーム項目定義
core/i18n/
├── ja.json                 # 表示文言(日本語)
└── en.json                 # 表示文言(英語)
```

## 文字列の扱い（重要）

出店者が入力する文字列は**すべてテキストとして描画されます。**
HTMLタグは書けません。保存時にサーバー側で除去されます。

**改行は `\n` で表します。** `<br>` は使いません。

例外はお知らせの `body` だけです。これは運営しか書けないためHTML文字列を許します。

## 1. marche.config.json — サイト設定

イベント1つ分の設定です。**年度更新はこのファイルの修正でほぼ完結します。**

```json
{
  "site":    { "name": "◯◯マルシェ", "url": "https://example.com" },
  "event":   { "year": 2026, "venue": "中央公園", "hours": "10:00-17:00" },
  "days": [
    { "id": "day1", "date": "2026-10-03", "label": "10月3日(土)", "shortLabel": "3日(土)" },
    { "id": "day2", "date": "2026-10-04", "label": "10月4日(日)", "shortLabel": "4日(日)" }
  ],
  "pricing": { "mode": "currency", "currency": { "unit": "円", "position": "suffix", "grouping": true, "decimals": 0 }, "note": "税込" },
  "locale":  "ja",
  "announcements": { "source": "data/news.json", "visibleCount": 3 }
}
```

| 項目 | 内容 |
|---|---|
| `days` | 開催日。IDは `day1` / `day2` … の連番。**1件のときは販売日のUIを出力しません** |
| `pricing.mode` | `currency`（金額）または `ticket`（チケット枚数）。併用は非対応 |
| `pricing.note` | 対価の但し書き（`税込` など）。**空なら要素ごと出力しません** |
| `locale` | 表示文言の辞書。`core/i18n/<locale>.json` を読む |
| `announcements.source` | お知らせJSONのパス。**空文字にするとセクション自体を出力しません** |

## 2. shops.json — 出店者ロスターとカテゴリ定義

どの店が出店するかの一覧です。**ここに載っている店だけがサイトに表示されます。**
`shop-data/` にフォルダがあっても、ロスターに無ければ出ません。テスト用データを
本番に置いたまま公開しないための安全弁になっています。

```json
{
  "categories": [
    { "id": "breweries",  "label": "ブルワリー", "variant": "feature", "shops": ["choryo-brewery"] },
    { "id": "foodstores", "label": "フード",     "shops": ["yamato-tacos"] }
  ]
}
```

| フィールド | 必須 | 内容 |
|---|---|---|
| `id` | ○ | カテゴリID。テーマの器 `data-marche-shops="<id>"` と対応する |
| `label` | ○ | 画面に出す見出し |
| `variant` | | `standard`（既定）/ `compact` / `feature`。カードの見た目 |
| `shops` | ○ | 店舗IDの配列。順序は固定表示時（`?kotei`）の並び順 |

**カテゴリの数と名前は自由です。** 配列の順序がサイトでの表示順になります。

## 3. shop-data/&lt;店舗ID&gt;/data.json — 店の情報

出店者エディタが書き込む、各店の実データです。

```json
{
  "id": "choryo-brewery",
  "name": "CHORYO\nCraft Beer",
  "url": "https://www.choryo.jp/beer/",
  "comment": "奈良県広陵町の日本酒蔵が2021年より醸造開始。\n毎月新しいスタイルに挑戦中です。",
  "logo": "logo.webp",
  "items": [
    {
      "id": "choryo-brewery-1",
      "name": "ライスラガー",
      "category": "beer",
      "description": "奈良県産のお米を使用したラガービール。",
      "image": "choryo-brewery-1.webp",
      "price": 600,
      "status": "onsale",
      "saleDays": ["day1"]
    }
  ],
  "updatedAt": "2026-08-18T09:07:15+09:00"
}
```

### 店舗レベル

| フィールド | 必須 | 内容 |
|---|---|---|
| `id` | ○ | 店舗ID。`^[a-z0-9][a-z0-9-]*$`。フォルダ名と一致すること |
| `name` | ○ | 店名。**テキストとして描画**。改行は `\n` |
| `url` | | 公式サイト。`http://` か `https://` で始まる場合だけリンク化 |
| `comment` | | 紹介文。テキスト描画で `\n` が改行になる |
| `logo` | | ロゴのファイル名。同じフォルダ内 |
| `items` | ○ | 商品の配列 |
| `updatedAt` | ○ | 保存時刻(ISO 8601)。画像URLの `?v=` に使いキャッシュを更新する |

### 商品レベル

| フィールド | 必須 | 内容 |
|---|---|---|
| `id` | ○ | `^<店舗ID>-[0-9]+$` の形式に限る |
| `name` | ○ | 商品名。テキスト描画。改行は `\n` |
| `category` | | 商品カテゴリ。商品一覧のフィルタに使う（**出店者のカテゴリとは別物**） |
| `description` | | 説明文 |
| `image` | | 画像ファイル名 |
| `price` | | **対価**。省略と0は未設定とみなし一覧に出ない |
| `status` | | `onsale` / `soldout` / `ended`。**省略時 `onsale`** |
| `saleDays` | | 販売日IDの配列（`["day1"]`）。**省略時は全日** |
| `imagePosition` | | CSS `object-position` の値 |
| `useContain` | | `true` で `object-fit: contain` |

### price は金額とは限らない

`price` は「**対価を表す数値**」です。チケット運用のイベントではチケットの枚数が入ります。
データの形は同じで、**表示の単位だけが `pricing.mode` で変わります。**

| モード | `price: 2` | 検証 |
|---|---|---|
| `currency` | `2円` | `pricing.currency.decimals` の桁数まで |
| `ticket` | `2枚` | **整数のみ** |

`ended`（販売終了）と価格未設定の商品は一覧から消えますが、`soldout`（完売）は
完売の帯を付けて表示し続けます。来場者が「取り扱いがあるが売り切れた」ことを
知る必要があるためです。

> **実装上の注意**: `status` の値は描画JS・エディタ・受信PHP の3箇所に定義があります。
> **必ず同時に直してください。**

## 4. news.json — お知らせ

```json
[
  { "title": "開催日程が決定しました", "date": "2026-08-01", "body": "<p>今年は...</p>" }
]
```

| フィールド | 内容 |
|---|---|
| `title` | 見出し |
| `date` | `YYYY-MM-DD` と ISO日時の**両方に対応**。UTC表記でもJST基準の暦日に整形して表示 |
| `body` | **HTML文字列**（運営しか書けないため許可）。画像は相対パス（先頭 `/` なし） |

配列の順序は自由です。読み込み時に日付の降順でソートされます。
最新1件にはバッジが付き、初期状態で展開されます。
`visibleCount` を超えた古いものは「過去のお知らせ」側に折りたたまれます。

**0件のときはセクションごと非表示**になり、取得に失敗したときはエラーを表示します。

## 5. forms/contact.json — フォーム項目定義

フロントのフォーム生成とサーバー側の検証が、**この1つのJSONを共有します。**
項目を増やすときはここだけを直せば両方に反映されます。

```json
{
  "formType": "contact",
  "autoReply": false,
  "fields": [
    { "name": "email", "label": "メールアドレス", "type": "email",
      "required": true, "validation": "email", "maxLength": 254 }
  ]
}
```

通知先メールアドレスや本文テンプレートは**このJSONに入れません**。
公開ディレクトリに置かれるためです。それらはサーバー側の設定ファイルに保持します。

## サーバー側の検証ルール

受信PHPは、送られてきたデータを信用せずに検証します。

| 対象 | ルール |
|---|---|
| 店舗ID | `^[a-z0-9][a-z0-9-]*$`。パストラバーサル対策 |
| 商品ID | `^<店舗ID>-[0-9]+$`。他店のIDを名乗れない |
| **文字列項目** | **HTMLタグを除去する**（店名・商品名・紹介文・説明文） |
| 画像拡張子 | `webp` / `png` / `jpg` / `jpeg` / `gif` / `avif` のみ |
| 画像の合計サイズ | 20MB（**クライアント側の定数と一致させること**） |
| `price` | 0以上。`ticket` モードなら整数のみ |
| `status` | 定義された値以外を拒否 |
| `saleDays` | `marche.config.json` の `days[].id` に無いIDを拒否 |
| お知らせの書き込み | 合言葉（管理キー）による認証。ファイル名と保存先のパスも検証 |

上限値や許可拡張子は**サーバーとクライアントの両方に定数があります。**
片方だけ変えると、クライアントを通ったデータがサーバーで弾かれます。

## データの検証

契約どおりのデータになっているかを確認できます。外部ライブラリは不要です。

```bash
python3 tools/validate.py <サイトの公開ディレクトリ>
```

新しいイベントを立ち上げたときや、データを手で編集したあとに実行してください。
