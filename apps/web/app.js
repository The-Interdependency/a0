// A0 phone-first web client. Served by apps/server; same-origin API with cookies.
// Usage: Menu opens saved history; comparison layout applies to saved/live rounds.
// Owner-scoped sessionStorage holds unsent drafts, never provider keys/transcripts.
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
  drafts: {},
  pendingDrafts: {},
  uploads: [],
  messages: [],
  ready: false,
  navigation: 0,
  sending: false,
  comparisonLayout: 'carousel',
  runs: {}, // In-memory stream controls keyed by conversation, never by visible pane.
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
  put: (path, body) => api.request('PUT', path, body),
  del: (path) => api.request('DELETE', path),
};

// Persist drafts before Android hands control to its picker/another app. Saved
// conversations are always fetched from the owner-authorized server on return.
function recoveryKey() { return `a0.ui.v1:${state.me?.id}`; }
function draftKey() { return state.currentConversationId || 'new'; }
function persistSession() {
  if (!state.ready || !state.me) return;
  try {
    sessionStorage.setItem(recoveryKey(), JSON.stringify({
      conversationId: state.currentConversationId,
      participants: state.selectedParticipantIds, mode: state.lastMode,
      drafts: state.drafts, pending: state.pendingDrafts, uploads: state.uploads,
    }));
    if (state.currentConversationId) localStorage.setItem(`${recoveryKey()}:last`, state.currentConversationId);
  } catch {
    if (!state.storageWarning) {
      state.storageWarning = true;
      toast('Browser draft storage is unavailable. Keep this tab open until you send.', true);
    }
  }
}
function persistComposer() {
  if (!state.ready) return;
  state.drafts[draftKey()] = { content: $('#composerInput').value, attachments: state.attachments.map(a => ({ ...a })) };
  persistSession();
}
function recoverSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(recoveryKey()) || '{}');
    state.drafts = saved.drafts || {};
    state.pendingDrafts = saved.pending || {};
    state.uploads = (Array.isArray(saved.uploads) ? saved.uploads : []).map(upload => ({
      ...upload, status: 'failed', error: upload.error || 'Upload interrupted. Select this file again.',
    }));
    state.selectedParticipantIds = Array.isArray(saved.participants) ? saved.participants : [];
    state.lastMode = saved.mode;
    return new URLSearchParams(location.hash.slice(1)).get('conversation') || saved.conversationId || localStorage.getItem(`${recoveryKey()}:last`);
  } catch { return null; }
}
function showDraft() {
  const draft = state.drafts[draftKey()] || {};
  $('#composerInput').value = draft.content || '';
  state.attachments = Array.isArray(draft.attachments) ? draft.attachments.map(a => ({ ...a })) : [];
  state.draft = state.pendingDrafts[draftKey()] || null;
  $('#retryBar').classList.toggle('hidden', !state.draft);
  if (state.draft) $('#retryText').textContent = draftStatusText(state.draft);
  renderAttachmentChips();
  autoGrow();
}

