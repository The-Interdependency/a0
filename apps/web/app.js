// A0 phone-first web client. Vanilla ES modules; same-origin API with cookies.
import { renderMarkdown } from './markdown.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  me: null,
  csrf: '',
  conversations: [],
  currentConversationId: null,
  currentConversation: null,
  participants: [],
  selectedParticipantIds: [],
  providers: {},
  projects: [],
  mcp: [],
  activeProjectId: null,
  attachments: [],
  spokenAnswers: false,
  speechToken: 0,
  activeRun: null, // { runId, conversationId }
  pendingProposals: null,
  pendingSwitch: null, // { participantIds }
  draft: null, // { content, attachmentIds, clientRequestId }
};

function toast(message, isError = false) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = 'toast' + (isError ? ' error' : '');
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 4000);
}

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

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'list-item' + (c.id === state.currentConversationId ? ' active' : '');
    const title = document.createElement('span');
    title.textContent = c.title;
    const count = document.createElement('span');
    count.className = 'muted';
    count.textContent = c.message_count;
    item.append(title, count);
    item.setAttribute('aria-label', `Open conversation ${c.title}`);
    item.onclick = () => openConversation(c.id);
    list.appendChild(item);
  }
}

async function openConversation(id) {
  clearConversationView();
  state.currentConversationId = id;
  const data = await api.get(`/api/conversations/${id}`);
  state.currentConversation = data.conversation;
  state.currentConversation.message_count = data.messageCount || 0; // C03 authoritative
  state.activeProjectId = data.conversation.project_id || null;
  renderMessages(data.messages);
  $('#chatTitle').textContent = data.conversation.title;
  renderContextPolicy(data.conversation.context_policy);
  renderChatProjectSelector();
  renderConversations();
  showView('chat');
}

function clearConversationView() {
  $('#compareWrap').classList.add('hidden');
  $('#compareWrap').innerHTML = '';
  $('#messages').innerHTML = '';
  showTyping(false);
  state.activeRun = null;
  state.pendingProposals = null;
  hideToolModal();
  hideSwitchModal();
}

async function newConversation() {
  const body = { title: 'New conversation' };
  if (state.activeProjectId) body.projectId = state.activeProjectId;
  const data = await api.post('/api/conversations', body);
  await loadConversations();
  await openConversation(data.conversation.id);
}

function renderContextPolicy(policy) {
  const btn = $('#contextPolicyBtn');
  const mode = policy?.mode || 'all';
  btn.textContent = `Context: ${mode === 'all' ? 'All responses' : 'Selected only'}`;
  btn.onclick = () => openContextSelection();
}

async function openContextSelection() {
  if (!state.currentConversationId) return;
  const data = await api.get(`/api/conversations/${state.currentConversationId}`);
  const assistants = data.messages.filter((m) => m.role === 'assistant');
  const policy = data.conversation.context_policy || { mode: 'all', selectedMessageIds: [] };
  const modal = $('#contextModal');
  modal.classList.remove('hidden');
  const list = $('#contextSelectionList');
  list.innerHTML = '';
  if (!assistants.length) {
    list.innerHTML = '<p class="muted">No assistant responses to select yet.</p>';
  }
  const selected = new Set(policy.selectedMessageIds || []);
  for (const m of assistants) {
    const label = document.createElement('label');
    label.className = 'tool-proposal';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.id = m.id;
    checkbox.checked = policy.mode === 'all' || selected.has(m.id);
    const info = document.createElement('div');
    const attribution = `${m.provider || 'assistant'}${m.model ? ' · ' + m.model : ''}${m.participant_id ? ' · ' + (participantName(m.participant_id) || 'participant') : ''} · ${new Date(m.created_at).toLocaleString()}`;
    info.innerHTML = `<strong>${escapeHtml(attribution)}</strong><p class="muted">${escapeHtml((m.content || '').slice(0, 400))}</p>`;
    label.append(checkbox, info);
    list.appendChild(label);
  }
  $('#contextSaveBtn').onclick = async () => {
    const ids = [...list.querySelectorAll('input:checked')].map((i) => i.dataset.id);
    await api.patch(`/api/conversations/${state.currentConversationId}`, {
      contextPolicy: { mode: 'selected', selectedMessageIds: ids },
    });
    state.currentConversation.context_policy = { mode: 'selected', selectedMessageIds: ids };
    renderContextPolicy(state.currentConversation.context_policy);
    hideContextModal();
  };
  $('#contextAllBtn').onclick = async () => {
    await api.patch(`/api/conversations/${state.currentConversationId}`, {
      contextPolicy: { mode: 'all', selectedMessageIds: [] },
    });
    state.currentConversation.context_policy = { mode: 'all', selectedMessageIds: [] };
    renderContextPolicy(state.currentConversation.context_policy);
    hideContextModal();
  };
  $('#contextCancelBtn').onclick = hideContextModal;
}

function hideContextModal() {
  $('#contextModal').classList.add('hidden');
}

