// 商品の描画
//
// 商品カード・カテゴリのフィルタ・「もっと見る」・商品ポップアップを受け持つ。
// **どこまで出すかは marche.config.json の items.display が決める**(既定は none = 出さない)。
// テーマにスロットがあっても、設定が出さないと言っていれば埋めない。
// 出力するクラス名は docs/theme-contract.md の約束。**テーマ側で改名できない。**
// 見た目(色・余白・段数)はここでは決めず、テーマのCSSに任せる。

import {
  FALLBACK_IMAGES,
  faceValueNote,
  itemCategories,
  itemDisplay,
  priceNote,
  priceParts,
  saleDayLabel,
  t,
} from './config.js';
import { isSoldOut } from './data.js';
import { openPopup, registerPopup, switchPopup } from './popup.js';
import {
  announceRendered,
  el,
  hideSection,
  maybeShuffle,
  oneLine,
  setImage,
  setText,
} from './util.js';

// 折りたたみ時に見せる行数。段数(列の数)はテーマのCSSが決めるため、
// 件数ではなく行数で持つ(何列で並ぼうと、見えるのは常にこの行数になる)
const INITIAL_ROWS = 3;

// 画面幅の変更に追従する間隔(ミリ秒)。列数が変わると折りたたみの件数も変わる
const RESIZE_DEBOUNCE = 200;

const state = {
  store: null,
  // フィルタ適用後の並び。シャッフル済みで、ここから先頭 n 件を描画する
  filtered: [],
  grid: null,
  filterContainer: null,
  showMoreButton: null,
  resizeTimer: null,
};

// ---------------------------------------------------------------- 部品

// 対価を数値・単位・但し書きに分けて入れる。
// 文字列に組み立てないのは、テーマが単位だけ小さく見せられるようにするため
function fillPrice(container, item) {
  container.textContent = '';
  const { value, unit, position } = priceParts(item.price);
  const valueEl = el('span', 'price-value', value);
  const unitEl = unit ? el('span', 'price-unit', unit) : null;

  if (unitEl && position === 'prefix') container.append(unitEl, valueEl);
  else if (unitEl) container.append(valueEl, unitEl);
  else container.append(valueEl);

  // 但し書き(「税込」など)は設定に文言が無ければ要素ごと出さない。
  // 並び順を変えたいテーマは CSS の order で入れ替える
  const note = priceNote();
  if (note) container.appendChild(el('span', 'price-note', note));
}

// 販売日の表記。全日の商品と1日開催のイベントでは要素ごと出さない
function saleDayElement(item, key) {
  const label = saleDayLabel(item);
  return label ? el('span', 'item-sale-day', t(key, { label })) : null;
}

// 完売の帯。販売中の商品では要素ごと出さない
function soldOutElement(item) {
  return isSoldOut(item) ? el('span', 'item-sold-out-badge', t('item.soldOut')) : null;
}

// 商品画像。出店者が指定した見せ方(はみ出しを許すか・寄せる位置)だけを反映する
function itemImage(item, className) {
  const img = el('img', className);
  img.alt = oneLine(item.name) || t('item.imageAlt');
  img.loading = 'lazy';
  img.style.objectFit = item.useContain ? 'contain' : 'cover';
  if (item.imagePosition) img.style.objectPosition = item.imagePosition;
  setImage(img, item.image, FALLBACK_IMAGES.item);
  return img;
}

// 商品のサムネイル。店舗ポップアップの取り扱い一覧と、
// 商品ポップアップの「この店の他の商品」で共通に使う
export function buildItemThumb(item, onClick) {
  const thumb = el('div', 'item-thumb');
  thumb.dataset.itemId = item.id;
  thumb.appendChild(itemImage(item, 'item-thumb-image'));

  const badge = soldOutElement(item);
  if (badge) thumb.appendChild(badge);
  const saleDay = saleDayElement(item, 'item.saleDayOnly');
  if (saleDay) thumb.appendChild(saleDay);

  const name = el('span', 'item-thumb-name');
  setText(name, item.name || t('item.noName'));
  thumb.appendChild(name);

  thumb.addEventListener('click', () => onClick(item.id));
  return thumb;
}

// ---------------------------------------------------------------- 商品カード

