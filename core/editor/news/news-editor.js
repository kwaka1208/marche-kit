// お知らせ 編集ページ
//
// サイトが表示しているお知らせJSONを取得して編集し、put-json.php へ送信する。
// 送信内容はそのままサイトのお知らせ表示になる(即時反映)。
// 方式は出店者エディタ(../editor.js)に合わせている。
//
// お知らせの本文だけはHTML文字列を許します。運営しか書けないためです(決定6)。

// 親ディレクトリの参照。一部のレンタルサーバーのWAFは、ドット2つ+スラッシュが
// 2つ続く並びをディレクトリトラバーサルとみなし、このJS自体の配信を403にします。
// そのためリテラルでは書かず、PARENT を連結して組み立てます
// (生成結果=実行時のfetch先は普通に書いた場合と同じです。
//  コメント中にも該当の並びを書かないこと)。
const PARENT = '..';

// このページ(<サイト>/editor/news/)から見たサイトルート
const SITE_ROOT = `${PARENT}/${PARENT}/`;

// PHPの置き場。put-json.php はこのフォルダ配下にJSONを書き込む
const DATA_DIR = `${SITE_ROOT}data`;

// 受信PHPのURL。空文字にするとモックモードになり、送信内容を画面に出すだけで実際には送らない
const UPLOAD_URL = `${DATA_DIR}/put-json.php`;

// サイト設定と表示文言の辞書
const CONFIG_URL = `${SITE_ROOT}marche.config.json`;
const I18N_URL = `${SITE_ROOT}i18n/`;

// お知らせJSONの既定の置き場。marche.config.json の announcements.source が優先される
const DEFAULT_SOURCE = 'data/news.json';

// 管理者用の合言葉。このページのアクセスキー(?<この値>)と、put-json.php への
// 書き込み認証(apiKey)を兼ねる。リポジトリにはプレースホルダのまま置き、
// 配置時に tools/inject-env.py が .env の MARCHE_ADMIN_KEY で置換する。
//
// 注意: このファイルはブラウザに配信されるため、/editor/ をBasic認証などで
// 保護しない限り合言葉は閲覧者に見える。put-json.php のサーバー認証は
// その範囲でしか効かない。
const ADMIN_KEY = '__ADMIN_KEY__';

// 更新通知のWebhook(出店者エディタと同じ経路)。保存が成功したときだけ投稿する
const WEBHOOK_URL = '__WEBHOOK_URL__';

const state = {
  config: {},
  dict: {},
  // お知らせJSONの内容(読み込んだまま。編集はフォーム上で行い送信時に組み立てる)
  items: [],
  // 書き込み先。put-json.php から見た相対パスに分解して持つ
  fileName: 'news.json',
  targetDir: '.',
};

const $ = (id) => document.getElementById(id);

