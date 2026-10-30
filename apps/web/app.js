// A0 phone-first web client. Vanilla ES modules; same-origin API with cookies.
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  me: null,
  csrf: '',
  conversations: [],
  currentConversationId: null,
  participants: [],
  selectedParticipantIds: [],
  providers: {},
  projects: [],
  mcp: [],
  attachments: [],
  activeRunId: null,
  spokenAnswers: false,
  comparePanes: new Map(),
  pendingProposals: null,
};

const api = {
  async request(method, path, body, { raw = false } = {}) {
    const headers = {};
    if (body !== undefined && !raw) headers['Content-Type'] = 'application/json';
    if (state.csrf) headers['X-A0-CSRF'] = state.csrf;
    const res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
      credentials: 'same-origin',
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error(data.message || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  get: (path) => api.request('GET', path),
  post: (path, body) => api.request('POST', path, body),
  patch: (path, body) => api.request('PATCH', path, body),
  del: (path) => api.request('DELETE', path),
};

// ---------- Markdown (safe by construction: escape first) ----------
function renderMarkdown(text) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let t = esc(text || '');
  t = t.replace(/```([\s\S]*?)```/g, (m, code) => `<pre>${code.replace(/\n$/, '')}</pre>`);
  t = t.replace(/`([^`\n]+)`/g, (m, code) => `<code>${code}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  t = t.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  return t;
}

// ---------- Views ----------
function showView(name) {
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $(`#view-${name}`)?.classList.remove('hidden');
  $('#drawer')?.classList.remove('open');
  if (name === 'chat') renderConversations();
  if (name === 'providers') loadProviders();
  if (name === 'participants') loadParticipants();
  if (name === 'mcp') loadMcp();
  if (name === 'projects') loadProjects();
  if (name === 'about') loadAbout();
}

// ---------- Bootstrap / auth ----------
async function boot() {
  try {
    const me = await api.get('/api/me');
    state.me = me.user;
    state.csrf = me.csrfToken;
    enterApp();
  } catch (err) {
    if (err.status === 401) showAuth();
    else {
      $('#authTitle').textContent = 'A0 is unavailable';
      $('#authSub').textContent = err.message;
      showView('auth');
    }
  }
}

async function showAuth() {
  showView('auth');
  try {
    const status = await api.get('/api/bootstrap/status');
    if (status.ownerExists) {
      $('#authTitle').textContent = 'Sign in to A0';
      $('#authSub').textContent = 'Enter your owner username and password.';
      $('#setupCodeWrap').classList.add('hidden');
    } else {
      $('#authTitle').textContent = 'Set up A0';
      $('#authSub').textContent = 'Create the owner account with the one-time setup code.';
      $('#setupCodeWrap').classList.remove('hidden');
    }
  } catch {
    // Server unreachable: keep the setup view.
  }
}

async function enterApp() {
  showView('chat');
  await Promise.all([loadConversations(), loadProjects(), loadParticipants(), loadProviders()]);
  bindNav();
}

async function loadConversations() {
  const data = await api.get('/api/conversations');
  state.conversations = data.conversations;
  renderConversations();
}

function renderConversations() {
  const list = $('#conversationList');
  list.innerHTML = '';
  for (const c of state.conversations) {
    const item = document.createElement('div');
    item.className = 'list-item' + (c.id === state.currentConversationId ? ' active' : '');
    item.innerHTML = `<span>${escapeHtml(c.title)}</span><span class="muted">${c.message_count}</span>`;
    item.onclick = () => openConversation(c.id);
    list.appendChild(item);
  }
}

async function openConversation(id) {
  state.currentConversationId = id;
  const data = await api.get(`/api/conversations/${id}`);
  state.conversation = data.conversation;
  renderMessages(data.messages);
  const title = $('#chatTitle');
  title.textContent = data.conversation.title;
  renderContextPolicy(data.conversation.context_policy);
  renderConversations();
  showView('chat');
}

async function newConversation() {
  const data = await api.post('/api/conversations', { title: 'New conversation' });
  await loadConversations();
  await openConversation(data.conversation.id);
}

