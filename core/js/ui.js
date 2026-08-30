// ページ共通の操作
//
// ナビゲーションの開閉・ページ内リンクの移動・現在位置の反映・FAQの開閉。
// データを描かない部分だけをここに集めている。
//
// ここで付け外しするのは状態を表すクラスだけで、見え方はテーマのCSSが決める。
// 高さや色をJSから直接いじらないのは、アニメーションの作りをテーマに委ねるため。

// スクロール位置の判定を間引く間隔(ミリ秒)
const SCROLL_DEBOUNCE = 100;

// ページ内リンクで移動したとき、見出しの上に残す余白(ピクセル)
const SCROLL_OFFSET = 20;

// 上端からこれだけ動いたらナビゲーションに scrolled を付ける(ピクセル)
const SCROLLED_THRESHOLD = 10;

// 上端からこれだけの範囲にあるナビを「上に貼り付いている」とみなす(ピクセル)
const NAV_TOP_TOLERANCE = 1;

// 位置を固定しているナビゲーションの高さ。移動先の計算で差し引く
// (固定していないテーマでは差し引かない)。
// **画面の上端に貼り付いているときだけ差し引く。** 下や横に固定したナビは
// 移動先の見出しを隠さないため、差し引くとかえって行き過ぎる
function fixedNavHeight(nav) {
  if (!nav || getComputedStyle(nav).position !== 'fixed') return 0;
  return nav.getBoundingClientRect().top <= NAV_TOP_TOLERANCE ? nav.offsetHeight : 0;
}

// ナビゲーションの開閉(スマートフォンでのメニュー)
function setupNavigationToggle(nav, list, toggleButton) {
  if (!toggleButton || !list) return;
  toggleButton.addEventListener('click', () => {
    const isOpen = list.classList.toggle('open');
    toggleButton.classList.toggle('active', isOpen);
    // 開いている間は背後の本文を動かさない
    document.body.classList.toggle('no-scroll', isOpen);
    nav?.classList.toggle('menu-open', isOpen);
  });
}

// リンクが指すページ内の区画。#の後ろをIDとして引く。
// セレクタとして解釈しないのは、href="#" のような値で例外にしないため
function linkTarget(link) {
  const id = (link.getAttribute('href') ?? '').slice(1);
  return id ? document.getElementById(id) : null;
}

// ページ内リンク。固定ナビの分だけ手前で止め、見出しが隠れないようにする
function setupInPageLinks(nav, list, toggleButton) {
  const links = [...document.querySelectorAll('a[href^="#"]')].filter(linkTarget);
  for (const link of links) {
    link.addEventListener('click', (e) => {
      const target = linkTarget(link);
      if (!target) return;
      e.preventDefault();
      window.scrollTo({
        top: target.offsetTop - fixedNavHeight(nav) - SCROLL_OFFSET,
        behavior: 'smooth',
      });
      // メニューを開いたまま移動すると移動先が見えないので閉じる
      if (list?.classList.contains('open')) toggleButton?.click();
    });
  }
  return links;
}

// いま画面に出ている区画のリンクに active を付ける。
// 対象はナビゲーションが指している区画だけ(ページ内の全IDを見に行かない)
function setupCurrentSection(nav, links) {
  const sections = links
    .map(linkTarget)
    .filter((section) => section !== null)
    .sort((a, b) => a.offsetTop - b.offsetTop);

  let timer = null;
  const update = () => {
    let currentId = '';
    const offset = fixedNavHeight(nav) + 50;
    for (const section of sections) {
      if (window.scrollY >= section.offsetTop - offset) currentId = section.id;
    }
    for (const link of links) {
      const target = link.closest('.navigation-item') || link;
      target.classList.toggle('active', link.getAttribute('href') === `#${currentId}`);
    }
  };
  window.addEventListener('scroll', () => {
    clearTimeout(timer);
    timer = setTimeout(update, SCROLL_DEBOUNCE);
  }, { passive: true });
  update();
}

// FAQの開閉。開いている項目に active が付く。
// 高さの制御はテーマのCSSに任せる(コアは状態を切り替えるだけ)
function setupFaq(faqList) {
  faqList?.addEventListener('click', (e) => {
    const question = e.target.closest('.faq-question');
    if (!question) return;
    const item = question.closest('.faq-item');
    const wasActive = item.classList.contains('active');
    // 一度にひとつだけ開く
    for (const opened of faqList.querySelectorAll('.faq-item.active')) {
      opened.classList.remove('active');
    }
    item.classList.toggle('active', !wasActive);
  });
}

export function initUi() {
  const nav = document.querySelector('.top-navigation');
  const list = document.querySelector('.navigation-list');
  const toggleButton = document.querySelector('.menu-toggle-button');

  setupNavigationToggle(nav, list, toggleButton);
  const links = setupInPageLinks(nav, list, toggleButton);
  setupCurrentSection(nav, links);
  setupFaq(document.querySelector('.faq-list'));

  window.addEventListener('scroll', () => {
    nav?.classList.toggle('scrolled', window.scrollY > SCROLLED_THRESHOLD);
  }, { passive: true });
}
