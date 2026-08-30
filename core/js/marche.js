// 描画JSの入口
//
// テーマのHTMLからは、この1行だけを読み込む。
//
//     <script type="module" src="js/marche.js"></script>
//
// 読み込む順序と、どこで失敗したときに何を見せるかをここで決める。
// 個々の描画は shops.js / items.js / announcements.js / social.js / form.js が受け持つ。

import { initAnnouncements } from './announcements.js';
import { loadConfig, t } from './config.js';
import { loadShopData } from './data.js';
import { initForms } from './form.js';
import { initItems } from './items.js';
import { initPopups } from './popup.js';
import { initShops } from './shops.js';
import { initSocial } from './social.js';
import { initUi } from './ui.js';
import { el } from './util.js';

// テーマのHTMLに書かれた data-i18n を辞書の文言で埋める。
// テーマが文言を直書きしたいときは、この属性を付けなければよい
function applyStaticText(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
}

// 出店者データが読めなかったことを、器の中に出す。
// 器を空のままにすると「まだ出店者がいない」ように見えてしまうため
function showShopLoadError() {
  const containers = [
    ...document.querySelectorAll('[data-marche-shops]'),
    ...document.querySelectorAll('[data-marche-items]'),
  ];
  for (const container of containers) {
    container.textContent = '';
    container.appendChild(el('p', 'loading-message', t('shop.loadError')));
  }
}

async function start() {
  // 設定と辞書が無いと文言も対価も出せない。ここで失敗したら描画に進まない
  // (t() はキー名を返すため、画面には英字のキーが出る。原因はコンソールに残す)
  await loadConfig();

  applyStaticText();
  initPopups();
  initUi();
  // 出店者データを待たない。設定だけで描けるものは先に出す
  initSocial();
  // フォームは自前の定義(forms/<種別>.json)だけで組み立てられる。
  // 失敗しても他の描画を止めない(器ごと隠して先へ進む)
  const forms = initForms();

  // お知らせは外部JSONで応答が遅いことがある。出店者データの取得と並行して進める
  const announcements = initAnnouncements();

  try {
    const store = await loadShopData();
    // 商品を先に初期化するのは、店舗ポップアップが商品の一覧を使うため
    initItems(store);
    initShops(store);
  } catch (error) {
    console.error('出店者データの読み込みに失敗しました:', error);
    showShopLoadError();
  }

  await announcements;
  await forms;
}

start().catch((error) => {
  console.error('サイト設定または辞書の読み込みに失敗しました:', error);
});
