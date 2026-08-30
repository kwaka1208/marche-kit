// 出店者データの読み込みと組み立て
//
// 出店者ロスター(data/shops.json)を起点に、店舗ごとの data.json を並列で取得し、
// 描画に使う形に整える。取得に失敗した店舗は飛ばして他店舗の表示を続ける
// (1店のサーバー保存が壊れても、サイト全体が真っ白にならないようにするため)。

import { ROSTER_URL, SHOP_DATA_URL } from './config.js';
import { fetchJson } from './util.js';

// ---------------------------------------------------------------- サーバーと揃える定数
// core/php/config.php・core/editor/editor.js にも同じ値がある。
// **3箇所を同時に直すこと。** 片方だけ変えると、保存されたデータが表示されなくなる。

export const ITEM_STATUSES = ['onsale', 'soldout', 'ended'];
export const DEFAULT_ITEM_STATUS = 'onsale';

// ----------------------------------------------------------------

// 完売御礼の商品か。一覧からは消さず、完売の帯だけを足す
// (「取り扱いはあるが売り切れた」ことを来場者が知る必要があるため)
export const isSoldOut = (item) => item.status === 'soldout';

// サイトに掲載する商品か。販売終了と対価未設定は、一覧にもポップアップにも出さない
export const isListed = (item) =>
  item.status !== 'ended' && Number(item.price) > 0;

// カード本体の見た目のバリエーション(決定1)。未指定と未知の値は standard に寄せる
const VARIANTS = ['standard', 'compact', 'feature'];
const normalizeVariant = (value) => (VARIANTS.includes(value) ? value : 'standard');

// 店舗フォルダ内のファイルのURL。updatedAt をクエリに付けて、
// 画像を差し替えたあとにブラウザキャッシュの古い画像が残らないようにする
const fileUrl = (shopId, name, updatedAt) =>
  `${SHOP_DATA_URL}${shopId}/${name}?v=${encodeURIComponent(updatedAt ?? '')}`;

// ロスターと全店舗のデータを読む。
// 返すもの:
//   categories … [{ id, label, variant, shops: [店舗] }] ロスターの並び順のまま
//   shops      … Map(店舗ID => 店舗) ポップアップの引き当て用
//   items      … 掲載対象の商品の配列(店舗の名前とロゴを解決済み)
// ロスター自体が読めないときは例外を投げる(サイト側でエラー表示に切り替える)
export async function loadShopData() {
  const roster = await fetchJson(ROSTER_URL);
  const rosterCategories = Array.isArray(roster.categories) ? roster.categories : [];

  // 同じ店舗IDが複数のカテゴリに現れても取得は1回で済ませる
  // (重複していないことは tools/validate.py が確かめる)
  const ids = [...new Set(rosterCategories.flatMap((category) => category.shops ?? []))];

  // cache: 'no-cache' でサーバーに更新確認させる(未更新なら304で済み、鮮度と速度を両立)
  const results = await Promise.allSettled(
    ids.map((id) => fetchJson(`${SHOP_DATA_URL}${id}/data.json`, { cache: 'no-cache' }))
  );

  const loaded = new Map();
  ids.forEach((id, i) => {
    const result = results[i];
    if (result.status === 'rejected') {
      console.error(`店舗データの取得に失敗: ${id}`, result.reason);
      return;
    }
    loaded.set(id, result.value);
  });

  const shops = new Map();
  const items = [];
  const categories = rosterCategories.map((category) => {
    const variant = normalizeVariant(category.variant);
    const categoryShops = [];

    for (const id of category.shops ?? []) {
      const data = loaded.get(id);
      // データ未登録(取得失敗を含む)の店はカードを出さない。
      // ロスターに名前だけあって中身が無い状態を、空のカードとして見せないため
      if (!data) continue;
      // 同じ店が2つのカテゴリに載っていた場合は、先に現れたほうだけを出す
      if (shops.has(id)) continue;

      const shop = {
        id,
        categoryId: category.id ?? '',
        variant,
        name: data.name ?? '',
        url: data.url ?? '',
        comment: data.comment ?? '',
        logo: data.logo ? fileUrl(id, data.logo, data.updatedAt) : '',
      };
      shops.set(id, shop);
      categoryShops.push(shop);

      for (const item of data.items ?? []) {
        // 掲載対象外(販売終了・対価未設定)はここで落とす。
        // 一覧・フィルタ・ポップアップのどこにも出さない
        if (!isListed(item)) continue;
        items.push({
          ...item,
          status: ITEM_STATUSES.includes(item.status) ? item.status : DEFAULT_ITEM_STATUS,
          shopId: id,
          shopName: shop.name,
          shopLogo: shop.logo,
          image: item.image ? fileUrl(id, item.image, data.updatedAt) : '',
        });
      }
    }

    return {
      id: category.id ?? '',
      label: category.label ?? '',
      variant,
      shops: categoryShops,
    };
  });

  return { categories, shops, items };
}