function renderContextPolicy(policy) {
  const btn = $('#contextPolicyBtn');
  const mode = policy?.mode || 'all';
  btn.textContent = `Context: ${mode === 'all' ? 'All responses' : 'Selected only'}`;
  btn.onclick = async () => {
    if (!state.currentConversationId) return;
    const nextMode = mode === 'all' ? 'selected' : 'all';
    const selectedMessageIds = nextMode === 'selected'
      ? await pickContextMessages()
      : [];
    await api.patch(`/api/conversations/${state.currentConversationId}`, {
      contextPolicy: { mode: nextMode, selectedMessageIds },
    });
    state.conversation.context_policy = { mode: nextMode, selectedMessageIds };
    renderContextPolicy(state.conversation.context_policy);
  };
}

async function pickContextMessages() {
  const data = await api.get(`/api/conversations/${state.currentConversationId}`);
  const assistants = data.messages.filter((m) => m.role === 'assistant');
  if (!assistants.length) return [];
  const chosen = [];
  for (const m of assistants) {
    const ok = confirm(`Include this response in future context?\n\n${m.content.slice(0, 180)}…\n\nOK = include, Cancel = exclude.`);
    if (ok) chosen.push(m.id);
  }
  return chosen;
}

// ---------- Messages ----------
function renderMessages(messages) {
  const box = $('#messages');
  box.innerHTML = '';
  for (const m of messages) box.appendChild(messageElement(m));
  box.scrollTop = box.scrollHeight;
}

function messageElement(m) {
  const el = document.createElement('div');
  el.className = `msg ${m.role}` + (m.status === 'failed' ? ' failed' : '');
  const roleLabel = m.role === 'assistant'
    ? `${m.provider || 'assistant'}${m.model ? ' · ' + m.model : ''}${m.participant_id ? ' · ' + (participantName(m.participant_id) || 'participant') : ''}`
    : m.role;
  let contentHtml = renderMarkdown(m.content || (m.status === 'streaming' ? '…' : ''));
  if (m.status === 'failed') contentHtml += `<div class="error">Failed: ${escapeHtml(m.meta?.error || 'unknown error')}</div>`;
  if (m.status === 'stopped') contentHtml += `<div class="muted">Stopped.</div>`;
  if (m.attachments?.length) {
    contentHtml += `<div class="attachments">${m.attachments.map((a) => a.mime?.startsWith('image/')
      ? `<img src="/api/attachments/${a.id}" alt="${escapeHtml(a.filename)}">`
      : `<a href="/api/attachments/${a.id}" target="_blank">📄 ${escapeHtml(a.filename)}</a>`).join('')}</div>`;
  }
  el.innerHTML = contentHtml;
  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.textContent = `${roleLabel} · ${new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  el.appendChild(meta);
  if (m.role === 'assistant' && state.spokenAnswers && m.status === 'complete') speak(m.content);
  return el;
}

function participantName(id) {
  return state.participants.find((p) => p.id === id)?.name || '';
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- Participants ----------
async function loadParticipants() {
  const data = await api.get('/api/participants');
  state.participants = data.participants;
  if (!state.selectedParticipantIds.length && state.participants.length) {
    const deepseek = state.participants.find((p) => p.provider === 'deepseek');
    state.selectedParticipantIds = [deepseek?.id || state.participants[0].id];
  }
  renderParticipantPicker();
  renderParticipantCards();
}

function renderParticipantPicker() {
  const box = $('#participantPicker');
  box.innerHTML = '';
  for (const p of state.participants) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'participant-pill' + (state.selectedParticipantIds.includes(p.id) ? ' selected' : '');
    pill.textContent = `${p.name}`;
    pill.onclick = () => {
      const idx = state.selectedParticipantIds.indexOf(p.id);
      if (idx >= 0) state.selectedParticipantIds.splice(idx, 1);
      else state.selectedParticipantIds.push(p.id);
      renderParticipantPicker();
    };
    box.appendChild(pill);
  }
}

function renderParticipantCards() {
  const box = $('#participantCards');
  box.innerHTML = '';
  for (const p of state.participants) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${escapeHtml(p.name)}</h3>
      <div class="muted">${escapeHtml(p.provider)} · ${escapeHtml(p.model)}</div>
      <div class="row"><button class="chip danger" data-del="${p.id}">Delete</button></div>`;
    card.querySelector(`[data-del]`).onclick = async () => {
      await api.del(`/api/participants/${p.id}`);
      state.selectedParticipantIds = state.selectedParticipantIds.filter((id) => id !== p.id);
      await loadParticipants();
    };
    box.appendChild(card);
  }
}

// ---------- Providers ----------
async function loadProviders() {
  const data = await api.get('/api/providers');
  state.providers = data.providers;
  renderProviderCards();
}

