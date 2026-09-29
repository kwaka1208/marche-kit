#!/usr/bin/env bash
#
# marche-kit 配置用ディレクトリをサーバーへ送る
#
#     bash tools/deploy.sh <配置用ディレクトリ> <動作>
#
# 接続先は .env の DEPLOY_* を読む（書き方は .env.example）。
# tools/inject-env.py は MARCHE_ で始まる行しか読まないので、同じ .env に同居できる。
#
# 転送は3方式。.env の DEPLOY_METHOD で選ぶ。
#
#   rsync   SSHが使えるサーバー。差分だけ送るので速い（推奨）
#   sftp    SSHは使えるが rsync が入っていないサーバー。毎回すべて送る
#   ftp     FTPしか使えないレンタルサーバー。lftp が要る
#
# **サーバー側で育つファイル**（出店者と運営が書き込む）は update / prune で送らない。
# 手元の古い内容で上書きすると、出店者が保存した内容が消えるため。
#
#   data/shop-data/   出店者が保存した紹介文・商品・画像
#   data/news.json    運営が追加したお知らせ
#
# macOS 標準の bash 3.2 でも動くように書いている（連想配列や ${v@Q} を使わない）。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SITE="${1:-}"
MODE="${2:-}"

# サーバー側で育つもの。<配置用ディレクトリ> からの相対パス
GROWN="data/shop-data data/news.json"

die  () { printf '\033[31mエラー:\033[0m %s\n' "$*" >&2; exit 1; }
note () { printf '\033[36m▸\033[0m %s\n' "$*"; }
warn () { printf '\033[33m注意:\033[0m %s\n' "$*" >&2; }

usage () {
    cat >&2 <<'USAGE'
使い方: bash tools/deploy.sh <配置用ディレクトリ> <動作>

動作:
  dry          送らずに、何が変わるかだけ見る
  init         初回。中身をすべて送る
  update       2回目以降。サーバー側で育つファイルを除いて送る
  prune        update に加えて、サーバー側に残った余計なファイルを消す
  permissions  パーミッションだけ整える

接続先は .env の DEPLOY_* に書きます（.env.example を参照）。
確認を省いて走らせるときは YES=1 を付けてください。
USAGE
    exit 1
}

[ -n "$SITE" ] && [ -n "$MODE" ] || usage

case "$MODE" in
    dry|init|update|prune|permissions) ;;
    *) die "動作は dry / init / update / prune / permissions のどれかです（受け取った値: $MODE）" ;;
esac

[ -d "$SITE" ] || die "$SITE がありません。先に配置用ディレクトリを組み立ててください"
SITE="$(cd "$SITE" && pwd)"

# ------------------------------------------------------------------ .env を読む

ENV_FILE="${ENV_FILE:-$ROOT/.env}"

[ -f "$ENV_FILE" ] || die "$ENV_FILE がありません（.env.example をコピーして作成してください）"

# DEPLOY_ で始まる行だけを拾う。前後の空白と引用符は外す
while IFS= read -r line || [ -n "$line" ]; do
    line="${line#"${line%%[![:space:]]*}"}"
    case "$line" in DEPLOY_*=*) ;; *) continue ;; esac
    key="${line%%=*}"
    case "$key" in *[!A-Za-z0-9_]*) continue ;; esac
    value="${line#*=}"
    value="${value#"${value%%[![:space:]]*}"}"   # 前の空白を落とす
    value="${value%"${value##*[![:space:]]}"}"   # 後ろの空白を落とす
    case "$value" in
        \"*\") value="${value#\"}"; value="${value%\"}" ;;
        \'*\') value="${value#\'}"; value="${value%\'}" ;;
    esac
    printf -v "$key" '%s' "$value"
done < "$ENV_FILE"

METHOD="${DEPLOY_METHOD:-rsync}"
HOST="${DEPLOY_HOST:-}"
LOGIN="${DEPLOY_USER:-}"
PORT="${DEPLOY_PORT:-}"
REMOTE="${DEPLOY_PATH:-}"
KEY="${DEPLOY_KEY:-}"
PASSWORD="${DEPLOY_PASSWORD:-}"
FTP_INSECURE="${DEPLOY_FTP_INSECURE:-}"

case "$METHOD" in
    rsync|sftp|ftp) ;;
    *) die ".env の DEPLOY_METHOD は rsync / sftp / ftp のどれかです（受け取った値: $METHOD）" ;;
esac

