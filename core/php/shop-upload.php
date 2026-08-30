<?php
/**
 * shop-upload.php — 出店者情報の受信・保存
 *
 * core/editor/editor.js から multipart/form-data でPOSTされる店舗データ(data.json)と
 * 画像を、shop-data/<店舗ID>/ に保存する。shop-data はサイト表示の本番データソースで、
 * 保存された内容は即座にサイトに反映される(運営の確認は挟まない)。
 * サイト側は shops.json のロスターにあるIDだけを表示する。
 *
 *     shop-data/<店舗ID>/
 *     ├── data.json            店の情報 + 商品の配列(updatedAt はここで付与する)
 *     ├── logo.<拡張子>         ロゴ画像
 *     └── <商品ID>.<拡張子>     商品画像(<店舗ID>-<連番>)
 *
 * 保存後、data.json から参照されていない画像ファイルは削除する
 * (商品の削除・画像の差し替えに追随する)。
 *
 * ## 検証の方針
 *
 * クライアントを信用しない。エディタを通さない直接POSTでも壊れたデータが残らないよう、
 * 受け取った値をすべてここで確かめる。詳細は docs/data-contract.md の
 * 「サーバー側の検証ルール」を参照。
 */

require __DIR__ . '/config.php';

// updatedAt と通知の日時をイベントの暦で出す。設定に無ければサーバーの既定に従う
date_default_timezone_set(marche_config()['timezone'] ?? date_default_timezone_get());

// 出店者データの保存先。このPHPと同じ場所の shop-data/(サイトがfetchする公開フォルダ)
const SHOP_DATA_DIR = __DIR__ . '/shop-data';

// 出店者ロスター。ここに載っていない店舗IDからの保存は受け付けない
const ROSTER_PATH = __DIR__ . '/shops.json';

// エディタを別オリジンで動かす場合に許可するオリジン。
// 同一オリジン(本番想定)ではCORSヘッダー自体が不要
const ALLOWED_ORIGINS = ['http://localhost:4321'];

header('Content-Type: application/json; charset=utf-8');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}

function fail(int $status, string $key, array $vars = []): void
{
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => marche_text($key, $vars)], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail(405, 'server.postOnly');
}

// 店舗IDはフォルダ名になるため、英小文字・数字・ハイフンのみ許可(パストラバーサル防止)
$shopId = (string)($_POST['shopId'] ?? '');
if (!preg_match('/\A[a-z0-9][a-z0-9-]*\z/', $shopId)) {
    fail(400, 'server.badShopId');
}

// ロスターに載っている店だけを受け付ける。サイトに出ない店のフォルダが増えるのを防ぐ
$roster = is_file(ROSTER_PATH)
    ? json_decode((string)file_get_contents(ROSTER_PATH), true)
    : null;
$rosterIds = [];
$shopCategory = '';
foreach ((is_array($roster) ? $roster['categories'] ?? [] : []) as $category) {
    foreach ($category['shops'] ?? [] as $id) {
        $rosterIds[] = (string)$id;
        if ((string)$id === $shopId) {
            $shopCategory = (string)($category['label'] ?? $category['id'] ?? '');
        }
    }
}
// ロスターが読めないときは検証を省略する(設置直後にロスター未配置でも詰まないように)
if ($rosterIds && !in_array($shopId, $rosterIds, true)) {
    fail(403, 'server.notInRoster');
}

// 店舗データ(data.json の中身)の検証
$raw = $_POST['data'] ?? null;
if (!is_string($raw) || $raw === '') {
    fail(400, 'server.noData');
}
$data = json_decode($raw, true);
if (!is_array($data)) {
    fail(400, 'server.badJson');
}
if (($data['id'] ?? '') !== $shopId) {
    fail(400, 'server.shopIdMismatch');
}
if (!isset($data['items']) || !is_array($data['items'])) {
    fail(400, 'server.noItems');
}

$dayIds = marche_day_ids();
$categoryIds = marche_item_category_ids();
$pricingMode = marche_pricing_mode();
$decimals = (int)(marche_config()['pricing']['currency']['decimals'] ?? 0);