function renderProviderCards() {
  const box = $('#providerCards');
  box.innerHTML = '';
  for (const [key, p] of Object.entries(state.providers)) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${p.label} ${p.selectedByDefault ? '<span class="ok">(default)</span>' : ''}</h3>
      <div class="muted">${p.hasKey ? '✅ Key configured' : '⚠️ No key configured'} · default model ${escapeHtml(p.defaultModel)}</div>
      <input type="password" placeholder="Paste API key (write-only)" data-key="${key}">
      <div class="row">
        <button class="primary-btn" data-save="${key}">Save key</button>
        <button class="chip danger" data-delete="${key}" ${p.hasKey ? '' : 'disabled'}>Delete</button>
      </div>`;
    card.querySelector(`[data-save]`).onclick = async () => {
      const input = card.querySelector(`[data-key]`);
      await api.request('PUT', `/api/providers/${key}/key`, { apiKey: input.value });
      input.value = '';
      await loadProviders();
    };
    card.querySelector(`[data-delete]`).onclick = async () => {
      await api.del(`/api/providers/${key}/key`);
      await loadProviders();
    };
    box.appendChild(card);
  }
}

// ---------- MCP ----------
async function loadMcp() {
  const data = await api.get('/api/mcp');
  state.mcp = data.connections;
  renderMcpCards();
}

function renderMcpCards() {
  const box = $('#mcpCards');
  box.innerHTML = '';
  for (const c of state.mcp) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${escapeHtml(c.name)}</h3>
      <div class="muted">${escapeHtml(c.url)}</div>
      <div class="muted">Status: ${c.status}${c.last_error ? ` · ${escapeHtml(c.last_error)}` : ''} · ${(c.tools || []).length} tools</div>
      <div class="row">
        <button class="chip" data-discover="${c.id}">Discover</button>
        <button class="chip" data-toggle="${c.id}">${c.enabled ? 'Disable' : 'Enable'}</button>
        <button class="chip danger" data-del="${c.id}">Delete</button>
      </div>`;
    card.querySelector(`[data-discover]`).onclick = async () => {
      try {
        const res = await api.post(`/api/mcp/${c.id}/discover`);
        alert(`Discovered ${res.tools.length} tools.`);
      } catch (err) {
        alert(`Discovery failed: ${err.message}`);
      }
      await loadMcp();
    };
    card.querySelector(`[data-toggle]`).onclick = async () => {
      await api.patch(`/api/mcp/${c.id}`, { enabled: !c.enabled });
      await loadMcp();
    };
    card.querySelector(`[data-del]`).onclick = async () => {
      await api.del(`/api/mcp/${c.id}`);
      await loadMcp();
    };
    box.appendChild(card);
  }
}

// ---------- Projects ----------
async function loadProjects() {
  const data = await api.get('/api/projects');
  state.projects = data.projects;
  renderProjects();
}

function renderProjects() {
  const list = $('#projectList');
  list.innerHTML = '';
  for (const p of state.projects) {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `<span>${escapeHtml(p.name)}</span>`;
    list.appendChild(item);
  }
  const box = $('#projectCards');
  box.innerHTML = '';
  for (const p of state.projects) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${escapeHtml(p.name)}</h3>
      <textarea data-instructions placeholder="Project instructions (shown to models verbatim)">${escapeHtml(p.instructions || '')}</textarea>
      <div class="row">
        <button class="primary-btn" data-save="${p.id}">Save instructions</button>
        <button class="chip danger" data-del="${p.id}">Delete</button>
      </div>`;
    card.querySelector(`[data-save]`).onclick = async () => {
      await api.patch(`/api/projects/${p.id}`, { instructions: card.querySelector('textarea').value });
      await loadProjects();
    };
    card.querySelector(`[data-del]`).onclick = async () => {
      await api.del(`/api/projects/${p.id}`);
      await loadProjects();
    };
    box.appendChild(card);
  }
}

// ---------- About ----------
async function loadAbout() {
  const me = await api.get('/api/me');
  $('#aboutBox').innerHTML = `
    <h3>Harness ${me.harness.version}</h3>
    <p class="muted">Assembly order:</p>
    <ol>${me.harness.assemblyOrder.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
    <pre>${escapeHtml(me.harness.systemPrompt)}</pre>
    <p class="muted">Signed in as ${escapeHtml(me.user.username)}.</p>`;
}

// ---------- Attachments ----------
async function uploadAttachment(file) {
  const fd = new FormData();
  fd.append('file', file);
  const data = await api.request('POST', '/api/attachments', fd, { raw: true });
  state.attachments.push(data.attachment);
  renderAttachmentChips();
}

function renderAttachmentChips() {
  const box = $('#attachmentChips');
  box.innerHTML = '';
  for (const a of state.attachments) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${a.mime.startsWith('image/') ? '🖼️' : '📄'} ${escapeHtml(a.filename)} <a href="#" data-rm="${a.id}" style="color:var(--danger)">✕</a>`;
    chip.querySelector(`[data-rm]`).onclick = (e) => {
      e.preventDefault();
      state.attachments = state.attachments.filter((x) => x.id !== a.id);
      renderAttachmentChips();
    };
    box.appendChild(chip);
  }
}

