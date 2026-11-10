// A0 phone-first web client. Served by apps/server; same-origin API with cookies.
// Usage: Menu opens saved history; comparison layout applies to saved/live rounds.
// Owner-scoped sessionStorage holds unsent drafts, never provider keys/transcripts.
import { renderMarkdown } from './markdown.js';
import { GUI_MSDMD } from './gui-msdmd.mjs';

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
  pendingNavigation: null,
  historyRevisions: {}, // Terminal stream events invalidate in-flight snapshots.
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
  const loader = { providers: loadProviders, participants: loadParticipants, mcp: loadMcp, projects: loadProjects, about: loadAbout, system: loadSystem, ahbg: loadAhbg }[name];
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
  state.pendingNavigation = navigation;
  let data;
  try {
    let revision;
    do {
      revision = state.historyRevisions[id] || 0;
      data = await api.get(`/api/conversations/${id}`);
      if (navigation !== state.navigation) return; // Never hijack a newer selection.
      // A run may finish after this request took its snapshot. Read its final
      // history before adopting the view, without starting a new navigation.
    } while (revision !== (state.historyRevisions[id] || 0));
  } finally {
    if (state.pendingNavigation === navigation) state.pendingNavigation = null;
  }
  persistComposer(); // Preserve edits made while the detail request was pending.
  if (adoptNewDraft && !state.currentConversationId) {
    // Migrate at the actual switch, after both creation and detail requests.
    persistComposer();
    state.drafts[id] = state.drafts.new || { content: '', attachments: [] };
    delete state.drafts.new;
    for (const upload of state.uploads) if (upload.key === 'new') upload.key = id;
    if (recognitionKey === 'new') recognitionKey = id;
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
  // F02: capture originating identity BEFORE awaiting; discard if navigation
  // supersedes this read.
  const conversationId = state.currentConversationId;
  const navigation = state.navigation;
  const data = await api.get(`/api/conversations/${conversationId}`);
  if (state.currentConversationId !== conversationId || state.navigation !== navigation) return;
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
    // F02: save only to the conversation this dialog was opened for.
    if (state.currentConversationId !== conversationId) {
      hideContextModal();
      toast('Navigation changed while the dialog was open. Nothing was saved.', true);
      return;
    }
    const ids = [...list.querySelectorAll('input:checked')].map((i) => i.dataset.id);
    await api.patch(`/api/conversations/${conversationId}`, {
      contextPolicy: { mode: 'selected', selectedMessageIds: ids },
    });
    state.currentConversation.context_policy = { mode: 'selected', selectedMessageIds: ids };
    renderContextPolicy(state.currentConversation.context_policy);
    hideContextModal();
  };
  $('#contextAllBtn').onclick = async () => {
    if (state.currentConversationId !== conversationId) {
      hideContextModal();
      toast('Navigation changed while the dialog was open. Nothing was saved.', true);
      return;
    }
    await api.patch(`/api/conversations/${conversationId}`, {
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
    // F03: remember which participant the owner just tapped so Continue can
    // carry the intended single-model target.
    state.pendingSwitch = { participantIds: next, targetId: id };
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
    // C03/F03: Continue is the tapped single model with full intended context.
    const singleId = state.pendingSwitch?.targetId || nextIds[0] || state.selectedParticipantIds[0] || (state.participants[0] && state.participants[0].id);
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
    // F04: supported settings editor with actual write path and unavailable
    // reasons rendered from the current capability view.
    const settings = document.createElement('details');
    settings.className = 'settings-editor';
    const settingsSum = document.createElement('summary');
    settingsSum.textContent = 'Settings (effective values)';
    settings.appendChild(settingsSum);
    const settingsGrid = document.createElement('div');
    settingsGrid.className = 'settings-grid';
    const caps = p.capabilities || {};
    const eff = p.settings || {};
    const effortLabel = document.createElement('label');
    effortLabel.className = 'muted';
    const effortSel = document.createElement('select');
    effortSel.className = 'select';
    const efforts = caps.reasoningEffort || [];
    if (efforts.length) {
      const none = document.createElement('option');
      none.value = ''; none.textContent = 'reasoning effort: unset';
      if (!eff.reasoningEffort) none.selected = true;
      effortSel.appendChild(none);
      for (const e of efforts) {
        const opt = document.createElement('option');
        opt.value = e; opt.textContent = `reasoning effort: ${e}`;
        if (eff.reasoningEffort === e) opt.selected = true;
        effortSel.appendChild(opt);
      }
      effortLabel.append(document.createTextNode('Reasoning effort '), effortSel);
    } else {
      effortLabel.textContent = 'reasoning effort: not supported by this model';
    }
    settingsGrid.appendChild(effortLabel);
    const maxTok = document.createElement('label');
    maxTok.className = 'muted';
    maxTok.textContent = 'Max output tokens ';
    const maxTokInput = document.createElement('input');
    maxTokInput.type = 'number'; maxTokInput.min = '1'; maxTokInput.className = 'narrow';
    maxTokInput.value = eff.maxOutputTokens || '';
    maxTokInput.placeholder = 'default';
    maxTok.appendChild(maxTokInput);
    settingsGrid.appendChild(maxTok);
    const timeout = document.createElement('label');
    timeout.className = 'muted';
    timeout.textContent = 'Timeout ms ';
    const timeoutInput = document.createElement('input');
    timeoutInput.type = 'number'; timeoutInput.min = '1000'; timeoutInput.className = 'narrow';
    timeoutInput.value = eff.timeoutMs || '';
    timeoutInput.placeholder = 'default';
    timeout.appendChild(timeoutInput);
    settingsGrid.appendChild(timeout);
    const toolScope = document.createElement('label');
    toolScope.className = 'muted';
    toolScope.textContent = 'Tool scope ';
    const toolSel = document.createElement('select');
    toolSel.className = 'select';
    for (const [val, label] of [['all', 'all discovered tools'], ['none', 'no tools']]) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if (val === 'all' && !Array.isArray(eff.toolSelection)) opt.selected = true;
      if (val === 'none' && Array.isArray(eff.toolSelection) && eff.toolSelection.length === 0) opt.selected = true;
      toolSel.appendChild(opt);
    }
    if (Array.isArray(eff.toolSelection) && eff.toolSelection.length) {
      const allow = document.createElement('option');
      allow.value = 'allow'; allow.textContent = `allowlist (${eff.toolSelection.length})`; allow.selected = true;
      toolSel.appendChild(allow);
    }
    toolScope.appendChild(toolSel);
    settingsGrid.appendChild(toolScope);
    const saveSettings = document.createElement('button');
    saveSettings.type = 'button';
    saveSettings.className = 'chip';
    saveSettings.textContent = 'Save settings';
    saveSettings.onclick = async () => {
      const nextSettings = { ...eff };
      if (effortSel.options?.length) {
        if (effortSel.value) nextSettings.reasoningEffort = effortSel.value; else delete nextSettings.reasoningEffort;
      }
      const mt = Number(maxTokInput.value);
      if (mt > 0) nextSettings.maxOutputTokens = mt; else delete nextSettings.maxOutputTokens;
      const to = Number(timeoutInput.value);
      if (to > 0) nextSettings.timeoutMs = to; else delete nextSettings.timeoutMs;
      if (toolSel.value === 'none') nextSettings.toolSelection = [];
      else if (toolSel.value === 'all') delete nextSettings.toolSelection;
      try {
        await api.patch(`/api/participants/${p.id}`, { settings: nextSettings });
        toast(`Saved settings for ${p.name}. The next request uses them.`);
        await loadParticipants();
      } catch (err) { toast(err.message, true); }
    };
    settingsGrid.appendChild(saveSettings);
    settings.appendChild(settingsGrid);
    card.appendChild(settings);
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
    // F04: supported settings editor with actual write path and unavailable
    // reasons rendered from the current capability view.
    const settings = document.createElement('details');
    settings.className = 'settings-editor';
    const settingsSum = document.createElement('summary');
    settingsSum.textContent = 'Settings (effective values)';
    settings.appendChild(settingsSum);
    const settingsGrid = document.createElement('div');
    settingsGrid.className = 'settings-grid';
    const caps = p.capabilities || {};
    const eff = p.settings || {};
    const effortLabel = document.createElement('label');
    effortLabel.className = 'muted';
    const effortSel = document.createElement('select');
    effortSel.className = 'select';
    const efforts = caps.reasoningEffort || [];
    if (efforts.length) {
      const none = document.createElement('option');
      none.value = ''; none.textContent = 'reasoning effort: unset';
      if (!eff.reasoningEffort) none.selected = true;
      effortSel.appendChild(none);
      for (const e of efforts) {
        const opt = document.createElement('option');
        opt.value = e; opt.textContent = `reasoning effort: ${e}`;
        if (eff.reasoningEffort === e) opt.selected = true;
        effortSel.appendChild(opt);
      }
      effortLabel.append(document.createTextNode('Reasoning effort '), effortSel);
    } else {
      effortLabel.textContent = 'reasoning effort: not supported by this model';
    }
    settingsGrid.appendChild(effortLabel);
    const maxTok = document.createElement('label');
    maxTok.className = 'muted';
    maxTok.textContent = 'Max output tokens ';
    const maxTokInput = document.createElement('input');
    maxTokInput.type = 'number'; maxTokInput.min = '1'; maxTokInput.className = 'narrow';
    maxTokInput.value = eff.maxOutputTokens || '';
    maxTokInput.placeholder = 'default';
    maxTok.appendChild(maxTokInput);
    settingsGrid.appendChild(maxTok);
    const timeout = document.createElement('label');
    timeout.className = 'muted';
    timeout.textContent = 'Timeout ms ';
    const timeoutInput = document.createElement('input');
    timeoutInput.type = 'number'; timeoutInput.min = '1000'; timeoutInput.className = 'narrow';
    timeoutInput.value = eff.timeoutMs || '';
    timeoutInput.placeholder = 'default';
    timeout.appendChild(timeoutInput);
    settingsGrid.appendChild(timeout);
    const toolScope = document.createElement('label');
    toolScope.className = 'muted';
    toolScope.textContent = 'Tool scope ';
    const toolSel = document.createElement('select');
    toolSel.className = 'select';
    for (const [val, label] of [['all', 'all discovered tools'], ['none', 'no tools']]) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if (val === 'all' && !Array.isArray(eff.toolSelection)) opt.selected = true;
      if (val === 'none' && Array.isArray(eff.toolSelection) && eff.toolSelection.length === 0) opt.selected = true;
      toolSel.appendChild(opt);
    }
    if (Array.isArray(eff.toolSelection) && eff.toolSelection.length) {
      const allow = document.createElement('option');
      allow.value = 'allow'; allow.textContent = `allowlist (${eff.toolSelection.length})`; allow.selected = true;
      toolSel.appendChild(allow);
    }
    toolScope.appendChild(toolSel);
    settingsGrid.appendChild(toolScope);
    const saveSettings = document.createElement('button');
    saveSettings.type = 'button';
    saveSettings.className = 'chip';
    saveSettings.textContent = 'Save settings';
    saveSettings.onclick = async () => {
      const nextSettings = { ...eff };
      if (effortSel.options?.length) {
        if (effortSel.value) nextSettings.reasoningEffort = effortSel.value; else delete nextSettings.reasoningEffort;
      }
      const mt = Number(maxTokInput.value);
      if (mt > 0) nextSettings.maxOutputTokens = mt; else delete nextSettings.maxOutputTokens;
      const to = Number(timeoutInput.value);
      if (to > 0) nextSettings.timeoutMs = to; else delete nextSettings.timeoutMs;
      if (toolSel.value === 'none') nextSettings.toolSelection = [];
      else if (toolSel.value === 'all') delete nextSettings.toolSelection;
      try {
        await api.patch(`/api/participants/${p.id}`, { settings: nextSettings });
        toast(`Saved settings for ${p.name}. The next request uses them.`);
        await loadParticipants();
      } catch (err) { toast(err.message, true); }
    };
    settingsGrid.appendChild(saveSettings);
    settings.appendChild(settingsGrid);
    card.appendChild(settings);
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
    // F10: expose discovered tool names, descriptions and input schemas
    // without executing anything.
    const tools = document.createElement('div');
    tools.className = 'tool-list';
    for (const t of c.tools || []) {
      const det = document.createElement('details');
      const sum = document.createElement('summary');
      sum.textContent = `${t.name} — ${t.description || 'no description'}`;
      const schema = document.createElement('pre');
      schema.className = 'context-preview';
      schema.textContent = JSON.stringify(t.inputSchema || {}, null, 2);
      det.append(sum, schema);
      tools.appendChild(det);
    }
    if (!(c.tools || []).length) tools.textContent = 'No tools discovered yet.';
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
    card.append(h, sub, status, tools, row);
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
    // F04: supported settings editor with actual write path and unavailable
    // reasons rendered from the current capability view.
    const settings = document.createElement('details');
    settings.className = 'settings-editor';
    const settingsSum = document.createElement('summary');
    settingsSum.textContent = 'Settings (effective values)';
    settings.appendChild(settingsSum);
    const settingsGrid = document.createElement('div');
    settingsGrid.className = 'settings-grid';
    const caps = p.capabilities || {};
    const eff = p.settings || {};
    const effortLabel = document.createElement('label');
    effortLabel.className = 'muted';
    const effortSel = document.createElement('select');
    effortSel.className = 'select';
    const efforts = caps.reasoningEffort || [];
    if (efforts.length) {
      const none = document.createElement('option');
      none.value = ''; none.textContent = 'reasoning effort: unset';
      if (!eff.reasoningEffort) none.selected = true;
      effortSel.appendChild(none);
      for (const e of efforts) {
        const opt = document.createElement('option');
        opt.value = e; opt.textContent = `reasoning effort: ${e}`;
        if (eff.reasoningEffort === e) opt.selected = true;
        effortSel.appendChild(opt);
      }
      effortLabel.append(document.createTextNode('Reasoning effort '), effortSel);
    } else {
      effortLabel.textContent = 'reasoning effort: not supported by this model';
    }
    settingsGrid.appendChild(effortLabel);
    const maxTok = document.createElement('label');
    maxTok.className = 'muted';
    maxTok.textContent = 'Max output tokens ';
    const maxTokInput = document.createElement('input');
    maxTokInput.type = 'number'; maxTokInput.min = '1'; maxTokInput.className = 'narrow';
    maxTokInput.value = eff.maxOutputTokens || '';
    maxTokInput.placeholder = 'default';
    maxTok.appendChild(maxTokInput);
    settingsGrid.appendChild(maxTok);
    const timeout = document.createElement('label');
    timeout.className = 'muted';
    timeout.textContent = 'Timeout ms ';
    const timeoutInput = document.createElement('input');
    timeoutInput.type = 'number'; timeoutInput.min = '1000'; timeoutInput.className = 'narrow';
    timeoutInput.value = eff.timeoutMs || '';
    timeoutInput.placeholder = 'default';
    timeout.appendChild(timeoutInput);
    settingsGrid.appendChild(timeout);
    const toolScope = document.createElement('label');
    toolScope.className = 'muted';
    toolScope.textContent = 'Tool scope ';
    const toolSel = document.createElement('select');
    toolSel.className = 'select';
    for (const [val, label] of [['all', 'all discovered tools'], ['none', 'no tools']]) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if (val === 'all' && !Array.isArray(eff.toolSelection)) opt.selected = true;
      if (val === 'none' && Array.isArray(eff.toolSelection) && eff.toolSelection.length === 0) opt.selected = true;
      toolSel.appendChild(opt);
    }
    if (Array.isArray(eff.toolSelection) && eff.toolSelection.length) {
      const allow = document.createElement('option');
      allow.value = 'allow'; allow.textContent = `allowlist (${eff.toolSelection.length})`; allow.selected = true;
      toolSel.appendChild(allow);
    }
    toolScope.appendChild(toolSel);
    settingsGrid.appendChild(toolScope);
    const saveSettings = document.createElement('button');
    saveSettings.type = 'button';
    saveSettings.className = 'chip';
    saveSettings.textContent = 'Save settings';
    saveSettings.onclick = async () => {
      const nextSettings = { ...eff };
      if (effortSel.options?.length) {
        if (effortSel.value) nextSettings.reasoningEffort = effortSel.value; else delete nextSettings.reasoningEffort;
      }
      const mt = Number(maxTokInput.value);
      if (mt > 0) nextSettings.maxOutputTokens = mt; else delete nextSettings.maxOutputTokens;
      const to = Number(timeoutInput.value);
      if (to > 0) nextSettings.timeoutMs = to; else delete nextSettings.timeoutMs;
      if (toolSel.value === 'none') nextSettings.toolSelection = [];
      else if (toolSel.value === 'all') delete nextSettings.toolSelection;
      try {
        await api.patch(`/api/participants/${p.id}`, { settings: nextSettings });
        toast(`Saved settings for ${p.name}. The next request uses them.`);
        await loadParticipants();
      } catch (err) { toast(err.message, true); }
    };
    settingsGrid.appendChild(saveSettings);
    settings.appendChild(settingsGrid);
    card.appendChild(settings);
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
    if (state.currentConversationId === conversationId && state.pendingNavigation === null) {
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
    state.historyRevisions[conversationId] = (state.historyRevisions[conversationId] || 0) + 1;
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
let recognitionKey = null;

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
      state.pendingNavigation = null;
      state.historyRevisions = {};
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
  // F02: capture originating identity BEFORE awaiting.
  const conversationId = state.currentConversationId;
  const navigation = state.navigation;
  const data = await api.get(`/api/conversations/${conversationId}/context`);
  if (state.currentConversationId !== conversationId || state.navigation !== navigation) return;
  contextEditorState = {
    conversationId,
    navigation,
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
  // F02: a stale editor never writes another conversation's revision.
  if (state.currentConversationId !== contextEditorState.conversationId || state.navigation !== contextEditorState.navigation) {
    toast('Navigation changed while the editor was open. Nothing was saved.', true);
    contextEditorState.editing = false;
    $('#contextEditorModal').classList.add('hidden');
    return;
  }
  const blocks = contextEditorState.blocks.map((b) => {
    const textarea = document.querySelector(`#contextBlockList textarea[data-block-id="${CSS.escape(b.id)}"]`);
    const checkbox = document.querySelector(`#contextBlockList input[data-field="included"][data-block-id="${CSS.escape(b.id)}"]`);
    return {
      id: b.id,
      source: b.source,
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
    const rings = a.ptcna_summary || {};
    // F07: the selected renderer is a distinct presentation, not a label.
    if (a.renderer === 'agent-stats') {
      h.textContent = `${a.name} · stats module`;
      card.appendChild(h);
      const stats = document.createElement('div');
      stats.className = 'stats-grid';
      stats.innerHTML = `<div><strong>φ</strong><p>n=${rings.phi?.n ?? '?'} coherence=${rings.phi?.coherence ?? '?'}</p></div>
        <div><strong>ψ</strong><p>n=${rings.psi?.n ?? '?'} coherence=${rings.psi?.coherence ?? '?'}</p></div>
        <div><strong>ω</strong><p>n=${rings.omega?.n ?? '?'} coherence=${rings.omega?.coherence ?? '?'}</p></div>
        <div><strong>memory_l</strong><p>n=${rings.memory_l?.n ?? '?'} hub=${rings.memory_l?.hub_avg ?? '?'}</p></div>
        <div><strong>memory_s</strong><p>n=${rings.memory_s?.n ?? '?'}</p></div>
        <div><strong>module</strong><p>${escapeHtml(a.renderer || 'none')} · instance ${escapeHtml(a.module_id || '—').slice(0, 8)}</p></div>`;
      card.appendChild(stats);
    } else {
      h.textContent = `${a.name} · ${a.forge_template_id} · ${a.status}`;
      card.appendChild(h);
      const sub = document.createElement('div');
      sub.className = 'muted';
      sub.textContent = `task: ${a.task || '—'} · PTCNA φ=${rings.phi?.n ?? '?'} ψ=${rings.psi?.n ?? '?'} ω=${rings.omega?.n ?? '?'} ml=${rings.memory_l?.n ?? '?'} ms=${rings.memory_s?.n ?? '?'} · module ${a.renderer || 'none'}`;
      card.appendChild(sub);
    }
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
    card.append(row, orig);
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

// ---------- G02/G03/G04 System explorer + personal knowledge ----------
const systemState = { data: null, tab: 'narrative', state: null, category: null, selected: null };

async function loadSystem() {
  if (!systemState.data) {
    systemState.data = await api.get('/api/system');
  }
  const d = systemState.data;
  const tabs = $$('#systemTabs .chip');
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.sysview === systemState.tab));
  const states = [...new Set(d.objects.map((o) => o.state))];
  const sf = $('#systemStateFilters');
  sf.innerHTML = '';
  const allStates = document.createElement('button');
  allStates.className = 'chip' + (systemState.state === null ? ' active' : '');
  allStates.textContent = 'All';
  allStates.dataset.state = '';
  allStates.onclick = () => { systemState.state = null; loadSystem(); };
  sf.appendChild(allStates);
  for (const st of states) {
    const b = document.createElement('button');
    b.className = 'chip' + (systemState.state === st ? ' active' : '');
    b.textContent = st;
    b.dataset.state = st;
    b.onclick = () => { systemState.state = st === systemState.state ? null : st; loadSystem(); };
    sf.appendChild(b);
  }
  const cats = [...new Set(d.objects.flatMap((o) => o.categories))].sort();
  const cf = $('#systemCategoryFilters');
  cf.innerHTML = '';
  const allCats = document.createElement('button');
  allCats.className = 'chip' + (systemState.category === null ? ' active' : '');
  allCats.textContent = 'All categories';
  allCats.dataset.cat = '';
  allCats.onclick = () => { systemState.category = null; loadSystem(); };
  cf.appendChild(allCats);
  for (const c of cats) {
    const b = document.createElement('button');
    b.className = 'chip' + (systemState.category === c ? ' active' : '');
    b.textContent = c;
    b.dataset.cat = c;
    b.onclick = () => { systemState.category = c === systemState.category ? null : c; loadSystem(); };
    cf.appendChild(b);
  }
  renderSystemMain();
}

function filteredObjects() {
  let objs = systemState.data.objects;
  if (systemState.state) objs = objs.filter((o) => o.state === systemState.state);
  if (systemState.category) objs = objs.filter((o) => o.categories.includes(systemState.category));
  return objs;
}

function systemObjectRow(o) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'list-item';
  btn.innerHTML = `<span class="badge state-${escapeHtml(o.state)}">${escapeHtml(o.state)}</span><span class="strong">${escapeHtml(o.label)}</span><span class="muted">${escapeHtml(o.kind)} · ${escapeHtml(o.categories.join(', '))}</span>`;
  btn.onclick = () => showSystemDetail(o.id);
  return btn;
}

function showSystemDetail(id) {
  const o = systemState.data.objects.find((x) => x.id === id);
  if (!o) return;
  systemState.selected = id;
  const detail = $('#systemDetail');
  detail.classList.remove('hidden');
  detail.innerHTML = `
    <h3>${escapeHtml(o.label)} <span class="muted">(${escapeHtml(o.id)})</span></h3>
    <p>${escapeHtml(o.description)}</p>
    <p class="muted">kind: ${escapeHtml(o.kind)} · categories: ${escapeHtml(o.categories.join(', '))} · state: ${escapeHtml(o.state)} · source: ${escapeHtml(o.source)}</p>
    <p class="muted">freshness: ${escapeHtml(systemState.data.provenance.buildCommit)} · reliability: ${escapeHtml(o.evidence?.reliability || 'F')} · credibility: ${escapeHtml(String(o.evidence?.credibility ?? 6))}</p>
    <p class="muted">${escapeHtml(o.evidence?.basis || 'Source declaration; no runtime observation recorded for this object.')}</p>
    <h4>Next steps</h4>
    <div class="next-cols">
      <div><strong>Minimal</strong><p>${escapeHtml(o.next.minimal)}</p></div>
      <div><strong>Maximal feasible</strong><p>${escapeHtml(o.next.maximalFeasible)}</p></div>
      <div><strong>Maximal potential</strong><p>${escapeHtml(o.next.maximalPotential)}</p></div>
    </div>
    <div class="row">
      <button class="chip" id="intentBtn">Select intention (does not execute)</button>
      <button class="chip" id="systemBackBtn">← Back</button>
    </div>
    <p class="muted" id="intentNote"></p>
    <h4>Related</h4>
    <div id="systemRelations"></div>`;
  const rels = systemState.data.relations.filter((r) => r.from === id || r.to === id);
  const relBox = $('#systemRelations');
  relBox.innerHTML = '';
  if (!rels.length) relBox.textContent = 'No recorded relations.';
  for (const r of rels) {
    const other = r.from === id ? r.to : r.from;
    const otherObj = systemState.data.objects.find((x) => x.id === other);
    const line = document.createElement('button');
    line.type = 'button';
    line.className = 'list-item';
    line.innerHTML = `<span class="badge">${escapeHtml(r.kind)}</span>${escapeHtml(r.label)} <span class="strong">${escapeHtml(otherObj?.label || other)}</span>`;
    line.onclick = () => showSystemDetail(other);
    relBox.appendChild(line);
  }
  $('#intentBtn').onclick = () => {
    $('#intentNote').textContent = 'Intention recorded locally for this view. It is not dispatched; reload discards it.';
  };
  $('#systemBackBtn').onclick = () => renderSystemMain();
  detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderSystemMain() {
  const main = $('#systemMain');
  const d = systemState.data;
  $('#systemDetail').classList.add('hidden');
  if (systemState.tab === 'narrative') {
    main.innerHTML = '<p class="muted">System + nested narrative contexts. Tap objects to inspect their connections.</p>';
    const kinds = ['view', 'skill', 'data', 'boundary', 'operation', 'attention'];
    for (const kind of kinds) {
      const items = filteredObjects().filter((o) => o.kind === kind);
      if (!items.length) continue;
      const sec = document.createElement('div');
      sec.className = 'card';
      const h = document.createElement('h3');
      h.textContent = kind[0].toUpperCase() + kind.slice(1) + 's';
      sec.appendChild(h);
      const list = document.createElement('div');
      list.className = 'list';
      for (const o of items) list.appendChild(systemObjectRow(o));
      sec.appendChild(list);
      main.appendChild(sec);
    }
  } else if (systemState.tab === 'relations') {
    main.innerHTML = '<p class="muted">Skills require tools; tools expose operations. Recorded relations are source-backed; inferred relations are labeled.</p>';
    const skills = filteredObjects().filter((o) => o.kind === 'skill' || o.kind === 'view');
    const ops = filteredObjects().filter((o) => o.kind === 'operation' || o.kind === 'boundary' || o.kind === 'data');
    const cols = document.createElement('div');
    cols.className = 'relation-cols';
    const colA = document.createElement('div');
    colA.innerHTML = '<h3>Skills / views</h3>';
    const listA = document.createElement('div'); listA.className = 'list';
    for (const o of skills) listA.appendChild(systemObjectRow(o));
    colA.appendChild(listA);
    const colB = document.createElement('div');
    colB.innerHTML = '<h3>Tools / operations / data</h3>';
    const listB = document.createElement('div'); listB.className = 'list';
    for (const o of ops) listB.appendChild(systemObjectRow(o));
    colB.appendChild(listB);
    cols.append(colA, colB);
    main.appendChild(cols);
    const rel = document.createElement('div');
    rel.className = 'card';
    rel.innerHTML = '<h3>Relation edges</h3>';
    const list = document.createElement('div'); list.className = 'list';
    for (const r of d.relations) {
      const line = document.createElement('button');
      line.type = 'button';
      line.className = 'list-item';
      const from = d.objects.find((x) => x.id === r.from);
      const to = d.objects.find((x) => x.id === r.to);
      line.innerHTML = `<span class="badge">${escapeHtml(r.kind)}</span><span class="strong">${escapeHtml(from?.label || r.from)}</span> → ${escapeHtml(r.label)} → <span class="strong">${escapeHtml(to?.label || r.to)}</span>`;
      line.onclick = () => showSystemDetail(r.from);
      list.appendChild(line);
    }
    rel.appendChild(list);
    main.appendChild(rel);
  } else if (systemState.tab === 'attention') {
    main.innerHTML = '<p class="muted">Matters needing attention: broken, under construction, or explicitly recorded gaps.</p>';
    const items = filteredObjects().filter((o) => o.state === 'broken' || o.state === 'construction' || o.kind === 'attention');
    const list = document.createElement('div'); list.className = 'list';
    for (const o of items) list.appendChild(systemObjectRow(o));
    main.appendChild(list);
    if (!items.length) main.innerHTML += '<p class="muted">No attention items for the selected filters.</p>';
  } else if (systemState.tab === 'knowledge') {
    main.innerHTML = '<p class="muted">What information A0 has about you, what it actually uses, and the authority for that use. Inferred and unknown items are labeled.</p>';
    const table = document.createElement('div');
    table.className = 'card';
    const rows = d.knowledge.map((k) => `
      <div class="list-item">
        <span class="strong">${escapeHtml(k.item)}</span>
        <span class="badge">${k.held === true ? 'held' : k.held === false ? 'not held' : 'unknown'}</span>
        <span>used in: ${escapeHtml(k.usedIn)}</span>
        <span class="muted">authority: ${escapeHtml(k.authority)}</span>
        <p class="muted">${escapeHtml(k.note)}</p>
      </div>`).join('');
    table.innerHTML = rows;
    main.appendChild(table);
    const cond = document.createElement('div');
    cond.className = 'card';
    cond.innerHTML = '<h3>Action-decision conditions</h3><p class="muted">The System view returns an action for your decision when it involves any of:</p>' + d.decisionConditions.map((c) => `<div class="list-item">• ${escapeHtml(c)}</div>`).join('');
    main.appendChild(cond);
  }
}

$('#systemTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-sysview]');
  if (!btn) return;
  systemState.tab = btn.dataset.sysview;
  loadSystem();
});

// ---------- G14 AHBG view ----------
async function loadAhbg() {
  const sel = $('#ahbgAgent');
  // F11: refresh eligible agents on every entry; preserve a valid selection.
  const previous = sel.value;
  const agents = await api.get('/api/agents');
  sel.innerHTML = '';
  const eligible = (agents.agents || []).filter((a) => a.status !== 'retired');
  for (const a of eligible) {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = `${a.name} · ${a.forge_template_id} · ${a.status}`;
    sel.appendChild(opt);
  }
  if (!eligible.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Create a Forge agent first';
    sel.appendChild(opt);
  } else if (previous && eligible.some((a) => a.id === previous)) {
    sel.value = previous;
  }
  const box = $('#ahbgSessions');
  box.innerHTML = '';
  const data = await api.get('/api/ahbg/sessions');
  for (const s of data.sessions) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h3>${escapeHtml(s.game_session_id)} <span class="muted">· seed ${escapeHtml(s.seed)} · ${escapeHtml(s.status)} · turn ${escapeHtml(s.turn)}/${escapeHtml(s.turns)}</span></h3>`;
    const row = document.createElement('div');
    row.className = 'row';
    const inspect = document.createElement('button');
    inspect.type = 'button'; inspect.className = 'primary-btn'; inspect.textContent = 'Inspect';
    inspect.onclick = () => renderAhbgDetail(s.id);
    const turn = document.createElement('button');
    turn.type = 'button'; turn.className = 'chip'; turn.textContent = 'Next turn';
    turn.disabled = s.status === 'complete';
    turn.onclick = async () => {
      try {
        const r = await api.post(`/api/ahbg/sessions/${s.id}/turn`);
        toast(`Turn ${r.turn?.turn ?? '?'} resolved (digest ${String(r.turn?.state_digest || '').slice(0, 8)}).`);
        await loadAhbg();
        await renderAhbgDetail(s.id);
      } catch (err) { toast(err.message, true); }
    };
    const replay = document.createElement('button');
    replay.type = 'button'; replay.className = 'chip'; replay.textContent = 'Replay';
    replay.onclick = async () => {
      try {
        const r = await api.get(`/api/ahbg/sessions/${s.id}/replay`);
        toast(r.match ? 'Replay matches the live field.' : 'Replay mismatch — inspect the session.', !r.match);
      } catch (err) { toast(err.message, true); }
    };
    row.append(inspect, turn, replay);
    card.appendChild(row);
    box.appendChild(card);
  }
}

async function renderAhbgDetail(id) {
  const d = await api.get(`/api/ahbg/sessions/${id}`);
  const s = d.session;
  const live = d.live;
  const detail = $('#ahbgDetail');
  detail.classList.remove('hidden');
  detail.innerHTML = `<h3>${escapeHtml(s.game_session_id)}</h3>
    <p class="muted">seed ${escapeHtml(s.seed)} · turns ${escapeHtml(s.turn)}/${escapeHtml(s.turns)} · status ${escapeHtml(s.status)}</p>
    <div id="ahbgBoard" class="context-preview"></div>
    <h4>Records</h4>
    <div id="ahbgRecords" class="context-preview"></div>
    <h4>Mechanics</h4>
    <div id="ahbgMechanics"></div>`;
  $('#ahbgBoard').textContent = JSON.stringify({ turn: live?.board?.turn ?? s.turn, field: live?.board?.field ?? (s.board?.field || null), legalActionCount: live?.board?.legal?.length ?? '—' }, null, 2);
  $('#ahbgRecords').textContent = JSON.stringify(s.records || [], null, 2);
  const mech = await api.get('/api/ahbg/mechanics');
  $('#ahbgMechanics').innerHTML = '<table class="mini-table"><tr><th>Mechanic</th><th>Implementation</th><th>Status</th></tr>' +
    mech.mechanics.map((m) => `<tr><td>${escapeHtml(m.mechanic)}</td><td class="muted">${escapeHtml(m.implementation)}</td><td>${escapeHtml(m.status)}</td></tr>`).join('') + '</table>';
}

$('#ahbgForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api.post('/api/ahbg/sessions', {
      agentId: $('#ahbgAgent').value,
      seed: Number($('#ahbgSeed').value) || 1,
      turns: Number($('#ahbgTurns').value) || 8,
    });
    toast(`AHBG session created (turn ${r.summary?.board?.turn ?? 0}, ${r.summary?.board?.legal?.length ?? 0} legal actions).`);
    $('#ahbgForm').reset();
    await loadAhbg();
    await renderAhbgDetail(r.session.id);
  } catch (err) { toast(err.message, true); }
});

// ---------- G15 MSDMD inspector (read-only) ----------
const msdmdState = { subjectId: 'gui', lastValid: null, lastError: null, loadedAt: null, healthCommit: null };

function viewSubjectFor(name) {
  return GUI_MSDMD.subjects.some((s) => s.id === name) ? name : 'gui';
}

async function openMsdmd(subjectId = 'gui') {
  // GM05/GM06: read-only refresh; on failure keep the last valid payload.
  const subject = viewSubjectFor(subjectId);
  let healthCommit = null;
  try {
    const health = await api.get('/api/health');
    healthCommit = health?.build?.commit || null;
  } catch (err) {
    msdmdState.lastError = err.message;
  }
  msdmdState.subjectId = subject;
  msdmdState.healthCommit = healthCommit;
  msdmdState.lastValid = GUI_MSDMD;
  msdmdState.loadedAt = new Date().toISOString();
  renderMsdmd();
  $('#msdmdModal').classList.remove('hidden');
}

function renderMsdmd() {
  const subjectId = msdmdState.subjectId;
  const subject = msdmdState.lastValid?.subjects?.find((s) => s.id === subjectId) || msdmdState.lastValid?.subjects?.[0];
  if (!subject) {
    $('#msdmdBody').textContent = 'MSDMD collection unavailable.';
    return;
  }
  $('#msdmdTitle').textContent = `${subject.identity.name} — ${subject.qualifiedId}`;
  const stale = $('#msdmdStale');
  stale.classList.add('hidden');
  if (msdmdState.healthCommit && msdmdState.lastValid?.buildIdentity?.commit && msdmdState.healthCommit !== msdmdState.lastValid.buildIdentity.commit) {
    stale.textContent = `Stale: served build ${msdmdState.healthCommit} differs from collection identity ${msdmdState.lastValid.buildIdentity.commit}.`;
    stale.classList.remove('hidden');
  } else if (msdmdState.lastError) {
    stale.textContent = `Refresh failed: ${msdmdState.lastError}. Showing the last valid collection from ${msdmdState.loadedAt || 'unknown'}.`;
    stale.classList.remove('hidden');
  }
  const sel = $('#msdmdSubject');
  const prev = sel.value || subjectId;
  sel.innerHTML = '';
  for (const s of msdmdState.lastValid.subjects) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.identity.name} (${s.qualifiedId})`;
    sel.appendChild(opt);
  }
  sel.value = msdmdState.lastValid.subjects.some((s) => s.id === prev) ? prev : subjectId;

  const esc = (v) => escapeHtml(String(v ?? ''));
  const sections = [];
  sections.push(`<h4>Identity and purpose</h4><p>${esc(subject.identity.name)} — v${esc(subject.identity.version)}</p><p>${esc(subject.identity.purpose)}</p><p class="muted">scope: ${esc(subject.identity.scope)}</p>`);
  sections.push(`<h4>Structure</h4><p class="muted">parent: ${esc(subject.structure.parent || '—')} · children: ${esc(subject.structure.children.join(', ') || '—')}</p>`);
  if (subject.structure.dependencies.length) {
    sections.push('<ul>' + subject.structure.dependencies.map((d) => `<li><span class="badge">${esc(d.relationKind)}</span> ${esc(d.label)} → ${esc(d.to)} <span class="muted">(${esc(d.source)})</span></li>`).join('') + '</ul>');
  }
  sections.push('<h4>Contracts</h4>' + subject.contracts.map((c) => `<div class="list-item"><strong>${esc(c.label)}</strong><p>${esc(c.description)}</p><p class="muted">${esc(c.source)} · ${esc(c.state)}${c.editor ? ` · editor: ${esc(c.editor)}` : ''}</p></div>`).join(''));
  sections.push(`<h4>Living specification</h4><p>${esc(subject.livingSpec.behavior)}</p><p class="muted">boundaries: ${esc(subject.livingSpec.boundaries)}</p>`);
  if (subject.livingSpec.limitations.length) sections.push('<p class="muted">limitations: ' + subject.livingSpec.limitations.map(esc).join('; ') + '</p>');
  if (subject.livingSpec.hmmm.length) sections.push('<p class="muted">hmmm: ' + subject.livingSpec.hmmm.map(esc).join('; ') + '</p>');
  sections.push('<h4>Evidence</h4>' + subject.evidence.map((e) => `<div class="list-item"><span class="badge">${esc(e.state)}</span> ${esc(e.label)} · <code>${esc(e.command)}</code> · ${esc(e.outcome)}</div>`).join(''));
  sections.push(`<h4>Provenance and freshness</h4><p class="muted">authority: ${esc(subject.provenance.authority)} · path: ${esc(subject.provenance.path)} · schema: ${esc(subject.provenance.collectionSchema)} · reader: ${esc(subject.provenance.reader)} · loaded: ${esc(msdmdState.loadedAt || '—')}</p>`);
  sections.push('<h4>Coverage and conflicts</h4><p class="muted">required: ' + esc(subject.coverage.required.join(', ')) + '</p><p class="muted">eligible: ' + esc(subject.coverage.eligible.join(', ')) + '</p><p class="muted">unsupported: ' + esc(subject.coverage.unsupported.join(', ') || '—') + '</p><p class="muted">exclusions: ' + esc(subject.coverage.exclusions.join(', ') || '—') + '</p><p class="muted">unknown: ' + esc(subject.coverage.unknown.join(', ') || '—') + '</p>');
  sections.push('<details><summary>Structured detail (typed, nested)</summary><pre class="context-preview">' + esc(JSON.stringify(subject.structured, null, 2)) + '</pre></details>');
  $('#msdmdBody').innerHTML = sections.join('');
}

$('#msdmdBtn').onclick = () => openMsdmd(viewSubjectFor(state.view)).catch((e) => toast(e.message, true));
$('#aboutMsdmdBtn').onclick = () => openMsdmd('gui').catch((e) => toast(e.message, true));
$('#msdmdCloseBtn').onclick = () => $('#msdmdModal').classList.add('hidden');
$('#msdmdSubject').onchange = () => { msdmdState.subjectId = $('#msdmdSubject').value; renderMsdmd(); };
