#!/usr/bin/env python3
"""marche-kit 配置済みzipに入れる雛形の生成

    python3 tools/make-templates.py <テーマ名> <配置先の site/>

tools/build-release.sh から呼ばれる。単体で使うものではない。

作るのは2つ。

    <site>/marche.config.json   イベントの設定（キットの既定＝商品情報を出さない）
    <site>/data/shops.json      出店者ロスター（**テーマのスロットに合わせる**）

ロスターのカテゴリIDをテーマから引くのが、このスクリプトの本題。
テーマの index.html に置かれた data-marche-shops の値と shops.json の
categories[].id が食い違うと、**その区分の出店者は画面にもエラーにも出ないまま消える**
（docs/setup.md「カテゴリIDをテーマのスロットに合わせる」）。
配布物がその食い違いを最初から抱えないよう、ここでテーマ側の値を写しておく。

ラベルはスロットの直前にある見出しから拾う。テーマが「出店ブース」と書いているなら
ロスターにも同じ言葉が入るので、利用者は自分の言葉に直すだけでよい。
"""
import json
import pathlib
import re
import sys

HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)
SHOP_SLOT = re.compile(r'data-marche-shops\s*=\s*"([^"]*)"')
HEADING = re.compile(r"<h[1-6][^>]*>(.*?)</h[1-6]>", re.S | re.I)
TAG = re.compile(r"<[^>]+>")


def slots_with_labels(html):
    """出店者スロットを (カテゴリID, 直前の見出し) の並びで返す。

    コメントの中は数えない。テーマは使い方の例をコメントで示すことがあり、
    それを拾うと存在しない区分がロスターに載ってしまう。
    """
    html = HTML_COMMENT.sub("", html)
    found = []
    for m in SHOP_SLOT.finditer(html):
        before = html[: m.start()]
        headings = HEADING.findall(before)
        label = ""
        if headings:
            label = TAG.sub("", headings[-1]).strip()
        found.append((m.group(1), label))
    return found


def build_roster(slots):
    categories = []
    for cid, label in slots:
        if not cid:
            continue
        categories.append({
            "id": cid,
            "label": label or cid,
            "variant": "standard",
            # 出店が決まった順に店舗IDを並べる。ここに無いIDからの保存は
            # サーバーが拒否する（docs/data-contract.md）
            "shops": [],
        })
    return {"categories": categories}


def build_config():
    """イベントの設定の雛形。

    **items を書かない。** 商品情報を出さないのがキットの既定で、
    出すイベントだけが1行足す（docs/decisions.md 決定7）。
    """
    return {
        "site": {
            "name": "イベント名",
            "url": "https://example.com",
            "description": "",
            "social": [],
        },
        "event": {
            "year": 2026,
            "venue": "会場名",
            "hours": "10:00-16:00",
        },
        "days": [
            {
                "id": "day1",
                "date": "2026-10-03",
                "label": "10月3日(土)",
                "shortLabel": "3日(土)",
            }
        ],
        "pricing": {
            "mode": "currency",
            "currency": {
                "unit": "円",
                "position": "suffix",
                "grouping": True,
                "decimals": 0,
            },
            "note": "税込",
        },
        "locale": "ja",
        "timezone": "Asia/Tokyo",
        "forms": {"endpoint": "data/send.php"},
        "announcements": {"source": "data/news.json", "visibleCount": 2},
    }


def write_json(path, data):
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main():
    if len(sys.argv) != 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2

    theme, site = sys.argv[1], pathlib.Path(sys.argv[2])
    index = site / "index.html"
    if not index.exists():
        print(f"{index} がありません", file=sys.stderr)
        return 1

    slots = slots_with_labels(index.read_text(encoding="utf-8"))
    if not slots:
        print(f"{theme}: 出店者スロットが1つも見つかりません", file=sys.stderr)
        return 1

    write_json(site / "data" / "shops.json", build_roster(slots))
    write_json(site / "marche.config.json", build_config())

    listed = " / ".join(f"{cid}（{label}）" for cid, label in slots)
    print(f"  雛形: {theme} のスロットに合わせました → {listed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
