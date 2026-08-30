#!/usr/bin/env python3
"""marche-kit データ検証ツール

サイトのデータが schema/ の定める形に合っているかを確認する。
外部ライブラリを使わないので、python3 さえあればどこでも動く。

    python3 tools/validate.py <公開ディレクトリ>

期待する配置:
    <公開ディレクトリ>/data/shops.json
    <公開ディレクトリ>/data/news.json
    <公開ディレクトリ>/data/shop-data/<店舗ID>/data.json
    marche.config.json  (公開ディレクトリか、その親)
"""
import json
import os
import re
import sys

EXT = r"(webp|png|jpg|jpeg|gif|avif)"
ID = re.compile(r"^[a-z0-9][a-z0-9-]*$")
IMAGE = re.compile(r"^[^/\\]*\." + EXT + r"$")
DAY_ID = re.compile(r"^day[0-9]+$")
HTML_TAG = re.compile(r"<[a-zA-Z/!]")
STATUSES = {"onsale", "soldout", "ended"}
VARIANTS = {"standard", "compact", "feature"}
SHOP_FIELDS = {"id", "name", "url", "comment", "logo", "items", "updatedAt"}
SOCIAL_FIELDS = {"platform", "url", "label"}
ITEM_FIELDS = {"id", "name", "category", "description", "image", "price",
               "status", "saleDays", "imagePosition", "useContain"}
TEXT_FIELDS = ("name", "comment", "description")
FIELD_NAME = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]*$")
CAPTURE = re.compile(r"^(pageUrl|referrer|query:[A-Za-z0-9_-]+)$")
FORM_FIELDS = {"name", "label", "type", "required", "validation", "maxLength",
               "placeholder", "autocomplete", "options", "description",
               "min", "max", "step", "value", "capture"}
FORM_TOP = {"formType", "autoReply", "replyToField", "autoReplyToField", "fields"}
FORMS_CONFIG = {"endpoint", "honeypot", "retries", "successUrl"}
INPUT_TYPES = {"text", "email", "tel", "url", "number", "date", "time",
               "textarea", "select", "checkbox", "radio", "consent", "hidden"}
VALIDATIONS = {"email", "phone", "url", "number", "halfwidth"}
CHOICE_TYPES = {"select", "checkbox", "radio"}

errors = []
warnings = []


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def find_config(base):
    """marche.config.json を公開ディレクトリかその親から探す"""
    for d in (base, os.path.dirname(os.path.abspath(base))):
        p = os.path.join(d, "marche.config.json")
        if os.path.exists(p):
            return p
    return None