function setDrawer(open) {
  $('#drawer').classList.toggle('open', open);
  $('#menuBtn').setAttribute('aria-expanded', String(open));
  $('#drawerBackdrop').classList.toggle('hidden', !open);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- Views ----------
function showView(name) {
  state.view = name;
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $(`#view-${name}`)?.classList.remove('hidden');
  setDrawer(false);
  if (name === 'chat') renderConversations();
  const loader = { providers: loadProviders, participants: loadParticipants, mcp: loadMcp, projects: loadProjects, about: loadAbout }[name];
  if (loader) loader().catch(err => toast(err.message, true));
}

// ---------- Bootstrap / auth ----------
async function boot() {
  try {
    const me = await api.get('/api/me');
    state.me = me.user;
    state.csrf = me.csrfToken;
    await enterApp();
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
  setComposerReady(false);
  const savedId = recoverSession();
  const navigation = state.navigation;
  showView('chat');
  const results = await Promise.allSettled([loadConversations(), loadProjects(), loadParticipants(), loadProviders(), initOwnerPreferences()]);
  if (!state.me) return; // Sign-out may complete while startup requests are pending.
  for (const result of results) if (result.status === 'rejected') toast(result.reason.message, true);
  showDraft();
  const id = state.conversations.find(c => c.id === savedId)?.id || state.conversations[0]?.id;
  if (id && navigation === state.navigation) await openConversation(id);
  if (!state.me) return;
  setComposerReady(true);
  persistComposer();
}

// Restore the initial owner/conversation draft before accepting input. This also
// gates attachments, dictation and submit while slow startup requests settle.
function setComposerReady(ready) {
  state.ready = ready;
  $('#composerForm').setAttribute('aria-busy', String(!ready));
  for (const id of ['composerInput', 'attachBtn', 'fileInput', 'voiceBtn', 'retryBtn']) {
    $('#' + id).disabled = !ready;
  }
  $('#composerInput').placeholder = ready ? 'Message A0…' : 'Loading conversation…';
  renderAttachmentChips();
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
    item.onclick = () => openConversation(c.id).catch(err => toast(err.message, true));
    list.appendChild(item);
  }
}

async function openConversation(id, { refresh = false, adoptNewDraft = false } = {}) {
  if (id !== state.currentConversationId && recognizing) recognition?.stop();
  persistComposer();
  const scroll = refresh ? $('.content').scrollTop : null;
  const positions = refresh ? $$('.response-group .compare-wrap').map(track => track.scrollLeft) : [];
  const navigation = ++state.navigation;
  const data = await api.get(`/api/conversations/${id}`);
  if (navigation !== state.navigation) return; // A late fetch must not hijack a newer selection.
  persistComposer(); // Preserve edits made while the detail request was pending.
  if (adoptNewDraft && !state.currentConversationId) {
    // Migrate at the actual switch, after both creation and detail requests.
    persistComposer();
    state.drafts[id] = state.drafts.new || { content: '', attachments: [] };
    delete state.drafts.new;
    for (const upload of state.uploads) if (upload.key === 'new') upload.key = id;
  }
  clearConversationView();
  state.currentConversationId = id;
  state.currentConversation = data.conversation;
  state.activeRun = state.runs[id] || null;
  state.currentConversation.message_count = data.messageCount || 0; // C03 authoritative
  state.activeProjectId = data.conversation.project_id || null;
  renderMessages(data.messages);
  $('#chatTitle').textContent = data.conversation.title;
  renderContextPolicy(data.conversation.context_policy);
  renderChatProjectSelector();
  renderConversations();
  showDraft();
  history.replaceState(null, '', `#conversation=${encodeURIComponent(id)}`);
  persistSession();
  showView('chat');
  if (state.activeRun) {
    showTyping(true);
    $('#stopBtn').classList.remove('hidden');
    if (state.activeRun.proposals) {
      state.pendingProposals = state.activeRun.proposals;
      showToolModal(state.activeRun.proposals);
    }
  }
  if (refresh) requestAnimationFrame(() => {
    if (state.currentConversationId !== id) return;
    $('.content').scrollTop = scroll;
    $$('.response-group .compare-wrap').forEach((track, i) => { track.scrollLeft = positions[i] || 0; });
  });
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
  persistComposer();
  const adoptNewDraft = !state.currentConversationId;
  const navigation = state.navigation;
  const body = { title: 'New conversation' };
  if (state.activeProjectId) body.projectId = state.activeProjectId;
  const data = await api.post('/api/conversations', body);
  await loadConversations();
  if (navigation !== state.navigation) return null;
  await openConversation(data.conversation.id, { adoptNewDraft });
  return state.currentConversationId === data.conversation.id ? data.conversation.id : null;
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
  state.messages = messages;
  const box = $('#messages');
  box.innerHTML = '';
  const rounds = new Map();
  for (const m of messages) {
    if (m.role === 'assistant' && m.round > 0) {
      if (!rounds.has(m.round)) rounds.set(m.round, []);
      rounds.get(m.round).push(m);
    }
  }
  const rendered = new Set();
  for (const m of messages) {
    const round = rounds.get(m.round);
    if (m.role === 'assistant' && round && new Set(round.map(r => r.participant_id)).size > 1) {
      if (rendered.has(m.round)) continue;
      rendered.add(m.round);
      const group = createResponseGroup(`Round ${m.round}`);
      const lanes = new Map();
      for (const response of round) {
        if (!lanes.has(response.participant_id)) {
          const pane = document.createElement('div');
          pane.className = 'compare-pane';
          lanes.set(response.participant_id, pane);
          group.track.appendChild(pane);
        }
        lanes.get(response.participant_id).appendChild(messageElement(response));
      }
      box.appendChild(group.section);
      group.update();
    } else box.appendChild(messageElement(m));
  }
}

function createResponseGroup(label) {
  const section = document.createElement('section');
  section.className = 'response-group';
  section.setAttribute('aria-label', `${label} answers`);
  const controls = document.createElement('div');
  controls.className = 'comparison-controls';
  const previous = document.createElement('button');
  const next = document.createElement('button');
  const status = document.createElement('span');
  status.className = 'muted';
  status.setAttribute('aria-live', 'polite');
  previous.type = next.type = 'button';
  previous.className = next.className = 'chip';
  previous.textContent = '←'; next.textContent = '→';
  previous.setAttribute('aria-label', 'Previous answer');
  next.setAttribute('aria-label', 'Next answer');
  const track = document.createElement('div');
  track.className = `compare-wrap ${state.comparisonLayout}`;
  track.tabIndex = 0;
  track.setAttribute('aria-label', 'Swipe between answers');
  const update = () => {
    const panes = [...track.children];
    const index = panes.reduce((best, pane, i) => Math.abs(pane.offsetLeft - track.scrollLeft) < Math.abs((panes[best]?.offsetLeft || 0) - track.scrollLeft) ? i : best, 0);
    status.textContent = track.scrollWidth <= track.clientWidth + 1 ? `${label} · ${panes.length} answers` : `${label} · ${index + 1} / ${panes.length}`;
    previous.disabled = track.scrollLeft <= 1;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
  };
  const move = delta => {
    const panes = [...track.children];
    const position = track.scrollLeft + delta;
    const target = delta > 0 ? panes.find(p => p.offsetLeft > position) : panes.reverse().find(p => p.offsetLeft < position);
    if (target) track.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
  };
  previous.onclick = () => move(-2);
  next.onclick = () => move(2);
  track.addEventListener('scroll', update, { passive: true });
  track.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); move(e.key === 'ArrowLeft' ? -2 : 2); }
  });
  controls.append(previous, status, next);
  section.append(controls, track);
  requestAnimationFrame(update);
  return { section, track, update };
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
  state.selectedParticipantIds = state.selectedParticipantIds.filter(id => state.participants.some(p => p.id === id));
  if (!state.selectedParticipantIds.length && state.participants.length) {
    const deepseek = state.participants.find((p) => p.provider === 'deepseek') || state.participants[0];
    state.selectedParticipantIds = [deepseek.id];
    toast(`Default participant: ${deepseek.name}`);
  }
  renderParticipantPicker();
  renderParticipantCards();
}

