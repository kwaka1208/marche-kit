// イベント公式のSNSリンク
//
// テーマが置いたスロット [data-marche-social] に、marche.config.json の site.social を並べる。
// 出店者のSNSではなく、イベント運営のアカウント。
//
// **アイコンはここで作らない。** コアが出すのはリンク・クラス名・表記だけで、
// 何の絵を出すかはテーマのCSSが決める(代替画像 images/noimage/ と同じ扱い)。

import { socialLinks } from './config.js';
import { announceRendered, el } from './util.js';

function buildSocialLink(link) {
  // カードと同じ二段構え。テーマは social-link--<platform> に当て、
  // data-platform はイベント側での微調整に使う
  const anchor = el('a', `social-link social-link--${link.platform}`);
  anchor.dataset.platform = link.platform;
  anchor.href = link.url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  // アイコン表示のテーマでも名前が残るように、表記は属性と要素の両方に置く。
  // 要素を display: none で消すと読み上げからも消えるため、テーマ仕様で隠し方を示している
  anchor.title = link.label;
  anchor.appendChild(el('span', 'social-link-label', link.label));
  return anchor;
}

// スロットはページ内にいくつあってもよい(ヘッダーとフッターの両方など)
export function initSocial() {
  const containers = document.querySelectorAll('[data-marche-social]');
  if (containers.length === 0) return;

  const links = socialLinks();
  for (const container of containers) {
    container.textContent = '';
    // 1件も無いときはスロットごと隠す。空の枠や余白だけが残らないようにするため
    container.hidden = links.length === 0;
    const fragment = document.createDocumentFragment();
    for (const link of links) fragment.appendChild(buildSocialLink(link));
    container.appendChild(fragment);
  }
  announceRendered('social');
}
