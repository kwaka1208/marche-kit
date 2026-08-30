<?php
/**
 * config.php — コアPHPの共通設定ローダ
 *
 * shop-upload.php / put-json.php / send.php がこれを require して、
 * 設定・秘密情報・共通の検証関数を得る。
 *
 * ## 配置の前提
 *
 * このフォルダの中身は、サイトの公開ディレクトリの data/ に配置する。
 *
 *     <公開ディレクトリ>/
 *     ├── marche.config.json     ← サイト設定(生成側と共有)
 *     ├── forms/contact.json     ← フォーム項目定義
 *     ├── i18n/<locale>.json     ← core/i18n/ の中身(描画JS・エディタと共有)
 *     ├── editor/                ← core/editor/ の中身
 *     └── data/
 *         ├── config.php         ← このファイル
 *         ├── secrets.php        ← .env から生成(Git管理外)
 *         ├── shop-upload.php
 *         ├── put-json.php
 *         ├── send.php
 *         ├── shops.json
 *         ├── news.json
 *         └── shop-data/<店舗ID>/
 *
 * marche.config.json は data/ の親、無ければさらにその親から探す
 * (tools/validate.py の find_config と同じ順序)。
 *
 * ## 秘密情報
 *
 * 通知先・管理キー・Webhook URL は**このファイルに書かない。**
 * 環境変数 MARCHE_* を優先し、無ければ secrets.php から読む。
 * secrets.php は .env をもとに tools/inject-env.py が生成する。
 */

// 保存を許可する画像拡張子。core/editor/editor.js の ALLOWED_EXTENSIONS と同じ値にする
const MARCHE_ALLOWED_EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg', 'gif', 'avif'];

// 画像の合計サイズ上限。core/editor/editor.js の MAX_TOTAL_IMAGE_BYTES と同じ値にする
const MARCHE_MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;

// 商品の販売状態として保存を許可する値。
// core/editor/editor.js の ITEM_STATUS_VALUES・描画JS の定義と同じ値にする
const MARCHE_ITEM_STATUSES = ['onsale', 'soldout', 'ended'];

/**
 * 秘密情報を1件読む。環境変数 MARCHE_<NAME> を優先し、無ければ secrets.php を見る。
 * どちらにも無ければ $default(既定は空文字)を返す。
 */
function marche_secret(string $name, string $default = ''): string
{
    static $file = null;
    if ($file === null) {
        $path = __DIR__ . '/secrets.php';
        $loaded = is_file($path) ? require $path : null;
        $file = is_array($loaded) ? $loaded : [];
    }

    $env = getenv('MARCHE_' . $name);
    if (is_string($env) && $env !== '') {
        return $env;
    }
    return isset($file[$name]) ? (string)$file[$name] : $default;
}

/**
 * marche.config.json を読む。見つからない・壊れているときは空配列を返す
 * (呼び出し側が必要な項目の有無で判断する)。
 */
function marche_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }
    $config = [];
    foreach ([__DIR__ . '/..', __DIR__ . '/../..'] as $dir) {
        $path = $dir . '/marche.config.json';
        if (!is_file($path)) {
            continue;
        }
        $decoded = json_decode((string)file_get_contents($path), true);
        if (is_array($decoded)) {
            $config = $decoded;
        }
        break;
    }
    return $config;
}

/**
 * 開催日IDの一覧(['day1', 'day2'])。商品の saleDays の検証に使う。
 * 設定が読めないときは空配列を返し、呼び出し側は検証を省略する。
 */
function marche_day_ids(): array
{
    $ids = [];
    foreach (marche_config()['days'] ?? [] as $day) {
        if (is_array($day) && isset($day['id'])) {
            $ids[] = (string)$day['id'];
        }
    }
    return $ids;
}

/**
 * 商品カテゴリIDの一覧。未定義なら空配列(=カテゴリを使わないイベント)。
 */
function marche_item_category_ids(): array
{
    $ids = [];
    foreach (marche_config()['itemCategories'] ?? [] as $cat) {
        if (is_array($cat) && isset($cat['id'])) {
            $ids[] = (string)$cat['id'];
        }
    }
    return $ids;
}

/**
 * 対価の表示モード。currency(金額)または ticket(チケット枚数)。
 */
function marche_pricing_mode(): string
{
    $mode = marche_config()['pricing']['mode'] ?? 'currency';
    return $mode === 'ticket' ? 'ticket' : 'currency';
}

