<?php
/**
 * send.php — 問い合わせフォームの受信とメール送信
 *
 * フロントから JSON を POST で受け取り、運営へ通知メールを送る。
 * 呼び出し元は Content-Type を指定しないことがあるため、php://input から直接読む。
 *
 * ## 項目定義は1箇所
 *
 * フォームの項目(name / label / required / validation / maxLength)は
 * forms/<種別>.json が正で、フロントの生成とここの検証が同じファイルを読む。
 * 項目を増やすときはJSON側だけを直せば両方に反映される。
 *
 * 通知先メールアドレスと自動返信の文面は**公開ディレクトリのJSONに入れない。**
 * 通知先は .env(secrets.php)から、自動返信の文面は辞書(i18n)から取る。
 */

// 本番では画面にエラーを出さない(JSON応答が壊れるため)
ini_set('display_errors', '0');
error_reporting(0);

require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

$rawInput = file_get_contents('php://input');
if (!$rawInput) {
    respond(400, ['ok' => false, 'error' => marche_text('server.noInput')]);
}

$data = json_decode($rawInput, true);
if (!is_array($data)) {
    respond(400, ['ok' => false, 'error' => marche_text('server.invalidJson')]);
}

$type = (string)($data['type'] ?? '');
$def = marche_form_definition($type);
if ($def === null || ($def['formType'] ?? $type) !== $type) {
    respond(400, ['ok' => false, 'error' => marche_text('server.unknownFormType')]);
}

$fields = is_array($def['fields'] ?? null) ? $def['fields'] : [];
$notifyTo = marche_secret('NOTIFY_EMAIL');
$sender = marche_secret('SENDER_EMAIL');

// メールは UTF-8 で送る。'Japanese' にすると mb_send_mail が本文を ISO-2022-JP へ
// 変換するため、UTF-8 と宣言したヘッダーと不整合を起こし文字化けする。'uni' は
// 件名・本文とも UTF-8(Base64)で一貫して送るので、Content-Type ヘッダーは付けない
mb_language('uni');
mb_internal_encoding('UTF-8');
date_default_timezone_set(marche_config()['timezone'] ?? date_default_timezone_get());

/**
 * サーバー側のフィールド検証。フロントの検証はバイパスできるので二重に持つ。
 * 空値は required に委ね、値があるときだけ形式を検査する。
 * 問題があれば人間向けのメッセージを、なければ null を返す。
 */
function validate_fields(array $fields, array $data): ?string
{
    foreach ($fields as $field) {
        $name = $field['name'] ?? null;
        if (!$name) {
            continue;
        }
        $label = (string)($field['label'] ?? $name);
        $value = isset($data[$name]) ? trim((string)$data[$name]) : '';

        // 必須チェック(空値はここで確定させ、以降の形式検査はしない)
        if ($value === '') {
            if (!empty($field['required'])) {
                return marche_text('server.fieldRequired', ['label' => $label]);
            }
            continue;
        }

        if (isset($field['maxLength']) && mb_strlen($value) > $field['maxLength']) {
            return marche_text('server.fieldTooLong', ['label' => $label, 'max' => $field['maxLength']]);
        }

        // 形式検査(フロントの検証と同じ語彙・同じ規則)
        switch ($field['validation'] ?? 'none') {
            case 'number':
                if (!preg_match('/\A[0-9]+\z/', $value)) {
                    return marche_text('server.fieldNumber', ['label' => $label]);
                }
                break;
            case 'halfwidth':
                if (!preg_match('/\A[\x20-\x7E]+\z/', $value)) {
                    return marche_text('server.fieldHalfwidth', ['label' => $label]);
                }
                break;
            case 'email':
                if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
                    return marche_text('server.fieldEmail', ['label' => $label]);
                }
                break;
            case 'phone':
                if (!preg_match('/\A0\d{9,10}\z/', (string)preg_replace('/[-\s]/', '', $value))) {
                    return marche_text('server.fieldPhone', ['label' => $label]);
                }
                break;
            case 'url':
                if (!preg_match('#\Ahttps?://#i', $value) || !filter_var($value, FILTER_VALIDATE_URL)) {
                    return marche_text('server.fieldUrl', ['label' => $label]);
                }
                break;
        }
    }
    return null;
}