function renderChatProjectSelector() {
  const sel = $('#chatProjectSelect');
  sel.innerHTML = '<option value="">No project</option>';
  for (const p of state.projects) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === state.activeProjectId) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.onchange = async () => {
    const projectId = sel.value || null;
    await api.patch(`/api/conversations/${state.currentConversationId}`, { projectId });
    state.activeProjectId = projectId;
    state.currentConversation.project_id = projectId;
    toast(projectId ? 'Conversation moved to project.' : 'Conversation removed from project.');
    await loadProjects();
  };
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
  const body = document.createElement('div');
  body.className = 'msg-body';
  body.innerHTML = renderMarkdown(m.content || (m.status === 'streaming' ? '…' : ''));
  el.appendChild(body);
  if (m.status === 'failed') {
    const err = document.createElement('div');
    err.className = 'error';
    err.textContent = 'Failed: ' + (m.meta?.error || 'unknown error');
    el.appendChild(err);
  }
  if (m.status === 'stopped') {
    const s = document.createElement('div');
    s.className = 'muted';
    s.textContent = 'Stopped.';
    el.appendChild(s);
  }
  if (m.attachments?.length) {
    const atts = document.createElement('div');
    atts.className = 'attachments';
    for (const a of m.attachments) {
      if (a.mime?.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = `/api/attachments/${a.id}`;
        img.alt = a.filename;
        img.loading = 'lazy';
        atts.appendChild(img);
      } else {
        const link = document.createElement('a');
        link.href = `/api/attachments/${a.id}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `📄 ${a.filename}`;
        atts.appendChild(link);
      }
    }
    el.appendChild(atts);
  }
  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const roleLabel = m.role === 'assistant'
    ? `${m.provider || 'assistant'}${m.model ? ' · ' + m.model : ''}${m.participant_id ? ' · ' + (participantName(m.participant_id) || 'participant') : ''}`
    : m.role;
  meta.textContent = `${roleLabel} · ${new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  if (m.role === 'assistant' && m.status === 'complete' && m.content) {
    const speakBtn = document.createElement('button');
    speakBtn.type = 'button';
    speakBtn.className = 'icon-btn msg-speak';
    speakBtn.textContent = '🔊';
    speakBtn.setAttribute('aria-label', 'Speak this answer');
    speakBtn.onclick = () => speak(m.content);
    meta.appendChild(speakBtn);
  }
  el.appendChild(meta);
  return el;
}

function participantName(id) {
  return state.participants.find((p) => p.id === id)?.name || '';
}

// ---------- Participants ----------
async function loadParticipants() {
  const data = await api.get('/api/participants');
  state.participants = data.participants;
  if (!state.selectedParticipantIds.length && state.participants.length) {
    const deepseek = state.participants.find((p) => p.provider === 'deepseek') || state.participants[0];
    state.selectedParticipantIds = [deepseek.id];
    toast(`Default participant: ${deepseek.name}`);
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
    pill.textContent = `${p.name} · ${p.model}`;
    pill.setAttribute('aria-pressed', String(state.selectedParticipantIds.includes(p.id)));
    pill.onclick = () => toggleParticipant(p.id);
    box.appendChild(pill);
  }
}

function toggleParticipant(id) {
  const idx = state.selectedParticipantIds.indexOf(id);
  const next = [...state.selectedParticipantIds];
  if (idx >= 0) next.splice(idx, 1);
  else next.push(id);
  // C03: authoritative history presence from the conversation detail response.
  const conversationHasMessages = (state.currentConversation?.message_count ?? 0) > 0;
  if (state.currentConversationId && conversationHasMessages) {
    state.pendingSwitch = { participantIds: next };
    showSwitchModal(next);
    return;
  }
  state.selectedParticipantIds = next;
  renderParticipantPicker();
}

function showSwitchModal(nextIds) {
  $('#switchModal').classList.remove('hidden');
  const names = nextIds.map((id) => participantName(id) || id).join(', ');
  $('#switchTarget').textContent = names || '(none)';
  $('#switchNewBtn').onclick = async () => {
    hideSwitchModal();
    state.selectedParticipantIds = nextIds.length ? nextIds : state.selectedParticipantIds;
    state.lastMode = 'new';
    localStorage.setItem('a0.lastMode', 'new');
    renderParticipantPicker();
    await newConversation();
  };
  $('#switchContinueBtn').onclick = () => {
    // C03: Continue is ONE selected model with full intended context.
    const singleId = nextIds[0] || state.selectedParticipantIds[0] || (state.participants[0] && state.participants[0].id);
    if (!singleId) { toast('Select a participant first.', true); return; }
    hideSwitchModal();
    state.selectedParticipantIds = [singleId];
    state.lastMode = 'continue';
    localStorage.setItem('a0.lastMode', 'continue');
    renderParticipantPicker();
    toast('Continue with the selected participant (full intended context).');
  };
  $('#switchCompareBtn').onclick = () => {
    // C03: Compare is explicitly selected participants (>=2), same semantic context.
    if (nextIds.length < 2) { toast('Select at least two participants to compare.', true); return; }
    hideSwitchModal();
    state.selectedParticipantIds = nextIds;
    state.lastMode = 'compare';
    localStorage.setItem('a0.lastMode', 'compare');
    renderParticipantPicker();
    toast('Compare models with the selected participants.');
  };
  $('#switchCancelBtn').onclick = () => {
    hideSwitchModal();
    renderParticipantPicker();
  };
}

function hideSwitchModal() {
  $('#switchModal').classList.add('hidden');
}

function renderParticipantCards() {
  const box = $('#participantCards');
  box.innerHTML = '';
  for (const p of state.participants) {
    const card = document.createElement('div');
    card.className = 'card';
    const h = document.createElement('h3');
    h.textContent = p.name;
    const sub = document.createElement('div');
    sub.className = 'muted';
    sub.textContent = `${p.provider} · ${p.model}`;
    const row = document.createElement('div');
    row.className = 'row';
    // C01/OC02: model editing for every provider. OpenAI uses the catalogue
    // select (with the saved value shown accurately); others use a text input
    // for valid custom IDs with provider-wide capability validation.
    const models = p.provider === 'openai' ? state.providers?.openai?.models : null;
    if (models?.length) {
      const sel = document.createElement('select');
      sel.className = 'select';
      sel.setAttribute('aria-label', `Model for ${p.name}`);
      const savedKnown = models.some((m) => m.id === p.model);
      if (!savedKnown) {
        const cur = document.createElement('option');
        cur.value = p.model;
        cur.textContent = `${p.model} (current)`;
        cur.selected = true;
        sel.appendChild(cur);
      }
      for (const m of models) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `${m.id} · ${m.label}`;
        if (m.id === p.model) opt.selected = true;
        sel.appendChild(opt);
      }
      const upgrade = document.createElement('button');
      upgrade.type = 'button';
      upgrade.className = 'primary-btn';
      upgrade.textContent = 'Upgrade model';
      upgrade.onclick = async () => {
        try {
          await api.request('POST', `/api/participants/${p.id}/upgrade-model`, { model: sel.value });
          toast(`Upgraded ${p.name} to ${sel.value} (identity/history preserved).`);
          await loadParticipants();
        } catch (err) {
          toast(err.message, true);
        }
      };
      const test = document.createElement('button');
      test.type = 'button';
      test.className = 'chip';
      test.textContent = 'Test this model';
      test.onclick = async () => {
        try {
          const res = await api.request('POST', `/api/providers/${p.provider}/test`, { model: sel.value, settings: p.settings || {} });
          toast(`${sel.value} test: ${res.ok ? 'PASS' : 'FAIL'} · ${res.message || res.finishReason || ''}`);
        } catch (err) {
          toast(`${sel.value} test failed: ${err.message}`, true);
        }
      };
      row.append(sel, upgrade, test);
    } else {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = p.model;
      input.setAttribute('aria-label', `Model ID for ${p.name}`);
      input.placeholder = 'Model ID';
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'primary-btn';
      save.textContent = 'Save model';
      save.onclick = async () => {
        try {
          await api.patch(`/api/participants/${p.id}`, { model: input.value.trim() });
          toast(`Saved model ${input.value.trim()} for ${p.name}.`);
          await loadParticipants();
        } catch (err) {
          toast(err.message, true);
        }
      };
      row.append(input, save);
    }
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'chip danger';
    del.textContent = 'Delete';
    del.onclick = async () => {
      try {
        await api.del(`/api/participants/${p.id}`);
        state.selectedParticipantIds = state.selectedParticipantIds.filter((id) => id !== p.id);
        await loadParticipants();
      } catch (err) {
        toast(err.message, true);
      }
    };
    row.appendChild(del);
    card.append(h, sub, status, tools, row);
    box.appendChild(card);
  }
}

// ---------- Providers ----------
async function loadProviders() {
  const data = await api.get('/api/providers');
  state.providers = data.providers;
  renderProviderCards();
  renderParticipantCards(); // C01: controls must not depend on load order
}

function renderProviderCards() {
  const box = $('#providerCards');
  box.innerHTML = '';
  for (const [key, p] of Object.entries(state.providers)) {
    const card = document.createElement('div');
    card.className = 'card';
    const h = document.createElement('h3');
    h.innerHTML = `${escapeHtml(p.label)} ${p.selectedByDefault ? '<span class="ok">(default)</span>' : ''}`;
    const sub = document.createElement('div');
    sub.className = 'muted';
    sub.textContent = `${p.hasKey ? '✅ Key configured' : '⚠️ No key configured'} · default model ${p.defaultModel}`;
    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'Paste API key (write-only)';
    input.autocomplete = 'off';
    const row = document.createElement('div');
    row.className = 'row';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'primary-btn';
    save.textContent = 'Save key';
    save.onclick = async () => {
      try {
        await api.request('PUT', `/api/providers/${key}/key`, { apiKey: input.value });
        input.value = '';
        toast(`${p.label} key stored in OpenBao.`);
        await loadProviders();
      } catch (err) {
        toast(err.message, true);
      }
    };
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'chip danger';
    del.textContent = 'Delete';
    del.disabled = !p.hasKey;
    del.onclick = async () => {
      try {
        await api.del(`/api/providers/${key}/key`);
        toast(`${p.label} key deleted.`);
        await loadProviders();
      } catch (err) {
        toast(err.message, true);
      }
    };
    const test = document.createElement('button');
    test.type = 'button';
    test.className = 'chip';
    test.textContent = 'Test request';
    test.disabled = !p.hasKey;
    test.onclick = async () => {
      toast(`Testing ${p.label}…`);
      try {
        const res = await api.post(`/api/providers/${key}/test`);
        toast(`${p.label}: ${res.ok ? 'OK' : 'failed'} — ${res.message || ''}`, !res.ok);
      } catch (err) {
        toast(err.message, true);
      }
    };
    row.append(save, del, test);
    card.append(h, sub, input, row);
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
    const h = document.createElement('h3');
    h.textContent = c.name;
    const sub = document.createElement('div');
    sub.className = 'muted';
    sub.textContent = `${c.url}`;
    const status = document.createElement('div');
    status.className = 'muted';
    status.textContent = `Status: ${c.status}${c.last_error ? ` · ${c.last_error}` : ''} · ${(c.tools || []).length} tools`;
    const tools = document.createElement('div');
    tools.className = 'muted context-preview';
    tools.textContent = (c.tools || []).map((t) => `${t.name}: ${t.description || 'no description'}`).join(' · ') || 'No tools discovered yet.';
    const row = document.createElement('div');
    row.className = 'row';
    for (const [label, fn] of [
      ['Discover', async () => {
        try {
          const res = await api.post(`/api/mcp/${c.id}/discover`);
          toast(`Discovered ${res.tools.length} tools.`);
        } catch (err) {
          toast(`Discovery failed: ${err.message}`, true);
        }
        await loadMcp();
      }],
      [c.enabled ? 'Disable' : 'Enable', async () => {
        await api.patch(`/api/mcp/${c.id}`, { enabled: !c.enabled });
        await loadMcp();
      }],
      ['Delete', async () => {
        await api.del(`/api/mcp/${c.id}`);
        await loadMcp();
      }],
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (label === 'Delete' ? ' danger' : '');
      b.textContent = label;
      b.onclick = fn;
      row.appendChild(b);
    }
    card.append(h, sub, status, row);
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
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'list-item' + (p.id === state.activeProjectId ? ' active' : '');
    item.innerHTML = `<span>${escapeHtml(p.name)}</span>`;
    item.setAttribute('aria-label', `Select project ${p.name}`);
    item.onclick = () => {
      state.activeProjectId = p.id;
      toast(`Project "${p.name}" selected for the next new conversation.`);
      renderProjects();
    };
    list.appendChild(item);
  }
  const box = $('#projectCards');
  box.innerHTML = '';
  for (const p of state.projects) {
    const card = document.createElement('div');
    card.className = 'card';
    const h = document.createElement('h3');
    h.textContent = p.name;
    const ta = document.createElement('textarea');
    ta.placeholder = 'Project instructions (shown to models verbatim)';
    ta.value = p.instructions || '';
    const row = document.createElement('div');
    row.className = 'row';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'primary-btn';
    save.textContent = 'Save instructions';
    save.onclick = async () => {
      try {
        await api.patch(`/api/projects/${p.id}`, { instructions: ta.value });
        toast('Project instructions saved.');
        await loadProjects();
      } catch (err) {
        toast(err.message, true);
      }
    };
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'chip danger';
    del.textContent = 'Delete';
    del.onclick = async () => {
      try {
        await api.del(`/api/projects/${p.id}`);
        if (state.activeProjectId === p.id) state.activeProjectId = null;
        await loadProjects();
      } catch (err) {
        toast(err.message, true);
      }
    };
    row.append(save, del);
    card.append(h, ta, row);
    box.appendChild(card);
  }
}

// ---------- About ----------
async function loadAbout() {
  const me = await api.get('/api/me');
  const box = $('#aboutBox');
  box.innerHTML = '';
  const h = document.createElement('h3');
  h.textContent = `Harness ${me.harness.version}`;
  const orderTitle = document.createElement('p');
  orderTitle.className = 'muted';
  orderTitle.textContent = 'Assembly order:';
  const ol = document.createElement('ol');
  for (const s of me.harness.assemblyOrder) {
    const li = document.createElement('li');
    li.textContent = s;
    ol.appendChild(li);
  }
  const pre = document.createElement('pre');
  pre.textContent = me.harness.systemPrompt;
  const voice = document.createElement('p');
  voice.className = 'muted';
  voice.textContent = 'Voice uses the browser SpeechRecognition and speechSynthesis APIs. Depending on the browser, recognition audio may be sent to the browser vendor\'s speech service (Chrome can send it to Google servers); A0 does not verify or claim local/offline processing. Microphone permission is controlled by the browser.';
  const who = document.createElement('p');
  who.className = 'muted';
  who.textContent = `Signed in as ${me.user.username}.`;
  box.append(h, orderTitle, ol, pre, voice, who);
}

// ---------- Attachments ----------
async function uploadAttachment(file) {
  try {
    const fd = new FormData();
    fd.append('file', file);
    const data = await api.request('POST', '/api/attachments', fd, { raw: true });
    state.attachments.push(data.attachment);
    renderAttachmentChips();
  } catch (err) {
    toast(`Upload failed: ${err.message}`, true);
  }
}

function renderAttachmentChips() {
  const box = $('#attachmentChips');
  box.innerHTML = '';
  for (const a of state.attachments) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const label = document.createElement('span');
    label.textContent = `${a.mime.startsWith('image/') ? '🖼️' : '📄'} ${a.filename}`;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'chip-x';
    rm.textContent = '✕';
    rm.setAttribute('aria-label', `Remove ${a.filename}`);
    rm.onclick = () => {
      state.attachments = state.attachments.filter((x) => x.id !== a.id);
      renderAttachmentChips();
    };
    chip.append(label, rm);
    box.appendChild(chip);
  }
}

// ---------- Draft preservation ----------
function saveDraft(content) {
  state.draft = {
    content,
    // C13: preserve complete attachment descriptors, not bare ids.
    attachments: state.attachments.map((a) => ({ ...a })),
    attachmentIds: state.attachments.map((a) => a.id),
    clientRequestId: crypto.randomUUID(),
  };
}

function restoreDraft() {
  if (!state.draft) return;
  $('#composerInput').value = state.draft.content;
  autoGrow();
  // C13: restore complete descriptors; tolerate legacy {id}-only drafts.
  state.attachments = (state.draft.attachments || (state.draft.attachmentIds || []).map((id) => ({ id }))).map((a) => ({ ...a }));
  renderAttachmentChips();
  const retry = $('#retryBar');
  retry.classList.remove('hidden');
  $('#retryText').textContent = 'Your draft is preserved.';
}

function clearDraft() {
  state.draft = null;
  $('#retryBar').classList.add('hidden');
}

// ---------- Streaming run ----------
async function sendMessage(content) {
  if (!state.currentConversationId) await newConversation();
  const conversationId = state.currentConversationId;
  if (!state.selectedParticipantIds.length) {
    toast('Select a participant before sending.', true);
    return;
  }
  const participantIds = [...state.selectedParticipantIds];
  const savedMode = state.lastMode || localStorage.getItem('a0.lastMode') || null;
  let mode = savedMode === 'compare' ? 'compare' : savedMode === 'continue' ? 'single' : (participantIds.length > 1 ? 'compare' : 'single');
  if (mode === 'compare' && participantIds.length < 2) mode = 'single';
  const clientRequestId = state.draft?.clientRequestId || crypto.randomUUID();
  const body = {
    mode,
    participantIds,
    message: { content, attachmentIds: state.attachments.map((a) => a.id), clientRequestId },
  };
  saveDraft(content);
  $('#composerInput').value = '';
  autoGrow();
  renderAttachmentChips();

  // Optimistic user message.
  const box = $('#messages');
  const userEl = document.createElement('div');
  userEl.className = 'msg user';
  const userBody = document.createElement('div');
  userBody.className = 'msg-body';
  userBody.innerHTML = renderMarkdown(content);
  userEl.appendChild(userBody);
  box.appendChild(userEl);
  box.scrollTop = box.scrollHeight;

  $('#compareWrap').classList.add('hidden');
  $('#compareWrap').innerHTML = '';
  state.pendingProposals = null;
  hideToolModal();

  showTyping(true);
  let res;
  try {
    res = await fetch(`/api/conversations/${conversationId}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-A0-CSRF': state.csrf },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch (err) {
    showTyping(false);
    restoreDraft();
    toast(`Network error: ${err.message}`, true);
    return;
  }
  if (!res.ok) {
    showTyping(false);
    restoreDraft();
    const data = await res.json().catch(() => ({}));
    toast(data.message || 'Run failed to start.', true);
    return;
  }
  await readSseStream(res, conversationId, mode);
  if (state.currentConversationId === conversationId) {
    await openConversation(conversationId);
  }
}

function showTyping(on) {
  $('#typingBar').classList.toggle('hidden', !on);
  $('#typingText').textContent = on ? 'Working…' : '';
  if (!on) $('#stopBtn').classList.add('hidden');
}

function setActiveRun(runId, conversationId) {
  state.activeRun = { runId, conversationId };
  $('#typingBar').classList.remove('hidden');
  $('#stopBtn').classList.remove('hidden');
}

function clearActiveRun(runId) {
  if (state.activeRun?.runId === runId) {
    state.activeRun = null;
    $('#stopBtn').classList.add('hidden');
  }
}

async function readSseStream(res, conversationId, mode) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingEvent = 'message';
  const messageEls = new Map();
  const paneEls = new Map();

  const appendLiveMessage = (participantId, name) => {
    if (state.currentConversationId !== conversationId) return;
    const box = $('#messages');
    const el = document.createElement('div');
    el.className = 'msg assistant';
    const live = document.createElement('div');
    live.className = 'pane-body';
    live.dataset.live = participantId;
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = name;
    el.append(live, meta);
    box.appendChild(el);
    messageEls.set(participantId, live);
  };

  const ensurePane = (participantId, name) => {
    if (!paneEls.has(participantId)) {
      const wrap = $('#compareWrap');
      if (state.currentConversationId === conversationId) wrap.classList.remove('hidden');
      const pane = document.createElement('div');
      pane.className = 'compare-pane';
      const h = document.createElement('h4');
      h.textContent = name;
      const body = document.createElement('div');
      body.className = 'pane-body';
      pane.append(h, body);
      if (state.currentConversationId === conversationId) wrap.appendChild(pane);
      paneEls.set(participantId, body);
    }
    return paneEls.get(participantId);
  };

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
      handleSseEvent(pendingEvent, payload, { conversationId, mode, appendLiveMessage, ensurePane, messageEls, paneEls });
      pendingEvent = 'message';
    }
  }
}

function handleSseEvent(event, payload, ctx) {
  const { conversationId, mode, appendLiveMessage, ensurePane, messageEls, paneEls } = ctx;
  const isCurrent = state.currentConversationId === conversationId;

  if (event === 'run_start') {
    setActiveRun(payload.runId, conversationId);
    if (!isCurrent) return;
    for (const p of payload.participants) {
      if (mode === 'compare') ensurePane(p.id, `${p.name} · ${p.model}`);
      else appendLiveMessage(p.id, `${p.name} · ${p.model}`);
    }
  } else if (event === 'chunk') {
    if (!isCurrent) return;
    const pane = paneEls.get(payload.participantId);
    const live = messageEls.get(payload.participantId);
    const target = pane || live;
    if (target) {
      target.dataset.text = (target.dataset.text || '') + payload.text;
      target.innerHTML = renderMarkdown(target.dataset.text);
      const scrollBox = pane ? pane : $('#messages');
      scrollBox.scrollTop = scrollBox.scrollHeight;
    }
  } else if (event === 'participant_done') {
    if (isCurrent) {
      if (payload.status === 'failed') {
        const pane = paneEls.get(payload.participantId);
        const live = messageEls.get(payload.participantId);
        const err = document.createElement('div');
        err.className = 'error';
        err.textContent = `Failed: ${payload.error || 'error'}`;
        (pane || live)?.appendChild(err);
      } else if (payload.status === 'complete' && state.spokenAnswers) {
        const live = messageEls.get(payload.participantId) || paneEls.get(payload.participantId);
        if (live?.dataset.text) speak(live.dataset.text);
      } else if (payload.status === 'incomplete') {
        const pane = paneEls.get(payload.participantId);
        const live = messageEls.get(payload.participantId);
        const err = document.createElement('div');
        err.className = 'error';
        err.textContent = `Incomplete: ${payload.incompleteReason || 'provider incomplete'}`;
        (pane || live)?.appendChild(err);
      }
    }
    // C08: provider completion is NOT whole-run completion. Keep the active run
    // (and Stop) alive until run_complete/run_error/tools_cancelled.
  } else if (event === 'tool_proposals') {
    if (!isCurrent) return;
    state.pendingProposals = payload.proposals;
    showToolModal(payload.proposals);
  } else if (event === 'tool_result') {
    if (!isCurrent) return;
    const box = $('#messages');
    const el = document.createElement('div');
    el.className = 'msg tool';
    el.innerHTML = renderMarkdown(`Tool ${payload.toolName}: ${payload.status}${payload.error ? ' — ' + payload.error : ''}${payload.text ? '\n' + payload.text : ''}`);
    box.appendChild(el);
  } else if (event === 'run_complete' || event === 'run_error' || event === 'tools_cancelled') {
    clearActiveRun(payload.runId || state.activeRun?.runId);
    showTyping(false);
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
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.id = p.id;
    const info = document.createElement('div');
    info.innerHTML = `<strong>${escapeHtml(p.toolName)}</strong> <span class="muted">requested by ${escapeHtml(participantName(p.participantId) || p.participantId)}</span><pre>${escapeHtml(JSON.stringify(p.arguments, null, 2))}</pre>`;
    row.append(cb, info);
    list.appendChild(row);
  }
  $('#toolAllBtn').onclick = async () => {
    await authorizeTools(proposals.map((p) => p.id));
  };
  $('#toolSelectedBtn').onclick = async () => {
    const ids = [...list.querySelectorAll('input:checked')].map((i) => i.dataset.id);
    await authorizeTools(ids);
  };
  $('#toolNoneBtn').onclick = async () => {
    await api.post(`/api/runs/${state.activeRun?.runId}/tool-authorize`, { actionIds: [], cancel: true });
    hideToolModal();
  };
}

async function authorizeTools(ids) {
  await api.post(`/api/runs/${state.activeRun?.runId}/tool-authorize`, { actionIds: ids, cancel: false });
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
    const status = $('#voiceStatus');
    status.textContent = voiceErrorMessage(event.error);
    status.classList.remove('hidden');
    $('#voiceBtn').textContent = '🎤';
    $('#voiceBtn').disabled = false;
  };
  $('#voiceBtn').onclick = () => {
    if (recognizing) {
      recognition.stop();
      return;
    }
    $('#composerInput').dataset.dictated = $('#composerInput').value;
    const status = $('#voiceStatus');
    status.textContent = 'Listening… speak now.';
    status.classList.remove('hidden');
    $('#voiceBtn').textContent = '⏹';
    recognizing = true;
    try {
      recognition.start();
    } catch (err) {
      recognizing = false;
      status.textContent = `Voice start failed: ${err.message}`;
      status.classList.remove('hidden');
      $('#voiceBtn').textContent = '🎤';
    }
  };
}

function voiceErrorMessage(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission was denied. Allow microphone access in the browser, then try again.';
    case 'audio-capture':
      return 'No microphone was found. Connect a microphone and try again.';
    case 'network':
      return 'Voice recognition failed because of a network problem. Check your connection and try again.';
    case 'no-speech':
      return 'No speech was detected. Tap the microphone and speak again.';
    default:
      return `Voice recognition error: ${code || 'unknown'}. You can type instead.`;
  }
}

function speak(text) {
  if (!('speechSynthesis' in window)) {
    toast('Spoken answers are not supported in this browser.', true);
    return;
  }
  const clean = text.replace(/```[\s\S]*?```/g, ' code block omitted. ').replace(/[#*_`>]/g, '');
  const token = ++state.speechToken;
  speechSynthesis.cancel();
  const chunks = splitForSpeech(clean, 200);
  for (const chunk of chunks) {
    const u = new SpeechSynthesisUtterance(chunk);
    u.rate = state.voiceRate || 1.02; // C15: owner-persisted rate
    u.onend = () => {
      if (state.speechToken !== token) speechSynthesis.cancel();
    };
    speechSynthesis.speak(u);
  }
}

function splitForSpeech(text, size) {
  const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > size && current) {
      chunks.push(current.trim());
      current = '';
    }
    current += s;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
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
    if (!state.spokenAnswers && 'speechSynthesis' in window) {
      state.speechToken += 1;
      speechSynthesis.cancel();
    }
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
    if (state.activeRun?.runId) {
      await api.post(`/api/runs/${state.activeRun.runId}/stop`, {});
      toast('Stopping the active run…');
    }
  };
  $('#retryBtn').onclick = async () => {
    const content = $('#composerInput').value.trim();
    if (!content && !state.attachments.length) return;
    $('#retryBar').classList.add('hidden');
    sendMessage(content || '');
  };
  $('#attachBtn').onclick = () => $('#fileInput').click();
  $('#fileInput').onchange = async () => {
    for (const file of $('#fileInput').files) await uploadAttachment(file);
    $('#fileInput').value = '';
  };
  $('#seedParticipantsBtn').onclick = async () => {
    try {
      await api.post('/api/participants/seed-defaults', {});
      await loadParticipants();
    } catch (err) {
      toast(err.message, true);
    }
  };
  $('#participantForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/participants', {
        name: $('#pName').value.trim() || undefined,
        provider: $('#pProvider').value,
        model: $('#pModel').value.trim() || undefined,
      });
      $('#pName').value = '';
      $('#pModel').value = '';
      await loadParticipants();
    } catch (err) {
      toast(err.message, true);
    }
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
      $('#mcpName').value = '';
      $('#mcpUrl').value = '';
      $('#mcpAuth').value = '';
      await loadMcp();
    } catch (err) {
      toast(err.message, true);
    }
  };
  $('#mcpReveal').onchange = () => {
    $('#mcpAuth').type = $('#mcpReveal').checked ? 'text' : 'password';
  };
  $('#projectForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/projects', { name: $('#projectName').value });
      $('#projectName').value = '';
      await loadProjects();
    } catch (err) {
      toast(err.message, true);
    }
  };
  $('#passwordForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.patch('/api/me/password', {
        currentPassword: $('#currentPassword').value,
        newPassword: $('#newPassword').value,
      });
      toast('Password changed. Other sessions were signed out; please sign in again.');
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      toast(err.message, true);
    }
  };
}