/**
 * 表示文言を辞書から引く(決定4)。コアは文言を直書きしない。
 *
 * $key は "server.badShopId" のようなドット区切り。$vars で {name} を置き換える。
 * 辞書は marche.config.json の locale で決まり、次の順に探す。
 *
 *     <このファイルの親>/i18n/<locale>.json     公開ディレクトリ直下に i18n/ を置く構成
 *     <このファイルの親>/core/i18n/<locale>.json リポジトリの構成のまま配置した場合
 *
 * 見つからないキーはキー名をそのまま返す(辞書の記入漏れが画面で分かるように)。
 */
function marche_text(string $key, array $vars = []): string
{
    static $dict = null;
    if ($dict === null) {
        $dict = [];
        $locale = (string)(marche_config()['locale'] ?? 'ja');
        if (!preg_match('/\A[a-z]{2}(-[A-Za-z0-9]+)?\z/', $locale)) {
            $locale = 'ja';
        }
        foreach (['/../i18n/', '/../core/i18n/'] as $rel) {
            $path = __DIR__ . $rel . $locale . '.json';
            if (!is_file($path)) {
                continue;
            }
            $decoded = json_decode((string)file_get_contents($path), true);
            if (is_array($decoded)) {
                $dict = $decoded;
            }
            break;
        }
    }

    $value = $dict;
    foreach (explode('.', $key) as $part) {
        if (!is_array($value) || !array_key_exists($part, $value)) {
            return $key;
        }
        $value = $value[$part];
    }
    if (!is_string($value)) {
        return $key;
    }
    foreach ($vars as $name => $replacement) {
        $value = str_replace('{' . $name . '}', (string)$replacement, $value);
    }
    return $value;
}

/**
 * 出店者が入力した文字列をテキストに正規化する(決定6)。
 *
 * 出店者の入力はサイト上ですべてテキストとして描画される。HTMLタグは書けない。
 * クライアントを信用せず、保存時にここで落とす。
 *
 * - 実体参照で書かれたタグ(&lt;script&gt;)も対象にするため、先に復号してから落とす
 * - 改行は \n に統一する。旧データの <br> は改行として拾う
 * - strip_tags は使わない。「1 < 2」のような不等号まで食べてしまうため、
 *   タグらしい形(</?英字…>)だけを除去する
 */
function marche_plain_text($value): string
{
    if (!is_string($value)) {
        return '';
    }
    $s = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $s = str_replace(["\r\n", "\r"], "\n", $s);
    $s = preg_replace('/<br\s*\/?>/i', "\n", $s);
    $s = preg_replace('/<!--.*?-->/s', '', $s);
    $s = preg_replace('#</?[a-zA-Z][^>]*>#', '', $s);
    return trim((string)$s);
}

/**
 * メールヘッダに入れる文字列から CR/LF を除去する(ヘッダインジェクション対策)。
 */
function marche_header_safe(string $value): string
{
    return (string)preg_replace('/[\r\n]+/', ' ', $value);
}

/**
 * 更新通知のWebhookへ投稿する(サーバー保存とは独立した通知経路)。
 * URLが未設定、または http(s) で始まらないときは何もしない。
 * best-effort のため、失敗しても呼び出し側の処理結果には影響させない。
 */
function marche_notify_webhook(string $text): void
{
    $url = marche_secret('WEBHOOK_URL');
    if (!preg_match('#\Ahttps?://#', $url) || !function_exists('curl_init')) {
        return;
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        // Discordのcontentは2000文字上限。余裕を見て切り詰める
        CURLOPT_POSTFIELDS => json_encode(
            ['content' => mb_substr($text, 0, 1900)],
            JSON_UNESCAPED_UNICODE
        ),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 5,
    ]);
    curl_exec($ch);
    curl_close($ch);
}

/**
 * フォーム項目定義(forms/<種別>.json)を読む。send.php が使う。
 * 見つからない・種別が一致しないときは null を返す。
 */
function marche_form_definition(string $type): ?array
{
    if (!preg_match('/\A[a-z0-9][a-z0-9-]*\z/', $type)) {
        return null;
    }
    $path = __DIR__ . '/../forms/' . $type . '.json';
    if (!is_file($path)) {
        return null;
    }
    $decoded = json_decode((string)file_get_contents($path), true);
    return is_array($decoded) ? $decoded : null;
}
