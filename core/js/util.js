// 描画JS共通の小道具
//
// ここに置くのは「どの機能からも使うが、サイト設定にもデータの形にも依存しない」ものだけ。
// 設定を知っているものは config.js、データの形を知っているものは data.js に置く。

// 表示順を固定するかどうか。?fixed 付きのURLでは店舗・商品をシャッフルせず
// データ順のまま出す(表示の確認用)。付いていない通常のアクセスでは毎回シャッフルする
const isFixedOrder = new URLSearchParams(location.search).has('fixed');

// 並びをランダムに入れ替える(Fisher-Yates)。元の配列は変更しない
export function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 通常はシャッフル、?fixed のときはデータ順のまま。
// 出店者の表示順に有利不利を作らないため、掲載順は毎回入れ替える(concepts.md)
export const maybeShuffle = (array) => (isFixedOrder ? [...array] : shuffle(array));

// JSONの取得。失敗はすべて例外にして、呼び出し側で表示を切り替えられるようにする
// (取得失敗と0件は意味が違うため、ここで [] に丸めない)
export async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} (HTTP ${response.status})`);
  return response.json();
}

// 要素を1つ作る。className と text は省略可
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// 出店者が入力した文字列をテキストとして流し込む。
// HTMLとしては解釈せず、改行(\n)だけを <br> に変える。
// テーマのCSS(white-space)に頼らないのは、テーマが忘れても改行が保たれるようにするため
export function setText(el, text) {
  el.textContent = '';
  const lines = String(text ?? '').split('\n');
  lines.forEach((line, i) => {
    if (i > 0) el.appendChild(document.createElement('br'));
    el.appendChild(document.createTextNode(line));
  });
}

// 画像の差し込み。読み込みに失敗したら代替画像に差し替える。
// onerror を外してから差し替えるのは、代替画像自体が失敗したときの無限ループを防ぐため
export function setImage(img, url, fallbackUrl) {
  img.onerror = () => {
    img.onerror = null;
    img.src = fallbackUrl;
  };
  img.src = url || fallbackUrl;
}

// 改行を含む文字列を1行に畳む(alt属性など、改行を置けない場所で使う)
export const oneLine = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ').trim();

// リンクにしてよいURLか。http(s) で始まらない値(javascript: など)はリンクにしない
export const isHttpUrl = (url) => typeof url === 'string' && /^https?:\/\//.test(url);

// 描画が終わったことをテーマに知らせる。テーマ側の演出(スクロール連動など)は
// この合図を受けて、あとから足されたカードにも効果をかけ直せる
export function announceRendered(section) {
  document.dispatchEvent(new CustomEvent('marche:rendered', { detail: { section } }));
}