function renderParticipantPicker() {
  persistSession();
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
    persistSession();
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
    persistSession();
    renderParticipantPicker();
    toast('Continue with the selected participant (full intended context).');
  };
  $('#switchCompareBtn').onclick = () => {
    // C03: Compare is explicitly selected participants (>=2), same semantic context.
    if (nextIds.length < 2) { toast('Select at least two participants to compare.', true); return; }
    hideSwitchModal();
    state.selectedParticipantIds = nextIds;
    state.lastMode = 'compare';
    persistSession();
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
    card.append(h, sub, row);
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
  const upload = { key: draftKey(), filename: file.name, status: 'uploading' };
  state.uploads.push(upload);
  persistComposer();
  renderAttachmentChips();
  try {
    const fd = new FormData();
    fd.append('file', file);
    const data = await api.request('POST', '/api/attachments', fd, { raw: true });
    if (draftKey() === upload.key) {
      state.attachments.push(data.attachment);
      persistComposer();
    } else {
      const draft = state.drafts[upload.key] ||= { content: '', attachments: [] };
      draft.attachments.push(data.attachment);
      persistSession();
    }
    state.uploads = state.uploads.filter(item => item !== upload);
  } catch (err) {
    upload.status = 'failed';
    upload.error = err.message;
    toast(`Upload failed: ${err.message}`, true);
  } finally {
    persistSession();
    renderAttachmentChips();
  }
}

function renderAttachmentChips() {
  const box = $('#attachmentChips');
  box.innerHTML = '';
  for (const a of state.attachments) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const label = document.createElement('span');
    label.textContent = `${a.mime?.startsWith('image/') ? '🖼️' : '📄'} ${a.filename || 'Attached file'} · Ready`;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'chip-x';
    rm.textContent = '✕';
    rm.setAttribute('aria-label', `Remove ${a.filename}`);
    rm.onclick = () => {
      state.attachments = state.attachments.filter((x) => x.id !== a.id);
      persistComposer();
      renderAttachmentChips();
    };
    chip.append(label, rm);
    box.appendChild(chip);
  }
  for (const upload of state.uploads.filter(u => u.key === draftKey())) {
    const chip = document.createElement('span');
    chip.className = 'chip' + (upload.status === 'failed' ? ' error' : '');
    chip.textContent = `${upload.filename} · ${upload.status === 'uploading' ? 'Uploading…' : upload.error}`;
    if (upload.status === 'failed') {
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'chip-x'; remove.textContent = '✕';
      remove.setAttribute('aria-label', `Dismiss upload error for ${upload.filename}`);
      remove.onclick = () => { state.uploads = state.uploads.filter(u => u !== upload); renderAttachmentChips(); };
      chip.appendChild(remove);
    }
    box.appendChild(chip);
  }
  $('#sendBtn').disabled = !state.ready || state.sending || state.uploads.some(u => u.key === draftKey() && u.status === 'uploading');
}

