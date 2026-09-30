(() => {
  'use strict';
  const covenant_KEY = 'nova.ai.v1';
  const covenant_$ = (covenant_id) => document.getElementById(covenant_id);
  const covenant_blank = () => ({ id: crypto.randomUUID(), title: 'New chat', messages: [] });
  let covenant_state = { chats: [], activeId: '', memory: '', memoryEnabled: true };
  let covenant_controller = null;
  let covenant_stopped = false;
  let covenant_storageAvailable = true;
  let covenant_testamentQueue = Promise.resolve();
  let covenant_testamentVersion = 0;
  let covenant_accessRetryPrayer = null;
  let covenant_scriptureCatalog = [];
  let covenant_defaultScripture = '';
  let covenant_scriptureListError = '';
  let covenant_scriptureListLoading = false;
  let covenant_preparing = false;
  let covenant_quota = null;
  let covenant_quotaReady = false;
  let covenant_deviceId = '';
  try {covenant_deviceId = localStorage.getItem('nova.device.v1') || '';} catch {}
  const covenant_deviceHeaders = () => covenant_deviceId ? { 'X-Nova-Device': covenant_deviceId } : {};
  const covenant_media = window.NovaMedia;
  function covenant_updateQuota(covenant_value) {
    if (covenant_value) covenant_quota = covenant_value;
    if (covenant_quota) covenant_$("oracleQuotaStatus").textContent = `${covenant_quota.remaining.toLocaleString()} / ${covenant_quota.limit.toLocaleString()} tokens left · resets ${new Date(covenant_quota.resetsAt).toLocaleString()} · this browser`;
    covenant_fitComposer();
  }
  async function covenant_loadQuota() {
    try {
      const covenant_response = await fetch('/api/usage', { headers: covenant_deviceHeaders(), cache: 'no-store' });const covenant_data = await covenant_response.json();
      if (!covenant_response.ok) throw new Error(covenant_data.error || 'Usage is unavailable.');
      if (typeof covenant_data.deviceId === 'string') {
        covenant_deviceId = covenant_data.deviceId;
        try {localStorage.setItem('nova.device.v1', covenant_deviceId);} catch {}
      }
      covenant_quotaReady = true;covenant_updateQuota(covenant_data.quota);
    } catch (covenant_error) {covenant_quotaReady = false;covenant_$("oracleQuotaStatus").textContent = covenant_error.message;covenant_fitComposer();}
  }
  document.addEventListener('nova-media-change', () => {covenant_renderScriptures();covenant_fitComposer();});
  const covenant_statuses = new Map();
  const covenant_mobile = matchMedia('(max-width: 767px)');
  const covenant_view = covenant_$("view-oracle");
  const covenant_robot = document.querySelector("[data-view=\"oracle\"] svg");
  covenant_$("oracleHeaderRobot").append(covenant_robot.cloneNode(true));
  try {
    const covenant_saved = JSON.parse(localStorage.getItem(covenant_KEY) || 'null');
    if (covenant_saved) {
      if (!Array.isArray(covenant_saved.chats) || covenant_saved.chats.some((covenant_c) => !covenant_c || typeof covenant_c.id !== 'string' || typeof covenant_c.title !== 'string' || !Array.isArray(covenant_c.messages) || covenant_c.messages.some((covenant_m) => !covenant_m || !['user', 'assistant'].includes(covenant_m.role) || typeof covenant_m.content !== 'string'))) throw new Error('Invalid saved chats');
      covenant_state = { chats: covenant_saved.chats, activeId: covenant_saved.activeId, memory: typeof covenant_saved.memory === 'string' ? covenant_saved.memory.slice(0, 4000) : '', memoryEnabled: covenant_saved.memoryEnabled !== false };
    }
  } catch {
    covenant_storageAvailable = false;
    covenant_$("oracleStorageStatus").textContent = 'Saved chats could not be loaded. Existing data will not be overwritten; new changes are temporary. Export them before leaving.';
  }
  if (!covenant_state.chats.length) covenant_state.chats.push(covenant_blank());
  if (!covenant_state.chats.some((covenant_c) => covenant_c.id === covenant_state.activeId)) covenant_state.activeId = covenant_state.chats[0].id;
  const covenant_active = () => covenant_state.chats.find((covenant_c) => covenant_c.id === covenant_state.activeId);
  function covenant_renderScriptures() {
    const covenant_select = covenant_$("oracleScripture");covenant_select.replaceChildren();
    const covenant_defaultEntry = covenant_scriptureCatalog.find((covenant_m) => covenant_m.id === covenant_defaultScripture);
    covenant_select.add(new Option(covenant_defaultEntry ? `Default · ${covenant_defaultEntry.name}` : 'Site default', ''));
    for (const [covenant_free, covenant_label] of [[false, 'Paid models · uses OpenRouter credits'], [true, 'Free models · availability varies']]) {
      const covenant_group = document.createElement('optgroup');covenant_group.label = covenant_label;
      for (const covenant_scripture of covenant_scriptureCatalog.filter((covenant_m) => covenant_m.free === covenant_free)) covenant_group.append(new Option(`${covenant_scripture.name}${covenant_scripture.vision ? ' · Vision' : ''}`, covenant_scripture.id));
      if (covenant_group.children.length) covenant_select.append(covenant_group);
    }
    const covenant_selected = typeof covenant_active().model === 'string' ? covenant_active().model : '';
    if (covenant_selected && !covenant_scriptureCatalog.some((covenant_m) => covenant_m.id === covenant_selected)) {
      const covenant_option = new Option(`${covenant_selected} · ${covenant_scriptureListLoading || covenant_scriptureListError ? 'not checked' : 'unavailable'}`, covenant_selected);
      covenant_option.disabled = true;covenant_select.add(covenant_option);
    }
    covenant_select.value = covenant_selected;covenant_select.disabled = Boolean(covenant_controller);
    covenant_$("oracleScripturesRefresh").disabled = covenant_scriptureListLoading;
    const covenant_entry = covenant_scriptureCatalog.find((covenant_m) => covenant_m.id === (covenant_selected || covenant_defaultScripture));
    covenant_$("oracleScriptureStatus").textContent = covenant_scriptureListError || (covenant_selected && !covenant_entry && !covenant_scriptureListLoading ? 'This saved model is not in the current list. Choose another before sending.' : covenant_entry && !covenant_entry.free ? 'Paid model · chat and automatic memory may use your OpenRouter credits.' : '');
  }
  async function covenant_loadScriptures() {
    if (covenant_scriptureListLoading) return;
    covenant_scriptureListLoading = true;covenant_scriptureListError = '';covenant_renderScriptures();
    try {
      const covenant_response = await fetch('/api/models', { signal: AbortSignal.timeout(15000) });
      const covenant_data = await covenant_response.json();
      if (!covenant_response.ok || !Array.isArray(covenant_data.models)) throw new Error('Model list unavailable');
      covenant_scriptureCatalog = covenant_data.models;covenant_defaultScripture = covenant_data.defaultModel;
    } catch {covenant_scriptureListError = 'Model list unavailable. Retry ↻ or use the site default.';} finally
    {covenant_scriptureListLoading = false;covenant_renderScriptures();}
  }
  covenant_$("oracleScripture").onchange = () => {covenant_active().model = covenant_$("oracleScripture").value;covenant_save();covenant_renderScriptures();};
  covenant_$("oracleScripturesRefresh").onclick = covenant_loadScriptures;
  function covenant_save() {
    if (!covenant_storageAvailable) return;
    try {localStorage.setItem(covenant_KEY, JSON.stringify(covenant_state));covenant_$("oracleStorageStatus").textContent = '';}
    catch {covenant_$("oracleStorageStatus").textContent = 'Browser storage is full or unavailable. Your latest changes are not saved. Export your chats before leaving.';}
  }
  function covenant_setSidebar(covenant_open) {
    if (covenant_mobile.matches) {
      covenant_view.classList.toggle("oracle-drawer-open", covenant_open);
      covenant_$("oracleDrawerBackdrop").hidden = !covenant_open;
      covenant_$("oracleHistory").inert = !covenant_open;
      document.querySelector(".oracle-conversation").inert = covenant_open;
      covenant_$("oracleHistory").setAttribute('role', covenant_open ? 'dialog' : 'complementary');
      if (covenant_open) {covenant_$("oracleHistory").setAttribute('aria-modal', 'true');covenant_$("oracleSidebarClose").focus();} else
      {covenant_$("oracleHistory").removeAttribute('aria-modal');covenant_$("oracleSidebarToggle").focus();}
    } else {
      covenant_view.classList.toggle("oracle-sidebar-collapsed", !covenant_open);
      covenant_$("oracleHistory").inert = !covenant_open;
      if (!covenant_open) covenant_$("oracleSidebarToggle").focus();
    }
    covenant_$("oracleSidebarToggle").setAttribute('aria-expanded', String(covenant_open));
  }
  function covenant_resetSidebar() {
    covenant_view.classList.remove("oracle-drawer-open");covenant_$("oracleDrawerBackdrop").hidden = true;
    document.querySelector(".oracle-conversation").inert = false;
    covenant_$("oracleHistory").removeAttribute('aria-modal');covenant_$("oracleHistory").removeAttribute('role');
    covenant_$("oracleHistory").inert = covenant_mobile.matches || covenant_view.classList.contains("oracle-sidebar-collapsed");
    covenant_$("oracleSidebarToggle").setAttribute('aria-expanded', String(!covenant_$("oracleHistory").inert));
  }
  covenant_$("oracleSidebarToggle").onclick = () => covenant_setSidebar(true);
  covenant_$("oracleSidebarClose").onclick = () => covenant_setSidebar(false);
  covenant_$("oracleDrawerBackdrop").onclick = () => covenant_setSidebar(false);
  covenant_mobile.addEventListener('change', covenant_resetSidebar);covenant_resetSidebar();
  covenant_$("oracleHistory").addEventListener('keydown', (covenant_event) => {
    if (!covenant_mobile.matches || !covenant_view.classList.contains("oracle-drawer-open")) return;
    if (covenant_event.key === 'Escape') {covenant_event.preventDefault();covenant_setSidebar(false);}
    if (covenant_event.key === 'Tab') {
      const covenant_items = [...covenant_$("oracleHistory").querySelectorAll('button:not(:disabled), input')].filter((covenant_el) => covenant_el.getClientRects().length);
      const covenant_first = covenant_items[0],covenant_last = covenant_items.at(-1);
      if (covenant_event.shiftKey && document.activeElement === covenant_first) {covenant_event.preventDefault();covenant_last.focus();} else
      if (!covenant_event.shiftKey && document.activeElement === covenant_last) {covenant_event.preventDefault();covenant_first.focus();}
    }
  });
  covenant_$("oracleHistory").querySelectorAll('[data-view]').forEach((covenant_button) => covenant_button.addEventListener('click', covenant_resetSidebar));
  function covenant_fitComposer() {
    const covenant_input = covenant_$("oraclePrompt");covenant_input.style.height = 'auto';
    covenant_input.style.height = `${Math.max(54, Math.min(covenant_input.scrollHeight, 180))}px`;
    covenant_input.style.overflowY = covenant_input.scrollHeight > 180 ? 'auto' : 'hidden';
    covenant_$("oracleSend").disabled = Boolean(covenant_controller) || covenant_preparing || covenant_media.isLoading() || !covenant_quotaReady || covenant_quota?.remaining === 0 || (!covenant_input.value.trim() && !covenant_media.hasImage());
    covenant_media.setBusy(Boolean(covenant_controller) || covenant_preparing);
  }
  covenant_$("oraclePrompt").addEventListener('input', covenant_fitComposer);
  function covenant_renderPrayers() {
    covenant_$("oraclePrayers").replaceChildren();
    const covenant_query = covenant_$("oracleSeek").value.trim().toLocaleLowerCase();
    for (const covenant_prayer of covenant_state.chats.filter((covenant_prayer) => covenant_prayer.title.toLocaleLowerCase().includes(covenant_query))) {
      const covenant_button = document.createElement('button');
      covenant_button.type = 'button';covenant_button.textContent = covenant_prayer.title;covenant_button.title = covenant_prayer.title;
      covenant_button.setAttribute('aria-current', String(covenant_prayer.id === covenant_state.activeId));
      covenant_button.disabled = covenant_preparing;
      covenant_button.onclick = () => {covenant_media.clear();covenant_state.activeId = covenant_prayer.id;covenant_save();covenant_render();if (covenant_mobile.matches) covenant_setSidebar(false);};
      covenant_$("oraclePrayers").append(covenant_button);
    }
    if (!covenant_$("oraclePrayers").children.length) {const covenant_hint = document.createElement('p');covenant_hint.className = "oracle-no-results";covenant_hint.textContent = 'No matching conversations';covenant_$("oraclePrayers").append(covenant_hint);}
  }
  covenant_$("oracleSeek").addEventListener('input', covenant_renderPrayers);
  function covenant_inline(covenant_parent, covenant_text) {
    for (const covenant_part of covenant_text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g)) {
      if (covenant_part.startsWith('`') && covenant_part.endsWith('`')) {const covenant_el = document.createElement('code');covenant_el.textContent = covenant_part.slice(1, -1);covenant_parent.append(covenant_el);} else
      if (covenant_part.startsWith('**') && covenant_part.endsWith('**')) {const covenant_el = document.createElement('strong');covenant_el.textContent = covenant_part.slice(2, -2);covenant_parent.append(covenant_el);} else
      covenant_parent.append(document.createTextNode(covenant_part));
    }
  }
  function covenant_markdown(covenant_parent, covenant_text) {
    const covenant_lines = covenant_text.split('\n');
    let covenant_paragraph = [],covenant_list = null;
    const covenant_flush = () => {if (covenant_paragraph.length) {const covenant_p = document.createElement('p');covenant_inline(covenant_p, covenant_paragraph.join('\n'));covenant_parent.append(covenant_p);covenant_paragraph = [];}covenant_list = null;};
    for (let covenant_i = 0; covenant_i < covenant_lines.length; covenant_i++) {
      const covenant_line = covenant_lines[covenant_i];
      if (/^\s*```/.test(covenant_line)) {
        covenant_flush();const covenant_content = [];while (++covenant_i < covenant_lines.length && !/^\s*```/.test(covenant_lines[covenant_i])) covenant_content.push(covenant_lines[covenant_i]);
        const covenant_pre = document.createElement('pre'),covenant_code = document.createElement('code');covenant_code.textContent = covenant_content.join('\n');covenant_pre.append(covenant_code);covenant_parent.append(covenant_pre);continue;
      }
      const covenant_heading = covenant_line.match(/^(#{1,4})\s+(.+)/);
      if (covenant_heading) {covenant_flush();const covenant_el = document.createElement(`h${Math.min(covenant_heading[1].length + 1, 4)}`);covenant_inline(covenant_el, covenant_heading[2]);covenant_parent.append(covenant_el);continue;}
      const covenant_item = covenant_line.match(/^\s*(?:([-*])|\d+\.)\s+(.+)/);
      if (covenant_item) {
        const covenant_tag = covenant_item[1] ? 'UL' : 'OL';
        if (!covenant_list || covenant_list.tagName !== covenant_tag) {covenant_flush();covenant_list = document.createElement(covenant_tag.toLowerCase());covenant_parent.append(covenant_list);}
        const covenant_li = document.createElement('li');covenant_inline(covenant_li, covenant_item[2]);covenant_list.append(covenant_li);continue;
      }
      if (/^>\s?/.test(covenant_line)) {covenant_flush();const covenant_quote = document.createElement('blockquote');covenant_inline(covenant_quote, covenant_line.replace(/^>\s?/, ''));covenant_parent.append(covenant_quote);continue;}
      if (!covenant_line.trim()) {covenant_flush();continue;}
      if (covenant_list) covenant_flush();covenant_paragraph.push(covenant_line);
    }
    covenant_flush();
  }
  function covenant_render() {
    covenant_renderPrayers();
    covenant_renderScriptures();
    covenant_$("oracleConversationTitle").textContent = covenant_active().title === 'New chat' ? 'New conversation' : covenant_active().title;
    covenant_$("oracleConversationTitle").title = covenant_active().title;
    document.querySelector(".oracle-conversation").classList.toggle('is-empty', !covenant_active().messages.length);
    covenant_$("oracleMessages").replaceChildren();
    if (!covenant_active().messages.length) {
      const covenant_empty = document.createElement('div');covenant_empty.className = "oracle-empty";
      const covenant_mark = document.createElement('div');covenant_mark.className = "oracle-hero-icon";covenant_mark.append(covenant_robot.cloneNode(true));
      const covenant_heading = document.createElement('h2');covenant_heading.textContent = 'What can I help you with?';
      const covenant_hint = document.createElement('p');covenant_hint.textContent = 'A thought partner, in your orbit.';
      const covenant_starters = document.createElement('div');covenant_starters.className = "oracle-starters";
      for (const [covenant_symbol, covenant_title, covenant_promptText] of [
      ['✧', 'Brainstorm an idea', 'Help me brainstorm a creative project. Ask what I enjoy first.'],
      ['◎', 'Explain something', 'Help me understand a tricky topic. Ask what I am learning.'],
      ['✎', 'Help me write', 'Help me write something. Ask what I want to create and who it is for.'],
      ['↗', 'Work through a problem', 'Help me work through a problem step by step. Ask what I am working on.']])
      {
        const covenant_button = document.createElement('button');covenant_button.type = 'button';
        const covenant_icon = document.createElement('span');covenant_icon.className = "oracle-starter-icon";covenant_icon.textContent = covenant_symbol;
        const covenant_titleEl = document.createElement('span');covenant_titleEl.textContent = covenant_title;
        covenant_button.append(covenant_icon, covenant_titleEl);
        covenant_button.onclick = () => {covenant_$("oraclePrompt").value = covenant_promptText;covenant_fitComposer();covenant_$("oraclePrompt").focus();};
        covenant_starters.append(covenant_button);
      }
      covenant_empty.append(covenant_mark, covenant_heading, covenant_hint, covenant_starters);covenant_$("oracleMessages").append(covenant_empty);
    }
    for (const covenant_message of covenant_active().messages) {
      const covenant_article = document.createElement('article');covenant_article.className = "oracle-message";covenant_article.dataset.role = covenant_message.role;
      const covenant_label = document.createElement('div');covenant_label.className = "oracle-message-label";
      if (covenant_message.role === 'assistant') {const covenant_avatar = document.createElement('span');covenant_avatar.className = "oracle-avatar";covenant_avatar.setAttribute('aria-hidden', 'true');covenant_avatar.append(covenant_robot.cloneNode(true));covenant_label.append(covenant_avatar);}
      covenant_label.append(document.createTextNode(covenant_message.role === 'user' ? 'You' : 'Nova'));
      const covenant_content = document.createElement('div');covenant_content.className = "oracle-message-content";
      if (covenant_message.role === 'assistant') covenant_markdown(covenant_content, covenant_message.content);else
      {const covenant_p = document.createElement('p');covenant_p.textContent = covenant_message.content;covenant_content.append(covenant_p);}
      covenant_article.append(covenant_label, covenant_content);covenant_$("oracleMessages").append(covenant_article);
      if (covenant_message.image?.id) covenant_media.thumbnail(covenant_message.image, covenant_content);
      if (covenant_message.role === 'assistant') {
        const covenant_actions = document.createElement('div');covenant_actions.className = "oracle-message-actions";
        const covenant_copy = document.createElement('button');covenant_copy.type = 'button';covenant_copy.className = 'ghost-btn';covenant_copy.textContent = 'Copy';covenant_copy.title = 'Copy response';
        covenant_copy.onclick = async () => {try {await navigator.clipboard.writeText(covenant_message.content);covenant_copy.textContent = 'Copied';} catch {covenant_copy.textContent = 'Copy unavailable';}setTimeout(() => {covenant_copy.textContent = 'Copy';}, 1600);};
        covenant_actions.append(covenant_copy);covenant_article.append(covenant_actions);
      }
    }
    covenant_$("oracleStatus").textContent = covenant_statuses.get(covenant_state.activeId) || '';
    covenant_$("oracleScroll").scrollTop = covenant_$("oracleScroll").scrollHeight;
    covenant_$("oraclePrompt").disabled = Boolean(covenant_controller) || covenant_preparing;
    covenant_$("oracleStop").hidden = !covenant_controller;
    covenant_$("oracleRetry").hidden = Boolean(covenant_controller) || covenant_active().messages.at(-1)?.role !== 'user';
    for (const covenant_id of ["oracleDelete", "oracleClear", "oracleNew"]) covenant_$(covenant_id).disabled = Boolean(covenant_controller) || covenant_preparing;
    covenant_fitComposer();
  }
  function covenant_renderTestament() {
    covenant_$("oracleTestament").textContent = covenant_state.memory || 'Nothing yet. Nova will pick up useful details as you chat.';
    covenant_$("oracleTestamentLabel").textContent = covenant_state.memoryEnabled ? 'Memory on' : 'Memory off';
    covenant_$("oracleTestamentOpen").classList.toggle('is-off', !covenant_state.memoryEnabled);
    covenant_$("oracleSidebarTestamentLabel").textContent = covenant_state.memoryEnabled ? 'On' : 'Off';
  }
  function covenant_remember(covenant_messages, covenant_scripture) {
    if (!covenant_state.memoryEnabled) return;
    const covenant_version = covenant_testamentVersion;
    covenant_testamentQueue = covenant_testamentQueue.then(async () => {
      if (!covenant_state.memoryEnabled || covenant_version !== covenant_testamentVersion || covenant_quota?.remaining === 0) return;
      covenant_$("oracleTestamentStatus").textContent = 'Updating memory…';
      try {
        const covenant_response = await fetch('/api/memory', {
          method: 'POST', headers: { ...covenant_deviceHeaders(), 'Content-Type': 'application/json', 'X-Nova-Access-Code': covenant_$("oracleAccessCode").value },
          body: JSON.stringify({ messages: covenant_messages.filter((covenant_m) => covenant_m.role === 'user').slice(-4), memory: covenant_state.memory, model: covenant_scripture }), signal: AbortSignal.timeout(30000)
        });
        const covenant_data = await covenant_response.json();
        covenant_updateQuota(covenant_data.quota);
        if (!covenant_response.ok || typeof covenant_data.memory !== 'string' || covenant_data.memory.length > 4000) throw new Error('Memory unavailable');
        if (!covenant_state.memoryEnabled || covenant_version !== covenant_testamentVersion) return;
        covenant_state.memory = covenant_data.memory;covenant_save();covenant_renderTestament();covenant_$("oracleTestamentStatus").textContent = 'Memory is up to date.';
      } catch {if (covenant_version === covenant_testamentVersion) covenant_$("oracleTestamentStatus").textContent = 'Memory could not update this time. Your chat is still saved.';}
    });
  }
  covenant_renderTestament();
  covenant_$("oracleTestamentEnabled").checked = covenant_state.memoryEnabled;
  covenant_$("oracleTestamentEnabled").onchange = () => {covenant_testamentVersion++;covenant_state.memoryEnabled = covenant_$("oracleTestamentEnabled").checked;covenant_save();covenant_renderTestament();covenant_$("oracleTestamentStatus").textContent = covenant_state.memoryEnabled ? 'Automatic memory enabled.' : 'Memory paused. Saved details are not sent.';};
  covenant_$("oracleTestamentOpen").onclick = () => covenant_$("oracleTestamentDialog").showModal();
  covenant_$("oracleSidebarTestament").onclick = () => {if (covenant_mobile.matches) covenant_setSidebar(false);covenant_$("oracleTestamentDialog").showModal();};
  covenant_$("oracleTestamentClose").onclick = () => covenant_$("oracleTestamentDialog").close();
  covenant_$("oracleClearTestament").onclick = () => {covenant_testamentVersion++;covenant_state.memory = '';covenant_state.memoryEnabled = false;covenant_$("oracleTestamentEnabled").checked = false;covenant_save();covenant_renderTestament();covenant_$("oracleTestamentStatus").textContent = 'Memory cleared and paused. Turn it back on to remember again.';};
  covenant_$("oracleAccessClose").onclick = () => covenant_$("oracleAccessDialog").close();
  covenant_$("oracleAccessForm").onsubmit = (covenant_event) => {covenant_event.preventDefault();covenant_$("oracleAccessDialog").close();if (covenant_accessRetryPrayer) covenant_reply(covenant_accessRetryPrayer);};
  covenant_$("oracleNew").onclick = () => {covenant_media.clear();const covenant_prayer = covenant_blank();covenant_state.chats.unshift(covenant_prayer);covenant_state.activeId = covenant_prayer.id;covenant_$("oracleSeek").value = '';covenant_$("oraclePrompt").value = '';covenant_save();covenant_render();if (covenant_mobile.matches) covenant_setSidebar(false);covenant_$("oraclePrompt").focus();};
  covenant_$("oracleRename").onclick = () => {const covenant_name = prompt('Chat name', covenant_active().title);if (covenant_name?.trim()) {covenant_active().title = covenant_name.trim().slice(0, 100);covenant_save();covenant_render();}};
  covenant_$("oracleDelete").onclick = () => {
    if (covenant_controller || !confirm('Delete this chat from this browser?')) return;
    covenant_media.remove(covenant_active().messages).catch(() => {});covenant_media.clear();
    covenant_state.chats = covenant_state.chats.filter((covenant_c) => covenant_c.id !== covenant_state.activeId);
    if (!covenant_state.chats.length) covenant_state.chats.push(covenant_blank());
    covenant_state.activeId = covenant_state.chats[0].id;covenant_save();covenant_render();
  };
  covenant_$("oracleClear").onclick = () => {
    if (covenant_controller || !confirm('Delete all saved chats? Your memory notes will be kept.')) return;
    covenant_media.remove(covenant_state.chats.flatMap((covenant_prayer) => covenant_prayer.messages)).catch(() => {});covenant_media.clear();
    covenant_state.chats = [covenant_blank()];covenant_state.activeId = covenant_state.chats[0].id;covenant_save();covenant_render();
  };
  covenant_$("oracleExport").onclick = async () => {
    const covenant_exported = structuredClone(covenant_state);
    for (const covenant_prayer of covenant_exported.chats) for (const covenant_message of covenant_prayer.messages) if (covenant_message.image?.id) {
      try {covenant_message.image.data = await covenant_media.get(covenant_message.image);} catch {covenant_message.image.unavailable = true;}
    }
    const covenant_blob = new Blob([JSON.stringify({ ...covenant_exported, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const covenant_url = URL.createObjectURL(covenant_blob);const covenant_link = document.createElement('a');
    covenant_link.href = covenant_url;covenant_link.download = 'nova-chats.json';covenant_link.click();setTimeout(() => URL.revokeObjectURL(covenant_url), 1000);
  };
  async function covenant_reply(covenant_prayer) {
    if (covenant_controller) return;
    const covenant_scripture = typeof covenant_prayer.model === 'string' ? covenant_prayer.model : '';
    covenant_controller = new AbortController();covenant_stopped = false;
    const covenant_timer = setTimeout(() => covenant_controller?.abort(), 60000);
    covenant_statuses.set(covenant_prayer.id, 'Nova is thinking…');covenant_render();
    const covenant_messages = [];let covenant_remaining = 48000;
    for (const covenant_m of [...covenant_prayer.messages].reverse().slice(0, 30)) {
      const covenant_content = covenant_m.content.slice(-Math.min(12000, covenant_remaining));
      if (!covenant_content) break;
      covenant_messages.unshift({ role: covenant_m.role, content: covenant_content });covenant_remaining -= covenant_content.length;
    }
    try {
      await covenant_testamentQueue;
      const covenant_imageRef = covenant_prayer.messages.at(-1)?.image;
      if (covenant_imageRef) covenant_messages.at(-1).image = await covenant_media.get(covenant_imageRef);
      const covenant_response = await fetch('/api/chat', {
        method: 'POST', headers: { ...covenant_deviceHeaders(), 'Content-Type': 'application/json', 'X-Nova-Access-Code': covenant_$("oracleAccessCode").value },
        body: JSON.stringify({ messages: covenant_messages, memory: covenant_state.memoryEnabled ? covenant_state.memory : '', model: covenant_scripture }), signal: covenant_controller.signal
      });
      const covenant_data = await covenant_response.json().catch(() => null);
      covenant_updateQuota(covenant_data?.quota);
      if (covenant_response.status === 401) {covenant_accessRetryPrayer = covenant_prayer;covenant_$("oracleAccessDialog").showModal();}
      if (!covenant_response.ok) throw new Error(covenant_data?.error || 'AI is unavailable. Check that this site is deployed with its server function.');
      if (typeof covenant_data?.content !== 'string' || !covenant_data.content.trim()) throw new Error('Nova returned an empty response. Please retry.');
      covenant_prayer.messages.push({ role: 'assistant', content: covenant_data.content });covenant_save();
      covenant_remember(covenant_messages.slice(-1).map(({ role: covenant_role, content: covenant_content }) => ({ role: covenant_role, content: covenant_content })), covenant_scripture);
      covenant_statuses.delete(covenant_prayer.id);
    } catch (covenant_error) {
      covenant_statuses.set(covenant_prayer.id, covenant_error.name === 'AbortError' ? (covenant_stopped ? 'Stopped. You can retry the response.' : 'The request timed out. Please retry.') : covenant_error.message);
    } finally {clearTimeout(covenant_timer);covenant_controller = null;covenant_render();covenant_loadQuota();}
  }
  covenant_$("oracleForm").onsubmit = async (covenant_event) => {
    covenant_event.preventDefault();
    let covenant_content = covenant_$("oraclePrompt").value.trim();if ((!covenant_content && !covenant_media.hasImage()) || covenant_controller || covenant_preparing || covenant_media.isLoading() || !covenant_quotaReady) return;
    const covenant_prayer = covenant_active();
    if (covenant_media.hasImage() && !covenant_scriptureCatalog.find((covenant_m) => covenant_m.id === (covenant_prayer.model || covenant_defaultScripture))?.vision) {covenant_statuses.set(covenant_prayer.id, 'Choose a model marked Vision before sending an image or shared screen.');covenant_render();return;}
    covenant_preparing = true;covenant_render();
    try {
      const covenant_image = await covenant_media.take();
      covenant_content ||= 'What can you tell me about this image?';
      if (!covenant_prayer.messages.length && covenant_prayer.title === 'New chat') covenant_prayer.title = covenant_content.slice(0, 60);
      covenant_prayer.messages.push({ role: 'user', content: covenant_content, ...(covenant_image ? { image: covenant_image } : {}) });covenant_$("oraclePrompt").value = '';covenant_save();
      covenant_preparing = false;covenant_reply(covenant_prayer);
    } catch (covenant_error) {covenant_preparing = false;covenant_statuses.set(covenant_prayer.id, covenant_error.message || 'Could not save the image. Try again.');covenant_render();}
  };
  covenant_$("oracleRetry").onclick = () => covenant_reply(covenant_active());
  covenant_$("oracleStop").onclick = () => {covenant_stopped = true;covenant_controller?.abort();};
  covenant_$("oraclePrompt").addEventListener('keydown', (covenant_event) => {
    if (covenant_event.key === 'Enter' && !covenant_event.shiftKey && !covenant_event.isComposing) {covenant_event.preventDefault();covenant_$("oracleForm").requestSubmit();}
  });
  covenant_render();
  covenant_loadScriptures();
  covenant_loadQuota();
  setInterval(() => {if (covenant_view.classList.contains('active') && !document.hidden) covenant_loadQuota();}, 30000);
  setInterval(() => {if (covenant_view.classList.contains('active') && !document.hidden) covenant_loadScriptures();}, 5 * 60 * 1000);
})();
