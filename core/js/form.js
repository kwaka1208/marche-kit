// 問い合わせ／申込フォーム
//
// テーマが置いた器 [data-marche-form="<種別>"] に、forms/<種別>.json の定義から
// フォームを組み立てる。入力・確認モーダル・送信までをここで受け持つ。
//
// 定義が読めないときは器を隠す。器を [data-marche-form-section] で包んでおくと、
// 見出しごと消える(お知らせの [data-marche-announcements-section] と同じ)。
//
// astro-courier(https://github.com/kwaka1208/astro-courier)の Courier.astro を、
// ビルド不要のESモジュールとして書き起こしたもの。移植にあたって変えたのは次の3点。
//
//   - 文言はすべて辞書から引く(決定4)。ブラウザ既定の検証メッセージは使わない
//   - 選択肢は {value, label} の形(送信値と表示を分けられる)
//   - Discord通知は持たない。通知はサーバー側(send.php)が受け持つ
//
// 壊してはいけない不変条件は上流と同じ。
//
//   - Content-Type を付けない JSON 文字列 POST(CORSプリフライトを起こさない)
//   - ハニーポット・確認モーダル・自動再試行・入力保持のエラー復帰・二重送信抑止
//   - 送信に失敗したら成功を偽らない。入力を残したままエラーを出して再送できる

import { FORM_URL, formSettings, t } from './config.js';
import { announceRendered, el, fetchJson } from './util.js';

// 値がある時だけ形式を検査する(空欄の扱いは required に委ねる)。
// strip は検査前に落とす文字(電話番号のハイフンなど)。サーバー側(send.php)と同じ規則
const VALIDATORS = {
  email: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, messageKey: 'form.errorEmail' },
  phone: { pattern: /^0\d{9,10}$/, strip: /[-\s]/g, messageKey: 'form.errorPhone' },
  url: { pattern: /^https?:\/\/\S+$/, messageKey: 'form.errorUrl' },
  number: { pattern: /^[0-9]+$/, messageKey: 'form.errorNumber' },
  halfwidth: { pattern: /^[\x20-\x7E]+$/, messageKey: 'form.errorHalfwidth' },
};

