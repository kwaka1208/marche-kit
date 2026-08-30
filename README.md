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

架空のイベントのサンプルが入っています。テーマを当てない素の状態で動きます。

```bash
cd examples/demo
python3 -m http.server 8000
```

<http://localhost:8000/?fixed> を開いてください。
何が確認できるかは [examples/demo/README.md](examples/demo/README.md) にあります。

## 使い方

テンプレート方式です。npmの依存として入れるのではなく、リポジトリごとコピーして使います。
PHPを含むこと、そしてイベントごとにカスタマイズする前提が強いためです。

```bash
git clone https://github.com/kwaka1208/marche-kit my-event
cd my-event
rm -rf .git && git init
```

年度やイベントの設定は `marche.config.json` の1ファイルに集約されています。
開催日・商品カテゴリ・対価の単位・表示文言の言語は、すべてここで決まります。

通知先メールアドレス・管理キー・Webhook URLは `.env` に置き、配置時に流し込みます。

```bash
cp .env.example .env                        # 値を記入する
python3 tools/inject-env.py <配置先ディレクトリ>
```

**リポジトリのファイルには実運用の値を書きません。**

公開ディレクトリの組み立て方・パーミッション・動作確認の手順は
**[docs/setup.md](docs/setup.md)** にまとめてあります。

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
| [examples/demo/README.md](examples/demo/README.md) | 動くサンプル。動かし方と確認できること |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 貢献の手引き。コアとテーマの境界、送る前の確認 |

## データの検証

仕様どおりのデータになっているかを確認できます。外部ライブラリは不要です。

```bash
python3 tools/validate.py <サイトの公開ディレクトリ>
```

店舗IDの不整合、商品IDの形式違反、HTMLタグの混入、未定義の販売日、画像ファイルの欠落
などをまとめて報告します。データを手で編集したあとに実行してください。

## 出自

奈良クラフトビール祭り公式サイト（[naracraft.beer](https://naracraft.beer)）で
実際に運用している仕組みを、他のイベントでも使えるように切り出したものです。
本家サイトは引き続き独立したリポジトリで運用しています。

## ライセンス

MIT