// 画像参照のファイル名を検証する(data.json内の値がそのままファイル名になるため)
$extPattern = implode('|', MARCHE_ALLOWED_EXTENSIONS);
$validImageName = function ($name, string $prefix) use ($extPattern): bool {
    return is_string($name) && ($name === '' || preg_match("/\A{$prefix}\.({$extPattern})\z/", $name));
};

if (!$validImageName($data['logo'] ?? '', 'logo')) {
    fail(400, 'server.badLogoName');
}

// 保存する形に組み直す。出店者が入力した文字列はここでテキストに正規化する(決定6)
$clean = [
    'id' => $shopId,
    'name' => marche_plain_text($data['name'] ?? ''),
    'url' => '',
    'comment' => marche_plain_text($data['comment'] ?? ''),
    'logo' => (string)($data['logo'] ?? ''),
    'items' => [],
];
// URLは http(s) で始まるものだけ通す(javascript: などを弾く)
$url = trim((string)($data['url'] ?? ''));
if ($url !== '' && preg_match('#\Ahttps?://#i', $url)) {
    $clean['url'] = $url;
}

$referenced = ['data.json'];
if ($clean['logo'] !== '') {
    $referenced[] = $clean['logo'];
}

$itemIds = [];
foreach ($data['items'] as $item) {
    if (!is_array($item)) {
        fail(400, 'server.badItem');
    }
    $itemId = (string)($item['id'] ?? '');
    // 商品IDは <店舗ID>-<連番>。他店のIDを名乗れない
    if (!preg_match('/\A' . preg_quote($shopId, '/') . '-[0-9]+\z/', $itemId)) {
        fail(400, 'server.badItemId', ['id' => $itemId]);
    }
    if (isset($itemIds[$itemId])) {
        fail(400, 'server.duplicateItemId', ['id' => $itemId]);
    }
    if (!$validImageName($item['image'] ?? '', preg_quote($itemId, '/'))) {
        fail(400, 'server.badItemImageName', ['id' => $itemId]);
    }

    $clean_item = [
        'id' => $itemId,
        'name' => marche_plain_text($item['name'] ?? ''),
    ];

    // 商品カテゴリ。設定に itemCategories があるときだけ、その値かどうかを確かめる
    $category = (string)($item['category'] ?? '');
    if ($category !== '') {
        if ($categoryIds && !in_array($category, $categoryIds, true)) {
            fail(400, 'server.badCategory', ['id' => $itemId]);
        }
        $clean_item['category'] = $category;
    }

    $description = marche_plain_text($item['description'] ?? '');
    if ($description !== '') {
        $clean_item['description'] = $description;
    }
    if (($item['image'] ?? '') !== '') {
        $clean_item['image'] = (string)$item['image'];
        $referenced[] = (string)$item['image'];
    }

    // 対価。0以下は未設定(サイトに出ない)。ticket 運用では枚数なので整数のみ
    if (isset($item['price']) && $item['price'] !== '' && $item['price'] !== null) {
        $price = $item['price'];
        if (!is_int($price) && !is_float($price)) {
            fail(400, 'server.badPrice', ['id' => $itemId]);
        }
        if ($price < 0) {
            fail(400, 'server.badPrice', ['id' => $itemId]);
        }
        if ($pricingMode === 'ticket' && floor($price) != $price) {
            fail(400, 'server.badPriceInteger', ['id' => $itemId]);
        }
        if ($pricingMode === 'currency') {
            $price = round((float)$price, $decimals);
        }
        $clean_item['price'] = $decimals === 0 || $pricingMode === 'ticket' ? (int)$price : $price;
    }

    // 販売状態。未設定は販売中として扱う
    $status = (string)($item['status'] ?? 'onsale');
    if (!in_array($status, MARCHE_ITEM_STATUSES, true)) {
        fail(400, 'server.badStatus', ['id' => $itemId]);
    }
    $clean_item['status'] = $status;

    // 販売日。設定の days[].id にあるIDのみ。未設定・全日選択は省略する(=全日)
    if (isset($item['saleDays'])) {
        if (!is_array($item['saleDays'])) {
            fail(400, 'server.badSaleDays', ['id' => $itemId]);
        }
        $saleDays = [];
        foreach ($item['saleDays'] as $day) {
            $day = (string)$day;
            if ($dayIds && !in_array($day, $dayIds, true)) {
                fail(400, 'server.badSaleDays', ['id' => $itemId]);
            }
            if (!in_array($day, $saleDays, true)) {
                $saleDays[] = $day;
            }
        }
        // 全日を選んだのと省略は同じ意味。省略側に寄せてデータを小さく保つ
        // (設定が読めず開催日が分からないときは、送られてきたまま保持する)
        $isEveryDay = $dayIds && count($saleDays) >= count($dayIds);
        if ($saleDays && !$isEveryDay) {
            $clean_item['saleDays'] = $saleDays;
        }
    }

    // 表示の微調整。エディタでは編集しないが、手で書き足した値は保持する
    if (isset($item['imagePosition']) && is_string($item['imagePosition'])) {
        $clean_item['imagePosition'] = $item['imagePosition'];
    }
    if (isset($item['useContain'])) {
        $clean_item['useContain'] = (bool)$item['useContain'];
    }

    $itemIds[$itemId] = true;
    $clean['items'][] = $clean_item;
}