// 選択式。validation は効かず、必須の見方も1行入力とは違う
const CHOICE_TYPES = new Set(['select', 'radio', 'checkbox']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 送信の一意キー。再試行・再クリックでも同じ値を使い、受け側で重複を見分けられるようにする
function newSubmissionId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `sid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// hidden の capture 指定を解決する。ページの文脈(どこから送られたか)を拾う
function resolveCapture(capture) {
  if (capture === 'pageUrl') return location.href;
  if (capture === 'referrer') return document.referrer;
  if (capture.startsWith('query:')) {
    return new URLSearchParams(location.search).get(capture.slice(6)) ?? '';
  }
  return '';
}

// ---------------------------------------------------------------- 組み立て

// ラベル。必須の印はテーマが装飾できるよう、文言ごと要素に分ける
function buildLabel(field, tag, forId) {
  const label = el(tag, 'courier-label', field.label);
  if (forId) label.htmlFor = forId;
  if (field.required) {
    const mark = el('span', 'courier-required', t('form.required'));
    mark.setAttribute('aria-hidden', 'true');
    label.appendChild(mark);
  }
  return label;
}

// 1行入力・複数行入力・セレクトの本体
function buildControl(field, id, describedBy) {
  let control;
  if (field.type === 'textarea') {
    control = el('textarea');
    control.rows = 6;
  } else if (field.type === 'select') {
    control = el('select');
    // 先頭の空選択肢。placeholder があればその文言を使う
    control.appendChild(el('option', null, field.placeholder || t('form.selectPlaceholder')));
    control.firstChild.value = '';
    for (const opt of field.options ?? []) {
      const option = el('option', null, opt.label);
      option.value = opt.value;
      control.appendChild(option);
    }
  } else {
    control = el('input');
    control.type = field.type;
    for (const attr of ['min', 'max', 'step']) {
      if (field[attr] != null) control.setAttribute(attr, String(field[attr]));
    }
  }
  control.id = id;
  control.name = field.name;
  if (field.placeholder && field.type !== 'select') control.placeholder = field.placeholder;
  if (field.autocomplete) control.autocomplete = field.autocomplete;
  if (describedBy) control.setAttribute('aria-describedby', describedBy);
  return control;
}

// ラジオ・チェックボックスの選択肢群
function buildOptions(field, id) {
  const list = el('div', 'courier-options');
  (field.options ?? []).forEach((opt, i) => {
    const optId = `${id}-${i}`;
    const wrap = el('label', 'courier-option');
    wrap.htmlFor = optId;
    const input = el('input');
    input.id = optId;
    input.type = field.type;
    input.name = field.name;
    input.value = opt.value;
    wrap.appendChild(input);
    wrap.appendChild(el('span', null, opt.label));
    list.appendChild(wrap);
  });
  return list;
}

// 1項目ぶんのDOM。hidden だけは入力欄を持たず、値の入れ物として置く
function buildField(field, uid) {
  const id = `${uid}-${field.name}`;
  const descId = `${id}-desc`;
  const errId = `${id}-error`;
  const describedBy = [field.description ? descId : null, errId].filter(Boolean).join(' ');

  if (field.type === 'hidden') {
    const input = el('input');
    input.type = 'hidden';
    input.name = field.name;
    input.value = field.capture ? resolveCapture(field.capture) : (field.value ?? '');
    return input;
  }

  const wrap = el('div', 'courier-field');
  const error = el('span', 'courier-field-error');
  error.dataset.courierError = field.name;
  error.id = errId;
  error.setAttribute('role', 'alert');
  error.hidden = true;

  // 同意チェックはラベルの中にチェックボックスを置く(押せる範囲を文言まで広げる)
  if (field.type === 'consent') {
    const label = el('label', 'courier-consent');
    const input = el('input');
    input.id = id;
    input.type = 'checkbox';
    input.name = field.name;
    if (describedBy) input.setAttribute('aria-describedby', describedBy);
    label.appendChild(input);
    label.appendChild(el('span', null, field.label));
    if (field.required) {
      const mark = el('span', 'courier-required', t('form.required'));
      mark.setAttribute('aria-hidden', 'true');
      label.appendChild(mark);
    }
    wrap.appendChild(label);
  } else if (field.type === 'radio' || field.type === 'checkbox') {
    // 選択肢群はラベルが特定の入力欄を指せないので、group として読み上げに伝える
    const labelId = `${id}-label`;
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-labelledby', labelId);
    if (describedBy) wrap.setAttribute('aria-describedby', describedBy);
    const label = buildLabel(field, 'span');
    label.id = labelId;
    wrap.appendChild(label);
    if (field.description) {
      wrap.appendChild(Object.assign(el('span', 'courier-desc', field.description), { id: descId }));
    }
    wrap.appendChild(buildOptions(field, id));
    wrap.appendChild(error);
    return wrap;
  } else {
    wrap.appendChild(buildLabel(field, 'label', id));
  }

  if (field.description) {
    wrap.appendChild(Object.assign(el('span', 'courier-desc', field.description), { id: descId }));
  }
  if (field.type !== 'consent') wrap.appendChild(buildControl(field, id, describedBy));
  wrap.appendChild(error);
  return wrap;
}

// 器の中身を丸ごと作る。テーマが置くのは器の1行だけ
function buildForm(container, def, settings, uid) {
  container.textContent = '';
  container.classList.add('courier');

  const form = el('form', 'courier-form');
  form.noValidate = true;
  for (const field of def.fields) form.appendChild(buildField(field, uid));

  // ハニーポット。display:none だと埋めないボットがいるため画面外に置く
  const honeypot = el('div', 'courier-honeypot');
  honeypot.setAttribute('aria-hidden', 'true');
  const hpId = `${uid}-hp`;
  const hpLabel = el('label', null, t('form.honeypot'));
  hpLabel.htmlFor = hpId;
  const hpInput = el('input');
  hpInput.id = hpId;
  hpInput.type = 'text';
  hpInput.name = settings.honeypot;
  hpInput.tabIndex = -1;
  hpInput.autocomplete = 'off';
  // 組み立て直後に空へ戻す。ブラウザの自動入力や、戻る操作でのフォーム状態の復元で
  // 値が入っていると、**来場者の送信が黙って捨てられる**。
  // ボットが埋めるのは読み込みのあとなので、ここで消しても検出には影響しない
  hpInput.value = '';
  honeypot.append(hpLabel, hpInput);
  form.appendChild(honeypot);

  const error = el('div', 'courier-error', t('form.errorSend'));
  error.setAttribute('role', 'alert');
  error.hidden = true;
  form.appendChild(error);

  const submit = el('button', 'courier-submit', t('form.review'));
  submit.type = 'button';
  form.appendChild(submit);

  const success = el('div', 'courier-success', t('form.success'));
  success.hidden = true;
  success.tabIndex = -1;

  // 確認モーダル。開閉はテーマのCSSが受け持つ(hidden 属性で伝える)
  const modal = el('div', 'courier-modal');
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', t('form.confirm'));
  const backdrop = el('div', 'courier-modal__backdrop');
  backdrop.dataset.courierCancel = '';
  const panel = el('div', 'courier-modal__panel');
  panel.setAttribute('role', 'document');
  const preview = el('div', 'courier-modal__preview');
  const actions = el('div', 'courier-modal__actions');
  const cancel = el('button', 'courier-modal__cancel', t('form.back'));
  cancel.type = 'button';
  cancel.dataset.courierCancel = '';
  const confirm = el('button', 'courier-modal__confirm', t('form.submit'));
  confirm.type = 'button';
  actions.append(cancel, confirm);
  panel.append(el('h2', 'courier-modal__heading', t('form.confirm')), preview, actions);
  modal.append(backdrop, panel);

  container.append(form, success, modal);
  return { form, error, submit, success, modal, preview, confirm };
}

// ---------------------------------------------------------------- 動き

function activate(container, def, settings) {
  const uid = `courier-${Math.random().toString(36).slice(2, 9)}`;
  const parts = buildForm(container, def, settings, uid);
  const { form, error, submit, success, modal, preview, confirm } = parts;
  const fields = def.fields;
  const submissionId = newSubmissionId();

  const controls = (field) =>
    Array.from(form.querySelectorAll(`[name="${CSS.escape(field.name)}"]`));

  // 表示上の代表要素。選択肢群は先頭を代表にしてフォーカスを当てる
  const primary = (field) => controls(field)[0] ?? null;

  // フィールドの値。チェックボックスは ", " で結合し、同意は文言に置き換える。
  // サーバー側は文字列として受け取るので、ここで表示にも通知にも使える形にしておく
  const valueOf = (field) => {
    if (field.type === 'radio' || field.type === 'checkbox') {
      return controls(field).filter((c) => c.checked).map((c) => c.value).join(', ');
    }
    if (field.type === 'consent') {
      const box = primary(field);
      return box && box.checked ? t('form.consentAgreed') : '';
    }
    const control = primary(field);
    return control ? control.value.trim() : '';
  };

  // 確認画面に出す値。選択式は送信値ではなく**表示ラベル**にする。
  // 送信値(value)は機械が読むための鍵で、人が確認するのはラベルのほう
  const labelOf = (field) => {
    const value = valueOf(field);
    if (!CHOICE_TYPES.has(field.type) || value === '') return value;
    const labels = new Map((field.options ?? []).map((o) => [o.value, o.label]));
    return value.split(', ').map((v) => labels.get(v) ?? v).join(t('common.listSeparator'));
  };

  // 1項目の検査。**メッセージはすべて辞書から引く**(決定4)。
  // ブラウザ既定の validationMessage を使うと、辞書の言語と食い違う
  const errorOf = (field) => {
    const value = valueOf(field);
    if (value === '') {
      if (!field.required) return null;
      // 「入力してください」で通らないものがある。同意は同意を、選択式は選択を促す
      const key = field.type === 'consent' ? 'form.errorConsent'
        : CHOICE_TYPES.has(field.type) ? 'form.errorChoose'
          : 'form.errorRequired';
      return t(key, { label: field.label });
    }
    if (field.maxLength && [...value].length > field.maxLength) {
      return t('form.errorMaxLength', { label: field.label, max: field.maxLength });
    }
    // 選択式と同意には形式検査を掛けない(値が定義側で決まっているため)
    if (CHOICE_TYPES.has(field.type) || field.type === 'consent') return null;
    const rule = VALIDATORS[field.validation];
    if (!rule) return null;
    const target = rule.strip ? value.replace(rule.strip, '') : value;
    return rule.pattern.test(target) ? null : t(rule.messageKey);
  };

  const errorSlot = (field) =>
    container.querySelector(`[data-courier-error="${CSS.escape(field.name)}"]`);

  // 検査してインライン表示に反映する。戻り値はそのフィールドが妥当かどうか
  const refresh = (field) => {
    const message = errorOf(field);
    const slot = errorSlot(field);
    if (slot) {
      slot.textContent = message ?? '';
      slot.hidden = message === null;
    }
    for (const control of controls(field)) {
      if (message) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    }
    return message === null;
  };

  // 検査を始めるタイミング。
  //   - 値を入れて項目を離れたら、その場から検査を始める(形式の誤りに早く気付ける)
  //   - 空欄のまま離れただけでは必須エラーを出さない(タブ移動でエラーが並ぶのを避ける)
  //   - 一度始めた項目は、以後の入力ごとに更新する
  let submitted = false;
  const touched = new Set();
  for (const field of fields) {
    if (field.type === 'hidden') continue;
    // 選ぶものは change、打ち込むものは input で拾う
    const event = CHOICE_TYPES.has(field.type) || field.type === 'consent' ? 'change' : 'input';
    for (const control of controls(field)) {
      control.addEventListener(event, () => {
        if (submitted || touched.has(field.name)) refresh(field);
      });
      control.addEventListener('blur', () => {
        if (submitted || touched.has(field.name)) return;
        if (valueOf(field) === '') return;
        touched.add(field.name);
        refresh(field);
      });
    }
  }

  const payload = () => {
    const data = { type: def.formType, submissionId };
    for (const field of fields) {
      data[field.name] = field.type === 'hidden'
        ? (primary(field)?.value ?? '')
        : valueOf(field);
    }
    return data;
  };

  const closeModal = () => { modal.hidden = true; };

  const buildPreview = () => {
    preview.textContent = '';
    for (const field of fields) {
      if (field.type === 'hidden') continue; // 隠し項目は確認画面に出さない
      const row = el('div', 'courier-preview-row');
      row.appendChild(el('strong', null, field.label));
      const value = labelOf(field);
      if (value === '') {
        row.appendChild(el('span', 'courier-preview-empty', t('form.notEntered')));
      } else {
        // 入力値はテキストとして流し込む。改行だけ残す(決定6と同じ扱い)
        const body = el('span', 'courier-preview-value');
        value.split('\n').forEach((line, i) => {
          if (i > 0) body.appendChild(document.createElement('br'));
          body.appendChild(document.createTextNode(line));
        });
        row.appendChild(body);
      }
      preview.appendChild(row);
    }
  };

  const showSuccess = () => {
    if (settings.successUrl) {
      // 遷移するときはモーダルを開いたままにして、二重操作を防ぐ
      location.href = settings.successUrl;
      return;
    }
    closeModal();
    form.hidden = true;
    error.hidden = true;
    success.hidden = false;
    success.focus();
    success.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // 送信。失敗したら間を置いて再試行する
  async function send(data, retries) {
    try {
      // Content-Type を付けない = プリフライトを起こさない単純リクエストにする
      const response = await fetch(settings.endpoint, { method: 'POST', body: JSON.stringify(data) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (!json || json.ok !== true) throw new Error(json?.error || 'send failed');
    } catch (err) {
      if (retries > 0) {
        await sleep(800);
        return send(data, retries - 1);
      }
      throw err;
    }
  }

  submit.addEventListener('click', () => {
    error.hidden = true;
    submitted = true;

    // ハニーポットに値が入っていればボット。送らずに完了したように見せる
    const decoy = form.elements.namedItem(settings.honeypot);
    if (decoy && decoy.value !== '') {
      showSuccess();
      return;
    }

    let firstInvalid = null;
    for (const field of fields) {
      if (field.type === 'hidden') continue;
      if (!refresh(field) && !firstInvalid) firstInvalid = primary(field);
    }
    if (firstInvalid) {
      firstInvalid.focus();
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    buildPreview();
    modal.hidden = false;
    confirm.focus();
  });

  for (const node of container.querySelectorAll('[data-courier-cancel]')) {
    node.addEventListener('click', closeModal);
  }

  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    confirm.textContent = t('form.sending');
    const data = payload();

    // モックモード。PHPを置かない環境で見た目と入力を確かめるためのもの
    if (!settings.endpoint) {
      console.info('[marche] モックモード。送信内容:', data);
      showSuccess();
      success.appendChild(el('p', 'courier-mock-notice', t('form.mockNotice')));
      return;
    }

    try {
      await send(data, settings.retries);
      showSuccess();
    } catch (err) {
      // 成功を偽らない。入力は残したままエラーを出して、送り直せるようにする
      console.error('フォームの送信に失敗しました:', err);
      closeModal();
      error.hidden = false;
      confirm.disabled = false;
      confirm.textContent = t('form.submit');
    }
  });
}

// 器はページ内にいくつあってもよい。種別ごとに定義を1回だけ取りに行く
export async function initForms() {
  const containers = document.querySelectorAll('[data-marche-form]');
  if (containers.length === 0) return;

  const settings = formSettings();
  const cache = new Map();

  for (const container of containers) {
    const type = container.dataset.marcheForm;
    if (!type) continue;
    try {
      if (!cache.has(type)) cache.set(type, fetchJson(`${FORM_URL}${type}.json`));
      const def = await cache.get(type);
      if (!Array.isArray(def.fields) || def.fields.length === 0) {
        throw new Error('fields が空');
      }
      activate(container, def, settings);
    } catch (err) {
      // 定義が読めないときは隠す。**見出しごと消せるように、セクションを先に探す。**
      // 器だけ隠すと「お問い合わせ」の見出しと余白が残る(お知らせと同じ扱い)
      console.error(`フォーム定義 ${type} を読み込めませんでした:`, err);
      const section = container.closest('[data-marche-form-section]');
      (section ?? container).hidden = true;
    }
  }
  announceRendered('forms');
}