// ---------- Streaming run ----------
async function sendMessage(content) {
  if (!state.currentConversationId) await newConversation();
  const conversationId = state.currentConversationId;
  const participantIds = state.selectedParticipantIds.length ? state.selectedParticipantIds : [state.participants[0]?.id].filter(Boolean);
  if (!participantIds.length) {
    alert('Create a participant first (Settings → Participants).');
    return;
  }
  const mode = participantIds.length > 1 ? 'compare' : 'single';
  const body = {
    mode,
    participantIds,
    message: { content, attachmentIds: state.attachments.map((a) => a.id) },
  };
  state.attachments = [];
  renderAttachmentChips();
  $('#composerInput').value = '';
  autoGrow();

  // Append optimistic user message.
  const box = $('#messages');
  const userEl = document.createElement('div');
  userEl.className = 'msg user';
  userEl.innerHTML = renderMarkdown(content);
  box.appendChild(userEl);
  box.scrollTop = box.scrollHeight;

  const compareWrap = $('#compareWrap');
  compareWrap.classList.add('hidden');
  compareWrap.innerHTML = '';
  state.comparePanes.clear();

  showTyping(true);
  const res = await fetch(`/api/conversations/${conversationId}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-A0-CSRF': state.csrf },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  showTyping(false);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.message || 'Run failed to start.');
    await openConversation(conversationId);
    return;
  }
  state.activeRunId = null;
  await readSseStream(res, conversationId, mode);
  await openConversation(conversationId);
}

function showTyping(on) {
  $('#typingBar').classList.toggle('hidden', !on);
  $('#typingText').textContent = on ? 'Working…' : '';
}

async function readSseStream(res, conversationId, mode) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const messageEls = new Map(); // participantId -> message element (for live update)
  const paneEls = new Map();

  const appendLiveMessage = (participantId, name) => {
    const box = $('#messages');
    const el = document.createElement('div');
    el.className = 'msg assistant';
    el.innerHTML = `<div class="pane-body" data-live="${participantId}"></div><div class="msg-meta">${escapeHtml(name)}</div>`;
    box.appendChild(el);
    messageEls.set(participantId, el.querySelector(`[data-live]`));
  };

  const ensurePane = (participantId, name) => {
    if (!paneEls.has(participantId)) {
      const wrap = $('#compareWrap');
      wrap.classList.remove('hidden');
      const pane = document.createElement('div');
      pane.className = 'compare-pane';
      pane.innerHTML = `<h4>${escapeHtml(name)}</h4><div class="pane-body"></div>`;
      wrap.appendChild(pane);
      paneEls.set(participantId, pane.querySelector('.pane-body'));
    }
    return paneEls.get(participantId);
  };

  let pendingEvent = 'message';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line;
      if (trimmed.startsWith('event:')) {
        pendingEvent = trimmed.slice(6).trim();
        continue;
      }
      if (!trimmed.startsWith('data:')) continue;
      const raw = trimmed.slice(5).trim();
      if (!raw) { pendingEvent = 'message'; continue; }
      let payload;
      try { payload = JSON.parse(raw); } catch { continue; }
      handleSseEvent(pendingEvent, payload, { mode, appendLiveMessage, ensurePane, messageEls, paneEls });
      pendingEvent = 'message';
    }
  }
}

function handleSseEvent(event, payload, ctx) {
  const { mode, appendLiveMessage, ensurePane } = ctx;
  if (event === 'run_start') {
    state.activeRunId = payload.runId;
    for (const p of payload.participants) {
      if (mode === 'compare') ensurePane(p.id, `${p.name} · ${p.model}`);
      else appendLiveMessage(p.id, `${p.name} · ${p.model}`);
    }
  } else if (event === 'chunk') {
    const pane = ctx.paneEls.get(payload.participantId);
    if (pane) {
      pane.innerHTML = renderMarkdown((pane.dataset.text || '') + payload.text);
      pane.dataset.text = (pane.dataset.text || '') + payload.text;
      pane.scrollTop = pane.scrollHeight;
    } else {
      const live = ctx.messageEls.get(payload.participantId);
      if (live) {
        live.innerHTML = renderMarkdown((live.dataset.text || '') + payload.text);
        live.dataset.text = (live.dataset.text || '') + payload.text;
      }
    }
    $('#messages').scrollTop = $('#messages').scrollHeight;
  } else if (event === 'participant_done') {
    if (payload.status === 'failed') {
      const pane = ctx.paneEls.get(payload.participantId);
      if (pane) pane.innerHTML += `<div class="error">Failed: ${escapeHtml(payload.error || 'error')}</div>`;
      else {
        const live = ctx.messageEls.get(payload.participantId);
        if (live) live.innerHTML += `<div class="error">Failed: ${escapeHtml(payload.error || 'error')}</div>`;
      }
    }
  } else if (event === 'tool_proposals') {
    state.pendingProposals = payload.proposals;
    showToolModal(payload.proposals);
  } else if (event === 'tool_result') {
    const msg = `Tool ${payload.toolName}: ${payload.status}${payload.error ? ' — ' + payload.error : ''}${payload.text ? '\n' + payload.text : ''}`;
    const box = $('#messages');
    const el = document.createElement('div');
    el.className = 'msg tool';
    el.innerHTML = renderMarkdown(msg);
    box.appendChild(el);
  } else if (event === 'run_complete' || event === 'run_error' || event === 'tools_cancelled') {
    state.activeRunId = null;
    state.pendingProposals = null;
    hideToolModal();
  }
}

// ---------- Tool authorization ----------
function showToolModal(proposals) {
  const modal = $('#toolModal');
  modal.classList.remove('hidden');
  const list = $('#toolProposalList');
  list.innerHTML = '';
  for (const p of proposals) {
    const row = document.createElement('label');
    row.className = 'tool-proposal';
    row.innerHTML = `
      <input type="checkbox" data-id="${p.id}" checked>
      <div>
        <div><strong>${escapeHtml(p.toolName)}</strong> <span class="muted">requested by ${escapeHtml(participantName(p.participantId) || p.participantId)}</span></div>
        <pre>${escapeHtml(JSON.stringify(p.arguments, null, 2))}</pre>
      </div>`;
    list.appendChild(row);
  }
  $('#toolAllBtn').onclick = async () => {
    const ids = proposals.map((p) => p.id);
    await authorizeTools(ids);
  };
  $('#toolSelectedBtn').onclick = async () => {
    const ids = [...list.querySelectorAll('input:checked')].map((i) => i.dataset.id);
    await authorizeTools(ids);
  };
  $('#toolNoneBtn').onclick = async () => {
    await api.post(`/api/runs/${state.activeRunId}/tool-authorize`, { actionIds: [], cancel: true });
    hideToolModal();
  };
}

async function authorizeTools(ids) {
  await api.post(`/api/runs/${state.activeRunId}/tool-authorize`, { actionIds: ids, cancel: false });
  hideToolModal();
}

function hideToolModal() {
  $('#toolModal').classList.add('hidden');
}

// ---------- Voice (dictation + spoken responses) ----------
let recognition = null;
let recognizing = false;

function initVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    $('#voiceBtn').disabled = true;
    $('#voiceBtn').title = 'Speech recognition is not available in this browser.';
    return;
  }
  recognition = new SR();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.onresult = (event) => {
    let finalText = '';
    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) finalText += res[0].transcript;
      else interimText += res[0].transcript;
    }
    const input = $('#composerInput');
    input.value = (input.dataset.dictated || '') + finalText + (interimText ? ' ' + interimText : '');
    if (finalText) input.dataset.dictated = (input.dataset.dictated || '') + finalText;
    autoGrow();
  };
  recognition.onend = () => {
    recognizing = false;
    $('#voiceStatus').classList.add('hidden');
    $('#voiceBtn').textContent = '🎤';
  };
  recognition.onerror = (event) => {
    recognizing = false;
    $('#voiceStatus').classList.add('hidden');
    $('#voiceStatus').textContent = `Voice error: ${event.error}`;
    $('#voiceBtn').textContent = '🎤';
  };
  $('#voiceBtn').onclick = () => {
    if (recognizing) {
      recognition.stop();
      return;
    }
    $('#composerInput').dataset.dictated = $('#composerInput').value;
    $('#voiceStatus').textContent = 'Listening… speak now.';
    $('#voiceStatus').classList.remove('hidden');
    $('#voiceBtn').textContent = '⏹';
    recognizing = true;
    recognition.start();
  };
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const clean = text.replace(/```[\s\S]*?```/g, ' code block omitted ').replace(/[#*_`>]/g, '').slice(0, 1500);
  const u = new SpeechSynthesisUtterance(clean);
  u.rate = 1.02;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ---------- UI wiring ----------
