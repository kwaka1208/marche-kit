<?php
/**
 * put-json.php — お知らせなどのJSONファイル書き込み
 *
 * core/editor/news/news-editor.js から news.json を書き込むために使う。
 * このフォルダ(data/)配下に限って、合言葉つきでJSONファイルを上書きできる。
 *
 * 外部のツール(スプレッドシート連携のスクリプトなど)から同じプロトコルで
 * 書き込むこともできる。その場合はツール側に次の3つを設定する。
 *
 *     このファイルのURL / 合言葉(apiKey) / targetDir(このフォルダからの相対パス。直下なら '.')
 *
 * ## 合言葉
 *
 * 合言葉は .env の MARCHE_ADMIN_KEY で、secrets.php 経由で読む。
 * **このファイルに書かないこと。**
 *
 * 注意: news-editor.js はブラウザに配信されるため、/editor/ をBasic認証などで
 * 保護しない限り合言葉は閲覧者に見える。その場合ここの認証は実質的に効かない。
 */

require __DIR__ . '/config.php';

header('Content-Type: text/plain; charset=utf-8');

$secretKey = marche_secret('ADMIN_KEY');

// 0. 設定チェック(合言葉が未設定のまま公開しても受け付けない)
if ($secretKey === '') {
    http_response_code(500);
    echo marche_text('server.keyNotConfigured');
    exit;
}

// 1. 認証チェック
if (!isset($_POST['apiKey']) || !hash_equals($secretKey, (string)$_POST['apiKey'])) {
    http_response_code(403);
    echo marche_text('server.authFailed');
    exit;
}

// 2. 送信されたデータの受け取り
$fileName    = (string)($_POST['fileName'] ?? '');
$targetDir   = (string)($_POST['targetDir'] ?? '.');
$fileContent = (string)($_POST['fileContent'] ?? '');

// 3. ファイル名の検証: 英数字・ハイフン・アンダースコアのみ、拡張子は .json 限定
// (ディレクトリ遡りや .php などの書き込みをブロック)
if (!preg_match('/\A[A-Za-z0-9_-]+\.json\z/', $fileName)) {
    http_response_code(400);
    echo marche_text('server.badFileName');
    exit;
}

// 4. 保存先の検証: このフォルダ(data/)配下の相対パスのみ許可(絶対パス・遡り不可)
if (!preg_match('#\A[A-Za-z0-9._/-]+\z#', $targetDir) || strpos($targetDir, '..') !== false) {
    http_response_code(400);
    echo marche_text('server.badTargetDir');
    exit;
}
$dir = __DIR__ . '/' . trim($targetDir, '/');

// 5. 中身がJSONとして読めることを確かめる(壊れたファイルでサイトを止めない)
if (json_decode($fileContent, true) === null && trim($fileContent) !== 'null') {
    http_response_code(400);
    echo marche_text('server.badJson');
    exit;
}

// 6. 保存先フォルダが無ければ作る
// ※ サーバーの権限(パーミッション)設定によっては作成に失敗することがあります
if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
    http_response_code(500);
    echo marche_text('server.mkdirFailed');
    exit;
}

// 7. ファイルとして保存(上書き)
if (file_put_contents($dir . '/' . $fileName, $fileContent, LOCK_EX) === false) {
    http_response_code(500);
    echo marche_text('server.writeFailed');
    exit;
}

http_response_code(200);
echo 'OK';