// ---------- Draft preservation ----------
function saveDraft(content, clientRequestId = crypto.randomUUID(), attachments = state.attachments) {
  state.draft = {
    content,
    // C13: preserve complete attachment descriptors, not bare ids.
    attachments: attachments.map((a) => ({ ...a })),
    attachmentIds: attachments.map((a) => a.id),
    clientRequestId,
  };
  state.pendingDrafts[draftKey()] = state.draft;
  persistSession();
}

function draftStatusText(draft) {
  return draft.rejected
    ? 'Message rejected. Edit the draft and send again, or retry the saved version.'
    : 'Previous delivery is unconfirmed. Retry checks saved history first.';
}

function restoreDraft(conversationId = draftKey()) {
  const pending = state.pendingDrafts[conversationId];
  if (!pending) return;
  if (conversationId !== draftKey()) {
    const draft = state.drafts[conversationId];
    if (!draft?.content && !draft?.attachments?.length) {
      state.drafts[conversationId] = { content: pending.content, attachments: pending.attachments.map(a => ({ ...a })) };
    }
    persistSession();
    return;
  }
  state.draft = pending;
  // A new thought typed while waiting must not be overwritten by failed delivery.
  if (!$('#composerInput').value && !state.attachments.length) {
    $('#composerInput').value = state.draft.content;
    state.attachments = (state.draft.attachments || (state.draft.attachmentIds || []).map((id) => ({ id }))).map((a) => ({ ...a }));
    autoGrow();
    persistComposer();
  }
  renderAttachmentChips();
  const retry = $('#retryBar');
  retry.classList.remove('hidden');
  $('#retryText').textContent = draftStatusText(pending);
}

function clearDraft(conversationId = draftKey()) {
  delete state.pendingDrafts[conversationId];
  if (conversationId === draftKey()) {
    state.draft = null;
    $('#retryBar').classList.add('hidden');
  }
  persistSession();
}

// ---------- Streaming run ----------
function clearSubmittedComposer(content, attachments) {
  // The matching text and attachment identities belong to the submitted draft.
  // A different thought or newly uploaded file remains available for the next send.
  if ($('#composerInput').value.trim() === content) $('#composerInput').value = '';
  state.attachments = state.attachments.filter(a => !attachments.some(sent => sent.id === a.id));
  persistComposer();
  autoGrow();
  renderAttachmentChips();
}

async function sendMessage(content, retry = null) {
  if (!state.ready || state.sending || state.uploads.some(u => u.key === draftKey() && u.status === 'uploading')) return;
  if (!retry && state.pendingDrafts[draftKey()] && !state.pendingDrafts[draftKey()].rejected) {
    toast('Use Retry to check the previous unconfirmed delivery before sending again.', true);
    return;
  }
  if (!state.selectedParticipantIds.length) {
    toast('Select a participant before sending.', true);
    return;
  }
  state.sending = true;
  const attachments = retry?.attachments || state.attachments.map(a => ({ ...a }));
  let conversationId;
  let submitted = false;
  try {
    if (!state.currentConversationId && !await newConversation()) {
      toast('Conversation changed while creating the chat. Your draft is preserved.', true);
      return;
    }
    conversationId = state.currentConversationId;
    const navigation = state.navigation;
    if (retry) {
      const existing = await api.get(`/api/conversations/${conversationId}`);
      // Even leaving and returning to this conversation invalidates this attempt.
      // Leave the pending identity intact for a deliberate retry in the new view.
      if (navigation !== state.navigation || conversationId !== state.currentConversationId) return;
      if (existing.messages.some(m => m.meta?.clientRequestId === retry.clientRequestId)) {
        clearSubmittedComposer(retry.content, attachments);
        clearDraft(conversationId);
        await openConversation(conversationId);
        toast('That message is already saved. Its response status is shown in history.');
        return;
      }
    }
    const participantIds = [...state.selectedParticipantIds];
    const savedMode = state.lastMode || null;
    let mode = savedMode === 'compare' ? 'compare' : savedMode === 'continue' ? 'single' : (participantIds.length > 1 ? 'compare' : 'single');
    if (mode === 'compare' && participantIds.length < 2) mode = 'single';
    const clientRequestId = retry?.clientRequestId || crypto.randomUUID();
    const body = {
      mode,
      participantIds,
      message: { content, attachmentIds: attachments.map((a) => a.id), clientRequestId },
    };
    if (!retry) saveDraft(content, clientRequestId, attachments);
    // Clear the submitted composer only; typing after this point is a new draft.
    clearSubmittedComposer(content, attachments);

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
      if (conversationId === state.currentConversationId) showTyping(false);
      restoreDraft(conversationId);
      toast(`Network error: ${err.message}`, true);
      return;
    }
    if (!res.ok) {
      if (conversationId === state.currentConversationId) showTyping(false);
      if ([400, 401, 403, 404, 413, 415, 422].includes(res.status) && state.pendingDrafts[conversationId]) {
        state.pendingDrafts[conversationId].rejected = true;
        persistSession();
      }
      restoreDraft(conversationId);
      const data = await res.json().catch(() => ({}));
      toast(data.message || 'Run failed to start.', true);
      return;
    }
    submitted = true;
    await readSseStream(res, conversationId, mode);
    if (state.currentConversationId === conversationId && state.navigation === navigation) {
      await openConversation(conversationId);
    }
    await loadConversations();
  } catch (err) {
    // A cached run is a live stream control, not evidence the server still works.
    // Losing the stream invalidates its controls even when another chat is visible.
    if (submitted && state.runs[conversationId]) clearActiveRun(state.runs[conversationId].runId);
    if (conversationId === state.currentConversationId) {
      showTyping(false);
      restoreDraft(conversationId);
    }
    toast(submitted ? `Connection interrupted: ${err.message}. Reopen history to check saved results.` : err.message, true);
  } finally {
    state.sending = false;
    renderAttachmentChips();
  }
}

