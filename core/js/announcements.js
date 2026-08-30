// お知らせの描画
//
// データの実体は外部JSON。運営が編集するとサイトの再ビルドなしに反映される。
// 取得先と表示件数は marche.config.json の announcements から読む。
//
// 取得に2秒前後かかることがあるため、セクションは「読み込み中」の表示付きで最初から出しておき、
// 取れたら差し替える。古い内容の仮表示(ビルド時のスナップショットやブラウザ側のキャッシュ)は
// 採らない — 最新が取れなかったときに古い情報が見えるほうが困るため(concepts.md)。

import { announcements as announcementsConfig, formatDate, t } from './config.js';
import { el, fetchJson } from './util.js';

// 最初から見せる件数の既定値。設定の visibleCount で変えられる
const DEFAULT_VISIBLE_COUNT = 3;

// 必須項目が欠けたものと日付が読めないものを落とし、日付の新しい順に並べる
function normalize(data) {
  return (Array.isArray(data) ? data : [])
    .filter((item) => item && item.title && item.body && !isNaN(new Date(item.date)))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// お知らせ1件。開閉は <details> に任せる(テーマがJSを持たなくても開閉できる)
function buildAnnouncement(item, { isLatest = false, open = false } = {}) {
  const details = el('details', 'announcement' + (isLatest ? ' announcement--latest' : ''));
  details.open = open;

  const summary = el('summary', 'announcement-summary');
  const date = el('span', 'announcement-date', formatDate(item.date));
  if (isLatest) date.appendChild(el('span', 'announcement-badge-new', t('announcements.badgeNew')));
  summary.append(date, el('span', 'announcement-title', item.title));

  // 開いているときと閉じているときで見せる文言を入れ替える。
  // どちらを出すかはテーマのCSSが決める(コアは両方を置くだけ)
  const toggle = el('span', 'announcement-toggle');
  toggle.append(
    el('span', 'toggle-text toggle-text--open', t('common.showDetail')),
    el('span', 'toggle-text toggle-text--close', t('common.close'))
  );
  summary.appendChild(toggle);

  const body = el('div', 'announcement-body');
  // 本文だけはHTML文字列として扱う。運営しか書けないため許している。
  // 出店者が入力する項目は、どこもテキストとして描画している
  body.innerHTML = item.body;

  details.append(summary, body);
  return details;
}

// 「過去のお知らせ」の開閉。過去分が無ければボタンごと隠す
function setupPastToggle(past, toggleButton, hasPast) {
  if (!toggleButton) return;
  if (!hasPast) {
    toggleButton.hidden = true;
    return;
  }
  toggleButton.hidden = false;
  toggleButton.textContent = t('announcements.showPast');
  // お知らせを差し替えるたびに呼ばれるため、代入で多重登録を防ぐ
  toggleButton.onclick = () => {
    const expanded = past.classList.toggle('is-expanded');
    toggleButton.textContent = expanded ? t('announcements.hidePast') : t('announcements.showPast');
  };
}

export async function initAnnouncements() {
  const section = document.querySelector('[data-marche-announcements-section]');
  const list = document.querySelector('[data-marche-announcements]');
  const status = document.querySelector('[data-marche-announcements-status]');
  const past = document.querySelector('[data-marche-announcements-past]');
  const toggleButton = document.querySelector('.announcements-toggle-button');

  // お知らせのスロットが無いテーマでは何もしない
  if (!list) return;

  const config = announcementsConfig();
  const source = config.source ?? '';
  // 取得先が未設定のイベントではセクションごと出さない
  if (!source) {
    if (section) section.hidden = true;
    return;
  }

  let items;
  try {
    items = normalize(await fetchJson(source));
  } catch (error) {
    // 取得できなかったことは黙って隠さず伝える。0件とは意味が違う
    console.error('お知らせの読み込みに失敗しました:', error);
    if (status) status.textContent = t('announcements.loadError');
    return;
  }

  // 1件も無いときはセクションごと非表示にする
  if (items.length === 0) {
    if (section) section.hidden = true;
    return;
  }

  const visibleCount = Number(config.visibleCount) > 0
    ? Number(config.visibleCount)
    : DEFAULT_VISIBLE_COUNT;

  if (status) status.remove();
  list.textContent = '';
  // 最新の1件だけはバッジを付け、開いた状態で出す
  items.slice(0, visibleCount).forEach((item, i) => {
    list.appendChild(buildAnnouncement(item, { isLatest: i === 0, open: i === 0 }));
  });

  const older = items.slice(visibleCount);
  if (past) {
    past.textContent = '';
    for (const item of older) past.appendChild(buildAnnouncement(item));
  }
  setupPastToggle(past, toggleButton, past !== null && older.length > 0);
}
