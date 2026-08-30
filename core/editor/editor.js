// 出店者情報 編集ページ
//
// 出店者ロスター(../data/shops.json)を起点に、各店のデータ(shop-data/<店舗ID>/data.json)と
// 画像をサーバーから取得して編集し、shop-upload.php へ送信する。
// 送信内容はそのままサイト表示の本番データになる(即時反映。運営の確認は挟まない)。
//
// イベント固有のことは何も書かない。開催日・商品カテゴリ・対価の単位・画面文言は
// すべて ../marche.config.json と ../i18n/<locale>.json から読む。

// ---------------------------------------------------------------- 設置に関する定数

// PHP受信スクリプトのURL(ページ相対。このページは <サイト>/editor/ に置かれる)。
// 空文字にするとモックモードになり、送信内容を画面に出すだけで実際には送らない。
// 注意: 静的サーバーではPHPが動かないため実送信はできない(モックか実サーバーで確認する)
const UPLOAD_URL = '../data/shop-upload.php';

// 店舗データ・画像の取得先(末尾スラッシュ必須)
const DATA_URL = '../data/shop-data/';

// 出店者ロスター(サイト本体と共通)
const ROSTER_URL = '../data/shops.json';

// サイト設定。開催日・商品カテゴリ・対価の単位・辞書の言語をここから読む
const CONFIG_URL = '../marche.config.json';

// 表示文言の辞書の置き場(末尾スラッシュ必須)。<locale>.json を読む
const I18N_URL = '../i18n/';

// 更新通知のWebhook(サーバー保存とは別経路)。保存が成功したときだけ投稿する。
// リポジトリにはプレースホルダのまま置き、配置時に tools/inject-env.py が
// .env の MARCHE_WEBHOOK_URL で置換する。http(s) で始まらなければ送信しない。
const WEBHOOK_URL = '__WEBHOOK_URL__';

// 管理者用の合言葉。/editor/?<この値> のときだけ運営向けUI(店舗選択・未設定一覧・
// お知らせ編集へのリンク)を出す。**ソフトな切り替えでしかない** — この値を知らなくても
// 店舗IDの直接入力で編集はできる。リポジトリにはプレースホルダのまま置き、
// 配置時に tools/inject-env.py が .env の MARCHE_ADMIN_KEY で置換する。
const ADMIN_KEY = '__ADMIN_KEY__';

// ---------------------------------------------------------------- サーバーと揃える定数
// core/php/config.php にも同じ値がある。**片方だけ変えると保存が弾かれる。**

const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg', 'gif', 'avif'];
const ITEM_STATUSES = ['onsale', 'soldout', 'ended'];
const DEFAULT_ITEM_STATUS = 'onsale';

// ----------------------------------------------------------------

const state = {
  // 運営者向け表示(店舗選択・未設定一覧)を出すかどうか
  isAdmin: false,
  config: {},
  dict: {},
  // ロスターのカテゴリ定義。[{ id, label, shops: [店舗ID] }]
  categories: [],
  // 店舗ID => { categoryLabel, data: data.jsonの内容 | null(未登録) }
  shops: new Map(),
  current: null, // { id, data }
  // 選択された画像ファイル。キーは 'logo' または 'item:<商品ID|new-連番>'
  files: new Map(),
  // 追加商品の入力欄の仮キー採番用(店舗を切り替えるたびにリセット)。
  // 正式な商品ID(<店舗ID>-<連番>)は送信時に確定する
  newItemSeq: 0,
};

const $ = (id) => document.getElementById(id);