function showTyping(on) {
  $('#typingBar').classList.toggle('hidden', !on);
  $('#typingText').textContent = on ? 'Working…' : '';
  if (!on) $('#stopBtn').classList.add('hidden');
}

function setActiveRun(runId, conversationId) {
  const run = { runId, conversationId };
  state.runs[conversationId] = run;
  if (state.currentConversationId === conversationId) {
    state.activeRun = run;
    $('#typingBar').classList.remove('hidden');
    $('#stopBtn').classList.remove('hidden');
  }
}

function clearActiveRun(runId) {
  if (!runId) return;
  for (const [id, run] of Object.entries(state.runs)) if (run.runId === runId) delete state.runs[id];
  if (state.activeRun?.runId === runId) {
    state.activeRun = null;
    showTyping(false);
    state.pendingProposals = null;
    hideToolModal();
  }
}

async function readSseStream(res, conversationId, mode) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingEvent = 'message';
  const messageEls = new Map();
  const paneEls = new Map();
  let group = null;
  let terminal = false;

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
      if (!group) {
        group = createResponseGroup('Current round');
        if (state.currentConversationId === conversationId) { wrap.classList.remove('hidden'); wrap.appendChild(group.section); }
      }
      const pane = document.createElement('div');
      pane.className = 'compare-pane';
      const h = document.createElement('h4');
      h.textContent = name;
      const body = document.createElement('div');
      body.className = 'pane-body';
      pane.append(h, body);
      if (state.currentConversationId === conversationId) { group.track.appendChild(pane); group.update(); }
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
      if (['run_complete', 'run_error', 'tools_cancelled'].includes(pendingEvent)) terminal = true;
      handleSseEvent(pendingEvent, payload, { conversationId, mode, appendLiveMessage, ensurePane, messageEls, paneEls });
      pendingEvent = 'message';
    }
  }
  if (!terminal) throw new Error('The response stream ended before completion');
}

