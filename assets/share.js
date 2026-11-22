/* Recipient page. Tokens and passwords stay in memory and never enter a URL. */
(() => {
  const content = document.getElementById('share-content');
  if (!content) return;
  const apiBaseUrl = (window.__ENV__?.API_BASE_URL || 'https://api.qabas.one').replace(/\/+$/, '');
  const match = /^\/f\/([A-Za-z0-9_-]{32})\/?$/.exec(location.pathname);
  const dialog = document.getElementById('auth-dialog');
  const authContent = document.getElementById('auth-content');
  const authTitle = document.getElementById('auth-title');
  const api = match ? `${apiBaseUrl}/api/v1/f/${match[1]}` : '';
  const session = { access: '', refresh: '', expires: 0 };
  let openedFileUrl = '';
  let openedFileName = '';
  function closeOpenedFile() {
    if (openedFileUrl) URL.revokeObjectURL(openedFileUrl);
    openedFileUrl = '';
    openedFileName = '';
  }
  addEventListener('pagehide', closeOpenedFile);

  function node(tag, className, value) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value != null) el.textContent = value;
    return el;
  }
  function clear() { content.replaceChildren(); content.setAttribute('aria-busy', 'false'); }
  function state(heading, detail, action, code = '') {
    clear();
    const wrap = node('div', 'share-state');
    if (code) wrap.append(node('p', 'eyebrow', code));
    wrap.append(node('h1', '', heading), node('p', '', detail));
    if (action) wrap.append(action);
    content.append(wrap);
  }
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  function openDialog(heading, form, focus) {
    authTitle.textContent = heading;
    authContent.replaceChildren(form);
    if (!dialog.open) dialog.showModal();
    focus?.focus();
  }
  function button(label, handler) {
    const el = node('button', 'button', label);
    el.type = 'button';
    el.addEventListener('click', handler);
    return el;
  }
  function field(label, type, autocomplete) {
    const wrap = node('div', 'field');
    const id = `field-${Math.random().toString(36).slice(2)}`;
    const caption = node('label', '', label);
    caption.htmlFor = id;
    const input = node('input', 'password-input');
    input.id = id;
    input.type = type;
    input.autocomplete = autocomplete;
    input.required = true;
    wrap.append(caption, input);
    return { wrap, input };
  }
  function message(target, text) {
    let el = target.querySelector('.message');
    if (!el) { el = node('p', 'message'); el.setAttribute('role', 'alert'); target.append(el); }
    el.textContent = text;
  }
  function saveTokens(data) {
    session.access = data.accessToken || '';
    session.refresh = data.refreshToken || '';
    session.expires = Date.now() + Math.max(0, (Number(data.expiresInSeconds) || 0) - 30) * 1000;
  }
  function forgetTokens() { session.access = ''; session.refresh = ''; session.expires = 0; closeOpenedFile(); }
  async function authRequest(path, body, bearer = '') {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const response = await fetch(`${apiBaseUrl}/api/v1/auth/${path}`, {
      method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store', referrerPolicy: 'no-referrer'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) throw new Error('auth');
    return payload.data || payload;
  }
  async function refresh() {
    if (!session.refresh) return false;
    try { saveTokens(await authRequest('refresh', { refreshToken: session.refresh })); return !!session.access; }
    catch { forgetTokens(); return false; }
  }
  async function request(url, options = {}) {
    if (session.access && Date.now() >= session.expires) await refresh();
    const headers = new Headers(options.headers || {});
    if (session.access) headers.set('Authorization', `Bearer ${session.access}`);
    const send = () => fetch(url, { ...options, headers, cache: 'no-store', referrerPolicy: 'no-referrer' });
    let response = await send();
    if (response.status === 401 && session.refresh && await refresh()) {
      headers.set('Authorization', `Bearer ${session.access}`);
      response = await send();
    }
    return response;
  }
  async function errorCode(response) {
    const body = await response.json().catch(() => ({}));
    return String(body.error?.messageKey || body.messageKey || body.error?.key || body.code || body.error?.code || '');
  }
  function handleError(status, code) {
    if (status === 401) return signIn();
    if (status === 403 && code.includes('passwordInvalid')) {
      const input = document.getElementById('link-password');
      if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
      return message(content.querySelector('.download-form') || content, 'كلمة مرور الرابط غير صحيحة. تحقّق منها وحاول مرة أخرى.');
    }
    if (status === 403) return state('هذا الحساب لا يملك صلاحية الوصول', 'استخدم الحساب الذي حدّده مرسل الرابط.', button('استخدام حساب آخر', signIn));
    if (status === 404) return state('رابط المشاركة غير متاح', 'اطلب من المرسل رابطًا جديدًا.');
    if (status === 409) return state('بلغ الرابط الحد الأقصى للتنزيلات', 'اطلب من المرسل رابط مشاركة جديدًا.');
    if (status === 429) return state('طلبات كثيرة خلال وقت قصير', 'انتظر قليلًا ثم حاول مرة أخرى.', button('المحاولة مجددًا', inspect));
    return state('تعذّر الاتصال بخدمة الملفات', 'تحقّق من اتصالك ثم حاول مرة أخرى.', button('المحاولة مجددًا', inspect));
  }
  function signIn() {
    state('يلزم تسجيل الدخول', 'سجّل الدخول بحساب قبس المسموح له بفتح هذا الرابط.', button('تسجيل الدخول', signIn));
    const form = node('form', 'download-form');
    const hint = node('p', 'field-hint', 'استخدم حساب قبس المسموح له بفتح هذا الرابط.');
    const identifier = field('اسم المستخدم أو البريد الإلكتروني أو رقم الهاتف', 'text', 'username');
    const password = field('كلمة مرور الحساب', 'password', 'current-password');
    const submit = node('button', 'button', 'تسجيل الدخول'); submit.type = 'submit';
    form.append(hint, identifier.wrap, password.wrap, submit);
    form.addEventListener('submit', async event => {
      event.preventDefault(); submit.disabled = true; submit.textContent = 'جارٍ تسجيل الدخول';
      try {
        const data = await authRequest('login', { identifier: identifier.input.value.trim(), password: password.input.value });
        password.input.value = '';
        if (data.twoFactorRequired) return twoFactor(data.challengeToken);
        saveTokens(data);
        if (data.mustChangePassword) return passwordChange();
        dialog.close(); await inspect();
      } catch { message(form, 'تعذّر تسجيل الدخول. تحقّق من بيانات الحساب وحاول مرة أخرى.'); }
      finally { submit.disabled = false; submit.textContent = 'تسجيل الدخول'; }
    });
    openDialog('تسجيل الدخول', form, identifier.input);
  }
  function twoFactor(challengeToken) {
    const form = node('form', 'download-form');
    const code = field('رمز التحقق', 'text', 'one-time-code');
    code.input.inputMode = 'numeric';
    const submit = node('button', 'button', 'تأكيد الرمز'); submit.type = 'submit';
    form.append(node('p', 'field-hint', 'أدخل الرمز الذي وصلك لتأكيد هويتك.'), code.wrap, submit);
    form.addEventListener('submit', async event => {
      event.preventDefault(); submit.disabled = true;
      try {
        const data = await authRequest('2fa/verify-login', { challengeToken, code: code.input.value.trim() });
        code.input.value = ''; saveTokens(data);
        if (data.mustChangePassword) return passwordChange();
        dialog.close(); await inspect();
      } catch { message(form, 'رمز التحقق غير صحيح أو انتهت صلاحيته. حاول مرة أخرى.'); }
      finally { submit.disabled = false; }
    });
    openDialog('التحقق بخطوتين', form, code.input);
  }
  function passwordChange() {
    const form = node('form', 'download-form');
    const password = field('كلمة المرور الجديدة', 'password', 'new-password');
    const confirm = field('تأكيد كلمة المرور الجديدة', 'password', 'new-password');
    const submit = node('button', 'button', 'تغيير كلمة المرور'); submit.type = 'submit';
    form.append(node('p', 'field-hint', 'غيّر كلمة مرور حسابك للمتابعة إلى الملف.'),
      password.wrap, confirm.wrap, submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (password.input.value !== confirm.input.value) return message(form, 'كلمتا المرور غير متطابقتين.');
      submit.disabled = true;
      try {
        const data = await authRequest('change-required-password', { newPassword: password.input.value }, session.access);
        password.input.value = ''; confirm.input.value = '';
        saveTokens(data);
        dialog.close(); await inspect();
      } catch { message(form, 'تعذّر تغيير كلمة المرور. تحقّق من متطلبات كلمة المرور وحاول مرة أخرى.'); }
      finally { submit.disabled = false; }
    });
    openDialog('تغيير كلمة المرور', form, password.input);
  }
  function previewKind(mime) {
    if (/^image\/(png|jpeg|gif|webp|avif)$/.test(mime)) return 'image';
    if (mime === 'application/pdf') return 'pdf';
    if (/^audio\/(mpeg|mp4|ogg|wav|webm)$/.test(mime)) return 'audio';
    if (/^video\/(mp4|webm|ogg)$/.test(mime)) return 'video';
    return '';
  }
  function previewUrl(data) {
    // Only public, unlimited redirect links can be previewed without consuming a slot.
    if (data.requireAuth || data.hasPassword || data.deliveryMode !== 'REDIRECT') return '';
    return api;
  }
  function showPreview(target, kind, url, name) {
    target.replaceChildren();
    if (kind === 'pdf') {
      const open = node('a', 'button', 'فتح معاينة PDF');
      open.href = url;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      target.append(node('p', 'preview-unavailable', 'افتح ملف PDF في علامة تبويب جديدة لعرضه في قارئ المتصفح.'), open);
      target.classList.add('pdf-preview');
      return;
    }
    let media;
    if (kind === 'image') { media = node('img'); media.alt = `معاينة ${name}`; }
    if (kind === 'audio') { media = node('audio'); media.controls = true; media.preload = 'none'; }
    if (kind === 'video') { media = node('video'); media.controls = true; media.preload = 'metadata'; media.playsInline = true; }
    media.src = url;
    media.referrerPolicy = 'no-referrer';
    media.addEventListener('error', () => message(target, 'تعذّر عرض المعاينة. يمكنك تنزيل الملف لفتحه.'));
    target.append(media);
  }
  function safeName(name) { return String(name || 'download').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 180); }
  function dispositionName(header, fallback) {
    const utf = /filename\*=UTF-8''([^;]+)/i.exec(header || '');
    if (utf) { try { return safeName(decodeURIComponent(utf[1])); } catch { /* use fallback */ } }
    const plain = /filename="?([^";]+)"?/i.exec(header || '');
    return safeName(plain?.[1] || fallback);
  }
  async function download(data, password, submit) {
    const originalLabel = submit.textContent;
    submit.disabled = true; submit.textContent = 'جارٍ فتح الملف';
    try {
      if (previewUrl(data)) { location.assign(api); return; }
      if (data.deliveryMode === 'REDIRECT') {
        message(content, 'يتعذّر تنزيل هذا الرابط المحمي مباشرة. اطلب من المرسل رابط تنزيل من نوع STREAM.'); return;
      }
      const headers = { 'Accept-Language': 'ar' };
      let body;
      if (data.hasPassword) { headers['Content-Type'] = 'application/json'; body = JSON.stringify({ password }); }
      const response = await request(`${api}/download`, { method: 'POST', headers, body });
      if (!response.ok) { handleError(response.status, await errorCode(response)); return; }
      const blob = await response.blob();
      const filename = dispositionName(response.headers.get('Content-Disposition'), data.fileName || data.name);
      if (data.hasPassword) {
        closeOpenedFile();
        openedFileUrl = URL.createObjectURL(blob);
        openedFileName = filename;
        render(data, openedFileUrl);
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = node('a'); anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      await inspect();
    } catch { message(content, 'تعذّر التنزيل. تحقّق من اتصالك قبل المحاولة مجددًا.'); }
    finally { submit.disabled = false; submit.textContent = originalLabel; }
  }
  function renderPasswordGate(data) {
    clear();
    const gate = node('div', 'access-view');
    const heading = node('h1', '', 'هذا الملف محمي بكلمة مرور');
    const intro = node('p', '', 'أدخل كلمة مرور الرابط لفتح الملف.');
    const form = node('form', 'download-form');
    const password = field('كلمة مرور الرابط', 'password', 'off');
    password.input.id = 'link-password';
    password.wrap.querySelector('label').htmlFor = 'link-password';
    password.input.addEventListener('input', () => password.input.removeAttribute('aria-invalid'));
    const note = node('p', 'field-hint', 'فتح الملف يستخدم تنزيلًا واحدًا من الرابط.');
    const submit = node('button', 'button', 'فتح الملف'); submit.type = 'submit';
    form.append(password.wrap, note, submit);
    form.addEventListener('submit', event => { event.preventDefault(); download(data, password.input.value, submit); });
    gate.append(heading, intro, form);
    content.append(gate);
  }
  function render(data, localUrl = '') {
    if (data.hasPassword && !localUrl) return renderPasswordGate(data);
    clear();
    const name = safeName(data.fileName || data.file?.name || data.name || 'ملف مشترك');
    const mime = String(data.mimeType || data.file?.mimeType || data.contentType || '').toLowerCase().split(';')[0];
    const layout = node('div', 'file-view');
    const heading = node('h1', 'visually-hidden');
    const bidi = node('bdi', '', name); bidi.dir = 'auto'; heading.append(bidi);
    layout.append(heading);
    const kind = previewKind(mime); const url = localUrl || previewUrl(data);
    const section = node('section', 'media-preview');
    section.setAttribute('aria-label', `محتوى الملف: ${name}`);
    const surface = node('div', 'media-surface');
    if (kind && url) showPreview(surface, kind, url, name);
    else surface.append(node('p', 'preview-unavailable', kind
      ? 'المعاينة غير متاحة لهذا الرابط. يمكنك تنزيل الملف وفتحه على جهازك.'
      : 'لا يمكن عرض هذا النوع من الملفات هنا. يمكنك تنزيله وفتحه على جهازك.'));
    const form = node('form', 'viewer-actions');
    const submit = node('button', 'button', 'تنزيل'); submit.type = 'submit';
    form.append(submit);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (localUrl) {
        const anchor = node('a');
        anchor.href = localUrl; anchor.download = openedFileName || name;
        document.body.append(anchor); anchor.click(); anchor.remove();
      } else download(data, '', submit);
    });
    if (kind && url) section.append(form, surface);
    else { surface.append(form); section.append(surface); }
    layout.append(section);
    if (session.access) layout.append(button('تسجيل الخروج', async () => {
      try { await authRequest('logout', {}, session.access); } catch { /* clear local session regardless */ }
      forgetTokens(); signIn();
    }));
    content.append(layout);
  }
  async function inspect() {
    content.setAttribute('aria-busy', 'true');
    try {
      const response = await request(api, { headers: { Accept: 'application/json' } });
      if (!response.ok) return handleError(response.status, await errorCode(response));
      const payload = await response.json();
      render(payload.data || payload);
    } catch { state('تعذّر الاتصال بخدمة الملفات', 'تحقّق من اتصالك ثم حاول مرة أخرى.', button('المحاولة مجددًا', inspect)); }
  }
  if (match) inspect();
  else state('الصفحة غير موجودة', 'تحقّق من الرابط الذي وصلك، أو اطلب من المرسل رابطًا جديدًا.', null, '404');
})();
