# セットアップ手順

リポジトリから、実際に公開するサイトを組み立てて配置するまでの手順です。
架空のイベントで試したいだけなら、先に [`examples/demo/`](../examples/demo/README.md) を
動かしてください（PHPもサーバーも要りません）。

## 動作要件

| | 必要なもの |
|---|---|
| サーバー | **セキュリティサポートが継続しているPHP**が動く一般的なレンタルサーバー。**データベースは要りません** |
| PHPの拡張 | `mbstring`（メール送信）、`curl`（Webhook通知。無ければ通知だけスキップされます） |
| 手元 | `python3`（設定の注入と検証に使います。サーバー側には不要） |
| ブラウザ | ESモジュールが動くもの。**ビルドは要りません** |

> **PHPのバージョンは「サポートが切れていないこと」で決めています。**
> 数字を書いて固定すると、その数字自体がいずれ古くなるためです。
> 対象は [php.net の Supported Versions](https://www.php.net/supported-versions.php) が正で、
> **2026年8月の時点では 8.2 以上**です（8.1 は2025年末でセキュリティサポートが終了しました）。
>
> コードそのものが必要とする下限は 8.0 です（`core/php/send.php` の `str_contains()`）。
> それより下では動きませんが、**動くことと、脆弱性が直されることは別**です。
> 8.0 や 8.1 で動いてしまう点をあてにしないでください。

`mail()` が使えないサーバーでは問い合わせフォームの通知メールが飛びません。
それ以外の機能は動きます。

## 全体の流れ

手元で公開ディレクトリと同じ形を組み立て、そこへ秘密情報を注入してから、
まるごとサーバーへ上げます。**リポジトリのファイルは書き換わりません。**

```
リポジトリ  →  手元の配置用ディレクトリ  →  サーバーの公開ディレクトリ
  core/          組み立てる                アップロードする
  themes/        設定を書く                パーミッションを整える
                 .env を注入する           動作確認する
```

## 公開ディレクトリの完成形

先に完成形を示します。**どのファイルがどこから来るか**が分かれば、あとは並べるだけです。

```
<公開ディレクトリ>/
├── index.html              ← themes/<テーマ>/index.html
├── css/                    ← themes/<テーマ>/*.css
├── images/noimage/         ← themes/<テーマ>/images/noimage/
├── js/                     ← core/js/            (10ファイル。編集しない)
├── i18n/                   ← core/i18n/          (ja.json / en.json)
├── editor/                 ← core/editor/
├── forms/contact.json      ← 自分で書く          (問い合わせフォームを使う場合)
├── marche.config.json      ← 自分で書く          (イベントの設定)
└── data/
    ├── config.php          ← core/php/
    ├── shop-upload.php     ← core/php/
    ├── put-json.php        ← core/php/
    ├── send.php            ← core/php/
    ├── secrets.php         ← tools/inject-env.py が生成 (Git管理外)
    ├── shops.json          ← 自分で書く          (出店者ロスター)
    ├── news.json           ← 空の [] から始める  (お知らせ)
    └── shop-data/          ← 空でよい            (出店者が書き込む)
```

このパスはコアの定数（`core/js/config.js` と `core/editor/editor.js`）と
`core/php/config.php` が前提にしています。**フォルダ名を変えると動きません。**

サブディレクトリ（`https://example.com/2026/` など）に置いても動きます。
コアのパスはすべてページからの相対で解決されます。

## 手順

### 1. リポジトリを取得する

テンプレート方式です。依存として入れるのではなく、コピーして使います。

```bash
git clone https://github.com/kwaka1208/marche-kit my-event
cd my-event
rm -rf .git && git init
```

### 2. 配置用のディレクトリを組み立てる

手元に空のディレクトリを作り、上の完成形どおりに並べます。

```bash
SITE=../my-event-site      # 配置用ディレクトリ（公開ディレクトリと同じ形になる）
THEME=default              # または night-market

mkdir -p "$SITE"/{css,js,i18n,editor,forms,data/shop-data}

cp themes/$THEME/index.html "$SITE"/
cp themes/$THEME/*.css      "$SITE"/css/
cp -r themes/$THEME/images  "$SITE"/
cp -r core/js/.             "$SITE"/js/
cp -r core/i18n/.           "$SITE"/i18n/
cp -r core/editor/.         "$SITE"/editor/
cp core/php/config.php core/php/shop-upload.php \
   core/php/put-json.php core/php/send.php "$SITE"/data/

echo '[]' > "$SITE"/data/news.json
```

**`core/php/secrets.example.php` はコピーしません。** 実際の `secrets.php` は手順5で生成します。

テーマの中身と作り方は [themes/README.md](../themes/README.md) を参照してください。

**HTMLをAstroなどの静的サイトジェネレーターで生成することもできます。**
その場合はここで `index.html` をコピーせず、[下記](#静的サイトジェネレーターと組み合わせる)を参照してください。

### 3. イベントの設定を書く

`<配置用>/marche.config.json` に、そのイベントのことを書きます。
**開催日・対価の単位・商品カテゴリ・言語は、すべてこの1ファイルで決まります。**

```json
{
  "site": {
    "name": "みどり野マルシェ",
    "url": "https://example.com",
    "social": [
      { "platform": "instagram", "url": "https://www.instagram.com/example/" }
    ]
  },
  "event": { "year": 2026, "venue": "みどり野中央公園", "hours": "10:00-16:00" },
  "days": [
    { "id": "day1", "date": "2026-10-03", "label": "10月3日(土)", "shortLabel": "3日(土)" },
    { "id": "day2", "date": "2026-10-04", "label": "10月4日(日)", "shortLabel": "4日(日)" }
  ],
  "pricing": {
    "mode": "currency",
    "currency": { "unit": "円", "position": "suffix", "grouping": true, "decimals": 0 },
    "note": "税込"
  },
  "locale": "ja",
  "timezone": "Asia/Tokyo",
  "itemCategories": [
    { "id": "drink", "label": "ドリンク" },
    { "id": "food", "label": "フード" }
  ],
  "announcements": { "source": "data/news.json", "visibleCount": 2 }
}
```

各項目の意味は [データ仕様](data-contract.md)、形式の正は
[`schema/config.schema.json`](../schema/config.schema.json) にあります。

| よく変えるところ | 効果 |
|---|---|
| `days` が1件だけ | **販売日の選択・表示がどこにも出なくなります**（エディタもサイトも） |
| `pricing.mode: "ticket"` | 対価が金額ではなく枚数になり、但し書きが消えます |
| `itemCategories` が空 | 商品カテゴリの欄とフィルタが出なくなります |
| `locale: "en"` | 画面の文言と日付が英語になります（`i18n/en.json`） |
| `site.social` が無い | SNSのリンクが**スロットごと**隠れます |
| `forms.endpoint` が `""` | 問い合わせフォームが**モックモード**になり、送信せず内容を画面に出すだけになります |

`site.name` / `event.venue` / `event.hours` / `days` は、**テーマに差し込めます。**
テーマのHTMLに `data-marche-text="event.venue"` と書いたところへコアが値を入れるので、
**イベント名や会場をテーマに直書きする必要はありません。**

### 4. 出店者ロスターを書く

`<配置用>/data/shops.json` に、誰が出店するかと、どう区分けするかを書きます。
**ここに無い店舗IDからの保存はサーバーが拒否します。**

```json
{
  "categories": [
    {
      "id": "stalls",
      "label": "出店ブース",
      "variant": "standard",
      "shops": ["hinata-coffee", "kogumado"]
    }
  ]
}
```

店舗IDは `[a-z0-9][a-z0-9-]*` です。**フォルダ名になるので後から変えられません。**
`variant` はテーマがカードの見た目を変えるための印で、`standard` / `compact` / `feature` の3種です。

### カテゴリIDをテーマのスロットに合わせる

**ここを飛ばすと、出店者が1件も表示されません。**

同梱のテーマに入っているカテゴリIDは**記入例**です。自分で決めたIDに書き換えます。

```bash
grep -n 'data-marche-shops' "$SITE"/index.html
```

既定テーマは `shops`（と、コメントの中に `foodstores` の例）になっています。
上のロスターに合わせるなら、こう直します。

```html
<!-- 修正前（テーマの記入例） -->
<div class="shop-grid" data-marche-shops="shops"></div>

<!-- 修正後（自分のカテゴリIDに合わせる） -->
<div class="shop-grid" data-marche-shops="stalls"></div>
```

区分を増やすときは、この行を足すだけです。見出しも並べたいなら一緒に書きます。

```html
<h2 class="section-heading">キッチンカー</h2>
<div class="shop-grid" data-marche-shops="foodtrucks"></div>
```

**合っていなくても画面にはエラーが出ません。** その区分の出店者が出ないだけです。
`tools/validate.py` が `index.html` と突き合わせて指摘するので、
**カテゴリを増減したら必ず検証を通してください**（手順6）。

### 5. 秘密情報を注入する

通知先メールアドレス・管理キー・Webhook URLは、**リポジトリのファイルに書きません。**
`.env` に書いて、配置用ディレクトリのコピーに対してだけ流し込みます。

```bash
cp .env.example .env      # 値を記入する
python3 tools/inject-env.py "$SITE"
```

これで次の2つが起こります。

- `<配置用>/data/secrets.php` が生成されます（PHPが読みます。パーミッションは600）
- `<配置用>/editor/*.js` の `__ADMIN_KEY__` / `__WEBHOOK_URL__` が実際の値に置き換わります

**エディタのJSはブラウザに配信されるため、環境変数を読めません。**
だからソースにはプレースホルダだけを置き、配置後のコピーに対して置換しています。
リポジトリ側のファイルは書き換わりません。

未設定のまま進めても動きます。管理キーが空なら運営向けUIが出ず、お知らせエディタは開けません。
Webhook URLが空なら通知をスキップします。

### 6. 配置前に検証する

アップロードする前に、データが仕様どおりかを確認します。外部ライブラリは不要です。

```bash
python3 tools/validate.py "$SITE"
```

店舗IDの不整合、商品IDの形式違反、HTMLタグの混入、未定義の販売日、画像ファイルの欠落などを
まとめて報告します。

**出店者がまだ書き込んでいない段階でも通ります。** ロスターに載せた店の `shop-data/` は
その店が保存して初めて作られるので、それまでは警告として出ます（仕様違反ではありません）。

`index.html` があれば、**定義とテーマのスロットの対応も確かめます。**

| 見るもの | 扱い |
|---|---|
| `shops.json` のカテゴリにスロットが無い | **仕様違反**（その区分の出店者が出ない） |
| `forms/<種別>.json` にスロットが無い | 警告（そのフォームが出ない） |
| `site.social` にスロットが無い | 警告（SNSのリンクが出ない） |

**逆は見ません。** スロットがあって定義が無いのは、隠れるだけで意図した運用でも起きます
（`examples/demo/variants/` がそれを確かめています）。

### 7. サーバーへ上げる

`<配置用>` の中身を、公開ディレクトリへそのままアップロードします（FTP / SFTP / rsync）。

```bash
rsync -av --delete "$SITE"/ user@example.com:/home/user/public_html/
```

`--delete` を使うときは注意してください。**`data/shop-data/` と `data/news.json` は
サーバー側で育つファイルです。** 出店者が書き込んだ内容が消えます。
運用開始後は次のように除外してください。

```bash
rsync -av --exclude 'data/shop-data' --exclude 'data/news.json' \
      --exclude 'data/secrets.php' "$SITE"/ user@example.com:/home/user/public_html/
```

### 8. パーミッションを整える

**PHPが書き込むのは2箇所だけです。**

| 対象 | 誰が書くか | 目安 |
|---|---|---|
| `data/shop-data/` | `shop-upload.php`（出店者の保存） | 書き込み可（`755` で足りなければ `775` / `707`） |
| `data/news.json` | `put-json.php`（お知らせの保存） | 書き込み可（`644` で足りなければ `664` / `666`） |
| それ以外のファイル | — | `644` |
| それ以外のディレクトリ | — | `755` |
| `data/secrets.php` | — | `600`（生成時に設定されます） |

どこまで緩める必要があるかは、**PHPがどのユーザーで動くか**で決まります。

- **suEXEC / CGI 版**（多くのレンタルサーバー）… PHPが自分のユーザーで動くので `755` / `644` のままで書けます
- **モジュール版**（`mod_php`、PHPが `www-data` などで動く）… 所有者が違うため、
  書き込み先だけ `775`（同グループ）や `707` まで緩める必要があります

`secrets.php` は600で生成されますが、**FTPでアップロードすると権限が落ちることがあります。**
上げたあとに確認してください。モジュール版のPHPでは600だと読めないため、`640` や `644` に
せざるを得ないことがあります。その場合でも、このファイルは `return [...]` を返すだけなので
ブラウザから直接開いても中身は出ません。**PHPの実行が止まった状態では見えてしまう**点だけ
覚えておいてください。

`data/` の下のJSONと画像は、**ブラウザが直接読みます。** `.htaccess` で `data/` ごと
アクセスを禁止しないでください。サイトの出店者一覧が出なくなります。

## 動作確認

上から順に確認してください。**どこで止まったかで原因が絞れます。**

| # | 確認すること | 見るところ |
|---|---|---|
| 1 | トップページが表示される | `https://example.com/?fixed` |
| 2 | **イベント名・会期・会場が出る** | `marche.config.json` から差し込まれます。**空欄なら綴り違い**（下記） |
| 3 | お知らせのセクションが**丸ごと消えている** | `news.json` が `[]` なら正常（0件はセクションごと隠します） |
| 4 | 出店者の区分が出る（中身は空でよい） | `data/shops.json` が読めている |
| 5 | 文言が日本語で出る（`common.loading` のようなキー名が出ない） | `i18n/` の配置 |
| 6 | **問い合わせフォームが出る** | `forms/contact.json` を置いた場合。置いていなければセクションごと消えます |
| 7 | 運営向けUIが出る | `https://example.com/editor/?<管理キー>` |
| 8 | 店舗IDを入れて読み込める | ロスターに登録済みのID |
| 9 | 紹介文と商品を入れて**保存できる** | `data/shop-data/<店舗ID>/data.json` ができる |
| 10 | 保存した内容がサイトに出る | トップを再読み込み |
| 11 | お知らせを1件追加できる | `https://example.com/editor/news/?<管理キー>` |
| 12 | Webhookに通知が届く | 設定した場合のみ |

**2 が空欄のときはブラウザのコンソールを見てください。**
`marche.config.json に 'evnt.venue' がありません` のように、
コアが指したパスを残しています。`tools/validate.py` も同じ綴り違いを指摘します。

`?fixed` は表示順のシャッフルを止めます。**付けないと毎回並びが変わります**ので、
確認のあいだは付けておくと楽です。

最後に、サーバー上のデータをもう一度検証します。

```bash
python3 tools/validate.py <ダウンロードした公開ディレクトリ>
```

## 出店者への案内

出店者に伝えるのは**編集画面のURLと自分の店舗ID**の2つだけです。

```
編集画面: https://example.com/editor/
店舗ID:   hinata-coffee
```

**管理キーは伝えません。** 管理キーは運営向けUI（店舗の一覧・未設定の店の一覧・
お知らせ編集へのリンク）を出すためのもので、店舗IDだけで自店の編集はできます。

> **管理キーはブラウザに配信されます。**
> `/editor/` をBasic認証などで保護しない限り、閲覧者に見えます。
> **承認フローを持たない設計**です。出店者を信頼できる範囲で使ってください
> （[README](../README.md#-前提-出店者を信頼できる範囲で使う仕組みです)）。

## 問い合わせフォーム

画面もサーバー側も動きます。テーマにスロットを1つ置き、項目定義のJSONを用意するだけです。

### 1. 項目定義を置く

`<公開ディレクトリ>/forms/<種別>.json` に書きます。
**画面の生成もサーバー側の検証も、同じこのファイルを読みます。**

```json
{
  "formType": "contact",
  "autoReply": true,
  "replyToField": "email",
  "fields": [
    { "name": "name",  "label": "お名前", "type": "text",  "required": true, "maxLength": 100 },
    { "name": "email", "label": "メールアドレス", "type": "email", "required": true,
      "validation": "email", "maxLength": 255 },
    { "name": "topic", "label": "お問い合わせの種類", "type": "select", "required": true,
      "options": [
        { "value": "exhibit", "label": "出店について" },
        { "value": "visit",   "label": "来場について" }
      ] },
    { "name": "body",  "label": "お問い合わせ内容", "type": "textarea", "required": true,
      "maxLength": 2000 },
    { "name": "consent", "label": "個人情報の取り扱いに同意します", "type": "consent",
      "required": true }
  ]
}
```

**ファイル名と `formType` は一致させます。** 書ける項目の一覧は
[データ仕様](data-contract.md#5-formscontactjson--フォーム項目定義)にあります。
`examples/demo/forms/contact.json` が9項目ぶんの見本です。

### 2. テーマにスロットを置く

```html
<section id="contact" data-marche-form-section>
    <h2>お問い合わせ</h2>
    <div data-marche-form="contact"></div>
</section>
```

**スロットはこの1行だけです。** 入力欄・確認モーダル・送信はコアが受け持ちます。
同梱の2テーマにはすでに入っています。

`data-marche-form-section` で包むと、**定義が読めないときに見出しごと隠れます。**
包まないとスロットだけが隠れ、「お問い合わせ」の見出しと余白が残ります。

### 3. 通知先を設定する

`.env` の `MARCHE_NOTIFY_EMAIL`（運営への通知先）と `MARCHE_SENDER_EMAIL`（送信元）です。
**どちらかが空だと送信が500で失敗します。**
自動返信の文面は辞書（`i18n/<locale>.json`）の `notify.autoReply*` にあります。

**通知先も文面も、`forms/*.json` には書きません。** このファイルは公開ディレクトリに置かれます。

### 設定

`marche.config.json` の `forms` で変えられます。すべて省略できます。

| | 既定 | 内容 |
|---|---|---|
| `endpoint` | `data/send.php` | 送信先。**空文字にするとモックモード**（送らずに内容を画面へ出す） |
| `honeypot` | `website` | おとり欄の項目名 |
| `retries` | `1` | 送信失敗時の再試行回数 |
| `successUrl` | （空） | 送信後の遷移先。空なら同じページで完了表示に差し替える |

### 動作確認

1. フォームが表示される（項目が定義どおり出ている）
2. 空のまま「内容を確認する」→ **項目の直下に**エラーが出る
3. 埋めて「内容を確認する」→ 確認モーダルに**表示ラベル**が出る（`exhibit` ではなく「出店について」）
4. 「送信する」→ 完了表示に切り替わり、`MARCHE_NOTIFY_EMAIL` にメールが届く
5. ブラウザの開発者ツールで `.courier-honeypot` が**画面の外にある**ことを確認する

> **手順5を飛ばさないでください。**
> おとり欄が画面に出ていると、来場者がそこに入力し、**その問い合わせは黙って捨てられます。**
> 送った本人には成功したように見えます。テーマを自作したときに起きやすい失敗です。

## 静的サイトジェネレーターと組み合わせる

**HTMLの作り方は自由です。** marche-kit はSSGに依存しません。
設定を `marche.config.json` に集約したのは、まさにこのためでした
（[決定7](decisions.md)。本家サイトは設定がAstroのTypeScriptの中にあり、
SSGを替えると設定ごと移植が必要な状態でした）。

コアが探すパスはすべて**ページからの相対**（`js/marche.js` / `data/shops.json` /
`i18n/` / `forms/` / `images/`）なので、生成されたHTMLでもそのまま解決します。

### 役割分担

| | 誰が用意するか |
|---|---|
| `index.html` の中身（スロットの配置・レイアウト） | **SSGが生成する** |
| `js/` `i18n/` `images/` `forms/` `data/`（PHPを含む）`marche.config.json` | **そのまま置く**（Astroなら `public/`） |
| 出店者・商品・お知らせの描画 | **実行時にコアがfetchする。** SSGは関与しない |

### Astro の場合

`public/` に置いたものはビルド時にそのままコピーされます。

```
my-event/
├── public/
│   ├── marche.config.json
│   ├── js/          ← core/js/
│   ├── i18n/        ← core/i18n/
│   ├── images/      ← themes/<テーマ>/images/
│   ├── editor/      ← core/editor/
│   ├── forms/
│   └── data/        ← core/php/ とデータ
├── src/
│   ├── layouts/     ← <head> と共通の枠
│   └── pages/
│       └── index.astro   ← スロットを並べる
└── astro.config.mjs
```

CSSは `public/css/` に置いても、Astro側でimportしてもかまいません。
ビルドすると `dist/` に出るので、**その中身を公開ディレクトリへ上げます**（手順7以降は同じです）。

### 設定をビルド時に読める

`marche.config.json` はただのJSONなので、Astro側からimportできます。

```astro
---
import config from '../../public/marche.config.json';
---
<title>{config.site.name}</title>
<h1>{config.site.name}</h1>
```

**`<title>` を設定から出せるのはSSGを使う場合の利点です。**
コアの `data-marche-text` は描画JSが動いたあとに差し込むため、`<title>` を対象にしていません。
ビルド時に埋めるならその制約がありません。

`data-marche-text` と併用しても、二重にはなりません。ビルド時に中身を書いた要素には
この属性を付けなければよいだけです。

### 気をつけること

**開発サーバーはPHPを動かしません。** `astro dev` で見えるのはHTMLと描画JSまでです。
エディタと問い合わせフォームの往復を試すときは、ビルド出力に対してPHPを動かしてください。

```bash
npm run build
cd dist && php -S 127.0.0.1:8000
```

**出店者・商品・お知らせは静的化されません。** 実行時にJSONを取りに行く設計のままです
（表示順のシャッフルと即時反映を優先しています。[concepts.md](concepts.md)）。
SSGを使っても、この部分がビルド時に固定されることはありません。

**サブディレクトリに公開するときは Astro の `base` を設定してください。**
コアのパスは相対なので影響を受けませんが、**Astroが生成する側のリンクとアセットは影響を受けます。**

## つまずきやすいところ

| 症状 | 原因 | 対処 |
|---|---|---|
| 出店者が1件も出ない | `data/shops.json` が読めない／JSONが壊れている | ブラウザで `data/shops.json` を直接開く |
| 文言が `common.loading` のまま出る | `i18n/` が無い、または `locale` と辞書のファイル名が合っていない | `i18n/ja.json` の存在を確認する |
| ポップアップが開いたまま見える | テーマのCSSに「仕掛け」が足りない | [テーマ仕様](theme-contract.md#テーマが用意する仕掛け)の7つを確認する |
| 商品の折りたたみが1行しか出ない | 商品グリッドが `grid` になっていない | コアが `grid-template-columns` から列数を読んでいます |
| 保存で「この店舗IDは出店者ロスターに登録されていません」 | `data/shops.json` の `shops` に無いID | ロスターに追加する |
| 保存で「保存先フォルダを作成できませんでした」 | `data/shop-data/` の書き込み権限 | 手順8を見直す |
| 保存で「サーバーへのファイル書き込みに失敗しました」 | 同上（`news.json` の場合もあり） | 同上 |
| 画像が一部しか届かない | php.ini の `upload_max_filesize` / `post_max_size` / `max_file_uploads` | エラーメッセージに該当項目が出ます |
| お知らせエディタがトップへ戻される | 管理キーが未注入（`__ADMIN_KEY__` のまま） | `tools/inject-env.py` を実行したか確認する |
| 保存はできるがWebhookが飛ばない | URL未設定、または `curl` 拡張が無い | 通知だけの機能なので保存には影響しません |
| メールが届かない | `mail()` が使えない、または `From` のドメインがSPFを通らない | `MARCHE_SENDER_EMAIL` を自サーバーのドメインにする |
| フォームのセクションごと出ない | `forms/<種別>.json` が無い／JSONが壊れている | ブラウザのコンソールに404かパースエラーが出ます |
| フォームを送ると「不明なフォーム種別です」 | `formType` とファイル名が違う | 一致させる |
| 送信は成功するのにメールが来ない | `MARCHE_NOTIFY_EMAIL` / `MARCHE_SENDER_EMAIL` が未設定 | 未設定なら500で失敗します。成功しているなら `mail()` 側の問題 |
| 通知メールの選択肢が `exhibit` のまま | 定義の `options` に `label` が無い | `{"value": …, "label": …}` の形にする |

## 更新のしかた

| 何を変えるとき | やること |
|---|---|
| コアを新しくする | `js/` `i18n/` `editor/` `data/*.php` を置き換え、`inject-env.py` を再実行する |
| テーマを変える | `index.html` と `css/` `images/` を置き換える。データはそのまま |
| 開催年を変える | `marche.config.json` の `event.year` と `days` を書き換える。**テーマは触りません** |
| 出店者を入れ替える | `data/shops.json` を書き換える。**古い `shop-data/<店舗ID>/` は自動では消えません** |

コアを更新したあとは、**`inject-env.py` の再実行を忘れないでください。**
新しい `editor/*.js` にはプレースホルダが入っています。
実行漏れはツール自身が「プレースホルダが残っています」と教えてくれます。

**年度更新でテーマのHTMLを開く必要はありません。**
イベント名・会期・会場はテーマに直書きせず、`data-marche-text` で設定から差し込むためです。
書き換えるのは `marche.config.json` と `data/shops.json` の2つだけです。

年をまたぐときは、前年の公開ディレクトリをまるごと別の場所へ退避してから
新しい設定で組み直すのが確実です。**出店者のデータは年ごとに独立しています。**
