// 出店者の描画
//
// 出店者カードと店舗ポップアップを受け持つ。
// カテゴリの数と名前はイベントごとに違うため、コアは固定のIDを持たない(決定1)。
// テーマが置いたスロット [data-marche-shops="<カテゴリID>"] を探し、あるものだけを埋める。

import { FALLBACK_IMAGES, t } from './config.js';
import { buildItemThumb, openItemFromShop } from './items.js';
import { openPopup, registerPopup } from './popup.js';
import {
  announceRendered,
  el,
  isHttpUrl,
  maybeShuffle,
  oneLine,
  setImage,
  setText,
} from './util.js';

const state = {
  store: null,
};

// ---------------------------------------------------------------- 出店者カード

function buildShopCard(shop) {
  // カテゴリごとに見た目を変える手がかりを2つ出す(決定1)。
  // テーマは variant に当てるのが基本で、data-category はこのイベント専用の逃げ道
  const card = el('div', `shop-card-info shop-card--${shop.variant}`);
  card.dataset.category = shop.categoryId;
  card.dataset.shopId = shop.id;

  // ロゴ未設定の店も枠を空にせず代替画像を出す(カードの高さが揃うように)
  const logo = el('img', 'shop-logo');
  logo.alt = t('shop.logoAlt', { name: oneLine(shop.name) });
  logo.loading = 'lazy';
  setImage(logo, shop.logo, FALLBACK_IMAGES.shop);
  card.appendChild(logo);

  const name = el('h3', 'shop-name');
  setText(name, shop.name || t('shop.noName'));
  card.appendChild(name);

  // 公式サイトを登録していない店ではリンクごと出さない
  if (isHttpUrl(shop.url)) {
    const link = el('a', 'shop-card-official-link', t('shop.officialSite'));
    link.href = shop.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    card.appendChild(link);
  }

  return card;
}

function renderShopGrid(container, shops) {
  container.textContent = '';
  if (shops.length === 0) {
    container.appendChild(el('p', 'loading-message', t('shop.empty')));
    return;
  }
  const fragment = document.createDocumentFragment();
  // 掲載順に有利不利を作らないため、読み込みのたびに並びを入れ替える
  for (const shop of maybeShuffle(shops)) fragment.appendChild(buildShopCard(shop));
  container.appendChild(fragment);
}

// カテゴリごとのスロットを埋める。スロットの無いカテゴリは描画しない
// (どのカテゴリをどこに出すかはテーマのHTMLが決める)
function renderShopGrids() {
  for (const category of state.store.categories) {
    const container = document.querySelector(`[data-marche-shops="${CSS.escape(category.id)}"]`);
    if (!container) continue;

    renderShopGrid(container, category.shops);

    container.addEventListener('click', (e) => {
      // カード内のリンク(公式サイト)は素通しする
      if (e.target.closest('a')) return;
      const card = e.target.closest('.shop-card-info');
      if (card?.dataset.shopId) openShopPopupById(card.dataset.shopId);
    });
  }
  announceRendered('shops');
}

// ---------------------------------------------------------------- ポップアップ

// テーマが用意した空のスロットに値を流し込む。スロットの見た目はテーマの自由
function updateShopPopup(shopId) {
  const shop = state.store.shops.get(shopId);
  if (!shop) return;
  const $ = (selector) => document.querySelector(selector);

  const logo = $('.shop-popup-logo');
  if (logo) {
    logo.alt = t('shop.logoAlt', { name: oneLine(shop.name) });
    setImage(logo, shop.logo, FALLBACK_IMAGES.shop);
  }

  const name = $('.shop-popup-name');
  if (name) setText(name, shop.name || t('shop.noName'));

  // ポップアップは同じ要素を使い回すため、条件に合わない店では必ず隠し直す
  const link = $('.shop-popup-link');
  if (link) {
    const valid = isHttpUrl(shop.url);
    if (valid) link.href = shop.url;
    link.hidden = !valid;
  }

  // 紹介文が空の店は区画ごと隠す(前に開いた店の文が残らないよう必ず空にする)
  const comment = $('.shop-popup-comment');
  if (comment) {
    const text = (shop.comment ?? '').trim();
    setText(comment, text);
    comment.hidden = !text;
  }

  // 取り扱いの一覧。スロットが無いテーマ(商品を出さないサイト)では何もしない
  const list = $('.shop-popup-items');
  if (!list) return;
  const items = state.store.items.filter((item) => item.shopId === shopId);
  list.textContent = '';
  if (items.length === 0) {
    list.appendChild(el('p', 'loading-message', t('item.empty')));
    return;
  }
  for (const item of items) {
    // 店の紹介から商品の詳細へ移る。閉じてから開くのは popup.js が受け持つ
    list.appendChild(buildItemThumb(item, openItemFromShop));
  }
}

// 商品カードの店ロゴからも呼ばれるため、popup.js の名前('shop')経由で開く
function openShopPopupById(shopId) {
  // 未登録の店舗IDが混じっても開かない(データ側の取りこぼしを画面に出さない)
  if (!state.store.shops.has(shopId)) return;
  openPopup('shop', shopId);
}

// ---------------------------------------------------------------- 初期化

export function initShops(store) {
  state.store = store;

  registerPopup('shop', {
    overlay: document.querySelector('.shop-popup-overlay'),
    closeButton: document.querySelector('.shop-popup-close-button'),
    update: updateShopPopup,
  });

  renderShopGrids();
}