[ -n "$HOST" ]   || die ".env の DEPLOY_HOST が空です"
[ -n "$LOGIN" ]  || die ".env の DEPLOY_USER が空です"
[ -n "$REMOTE" ] || die ".env の DEPLOY_PATH が空です（サーバーの公開ディレクトリ）"

REMOTE="${REMOTE%/}"          # 末尾のスラッシュを落として揃える

case "$KEY" in "~/"*) KEY="$HOME/${KEY#\~/}" ;; esac
[ -z "$KEY" ] || [ -f "$KEY" ] || die "DEPLOY_KEY に指定された $KEY がありません"

# ------------------------------------------------------------------ 送る対象を決める

# init 以外では、サーバー側で育つものを一覧から落とす
filter_grown () {
    if [ "$MODE" = "init" ]; then cat; return; fi
    local pattern="" path
    for path in $GROWN; do
        pattern="${pattern}${pattern:+|}^${path}(/|\$)"
    done
    grep -Ev "$pattern"
}

# 送る対象のファイル一覧（<配置用> からの相対パス）
list_files () {
    ( cd "$SITE" && find . -type f ! -name '.DS_Store' | sed 's|^\./||' | sort ) | filter_grown
}

# 送る対象のディレクトリ一覧。親が先に来るよう浅い順に並べる
list_dirs () {
    ( cd "$SITE" && find . -mindepth 1 -type d | sed 's|^\./||' ) | filter_grown \
        | awk '{ print gsub("/", "/"), $0 }' | sort -n -k1,1 -k2,2 | cut -d' ' -f2-
}

# ------------------------------------------------------------------ 確認を取る

confirm () {
    printf '\n'
    printf '  方式      %s\n' "$METHOD"
    printf '  送信先    %s@%s:%s\n' "$LOGIN" "$HOST" "$REMOTE"
    printf '  送るもの  %s/\n' "$SITE"
    printf '  動作      %s\n' "$1"
    printf '\n'

    if [ "${YES:-}" = "1" ]; then
        note "YES=1 のため確認を省きます"
        return 0
    fi

    local answer=""
    if [ -t 0 ]; then
        read -r -p "進めますか？ [y/N] " answer
    elif [ -e /dev/tty ]; then
        read -r -p "進めますか？ [y/N] " answer < /dev/tty
    else
        die "確認が取れません（対話端末がありません）。非対話で走らせるなら YES=1 を付けてください"
    fi

    case "$answer" in
        y|Y|yes|YES) ;;
        *) echo "やめました"; exit 1 ;;
    esac
}

# ------------------------------------------------------------------ 転送: rsync

deploy_rsync () {
    command -v rsync >/dev/null || die "rsync がありません"

    local ssh_cmd="ssh"
    [ -z "$PORT" ] || ssh_cmd="$ssh_cmd -p $PORT"
    [ -z "$KEY" ]  || ssh_cmd="$ssh_cmd -i '$KEY'"

    # --no-perms: 手元のパーミッションを押し付けない（サーバー側の既定に任せる）
    local args
    args=(-rlt --no-perms --no-owner --no-group -v -e "$ssh_cmd")

    case "$MODE" in
        dry)   args=("${args[@]}" --dry-run --itemize-changes) ;;
        prune) args=("${args[@]}" --delete) ;;
    esac

    # --exclude したものは --delete の対象からも外れる
    if [ "$MODE" != "init" ]; then
        local path
        for path in $GROWN; do
            args=("${args[@]}" --exclude "/$path")
        done
    fi

    rsync "${args[@]}" "$SITE"/ "$LOGIN@$HOST:$REMOTE/"
}

# ------------------------------------------------------------------ 転送: sftp

ssh_opts () {
    [ -z "$PORT" ] || printf ' -P %s' "$PORT"
    [ -z "$KEY" ]  || printf ' -i %s' "$KEY"
}

# sftp には差分転送も除外もないので、送るファイルを自分で並べてバッチを組む。
# 先頭の - は「失敗しても続ける」の意味。すでにあるディレクトリで止まらないようにする。
deploy_sftp () {
    command -v sftp >/dev/null || die "sftp がありません"

    if [ "$MODE" = "dry" ]; then
        note "送るファイル（sftp は差分を見られないので、対象の一覧を出します）"
        list_files | sed 's/^/  /'
        return
    fi

    [ "$MODE" != "prune" ] || die \
        "sftp では prune（サーバー側の削除）はできません。rsync か ftp を使ってください"

    {
        list_dirs  | while IFS= read -r d; do printf -- '-mkdir "%s/%s"\n' "$REMOTE" "$d"; done
        list_files | while IFS= read -r f; do printf -- 'put "%s/%s" "%s/%s"\n' "$SITE" "$f" "$REMOTE" "$f"; done
    } | sftp $(ssh_opts) -b - "$LOGIN@$HOST"
}