// 画像の検証。保存はdata.jsonの書き出しと合わせて最後にまとめて行う
$images = []; // [対象名 => [一時ファイル, 拡張子]]
$totalBytes = 0;
if (isset($_FILES['images'])) {
    $f = $_FILES['images'];
    if (!is_array($f['name'])) {
        fail(400, 'server.imageFieldName');
    }
    foreach ($f['name'] as $target => $clientName) {
        $target = (string)$target;
        // 対象は 'logo' または data.json に含まれる商品ID
        if ($target !== 'logo' && !isset($itemIds[$target])) {
            fail(400, 'server.imageTargetMissing', ['target' => $target]);
        }
        if ($f['error'][$target] !== UPLOAD_ERR_OK) {
            fail(400, 'server.imageUploadFailed', ['name' => $clientName, 'code' => $f['error'][$target]]);
        }
        $tmpName = $f['tmp_name'][$target];
        if (!is_uploaded_file($tmpName)) {
            fail(400, 'server.imageNotUploaded', ['name' => $clientName]);
        }
        $ext = strtolower(pathinfo((string)$clientName, PATHINFO_EXTENSION));
        if (!in_array($ext, MARCHE_ALLOWED_EXTENSIONS, true)) {
            fail(400, 'server.imageExtNotAllowed', [
                'name' => $clientName,
                'allowed' => implode(' / ', MARCHE_ALLOWED_EXTENSIONS),
            ]);
        }
        // 中身も画像であることを確認する(拡張子偽装対策)
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($tmpName);
        if (!is_string($mime) || strpos($mime, 'image/') !== 0) {
            fail(400, 'server.imageNotImage', ['name' => $clientName]);
        }
        // data.json 側の参照(<対象>.<拡張子>)と実ファイルが食い違わないよう照合する
        if (!in_array("{$target}.{$ext}", $referenced, true)) {
            fail(400, 'server.imageMismatch', ['name' => "{$target}.{$ext}"]);
        }
        $totalBytes += (int)$f['size'][$target];
        $images[$target] = [$tmpName, $ext];
    }
}
if ($totalBytes > MARCHE_MAX_TOTAL_IMAGE_BYTES) {
    fail(400, 'server.imageTooLarge');
}

// クライアントが申告した画像数と受信できた数を照合する。PHPは設定次第(file_uploads無効・
// 上限超過など)でファイルだけ黙って捨てるため、それを「画像なしの送信」と誤認しない
$declared = (int)($_POST['imageCount'] ?? 0);
if (count($images) < $declared) {
    if (!ini_get('file_uploads')) {
        fail(500, 'server.uploadsDisabled');
    }
    fail(500, 'server.imageCountMismatch', [
        'declared' => $declared,
        'received' => count($images),
    ]);
}

$dir = SHOP_DATA_DIR . '/' . $shopId;
if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
    fail(500, 'server.mkdirFailed');
}

// 更新日時はサーバー側で付与する(サイト側が画像URLのキャッシュ回避にも使う)
$clean['updatedAt'] = date('c');
$json = json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
if ($json === false || file_put_contents($dir . '/data.json', $json . "\n", LOCK_EX) === false) {
    fail(500, 'server.saveFailed');
}

foreach ($images as $target => [$tmpName, $ext]) {
    if (!move_uploaded_file($tmpName, "{$dir}/{$target}.{$ext}")) {
        fail(500, 'server.imageSaveFailed', ['target' => $target]);
    }
}

