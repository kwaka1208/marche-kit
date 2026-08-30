# core/editor/ — 編集画面

ブラウザだけで動く編集画面です。ビルドも依存もありません。

| ファイル | 誰が使うか | 何をするか |
|---|---|---|
| `index.html` / `editor.js` | 各出店者 | 自店の紹介文・ロゴ・商品・対価・完売状況を編集する |
| `news/` | 運営 | お知らせの追加・修正 |
| `editor.css` | — | 両方の見た目 |

送信内容は `core/php/` が受け取り、**そのままサイトの表示になります**（即時反映）。

## 配置

このフォルダの中身を、公開ディレクトリの `editor/` に置きます。
配置後の構成は [core/php/README.md](../php/README.md) を参照してください。

配置したら、プレースホルダを実際の値で置き換えます。

```bash
python3 tools/inject-env.py <配置先ディレクトリ>
```

`__ADMIN_KEY__` と `__WEBHOOK_URL__` が `.env` の値に置き換わります。
**リポジトリ側のファイルは書き換わりません**（実運用の値をGitに入れないため）。

## イベント固有のことは書かない

このフォルダのコードには、開催日も商品カテゴリも対価の単位も画面文言も書きません。
すべて設定と辞書から読みます。

| 何が | どこから |
|---|---|
| 店舗の一覧とカテゴリ分け | `data/shops.json` の `categories` |
| 販売日の選択肢 | `marche.config.json` の `days`。**1件のときは欄ごと出しません** |
| 商品カテゴリの選択肢 | `marche.config.json` の `itemCategories`。**空なら欄ごと出しません** |
| 対価のラベルと単位 | `marche.config.json` の `pricing`（`currency` / `ticket` で言い回しが変わる） |
| 画面のすべての文言 | `i18n/<locale>.json` の `editor` セクション |

HTMLの文言も `data-i18n="editor.itemName"` で辞書を指し、JSが読み込み時に埋めます。
**HTMLにもJSにも文言を直書きしないでください。**

## アクセス制御

`/editor/?<管理キー>` のときだけ、運営向けのUI（店舗選択・未設定一覧・お知らせ編集への
リンク）が出ます。管理キーを知らなくても、**店舗IDを直接入力すれば編集はできます。**
出店者にIDだけを伝えて使ってもらう前提です。

お知らせエディタ（`news/`）は管理キーを必須にし、無ければサイトのトップへ戻します。

> **管理キーはブラウザに配信されます。**
> `/editor/` をBasic認証などで保護しない限り、閲覧者に見えます。
> `put-json.php` のサーバー側認証はその範囲でしか効きません。
> **承認フローを持たない設計**なので、出店者を信頼できる範囲で使ってください。

## サーバーと揃える定数

`editor.js` の次の3つは、`core/php/config.php` にも同じ値があります。
**片方だけ変えると、エディタを通ったデータがサーバーで弾かれます。**

| 定数 | サーバー側 |
|---|---|
| `MAX_TOTAL_IMAGE_BYTES` | `MARCHE_MAX_TOTAL_IMAGE_BYTES` |
| `ALLOWED_EXTENSIONS` | `MARCHE_ALLOWED_EXTENSIONS` |
| `ITEM_STATUSES` | `MARCHE_ITEM_STATUSES` |

## クラス名

エディタのクラス名は `editor-` を接頭辞に付けます（`.editor-item` など）。
テーマ契約（[docs/theme-contract.md](../../docs/theme-contract.md)）のクラス名とは
**別物**で、テーマからスタイルを当てる対象ではありません。

## モックモード

`editor.js` の `UPLOAD_URL` を空文字にすると、送信内容を画面に出すだけで実際には送りません。
PHPが動かない環境で入力の見た目を確かめるときに使います。