function handleSseEvent(event, payload, ctx) {
  const { conversationId, mode, appendLiveMessage, ensurePane, messageEls, paneEls } = ctx;
  const isCurrent = state.currentConversationId === conversationId;

  if (event === 'run_start') {
    clearDraft(conversationId); // Server acknowledgement; never resend automatically.
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
    if (state.runs[conversationId]) state.runs[conversationId].proposals = payload.proposals;
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
    clearActiveRun(payload.runId || state.runs[conversationId]?.runId);
    if (isCurrent) {
      showTyping(false);
      state.pendingProposals = null;
      hideToolModal();
    }
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
  if (state.activeRun) state.activeRun.proposals = null;
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
  $('#voiceBtn').onclick = () => {
    if (!recognition) {
      voiceMessage('Speech recognition is not available in this browser. You can use your keyboard’s microphone to dictate into the message box.', true);
      return;
    }
    if (recognizing) { recognition.stop(); return; }
    stopSpeech(false);
    recognitionFailed = false;
    recognitionKey = draftKey();
    recognitionBase = $('#composerInput').value;
    voiceMessage('Requesting microphone…');
    $('#voiceBtn').textContent = '⏹';
    $('#voiceBtn').setAttribute('aria-pressed', 'true');
    recognizing = true;
    persistComposer();
    try { recognition.start(); }
    catch (err) {
      recognizing = false;
      recognitionFailed = true;
      voiceMessage(`Voice start failed: ${err.message}`, true);
      $('#voiceBtn').textContent = '🎤';
      $('#voiceBtn').setAttribute('aria-pressed', 'false');
    }
  };
  if (!SR) return;
  try { recognition = new SR(); }
  catch { return; }
  let recognitionBase = '';
  let recognitionFailed = false;
  let recognitionKey = null;
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.onstart = () => voiceMessage('Listening… speak now.');
  recognition.onresult = (event) => {
    if (!state.ready || !state.me) return;
    let finalText = '';
    let interimText = '';
    for (let i = 0; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) finalText += res[0].transcript;
      else interimText += res[0].transcript;
    }
    const input = $('#composerInput');
    const content = recognitionBase + (recognitionBase && !/\s$/.test(recognitionBase) ? ' ' : '') + finalText + (interimText ? ' ' + interimText : '');
    if (recognitionKey === draftKey()) {
      input.value = content;
      autoGrow();
      persistComposer();
    } else {
      const draft = state.drafts[recognitionKey] ||= { content: '', attachments: [] };
      draft.content = content;
      persistSession();
    }
  };
  recognition.onend = () => {
    recognizing = false;
    if (!recognitionFailed) voiceMessage('Dictation stopped. Review your message, then send.');
    $('#voiceBtn').textContent = '🎤';
    $('#voiceBtn').setAttribute('aria-pressed', 'false');
    persistComposer();
  };
  recognition.onerror = (event) => {
    recognizing = false;
    recognitionFailed = true;
    voiceMessage(voiceErrorMessage(event.error), true);
    $('#voiceBtn').textContent = '🎤';
    $('#voiceBtn').setAttribute('aria-pressed', 'false');
  };
}

