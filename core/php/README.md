# core/php/ — サーバー側の受信・保存

出店者エディタとお知らせエディタからの書き込みを受け、フォームのメールを送ります。
レンタルサーバーのPHPで動きます。フレームワークもデータベースも使いません。

| ファイル | 役割 |
|---|---|
| `config.php` | 共通の設定ローダ。他の3つがこれを `require` する |
| `shop-upload.php` | 出店者情報（`data.json` と画像）の受信・保存 |
| `put-json.php` | お知らせ（`news.json`）の書き込み |
| `send.php` | 問い合わせフォームの受信とメール送信 |
| `secrets.example.php` | 秘密情報の受け皿の見本。**実際の値は書かない** |

## 配置

このフォルダの中身を、公開ディレクトリの `data/` に置きます。

```
<公開ディレクトリ>/
├── marche.config.json     サイト設定
├── forms/contact.json     フォーム項目定義
├── i18n/ja.json           表示文言（core/i18n/ の中身）
├── editor/                出店者・お知らせエディタ（core/editor/ の中身）
└── data/
    ├── config.php         ← ここから下が core/php/
    ├── secrets.php        .env から生成（Git管理外）
    ├── shop-upload.php
    ├── put-json.php
    ├── send.php
    ├── shops.json         出店者ロスター
    ├── news.json          お知らせ
    └── shop-data/         出店者が書き込む実データ
```

`marche.config.json` は `data/` の親、無ければさらにその親から探します。
`i18n/` が見つからないときは `core/i18n/` も見るので、リポジトリの構成のまま
配置しても動きます。

`shop-data/` はPHPが書き込むため、サーバーによっては書き込み権限が必要です。

## 秘密情報

通知先メールアドレス・管理キー・Webhook URLを**このフォルダのファイルに書かないでください。**
`.env` に書き、次で `secrets.php` を生成します。

```bash
cp .env.example .env      # 値を記入する
python3 tools/inject-env.py <配置先ディレクトリ>
```

環境変数 `MARCHE_ADMIN_KEY` などを設定できるサーバーでは、`secrets.php` を置かずに
環境変数だけで動かせます（環境変数のほうが優先されます）。

## 検証の方針

**クライアントを信用しません。** エディタを通さない直接POSTでも壊れたデータが
残らないよう、受け取った値をすべてサーバー側で確かめます。

- 店舗IDはロスター（`shops.json`）にあるものだけ。フォルダ名になるためパターンも検査する
- 商品IDは `<店舗ID>-<連番>`。他店のIDを名乗れない
- 出店者が入力した文字列は**HTMLタグを除去**してから保存する（[決定6](../../docs/decisions.md)）
- `saleDays` は `marche.config.json` の `days[].id` にあるIDだけ
- `category` は `itemCategories[].id` にあるIDだけ
- 画像は拡張子と中身（MIME）の両方を見る

一覧は [docs/data-contract.md](../../docs/data-contract.md) の「サーバー側の検証ルール」にあります。

## クライアントと揃える定数

`config.php` の次の3つは、`core/editor/editor.js` にも同じ値の定数があります。
**片方だけ変えると、エディタを通ったデータがサーバーで弾かれます。**

| 定数 | 内容 |
|---|---|
| `MARCHE_ALLOWED_EXTENSIONS` | 保存を許可する画像拡張子 |
| `MARCHE_MAX_TOTAL_IMAGE_BYTES` | 画像の合計サイズ上限 |
| `MARCHE_ITEM_STATUSES` | 商品の販売状態 |

## 文言

画面に出る文字列（エラーメッセージ・通知メールの文面）は直書きせず、
`marche_text('server.badShopId')` のように辞書から引きます。
辞書は `marche.config.json` の `locale` で決まります。
