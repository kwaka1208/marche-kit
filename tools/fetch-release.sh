#!/usr/bin/env bash
#
# marche-kit のリリースzipを取ってきて展開する
#
#     bash fetch-release.sh [オプション]
#
# オプション:
#   --version <版>   取る版。既定は最新リリース（例: v0.9.0）
#   --theme <名前>   テーマ。default か night-market。既定は default
#   --dest <場所>    展開先。既定は marche-kit-<版>-site-<テーマ>
#   --source         配置済みではなく**素材一式**（テーマもコアも入った版）を取る
#
# git は要りません。curl と unzip があれば動きます。
#
# このファイル1つだけあれば動くので、リポジトリを持っていなくても使えます。
#
#     curl -fsSLO https://raw.githubusercontent.com/kwaka1208/marche-kit/main/tools/fetch-release.sh
#     bash fetch-release.sh
#
# **中身を読んでから実行してください。** ダウンロードしたスクリプトをそのまま
# パイプでシェルに流すのは、何が走るか分からないので勧めません。

set -euo pipefail

REPO="${REPO:-kwaka1208/marche-kit}"

VERSION=""
THEME="default"
DEST=""
KIND="site"

die  () { printf '\033[31mエラー:\033[0m %s\n' "$*" >&2; exit 1; }
note () { printf '\033[36m▸\033[0m %s\n' "$*"; }

usage () {
    sed -n '/^# marche-kit のリリース/,/^$/p' "${BASH_SOURCE[0]}" >&2
    exit 1
}

while [ $# -gt 0 ]; do
    case "$1" in
        --version) VERSION="${2:-}"; shift 2 ;;
        --theme)   THEME="${2:-}";   shift 2 ;;
        --dest)    DEST="${2:-}";    shift 2 ;;
        --source)  KIND="source";    shift ;;
        -h|--help) usage ;;
        *) die "知らないオプションです: $1（--help で一覧）" ;;
    esac
done

command -v curl  >/dev/null || die "curl がありません"
command -v unzip >/dev/null || die "unzip がありません"

case "$THEME" in
    default|night-market) ;;
    *) die "テーマは default か night-market です（受け取った値: $THEME）" ;;
esac

# ------------------------------------------------------------------ 版を決める

# 最新リリースのタグを GitHub の API から引く。jq は使わない
latest_tag () {
    local json
    json="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest")" \
        || die "最新リリースを取れませんでした（$REPO にリリースがあるか、ネットに繋がるか確認してください）"

    if command -v python3 >/dev/null; then
        printf '%s' "$json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])'
    else
        printf '%s' "$json" | tr ',' '\n' | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1
    fi
}

if [ -z "$VERSION" ]; then
    note "最新リリースを調べます"
    VERSION="$(latest_tag)"
    [ -n "$VERSION" ] || die "最新リリースのタグを読み取れませんでした。--version で指定してください"
fi

# v が付いていなければ足す（リリースzipの名前が v 付きのため）
case "$VERSION" in v*) ;; *) VERSION="v$VERSION" ;; esac

# ------------------------------------------------------------------ 取ってくる

if [ "$KIND" = "source" ]; then
    ZIP="marche-kit-${VERSION}.zip"
    INNER="marche-kit-${VERSION}"
else
    ZIP="marche-kit-${VERSION}-site-${THEME}.zip"
    INNER="marche-kit-${VERSION}-site-${THEME}"
fi

DEST="${DEST:-$INNER}"
URL="https://github.com/$REPO/releases/download/$VERSION/$ZIP"

[ ! -e "$DEST" ] || die "$DEST がすでにあります。--dest で別の場所を指すか、先に消してください"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

note "$VERSION を取ってきます"
echo "    $URL"
curl -fSL --progress-bar -o "$TMP/$ZIP" "$URL" \
    || die "取れませんでした。版とテーマの組み合わせが正しいか確認してください
    リリース一覧: https://github.com/$REPO/releases"

note "展開します"
unzip -q "$TMP/$ZIP" -d "$TMP/x"

[ -d "$TMP/x/$INNER" ] || die "zip の中身が想定と違います（$INNER が見当たりません）"

mkdir -p "$(dirname "$DEST")"
mv "$TMP/x/$INNER" "$DEST"

# ------------------------------------------------------------------ 案内

echo
note "$DEST/ に展開しました"
echo

if [ "$KIND" = "source" ]; then
    cat <<EOF
  素材一式です。テーマもコアも入っています。

      cd $DEST
      make env            .env を作る（接続先と管理キーを書く）
      make build          公開ディレクトリの形に組み立てて検証する
      make deploy-init    サーバーへ送る

  くわしくは README.md と docs/setup.md を見てください。
EOF
else
    cat <<EOF
  $THEME テーマで、公開ディレクトリの形まで組み立ててあります。

      cd $DEST
      make env            .env を作る（接続先と管理キーを書く）
                          → site/marche.config.json と site/data/shops.json を書く
      make validate       書いた内容を検証する
      make deploy-init    サーバーへ送る

  まず START-HERE.md を読んでください。何をどこに書くかが1枚にまとまっています。
EOF
fi
echo