function voiceMessage(message, error = false) {
  const status = $('#voiceStatus');
  status.textContent = message;
  status.classList.remove('hidden');
  status.classList.toggle('error', error);
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
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    voiceMessage('Spoken answers are not supported in this browser.', true);
    return;
  }
  const clean = text.replace(/```[\s\S]*?```/g, ' code block omitted. ').replace(/[#*_`>]/g, '');
  stopSpeech(false);
  const token = state.speechToken;
  const chunks = splitForSpeech(clean, 200);
  voiceMessage('Starting spoken answer…');
  const next = () => {
    if (token !== state.speechToken) return;
    const chunk = chunks.shift();
    if (!chunk) {
      state.speechUtterance = null;
      $('#stopSpeechBtn').classList.add('hidden');
      voiceMessage('Finished reading.');
      return;
    }
    const u = new SpeechSynthesisUtterance(chunk);
    state.speechUtterance = u; // Keep alive across mobile browser callbacks.
    u.rate = state.voiceRate || 1.02;
    u.onstart = () => { if (token === state.speechToken) voiceMessage('Reading answer…'); };
    u.onend = next;
    u.onerror = event => {
      if (token !== state.speechToken) return;
      stopSpeech(false);
      voiceMessage(`Playback failed (${event.error || 'unknown'}). Check media volume and the browser’s speech voice, then tap the answer’s speaker to retry.`, true);
    };
    $('#stopSpeechBtn').classList.remove('hidden');
    try { speechSynthesis.resume(); speechSynthesis.speak(u); }
    catch (err) { u.onerror({ error: err.message }); }
  };
  next();
}

function stopSpeech(feedback = true) {
  state.speechToken += 1;
  window.speechSynthesis?.cancel();
  state.speechUtterance = null;
  $('#stopSpeechBtn').classList.add('hidden');
  if (feedback) voiceMessage('Reading stopped.');
}

function splitForSpeech(text, size) {
  const chunks = [];
  let current = '';
  for (let word of text.match(/\S+\s*/g) || []) {
    if ((current + word).length > size && current) {
      chunks.push(current.trim());
      current = '';
    }
    while (word.length > size) { chunks.push(word.slice(0, size)); word = word.slice(size); }
    current += word;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ---------- UI wiring ----------
function bindNav() {
  $$('.nav-btn').forEach((btn) => {
    btn.onclick = () => showView(btn.dataset.view);
  });
  $('#menuBtn').onclick = () => setDrawer(!$('#drawer').classList.contains('open'));
  $('#drawerBackdrop').onclick = () => setDrawer(false);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setDrawer(false); });
  $('#logoutBtn').onclick = async () => {
    try {
      await api.post('/api/auth/logout', {});
      const key = recoveryKey();
      // Revoke persistence before pagehide, late uploads or speech callbacks can
      // recreate private recovery. A failed logout leaves the working draft intact.
      setComposerReady(false);
      state.me = null;
      state.csrf = '';
      state.navigation += 1;
      state.drafts = {};
      state.pendingDrafts = {};
      state.uploads = [];
      state.attachments = [];
      state.draft = null;
      state.runs = {};
      state.messages = [];
      state.currentConversationId = null;
      state.currentConversation = null;
      $('#composerInput').value = '';
      clearConversationView();
      try { sessionStorage.removeItem(key); localStorage.removeItem(`${key}:last`); } catch {}
      recognition?.abort?.();
      stopSpeech(false);
      history.replaceState(null, '', location.pathname + location.search);
      location.reload();
    } catch (err) { toast(`Could not sign out: ${err.message}`, true); }
  };
  $('#newChatBtn').onclick = () => { setDrawer(false); newConversation().catch(err => toast(err.message, true)); };
  $('#voiceReadBtn').onclick = () => {
    state.spokenAnswers = !state.spokenAnswers;
    $('#prefAutoSpeak').value = state.spokenAnswers ? 'on' : 'off';
    $('#voiceReadBtn').textContent = state.spokenAnswers ? '🔊' : '🔇';
    $('#voiceReadBtn').setAttribute('aria-pressed', String(state.spokenAnswers));
    api.put('/api/settings', { autoSpeak: state.spokenAnswers ? 'on' : 'off' }).catch(err => toast(`Could not save voice preference: ${err.message}`, true));
    if (state.spokenAnswers) {
      const last = [...state.messages].reverse().find(m => m.role === 'assistant' && m.status === 'complete' && m.content);
      speak(last?.content || 'Spoken answers on.');
    } else {
      stopSpeech(false);
      voiceMessage('Spoken answers off. You can still read any answer with its speaker button.');
    }
  };
  $('#stopSpeechBtn').onclick = () => stopSpeech();
}

function autoGrow() {
  const ta = $('#composerInput');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
}

function bindForms() {
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
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && state.enterToSend) {
      e.preventDefault();
      $('#composerForm').requestSubmit();
    }
  });
  $('#composerInput').addEventListener('input', () => { autoGrow(); persistComposer(); });
  $('#stopBtn').onclick = async () => {
    const run = state.activeRun;
    if (!run?.runId) return;
    try {
      const result = await api.post(`/api/runs/${run.runId}/stop`, {});
      if (result.stopped === false) {
        clearActiveRun(run.runId);
        toast('That run is no longer active. Reopen history to check saved results.');
      } else {
        toast('Stopping the active run…');
      }
    } catch (err) { toast(`Could not stop the run: ${err.message}`, true); }
  };
  $('#retryBtn').onclick = async () => {
    if (state.draft) sendMessage(state.draft.content, { ...state.draft });
  };
  $('#attachBtn').onclick = () => { persistComposer(); $('#fileInput').click(); };
  $('#fileInput').onchange = async () => {
    const files = [...$('#fileInput').files];
    $('#fileInput').value = '';
    await Promise.all(files.map(uploadAttachment));
  };
  $('#comparisonLayout').onchange = async () => {
    $('#prefLayout').value = $('#comparisonLayout').value;
    applyOwnerPreferences();
    try { await api.put('/api/settings', { comparisonLayout: state.comparisonLayout }); }
    catch (err) { toast(`Could not save answer layout: ${err.message}`, true); }
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
      applyOwnerPreferences();
      try { await api.put('/api/settings', { [key]: el.value }); toast('Preference saved.'); }
      catch (err) { toast(`Could not save preference: ${err.message}`, true); }
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
  state.comparisonLayout = $('#prefLayout')?.value || 'carousel';
  $('#comparisonLayout').value = state.comparisonLayout;
  $('#voiceReadBtn').textContent = state.spokenAnswers ? '🔊' : '🔇';
  $('#voiceReadBtn').setAttribute('aria-pressed', String(state.spokenAnswers));
  $$('.response-group .compare-wrap').forEach(track => {
    track.classList.remove('stacked', 'side', 'carousel');
    track.classList.add(state.comparisonLayout);
    requestAnimationFrame(() => track.dispatchEvent(new Event('scroll')));
  });
}

