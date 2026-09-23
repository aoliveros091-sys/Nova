(() => {
  'use strict';
  const KEY = 'nova.ai.v1';
  const $ = id => document.getElementById(id);
  const blank = () => ({ id: crypto.randomUUID(), title: 'New chat', messages: [] });
  let state = { chats: [], activeId: '', memory: '', memoryEnabled: true };
  let controller = null;
  let stopped = false;
  let storageAvailable = true;
  let memoryQueue = Promise.resolve();
  let memoryVersion = 0;
  let accessRetryChat = null;
  let modelCatalog = [];
  let defaultModel = '';
  let modelListError = '';
  let modelListLoading = false;
  const statuses = new Map();
  const mobile = matchMedia('(max-width: 767px)');
  const view = $('view-ai');
  const robot = document.querySelector('[data-view="ai"] svg');
  $('aiHeaderRobot').append(robot.cloneNode(true));
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) {
      if (!Array.isArray(saved.chats) || saved.chats.some(c => !c || typeof c.id !== 'string' || typeof c.title !== 'string' || !Array.isArray(c.messages) || c.messages.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string'))) throw new Error('Invalid saved chats');
      state = { chats: saved.chats, activeId: saved.activeId, memory: typeof saved.memory === 'string' ? saved.memory.slice(0, 4000) : '', memoryEnabled: saved.memoryEnabled !== false };
    }
  } catch {
    storageAvailable = false;
    $('aiStorageStatus').textContent = 'Saved chats could not be loaded. Existing data will not be overwritten; new changes are temporary. Export them before leaving.';
  }
  if (!state.chats.length) state.chats.push(blank());
  if (!state.chats.some(c => c.id === state.activeId)) state.activeId = state.chats[0].id;
  const active = () => state.chats.find(c => c.id === state.activeId);
  function renderModels() {
    const select = $('aiModel'); select.replaceChildren();
    const defaultEntry = modelCatalog.find(m => m.id === defaultModel);
    select.add(new Option(defaultEntry ? `Default · ${defaultEntry.name}` : 'Site default', ''));
    for (const [free, label] of [[false, 'Paid models · uses OpenRouter credits'], [true, 'Free models · availability varies']]) {
      const group = document.createElement('optgroup'); group.label = label;
      for (const model of modelCatalog.filter(m => m.free === free)) group.append(new Option(model.name, model.id));
      if (group.children.length) select.append(group);
    }
    const selected = typeof active().model === 'string' ? active().model : '';
    if (selected && !modelCatalog.some(m => m.id === selected)) {
      const option = new Option(`${selected} · ${modelListLoading || modelListError ? 'not checked' : 'unavailable'}`, selected);
      option.disabled = true; select.add(option);
    }
    select.value = selected; select.disabled = Boolean(controller);
    $('aiModelsRefresh').disabled = modelListLoading;
    const entry = modelCatalog.find(m => m.id === (selected || defaultModel));
    $('aiModelStatus').textContent = modelListError || (selected && !entry && !modelListLoading ? 'This saved model is not in the current list. Choose another before sending.' : entry && !entry.free ? 'Paid model · chat and automatic memory may use your OpenRouter credits.' : '');
  }
  async function loadModels() {
    if (modelListLoading) return;
    modelListLoading = true; modelListError = ''; renderModels();
    try {
      const response = await fetch('/api/models', { signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.models)) throw new Error('Model list unavailable');
      modelCatalog = data.models; defaultModel = data.defaultModel;
    } catch { modelListError = 'Model list unavailable. Retry ↻ or use the site default.'; }
    finally { modelListLoading = false; renderModels(); }
  }
  $('aiModel').onchange = () => { active().model = $('aiModel').value; save(); renderModels(); };
  $('aiModelsRefresh').onclick = loadModels;
  function save() {
    if (!storageAvailable) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); $('aiStorageStatus').textContent = ''; }
    catch { $('aiStorageStatus').textContent = 'Browser storage is full or unavailable. Your latest changes are not saved. Export your chats before leaving.'; }
  }
  function setSidebar(open) {
    if (mobile.matches) {
      view.classList.toggle('ai-drawer-open', open);
      $('aiDrawerBackdrop').hidden = !open;
      $('aiHistory').inert = !open;
      document.querySelector('.ai-conversation').inert = open;
      $('aiHistory').setAttribute('role', open ? 'dialog' : 'complementary');
      if (open) { $('aiHistory').setAttribute('aria-modal', 'true'); $('aiSidebarClose').focus(); }
      else { $('aiHistory').removeAttribute('aria-modal'); $('aiSidebarToggle').focus(); }
    } else {
      view.classList.toggle('ai-sidebar-collapsed', !open);
      $('aiHistory').inert = !open;
      if (!open) $('aiSidebarToggle').focus();
    }
    $('aiSidebarToggle').setAttribute('aria-expanded', String(open));
  }
  function resetSidebar() {
    view.classList.remove('ai-drawer-open'); $('aiDrawerBackdrop').hidden = true;
    document.querySelector('.ai-conversation').inert = false;
    $('aiHistory').removeAttribute('aria-modal'); $('aiHistory').removeAttribute('role');
    $('aiHistory').inert = mobile.matches || view.classList.contains('ai-sidebar-collapsed');
    $('aiSidebarToggle').setAttribute('aria-expanded', String(!$('aiHistory').inert));
  }
  $('aiSidebarToggle').onclick = () => setSidebar(true);
  $('aiSidebarClose').onclick = () => setSidebar(false);
  $('aiDrawerBackdrop').onclick = () => setSidebar(false);
  mobile.addEventListener('change', resetSidebar); resetSidebar();
  $('aiHistory').addEventListener('keydown', event => {
    if (!mobile.matches || !view.classList.contains('ai-drawer-open')) return;
    if (event.key === 'Escape') { event.preventDefault(); setSidebar(false); }
    if (event.key === 'Tab') {
      const items = [...$('aiHistory').querySelectorAll('button:not(:disabled), input')].filter(el => el.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  $('aiHistory').querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', resetSidebar));
  function fitComposer() {
    const input = $('aiPrompt'); input.style.height = 'auto';
    input.style.height = `${Math.max(54, Math.min(input.scrollHeight, 180))}px`;
    input.style.overflowY = input.scrollHeight > 180 ? 'auto' : 'hidden';
    $('aiSend').disabled = Boolean(controller) || !input.value.trim();
  }
  $('aiPrompt').addEventListener('input', fitComposer);
  function renderChats() {
    $('aiChats').replaceChildren();
    const query = $('aiSearch').value.trim().toLocaleLowerCase();
    for (const chat of state.chats.filter(chat => chat.title.toLocaleLowerCase().includes(query))) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = chat.title; button.title = chat.title;
      button.setAttribute('aria-current', String(chat.id === state.activeId));
      button.onclick = () => { state.activeId = chat.id; save(); render(); if (mobile.matches) setSidebar(false); };
      $('aiChats').append(button);
    }
    if (!$('aiChats').children.length) { const hint = document.createElement('p'); hint.className = 'ai-no-results'; hint.textContent = 'No matching conversations'; $('aiChats').append(hint); }
  }
  $('aiSearch').addEventListener('input', renderChats);
  // Render a safe Markdown subset using DOM nodes; model output never becomes HTML.
  function inline(parent, text) {
    for (const part of text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g)) {
      if (part.startsWith('`') && part.endsWith('`')) { const el = document.createElement('code'); el.textContent = part.slice(1, -1); parent.append(el); }
      else if (part.startsWith('**') && part.endsWith('**')) { const el = document.createElement('strong'); el.textContent = part.slice(2, -2); parent.append(el); }
      else parent.append(document.createTextNode(part));
    }
  }
  function markdown(parent, text) {
    const lines = text.split('\n');
    let paragraph = [], list = null;
    const flush = () => { if (paragraph.length) { const p = document.createElement('p'); inline(p, paragraph.join('\n')); parent.append(p); paragraph = []; } list = null; };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        flush(); const content = []; while (++i < lines.length && !/^\s*```/.test(lines[i])) content.push(lines[i]);
        const pre = document.createElement('pre'), code = document.createElement('code'); code.textContent = content.join('\n'); pre.append(code); parent.append(pre); continue;
      }
      const heading = line.match(/^(#{1,4})\s+(.+)/);
      if (heading) { flush(); const el = document.createElement(`h${Math.min(heading[1].length + 1, 4)}`); inline(el, heading[2]); parent.append(el); continue; }
      const item = line.match(/^\s*(?:([-*])|\d+\.)\s+(.+)/);
      if (item) {
        const tag = item[1] ? 'UL' : 'OL';
        if (!list || list.tagName !== tag) { flush(); list = document.createElement(tag.toLowerCase()); parent.append(list); }
        const li = document.createElement('li'); inline(li, item[2]); list.append(li); continue;
      }
      if (/^>\s?/.test(line)) { flush(); const quote = document.createElement('blockquote'); inline(quote, line.replace(/^>\s?/, '')); parent.append(quote); continue; }
      if (!line.trim()) { flush(); continue; }
      if (list) flush(); paragraph.push(line);
    }
    flush();
  }
  function render() {
    renderChats();
    renderModels();
    $('aiConversationTitle').textContent = active().title === 'New chat' ? 'New conversation' : active().title;
    $('aiConversationTitle').title = active().title;
    document.querySelector('.ai-conversation').classList.toggle('is-empty', !active().messages.length);
    $('aiMessages').replaceChildren();
    if (!active().messages.length) {
      const empty = document.createElement('div'); empty.className = 'ai-empty';
      const mark = document.createElement('div'); mark.className = 'ai-hero-icon'; mark.append(robot.cloneNode(true));
      const heading = document.createElement('h2'); heading.textContent = 'What can I help you with?';
      const hint = document.createElement('p'); hint.textContent = 'A thought partner, in your orbit.';
      const starters = document.createElement('div'); starters.className = 'ai-starters';
      for (const [symbol, title, promptText] of [
        ['✧', 'Brainstorm an idea', 'Help me brainstorm a creative project. Ask what I enjoy first.'],
        ['◎', 'Explain something', 'Help me understand a tricky topic. Ask what I am learning.'],
        ['✎', 'Help me write', 'Help me write something. Ask what I want to create and who it is for.'],
        ['↗', 'Work through a problem', 'Help me work through a problem step by step. Ask what I am working on.']
      ]) {
        const button = document.createElement('button'); button.type = 'button';
        const icon = document.createElement('span'); icon.className = 'ai-starter-icon'; icon.textContent = symbol;
        const titleEl = document.createElement('span'); titleEl.textContent = title;
        button.append(icon, titleEl);
        button.onclick = () => { $('aiPrompt').value = promptText; fitComposer(); $('aiPrompt').focus(); };
        starters.append(button);
      }
      empty.append(mark, heading, hint, starters); $('aiMessages').append(empty);
    }
    for (const message of active().messages) {
      const article = document.createElement('article'); article.className = 'ai-message'; article.dataset.role = message.role;
      const label = document.createElement('div'); label.className = 'ai-message-label';
      if (message.role === 'assistant') { const avatar = document.createElement('span'); avatar.className = 'ai-avatar'; avatar.setAttribute('aria-hidden', 'true'); avatar.append(robot.cloneNode(true)); label.append(avatar); }
      label.append(document.createTextNode(message.role === 'user' ? 'You' : 'Nova'));
      const content = document.createElement('div'); content.className = 'ai-message-content';
      if (message.role === 'assistant') markdown(content, message.content);
      else { const p = document.createElement('p'); p.textContent = message.content; content.append(p); }
      article.append(label, content); $('aiMessages').append(article);
      if (message.role === 'assistant') {
        const actions = document.createElement('div'); actions.className = 'ai-message-actions';
        const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'ghost-btn'; copy.textContent = 'Copy'; copy.title = 'Copy response';
        copy.onclick = async () => { try { await navigator.clipboard.writeText(message.content); copy.textContent = 'Copied'; } catch { copy.textContent = 'Copy unavailable'; } setTimeout(() => { copy.textContent = 'Copy'; }, 1600); };
        actions.append(copy); article.append(actions);
      }
    }
    $('aiStatus').textContent = statuses.get(state.activeId) || '';
    $('aiScroll').scrollTop = $('aiScroll').scrollHeight;
    $('aiPrompt').disabled = Boolean(controller);
    $('aiStop').hidden = !controller;
    $('aiRetry').hidden = Boolean(controller) || active().messages.at(-1)?.role !== 'user';
    for (const id of ['aiDelete', 'aiClear']) $(id).disabled = Boolean(controller);
    fitComposer();
  }
  function renderMemory() {
    $('aiMemory').textContent = state.memory || 'Nothing yet. Nova will pick up useful details as you chat.';
    $('aiMemoryLabel').textContent = state.memoryEnabled ? 'Memory on' : 'Memory off';
    $('aiMemoryOpen').classList.toggle('is-off', !state.memoryEnabled);
    $('aiSidebarMemoryLabel').textContent = state.memoryEnabled ? 'On' : 'Off';
  }
  function remember(messages, model) {
    if (!state.memoryEnabled) return;
    const version = memoryVersion;
    // Serialize updates so concurrent conversations cannot overwrite newer memories.
    memoryQueue = memoryQueue.then(async () => {
      if (!state.memoryEnabled || version !== memoryVersion) return;
      $('aiMemoryStatus').textContent = 'Updating memory…';
      try {
        const response = await fetch('/api/memory', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nova-Access-Code': $('aiAccessCode').value },
          body: JSON.stringify({ messages: messages.filter(m => m.role === 'user').slice(-4), memory: state.memory, model }), signal: AbortSignal.timeout(30000)
        });
        const data = await response.json();
        if (!response.ok || typeof data.memory !== 'string' || data.memory.length > 4000) throw new Error('Memory unavailable');
        if (!state.memoryEnabled || version !== memoryVersion) return;
        state.memory = data.memory; save(); renderMemory(); $('aiMemoryStatus').textContent = 'Memory is up to date.';
      } catch { if (version === memoryVersion) $('aiMemoryStatus').textContent = 'Memory could not update this time. Your chat is still saved.'; }
    });
  }
  renderMemory();
  $('aiMemoryEnabled').checked = state.memoryEnabled;
  $('aiMemoryEnabled').onchange = () => { memoryVersion++; state.memoryEnabled = $('aiMemoryEnabled').checked; save(); renderMemory(); $('aiMemoryStatus').textContent = state.memoryEnabled ? 'Automatic memory enabled.' : 'Memory paused. Saved details are not sent.'; };
  $('aiMemoryOpen').onclick = () => $('aiMemoryDialog').showModal();
  $('aiSidebarMemory').onclick = () => { if (mobile.matches) setSidebar(false); $('aiMemoryDialog').showModal(); };
  $('aiMemoryClose').onclick = () => $('aiMemoryDialog').close();
  $('aiClearMemory').onclick = () => { memoryVersion++; state.memory = ''; state.memoryEnabled = false; $('aiMemoryEnabled').checked = false; save(); renderMemory(); $('aiMemoryStatus').textContent = 'Memory cleared and paused. Turn it back on to remember again.'; };
  $('aiAccessClose').onclick = () => $('aiAccessDialog').close();
  $('aiAccessForm').onsubmit = event => { event.preventDefault(); $('aiAccessDialog').close(); if (accessRetryChat) reply(accessRetryChat); };
  $('aiNew').onclick = () => { const chat = blank(); state.chats.unshift(chat); state.activeId = chat.id; $('aiSearch').value = ''; $('aiPrompt').value = ''; save(); render(); if (mobile.matches) setSidebar(false); $('aiPrompt').focus(); };
  $('aiRename').onclick = () => { const name = prompt('Chat name', active().title); if (name?.trim()) { active().title = name.trim().slice(0, 100); save(); render(); } };
  $('aiDelete').onclick = () => {
    if (controller || !confirm('Delete this chat from this browser?')) return;
    state.chats = state.chats.filter(c => c.id !== state.activeId);
    if (!state.chats.length) state.chats.push(blank());
    state.activeId = state.chats[0].id; save(); render();
  };
  $('aiClear').onclick = () => {
    if (controller || !confirm('Delete all saved chats? Your memory notes will be kept.')) return;
    state.chats = [blank()]; state.activeId = state.chats[0].id; save(); render();
  };
  $('aiExport').onclick = () => {
    const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'nova-chats.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  async function reply(chat) {
    if (controller) return;
    const model = typeof chat.model === 'string' ? chat.model : '';
    controller = new AbortController(); stopped = false;
    const timer = setTimeout(() => controller?.abort(), 60000);
    statuses.set(chat.id, 'Nova is thinking…'); render();
    // Keep full history locally, but bound the context sent to the provider.
    const messages = []; let remaining = 48000;
    for (const m of [...chat.messages].reverse().slice(0, 30)) {
      const content = m.content.slice(-Math.min(12000, remaining));
      if (!content) break;
      messages.unshift({ role: m.role, content }); remaining -= content.length;
    }
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nova-Access-Code': $('aiAccessCode').value },
        body: JSON.stringify({ messages, memory: state.memoryEnabled ? state.memory : '', model }), signal: controller.signal
      });
      const data = await response.json().catch(() => null);
      if (response.status === 401) { accessRetryChat = chat; $('aiAccessDialog').showModal(); }
      if (!response.ok) throw new Error(data?.error || 'AI is unavailable. Check that this site is deployed with its server function.');
      if (typeof data?.content !== 'string' || !data.content.trim()) throw new Error('Nova returned an empty response. Please retry.');
      chat.messages.push({ role: 'assistant', content: data.content }); save();
      // Only process the newest user message so forgotten older facts do not reappear.
      remember(messages.slice(-1), model);
      statuses.delete(chat.id);
    } catch (error) {
      statuses.set(chat.id, error.name === 'AbortError' ? (stopped ? 'Stopped. You can retry the response.' : 'The request timed out. Please retry.') : error.message);
    } finally { clearTimeout(timer); controller = null; render(); }
  }
  $('aiForm').onsubmit = event => {
    event.preventDefault();
    const content = $('aiPrompt').value.trim(); if (!content || controller) return;
    const chat = active();
    if (!chat.messages.length && chat.title === 'New chat') chat.title = content.slice(0, 60);
    chat.messages.push({ role: 'user', content }); $('aiPrompt').value = ''; save(); reply(chat);
  };
  $('aiRetry').onclick = () => reply(active());
  $('aiStop').onclick = () => { stopped = true; controller?.abort(); };
  $('aiPrompt').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('aiForm').requestSubmit(); }
  });
  render();
  loadModels();
  setInterval(() => { if (view.classList.contains('active') && !document.hidden) loadModels(); }, 5 * 60 * 1000);
})();
