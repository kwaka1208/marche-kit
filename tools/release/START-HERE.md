# marche-kit __VERSION__（__THEME__ テーマ・配置済み）

**公開ディレクトリの形まで組み立ててあります。** 設定を書いて、`site/` の中身を
サーバーへ上げれば動きます。git も Node.js も要りません。

```
このフォルダ/
├── site/                 ← **ここの中身だけ**をサーバーの公開ディレクトリへ上げる
├── tools/                ← 手元で使う道具。上げない
├── docs/                 ← 詳しい手順。上げない
├── .env.example          ← 通知先メールなどの記入用。上げない
├── secrets.example.php   ← python3 を使わないときの受け皿の見本。上げない
└── START-HERE.md         ← このファイル
```

必要なのは **PHPが動く一般的なレンタルサーバー**だけです。データベースは使いません。
手元には `python3` があると楽です（無くても進められます。下の「python3 が無いとき」）。

## 1. イベントのことを書く

`site/marche.config.json` を開いて、イベント名・会場・開催日を書き換えます。

```json
"site":  { "name": "イベント名", "url": "https://example.com" },
"event": { "year": 2026, "venue": "会場名", "hours": "10:00-16:00" },
"days":  [ { "id": "day1", "date": "2026-10-03", "label": "10月3日(土)", "shortLabel": "3日(土)" } ]
```

**開催日を2日にするなら `days` に `day2` を足します。** 1件のままなら、
販売日の選択も表示もどこにも出ません。

**商品情報は既定で載りません。** 出店者の紹介だけで完結する催しを素の状態にしているためです。
商品も載せるなら、次の1行を足します。

```json
"items": { "display": "list" },
"itemCategories": [ { "id": "drink", "label": "ドリンク" } ]
```

`"popup"` にすると、一覧は出さず店舗ポップアップからだけ商品を開けます。

## 2. 出店者を並べる

`site/data/shops.json` に、誰が出店するかを書きます。
**カテゴリID（`id`）は __THEME__ テーマのスロットに合わせてあります。** 変えなくて動きます。

```json
{
  "categories": [
    { "id": "shops", "label": "出店者", "variant": "standard",
      "shops": ["hinata-coffee", "kogumado"] }
  ]
}
```

- 店舗IDは半角小文字・数字・ハイフン（`[a-z0-9][a-z0-9-]*`）
- **フォルダ名になるので、後から変えられません**
- **ここに無いIDからの保存は、サーバーが拒否します**
- `label` は画面に出る言葉ではなく、運営用の名前です。見出しは `site/index.html` にあります

区分を増やすときは、`site/index.html` にもスロットを1行足します。
**足し忘れると、その区分の出店者は画面にもエラーにも出ないまま消えます。**

```html
<h2 class="section-heading">キッチンカー</h2>
<div class="shop-grid" data-marche-shops="foodtrucks"></div>
```

## 3. 通知先と管理キーを入れる

`.env.example` を `.env` という名前でコピーして、値を書きます。
問い合わせの通知先メール、お知らせ編集に使う管理キー、通知先のWebhook URLです。

```
python3 tools/inject-env.py site
```

これで `site/data/secrets.php` ができ、`site/editor/` のJSに管理キーが入ります。
**空のまま進めても動きます**（管理キーが空ならお知らせエディタが開かないだけです）。

### python3 が無いとき

手でも同じことができます。

1. 同梱の `secrets.example.php` を `site/data/secrets.php` として複製し、値を書く
2. `site/editor/editor.js` と `site/editor/news/news-editor.js` の
   `__ADMIN_KEY__` `__WEBHOOK_URL__` を実際の値に置き換える

**`secrets.php` は公開ディレクトリに置きますが、`secrets.example.php` は置きません。**
受け皿の見本をサーバーに残す必要はないためです。

サーバー側で環境変数を設定できるなら、`secrets.php` を置かずに
`MARCHE_ADMIN_KEY` などで与えても構いません（環境変数が優先されます）。

## 4. 確かめる

上げる前に、書いた内容が仕様に合っているかを見ます。外部ライブラリは要りません。

```
python3 tools/validate.py site
```

店舗IDの不整合、HTMLタグの混入、画像の欠落に加えて、
**`index.html` のスロットとカテゴリIDが対応しているか**も確かめます。
カテゴリを増減したら必ず通してください。

## 5. サーバーへ上げる

`site/` の**中身**を、公開ディレクトリへそのままアップロードします（FTP / SFTP）。
`site` というフォルダごと上げるのではありません。

```
公開ディレクトリ/
├── index.html
├── css/  js/  i18n/  editor/  images/  forms/
├── marche.config.json
└── data/
```

サブディレクトリ（`https://example.com/2026/` など）でも動きます。

## 6. パーミッションを整える

**PHPが書き込むのは2箇所だけです。**

| 対象 | 目安 |
|---|---|
| `data/shop-data/` | 書き込み可（`755` で足りなければ `775` / `707`） |
| `data/news.json` | 書き込み可（`644` で足りなければ `664` / `666`） |
| `data/secrets.php` | `600` |
| ほかのファイル | `644`／ディレクトリ `755` |

## 動いたら

| ページ | 誰が使うか |
|---|---|
| `/` | 来場者 |
| `/editor/` | 各出店者（自店の紹介・商品・完売状況を編集） |
| `/editor/news/` | 運営（お知らせの追加・修正。管理キーが要る） |

**出店者が保存した内容は、運営の確認を挟まずそのまま公開されます。**
承認フローは意図的に持っていません。出店者の身元が分かっていて、
連絡が取れる関係にあるイベントで使ってください。

## 詳しいこと

同梱の `docs/` にあります。

| | 内容 |
|---|---|
| `docs/setup.md` | セットアップの全手順。配置・パーミッション・動作確認 |
| `docs/data-contract.md` | JSONの形式とサーバー側の検証 |
| `docs/theme-contract.md` | 見た目を変えるとき。CSS変数とスロット |
| `docs/concepts.md` | 3層モデルと設計思想 |

見た目を大きく変えたい、別のテーマを当てたいときは、素材一式の
`marche-kit-__VERSION__.zip` に `themes/` が入っています。

<https://github.com/kwaka1208/marche-kit>