// Controls must not depend on a settings/provider request completing successfully.
bindNav();
bindForms();
initVoice();
setComposerReady(false);
boot();
window.addEventListener('pagehide', persistComposer);
document.addEventListener('visibilitychange', () => {
  persistComposer();
  if (document.visibilityState === 'visible' && state.ready && state.view === 'chat' && !state.sending && state.currentConversationId && !$$('.modal').some(m => !m.classList.contains('hidden'))) {
    openConversation(state.currentConversationId, { refresh: true }).catch(err => toast(`Could not refresh history: ${err.message}`, true));
  }
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

// ---------- FR2 Forge agents + FR3 temporary modules ----------
let forgeTemplates = [];

async function loadForgeTemplates() {
  if (!forgeTemplates.length) {
    const data = await api.get('/api/forge/templates');
    forgeTemplates = data.templates || [];
  }
  const sel = $('#agentTemplate');
  sel.innerHTML = '';
  for (const t of forgeTemplates) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.name} (${t.id})`;
    sel.appendChild(opt);
  }
}

async function renderAgents() {
  await loadForgeTemplates();
  const box = $('#agentCards');
  box.innerHTML = '';
  const data = await api.get('/api/agents');
  for (const a of data.agents) {
    const card = document.createElement('div');
    card.className = 'card';
    const h = document.createElement('h3');
    h.textContent = `${a.name} · ${a.forge_template_id} · ${a.status}`;
    const sub = document.createElement('div');
    sub.className = 'muted';
    const rings = a.ptcna_summary || {};
    sub.textContent = `task: ${a.task || '—'} · PTCNA φ=${rings.phi?.n ?? '?'} ψ=${rings.psi?.n ?? '?'} ω=${rings.omega?.n ?? '?'} ml=${rings.memory_l?.n ?? '?'} ms=${rings.memory_s?.n ?? '?'} · module ${a.renderer || 'none'}`;
    const row = document.createElement('div');
    row.className = 'row model-row';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'primary-btn';
    open.textContent = 'Open chat';
    open.onclick = () => openConversation(a.conversation_id);
    const infer = document.createElement('button');
    infer.type = 'button';
    infer.className = 'chip';
    infer.textContent = 'PTCNA infer';
    infer.onclick = async () => {
      try {
        const r = await api.post(`/api/agents/${a.id}/ptcna/infer`, { input: a.task || 'observe' });
        toast(`PTCNA infer φ coherence ${r.summary?.phi?.coherence ?? '?'} (producer engine).`);
        await renderAgents();
      } catch (err) { toast(err.message, true); }
    };
    const swap = document.createElement('button');
    swap.type = 'button';
    swap.className = 'chip';
    swap.textContent = 'Swap module';
    swap.onclick = async () => {
      const next = a.renderer === 'agent-panel' ? 'agent-stats' : 'agent-panel';
      try {
        await api.post(`/api/agent-modules/${a.module_id}/swap`, { renderer: next });
        toast(`Module swapped to ${next}; state preserved.`);
        await renderAgents();
      } catch (err) { toast(err.message, true); }
    };
    const retire = document.createElement('button');
    retire.type = 'button';
    retire.className = 'chip danger';
    retire.textContent = 'Retire';
    retire.onclick = async () => {
      try {
        await api.post(`/api/agents/${a.id}/retire`);
        await renderAgents();
      } catch (err) { toast(err.message, true); }
    };
    row.append(open, infer, swap, retire);
    const orig = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = 'Exact archived description / effective instructions';
    const pre = document.createElement('pre');
    pre.className = 'context-preview';
    pre.textContent = `ORIGINAL (${a.original_definition?.source || 'archive'}):\n${a.original_definition?.system_prompt || ''}\n\nEFFECTIVE:\n${a.effective_instructions || ''}`;
    orig.append(sum, pre);
    card.append(h, sub, row, orig);
    box.appendChild(card);
  }
}

$('#agentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api.post('/api/agents', {
      name: $('#agentName').value.trim(),
      templateId: $('#agentTemplate').value,
      provider: $('#agentProvider').value,
      task: $('#agentTask').value.trim(),
    });
    toast(`Agent ${r.agent.name} created (PTCNA ${r.ptcnaError ? 'sidecar error: ' + r.ptcnaError : 'state ready'}).`);
    $('#agentForm').reset();
    await renderAgents();
  } catch (err) { toast(err.message, true); }
});

// Render agents when the view opens (hook into existing view switching).
const _origShowView = showView;
showView = function (name) {
  _origShowView(name);
  if (name === 'agents') renderAgents().catch((e) => toast(e.message, true));
};