/**
 * テンプレート文字列の {key} を送信値で置き換える。
 */
function render_template(string $template, array $data): string
{
    return (string)preg_replace_callback('/\{([a-zA-Z0-9_]+)\}/', function ($m) use ($data) {
        return isset($data[$m[1]]) ? (string)$data[$m[1]] : '';
    }, $template);
}

/**
 * 送信内容をすべて並べたプレーンテキスト(運営への通知本文)。
 * 見出しはフィールド定義の label を使い、定義に無いキーは name のまま出す。
 */
function build_admin_body(array $data, array $fields): string
{
    $labels = [];
    foreach ($fields as $field) {
        if (isset($field['name'])) {
            $labels[$field['name']] = $field['label'] ?? $field['name'];
        }
    }

    $lines = [
        marche_text('notify.labelReceivedAt') . ': ' . date('Y-m-d H:i:s'),
        marche_text('notify.labelFormType') . ': ' . (string)($data['type'] ?? ''),
        '----------------------------------------',
    ];
    foreach ($data as $key => $value) {
        if ($key === 'type' || $key === 'submissionId') {
            continue;
        }
        $heading = $labels[$key] ?? $key;
        // 複数行になりうる項目は見出しの次の行から出す
        $lines[] = str_contains((string)$value, "\n")
            ? "{$heading}:\n{$value}"
            : "{$heading}: {$value}";
    }
    return implode("\n", $lines);
}

// --------------------------------------------------------
// 0. サーバー側フィールド検証
// --------------------------------------------------------
$validationError = validate_fields($fields, $data);
if ($validationError !== null) {
    respond(400, ['ok' => false, 'error' => $validationError]);
}

// 通知先か送信元が未設定なら、送るあてがないので設置の不備として扱う
if ($notifyTo === '' || $sender === '') {
    respond(500, ['ok' => false, 'error' => marche_text('server.mailNotConfigured')]);
}

// --------------------------------------------------------
// 1. 運営への通知メール
// --------------------------------------------------------
$subject = marche_header_safe(render_template(
    marche_text('notify.formSubject', ['type' => $type]),
    $data
));
$headers = "From: {$sender}\r\n";

// Reply-To には利用者の入力が入るため、形式を検証してヘッダインジェクションを防ぐ
$replyToField = (string)($def['replyToField'] ?? 'email');
$replyTo = (string)($data[$replyToField] ?? '');
if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
    $headers .= "Reply-To: {$replyTo}\r\n";
}

// 第5引数 -f でエンベロープ送信者(Return-Path)を From と同じドメインに揃え、
// SPF整合を取る(迷惑メール判定の軽減)
mb_send_mail($notifyTo, $subject, build_admin_body($data, $fields), $headers, '-f' . $sender);

// --------------------------------------------------------
// 2. 送信者への自動返信(forms/<種別>.json の autoReply が true のときだけ)
// --------------------------------------------------------
if (!empty($def['autoReply'])) {
    $toField = (string)($def['autoReplyToField'] ?? 'email');
    $userEmail = (string)($data[$toField] ?? '');

    if ($userEmail !== '' && filter_var($userEmail, FILTER_VALIDATE_EMAIL)) {
        $autoSubject = marche_header_safe(render_template(marche_text('notify.autoReplySubject'), $data));
        $autoBody = render_template(marche_text('notify.autoReplyBody'), $data);

        // 日本語などの送信者名はMIMEエンコードする。辞書で空にすればアドレスだけになる
        $senderName = marche_text('notify.autoReplySenderName');
        $autoHeaders = ($senderName === '' || $senderName === 'notify.autoReplySenderName')
            ? "From: {$sender}\r\n"
            : 'From: ' . mb_encode_mimeheader($senderName) . " <{$sender}>\r\n";
        $autoHeaders .= "Reply-To: {$notifyTo}\r\n";

        mb_send_mail($userEmail, $autoSubject, $autoBody, $autoHeaders, '-f' . $sender);
    }
}

respond(200, ['ok' => true]);