async function initOwnerPreferences() {
  let prefs = {};
  try { prefs = (await api.get('/api/settings')).owner || {}; } catch {}
  const set = (id, key) => {
    const el = $(id);
    if (!el) return;
    el.value = prefs[key] ?? el.querySelector('option[selected]')?.value ?? '';
    el.onchange = async () => {
      await api.put('/api/settings', { [key]: el.value });
      applyOwnerPreferences();
      toast('Preference saved.');
    };
  };
  set('#prefTextSize', 'textSize');
  set('#prefEnter', 'enterToSend');
  set('#prefVoiceRate', 'voiceRate');
  set('#prefAutoSpeak', 'autoSpeak');
  set('#prefLayout', 'comparisonLayout');
  applyOwnerPreferences();
}

function applyOwnerPreferences() {
  const size = $('#prefTextSize')?.value;
  document.documentElement.style.setProperty('--base-font', size === 'large' ? '19px' : size === 'small' ? '15px' : '16px');
  const enter = $('#prefEnter')?.value;
  state.enterToSend = enter === 'on';
  state.voiceRate = parseFloat($('#prefVoiceRate')?.value || '1.0');
  state.spokenAnswers = ($('#prefAutoSpeak')?.value === 'on');
  state.comparisonLayout = $('#prefLayout')?.value || 'stacked';
}

