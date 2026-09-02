# examples/demo — 動く最小サンプル

架空のイベント「みどり野マルシェ」です。**テーマ（デザイン）は当てていません。**

デモは飾りではなく、[分離できているかの実質的なテスト](../README.md)です。
素の状態でデータが正しく出るなら、コアにテーマは混ざっていません。

**見た目を確かめたいなら [`demo-default/`](../demo-default/README.md) を見てください。**
データも設定もこのデモと同じで、`themes/default/` を当てただけのものです。

## 動かす

```bash
cd examples/demo
python3 -m http.server 8000
```

- 既定（2日開催・金額表示・商品一覧あり） … <http://localhost:8000/?fixed>
- チケット運用 … <http://localhost:8000/variants/ticket/?fixed>
- 1日開催 … <http://localhost:8000/variants/oneday/?fixed>
- 商品は店舗からのリンクのみ … <http://localhost:8000/variants/popup-only/?fixed>
- 商品情報なし（**キットの既定**） … <http://localhost:8000/variants/no-items/?fixed>

`?fixed` は表示順のシャッフルを止めます。付けないと毎回並びが変わります。

**問い合わせフォームはモックモードで動きます**（`marche.config.json` の `forms.endpoint` が空）。
送信すると、実際には送らずに内容をコンソールへ出して完了表示に切り替わります。
PHPを置かずに、入力・検証・確認モーダルまで確かめられます。

`js/` と `i18n/` は `core/js` と `core/i18n` へのシンボリックリンクです。
**コアを直すとそのまま反映されます。**
シンボリックリンクが使えない環境では、両フォルダの中身をコピーしてください。

## 入っているもの

| | 中身 |
|---|---|
| 出店者 | 3店（`hinata-coffee` / `kogumado` / `mori-no-kitchen`） |
| 出店者カテゴリ | 2種（出店ブース `stalls` / キッチンカー `foodtrucks`） |
| 商品 | 8件（うちサイトに出るのは6件） |
| 商品カテゴリ | 2種（ドリンク `drink` / フード `food`） |
| お知らせ | 3件（`visibleCount` は2） |
| イベント公式のSNS | 4件（`site.social`。うち1件はコアが名前を知らないID） |
| 問い合わせフォーム | 1種9項目（`forms/contact.json`）。**モックモードで動く** |

## 確認できること

データはコアの分岐をひととおり踏むように作ってあります。

| 見るもの | どこに出るか |
|---|---|
| 販売終了は消える | `kogumado-2`（`status: ended`）が一覧にもポップアップにも出ない |
| 対価未設定も消える | `kogumado-3`（`price` なし）が同じく出ない |
| 完売は残る | `hinata-coffee-2` に「完売しました」が付いたまま残る |
| 販売日限定 | `hinata-coffee-3` に「3日(土)のみ」が付く |
| 対価の3要素 | 「500」「円」「税込」が別々の要素で出る |
| 店名の改行 | 「ひなた／コーヒー」が2行になる（データは `\n`） |
| ロゴ未設定 | 小熊堂は `images/noimage/shop.svg` が出る |
| URL未設定 | 小熊堂には公式サイトのリンクが出ない |
| 紹介文なし | 森のキッチンは店舗ポップアップの紹介文が隠れる |
| カテゴリのスロット | `index.html` の `data-marche-shops` を1行足すだけで区分が増える |
| `variant` | キッチンカーのカードに `shop-card--feature` が付く |
| フィルタ | ボタンが `itemCategories` から作られる |
| お知らせ | 最新1件に NEW、`visibleCount` を超えた1件が「過去のお知らせ」に入る |
| もっと見る | 画面幅を狭めて1列にすると、3件で折りたたまれる |
| ポップアップの行き来 | 店舗 → 商品 → 「この店の他の商品」と移れる |
| 商品の掲載範囲 | `items.display` が `list`。`variants/` の2つで `popup` と `none` を確かめられる |
| SNSのリンク | フッターに4件。`公式チャンネル` は `label` の上書き、`midorino-bbs` はコアが名前を知らないID |
| フォームの全項目 | `text` / `email` / `tel` / `select` / `radio` / `checkbox` / `textarea` / `consent` / `hidden` が1つずつ |
| 隠し項目 | `pageUrl` が送信元URLを自動で拾う（`capture`）。確認画面には出ない |
| 確認画面のラベル | 「出店について」と出る（送信値の `exhibit` ではない） |
| おとり欄 | `.courier-honeypot` が画面の外にある。埋めて送ると、送信せず完了したように見える |

## デザインを当てていない

読み込んでいるCSSは `mechanics.css` だけです。**これはテーマではありません。**
コアが状態クラスと `hidden` 属性で伝えるだけの箇所——ポップアップ・FAQ・過去のお知らせの開閉、
スクロール抑止、商品グリッドを `grid` にすること、フォームのおとり欄を画面の外へ置くこと——の
最小形だけを書いています。
配色・余白・フォント・カードの形は1行も書いていません。

つまり `mechanics.css` は、**テーマを作るときに最低限必要な仕掛けの一覧**でもあります。
一覧と理由は[テーマ仕様の「テーマが用意する仕掛け」](../../docs/theme-contract.md#テーマが用意する仕掛け)、
見た目の作り方は [`themes/default/`](../../themes/default/) を参照してください。

## 別の設定で確かめる

`variants/` の下は、それぞれが独立した公開ディレクトリです。
違うのは `marche.config.json` だけで、`index.html` もCSSもコアもリンクで共有しています。

| | 何を確かめるか |
|---|---|
| `variants/ticket/` | `pricing.mode: "ticket"` で対価が「2枚」になり、但し書きが消え、「チケット1枚 300円」の案内が出る |
| `variants/oneday/` | `days` が1件のとき、販売日の表記（「3日(土)のみ」）がどこにも出ない |
| `variants/popup-only/` | `items.display: "popup"` で商品一覧のセクションが消え、**店舗ポップアップの取り扱いからだけ**商品を開ける |
| `variants/no-items/` | `items` を書かないとき（**キットの既定**）、商品がどこにも出ない。取り扱いの区画も消える |

**後ろの2つは、データを変えずに掲載範囲だけを変えています。**
`data/` は既定のデモと共有しているので、商品は8件登録されたままです。
`items.display` を戻せば、同じ商品がそのまま出ます
（`tools/validate.py` は「商品が8件あるが出ません」と知らせます）。

商品を出さない設定では、**ナビゲーションの「商品」も一緒に消えます。**
セクションが `data-marche-items-section` で包まれているためです（[テーマ仕様](../../docs/theme-contract.md)）。

`variants/` のどれも `site.social` を持ちません。**SNSを設定していないイベントでスロットごと隠れること**の確認を兼ねています。

`forms/` も持ちません。**フォームの定義が読めないとき、見出しごとセクションが隠れること**の確認を兼ねています
（`data-marche-form-section`）。

チケット運用は対価が枚数になるため、データも専用のものを置いています
（金額のデータをそのまま枚数として読むと「900枚」になってしまうため）。
残りの3つは既定のデモとデータを共有しています。

## データの検証

5つとも仕様に合っていることを確認できます。

```bash
python3 tools/validate.py examples/demo
python3 tools/validate.py examples/demo/variants/ticket
python3 tools/validate.py examples/demo/variants/oneday
python3 tools/validate.py examples/demo/variants/popup-only
python3 tools/validate.py examples/demo/variants/no-items
```

## 実在のものは入っていません

店舗名・紹介文・URL・お知らせはすべて架空です。
画像は動作確認用に生成したプレースホルダで、写真ではありません。
