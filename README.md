# marche-kit

イベント公式サイトのための、**出店者が自分で情報を更新できる**仕組み。
デザインは切り離してあり、テーマを掛け替えるだけで別のイベントに使えます。

クラフトビール祭り、マルシェ、朝市、文化祭、地域イベントなど、
「出店者が集まり、それぞれが商品を並べる」形のイベントを想定しています。

*[English](README.en.md)*

> **開発状況: 実装中（段階8完了）**
> サーバー側（[`core/php/`](core/php/)）、編集画面（[`core/editor/`](core/editor/)）、
> サイトの描画（[`core/js/`](core/js/)）、テーマ2種（[`themes/`](themes/README.md)）と
> 動くサンプル（[`examples/demo/`](examples/demo/README.md)）が動きます。
> 配置手順（[docs/setup.md](docs/setup.md)）と貢献の手引き（[CONTRIBUTING.md](CONTRIBUTING.md)）も揃いました。
> 問い合わせフォームは [astro-courier](https://github.com/kwaka1208/astro-courier) から移植しています（[決定13](docs/decisions.md)）。
> 進み具合は [docs/roadmap.md](docs/roadmap.md) を参照してください。

## 何が入るのか

一般的な静的サイトジェネレーターと違い、marche-kit は**運用の受け口**を持ちます。
サイトを公開したあとに毎日発生する作業を、運営がコードを触らずに回せるようにするためのものです。

| 機能 | 誰が使うか | 何をするか | 状態 |
|---|---|---|---|
| 出店者エディタ | 各出店者 | 自店の紹介文・ロゴ・商品・対価・完売状況を編集して即時反映 | ✅ |
| 商品情報の掲載範囲 | 運営 | 設定1行で「載せない／店舗から開くだけ／一覧も出す」を選ぶ。**既定は載せない** | ✅ |
| お知らせエディタ | 運営 | お知らせの追加・修正。サイトの再ビルド不要 | ✅ |
| お問い合わせフォーム | 来場者 | 項目定義JSONから生成。確認モーダル・スパム対策つき。メール送信 | ✅ |
| サイトの描画 | 来場者 | 出店者カード・商品一覧・お知らせの表示 | ✅ |
| イベント公式のSNS | 運営 | 設定にURLを並べるとサイトに出る。アイコンはテーマが持つ | ✅ |

動作要件は **セキュリティサポートが継続しているPHP**が動く一般的なレンタルサーバーだけです（[対象のバージョン](docs/setup.md#動作要件)）。
データベースも、管理画面フレームワークも、外部SaaSも使いません。
データはすべてサーバー上のJSONファイルとして置かれます。

## ⚠️ 前提: 出店者を信頼できる範囲で使う仕組みです

出店者が保存した内容は、**運営の確認を挟まずそのまま公開されます。**
承認フローは意図的に持っていません（[理由](docs/concepts.md)）。

このため marche-kit は、**出店者の身元が分かっていて、連絡が取れる関係にある**
イベントを想定しています。不特定多数が自由に登録して出店するような場では、
そのまま使わないでください。

安全側の設計はしています。出店者が入力する文字列はすべてテキストとして扱い、
HTMLタグはサーバー側で除去します。画像は拡張子とサイズを検証し、
店舗IDと商品IDの形式を固定して他店のデータに触れないようにしています。
それでも、**間違った内容がそのまま公開される可能性は残ります。**

## 最短で公開する

**サイトを1つ立ち上げたいだけなら、ここだけ読めば足ります。**
git も Node.js もビルドも要りません。PHPが動く一般的なレンタルサーバーだけで動きます。

### 1. 取ってくる

```bash
curl -fsSLO https://raw.githubusercontent.com/kwaka1208/marche-kit/main/tools/fetch-release.sh
bash fetch-release.sh
```

最新版が `marche-kit-<版>-site-default/` に展開されます。
暗い配色にするなら `bash fetch-release.sh --theme night-market` です。

**落としたスクリプトは、実行する前に中身を読んでください。**
パイプでそのままシェルに流さない書き方にしてあるのは、そのためです。

[リリースページ](https://github.com/kwaka1208/marche-kit/releases)から
`marche-kit-<版>-site-<テーマ>.zip` を直接落として解凍しても同じです。
**中身は公開ディレクトリの形に組み立て済み**なので、並べ替えは要りません。

### 2. 書く — 3ファイルだけ

```bash
cd marche-kit-<版>-site-default
make env          # .env ができる
```

書き換えるのはこの3つです。ほかのファイルは触りません。

| ファイル | 何を書くか |
|---|---|
| `.env` | 管理キー・通知先メールアドレス・**サーバーの接続先** |
| `site/marche.config.json` | イベント名・会場・開催日 |
| `site/data/shops.json` | 出店者のID一覧 |

サーバーの接続先は `.env` の `DEPLOY_*` です。SSHが使えるなら `rsync`、
FTPしか使えないレンタルサーバーなら `ftp` を選びます（`lftp` が要ります）。

**商品情報は既定で載りません。** 出店者の紹介だけで完結する催しを素の状態にしているためです。
載せるなら `marche.config.json` に `"items": { "display": "list" }` の1行を足します。

### 3. 送る

```bash
make setup          # 秘密情報を注入して、書いた内容を検証する
make deploy-init    # サーバーへ送り、パーミッションを整える
```

2回目以降は `make deploy` です。**こちらは出店者が保存した内容を上書きしません。**

### 動いたか確かめる

| URL | 誰が使うか |
|---|---|
| `/` | 来場者 |
| `/editor/` | 各出店者（伝えるのは**編集画面のURLと店舗IDの2つだけ**） |
| `/editor/news/` | 運営（お知らせの追加。管理キーが要ります） |

`/?fixed` を付けると表示順のシャッフルが止まるので、確認中は楽です。

うまくいかないときは [docs/setup.md の「つまずきやすいところ」](docs/setup.md#つまずきやすいところ)を見てください。
展開したフォルダの `START-HERE.md` にも同じ手順が入っています。

---

**ここから先は、テーマを作る・中身を変える人向けです。**

## 3つの層

marche-kit はマルシェの構造をそのまま設計に借りています。

| 層 | フランス語の意味 | 中身 | 差し替え |
|---|---|---|---|
| **Halle** (`core/`) | 市場の屋根・共通の骨組み | PHPバックエンド、描画JS、エディタ、文言辞書 | しない |
| **Étal** (運用データ) | 各店の陳列台 | 出店者ごとのJSONと画像 | イベントごと |
| **Auvent** (`themes/`) | 掛け替える日よけの布 | CSS、レイアウト、フォント、配色 | 自由 |

テーマは2つ入っています。中立な [`default/`](themes/default/) と、
暗い配色でナビを画面下に固定した [`night-market/`](themes/night-market/) です。
**同じコア・同じDOMのまま、CSSだけで見た目がここまで変わります。**

Halle と Auvent の境界は「**コアはクラス名を出力する。見た目は決めない**」の一線で引いています。
詳しくは [docs/concepts.md](docs/concepts.md) を参照してください。

## 動かしてみる

架空のイベントのサンプルが入っています。既定テーマを当てた状態で動きます。

```bash
cd examples/demo-default
python3 -m http.server 8000
```

<http://localhost:8000/?fixed> を開いてください。
何が確認できるかは [examples/demo-default/README.md](examples/demo-default/README.md) にあります。

**同じデータをテーマ無しで表示するサンプル**も入っています（`examples/demo/`）。
見た目を何も与えなくてもデータが正しく出ることの確認で、
[コアにテーマが混ざっていないことの試験](examples/README.md)を兼ねています。

## 使い方（カスタマイズする場合）

テンプレート方式です。npmの依存として入れるのではなく、一式をコピーして使います。
PHPを含むこと、そしてイベントごとにカスタマイズする前提が強いためです。

**立ち上げるだけなら[最短で公開する](#最短で公開する)で足ります。**
ここから下は、テーマを自作する・コアを読む・素材一式から組み立てる人向けです。

### zip を取る（gitは要りません）

[リリース](https://github.com/kwaka1208/marche-kit/releases)に3つのzipがあります。

| zip | 中身 | 向き |
|---|---|---|
| `marche-kit-<版>-site-default.zip` | **公開ディレクトリの形まで組み立て済み**（中立なテーマ） | 立ち上げるだけ |
| `marche-kit-<版>-site-night-market.zip` | 同じものを、暗い配色のテーマで | 同上 |
| `marche-kit-<版>.zip` | 素材一式。テーマ2種・デモ・ドキュメントが全部入る | **カスタマイズする** |

**テーマを自分で作る、コアを読む、というときは素材一式のほうです。**
配置済みのzipには `themes/` も `core/` も入っていません。

```bash
bash fetch-release.sh --source    # 素材一式を取る
```

配置済みzipの使い方は[最短で公開する](#最短で公開する)にあります。

### git で取る

**gitは要りません。** cloneは素材一式を取る手段の一つで、zipと結果は同じです。

```bash
git clone https://github.com/kwaka1208/marche-kit my-event
cd my-event && rm -rf .git && git init
```

`rm -rf .git` で**上流の履歴を捨てています。** フォークでも依存でもなく、
ここから先は自分のイベントのリポジトリだ、という区切りです。
続く `git init` は、イベントの設定を自分で版管理したい人向けの任意の操作です。
版管理しないなら省いて構いません。

> `cd my-event && rm -rf .git` を `&&` でつないでいるのは、
> **cloneが失敗したときに、いま居るディレクトリの `.git` を消さないため**です。

素材一式のzipと同じ中身になります。**この場合も、公開ディレクトリの組み立ては
自分で行います**（[docs/setup.md](docs/setup.md) の手順2）。

年度やイベントの設定は `marche.config.json` の1ファイルに集約されています。
開催日・商品情報を出すかどうか・商品カテゴリ・対価の単位・表示文言の言語は、すべてここで決まります。

**商品情報は既定で載りません。** 出店者の紹介だけで完結する催しを素の状態としているためです。
載せるイベントは `"items": { "display": "list" }` の1行を書きます
（店舗ポップアップからだけ見せるなら `"popup"`。[理由](docs/decisions.md)）。

通知先メールアドレス・管理キー・Webhook URLは `.env` に置き、配置時に流し込みます。

```bash
cp .env.example .env                        # 値を記入する
python3 tools/inject-env.py <配置先ディレクトリ>
```

**リポジトリのファイルには実運用の値を書きません。**

公開ディレクトリの組み立て方・パーミッション・動作確認の手順は
**[docs/setup.md](docs/setup.md)** にまとめてあります。

### make でまとめて行う

組み立て・注入・検証・サーバーへの転送は `Makefile` から呼べます。
**やっていることは docs/setup.md の手順そのまま**で、`tools/` のスクリプトを順に叩くだけです。

```bash
make env            # .env.example から .env を作る
                    # → .env に管理キー・通知先メール・サーバーの接続先を書く
make build          # 組み立て → 秘密情報の注入 → 検証
                    # → build/site/ の設定ファイルにイベントの内容を書く
make deploy-init    # 初回。サーバーへ送ってパーミッションを整える
make deploy         # 2回目以降。**出店者が書き込んだ内容は上書きしない**
```

`make help` で一覧が出ます。テーマと配置先は変数で変えられます
（`make build THEME=night-market SITE=../my-event-site`）。

転送は3方式から選べます（`.env` の `DEPLOY_METHOD`）。

| 方式 | 使うとき |
|---|---|
| `rsync` | SSHが使えるサーバー。差分だけ送るので速い（推奨） |
| `sftp` | SSHは使えるが rsync が入っていないサーバー |
| `ftp` | FTPしか使えないレンタルサーバー。`lftp` が要ります |

**`data/shop-data/` と `data/news.json` は、`make deploy` では送りません。**
出店者と運営がサーバー側で書き込むファイルなので、手元の古い内容で上書きすると消えるためです。

配置済みzipにも同じ Makefile が入っています。そちらは `site/` が組み立て済みなので、
`make env` → `make setup` → `make deploy-init` の3つで済みます。

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/concepts.md](docs/concepts.md) | 3層モデルと設計思想。まずここから |
| [docs/setup.md](docs/setup.md) | セットアップ手順。配置・パーミッション・動作確認 |
| [docs/decisions.md](docs/decisions.md) | 設計上の決定と、その理由 |
| [docs/data-contract.md](docs/data-contract.md) | データ仕様。JSONの形式とサーバー側の検証 |
| [docs/theme-contract.md](docs/theme-contract.md) | テーマ仕様。CSS変数、クラス名、コアが探すスロット |
| [docs/roadmap.md](docs/roadmap.md) | 実装の段階 |
| [schema/](schema/) | JSON Schema（形式の正） |
| [core/README.md](core/README.md) | コアが守る約束 |
| [core/php/README.md](core/php/README.md) | サーバー側の配置と検証 |
| [core/editor/README.md](core/editor/README.md) | 編集画面の配置とアクセス制御 |
| [examples/demo-default/README.md](examples/demo-default/README.md) | 動くサンプル（既定テーマを当てた状態）。動かし方 |
| [examples/demo/README.md](examples/demo/README.md) | 動くサンプル（テーマ無し）。確認できることの一覧 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 貢献の手引き。コアとテーマの境界、送る前の確認 |

## データの検証

仕様どおりのデータになっているかを確認できます。外部ライブラリは不要です。

```bash
python3 tools/validate.py <サイトの公開ディレクトリ>
```

店舗IDの不整合、商品IDの形式違反、HTMLタグの混入、未定義の販売日、画像ファイルの欠落
などをまとめて報告します。データを手で編集したあとに実行してください。

**テーマのスロットとも突き合わせます。** `index.html` を読み、定義したカテゴリに
出しどころがあるかを確かめます。**スロットを置き忘れると、その区分の出店者は
サイトに出ないまま気づけません。**

## 出自

奈良クラフトビール祭り公式サイト（[naracraft.beer](https://naracraft.beer)）で
実際に運用している仕組みを、他のイベントでも使えるように切り出したものです。
本家サイトは引き続き独立したリポジトリで運用しています。

## ライセンス

MIT