def check_config(path):
    """設定を読み、商品検証に必要な情報(開催日ID・価格モード・商品カテゴリ)を返す"""
    cfg = load(path)
    day_ids, mode, decimals, item_cats = set(), "currency", 0, set()

    days = cfg.get("days")
    if not isinstance(days, list) or not days:
        errors.append("marche.config.json: days が空。開催日を1件以上定義すること")
    else:
        for i, d in enumerate(days):
            did = str(d.get("id", ""))
            if not DAY_ID.match(did):
                errors.append(f"marche.config.json: days[{i}].id は day1 形式にすること ({did!r})")
            if did in day_ids:
                errors.append(f"marche.config.json: days[].id が重複 ({did})")
            day_ids.add(did)
            for f in ("date", "label"):
                if not d.get(f):
                    errors.append(f"marche.config.json: days[{i}] に '{f}' が無い")

    pricing = cfg.get("pricing")
    if not isinstance(pricing, dict):
        errors.append("marche.config.json: pricing が無い")
    else:
        mode = pricing.get("mode")
        if mode not in ("currency", "ticket"):
            errors.append(f"marche.config.json: pricing.mode が不正 ({mode!r})")
        if mode == "ticket" and not isinstance(pricing.get("ticket"), dict):
            errors.append("marche.config.json: pricing.mode が ticket なのに pricing.ticket が無い")
        decimals = (pricing.get("currency") or {}).get("decimals", 0)

    site = cfg.get("site")
    social = site.get("social") if isinstance(site, dict) else None
    if social is not None:
        if not isinstance(social, list):
            errors.append("marche.config.json: site.social は配列にすること")
        else:
            for i, link in enumerate(social):
                where = f"marche.config.json: site.social[{i}]"
                if not isinstance(link, dict):
                    errors.append(f"{where} はオブジェクトにすること")
                    continue
                pid = str(link.get("platform", ""))
                if not ID.match(pid):
                    errors.append(f"{where}.platform がパターン違反 ({pid!r})"
                                  " → クラス名 social-link--<id> に入るため小文字・数字・ハイフンのみ")
                url = str(link.get("url", ""))
                if not url.startswith(("http://", "https://")):
                    errors.append(f"{where}.url が http(s) で始まらない ({url!r})"
                                  " → サイトには出力されない")
                unknown = set(link) - SOCIAL_FIELDS
                if unknown:
                    warnings.append(f"{where}: 仕様に無いフィールド {sorted(unknown)}")

    forms = cfg.get("forms")
    if forms is not None:
        if not isinstance(forms, dict):
            errors.append("marche.config.json: forms はオブジェクトにすること")
            forms = {}
        else:
            unknown = set(forms) - FORMS_CONFIG
            if unknown:
                warnings.append(f"marche.config.json: forms に仕様に無いフィールド {sorted(unknown)}")
            hp = forms.get("honeypot")
            if hp is not None and not re.match(r"^[a-zA-Z][a-zA-Z0-9_-]*$", str(hp)):
                errors.append(f"marche.config.json: forms.honeypot がパターン違反 ({hp!r})"
                              " → 入力欄の name になるため英字始まりにすること")
            r = forms.get("retries")
            if r is not None and (not isinstance(r, int) or isinstance(r, bool) or r < 0):
                errors.append(f"marche.config.json: forms.retries は0以上の整数にすること ({r!r})")
            if forms.get("endpoint") == "":
                warnings.append("marche.config.json: forms.endpoint が空"
                                " → モックモード。**実際には送信されません**")
    honeypot = (forms or {}).get("honeypot") or "website"

    cats = cfg.get("itemCategories")
    if cats is not None:
        if not isinstance(cats, list):
            errors.append("marche.config.json: itemCategories は配列にすること")
        else:
            for i, c in enumerate(cats):
                cid = str(c.get("id", ""))
                if not ID.match(cid):
                    errors.append(f"marche.config.json: itemCategories[{i}].id がパターン違反 ({cid!r})")
                if cid in item_cats:
                    errors.append(f"marche.config.json: itemCategories[].id が重複 ({cid})")
                item_cats.add(cid)
                if not c.get("label"):
                    errors.append(f"marche.config.json: itemCategories[{i}] に label が無い")

    return day_ids, mode, decimals, len(days or []), item_cats, honeypot


def check_text(where, label, value):
    """出店者が入力する文字列にHTMLタグが混ざっていないか"""
    if isinstance(value, str) and HTML_TAG.search(value):
        errors.append(f"{where}: {label} にHTMLタグが含まれている"
                      " → テキストとして扱う仕様。改行は \\n を使う")


HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)


def read_slots(base):
    """公開ディレクトリの index.html から、テーマが置いたスロットを拾う。

    コメントの中は数えない。themes/default/ には「区分が複数あるときはこう書く」という
    記入例がコメントで入っており、これを実在するスロットと数えると検査が素通りする。

    index.html が無い構成(データだけを検証する場合)では None を返し、照合を省く。
    """
    path = os.path.join(base, "index.html")
    if not os.path.exists(path):
        return None
    html = HTML_COMMENT.sub("", open(path, encoding="utf-8").read())
    return {
        "shops": set(re.findall(r'data-marche-shops\s*=\s*"([^"]*)"', html)),
        "forms": set(re.findall(r'data-marche-form\s*=\s*"([^"]*)"', html)),
        "social": bool(re.search(r"data-marche-social\b", html)),
        "text": set(re.findall(r'data-marche-text\s*=\s*"([^"]*)"', html)),
    }