# ------------------------------------------------------------------ 転送: ftp

# lftp のスクリプトはシェルの変数を展開しない。値は必ずここで引用符に包んでから渡す
lftp_quote () {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    printf '"%s"' "$s"
}

lftp_run () {
    local script="$1"
    local open="open"

    [ -z "$PORT" ] || open="$open -p $PORT"
    open="$open -u $(lftp_quote "$LOGIN")"
    # パスワードはコマンド行に置かない（ps で見えるため）。環境変数から読ませる
    [ -z "$PASSWORD" ] || open="$open --env-password"
    open="$open $(lftp_quote "$HOST")"

    local prelude="set cmd:interactive no"
    if [ -n "$FTP_INSECURE" ]; then
        # 自己署名証明書のサーバー向け。**通信の中身が保護されなくなる**
        prelude="$prelude
set ssl:verify-certificate no"
    fi

    LFTP_PASSWORD="$PASSWORD" lftp -c "$prelude
$open
$script
bye"
}

deploy_ftp () {
    command -v lftp >/dev/null || die \
"lftp がありません。FTPで送るには lftp が要ります。

    macOS   brew install lftp
    Debian  sudo apt install lftp

SSHが使えるサーバーなら、.env の DEPLOY_METHOD を rsync にするほうが速くて確実です。"

    local cmd="mirror -R --verbose $(lftp_quote "$SITE") $(lftp_quote "$REMOTE")"

    case "$MODE" in
        dry)   cmd="$cmd --dry-run" ;;
        prune) cmd="$cmd --delete" ;;
    esac

    if [ "$MODE" != "init" ]; then
        local path
        for path in $GROWN; do
            cmd="$cmd --exclude-glob $(lftp_quote "$path") --exclude-glob $(lftp_quote "$path/")"
        done
    fi

    lftp_run "$cmd"
}

# ------------------------------------------------------------------ パーミッション

fix_permissions () {
    note "パーミッションを整えます"

    local cmds="chmod 755 $REMOTE/data/shop-data
chmod 664 $REMOTE/data/news.json
chmod 600 $REMOTE/data/secrets.php"

    case "$METHOD" in
        rsync)
            local ssh_cmd
            ssh_cmd=(ssh)
            [ -z "$PORT" ] || ssh_cmd=("${ssh_cmd[@]}" -p "$PORT")
            [ -z "$KEY" ]  || ssh_cmd=("${ssh_cmd[@]}" -i "$KEY")
            "${ssh_cmd[@]}" "$LOGIN@$HOST" "$(printf '%s\n' "$cmds" | tr '\n' ';') true"
            ;;
        sftp)
            printf '%s\n' "$cmds" | sed 's/^/-/' | sftp $(ssh_opts) -b - "$LOGIN@$HOST"
            ;;
        ftp)
            lftp_run "$cmds"
            ;;
    esac

    warn "secrets.php が 600 のままでは読めないサーバーもあります（mod_php など）。"
    warn "その場合は 640 や 644 まで緩めてください（docs/setup.md の手順8）。"
}

# ------------------------------------------------------------------ 実行

if [ "$MODE" = "permissions" ]; then
    confirm "パーミッションを整えるだけ（ファイルは送りません）"
    fix_permissions
    exit 0
fi

case "$MODE" in
    dry)    confirm "差分を見るだけ（送りません）" ;;
    init)   confirm "初回。中身をすべて送る" ;;
    update) confirm "更新。data/shop-data/ と data/news.json は送らない" ;;
    prune)  warn "サーバーにあって手元に無いファイルが消えます。"
            warn "data/shop-data/ と data/news.json は除外しているので残ります。"
            confirm "更新 ＋ サーバー側の余計なファイルを削除" ;;
esac

note "$METHOD で $MODE を実行します"

case "$METHOD" in
    rsync) deploy_rsync ;;
    sftp)  deploy_sftp ;;
    ftp)   deploy_ftp ;;
esac

echo
if [ "$MODE" = "dry" ]; then
    note "見ただけです。実際に送るなら init か update を指定してください"
else
    note "送りました"
fi
