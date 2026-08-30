#!/usr/bin/env python3
"""marche-kit 秘密情報の注入ツール

.env の値を、配置済みのファイルへ流し込む。
リポジトリ側のファイルは書き換えない（実運用の値をGitに入れないため）。

    python3 tools/inject-env.py <配置先ディレクトリ>

<配置先ディレクトリ> は、サイトの公開ディレクトリと同じ構成になっている場所を指す。

    <配置先>/
    ├── data/          ← core/php/ の中身を置いた場所
    └── editor/        ← core/editor/ の中身を置いた場所

やること:

1. <配置先>/data/secrets.php を .env の値で生成する（PHPはこれを読む）
2. <配置先>/editor/ 以下の .js から、次のプレースホルダを .env の値へ置換する
       __ADMIN_KEY__        → MARCHE_ADMIN_KEY
       __WEBHOOK_URL__      → MARCHE_WEBHOOK_URL

エディタJSはブラウザに配信されるため環境変数を読めない。ソースにはプレースホルダ
だけを置き、配置後のコピーに対してここで置換する。

未設定の項目は空文字として埋める（プレースホルダのままにはしない）。
空文字を受け取った側の挙動:
    ADMIN_KEY   … 運営向けUIが出ない。お知らせエディタは開けない
    WEBHOOK_URL … 通知をスキップする
"""
import os
import re
import sys

# .env のキー(MARCHE_ 抜き) → エディタJS 内のプレースホルダ
JS_PLACEHOLDERS = {
    "ADMIN_KEY": "__ADMIN_KEY__",
    "WEBHOOK_URL": "__WEBHOOK_URL__",
}

# secrets.php に書き出すキー
SECRET_KEYS = ["ADMIN_KEY", "WEBHOOK_URL", "NOTIFY_EMAIL",
               "SHOP_NOTIFY_EMAIL", "SENDER_EMAIL"]

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env(path):
    """.env を読む。KEY=VALUE の行だけを拾い、前後の引用符は外す"""
    values = {}
    if not os.path.exists(path):
        sys.exit(f"エラー: {path} がありません（.env.example をコピーして作成してください）")
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip("'\"")
            if key.startswith("MARCHE_"):
                values[key[len("MARCHE_"):]] = value
    return values


def write_secrets(dest, env):
    """PHPが読む secrets.php を生成する"""
    php_dir = os.path.join(dest, "data")
    if not os.path.isdir(php_dir):
        sys.exit(f"エラー: {php_dir} がありません（core/php/ の中身を配置してから実行してください）")

    lines = ["<?php",
             "// tools/inject-env.py が .env から生成しました。直接編集しないでください。",
             "// このファイルには実運用の値が入ります。Gitで管理しないこと。",
             "return ["]
    for key in SECRET_KEYS:
        # PHPのシングルクォート文字列に入れるため、バックスラッシュと ' だけを退避する
        value = env.get(key, "").replace("\\", "\\\\").replace("'", "\\'")
        lines.append(f"    '{key}' => '{value}',")
    lines.append("];")

    path = os.path.join(php_dir, "secrets.php")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    # 公開ディレクトリに置かれるため、他ユーザーから読めないようにする
    os.chmod(path, 0o600)

    missing = [k for k in SECRET_KEYS if not env.get(k)]
    print(f"生成: {path}"
          + (f"（未設定: {', '.join(missing)}）" if missing else ""))


def js_literal(value):
    """JSのシングルクォート文字列に埋め込める形にする。
    プレースホルダは const X = '__ADMIN_KEY__'; の形で置かれているため、
    バックスラッシュと ' を退避し、改行が混ざっていれば落とす"""
    escaped = value.replace("\\", "\\\\").replace("'", "\\'")
    return escaped.replace("\r", "").replace("\n", "")


def inject_js(dest, env):
    """エディタJSのプレースホルダを置換する"""
    editor_dir = os.path.join(dest, "editor")
    if not os.path.isdir(editor_dir):
        print(f"スキップ: {editor_dir} がありません（エディタを配置していない構成）")
        return

    count = 0
    for root, _, files in os.walk(editor_dir):
        for name in files:
            if not name.endswith(".js"):
                continue
            path = os.path.join(root, name)
            with open(path, encoding="utf-8") as f:
                text = f.read()
            replaced = text
            for key, placeholder in JS_PLACEHOLDERS.items():
                replaced = replaced.replace(placeholder, js_literal(env.get(key, "")))
            if replaced != text:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(replaced)
                print(f"置換: {os.path.relpath(path, dest)}")
                count += 1
    if count == 0:
        print("置換対象のプレースホルダはありませんでした（すでに注入済みの可能性があります）")


def check_leftovers(dest):
    """置換漏れが残っていないかを確認する"""
    pattern = re.compile("|".join(re.escape(p) for p in JS_PLACEHOLDERS.values()))
    left = []
    for root, _, files in os.walk(dest):
        for name in files:
            if not name.endswith((".js", ".php")):
                continue
            path = os.path.join(root, name)
            with open(path, encoding="utf-8", errors="ignore") as f:
                if pattern.search(f.read()):
                    left.append(os.path.relpath(path, dest))
    if left:
        print("\n⚠  プレースホルダが残っています:")
        for p in left:
            print(f"  -  {p}")


def main(dest):
    if not os.path.isdir(dest):
        sys.exit(f"エラー: {dest} がありません")
    env = load_env(os.path.join(REPO_ROOT, ".env"))
    write_secrets(dest, env)
    inject_js(dest, env)
    check_leftovers(dest)
    print("\n✅ 注入しました")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(f"使い方: python3 {sys.argv[0]} <配置先ディレクトリ>")
    sys.exit(main(sys.argv[1]))