def check_slots(base, category_ids, form_names, cfg_path):
    """定義したものが、テーマのスロットに行き先を持っているかを照合する。

    **見るのは一方向だけ。** 「定義があるのにスロットが無い」＝出しどころが無く、
    書いた内容がサイトに出ない状態だけを問題にする。
    逆(スロットがあるのに定義が無い)は隠れるだけで、意図した運用でも起きる
    (examples/demo/variants/ は、そうなることを確かめるために定義を置いていない)。
    """
    slots = read_slots(base)
    if slots is None:
        warnings.append("index.html が無いため、スロットとの照合を省略"
                        "（テーマを置いていない構成では正常）")
        return

    for cid in sorted(category_ids):
        if cid not in slots["shops"]:
            errors.append(f"shops.json: カテゴリ '{cid}' に対応するスロットが index.html に無い"
                          f' → <div data-marche-shops="{cid}"></div> を置くこと。'
                          "**このカテゴリの出店者はサイトに出ません**")

    for name in sorted(form_names):
        if name not in slots["forms"]:
            warnings.append(f"forms/{name}.json があるが、"
                            f'index.html に data-marche-form="{name}" が無い'
                            " → このフォームは表示されない")

    # data-marche-text のパス。**未設定と綴り違いを区別する。**
    # 値が空なのは正常(そのイベントに開催時間が無い、など)で、コアが要素を隠すだけ。
    # 一方、先頭のキーが設定に無いのは綴り違いとしか考えられないので指摘する。
    if cfg_path:
        try:
            cfg = load(cfg_path)
        except Exception:
            cfg = {}
        for path in sorted(slots["text"]):
            head = path.split(".")[0]
            if head and head not in cfg:
                warnings.append(f'index.html の data-marche-text="{path}" が'
                                f" marche.config.json のどの項目も指していない"
                                f"（'{head}' がありません）→ この要素は常に隠れます")

    if cfg_path and not slots["social"]:
        try:
            social = (load(cfg_path).get("site") or {}).get("social") or []
        except Exception:
            social = []
        if social:
            warnings.append(f"site.social が{len(social)}件あるが、"
                            "index.html に data-marche-social が無い"
                            " → SNSのリンクは表示されない")

    print(f"スロット     : index.html と照合（出店者{len(slots['shops'])}"
          f" / フォーム{len(slots['forms'])}"
          f" / SNS{'あり' if slots['social'] else 'なし'}"
          f" / 設定の差し込み{len(slots['text'])}）")