// data.json から参照されていないファイルを削除する(削除された商品の画像・
// 拡張子が変わった旧画像の後始末)
$deleted = 0;
foreach (scandir($dir) ?: [] as $entry) {
    if ($entry === '.' || $entry === '..' || !is_file("{$dir}/{$entry}")) {
        continue;
    }
    if (!in_array($entry, $referenced, true)) {
        unlink("{$dir}/{$entry}");
        $deleted++;
    }
}

// 保存成功を運営へ通知する。best-effort のため、送信可否・成否にかかわらず
// 保存は成功として応答する(通知失敗で更新を巻き戻さない)
$summary = notification_summary($shopId, $shopCategory, $clean, count($images));
notify_by_mail($clean['name'], $summary);
marche_notify_webhook(marche_text('notify.shopUpdatedTitle') . "\n" . $summary);

echo json_encode(['ok' => true, 'images' => count($images), 'cleaned' => $deleted], JSON_UNESCAPED_UNICODE);

/**
 * 通知の本文(メール・Webhookで共通)。画像本体は載せず、メタデータだけを並べる。
 */
function notification_summary(string $shopId, string $shopCategory, array $data, int $imageCount): string
{
    // 改行を含む店名は1行に畳む
    $shopName = str_replace("\n", ' ', $data['name']);
    $items = $data['items'];

    // 完売・販売終了・日限定はサイトの見え方が変わるため、件数があるときだけ添える
    $countStatus = function (string $value) use ($items): int {
        return count(array_filter($items, fn($i) => ($i['status'] ?? 'onsale') === $value));
    };
    $limited = count(array_filter($items, fn($i) => !empty($i['saleDays'])));
    $parts = [];
    if ($countStatus('soldout') > 0) {
        $parts[] = marche_text('notify.soldout', ['n' => $countStatus('soldout')]);
    }
    if ($countStatus('ended') > 0) {
        $parts[] = marche_text('notify.ended', ['n' => $countStatus('ended')]);
    }
    if ($limited > 0) {
        $parts[] = marche_text('notify.dayLimited', ['n' => $limited]);
    }
    $breakdown = $parts ? marche_text('notify.breakdown', ['parts' => implode(' / ', $parts)]) : '';

    return implode("\n", [
        marche_text('notify.labelTime') . ': ' . date('Y-m-d H:i:s'),
        marche_text('notify.labelShopName') . ': ' . $shopName,
        marche_text('notify.labelShopId') . ': ' . $shopId
            . ($shopCategory !== '' ? " ({$shopCategory})" : ''),
        marche_text('notify.labelItems') . ': ' . marche_text('notify.countUnit', ['n' => count($items)]) . $breakdown
            . ' / ' . marche_text('notify.labelImages') . ': ' . marche_text('notify.countUnit', ['n' => $imageCount]),
        marche_text('notify.labelSavedTo') . ": shop-data/{$shopId}/",
    ]);
}

/**
 * 出店者情報の更新を運営へメール通知する。
 * 通知先(SHOP_NOTIFY_EMAIL)か送信元(SENDER_EMAIL)が未設定なら送らない。
 */
function notify_by_mail(string $shopName, string $summary): void
{
    $notifyTo = marche_secret('SHOP_NOTIFY_EMAIL');
    $sender = marche_secret('SENDER_EMAIL');
    if ($notifyTo === '' || $sender === '') {
        return;
    }

    // 件名・本文とも UTF-8/Base64 で一貫させる('Japanese' にすると本文が
    // ISO-2022-JP へ変換され、UTF-8 と宣言したヘッダーと不整合を起こす)
    mb_language('uni');
    mb_internal_encoding('UTF-8');

    $subject = marche_header_safe(marche_text('notify.shopUpdatedSubject', [
        'name' => str_replace("\n", ' ', $shopName),
    ]));
    $body = marche_text('notify.shopUpdatedIntro') . "\n\n" . $summary;

    // 第5引数 -f でエンベロープ送信者(Return-Path)を送信ドメインに揃え、SPF整合を取る
    mb_send_mail($notifyTo, $subject, $body, "From: {$sender}\r\n", '-f' . $sender);
}
