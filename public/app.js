'use strict';

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const pageNames = { overview: '总览', connection: '连接 QQ', persona: '性格与表达', memory: '记忆手册', usage: '用量与记录', install: '安装与部署' };
  const eventNames = { bridge: 'QQ 桥接状态', run: '回复运行状态', confirmed: '接口已确认发送', connected: 'QQ 已连接', disconnected: '连接已断开', reply: '回复已提交', sent: '回复已确认', received: '收到消息', skipped: '本轮未回复', failed: '处理未完成', error: '需要留意', paused: '已暂停回复', started: '已开启回复', memory: '记忆已更新', model: '模型调用', settings: '设置已保存', preview: '本机试聊', unknown: '发送结果未确认' };
  const numberFormat = new Intl.NumberFormat('zh-CN');
  let state = null;
  let serviceReady = false;
  let initialized = false;
  let currentView = 'overview';
  let memoryStatus = 'all';
  let memoryScope = 'all';
  let refreshPromise = null;
  let pendingActions = 0;
  let pauseInFlight = false;
  let toastTimer = null;
  let memoryFingerprint = '';
  let scopeFingerprint = '';
  let token = '';

  function readToken() {
    const raw = location.hash.slice(1);
    if (raw) {
      try { token = decodeURIComponent(raw.startsWith('token=') ? raw.slice(6) : raw); }
      catch { token = raw; }
      try { sessionStorage.setItem('echo.managementToken', token); } catch { /* Session memory still works when browser storage is unavailable. */ }
      history.replaceState(null, '', location.pathname + location.search);
    } else {
      try { token = sessionStorage.getItem('echo.managementToken') || ''; } catch { token = ''; }
    }
  }

  function create(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  function formatNumber(value) {
    return Number.isFinite(Number(value)) && value !== null && value !== '' ? numberFormat.format(Number(value)) : '—';
  }

  function timeValue(value) {
    if (!value) return null;
    if (typeof value === 'number' && value < 1e12) return new Date(value * 1000);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function prettyDate(value, full = false) {
    const date = timeValue(value);
    if (!date) return '时间未记录';
    return new Intl.DateTimeFormat('zh-CN', full ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false } : { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  function notify(message, error = false) {
    clearTimeout(toastTimer);
    $('#toast').hidden = false;
    $('#toast').classList.toggle('error', error);
    setText('#toast-text', message);
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 10000 : 5500);
  }

  async function request(path, { method = 'GET', body } = {}) {
    const headers = { 'X-Echo-Token': token };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(path === '/api/preview' ? 90000 : path === '/api/bridge/connect' ? 45000 : 20000) });
    } catch (error) {
      const message = error.name === 'TimeoutError' ? '等待本机服务超时。请检查服务状态；真实模型请求可能仍在处理，先不要重复发送。' : '无法连接本机服务。请确认启动终端仍在运行，再重新连接。';
      const failure = new Error(message); failure.status = 0; throw failure;
    }
    let result;
    try { result = await response.json(); }
    catch { throw new Error('服务返回了无法读取的响应，请检查运行终端。'); }
    if (!response.ok) {
      const failure = new Error(typeof result.message === 'string' ? result.message : typeof result.error === 'string' ? result.error : `请求未完成（${response.status}）`);
      failure.status = response.status;
      throw failure;
    }
    return result;
  }

  function showView(name, focus = true) {
    if (!pageNames[name]) return;
    currentView = name;
    for (const [key, title] of Object.entries(pageNames)) {
      const section = $('#view-' + key);
      section.hidden = key !== name;
      section.classList.toggle('active', key === name);
      const button = $(`.nav-button[data-view="${key}"]`);
      button.classList.toggle('active', key === name);
      if (key === name) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
      if (key === name) setText('#current-page', title);
    }
    if (focus) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      $('#main').focus({ preventScroll: true });
    }
  }

  function setUnavailable(error) {
    serviceReady = false;
    $('#service-error').hidden = false;
    setText('#service-error-title', error.status === 401 || error.status === 403 ? '管理令牌未通过核对' : '暂时无法连接本机服务');
    setText('#service-error-message', error.message + (state ? ' 下方保留的是上次读取的数据，当前运行状态未知。' : ' 尚未读取到真实运行状态。'));
    if (error.status === 401 || error.status === 403 || !token) $('#token-gate').hidden = false;
    $('#connection-badge').className = 'status-pill error';
    setText('#connection-badge span', '状态未同步');
    setText('#hero-companion-status', '本机状态暂时未知');
    setText('#run-summary', '状态未知');
    $('#ready-run').classList.remove('ready');
    updateButtons();
  }

  async function refresh(forceForms = false) {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      try {
        const result = await request('/api/state');
        if (!result || !result.config || !result.runtime || !result.setup) throw new Error('状态响应不完整，无法核对运行条件。');
        state = result;
        serviceReady = true;
        $('#service-error').hidden = true;
        $('#token-gate').hidden = true;
        renderState(!initialized || forceForms);
        initialized = true;
        return result;
      } catch (error) {
        setUnavailable(error);
        return null;
      } finally { refreshPromise = null; }
    })();
    return refreshPromise;
  }

  function updateButtons() {
    $$('[data-requires-state]').forEach(button => { button.disabled = !serviceReady || pendingActions > 0; });
    const ready = serviceReady && state;
    $('#pause-all').disabled = !ready || pauseInFlight;
    if (!ready) return;
    const connected = state.runtime.bridge === 'connected';
    $('#connect-bridge').disabled = pendingActions > 0 || connected || state.runtime.bridge === 'connecting' || !state.setup.hasBridgeToken || !state.config.expectedAccount;
    $('#disconnect-bridge').disabled = pendingActions > 0 || state.runtime.bridge === 'disconnected';
    const scopes = Array.isArray(state.config.scopes) ? state.config.scopes : [];
    const canRun = connected && state.setup.hasKey && scopes.some(scope => scope.enabled) && !state.runtime.running;
    $('#run-once').disabled = !canRun || pendingActions > 0;
    $('#run-continuous').disabled = !canRun || pendingActions > 0;
    $('#preview-form button[type="submit"]').disabled = pendingActions > 0 || !serviceReady;
  }

  function renderState(forms) {
    const config = state.config;
    const runtime = state.runtime;
    const setup = state.setup;
    const scopes = Array.isArray(config.scopes) ? config.scopes : [];
    const connected = runtime.bridge === 'connected';
    const enabled = scopes.filter(scope => scope.enabled).length;
    const bridgeNames = { disconnected: '未连接', connecting: '连接中', connected: '已连接', error: '连接异常' };
    const bridgeLabel = bridgeNames[runtime.bridge] || '未核对';
    $('#connection-badge').className = 'status-pill ' + (runtime.bridge === 'error' ? 'error' : connected ? 'connected' : 'neutral');
    setText('#connection-badge span', runtime.running ? 'QQ 已连接 · 回复中' : connected ? 'QQ 已连接 · 已暂停' : bridgeLabel);
    setText('#hero-companion-status', runtime.running ? `${config.name || '回声'}正在回应` : '安静等待，随时准备好');
    setText('#key-summary', setup.hasKey ? '已配置' : '未配置');
    setText('#bridge-summary', bridgeLabel);
    setText('#scope-summary', enabled ? `${enabled} 个已启用` : '尚未选择');
    setText('#run-summary', runtime.running ? '正在回复' : '已暂停');
    for (const [id, ready] of [['ready-key', setup.hasKey], ['ready-bridge', connected], ['ready-scope', enabled > 0], ['ready-run', runtime.running]]) $('#' + id).classList.toggle('ready', Boolean(ready));
    setText('#setup-progress', `${Number(connected && setup.hasKey) + Number(enabled > 0) + Number(Boolean(runtime.running))} / 03`);
    for (const [id, ready] of [['step-one', connected && setup.hasKey], ['step-two', enabled > 0], ['step-three', runtime.running]]) $('#' + id).classList.toggle('complete', Boolean(ready));
    setText('#bridge-detail-badge', bridgeLabel);
    setText('#onebot-configured', setup.hasBridgeToken ? '已配置 · 留空不修改' : '尚未配置');
    setText('#key-configured', setup.hasKey ? '已配置 · 留空不修改' : '尚未配置');
    const account = runtime.account;
    setText('#account-result', account ? `已核对账号：${account.name || 'QQ'}（${account.id}）` : runtime.error ? runtime.error : '尚未核对 QQ 账号与在线状态。');
    const reasons = [];
    if (!connected) reasons.push('QQ 尚未连接');
    if (!setup.hasKey) reasons.push('未配置 DeepSeek Key');
    if (!enabled) reasons.push('未启用回复会话');
    setText('#run-readiness', runtime.running ? '当前已开启回复。需要停止时点击右上角“暂停回复”。' : reasons.length ? `还需要：${reasons.join('、')}。` : '准备完成。对端确认可接收测试消息后，再点击试运行一次。');
    setText('#version-label', `v${state.version || '开发版'} · 本机优先`);
    if (forms) fillConfig(config);
    renderScopes(scopes);
    renderMemory();
    renderUsage();
    renderEvents();
    updateButtons();
  }

  function fillConfig(config) {
    $('#bridge-url').value = config.bridgeUrl || 'ws://127.0.0.1:3001';
    $('#account-id').value = config.expectedAccount || '';
    $('#companion-name').value = config.name || '回声';
    $('#persona-prompt').value = config.prompt || '';
    $('#reply-length').value = config.maxReplyChars ?? 120;
    $('#daily-call-limit').value = config.dailyCallLimit ?? 100;
    $('#context-turns').value = config.contextTurns ?? 8;
    $('#model-name').value = config.model || 'deepseek-chat';
    const persona = $$('input[name="persona"]').find(input => input.value === config.persona);
    if (persona) persona.checked = true;
  }

  function scopeLabel(scope) {
    if (scope === 'web:preview') return '本机试聊';
    const found = state?.config.scopes?.find(item => item.id === scope);
    if (found?.label) return found.label;
    if (scope.startsWith('private:')) return `好友 ${scope.slice(8)}`;
    if (scope.startsWith('group:')) return `群 ${scope.slice(6)}`;
    return scope;
  }

  function renderScopes(scopes) {
    const fingerprint = JSON.stringify(scopes);
    if (scopeFingerprint === fingerprint) return;
    scopeFingerprint = fingerprint;
    const list = $('#scope-list'); list.replaceChildren();
    if (!scopes.length) {
      list.append(create('p', 'empty-inline', '还没有允许回复的会话。添加一个测试好友，从单次回复开始。'));
      return;
    }
    for (const scope of scopes) {
      const row = create('div', 'scope-item');
      row.append(create('span', 'scope-avatar', scope.id.startsWith('group:') ? '群' : '友'));
      const info = create('div', 'scope-info');
      info.append(create('strong', '', scope.label || scopeLabel(scope.id)), create('small', '', scope.id));
      const label = create('label', 'checkbox-label');
      const input = create('input'); input.type = 'checkbox'; input.checked = Boolean(scope.enabled);
      input.setAttribute('aria-label', `${scope.enabled ? '停用' : '启用'} ${scope.label || scope.id}`);
      input.addEventListener('change', async () => {
        input.disabled = true;
        const result = await mutate('/api/scopes', { id: scope.id, label: scope.label || '', enabled: input.checked }, input.checked ? '此会话已启用，仍需手动开始回复。' : '此会话已停用。');
        if (!result) input.checked = Boolean(scope.enabled);
        input.disabled = false;
      });
      label.append(input, document.createTextNode('允许回复'));
      const remove = create('button', 'remove-button', '移除'); remove.type = 'button';
      remove.setAttribute('aria-label', `移除会话 ${scope.label || scope.id}`);
      remove.addEventListener('click', () => mutate('/api/scopes/' + encodeURIComponent(scope.id), undefined, '已移除回复范围，已有长期记忆请另行管理。', { method: 'DELETE' }));
      row.append(info, label, remove); list.append(row);
    }
  }

  function memoryScopes(memories) {
    const result = new Map([['web:preview', '本机试聊']]);
    for (const item of state.config.scopes || []) result.set(item.id, scopeLabel(item.id));
    for (const item of memories) if (!result.has(item.scope)) result.set(item.scope, scopeLabel(item.scope));
    return result;
  }

  function replaceScopeOptions(select, values, all = false) {
    const prior = select.value;
    select.replaceChildren();
    if (all) { const option = create('option', '', '所有会话'); option.value = 'all'; select.append(option); }
    for (const [id, label] of values) { const option = create('option', '', label); option.value = id; select.append(option); }
    if ([...select.options].some(option => option.value === prior)) select.value = prior;
  }

  function renderMemory(force = false) {
    const memories = Array.isArray(state?.memories) ? state.memories : [];
    const fingerprint = JSON.stringify([memories, state?.config.scopes, memoryStatus, memoryScope]);
    if (!force && memoryFingerprint === fingerprint) return;
    memoryFingerprint = fingerprint;
    const pending = memories.filter(memory => memory.status === 'pending').length;
    const approved = memories.filter(memory => memory.status === 'approved').length;
    $('#memory-total').replaceChildren(document.createTextNode(formatNumber(approved)), create('small', '', '已确认的记忆'));
    setText('#pending-memory-count', formatNumber(pending));
    setText('#memory-nav-count', formatNumber(pending));
    $('#memory-nav-count').hidden = pending === 0;
    const scopes = memoryScopes(memories);
    replaceScopeOptions($('#memory-scope-filter'), scopes, true);
    replaceScopeOptions($('#new-memory-scope'), scopes);
    replaceScopeOptions($('#reset-context-scope'), scopes);
    if ([...$('#memory-scope-filter').options].some(option => option.value === memoryScope)) $('#memory-scope-filter').value = memoryScope;
    else memoryScope = 'all';
    const shown = memories.filter(memory => (memoryStatus === 'all' || memory.status === memoryStatus) && (memoryScope === 'all' || memory.scope === memoryScope));
    const list = $('#memory-list'); list.replaceChildren();
    if (!shown.length) {
      const empty = create('div', 'empty-state');
      empty.append(create('span', 'empty-glyph', '≋'), create('h3', '', memories.length ? '这一页，暂时没有记忆。' : '记忆手册，等你写下第一页。'), create('p', '', memories.length ? '试试其他会话或筛选条件。' : '聊过之后，模型可能提出记忆建议。只有你批准的内容才会成为长期记忆。'));
      list.append(empty); return;
    }
    for (const memory of shown) {
      const card = create('article', 'memory-card' + (memory.status === 'pending' ? ' pending' : ''));
      const top = create('div', 'memory-card-top');
      const label = create('span', '', scopeLabel(memory.scope)); label.title = memory.scope;
      top.append(label, create('span', memory.status === 'pending' ? 'tag pending' : 'tag', memory.status === 'pending' ? '待你确认' : '已确认'));
      const body = create('p', 'memory-content', memory.content);
      const bottom = create('div', 'memory-card-bottom'); bottom.append(create('span', 'memory-time', prettyDate(memory.createdAt, true)));
      if (memory.status === 'pending') {
        const approve = create('button', 'text-button', '记住这件事'); approve.type = 'button';
        approve.addEventListener('click', () => mutate('/api/memories/' + encodeURIComponent(memory.id) + '/approve', {}, '这条记忆已确认，将用于对应会话。'));
        bottom.append(approve);
      }
      const remove = create('button', 'text-button danger-text', memory.status === 'pending' ? '不记得' : '忘记'); remove.type = 'button';
      remove.addEventListener('click', () => {
        if (memory.status === 'approved' && !confirm('删除这条长期记忆？近期聊天上下文可能仍包含相关内容，需要时也可以清空对应上下文。')) return;
        mutate('/api/memories/' + encodeURIComponent(memory.id), undefined, '这条长期记忆已删除。', { method: 'DELETE' });
      });
      bottom.append(remove); card.append(top, body, bottom); list.append(card);
    }
  }

  function renderUsage() {
    const usage = state.usage || {};
    setText('#daily-calls', formatNumber(usage.calls));
    setText('#daily-limit-value', formatNumber(state.config.dailyCallLimit));
    $('#daily-progress').max = Math.max(1, state.config.dailyCallLimit || 100);
    $('#daily-progress').value = Math.max(0, usage.calls || 0);
    setText('#usage-day', usage.day ? `${usage.day} · 每日额度按服务端日期计算` : '服务端尚未返回用量日期。');
    setText('#input-tokens', formatNumber(usage.inputTokens));
    setText('#output-tokens', formatNumber(usage.outputTokens));
    setText('#unknown-usage', formatNumber(usage.unknownUsage));
  }

  function renderEvents() {
    const events = Array.isArray(state.events) ? state.events : [];
    const list = $('#event-list'); list.replaceChildren();
    if (!events.length) { list.append(create('p', 'empty-inline', '这里还很安静。开始连接或试聊后，运行记录会出现在这里。')); return; }
    for (const event of events.slice(0, 30)) {
      const row = create('div', 'event-row');
      row.append(create('span', 'event-indicator' + (['error', 'failed', 'unknown'].includes(event.kind) ? ' error' : '')));
      const copy = create('div', 'event-copy');
      copy.append(create('strong', '', eventNames[event.kind] || event.kind || '运行记录'), create('p', '', typeof event.detail === 'string' ? event.detail : ''));
      const time = create('time', 'event-time', prettyDate(event.at));
      const date = timeValue(event.at); if (date) { time.dateTime = date.toISOString(); time.title = prettyDate(event.at, true); }
      row.append(copy, time); list.append(row);
    }
  }

  async function mutate(path, body, success, { method = 'POST', form, fillForms = false } = {}) {
    if (!serviceReady || (pendingActions > 0 && path !== '/api/pause') || (path === '/api/pause' && pauseInFlight)) return null;
    if (path === '/api/pause') pauseInFlight = true;
    pendingActions += 1; updateButtons();
    if (form) form.setAttribute('aria-busy', 'true');
    try {
      const result = await request(path, { method, body });
      const refreshed = await refresh(fillForms);
      if (success && refreshed) notify(success);
      return result || { ok: true };
    } catch (error) {
      notify(error.message, true);
      if ([0, 401, 403].includes(error.status)) setUnavailable(error);
      return null;
    } finally {
      pendingActions -= 1;
      if (path === '/api/pause') pauseInFlight = false;
      updateButtons();
      if (form) form.removeAttribute('aria-busy');
    }
  }

  function appendPreview(text, kind, label) {
    const list = $('#preview-messages');
    $('.preview-welcome', list)?.remove();
    const bubble = create('div', 'preview-bubble' + (kind ? ' ' + kind : ''));
    if (label) bubble.append(create('span', 'preview-bubble-label', label));
    bubble.append(document.createTextNode(text)); list.append(bubble);
    while (list.children.length > 18) list.firstElementChild.remove();
    list.scrollTop = list.scrollHeight;
  }

  function bind() {
    $$('.nav-button').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
    $$('[data-go]').forEach(button => button.addEventListener('click', () => showView(button.dataset.go)));
    $('#dismiss-toast').addEventListener('click', () => { $('#toast').hidden = true; });
    $('#retry-state').addEventListener('click', () => refresh());
    $('#refresh-events').addEventListener('click', async () => { const result = await refresh(); if (result) notify('运行记录已更新。'); });
    $('#pause-all').addEventListener('click', () => mutate('/api/pause', {}, '已暂停未提交的回复。进行中的模型请求可能仍计费，已提交给 QQ 的消息仍可能送达。'));
    $('#token-form').addEventListener('submit', async event => {
      event.preventDefault();
      token = $('#management-token').value.trim();
      try { sessionStorage.setItem('echo.managementToken', token); } catch { /* In-memory access is sufficient. */ }
      $('#management-token').value = '';
      await refresh();
    });
    $('#bridge-form').addEventListener('submit', async event => {
      event.preventDefault();
      const url = $('#bridge-url').value.trim();
      let parsed;
      try { parsed = new URL(url); } catch { notify('请填写有效的本机 WebSocket 地址。', true); return; }
      if (parsed.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash) { notify('仅接受不带凭证或查询参数的本机 ws:// 地址。', true); return; }
      const expectedAccount = $('#account-id').value.trim();
      if (!/^[1-9][0-9]{4,19}$/.test(expectedAccount)) { notify('请核对 QQ 号，只填写 5–20 位数字。', true); return; }
      await mutate('/api/settings', { bridgeUrl: url, expectedAccount }, '地址与账号已保存，尚未开始回复。', { form: event.target, fillForms: false });
    });
    $('#credential-form').addEventListener('submit', async event => {
      event.preventDefault();
      const body = {};
      const key = $('#deepseek-key').value.trim();
      const bridge = $('#onebot-token').value.trim();
      if (key) body.deepseekKey = key;
      if (bridge) body.onebotToken = bridge;
      if (!Object.keys(body).length) { notify('没有输入新凭证，现有设置保持不变。'); return; }
      const result = await mutate('/api/credentials', body, '本次凭证已配置，自动回复仍需手动开启。', { form: event.target });
      if (result) { $('#deepseek-key').value = ''; $('#onebot-token').value = ''; }
    });
    $('#clear-credentials').addEventListener('click', async () => {
      if (!confirm('清除本次运行的模型和桥接凭证，并暂停回复？重新连接时需再次填写。')) return;
      const result = await mutate('/api/credentials/clear', {}, '运行凭证已清除，回复已暂停。');
      if (result) { $('#deepseek-key').value = ''; $('#onebot-token').value = ''; }
    });
    $('#connect-bridge').addEventListener('click', () => mutate('/api/bridge/connect', {}, '连接请求已完成，请核对页面显示的实际账号。'));
    $('#disconnect-bridge').addEventListener('click', () => mutate('/api/bridge/disconnect', {}, 'QQ 桥接连接已断开。'));
    $('#scope-form').addEventListener('submit', async event => {
      event.preventDefault();
      const number = $('#scope-id').value.trim();
      if (!/^[1-9][0-9]{4,19}$/.test(number)) { notify('请填写有效的好友 QQ 号或群号（5–20 位数字）。', true); return; }
      const id = $('#scope-type').value + ':' + number;
      const result = await mutate('/api/scopes', { id, label: $('#scope-label').value.trim(), enabled: true }, '已添加允许范围。尚未开始回复，请先做单次验收。', { form: event.target });
      if (result) { $('#scope-id').value = ''; $('#scope-label').value = ''; }
    });
    $('#run-once').addEventListener('click', () => mutate('/api/run', { mode: 'once' }, '单次试运行已开启。请让获准好友发新消息，或在获准群内真正 @ 机器人。'));
    $('#run-continuous').addEventListener('click', () => {
      if (!confirm('将只在已启用会话中持续回复，并使用你的 API 额度。确认这些接收者已知情，并开始？')) return;
      mutate('/api/run', { mode: 'continuous' }, '已开始持续回复。右上角可随时暂停。');
    });
    $('#persona-form').addEventListener('submit', async event => {
      event.preventDefault();
      const persona = $('input[name="persona"]:checked')?.value || 'warm';
      await mutate('/api/settings', { name: $('#companion-name').value.trim(), persona, prompt: $('#persona-prompt').value.trim(), maxReplyChars: Number($('#reply-length').value) }, '性格与表达已保存。已确认记忆保持不变。', { form: event.target });
    });
    $('#limits-form').addEventListener('submit', async event => {
      event.preventDefault();
      await mutate('/api/settings', { dailyCallLimit: Number($('#daily-call-limit').value), contextTurns: Number($('#context-turns').value), model: $('#model-name').value.trim() }, '模型与用量设置已保存。', { form: event.target });
    });
    $$('[data-memory-status]').forEach(button => button.addEventListener('click', () => {
      memoryStatus = button.dataset.memoryStatus;
      $$('[data-memory-status]').forEach(item => { item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', item === button ? 'true' : 'false'); });
      if (state) renderMemory(true);
    }));
    $('#memory-scope-filter').addEventListener('change', () => { memoryScope = $('#memory-scope-filter').value; if (state) renderMemory(true); });
    $('#memory-form').addEventListener('submit', async event => {
      event.preventDefault();
      const content = $('#new-memory-content').value.trim();
      if (!content) { notify('先写下一件想让它记住的事。', true); return; }
      const result = await mutate('/api/memories', { scope: $('#new-memory-scope').value, content }, '这条记忆已加入对应会话。', { form: event.target });
      if (result) $('#new-memory-content').value = '';
    });
    $('#context-reset-form').addEventListener('submit', async event => {
      event.preventDefault();
      const scope = $('#reset-context-scope').value;
      if (!confirm(`清空“${scopeLabel(scope)}”的近期对话上下文？已确认的长期记忆会保留；进行中的回复会被暂停。`)) return;
      const result = await mutate('/api/conversations/reset', { scope }, '对应会话的近期上下文已清空，长期记忆保留；回复已暂停。', { form: event.target });
      if (result && scope === 'web:preview') { $('#preview-messages').replaceChildren(); appendPreview('本机试聊的近期上下文已清空。下一句可以重新开始。', '', '本机状态'); }
    });
    $('#preview-live').addEventListener('change', () => {
      const live = $('#preview-live').checked;
      setText('#preview-mode-badge', live ? '真实模型 · 会计费' : '离线演示');
      setText('#preview-cost-note', live ? '会将这段试聊发送给 DeepSeek 并消耗自己的额度；不会向 QQ 发送。' : '当前为离线演示：固定示例回复，不调用模型，不产生费用。');
    });
    $('#preview-form').addEventListener('submit', async event => {
      event.preventDefault();
      if (!serviceReady || pendingActions > 0) return;
      const text = $('#preview-text').value.trim();
      if (!text) return;
      const live = $('#preview-live').checked;
      if (live && !state.setup.hasKey) { notify('请先在“连接 QQ”页配置自己的 DeepSeek API Key。', true); return; }
      pendingActions += 1; updateButtons();
      $('#preview-form').setAttribute('aria-busy', 'true');
      appendPreview(text, 'user', '你 · 本机试聊');
      $('#preview-text').value = '';
      try {
        const result = await request('/api/preview', { method: 'POST', body: { text, mode: live ? 'live' : 'demo' } });
        appendPreview(typeof result.reply === 'string' ? result.reply : '服务未返回可显示的回复。', '', result.mode === 'demo' ? '离线演示 · 固定示例，未调用模型' : `${state.config.name || '回声'} · 真实模型`);
        await refresh();
      } catch (error) {
        appendPreview(error.message, 'error', '本次试聊未完成');
        if ([0, 401, 403].includes(error.status)) setUnavailable(error);
      } finally {
        pendingActions -= 1; updateButtons();
        $('#preview-form').removeAttribute('aria-busy');
      }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }

  readToken();
  bind();
  showView(currentView, false);
  refresh();
  setInterval(() => { if (!document.hidden && pendingActions === 0) refresh(); }, 6000);
})();