def check_form(path, name, honeypot="website"):
    """フォーム項目定義(forms/<種別>.json)。フロントの生成とサーバーの検証が共有する"""
    form = load(path)
    where = f"forms/{name}"

    ftype = str(form.get("formType", ""))
    if not re.match(r"^[a-z0-9_-]+$", ftype):
        errors.append(f"{where}: formType がパターン違反 ({ftype!r})")
    elif ftype != name:
        errors.append(f"{where}: formType が {ftype!r} だがファイル名は {name!r}"
                      " → send.php は type でこのファイルを引くため一致させること")

    unknown = set(form) - FORM_TOP
    if unknown:
        warnings.append(f"{where}: 仕様に無いフィールド {sorted(unknown)}")

    fields = form.get("fields")
    if not isinstance(fields, list) or not fields:
        errors.append(f"{where}: fields が空。項目を1件以上定義すること")
        return 0

    seen = set()
    for i, f in enumerate(fields):
        at = f"{where}: fields[{i}]"
        if not isinstance(f, dict):
            errors.append(f"{at} はオブジェクトにすること")
            continue

        fname = str(f.get("name", ""))
        if not FIELD_NAME.match(fname):
            errors.append(f"{at}.name がパターン違反 ({fname!r})"
                          " → 送信データのキーになるため英字始まりの英数字とアンダースコア")
        if fname in seen:
            errors.append(f"{at}.name が重複 ({fname})")
        if fname == honeypot:
            errors.append(f"{at}.name がおとり欄と同じ ({fname!r})"
                          " → 入力された時点でボット扱いになり、**送信が黙って捨てられる。**"
                          " marche.config.json の forms.honeypot を別の名前にすること")
        seen.add(fname)

        if not f.get("label"):
            errors.append(f"{at} に label が無い")

        ftype_ = f.get("type")
        if ftype_ not in INPUT_TYPES:
            errors.append(f"{at}.type が不正 ({ftype_!r}) → {sorted(INPUT_TYPES)} のいずれか")

        v = f.get("validation")
        if v is not None and v not in VALIDATIONS:
            errors.append(f"{at}.validation が不正 ({v!r}) → {sorted(VALIDATIONS)} のいずれか")
        elif v and ftype_ in (CHOICE_TYPES | {"consent", "hidden"}):
            warnings.append(f"{at}: {ftype_} に validation は効かない（無視される）")

        # 選択式は options が要る。逆に選択式でないのに options があるのは書き間違い
        opts = f.get("options")
        if ftype_ in CHOICE_TYPES:
            if not isinstance(opts, list) or not opts:
                errors.append(f"{at}: type が {ftype_} なのに options が無い")
            else:
                for j, o in enumerate(opts):
                    if not isinstance(o, dict) or "value" not in o or "label" not in o:
                        errors.append(f"{at}.options[{j}] は "
                                      '{"value": ..., "label": ...} の形にすること')
        elif opts is not None:
            warnings.append(f"{at}: type が {ftype_} なので options は使われない")

        cap = f.get("capture")
        if cap is not None:
            if ftype_ != "hidden":
                errors.append(f"{at}.capture は type が hidden のときだけ使える")
            elif not CAPTURE.match(str(cap)):
                errors.append(f"{at}.capture が不正 ({cap!r})"
                              " → pageUrl / referrer / query:<パラメータ名>")

        ml = f.get("maxLength")
        if ml is not None and (not isinstance(ml, int) or ml < 1):
            errors.append(f"{at}.maxLength は1以上の整数にすること ({ml!r})")

    # 返信先に指定された項目が実在するか（無いと自動返信の宛先が取れない）
    for key in ("replyToField", "autoReplyToField"):
        target = form.get(key)
        if target is not None and target not in seen:
            errors.append(f"{where}: {key} が {target!r} だが、その項目が fields に無い")
    # autoReplyToField を省略したときの既定は 'email'。明示した場合は上のループで見ている
    if form.get("autoReply") and "autoReplyToField" not in form and "email" not in seen:
        errors.append(f"{where}: autoReply が有効だが、宛先の既定 'email' が fields に無い"
                      " → autoReplyToField で宛先の項目名を指定すること")

    return len(fields)