function buildItemCard(item) {
  const card = el('div', 'item-card');
  if (isSoldOut(item)) card.classList.add('is-sold-out');
  card.dataset.itemId = item.id;
  card.dataset.shopId = item.shopId;
  // カテゴリごとの微調整のための手がかり。テーマは基本的にこれを見ずに書く
  if (item.category) card.dataset.category = item.category;

  const top = el('div', 'item-card-top');
  const shopLogo = el('img', 'item-card-shop-logo');
  shopLogo.alt = t('shop.logoAlt', { name: oneLine(item.shopName) });
  shopLogo.loading = 'lazy';
  setImage(shopLogo, item.shopLogo, FALLBACK_IMAGES.shop);
  top.appendChild(shopLogo);

  const priceInfo = el('div', 'item-card-price-info');
  const saleDay = saleDayElement(item, 'item.saleDayOnly');
  if (saleDay) priceInfo.appendChild(saleDay);
  const price = el('span', 'item-price');
  fillPrice(price, item);
  priceInfo.appendChild(price);
  top.appendChild(priceInfo);

  const imageWrapper = el('div', 'item-image-wrapper');
  imageWrapper.appendChild(itemImage(item, 'item-image'));
  const badge = soldOutElement(item);
  if (badge) imageWrapper.appendChild(badge);

  const textContent = el('div', 'item-text-content');
  const name = el('h4', 'item-name');
  setText(name, item.name || t('item.noName'));
  const shopName = el('p', 'item-shop-name');
  setText(shopName, item.shopName);
  textContent.append(name, shopName, el('button', 'item-detail-button', t('common.showDetail')));

  card.append(top, imageWrapper, textContent);
  return card;
}

// テーマのCSSが決めた列数を読む。折りたたみ時に何件見せるかの計算に使う
// (件数を設定で持たせず実際の段組みから読むのは、画面幅ごとに行数を揃えるため)
function columnCount() {
  if (!state.grid) return 1;
  const columns = getComputedStyle(state.grid).getPropertyValue('grid-template-columns');
  return columns.split(' ').filter(Boolean).length || 1;
}

const collapsedCount = () => columnCount() * INITIAL_ROWS;

function renderItemCards(items) {
  state.grid.textContent = '';
  if (items.length === 0) {
    state.grid.appendChild(el('p', 'loading-message', t('item.empty')));
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const item of items) fragment.appendChild(buildItemCard(item));
  state.grid.appendChild(fragment);
}

function updateShowMoreButton() {
  if (!state.showMoreButton) return;
  const isCollapsed = state.grid.classList.contains('is-collapsed');
  // 折りたたむほどの件数が無いときはボタンごと隠す
  if (state.filtered.length > collapsedCount()) {
    state.showMoreButton.hidden = false;
    state.showMoreButton.textContent = isCollapsed ? t('common.showMore') : t('common.close');
  } else {
    state.showMoreButton.hidden = true;
  }
}

function updateGrid() {
  if (!state.grid) return;
  const isCollapsed = state.grid.classList.contains('is-collapsed');
  renderItemCards(isCollapsed ? state.filtered.slice(0, collapsedCount()) : state.filtered);
  updateShowMoreButton();
  announceRendered('items');
}

// フィルタを当て直す。表示順は当てるたびにシャッフルする(掲載順の有利不利をなくす)
function applyFilter(categoryId) {
  const base = categoryId === 'all'
    ? state.store.items
    : state.store.items.filter((item) => item.category === categoryId);
  state.filtered = maybeShuffle(base);
  state.grid.classList.toggle('is-collapsed', state.filtered.length > collapsedCount());
  updateGrid();
}

// ---------------------------------------------------------------- フィルタ

// フィルタボタンは設定の itemCategories から作る。
// カテゴリが未定義のイベントでは1つも作らず、全商品をそのまま出す
function renderFilterButtons() {
  const categories = itemCategories();
  if (!state.filterContainer || categories.length === 0) return;

  state.filterContainer.textContent = '';
  const entries = [{ id: 'all', label: t('item.filterAll') }, ...categories];
  for (const [i, category] of entries.entries()) {
    const button = el('button', 'filter-button', category.label);
    button.dataset.filter = category.id;
    if (i === 0) button.classList.add('active-filter');
    state.filterContainer.appendChild(button);
  }

  state.filterContainer.addEventListener('click', (e) => {
    const button = e.target.closest('.filter-button');
    if (!button) return;
    state.filterContainer.querySelector('.active-filter')?.classList.remove('active-filter');
    button.classList.add('active-filter');
    applyFilter(button.dataset.filter);
  });
}

// ---------------------------------------------------------------- ポップアップ