function bindNav() {
  $$('.nav-btn').forEach((btn) => {
    btn.onclick = () => showView(btn.dataset.view);
  });
  $('#menuBtn').onclick = () => $('#drawer').classList.toggle('open');
  $('#logoutBtn').onclick = async () => {
    await api.post('/api/auth/logout', {});
    location.reload();
  };
  $('#newChatBtn').onclick = newConversation;
  $('#voiceReadBtn').onclick = () => {
    state.spokenAnswers = !state.spokenAnswers;
    $('#voiceReadBtn').textContent = state.spokenAnswers ? '🔊' : '🔇';
    if (!state.spokenAnswers && 'speechSynthesis' in window) speechSynthesis.cancel();
  };
}

function autoGrow() {
  const ta = $('#composerInput');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
}

async function bindForms() {
  $('#authForm').onsubmit = async (e) => {
    e.preventDefault();
    const username = $('#authUsername').value.trim();
    const password = $('#authPassword').value;
    const setupCode = $('#authSetupCode').value;
    try {
      const status = await api.get('/api/bootstrap/status');
      if (status.ownerExists) {
        await api.post('/api/auth/login', { username, password });
      } else {
        await api.post('/api/bootstrap/setup', { username, password, setupCode });
      }
      location.reload();
    } catch (err) {
      $('#authError').textContent = err.message;
      $('#authError').classList.remove('hidden');
    }
  };

  $('#composerForm').onsubmit = (e) => {
    e.preventDefault();
    const content = $('#composerInput').value.trim();
    if (!content && !state.attachments.length) return;
    sendMessage(content || '');
  };
  $('#composerInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('#composerForm').requestSubmit();
    }
  });
  $('#composerInput').addEventListener('input', autoGrow);
  $('#stopBtn').onclick = async () => {
    if (state.activeRunId) await api.post(`/api/runs/${state.activeRunId}/stop`, {});
    showTyping(false);
  };
  $('#attachBtn').onclick = () => $('#fileInput').click();
  $('#fileInput').onchange = async () => {
    for (const file of $('#fileInput').files) await uploadAttachment(file);
    $('#fileInput').value = '';
  };
  $('#seedParticipantsBtn').onclick = async () => {
    await api.post('/api/participants/seed-defaults', {});
    await loadParticipants();
  };
  $('#participantForm').onsubmit = async (e) => {
    e.preventDefault();
    await api.post('/api/participants', {
      name: $('#pName').value.trim() || undefined,
      provider: $('#pProvider').value,
      model: $('#pModel').value.trim() || undefined,
    });
    $('#pName').value = ''; $('#pModel').value = '';
    await loadParticipants();
  };
  $('#mcpForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/mcp', {
        name: $('#mcpName').value,
        url: $('#mcpUrl').value,
        authType: $('#mcpAuth').value ? 'bearer' : 'none',
        authHeader: $('#mcpAuth').value || undefined,
        allowPrivateNetwork: $('#mcpPrivate').checked,
      });
      $('#mcpName').value = ''; $('#mcpUrl').value = ''; $('#mcpAuth').value = '';
      await loadMcp();
    } catch (err) {
      alert(err.message);
    }
  };
  $('#projectForm').onsubmit = async (e) => {
    e.preventDefault();
    await api.post('/api/projects', { name: $('#projectName').value });
    $('#projectName').value = '';
    await loadProjects();
  };
  $('#passwordForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.patch('/api/me/password', {
        currentPassword: $('#currentPassword').value,
        newPassword: $('#newPassword').value,
      });
      alert('Password changed. Other sessions were signed out; please sign in again.');
      location.reload();
    } catch (err) {
      alert(err.message);
    }
  };
}

boot().then(() => {
  bindForms();
  initVoice();
});