def check_shop(path, shop_dir, listed, day_ids, mode, decimals, item_cats):
    try:
        v = load(path)
    except Exception as e:
        errors.append(f"{shop_dir}: JSONとして読めない ({e})")
        return 0

    where = shop_dir if shop_dir in listed else f"{shop_dir}(ロスター外)"
    folder = os.path.dirname(path)

    if "menus" in v and "items" not in v:
        errors.append(f"{where}: 旧形式の 'menus' がある → 'items' に改名すること")

    for f in ("id", "name", "items", "updatedAt"):
        if f not in v:
            errors.append(f"{where}: 必須フィールド '{f}' が無い")

    shop_id = str(v.get("id", ""))
    if shop_id and not ID.match(shop_id):
        errors.append(f"{where}: id がパターン違反 {shop_id!r}")
    if shop_id and shop_id != shop_dir:
        errors.append(f"{where}: id がフォルダ名と一致しない (id={shop_id!r})")
    if v.get("url") and not str(v["url"]).startswith(("http://", "https://")):
        errors.append(f"{where}: url が http(s) で始まらない {v['url']!r}")
    if v.get("logo"):
        if not IMAGE.match(str(v["logo"])):
            errors.append(f"{where}: logo のファイル名が不正 {v['logo']!r}")
        elif not os.path.exists(os.path.join(folder, v["logo"])):
            warnings.append(f"{where}: logo のファイルが存在しない ({v['logo']})")
    for f in TEXT_FIELDS:
        check_text(where, f, v.get(f))

    unknown = set(v) - SHOP_FIELDS
    if unknown:
        warnings.append(f"{where}: 仕様に無い店舗フィールド {sorted(unknown)}")

    count = 0
    for m in v.get("items", []):
        if not isinstance(m, dict):
            errors.append(f"{where}: items の要素が辞書でない")
            continue
        count += 1
        item_id = str(m.get("id", ""))
        label = item_id or m.get("name", "?")

        for f in ("id", "name"):
            if f not in m:
                errors.append(f"{where}: 商品に必須 '{f}' が無い ({label})")
        if shop_id and not re.match(r"^" + re.escape(shop_id) + r"-[0-9]+$", item_id):
            errors.append(f"{where}: 商品IDが <店舗ID>-<連番> になっていない ({item_id!r})"
                          " → この店はエディタから保存できない")
        for f in ("name", "description"):
            check_text(where, f"商品の {f} ({label})", m.get(f))

        if "price" in m:
            p = m["price"]
            if not isinstance(p, (int, float)) or isinstance(p, bool):
                errors.append(f"{where}: price が数値でない {p!r} ({label})")
            elif p < 0:
                errors.append(f"{where}: price が負の数 ({label})")
            elif mode == "ticket" and p != int(p):
                errors.append(f"{where}: チケット運用では price は整数のみ ({p} / {label})")
            elif mode == "currency" and decimals == 0 and p != int(p):
                errors.append(f"{where}: pricing.currency.decimals が0なのに小数 ({p} / {label})")

        if m.get("image"):
            if not IMAGE.match(str(m["image"])):
                errors.append(f"{where}: 商品画像のファイル名が不正 {m['image']!r} ({label})")
            elif not os.path.exists(os.path.join(folder, m["image"])):
                warnings.append(f"{where}: 商品画像が存在しない ({m['image']})")
        if m.get("category") and item_cats and m["category"] not in item_cats:
            errors.append(f"{where}: 未定義の商品カテゴリ {m['category']!r} ({label})"
                          " → marche.config.json の itemCategories に無い")
        if "status" in m and m["status"] not in STATUSES:
            errors.append(f"{where}: status が不正 {m['status']!r} ({label})")

        sd = m.get("saleDays")
        if sd is not None:
            if not isinstance(sd, list):
                errors.append(f"{where}: saleDays は配列にすること {sd!r} ({label})"
                              " → 旧形式 both/dayA/dayB は廃止")
            else:
                for d in sd:
                    if day_ids and d not in day_ids:
                        errors.append(f"{where}: saleDays に未定義の日ID {d!r} ({label})"
                                      f" → marche.config.json の days に無い")

        unknown = set(m) - ITEM_FIELDS
        if unknown:
            warnings.append(f"{where}: 仕様に無い商品フィールド {sorted(unknown)} ({label})")
    return count