boot().then(() => {
  bindForms();
  initVoice();
  initOwnerPreferences().catch(() => {});
});

// ---------- FR1 context editor ----------
let contextEditorState = { conversationId: null, revision: 0, blocks: [], editing: false };

async function openContextEditor() {
  if (!state.currentConversationId) {
    toast('Create or open a conversation first.');
    return;
  }
  const data = await api.get(`/api/conversations/${state.currentConversationId}/context`);
  contextEditorState = {
    conversationId: state.currentConversationId,
    revision: data.revision || 0,
    blocks: data.blocks || [],
    editing: true,
  };
  renderContextEditor();
  $('#contextEditorModal').classList.remove('hidden');
}

function renderContextEditor() {
  const badge = $('#contextRevisionBadge');
  badge.textContent = contextEditorState.revision ? `revision ${contextEditorState.revision}` : 'working draft';
  if (contextEditorState.cacheEstimate) {
    badge.textContent += ` · cache forecast: prefix ≈ ${contextEditorState.cacheEstimate.estimatedReusablePrefixChars} chars (not observed)`;
  }
  const list = $('#contextBlockList');
  list.innerHTML = '';
  for (const [idx, block] of contextEditorState.blocks.entries()) {
    const item = document.createElement('div');
    item.className = 'context-block';
    const head = document.createElement('div');
    head.className = 'row';
    const label = document.createElement('strong');
    label.textContent = `${idx + 1}. ${block.label} (${block.source || block.type})`;
    head.appendChild(label);
    if (!block.editable) {
      const ro = document.createElement('span');
      ro.className = 'muted';
      ro.textContent = `read-only — ${block.readonlyReason || 'fixed'}`;
      head.appendChild(ro);
    }
    item.appendChild(head);
    if (block.editable) {
      const textarea = document.createElement('textarea');
      textarea.className = 'context-textarea';
      textarea.value = block.content || '';
      textarea.dataset.blockId = block.id;
      item.appendChild(textarea);
      const inc = document.createElement('label');
      inc.className = 'checkbox';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = block.included !== false;
      cb.dataset.blockId = block.id;
      cb.dataset.field = 'included';
      inc.append(cb, document.createTextNode(' include in next context'));
      item.appendChild(inc);
    } else {
      const preview = document.createElement('pre');
      preview.className = 'context-preview';
      preview.textContent = String(block.content || ''); // C15: full content, scrollable
      item.appendChild(preview);
      if (block.type === 'history') {
        const inc = document.createElement('label');
        inc.className = 'checkbox';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = block.included !== false;
        cb.dataset.blockId = block.id;
        cb.dataset.field = 'included';
        inc.append(cb, document.createTextNode(' include this message'));
        item.appendChild(inc);
      }
    }
    list.appendChild(item);
  }
}

