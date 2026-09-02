# データ仕様

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
i18n/
├── ja.json                 # 表示文言(日本語)  ← core/i18n/ の中身
└── en.json                 # 表示文言(英語)
```

PHPとエディタは公開ディレクトリ直下の `i18n/` を読みます。
見つからなければ `core/i18n/` も探すので、リポジトリの構成のまま配置しても動きます。

## 文字列の扱い（重要）

出店者が入力する文字列は**すべてテキストとして描画されます。**
HTMLタグは書けません。保存時にサーバー側で除去されます。

**改行は `\n` で表します。** `<br>` は使いません。

例外はお知らせの `body` だけです。これは運営しか書けないためHTML文字列を許します。

## 1. marche.config.json — サイト設定

イベント1つ分の設定です。**年度更新はこのファイルの修正でほぼ完結します。**

```json
{
  "site": {
    "name": "◯◯マルシェ",
    "url": "https://example.com",
    "social": [
      { "platform": "x",         "url": "https://x.com/example" },
      { "platform": "instagram", "url": "https://www.instagram.com/example/" },
      { "platform": "youtube",   "url": "https://www.youtube.com/@example", "label": "公式チャンネル" }
    ]
  },
  "event":   { "year": 2026, "venue": "中央公園", "hours": "10:00-17:00" },
  "days": [
    { "id": "day1", "date": "2026-10-03", "label": "10月3日(土)", "shortLabel": "3日(土)" },
    { "id": "day2", "date": "2026-10-04", "label": "10月4日(日)", "shortLabel": "4日(日)" }
  ],
  "pricing": { "mode": "currency", "currency": { "unit": "円", "position": "suffix", "grouping": true, "decimals": 0 }, "note": "税込" },
  "locale":  "ja",
  "items": { "display": "list" },
  "itemCategories": [
    { "id": "beer", "label": "ビール" },
    { "id": "food", "label": "フード" }
  ],
  "announcements": { "source": "data/news.json", "visibleCount": 3 },
  "forms": { "endpoint": "data/send.php" }
}
```

| 項目 | 内容 |
|---|---|
| `days` | 開催日。IDは `day1` / `day2` … の連番。**1件のときは販売日のUIを出力しません** |
| `pricing.mode` | `currency`（金額）または `ticket`（チケット枚数）。併用は非対応 |
| `pricing.note` | 対価の但し書き（`税込` など）。**空なら要素ごと出力しません** |
| `locale` | 表示文言の辞書。`core/i18n/<locale>.json` を読む |
| `timezone` | 日付の解釈と表示に使うタイムゾーン（`Asia/Tokyo` など）。省略時はサーバー/ブラウザの既定 |
| `items.display` | 商品情報をどこまで出すか。`none` / `popup` / `list` の3択で、**未定義の既定は `none`（掲載しない）**（下記） |
| `itemCategories` | 商品カテゴリの定義。商品一覧のフィルタとエディタの選択肢に使う。**空または未定義ならエディタに商品カテゴリの欄を出しません** |
| `announcements.source` | お知らせJSONのパス。**空文字にするとセクション自体を出力しません** |
| `site.social` | イベント公式SNSのリンク。テーマのスロット `[data-marche-social]` に配列の順で並びます。**未定義・空ならスロットごと隠れます** |
| `forms` | 問い合わせフォームの設定。**すべて省略できます**（下記）。項目そのものは `forms/<種別>.json` 側です |

**`site.name` / `event.*` / `days` はテーマに差し込めます。**
`data-marche-text="event.venue"` と書いたスロットにコアが値を入れます（[決定14](decisions.md)）。
**年度更新でテーマのHTMLを触らずに済むのはこのためです。**

### items.display — 商品情報の掲載範囲

**商品を扱わないイベントが素の状態です。** 出店者の紹介だけで完結する催し
（展示・体験・相談ブースなど）もあるため、既定は「掲載しない」にしてあります。
商品を出すと決めたイベントだけが、この設定を書きます。

| 値 | 商品一覧のセクション | 店舗ポップアップの取り扱い | 商品ポップアップ |
|---|---|---|---|
| `none`（**既定**） | 出ない | 出ない | 開かない |
| `popup` | 出ない | 出る | 開く |
| `list` | 出る | 出る | 開く |

`none` と `popup` では、テーマに商品一覧のスロットがあっても**埋めません。**
掲載範囲を決めるのは設定であってテーマではないためです。
セクションを `[data-marche-items-section]` で包んでおくと、見出しごと隠れ、
**ナビゲーションの「商品」も一緒に隠れます**（[テーマ仕様](theme-contract.md)）。

**掲載しない設定にしても、登録済みの商品データは消えません。**
エディタは商品の欄を出さなくなりますが、保存時は読み込んだ `items` をそのまま送り返します。
`none` → `list` に戻せば、以前の商品がそのまま出ます。

### forms — 問い合わせフォームの設定

フォームの**動かし方**だけをここに書きます。**どんな項目を出すかは書きません。**
項目は `forms/<種別>.json`（下の5章）にあり、サーバー側の検証と共有します。

| 項目 | 既定 | 内容 |
|---|---|---|
| `endpoint` | `data/send.php` | 送信先。**空文字にするとモックモード**（送らずに内容を画面へ出す） |
| `honeypot` | `website` | おとり欄の項目名。**フォームの実項目と同じ名前にしないこと** |
| `retries` | `1` | 送信に失敗したときの再試行回数。`0` で再試行しない |
| `successUrl` | （空） | 送信後の遷移先。空なら同じページで完了表示に差し替える |

モックモードは、PHPを置かない環境で入力と確認モーダルを試すためのものです
（エディタの `UPLOAD_URL` を空にするのと同じ発想）。`examples/demo/` がこれを使っています。

送信先を別のもの（GAS Web Appなど）に向けることもできます。
**受け側が `{"ok": true}` を返せば、コアはそれ以上のことを求めません。**

### site.social — イベント公式のSNS

出店者ごとのSNSではなく、**イベント運営が持つアカウント**です（決定12）。

| フィールド | 必須 | 内容 |
|---|---|---|
| `platform` | ○ | プラットフォームID（`x` / `instagram` / `youtube` …）。小文字・数字・ハイフン |
| `url` | ○ | リンク先。**`http://` または `https://` で始まるものだけ出力されます** |
| `label` | | 画面に出す表記。省略時はコアの既定名（`x` なら `X`） |