// テーマが用意した空のスロットに値を流し込む。スロットの見た目はテーマの自由
function updateItemPopup(itemId) {
  const item = state.store.items.find((i) => i.id === itemId);
  if (!item) return;
  const $ = (selector) => document.querySelector(selector);

  const image = $('.item-popup-image');
  if (image) setImage(image, item.image, FALLBACK_IMAGES.item);

  const name = $('.item-popup-name');
  if (name) setText(name, item.name || t('item.noName'));

  const shopName = $('.item-popup-shop-name');
  if (shopName) setText(shopName, item.shopName);

  const description = $('.item-popup-description');
  if (description) setText(description, item.description || t('item.noDescription'));

  const price = $('.item-popup-price');
  if (price) fillPrice(price, item);

  // ポップアップは同じ要素を使い回すため、条件に合わない商品では必ず隠し直す
  // (前に開いた商品の販売日や完売の表示が残らないように)
  const saleDay = $('.item-popup-sale-day');
  if (saleDay) {
    const label = saleDayLabel(item);
    saleDay.textContent = label ? t('item.saleDayLabel', { label }) : '';
    saleDay.hidden = !label;
  }

  const soldOut = $('.item-popup-sold-out');
  if (soldOut) {
    soldOut.textContent = t('item.soldOut');
    soldOut.hidden = !isSoldOut(item);
  }

  // 同じ店の他の商品。1件も無ければ区画ごと隠す
  const section = $('.item-popup-other-items');
  const list = $('.item-popup-other-items-list');
  if (!list) return;
  const others = state.store.items.filter((i) => i.shopId === item.shopId && i.id !== item.id);
  list.textContent = '';
  if (section) section.hidden = others.length === 0;
  for (const other of others) {
    // 同じポップアップの中身だけを差し替える(開き直さない)
    list.appendChild(buildItemThumb(other, updateItemPopup));
  }
}

// ---------------------------------------------------------------- 初期化

export function initItems(store) {
  state.store = store;

  const display = itemDisplay();
  const section = document.querySelector('[data-marche-items-section]');

  // チケット1枚の額面の案内。スロットを置いたテーマにだけ出す。
  // 金額運用のイベント・額面を出さない設定・商品を出さない設定では要素ごと隠す
  const faceValue = document.querySelector('[data-marche-face-value]');
  if (faceValue) {
    const note = display === 'none' ? '' : faceValueNote();
    faceValue.textContent = note;
    faceValue.hidden = !note;
  }

  // 商品を掲載しないイベント(既定)では、ここから先は何もしない。
  // ポップアップも登録しないため、店舗ポップアップから商品へ移る経路ごと閉じる
  if (display === 'none') {
    hideSection(section);
    return;
  }

  registerPopup('item', {
    overlay: document.querySelector('.item-popup-overlay'),
    closeButton: document.querySelector('.item-popup-close-button'),
    update: updateItemPopup,
  });

  // 「店舗からのリンクだけ」の設定では、一覧のセクションごと出さない。
  // 商品はポップアップの中にだけあり、ページ内の一覧としては現れない
  if (display !== 'list') {
    hideSection(section);
    return;
  }

  state.grid = document.querySelector('[data-marche-items]');
  state.filterContainer = document.querySelector('.item-filter-buttons');
  state.showMoreButton = document.querySelector('.show-more-button');

  // 一覧のスロットが無いテーマ(商品一覧を置かないページ)では、ここから先は何もしない
  if (!state.grid) return;

  renderFilterButtons();

  state.grid.addEventListener('click', (e) => {
    const card = e.target.closest('.item-card');
    if (!card) return;
    // 画像と詳細ボタンは商品、店のロゴはその店の紹介へ
    if (e.target.closest('.item-detail-button') || e.target.closest('.item-image-wrapper')) {
      openPopup('item', card.dataset.itemId);
    } else if (e.target.closest('.item-card-shop-logo')) {
      openPopup('shop', card.dataset.shopId);
    }
  });

  state.showMoreButton?.addEventListener('click', () => {
    state.grid.classList.toggle('is-collapsed');
    updateGrid();
  });

  // 列数はテーマのCSS(メディアクエリ)で変わる。幅が変わったら折りたたみを計算し直す
  window.addEventListener('resize', () => {
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(updateGrid, RESIZE_DEBOUNCE);
  }, { passive: true });

  // 最初はカテゴリを絞らない。カテゴリが未定義のイベントでも同じ経路で通る
  applyFilter('all');
}

// 店舗ポップアップから商品ポップアップへ移るときに使う
export const openItemFromShop = (itemId) => switchPopup('shop', 'item', itemId);
