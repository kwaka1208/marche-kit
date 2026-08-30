// ポップアップの開閉
//
// 商品用・店舗用のポップアップは中身が違うだけで、開閉の作法は同じ。
// 開閉だけをここに集め、中身の組み立ては items.js / shops.js が受け持つ。
//
// この置き場にはもう1つ役割がある。店舗ポップアップから商品ポップアップを開く
// (逆もある)ため、両者が互いを直接呼ぶと循環参照になる。名前で呼べるようにして
// items.js と shops.js が互いを知らずに済むようにしている。

// 店舗ポップアップから商品ポップアップへ移るときの待ち時間(ミリ秒)。
// 閉じる動きが終わってから次を開くための間で、テーマの transition より短いと重なって見える
const SWITCH_DELAY = 300;

// 名前 => { overlay, update }
const popups = new Map();

// ポップアップを1つ登録する。
//   name   … openPopup / closePopup で指す名前('item' / 'shop')
//   overlay … 表示中に active が付く要素。テーマが用意する器
//   closeButton … 閉じるボタン(無くてもよい)
//   update … 中身を差し替える関数。openPopup に渡した値がそのまま届く
// overlay が無いテーマでは登録せず、開く要求は黙って無視される
export function registerPopup(name, { overlay, closeButton, update }) {
  if (!overlay) return;
  popups.set(name, { overlay, update });

  closeButton?.addEventListener('click', () => closePopup(name));
  // 背景(オーバーレイそのもの)を押したときだけ閉じる。中身のクリックでは閉じない
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePopup(name);
  });
}

// 開いているポップアップが1つでもあれば本文のスクロールを止める。
// 背後のページが動くと、ポップアップを閉じたあとに読んでいた位置を見失うため
function syncScrollLock() {
  const anyActive = [...popups.values()].some((p) => p.overlay.classList.contains('active'));
  document.body.classList.toggle('no-scroll', anyActive);
}

export function openPopup(name, value) {
  const popup = popups.get(name);
  if (!popup) return;
  popup.update?.(value);
  popup.overlay.classList.add('active');
  syncScrollLock();
}

export function closePopup(name) {
  const popup = popups.get(name);
  if (!popup) return;
  popup.overlay.classList.remove('active');
  syncScrollLock();
}

export function closeAllPopups() {
  for (const name of popups.keys()) closePopup(name);
}

// 開いているポップアップを閉じてから別のポップアップを開く
export function switchPopup(fromName, toName, value) {
  closePopup(fromName);
  setTimeout(() => openPopup(toName, value), SWITCH_DELAY);
}

// Escapeキーでの閉じる。登録の有無にかかわらず1回だけ張る
export function initPopups() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllPopups();
  });
}