def main(base):
    data_dir = os.path.join(base, "data")
    if not os.path.isdir(data_dir):
        sys.exit(f"エラー: {data_dir} が見つかりません")

    # 設定
    day_ids, mode, decimals, day_count, item_cats = set(), "currency", 0, 0, set()
    honeypot = "website"
    cfg_path = find_config(base)
    if cfg_path:
        day_ids, mode, decimals, day_count, item_cats, honeypot = check_config(cfg_path)
        print(f"設定         : {mode} モード / 開催{day_count}日"
              + ("（販売日UIなし）" if day_count == 1 else ""))
    else:
        warnings.append("marche.config.json が見つからない（設定に依存する検証を省略）")

    # ロスター
    listed, category_ids = set(), set()
    roster_path = os.path.join(data_dir, "shops.json")
    if os.path.exists(roster_path):
        roster = load(roster_path)
        cats = roster.get("categories")
        if not isinstance(cats, list):
            errors.append("shops.json: categories が無い"
                          " → 旧形式（カテゴリ名をキーにする形）は廃止。schema/shops.schema.json を参照")
            cats = []
        seen = set()
        for i, c in enumerate(cats):
            cid = str(c.get("id", ""))
            if not ID.match(cid):
                errors.append(f"shops.json: categories[{i}].id がパターン違反 {cid!r}")
            if cid in seen:
                errors.append(f"shops.json: categories[].id が重複 ({cid})")
            seen.add(cid)
            category_ids.add(cid)
            if not c.get("label"):
                errors.append(f"shops.json: categories[{i}] に label が無い")
            if "variant" in c and c["variant"] not in VARIANTS:
                errors.append(f"shops.json: variant が不正 {c['variant']!r}"
                              f" → {sorted(VARIANTS)} のいずれか")
            for s in c.get("shops", []):
                if not ID.match(str(s)):
                    errors.append(f"shops.json: 店舗IDがパターン違反 {s!r}")
                if s in listed:
                    errors.append(f"shops.json: 店舗ID '{s}' が複数のカテゴリに登場")
                listed.add(s)
        print(f"ロスター     : {len(cats)}カテゴリ / {len(listed)}店")
    else:
        warnings.append("shops.json が無い（全店が非表示になる）")

    # 出店者データ
    shop_dir = os.path.join(data_dir, "shop-data")
    if not os.path.isdir(shop_dir) and os.path.isdir(os.path.join(data_dir, "vendor-data")):
        errors.append("data/vendor-data/ がある → data/shop-data/ に改名すること")
        shop_dir = os.path.join(data_dir, "vendor-data")

    total = checked = 0
    if os.path.isdir(shop_dir):
        dirs = sorted(d for d in os.listdir(shop_dir)
                      if os.path.isdir(os.path.join(shop_dir, d)))
        for d in dirs:
            p = os.path.join(shop_dir, d, "data.json")
            if not os.path.exists(p):
                (errors if d in listed else warnings).append(
                    f"{d}: data.json が無い" + ("" if d in listed else "(ロスター外)"))
                continue
            total += check_shop(p, d, listed, day_ids, mode, decimals, item_cats)
            checked += 1
        # ロスターに載せた直後は必ずこの状態になる（出店者が保存して初めて作られる）。
        # **正常な途中経過なので仕様違反にしない。** ただしIDの綴り違いでも同じ形になるため、
        # 両方の可能性を書いて知らせる
        for s in sorted(listed - set(dirs)):
            warnings.append(f"shops.json: '{s}' の shop-data/ がまだ無い"
                            " → その店が保存すると作られます。"
                            "開催が近いのに残っているなら、未入稿か店舗IDの綴り違いです")
        unlisted = len(set(dirs) - listed)
        print(f"出店者データ : {checked}店 / {total}商品"
              + (f"（ロスター外 {unlisted}件は非表示）" if unlisted else ""))

    # フォーム項目定義（置いていない構成もある）
    forms_dir = os.path.join(base, "forms")
    form_names = []
    if os.path.isdir(forms_dir):
        form_names = sorted(f[:-5] for f in os.listdir(forms_dir) if f.endswith(".json"))
        count = sum(check_form(os.path.join(forms_dir, n + ".json"), n, honeypot)
                    for n in form_names)
        if form_names:
            print(f"フォーム     : {len(form_names)}種 / {count}項目")

    # 定義とテーマのスロットの照合
    check_slots(base, category_ids, form_names, cfg_path)

    # お知らせ
    news_path = os.path.join(data_dir, "news.json")
    if os.path.exists(news_path):
        news = load(news_path)
        if not isinstance(news, list):
            errors.append("news.json: 配列ではない")
        else:
            for i, n in enumerate(news):
                for f in ("title", "date", "body"):
                    if f not in n:
                        errors.append(f"news[{i}]: 必須 '{f}' が無い")
                d = str(n.get("date", ""))
                if d and not re.match(r"^\d{4}-\d{2}-\d{2}", d):
                    errors.append(f"news[{i}]: date の形式が想定外 {d!r}")
            print(f"お知らせ     : {len(news)}件")

    print()
    for w in warnings:
        print(f"  ⚠  {w}")
    if warnings:
        print()
    if errors:
        print(f"❌ 仕様違反 {len(errors)}件")
        for e in errors:
            print(f"  -  {e}")
        return 1
    print("✅ 仕様違反なし")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(f"使い方: python3 {sys.argv[0]} <公開ディレクトリ>")
    sys.exit(main(sys.argv[1]))
