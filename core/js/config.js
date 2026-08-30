// サイト設定と表示文言の辞書
//
// イベント固有のことは何もここに書かない。開催日・商品カテゴリ・対価の単位・画面文言は
// すべて marche.config.json と i18n/<locale>.json から読む。
// コードに直接書いてある年・日付・カテゴリ名・通貨があれば、それは移植の漏れ。

import { fetchJson, isHttpUrl } from './util.js';

// ---------------------------------------------------------------- 設置に関する定数
// いずれもページ相対。サイトのトップページ(公開ディレクトリ直下)から見た位置。
// 絶対パスにしないのは、ルート公開・サブフォルダ公開のどちらでも解決できるようにするため

// サイト設定。エディタが読むものと同じファイル(決定7)
const CONFIG_URL = 'marche.config.json';

// 表示文言の辞書の置き場(末尾スラッシュ必須)。<locale>.json を読む
const I18N_URL = 'i18n/';

// 出店者ロスター(エディタと共通)
export const ROSTER_URL = 'data/shops.json';

// 店舗データ・画像の取得先(末尾スラッシュ必須)
export const SHOP_DATA_URL = 'data/shop-data/';

// フォーム項目定義の置き場(末尾スラッシュ必須)。<種別>.json を読む。
// サーバー側(core/php/send.php)が読むのと同じファイル
export const FORM_URL = 'forms/';

// 画像が未設定のとき、または読み込みに失敗したときに出す代替画像。
// 枠を空にせず代替を出すのは、画像の有無でカードの高さが変わらないようにするため。
// **この2ファイルはテーマ側(またはサイト側)が用意する。**
export const FALLBACK_IMAGES = {
  shop: 'images/noimage/shop.svg', // 店舗ロゴ用(正方形)
  item: 'images/noimage/item.svg', // 商品画像用(4:3)
};

// ----------------------------------------------------------------

const state = {
  config: {},
  dict: {},
};

// 設定と辞書を読む。どちらかが読めなければ例外を投げる(呼び出し側で表示を切り替える)
export async function loadConfig() {
  state.config = await fetchJson(CONFIG_URL);
  state.dict = await fetchJson(`${I18N_URL}${localeTag()}.json`);
  return state.config;
}

// 辞書の言語。設定の locale がBCP47の形でなければ ja に落とす
// (辞書ファイル名に使うため、パス区切りなどが混じらないようにする)
function localeTag() {
  const locale = state.config.locale ?? '';
  return /^[a-z]{2}(-[A-Za-z0-9]+)?$/.test(locale) ? locale : 'ja';
}

// 表示文言を辞書から引く(決定4)。'item.soldOut' のようなドット区切り。
// {name} などのプレースホルダを vars で置き換える。
// 見つからないキーはキー名をそのまま返す(記入漏れが画面で分かるように)
export function t(key, vars = {}) {
  let value = state.dict;
  for (const part of key.split('.')) {
    if (value === null || typeof value !== 'object' || !(part in value)) return key;
    value = value[part];
  }
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

// ---------------------------------------------------------------- 設定の読み出し

export const config = () => state.config;

// 開催日。1件のときは販売日のUIを出さない(決定2)
export const days = () => state.config.days ?? [];
export const usesSaleDays = () => days().length > 1;

// 商品カテゴリ。未定義なら商品一覧のフィルタを出さない(決定8)
export const itemCategories = () => state.config.itemCategories ?? [];

// 設定の値をドット区切りのパスで引く(決定14)。
// テーマが data-marche-text="site.name" と書いた箇所に流し込むためのもの。
//
// 途中が配列のときは、その先のキーを各要素から取って listSeparator で連結する。
// 会期のように「日付が2つある」ものを1つの文字列にするため。
//
//     site.name       → "みどり野マルシェ"
//     event.venue     → "みどり野中央公園"
//     days.label      → "10月3日(土)・10月4日(日)"
//     days.0.label    → "10月3日(土)"
//
// 見つからないときは null を返す(呼び出し側が要素を隠す)。
export function configValue(path) {
  const keys = String(path ?? '').split('.').filter(Boolean);
  if (keys.length === 0) return null;

  let value = state.config;
  for (let i = 0; i < keys.length; i++) {
    if (value == null || typeof value !== 'object') return null;
    const key = keys[i];
    // 配列に非数値のキーが来たら、残りのパスを各要素に当てて連結する
    if (Array.isArray(value) && !/^\d+$/.test(key)) {
      const parts = value
        .map((item) => scalarAt(item, keys.slice(i)))
        .filter((v) => v !== null);
      return parts.length > 0 ? parts.join(t('common.listSeparator')) : null;
    }
    value = Array.isArray(value) ? value[Number(key)] : value[key];
  }
  return scalar(value);
}

// 末端の値だけを文字列にする。オブジェクト・配列・未設定・空文字は null(＝出さない)
function scalar(value) {
  if (value == null || value === '' || typeof value === 'object') return null;
  return String(value);
}

// 配列の要素に残りのパスを当てて、末端の値を取る
function scalarAt(target, keys) {
  let value = target;
  for (const key of keys) {
    if (value == null || typeof value !== 'object') return null;
    value = Array.isArray(value) ? value[Number(key)] : value[key];
  }
  return scalar(value);
}

// お知らせ。source が空ならセクション自体を出さない
export const announcements = () => state.config.announcements ?? {};

// 問い合わせフォームの設定。すべて省略可。
//   endpoint  送信先。空文字にするとモックモード(送らずに内容を画面へ出す)
//   honeypot  おとり欄の name。ボットが埋めたら送信しない
//   retries   送信失敗時の再試行回数
//   successUrl 送信後の遷移先。空なら同じページで完了表示に差し替える
export function formSettings() {
  const forms = state.config.forms ?? {};
  return {
    endpoint: forms.endpoint ?? 'data/send.php',
    honeypot: forms.honeypot || 'website',
    retries: Number.isInteger(forms.retries) ? forms.retries : 1,
    successUrl: forms.successUrl ?? '',
  };
}

// ---------------------------------------------------------------- イベント公式のSNS

// プラットフォームの既定の表記(決定12)。ここに無いIDも設定に書ける。
// 表記は固有名詞なので辞書(i18n)には置かない。言語が変わっても Instagram は Instagram
const SOCIAL_LABELS = new Map([
  ['x', 'X'],
  ['instagram', 'Instagram'],
  ['youtube', 'YouTube'],
  ['facebook', 'Facebook'],
  ['tiktok', 'TikTok'],
  ['threads', 'Threads'],
  ['line', 'LINE'],
  ['note', 'note'],
  ['bluesky', 'Bluesky'],
  ['mastodon', 'Mastodon'],
]);

// プラットフォームIDに使える文字。クラス名(social-link--<id>)に入るため、
// 商品カテゴリと同じく小文字・数字・ハイフンに限る
const SOCIAL_PLATFORM = /^[a-z0-9][a-z0-9-]*$/;

// イベント公式SNSのリンク。設定に書かれた順のまま返す(決定12)。
// 形の合わない1件は黙って落とす。書き間違いで他のリンクまで消えないようにするため
export function socialLinks() {
  const list = state.config.site?.social;
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry !== null && typeof entry === 'object')
    .map((entry) => {
      const platform = String(entry.platform ?? '').trim();
      const label = String(entry.label ?? '').trim();
      return {
        platform,
        url: String(entry.url ?? '').trim(),
        // 既定の表記を持たないIDは platform をそのまま出す(記入漏れが画面で分かるように)
        label: label || SOCIAL_LABELS.get(platform) || platform,
      };
    })
    // javascript: などはリンクにしない(店舗のURLと同じ規則)
    .filter((link) => SOCIAL_PLATFORM.test(link.platform) && isHttpUrl(link.url));
}