$('#contextEditorBtn').onclick = () => openContextEditor().catch((e) => toast(e.message, true));
$('#contextEditorCancelBtn').onclick = () => {
  contextEditorState.editing = false;
  $('#contextEditorModal').classList.add('hidden');
};
$('#contextEditorSaveBtn').onclick = async () => {
  if (!contextEditorState.editing) return;
  const blocks = contextEditorState.blocks.map((b) => {
    const textarea = document.querySelector(`#contextBlockList textarea[data-block-id="${CSS.escape(b.id)}"]`);
    const checkbox = document.querySelector(`#contextBlockList input[data-field="included"][data-block-id="${CSS.escape(b.id)}"]`);
    return {
      id: b.id,
      content: textarea ? textarea.value : undefined,
      included: checkbox ? checkbox.checked : b.included,
    };
  });
  try {
    const data = await api.request('POST', `/api/conversations/${contextEditorState.conversationId}/context-revisions`, {
      blocks,
      note: 'website context editor',
      expectedRevision: contextEditorState.revision || null,
    });
    contextEditorState.revision = data.revision;
    contextEditorState.blocks = data.blocks;
    contextEditorState.cacheEstimate = data.cacheEstimate;
    renderContextEditor();
    toast(`Context revision ${data.revision} saved. Cache estimate: reusable prefix ≈ ${data.cacheEstimate?.estimatedReusablePrefixChars ?? 0} chars (forecast, not observed).`);
  } catch (err) {
    toast(err.message, true);
  }
};