**プラットフォームの種類をコアは固定していません。** 既定の表記を持つのは
`x` / `instagram` / `youtube` / `facebook` / `tiktok` / `threads` / `line` / `note` /
`bluesky` / `mastodon` の10種ですが、それ以外のIDも書けます（表記は `label` で与えてください）。

アイコンはテーマの持ち物です。コアが出すのはリンクとクラス名（`social-link--<platform>`）
だけで、何の絵を出すかは[テーマ仕様](theme-contract.md#イベント公式のsns)の領分です。

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
| `id` | ○ | カテゴリID。テーマのスロット `data-marche-shops="<id>"` と対応する |
| `label` | ○ | 画面に出す見出し |
| `variant` | | `standard`（既定）/ `compact` / `feature`。カードの見た目 |
| `shops` | ○ | 店舗IDの配列。順序は固定表示時（`?fixed`）の並び順 |

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
| `category` | | 商品カテゴリ。`itemCategories[].id` のいずれか。商品一覧のフィルタに使う（**出店者のカテゴリとは別物**） |
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
  "autoReply": true,
  "replyToField": "email",
  "fields": [
    { "name": "email", "label": "メールアドレス", "type": "email",
      "required": true, "validation": "email", "maxLength": 254 }
  ]
}
```

ファイル名と `formType` は一致させます。`send.php` は受け取った `type` でこのファイルを引きます。

| トップレベル | 必須 | 内容 |
|---|---|---|
| `formType` | ○ | フォーム種別。**ファイル名と同じにする** |
| `fields` | ○ | 項目の配列。1件以上 |
| `autoReply` | | 送信者への自動返信。既定は `false`。文面は辞書の `notify.autoReply*` |
| `replyToField` | | 運営への通知メールの `Reply-To` に入れる項目名。既定は `email` |
| `autoReplyToField` | | 自動返信の宛先に使う項目名。既定は `email` |

### 項目

| フィールド | 必須 | 内容 |
|---|---|---|
| `name` | ○ | 送信データのキー。英字始まりの英数字とアンダースコア |
| `label` | ○ | 表示ラベル。通知メールの見出しにもなる |
| `type` | ○ | 下の表のいずれか |
| `required` | | 必須かどうか |
| `validation` | | `email` / `phone` / `url` / `number` / `halfwidth`。**選択式には効きません** |
| `maxLength` | | 文字数の上限 |
| `placeholder` | | 入力例。`select` では先頭の空選択肢の文言になる |
| `description` | | ラベルの下に出す補足。`aria-describedby` で入力欄に関連付きます |
| `autocomplete` | | ブラウザの補完に渡す属性値（`name` / `email` / `tel` など） |
| `options` | | `select` / `radio` / `checkbox` の選択肢。`[{"value", "label"}]` |
| `min` / `max` / `step` | | `number` / `date` / `time` の範囲と刻み |
| `value` | | `hidden` の固定値 |
| `capture` | | `hidden` の値をブラウザ側で自動取得する。下記 |

### type

| type | 出るもの |
|---|---|
| `text` / `email` / `tel` / `url` / `number` / `date` / `time` | 1行の入力欄 |
| `textarea` | 複数行の入力欄 |
| `select` | 選択肢から1つ |
| `radio` | 選択肢から1つ（並べて表示） |
| `checkbox` | 選択肢から複数。送信値は `", "` で連結される |
| `consent` | **単一の同意チェック**。`required` にすると同意必須。送信値は「同意」か空 |
| `hidden` | **画面に出ない値**。`value` か `capture` で埋める |

### capture — 隠し項目に文脈を入れる

`type: "hidden"` のときだけ使えます。ブラウザ側で値を解決して送ります。

| 値 | 入るもの |
|---|---|
| `pageUrl` | 送信元ページのURL |
| `referrer` | 参照元（`document.referrer`） |
| `query:<パラメータ名>` | URLクエリの値（例 `query:utm_source`） |

**`capture` の値には `maxLength` を付けないでください。** URLは長くなりがちで、
サーバー側の検証で弾かれます。

通知先メールアドレスや本文テンプレートは**このJSONに入れません**。
公開ディレクトリに置かれるためです。通知先は `.env`、文面は辞書（`i18n/<locale>.json`）から取ります。

## サーバー側の検証ルール

受信PHPは、送られてきたデータを信用せずに検証します。

| 対象 | ルール |
|---|---|
| 店舗ID | `^[a-z0-9][a-z0-9-]*$`。パストラバーサル対策。**`shops.json` のロスターに無いIDは拒否**（[決定10](decisions.md)） |
| 商品ID | `^<店舗ID>-[0-9]+$`。他店のIDを名乗れない |
| **文字列項目** | **HTMLタグを除去する**（店名・商品名・紹介文・説明文） |
| 画像拡張子 | `webp` / `png` / `jpg` / `jpeg` / `gif` / `avif` のみ |
| 画像の合計サイズ | 20MB（**クライアント側の定数と一致させること**） |
| `price` | 0以上。`ticket` モードなら整数のみ |
| `status` | 定義された値以外を拒否 |
| `saleDays` | `marche.config.json` の `days[].id` に無いIDを拒否。**全日を選んだ場合は書き出さない**（未指定と同じ意味） |
| `category` | `itemCategories[].id` に無いIDを拒否（**定義があるときだけ**） |
| `url` | `http://` か `https://` で始まらない値は落とす |
| お知らせの書き込み | 合言葉（管理キー）による認証。ファイル名と保存先のパスも検証 |

上限値や許可拡張子は**サーバーとクライアントの両方に定数があります。**
片方だけ変えると、クライアントを通ったデータがサーバーで弾かれます。
実装は [`core/php/`](../core/php/README.md) と [`core/editor/`](../core/editor/README.md) にあります。

### HTMLタグの除去について

`strip_tags` は使いません。`1 < 2` のような不等号まで食べてしまうためです。
実体参照で書かれたタグ（`&lt;script&gt;`）も対象にするため、**先に復号してから**
タグらしい形（`</?英字…>`）だけを除去します。`<br>` は改行（`\n`）として拾います。

## データの検証

仕様どおりのデータになっているかを確認できます。外部ライブラリは不要です。

```bash
python3 tools/validate.py <サイトの公開ディレクトリ>
```

新しいイベントを立ち上げたときや、データを手で編集したあとに実行してください。