// 表示文言を辞書から引く(../editor.js と同じ規則)
function t(key, vars = {}) {
  let value = state.dict;
  for (const part of key.split('.')) {
    if (value === null || typeof value !== 'object' || !(part in value)) return key;
    value = value[part];
  }
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

function applyStaticText(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
}

async function loadJson(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} (${res.status})`);
  return res.json();
}

// 日付を設定のタイムゾーン基準の YYYY-MM-DD に整える。お知らせの date は
// "YYYY-MM-DD" とISO日時("2026-10-02T15:00:00.000Z" 等)の両方がありうるため、
// <input type="date"> 用に揃える。
//
// 命名上の注意: 一部のレンタルサーバーのWAFはコード実行系の予約語を
// 大小無視の部分一致で検出し、その並びを含むファイルの配信を403にします。
// 識別子にその並びを作らないこと(以前 …Date + Value の名前が該当しました)。
function toDateInput(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('sv-SE', tzOptions());
}

const tzOptions = () => (state.config.timezone ? { timeZone: state.config.timezone } : {});

// 今日の日付。追加するお知らせの初期値に使う
const today = () => new Date().toLocaleDateString('sv-SE', tzOptions());

async function loadData() {
  state.config = await loadJson(CONFIG_URL, CONFIG_URL);

  const locale = /^[a-z]{2}(-[A-Za-z0-9]+)?$/.test(state.config.locale ?? '')
    ? state.config.locale
    : 'ja';
  state.dict = await loadJson(`${I18N_URL}${locale}.json`, `${I18N_URL}${locale}.json`);

  // 設定のパスは公開ディレクトリからの相対。put-json.php は data/ にあるので、
  // 書き込み先はそこからの相対パスに分解して渡す
  const source = (state.config.announcements?.source || DEFAULT_SOURCE).replace(/^\/+/, '');
  const rel = source.replace(/^data\//, '');
  state.fileName = rel.split('/').pop();
  state.targetDir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '.';

  const items = await loadJson(`${SITE_ROOT}${source}?ts=${Date.now()}`, source);
  if (!Array.isArray(items)) throw new Error(`${source}`);
  state.items = items;
}

function renderItems() {
  const list = $('news-list');
  list.textContent = '';
  if (state.items.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = t('editor.news.none');
    list.appendChild(p);
    return;
  }
  // サイト表示と同じく日付の新しい順に並べる。index は state.items 上の位置を保持する
  // (送信時に元データを参照するため)。日付が読めないものは末尾に回す
  const time = (item) => {
    const ms = new Date(item.date).getTime();
    return Number.isNaN(ms) ? -Infinity : ms;
  };
  [...state.items.entries()]
    .sort(([, a], [, b]) => time(b) - time(a))
    .forEach(([index, item]) => list.appendChild(buildNewsCard(item, index)));
}

// お知らせ1件分の入力欄。既存(index>=0)は元データを保持し、送信時にフォーム値で上書きする。
// 追加分は破線+薄い背景色(editor-item--new)で見分けられるようにする
function buildNewsCard(item, index) {
  const wrap = document.createElement('div');
  wrap.className = index >= 0 ? 'editor-item' : 'editor-item editor-item--new';
  if (index >= 0) wrap.dataset.index = String(index);
  else wrap.dataset.new = 'true';

  const heading = document.createElement('h3');
  heading.textContent = index >= 0
    ? (item.title || t('editor.news.noTitle'))
    : t('editor.news.newItem');
  heading.appendChild(buildDeleteToggle(wrap, index >= 0));
  wrap.appendChild(heading);

  wrap.appendChild(buildField(t('editor.news.date'), 'date', 'date',
    index >= 0 ? toDateInput(item.date) : today(),
    { hint: t('editor.news.dateHint') }));
  wrap.appendChild(buildField(t('editor.news.title'), 'text', 'title', item.title ?? ''));
  wrap.appendChild(buildField(t('editor.news.body'), 'textarea', 'body', item.body ?? '', {
    rows: 5,
    hint: t('editor.news.bodyHint'),
  }));

  return wrap;
}

// 削除マーク用トグル。DOMからは消さず、送信時に配列から除外する。
// 追加分は「この追加を取り消す」でその場で消す(出店者エディタと同じ流儀)
function buildDeleteToggle(wrap, isExisting) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'remove-item-button';

  if (!isExisting) {
    button.textContent = t('editor.cancelAdd');
    button.addEventListener('click', () => wrap.remove());
    return button;
  }

  button.textContent = t('editor.news.delete');
  button.addEventListener('click', () => {
    const deleted = wrap.dataset.deleted !== 'true';
    wrap.dataset.deleted = deleted ? 'true' : 'false';
    wrap.classList.toggle('deleted', deleted);
    button.textContent = deleted ? t('editor.undoDelete') : t('editor.news.delete');
    for (const el of wrap.querySelectorAll('textarea, input')) {
      el.disabled = deleted;
    }
  });
  return button;
}

function buildField(labelText, kind, name, value, opts = {}) {
  const field = document.createElement('div');
  field.className = 'field';

  const label = document.createElement('label');
  label.textContent = labelText;
  field.appendChild(label);

  let input;
  if (kind === 'textarea') {
    input = document.createElement('textarea');
    input.rows = opts.rows ?? 3;
  } else {
    input = document.createElement('input');
    input.type = kind;
  }
  input.value = value;
  input.dataset.field = name;
  field.appendChild(input);

  if (opts.hint) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = opts.hint;
    field.appendChild(hint);
  }
  return field;
}

// 送信データを組み立てる。既存(削除マークを除く)+追加分を、画面の並び順で配列にする。
// 既存の date/title/body 以外のフィールドがあれば元の値を保持する
function buildPayload() {
  const items = [];
  for (const wrap of document.querySelectorAll('#news-list .editor-item')) {
    if (wrap.dataset.deleted === 'true') continue;
    const get = (name) => wrap.querySelector(`[data-field="${name}"]`).value;
    const original = wrap.dataset.new === 'true' ? {} : state.items[Number(wrap.dataset.index)];
    items.push({
      ...original,
      date: get('date'),
      title: get('title').trim(),
      body: get('body').trim(),
    });
  }
  return { apiKey: ADMIN_KEY, items };
}

function showResult(ok, message) {
  const el = $('send-result');
  el.textContent = message;
  el.className = ok ? 'success' : 'error';
  el.hidden = false;
}

// モックモード: ペイロードを画面に出す(合言葉は伏せる)
function showMockPayload(payload) {
  const { apiKey, ...display } = payload;
  $('payload-view').textContent = JSON.stringify(display, null, 2);
  $('payload-section').hidden = false;
  $('payload-section').scrollIntoView({ behavior: 'smooth' });
}

// put-json.php の受信形式に合わせる。
// 応答はJSONではなくテキストのため、HTTPステータスで成否を判定する
async function submitPayload(payload) {
  const form = new FormData();
  form.append('apiKey', payload.apiKey);
  form.append('fileName', state.fileName);
  form.append('targetDir', state.targetDir);
  form.append('fileContent', JSON.stringify(payload.items, null, 1) + '\n');

  const res = await fetch(UPLOAD_URL, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
}

// 更新通知のWebhookへ投稿する。URLが未設定・プレースホルダのままなら何もしない
async function notifyWebhook(text) {
  if (!/^https?:\/\//.test(WEBHOOK_URL)) return;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Discordのcontentは2000文字上限。余裕を見て切り詰める
        body: JSON.stringify({ content: text.slice(0, 1900) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
}

function timestamp() {
  const options = { hour12: false, ...tzOptions() };
  return new Date().toLocaleString('sv-SE', options);
}

function webhookMessage(payload) {
  const latest = [...payload.items]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 3)
    .map((item) => `・${item.date} ${item.title}`);
  return [
    t('notify.newsUpdatedTitle'),
    `🕒 ${timestamp()}`,
    `${t('notify.labelCount')}: ${t('notify.countUnit', { n: payload.items.length })}`,
    ...latest,
    `${t('notify.labelSavedTo')}: ${state.targetDir === '.' ? '' : state.targetDir + '/'}${state.fileName}`,
  ].join('\n');
}

function init() {
  // 追加ボタンは一覧より上にあるため、追加行も一覧の先頭に入れる
  $('add-item-button').addEventListener('click', () => {
    const card = buildNewsCard({ title: '', body: '' }, -1);
    $('news-list').prepend(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  $('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = $('submit-button');
    button.disabled = true;
    button.textContent = t('editor.submitting');
    $('send-result').hidden = true;
    try {
      const payload = buildPayload();
      if (!UPLOAD_URL) {
        showMockPayload(payload);
        return;
      }
      // まずサーバー保存し、成功したときだけ通知する(出店者エディタと同じ)
      await submitPayload(payload);
      try {
        await notifyWebhook(webhookMessage(payload));
      } catch (webhookErr) {
        console.error('更新通知に失敗しました:', webhookErr);
      }
      // 保存済みの内容を手元にも反映して、続けて編集できるようにする
      state.items = payload.items;
      renderItems();
      showResult(true, t('editor.news.sent'));
    } catch (err) {
      showResult(false, t('editor.sendFailed', { message: err.message }));
    } finally {
      button.disabled = false;
      button.textContent = t('editor.submit');
    }
  });

  if (!UPLOAD_URL) $('mock-notice').hidden = false;
}

// アクセス制御: URLに正しい合言葉が付いていなければサイトのトップへ戻す。
// 合言葉が未注入(プレースホルダのまま)なら、誰も入れない状態にしておく
const keyReady = ADMIN_KEY !== '' && !/^__[A-Z_]+__$/.test(ADMIN_KEY);
if (keyReady && new URLSearchParams(window.location.search).has(ADMIN_KEY)) {
  loadData()
    .then(() => {
      applyStaticText();
      init();
      renderItems();
      $('edit-form').hidden = false;
    })
    .catch((err) => {
      alert(t('editor.loadFailed', { message: err.message }));
    });
} else {
  window.location.replace(SITE_ROOT);
}
