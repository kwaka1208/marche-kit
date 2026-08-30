<?php
/**
 * secrets.example.php — 秘密情報の受け皿の見本
 *
 * **このファイルに実際の値を書かないこと。** Gitで管理されます。
 *
 * 実運用の値は同じフォルダの secrets.php に置きます(.gitignore 済み)。
 * .env を書いて次を実行すると生成されます。
 *
 *     python3 tools/inject-env.py <配置先ディレクトリ>
 *
 * サーバーで環境変数を設定できる場合は、secrets.php を置かずに
 * MARCHE_ADMIN_KEY などの環境変数で与えても構いません(環境変数が優先されます)。
 *
 * 各項目の意味は .env.example を参照してください。
 */
return [
    'ADMIN_KEY' => '',
    'WEBHOOK_URL' => '',
    'NOTIFY_EMAIL' => '',
    'SHOP_NOTIFY_EMAIL' => '',
    'SENDER_EMAIL' => '',
];
