#!/usr/bin/env bash
#
# marche-kit リリース用zipの組み立て
#
#     bash tools/build-release.sh [バージョン]
#
# dist/ に3つのzipを作る。
#
#     marche-kit-<ver>.zip                    素材一式（リポジトリ相当）
#     marche-kit-<ver>-site-default.zip       default テーマで配置済み
#     marche-kit-<ver>-site-night-market.zip  night-market テーマで配置済み
#
# 「配置済み」は docs/setup.md の手順2（公開ディレクトリの組み立て）を済ませた形。
# 利用者は解凍して設定を書き、site/ の中身をサーバーへ上げるだけでよい。
#
# **シンボリックリンクはすべて実体に展開する。** リポジトリの中では
# examples/ や themes/ の参照をリンクで済ませているが、zipのまま
# Windowsへ持っていくと壊れるため。
#
# .github/workflows/release.yml がタグのpushでこれを呼ぶ。手元でも同じzipを作れる。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 版は引数で受ける。省略したときは VERSION ファイルを見る。
# そこが版番号の形（1.0.0）でなければ dev 扱いにする（.github/workflows/release.yml と同じ判定）
default_version () {
    local v
    [ -f VERSION ] || { echo dev; return; }
    v="$(tr -d ' \t\r\n' < VERSION)"
    if printf '%s' "$v" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$'; then
        echo "v$v"
    else
        echo dev
    fi
}

VERSION="${1:-$(default_version)}"
NAME="marche-kit-${VERSION}"
DIST="$ROOT/dist"
WORK="$DIST/.work"

command -v zip >/dev/null || { echo "zip コマンドが要ります" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 が要ります" >&2; exit 1; }

rm -rf "$WORK"
mkdir -p "$WORK"
rm -f "$DIST"/*.zip

# 配布物に入れないもの。開発用の設定と、実運用の値が入りうるファイル
EXCLUDES=(
    --exclude=.git
    --exclude=.github
    --exclude=dist
    --exclude=.DS_Store
    --exclude=__pycache__
    --exclude=.env
    --exclude=.env.local
    --exclude=secrets.php
)

# ---------------------------------------------------------------- 素材zip

echo "▸ 素材zip を組み立てる"
SRC="$WORK/$NAME"
mkdir -p "$SRC"
# -L でシンボリックリンクを実体に展開する
rsync -aL "${EXCLUDES[@]}" "$ROOT"/ "$SRC"/

# ------------------------------------------------------- テーマごとの配置済みzip

build_site () {
    local theme="$1"
    local base="$WORK/${NAME}-site-${theme}"
    local site="$base/site"

    echo "▸ 配置済みzip を組み立てる（${theme}）"

    mkdir -p "$site"/{css,js,i18n,editor,forms,data/shop-data} "$base/tools"

    # テーマ（docs/setup.md 手順2と同じ配置）
    cp "themes/$theme/index.html" "$site"/
    cp "themes/$theme"/*.css      "$site"/css/
    rsync -aL "themes/$theme/images"/ "$site"/images/

    # コア。編集しない
    rsync -aL core/js/     "$site"/js/
    rsync -aL core/i18n/   "$site"/i18n/
    rsync -aL core/editor/ "$site"/editor/
    cp core/php/config.php core/php/shop-upload.php \
       core/php/put-json.php core/php/send.php "$site"/data/

    # 問い合わせフォームの項目定義。そのまま使えるものを見本として入れる
    cp examples/demo/forms/contact.json "$site"/forms/

    # 出店者が保存するまで空。zipで空フォルダが落ちる展開ツールがあるので目印を置く
    printf '%s\n' \
        'このフォルダは出店者が保存した内容の置き場です。' \
        '中身は編集画面から作られるので、最初は空のままでかまいません。' \
        > "$site/data/shop-data/README.txt"

    echo '[]' > "$site/data/news.json"

    # 秘密情報の注入と検証に使う。**公開ディレクトリには置かない**ので site/ の外
    cp tools/inject-env.py tools/validate.py "$base/tools"/
    cp .env.example LICENSE "$base"/
    rsync -aL docs/ "$base/docs"/

    # python3 が無い環境では、これを写して secrets.php を手で作る。
    # **site/ の中には置かない**（見本とはいえ受け皿を公開したくない）
    cp core/php/secrets.example.php "$base"/

    # 設定とロスターの雛形を作る（テーマのスロットに合わせる）
    python3 tools/make-templates.py "$theme" "$site"

    # 案内。テーマ名とバージョンを差し込む
    sed -e "s/__VERSION__/$VERSION/g" -e "s/__THEME__/$theme/g" \
        tools/release/START-HERE.md > "$base/START-HERE.md"

    # 組み立てた結果が仕様に合っているかを、その場で確かめる
    python3 tools/validate.py "$site" >/dev/null || {
        echo "組み立てた site/ が検証を通りませんでした（${theme}）" >&2
        exit 1
    }
}

build_site default
build_site night-market

# ---------------------------------------------------------------- zipにする

echo "▸ zip にする"
(
    cd "$WORK"
    for dir in */; do
        dir="${dir%/}"
        zip -rq "$DIST/${dir}.zip" "$dir"
    done
)

rm -rf "$WORK"

echo
echo "できました（${VERSION}）"
ls -lh "$DIST"/*.zip | awk '{ printf "  %-46s %s\n", $9, $5 }'