// 表示文言を辞書から引く(決定4)。'editor.itemName' のようなドット区切り。
// {name} などのプレースホルダを vars で置き換える。
// 見つからないキーはキー名をそのまま返す(記入漏れが画面で分かるように)
function t(key, vars = {}) {
  let value = state.dict;
  for (const part of key.split('.')) {
    if (value === null || typeof value !== 'object' || !(part in value)) return key;
    value = value[part];
  }
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

// HTMLの data-i18n / data-i18n-placeholder を辞書の文言で埋める
function applyStaticText(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
}

// 改行を含む文字列を1行に畳む(見出し・選択肢などの1行表示用)
const oneLine = (s) => (s ?? '').replace(/\s*\n\s*/g, ' ').trim();

// 画像URL。updatedAt をクエリに付けて差し替え時のキャッシュ残りを防ぐ
const imageUrl = (shopId, fileName, updatedAt) =>
  `${DATA_URL}${shopId}/${fileName}?v=${encodeURIComponent(updatedAt ?? '')}`;

// 選択ファイルの拡張子(小文字)。保存ファイル名 <対象>.<拡張子> の組み立てに使う
const fileExt = (file) => {
  const m = /\.([a-z0-9]+)$/i.exec(file.name);
  return m ? m[1].toLowerCase() : '';
};

// 開催日。1件のときは販売日のUIを出さない(決定2)
const days = () => state.config.days ?? [];
const usesSaleDays = () => days().length > 1;

// 商品カテゴリ。未定義なら商品カテゴリの欄を出さない
const itemCategories = () => state.config.itemCategories ?? [];

// 対価の入力欄のラベルと補足。単位と言い回しは pricing.mode で変わる(決定5)
function priceLabel() {
  const pricing = state.config.pricing ?? {};
  return pricing.mode === 'ticket'
    ? t('editor.priceLabelTicket', { unit: pricing.ticket?.unit ?? '' })
    : t('editor.priceLabelCurrency', { unit: pricing.currency?.unit ?? '' });
}

function priceHint() {
  return (state.config.pricing ?? {}).mode === 'ticket'
    ? t('editor.priceHintTicket')
    : t('editor.priceHintCurrency');
}

// ---------------------------------------------------------------- 読み込み

async function loadJson(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} (${res.status})`);
  return res.json();
}

async function loadData() {
  state.config = await loadJson(CONFIG_URL, CONFIG_URL);

  const locale = /^[a-z]{2}(-[A-Za-z0-9]+)?$/.test(state.config.locale ?? '')
    ? state.config.locale
    : 'ja';
  state.dict = await loadJson(`${I18N_URL}${locale}.json`, `${I18N_URL}${locale}.json`);

  const roster = await loadJson(ROSTER_URL, ROSTER_URL);
  state.categories = Array.isArray(roster.categories) ? roster.categories : [];

  // 店舗IDとカテゴリの対応を作る。同じIDが複数のカテゴリに出ないことは
  // tools/validate.py が確かめる(ここでは最初に見つけたカテゴリを採る)
  const entries = [];
  for (const category of state.categories) {
    for (const id of category.shops ?? []) {
      if (!state.shops.has(id)) {
        entries.push([id, category.label ?? category.id ?? '']);
      }
    }
  }

  // データ未登録(404)の店舗は空フォームから新規作成できるよう null で保持する
  const results = await Promise.allSettled(
    entries.map(([id]) => loadJson(`${DATA_URL}${id}/data.json?ts=${Date.now()}`, id))
  );
  entries.forEach(([id, categoryLabel], i) => {
    const result = results[i];
    if (result.status === 'rejected') console.warn(`${id} のデータ未取得:`, result.reason.message);
    state.shops.set(id, {
      categoryLabel,
      data: result.status === 'fulfilled' ? result.value : null,
    });
  });
}

const rosterIds = () => [...state.shops.keys()];

// ---------------------------------------------------------------- 運営向けの一覧

// 選択肢のラベル。同名・似た名前の店を運営が識別できるよう店舗IDを併記する
const shopLabel = (id) => {
  const data = state.shops.get(id)?.data;
  return `${data ? oneLine(data.name) : t('editor.unregistered')} [${id}]`;
};

function populateShopSelect() {
  const select = $('shop-select');
  select.textContent = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = t('editor.selectPlaceholder');
  select.appendChild(placeholder);

  // ロスターのカテゴリごとにグループ分けする。カテゴリの数と名前はイベントごとに違う
  for (const category of state.categories) {
    const ids = (category.shops ?? []).filter((id) => state.shops.has(id));
    if (ids.length === 0) continue;
    const group = document.createElement('optgroup');
    group.label = category.label ?? category.id ?? '';
    for (const id of ids) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = shopLabel(id);
      group.appendChild(option);
    }
    select.appendChild(group);
  }
}

// 対価が入っていない商品の判定。サイト表示側と同じ「0以下・数値でない」を未設定とみなす。
// 未設定の商品はサイトに出ない
const isPriceMissing = (item) => !(Number(item.price) > 0);

// 未設定・未知の値は販売中として扱う
const normalizeStatus = (value) =>
  ITEM_STATUSES.includes(value) ? value : DEFAULT_ITEM_STATUS;

// 販売終了になっていない商品か
const isSellable = (item) => normalizeStatus(item.status) !== 'ended';

// 商品が1件もない店舗の判定。data.json 未登録(null)も同じ扱いにする。
// 販売終了しか残っていない店舗も実質「商品なし」としてこちらに挙げる
const hasNoItem = (data) => !data || (data.items ?? []).filter(isSellable).length === 0;

// 一覧に並べる店舗名。押すとその店の編集フォームを開く
function createShopLink(id) {
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'admin-shop-link';
  link.textContent = shopLabel(id);
  link.addEventListener('click', () => {
    $('shop-select').value = id;
    showShop(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  return link;
}

// どちらの一覧も、トップ(店舗未選択)のときだけ出す
function setAdminListsVisible(visible) {
  const hidden = !(state.isAdmin && visible);
  $('price-missing-section').hidden = hidden;
  $('no-item-section').hidden = hidden;
}

function renderEmptyHint(container, key) {
  const p = document.createElement('p');
  p.className = 'hint';
  p.textContent = t(key);
  container.appendChild(p);
}

// 対価が未設定の商品を「店舗名 > 商品名」の入れ子リストで出す
function renderPriceMissing() {
  const container = $('price-missing-list');
  container.textContent = '';
  const list = document.createElement('ul');

  for (const id of rosterIds()) {
    const data = state.shops.get(id)?.data;
    if (hasNoItem(data)) continue; // 商品なしの店舗は「商品が登録されていない店舗」側に出す
    // 販売終了の商品はサイトに出ないので、対価が空でも困らない
    const missing = data.items.filter((item) => isSellable(item) && isPriceMissing(item));
    if (missing.length === 0) continue;

    const shopItem = document.createElement('li');
    shopItem.appendChild(createShopLink(id));

    const itemList = document.createElement('ul');
    for (const item of missing) {
      const li = document.createElement('li');
      li.textContent = oneLine(item.name) || t('editor.noItemName');
      itemList.appendChild(li);
    }
    shopItem.appendChild(itemList);
    list.appendChild(shopItem);
  }

  if (list.children.length === 0) {
    renderEmptyHint(container, 'editor.priceMissingNone');
    return;
  }
  container.appendChild(list);
}

// 商品が1件も登録されていない店舗の一覧(data.json 未登録の店舗も含む)
function renderNoItemShops() {
  const container = $('no-item-list');
  container.textContent = '';
  const list = document.createElement('ul');

  for (const id of rosterIds()) {
    if (!hasNoItem(state.shops.get(id)?.data)) continue;
    const li = document.createElement('li');
    li.appendChild(createShopLink(id));
    list.appendChild(li);
  }

  if (list.children.length === 0) {
    renderEmptyHint(container, 'editor.noItemNone');
    return;
  }
  container.appendChild(list);
}

// 編集中の店舗の「対価が未設定の商品」をフォーム先頭に出す。
// 保存済みデータではなく画面上の入力値から数え直すので、入力した時点で一覧から消える。
// 削除マーク済みと「サイトに表示しない(販売終了)」は対象外
function renderShopPriceMissing() {
  const list = $('shop-price-missing-list');
  list.textContent = '';

  for (const wrap of $('item-list').querySelectorAll('.editor-item')) {
    if (wrap.dataset.deleted === 'true') continue;
    if (getStatus(wrap) === 'ended') continue;
    const priceInput = wrap.querySelector('[data-field="price"]');
    if (!isPriceMissing({ price: priceInput.value })) continue;

    const li = document.createElement('li');
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'price-jump-link';
    link.textContent = oneLine(wrap.querySelector('[data-field="name"]').value)
      || t('editor.noItemName');
    link.addEventListener('click', () => {
      // スクロールはscrollIntoViewに任せる。focus()は進行中のスムーススクロールを
      // 止めることがあるので先に済ませる
      priceInput.focus({ preventScroll: true });
      wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // どの商品へ移動したかが分かるよう一時的に枠を光らせる
      // (クラスを付け直してアニメーションを最初からやり直す)
      wrap.classList.remove('jump-target');
      void wrap.offsetWidth;
      wrap.classList.add('jump-target');
    });
    li.appendChild(link);
    list.appendChild(li);
  }

  $('shop-price-missing').hidden = list.children.length === 0;
}

// ---------------------------------------------------------------- 編集フォーム

function showShop(id) {
  const entry = state.shops.get(id);
  // 未登録店舗は空データから編集を始める(初回送信で data.json が作られる)
  const data = entry.data ?? { id, name: '', url: '', comment: '', logo: '', items: [] };
  state.current = { id, data };
  state.files.clear();
  state.newItemSeq = 0;

  $('shop-name').value = data.name ?? '';
  $('shop-url').value = data.url ?? '';
  $('shop-comment').value = data.comment ?? '';

  const logoFigure = $('shop-logo-current').closest('figure');
  if (data.logo) {
    $('shop-logo-current').src = imageUrl(id, data.logo, data.updatedAt);
    logoFigure.hidden = false;
  } else {
    $('shop-logo-current').removeAttribute('src');
    logoFigure.hidden = true;
  }
  $('shop-logo-file').value = '';
  $('shop-logo-preview-wrap').hidden = true;

  renderItems(data.items ?? []);
  renderShopPriceMissing();

  setAdminListsVisible(false);
  $('edit-form').hidden = false;
  $('payload-section').hidden = true;
  $('send-result').hidden = true;
}

function renderItems(items) {
  const list = $('item-list');
  list.textContent = '';
  if (items.length === 0) {
    renderEmptyHint(list, 'editor.itemsNone');
    return;
  }
  for (const item of items) {
    list.appendChild(buildItemCard(item));
  }
}

function buildItemCard(item) {
  const wrap = document.createElement('div');
  wrap.className = 'editor-item';
  wrap.dataset.itemId = item.id;

  const heading = document.createElement('h3');
  heading.textContent = oneLine(item.name);
  const categoryLabel = itemCategories().find((c) => c.id === item.category)?.label;
  if (categoryLabel) {
    const badge = document.createElement('span');
    badge.className = 'category-badge';
    badge.textContent = categoryLabel;
    heading.appendChild(badge);
  }
  heading.appendChild(buildDeleteToggle(item.id, wrap));
  wrap.appendChild(heading);

  wrap.appendChild(buildField(t('editor.itemName'), 'textarea', 'name', item.name ?? '', {
    rows: 2,
    hint: t('editor.itemNameHint'),
  }));
  wrap.appendChild(buildField(t('editor.itemDescription'), 'textarea', 'description',
    item.description ?? '', { rows: 3 }));
  wrap.appendChild(buildField(priceLabel(), 'text', 'price', item.price ?? '', {
    inputMode: 'numeric',
    hint: priceHint(),
  }));
  wrap.appendChild(buildStatusField(wrap, item.id, item.status));
  if (usesSaleDays()) {
    wrap.appendChild(buildSaleDaysField(item.id, item.saleDays));
  }
  wrap.appendChild(buildImageField(item));

  return wrap;
}

// 「商品を追加」で増やす空の入力欄。仮キー(new-<連番>)で管理し、
// 正式な商品ID(<店舗ID>-<連番>)は送信時に既存の最大連番+1で確定する
function buildNewItemCard() {
  const tempKey = `new-${++state.newItemSeq}`;

  const wrap = document.createElement('div');
  wrap.className = 'editor-item editor-item--new';
  wrap.dataset.itemId = tempKey;
  wrap.dataset.new = 'true';

  const heading = document.createElement('h3');
  heading.textContent = t('editor.newItem');
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'remove-item-button';
  cancel.textContent = t('editor.cancelAdd');
  cancel.addEventListener('click', () => {
    state.files.delete(`item:${tempKey}`);
    wrap.remove();
    renderShopPriceMissing();
  });
  heading.appendChild(cancel);
  wrap.appendChild(heading);

  wrap.appendChild(buildField(t('editor.itemName'), 'textarea', 'name', '', {
    rows: 2,
    hint: t('editor.itemNameHint'),
  }));
  if (itemCategories().length > 0) {
    wrap.appendChild(buildCategoryField());
  }
  wrap.appendChild(buildField(t('editor.itemDescription'), 'textarea', 'description', '', { rows: 3 }));
  wrap.appendChild(buildField(priceLabel(), 'text', 'price', '', {
    inputMode: 'numeric',
    hint: priceHint(),
  }));
  wrap.appendChild(buildStatusField(wrap, tempKey, DEFAULT_ITEM_STATUS));
  if (usesSaleDays()) {
    wrap.appendChild(buildSaleDaysField(tempKey, null));
  }
  wrap.appendChild(buildImageField({ id: tempKey, image: '' }));

  return wrap;
}

// 商品カテゴリの選択欄。設定に itemCategories があるときだけ出す
function buildCategoryField() {
  const field = document.createElement('div');
  field.className = 'field';

  const label = document.createElement('label');
  label.textContent = t('editor.itemCategory');
  field.appendChild(label);

  const select = document.createElement('select');
  select.dataset.field = 'category';
  for (const category of itemCategories()) {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.label;
    select.appendChild(option);
  }
  field.appendChild(select);
  return field;
}

// 商品の販売状態を選ぶラジオ。選択に応じて data-status を更新し、
// 入力欄の背景色(editor.css)で状態がひと目で分かるようにする
function buildStatusField(wrap, itemKey, current) {
  const selected = normalizeStatus(current);
  wrap.dataset.status = selected;

  const field = buildChoiceField(t('editor.statusLegend'));
  for (const value of ITEM_STATUSES) {
    const suffix = value.charAt(0).toUpperCase() + value.slice(1);
    field.appendChild(buildChoice({
      type: 'radio',
      name: `status-${itemKey}`,
      field: 'status',
      value,
      label: t(`editor.status${suffix}`),
      hint: t(`editor.status${suffix}Hint`),
      checked: value === selected,
      onChange: (checked) => { if (checked) wrap.dataset.status = value; },
    }));
  }
  return field;
}

// 販売日のチェックボックス群。saleDays は日IDの配列なので、日ごとに1つ用意する(決定2)。
// 未設定は全日販売として扱い、すべてチェックした状態で開く。
// 開催が1日だけのときはこの欄自体を作らない(呼び出し側で判断)
function buildSaleDaysField(itemKey, current) {
  const selected = Array.isArray(current) && current.length > 0 ? current : days().map((d) => d.id);

  const field = buildChoiceField(t('editor.saleDaysLegend'));
  for (const day of days()) {
    field.appendChild(buildChoice({
      type: 'checkbox',
      name: `saleDays-${itemKey}`,
      field: 'saleDays',
      value: day.id,
      label: day.label,
      checked: selected.includes(day.id),
    }));
  }

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = t('editor.saleDaysHint');
  field.appendChild(hint);
  return field;
}

function buildChoiceField(legendText) {
  const field = document.createElement('fieldset');
  field.className = 'field choice-field';
  const legend = document.createElement('legend');
  legend.textContent = legendText;
  field.appendChild(legend);
  return field;
}

// ラジオ/チェックボックス1つ分。ラベルと補足を縦に並べる
// (name は商品ごとに分ける。同じ画面に複数の商品が並ぶため)
function buildChoice({ type, name, field, value, label, hint, checked, onChange }) {
  const wrap = document.createElement('label');
  wrap.className = 'choice-option';

  const input = document.createElement('input');
  input.type = type;
  input.name = name;
  input.value = value;
  input.dataset.field = field;
  input.checked = !!checked;
  if (onChange) input.addEventListener('change', () => onChange(input.checked));
  wrap.appendChild(input);

  const text = document.createElement('span');
  text.className = 'choice-option-text';
  const title = document.createElement('span');
  title.className = 'choice-option-label';
  title.textContent = label;
  text.appendChild(title);
  if (hint) {
    const hintEl = document.createElement('span');
    hintEl.className = 'choice-option-hint';
    hintEl.textContent = hint;
    text.appendChild(hintEl);
  }
  wrap.appendChild(text);

  return wrap;
}

// 既存商品の削除マーク用トグル。DOMからは消さず、送信時に items 配列から除外する
// (=サーバー側で削除される。画像もサーバー側が後始末する)。
// 送信前ならいつでも取り消せるよう、入力欄の無効化とグレーアウトで表現する
function buildDeleteToggle(itemId, wrap) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'remove-item-button';
  button.textContent = t('editor.deleteItem');
  button.addEventListener('click', () => {
    const deleted = wrap.dataset.deleted !== 'true';
    wrap.dataset.deleted = deleted ? 'true' : 'false';
    wrap.classList.toggle('deleted', deleted);
    button.textContent = deleted ? t('editor.undoDelete') : t('editor.deleteItem');
    if (deleted) {
      // 削除する商品の画像は送らない。選択済みならプレビューごと破棄する
      state.files.delete(`item:${itemId}`);
      const fileInput = wrap.querySelector('input[type="file"]');
      fileInput.value = '';
      wrap.querySelector('figure.preview').hidden = true;
    }
    for (const el of wrap.querySelectorAll('textarea, input, select')) {
      el.disabled = deleted;
    }
    renderShopPriceMissing(); // 削除マークの分をフォーム先頭の一覧に反映する
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
    // スピンコントロールを出さずにスマホで数字キーボードを開かせたい欄で使う
    if (opts.inputMode) input.inputMode = opts.inputMode;
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

function buildImageField(item) {
  const field = document.createElement('div');
  field.className = 'field';

  const label = document.createElement('label');
  label.textContent = t('editor.itemImage');
  field.appendChild(label);

  const row = document.createElement('div');
  row.className = 'image-field';

  // 追加商品(item.imageが空)には「現在の画像」がない
  if (item.image) {
    const current = document.createElement('figure');
    const img = document.createElement('img');
    img.src = imageUrl(state.current.id, item.image, state.current.data.updatedAt);
    img.alt = '';
    const cap = document.createElement('figcaption');
    cap.textContent = t('editor.currentImage');
    current.append(img, cap);
    row.appendChild(current);
  }

  const preview = document.createElement('figure');
  preview.className = 'preview';
  preview.hidden = true;
  const previewImg = document.createElement('img');
  previewImg.alt = '';
  const previewCap = document.createElement('figcaption');
  previewCap.textContent = t('editor.newImage');
  preview.append(previewImg, previewCap);
  row.appendChild(preview);

  const inputWrap = document.createElement('div');
  inputWrap.className = 'file-input-wrap';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.addEventListener('change', () => {
    setImageFile(`item:${item.id}`, fileInput, previewImg, preview);
  });
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = item.image ? t('editor.replaceHint') : t('editor.chooseHint');
  inputWrap.append(fileInput, hint);
  row.appendChild(inputWrap);

  field.appendChild(row);
  return field;
}

function setImageFile(key, fileInput, previewImg, previewWrap) {
  const file = fileInput.files[0];
  if (file && !ALLOWED_EXTENSIONS.includes(fileExt(file))) {
    alert(t('editor.extNotAllowed', { allowed: ALLOWED_EXTENSIONS.join(' / ') }));
    fileInput.value = '';
    state.files.delete(key);
    previewWrap.hidden = true;
    return;
  }
  if (file) {
    state.files.set(key, file);
    previewImg.src = URL.createObjectURL(file);
    previewWrap.hidden = false;
  } else {
    state.files.delete(key);
    previewWrap.hidden = true;
  }
}

// ---------------------------------------------------------------- 送信データの組み立て

// ラジオ/チェックボックスの読み取り。値の取り方が他の入力欄(value)と違うためここにまとめる
const getRadio = (wrap, field) =>
  wrap.querySelector(`[data-field="${field}"]:checked`)?.value;

const getChecked = (wrap, field) =>
  [...wrap.querySelectorAll(`[data-field="${field}"]:checked`)].map((el) => el.value);

const getStatus = (wrap) => normalizeStatus(getRadio(wrap, 'status'));

// 販売日。開催が1日だけなら欄自体が無いので、空配列(=全日)を返す
const getSaleDays = (wrap) => (usesSaleDays() ? getChecked(wrap, 'saleDays') : []);

// 販売日をどう保存するか。すべての日を選んだのと未指定は同じ意味なので、
// 未指定側に寄せてデータを小さく保つ(サーバー側も同じ判断をする)。
//
// 1日も選ばれていないときは保存しない。空配列を「全日」として黙って保存すると、
// 出店者の意図(その商品は出さない)と逆になるため、送信を止めて選び直してもらう
function saleDaysToSave(selected, itemName) {
  if (!usesSaleDays()) return null;
  if (selected.length === 0) {
    throw new Error(t('editor.saleDaysEmpty', {
      name: oneLine(itemName) || t('editor.noItemName'),
    }));
  }
  return selected.length >= days().length ? null : selected;
}

// 送信データを組み立てる。data はサーバーの data.json にそのまま保存される内容。
// - 既存商品: 編集対象外のフィールド(imagePosition / useContain 等)は元の値を保持
// - 削除マーク済み: items 配列から除外する(=サーバー側で削除される)
// - 追加商品: 既存IDの最大連番+1から正式ID(<店舗ID>-<連番>)を確定する
// - 画像を差し替えた場合は保存ファイル名(<対象>.<拡張子>)を image / logo に反映する
function buildPayload() {
  const { id: shopId, data } = state.current;

  const logoFile = state.files.get('logo');
  const logo = logoFile ? `logo.${fileExt(logoFile)}` : (data.logo ?? '');

  // FormDataの対象名(logo / 商品ID) => File。追加商品はID確定後に登録する
  const imageTargets = new Map();
  if (logoFile) imageTargets.set('logo', logoFile);

  const items = [];

  // 既存の商品
  for (const original of data.items ?? []) {
    const wrap = document.querySelector(`.editor-item[data-item-id="${CSS.escape(original.id)}"]`);
    if (!wrap || wrap.dataset.deleted === 'true') continue;
    const get = (name) => wrap.querySelector(`[data-field="${name}"]`).value;
    const file = state.files.get(`item:${original.id}`);
    if (file) imageTargets.set(original.id, file);

    const item = {
      ...original,
      name: get('name').trim(),
      description: get('description').trim(),
      price: Number(get('price')) || 0,
      status: getStatus(wrap),
      image: file ? `${original.id}.${fileExt(file)}` : (original.image ?? ''),
    };
    const saleDays = saleDaysToSave(getSaleDays(wrap), item.name);
    if (saleDays) item.saleDays = saleDays;
    else delete item.saleDays;
    items.push(item);
  }

  // 追加された商品。連番は詰めない(削除で欠番が出てもそのまま)
  let maxSeq = 0;
  for (const original of data.items ?? []) {
    const m = new RegExp(`^${shopId}-(\\d+)$`).exec(original.id);
    if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
  }
  for (const wrap of document.querySelectorAll('.editor-item[data-new="true"]')) {
    const get = (name) => wrap.querySelector(`[data-field="${name}"]`)?.value ?? '';
    const itemId = `${shopId}-${++maxSeq}`;
    const file = state.files.get(`item:${wrap.dataset.itemId}`);
    if (file) imageTargets.set(itemId, file);

    const item = {
      id: itemId,
      name: get('name').trim(),
      description: get('description').trim(),
      price: Number(get('price')) || 0,
      status: getStatus(wrap),
      image: file ? `${itemId}.${fileExt(file)}` : '',
    };
    if (itemCategories().length > 0) item.category = get('category');
    const saleDays = saleDaysToSave(getSaleDays(wrap), item.name);
    if (saleDays) item.saleDays = saleDays;
    items.push(item);
  }

  const totalBytes = [...imageTargets.values()].reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
    throw new Error(t('editor.imageTooLarge', {
      size: Math.round(totalBytes / 1024 / 1024),
      max: Math.round(MAX_TOTAL_IMAGE_BYTES / 1024 / 1024),
    }));
  }

  return {
    shopId,
    data: {
      id: shopId,
      name: $('shop-name').value.trim(),
      url: $('shop-url').value.trim(),
      comment: $('shop-comment').value.trim(),
      logo,
      items,
      // updatedAt はサーバー側(shop-upload.php)が保存時に付与する
    },
    imageTargets,
    // 通知・モック表示用のメタデータ(画像本体は含まない)
    images: [...imageTargets.entries()].map(([target, file]) => ({
      target,
      fileName: file.name,
      size: file.size,
    })),
  };
}

// ---------------------------------------------------------------- 送信

function showResult(ok, message) {
  const el = $('send-result');
  el.textContent = message;
  el.className = ok ? 'success' : 'error';
  el.hidden = false;
}

// モックモード: ペイロード(画像はメタデータのみ)を画面に出す
function showMockPayload(payload) {
  const { imageTargets, ...display } = payload;
  $('payload-view').textContent = JSON.stringify(display, null, 2);
  $('payload-section').hidden = false;
  $('payload-section').scrollIntoView({ behavior: 'smooth' });
}

// PHP受信スクリプトが受け取る形式に組み立てる。
// data はJSON文字列、画像はフィールド名 images[<対象名>] で添付する
function buildFormData(payload) {
  const form = new FormData();
  form.append('shopId', payload.shopId);
  form.append('data', JSON.stringify(payload.data));
  // PHP側は受信できた画像数をこの申告値と照合する(PHPの設定次第でファイルだけ
  // 黙って捨てられることがあり、それを「画像なしの正常送信」と誤認しないため)
  form.append('imageCount', String(payload.imageTargets.size));
  for (const [target, file] of payload.imageTargets) {
    form.append(`images[${target}]`, file, file.name);
  }
  return form;
}

async function submitPayload(payload) {
  // FormData送信はブラウザが multipart/form-data を組み立てる。CORSプリフライトの
  // 発生しない単純リクエストのため、別オリジン設置でもそのままPOSTできる
  const res = await fetch(UPLOAD_URL, { method: 'POST', body: buildFormData(payload) });
  const result = await res.json().catch(() => null);
  if (!res.ok || !result || !result.ok) {
    throw new Error((result && result.error) || `HTTP ${res.status}`);
  }
}

// 更新通知のWebhookへ投稿する(サーバー保存とは独立した通知経路)。
// URLが未設定、またはプレースホルダのままなら何もしない。失敗時は1回だけ再試行する
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

// 現在時刻を「yyyy-MM-dd HH:mm:ss」で返す(sv-SEロケールがこの形式を出す)。
// 設定の timezone があればその暦で出す
function timestamp() {
  const options = { hour12: false };
  if (state.config.timezone) options.timeZone = state.config.timezone;
  return new Date().toLocaleString('sv-SE', options);
}

// 更新通知の本文(画像本体は載せず、メタデータと保存先案内のみ)。
// 合言葉はPHP側で照合済みのため載せない
function webhookMessage(payload) {
  const items = payload.data.items;
  const countStatus = (value) => items.filter((i) => normalizeStatus(i.status) === value).length;
  const limited = items.filter((i) => (i.saleDays ?? []).length > 0).length;

  const parts = [];
  if (countStatus('soldout') > 0) parts.push(t('notify.soldout', { n: countStatus('soldout') }));
  if (countStatus('ended') > 0) parts.push(t('notify.ended', { n: countStatus('ended') }));
  if (limited > 0) parts.push(t('notify.dayLimited', { n: limited }));
  const breakdown = parts.length > 0 ? t('notify.breakdown', { parts: parts.join(' / ') }) : '';

  const categoryLabel = state.shops.get(payload.shopId)?.categoryLabel ?? '';
  return [
    t('notify.shopUpdatedTitle'),
    `🕒 ${timestamp()}`,
    `${t('notify.labelShopName')}: ${oneLine(payload.data.name)}`,
    `${t('notify.labelShopId')}: ${payload.shopId}${categoryLabel ? ` (${categoryLabel})` : ''}`,
    `${t('notify.labelItems')}: ${t('notify.countUnit', { n: items.length })}${breakdown}`
      + ` / ${t('notify.labelImages')}: ${t('notify.countUnit', { n: payload.images.length })}`,
    `${t('notify.labelSavedTo')}: shop-data/${payload.shopId}/`,
  ].join('\n');
}

// ---------------------------------------------------------------- 初期化

function init() {
  const params = new URLSearchParams(window.location.search);
  // 合言葉が未注入(プレースホルダのまま)・空なら運営向けUIは出さない
  const keyReady = ADMIN_KEY !== '' && !/^__[A-Z_]+__$/.test(ADMIN_KEY);
  state.isAdmin = keyReady && params.has(ADMIN_KEY);

  if (state.isAdmin) {
    $('shop-select-section').hidden = false;
    $('admin-links').hidden = false;
    // お知らせエディタも同じ合言葉をアクセスキーとして要求するため引き継ぐ
    const newsLink = $('admin-links').querySelector('a');
    if (newsLink) newsLink.href = `news/?${encodeURIComponent(ADMIN_KEY)}`;
  } else {
    $('id-input-section').hidden = false;
  }

  $('shop-id-submit').addEventListener('click', () => {
    const id = $('shop-id-input').value.trim();
    if (!id) return;
    if (!state.shops.has(id)) {
      const errorEl = $('shop-id-error');
      errorEl.textContent = t('editor.shopIdNotFound');
      errorEl.hidden = false;
      $('edit-form').hidden = true;
      $('payload-section').hidden = true;
      state.current = null;
      return;
    }
    $('shop-id-error').hidden = true;
    showShop(id);
  });

  $('shop-select').addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) {
      $('edit-form').hidden = true;
      $('payload-section').hidden = true;
      state.current = null;
      setAdminListsVisible(true); // トップに戻ったので一覧を出し直す
      return;
    }
    showShop(id);
  });

  $('shop-logo-file').addEventListener('change', () => {
    setImageFile('logo', $('shop-logo-file'), $('shop-logo-preview'), $('shop-logo-preview-wrap'));
  });

  $('add-item-button').addEventListener('click', () => {
    if (!state.current) return;
    const card = buildNewItemCard();
    $('item-list').appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    renderShopPriceMissing(); // 対価未入力の追加商品も一覧に出す
  });

  // 対価の入力・商品名の変更・販売状態の切り替えに追随して一覧を数え直す
  // (一覧のDOMだけ作り直すため、入力中のフォーカスやカーソル位置は影響を受けない)
  $('item-list').addEventListener('input', renderShopPriceMissing);
  $('item-list').addEventListener('change', renderShopPriceMissing);

  $('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.current) return;
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
      // まずPHPへサーバー保存し、成功したときだけ通知する。
      // データの確定点はサーバー保存。保存が失敗すれば下のcatchで結果を表示する。
      // 通知は「保存できた送信」だけを流し、失敗してもログのみ(成否には影響させない)
      await submitPayload(payload);
      try {
        await notifyWebhook(webhookMessage(payload));
      } catch (webhookErr) {
        console.error('更新通知に失敗しました:', webhookErr);
      }
      // 保存済みの内容を手元にも反映して、続けて編集できるようにする
      // (追加商品に確定IDが付き、削除分が消えた状態で再描画する)
      const entry = state.shops.get(payload.shopId);
      entry.data = { ...payload.data, updatedAt: new Date().toISOString() };
      const option = $('shop-select').querySelector(`option[value="${CSS.escape(payload.shopId)}"]`);
      if (option) option.textContent = shopLabel(payload.shopId);
      renderPriceMissing(); // 対価を埋めた分を一覧から消す
      renderNoItemShops();  // 商品を登録した分を一覧から消す
      showShop(payload.shopId);
      showResult(true, t('editor.sent'));
    } catch (err) {
      showResult(false, t('editor.sendFailed', { message: err.message }));
    } finally {
      button.disabled = false;
      button.textContent = t('editor.submit');
    }
  });

  if (!UPLOAD_URL) $('mock-notice').hidden = false;
}

loadData()
  .then(() => {
    applyStaticText();
    init();
    populateShopSelect();
    renderPriceMissing();
    renderNoItemShops();
    // 読み込み直後はトップ(店舗未選択)なので一覧を出す
    setAdminListsVisible(true);
  })
  .catch((err) => {
    // 辞書自体の読み込みに失敗した場合、t() はキー名をそのまま返す。
    // 何が読めなかったかは message に出るので、原因は追える
    alert(t('editor.loadFailed', { message: err.message }));
  });