const pricing = () => state.config.pricing ?? {};

// ---------------------------------------------------------------- 対価の表示

// 対価を数値・単位・単位の位置に分けて返す(決定5)。
// 文字列に組み立てないのは、テーマが単位だけ小さく見せられるようにするため。
// price は「対価を表す数値」で、金額とは限らない(チケット運用では枚数)
export function priceParts(price) {
  const p = pricing();
  const isTicket = p.mode === 'ticket';
  const unitConfig = (isTicket ? p.ticket : p.currency) ?? {};
  const unit = unitConfig.unit ?? '';
  // チケットは枚数なので前置きの余地がない。金額のときだけ設定に従う
  const position = isTicket ? 'suffix' : (p.currency?.position ?? 'suffix');

  const number = Number(price);
  // 対価が未設定の商品はそもそも一覧に出ない(data.js の isListed)。
  // 万一データが欠けても表示を壊さないための保険として ? を返す
  if (!(number > 0)) return { value: t('pricing.unset'), unit, position };

  // チケットは枚数なので常に整数(決定5)。小数桁は金額のときだけ効く
  const decimals = isTicket ? 0 : (p.currency?.decimals ?? 0);
  const grouping = isTicket ? true : (p.currency?.grouping ?? true);
  const value = number.toLocaleString(localeTag(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: grouping,
  });
  return { value, unit, position };
}

// 対価の但し書き(「税込」など)。設定に文言が無ければ空文字を返し、
// 呼び出し側は要素ごと出力しない(チケット運用に税の概念がないため)
export const priceNote = () => (pricing().note ?? '').trim();

// チケット1枚の額面の案内。出す設定でなければ空文字
export function faceValueNote() {
  const p = pricing();
  if (p.mode !== 'ticket' || !p.ticket?.showFaceValue) return '';
  const value = Number(p.ticket.faceValue);
  if (!(value > 0)) return '';
  const unit = state.config.pricing?.currency?.unit ?? '';
  return t('pricing.faceValue', { value: `${value.toLocaleString(localeTag())}${unit}` });
}

// ---------------------------------------------------------------- 販売日

// 商品の販売日の表記。全日のときは null を返し、呼び出し側は要素ごと出力しない。
// 開催が1日だけのイベントでは常に null(決定2)
export function saleDayLabel(item) {
  if (!usesSaleDays()) return null;
  const all = days();
  const selected = Array.isArray(item.saleDays)
    ? all.filter((day) => item.saleDays.includes(day.id))
    : [];
  // 未指定と全日選択は同じ意味(決定9)。どちらも日程の表記を出さない
  if (selected.length === 0 || selected.length === all.length) return null;
  return selected
    .map((day) => day.shortLabel || day.label)
    .join(t('common.listSeparator'));
}

// ---------------------------------------------------------------- 日付

// 日付の表記。設定の timezone を基準にする(省略時はブラウザの既定)。
// "YYYY-MM-DD" とISO日時のどちらも受け取り、読めない値は空文字を返す
export function formatDate(value) {
  const date = new Date(value);
  if (isNaN(date)) return '';
  const options = {};
  if (state.config.timezone) options.timeZone = state.config.timezone;
  return date.toLocaleDateString(localeTag(), options);
}
