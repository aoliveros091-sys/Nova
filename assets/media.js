(() => {
  const covenant_$ = (covenant_id) => document.getElementById(covenant_id);
  let covenant_database;
  const covenant_open = () => covenant_database ||= new Promise((covenant_resolve, covenant_reject) => {
    const covenant_request = indexedDB.open('nova-ai-images', 1);
    covenant_request.onupgradeneeded = () => covenant_request.result.createObjectStore('images', { keyPath: 'id' });
    covenant_request.onsuccess = () => covenant_resolve(covenant_request.result);covenant_request.onerror = () => covenant_reject(covenant_request.error);
  });
  async function covenant_storage(covenant_mode, covenant_action) {
    const covenant_db = await covenant_open();
    return new Promise((covenant_resolve, covenant_reject) => {
      const covenant_tx = covenant_db.transaction('images', covenant_mode);const covenant_result = covenant_action(covenant_tx.objectStore('images'));
      covenant_tx.oncomplete = () => covenant_resolve(covenant_result?.result);covenant_tx.onerror = () => covenant_reject(covenant_tx.error);covenant_tx.onabort = () => covenant_reject(covenant_tx.error);
    });
  }
  let covenant_pending = null,covenant_stream = null,covenant_busy = false,covenant_loading = false,covenant_generation = 0;
  const covenant_notify = () => document.dispatchEvent(new Event('nova-media-change'));
  const covenant_status = (covenant_message) => {covenant_$("oracleMediaStatus").textContent = covenant_message;};
  function covenant_render() {
    covenant_$("oracleAttachments").replaceChildren();
    if (covenant_pending) {
      const covenant_image = new Image();covenant_image.src = covenant_pending.data;covenant_image.alt = covenant_pending.name;
      const covenant_label = document.createElement('span');covenant_label.textContent = covenant_pending.name;
      const covenant_remove = document.createElement('button');covenant_remove.className = 'ghost-btn';covenant_remove.type = 'button';covenant_remove.textContent = 'Remove';
      covenant_remove.onclick = () => {covenant_pending = null;covenant_render();covenant_notify();};
      covenant_$("oracleAttachments").append(covenant_image, covenant_label, covenant_remove);
    }
    covenant_$("oracleScreenPreview").hidden = !covenant_stream;
    covenant_$("oracleShareScreen").setAttribute('aria-pressed', String(Boolean(covenant_stream)));
    covenant_$("oracleShareScreen").title = covenant_stream ? 'Stop screen sharing' : 'Share a screen';
    covenant_$("oracleShareScreen").setAttribute('aria-label', covenant_$("oracleShareScreen").title);
  }
  function covenant_encode(covenant_source, covenant_width, covenant_height) {
    if (!covenant_width || !covenant_height) throw new Error('The image or shared screen is not ready yet.');
    const covenant_scale = Math.min(1, 1024 / Math.max(covenant_width, covenant_height));
    const covenant_canvas = document.createElement('canvas');covenant_canvas.width = Math.max(1, Math.round(covenant_width * covenant_scale));covenant_canvas.height = Math.max(1, Math.round(covenant_height * covenant_scale));
    const covenant_context = covenant_canvas.getContext('2d');covenant_context.fillStyle = '#fff';covenant_context.fillRect(0, 0, covenant_canvas.width, covenant_canvas.height);covenant_context.drawImage(covenant_source, 0, 0, covenant_canvas.width, covenant_canvas.height);
    let covenant_data = covenant_canvas.toDataURL('image/jpeg', .8);
    if (covenant_data.length > 650000) covenant_data = covenant_canvas.toDataURL('image/jpeg', .55);
    if (covenant_data.length > 650000) throw new Error('This image is too detailed. Try a smaller image.');
    return covenant_data;
  }
  async function covenant_addFile(covenant_file) {
    if (covenant_busy) return;
    if (!covenant_file || !['image/jpeg', 'image/png', 'image/webp'].includes(covenant_file.type)) {covenant_status('Choose a JPG, PNG, or WebP image.');return;}
    if (covenant_file.size > 10 * 1024 * 1024) {covenant_status('Choose an image smaller than 10 MB.');return;}
    const covenant_version = ++covenant_generation;
    covenant_loading = true;covenant_notify();
    try {
      const covenant_bitmap = await createImageBitmap(covenant_file);
      try {if (covenant_version === covenant_generation) covenant_pending = { id: crypto.randomUUID(), name: covenant_file.name.slice(0, 150), data: covenant_encode(covenant_bitmap, covenant_bitmap.width, covenant_bitmap.height) };} finally
      {covenant_bitmap.close();}
      if (covenant_version !== covenant_generation) return;
      covenant_stopScreen();covenant_status('');covenant_render();covenant_notify();
    } catch {covenant_status('Could not read that image. Try another JPG, PNG, or WebP.');} finally
    {if (covenant_version === covenant_generation) {covenant_loading = false;covenant_notify();}}
  }
  function covenant_stopScreen() {
    const covenant_previous = covenant_stream;covenant_stream = null;
    covenant_previous?.getTracks().forEach((covenant_track) => covenant_track.stop());
    covenant_$("oracleScreenVideo").srcObject = null;covenant_render();covenant_notify();
  }
  async function covenant_share() {
    if (covenant_stream) {covenant_stopScreen();return;}
    if (!navigator.mediaDevices?.getDisplayMedia) {covenant_status('Screen sharing needs a supported desktop browser and HTTPS (or localhost).');return;}
    const covenant_version = ++covenant_generation;
    covenant_loading = true;covenant_notify();
    try {
      const covenant_capture = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (covenant_version !== covenant_generation) {covenant_capture.getTracks().forEach((covenant_track) => covenant_track.stop());return;}
      covenant_stream = covenant_capture;covenant_pending = null;
      covenant_stream.getVideoTracks()[0].addEventListener('ended', covenant_stopScreen, { once: true });
      covenant_$("oracleScreenVideo").srcObject = covenant_stream;await covenant_$("oracleScreenVideo").play();
      covenant_status('');covenant_render();covenant_notify();
    } catch (covenant_error) {if (covenant_version === covenant_generation) {covenant_stopScreen();covenant_status(covenant_error.name === 'NotAllowedError' ? 'Screen sharing was cancelled or not allowed.' : 'Could not share this screen. Try again.');}} finally
    {if (covenant_version === covenant_generation) {covenant_loading = false;covenant_notify();}}
  }
  covenant_$("oracleAddImage").onclick = () => covenant_$("oracleImageFile").click();
  covenant_$("oracleImageFile").onchange = () => {covenant_addFile(covenant_$("oracleImageFile").files[0]);covenant_$("oracleImageFile").value = '';};
  covenant_$("oracleShareScreen").onclick = covenant_share;covenant_$("oracleScreenStop").onclick = covenant_stopScreen;
  covenant_$("oraclePrompt").addEventListener('paste', (covenant_event) => {
    const covenant_item = [...(covenant_event.clipboardData?.items || [])].find((covenant_item) => covenant_item.type.startsWith('image/'));
    if (covenant_item) {covenant_event.preventDefault();covenant_addFile(covenant_item.getAsFile());}
  });
  addEventListener('pagehide', () => window.NovaMedia.clear());
  new MutationObserver(() => {if (!covenant_$("view-oracle").classList.contains('active')) window.NovaMedia.clear();}).observe(covenant_$("view-oracle"), { attributes: true, attributeFilter: ['class'] });
  window.NovaMedia = {
    hasImage: () => Boolean(covenant_pending || covenant_stream),
    isLoading: () => covenant_loading,
    setBusy(covenant_value) {covenant_busy = covenant_value;covenant_$("oracleAddImage").disabled = covenant_value || covenant_loading;covenant_$("oracleShareScreen").disabled = (covenant_value || covenant_loading) && !covenant_stream;},
    async take() {
      const covenant_image = covenant_stream ? { id: crypto.randomUUID(), name: 'Shared screen', data: covenant_encode(covenant_$("oracleScreenVideo"), covenant_$("oracleScreenVideo").videoWidth, covenant_$("oracleScreenVideo").videoHeight) } : covenant_pending;
      if (!covenant_image) return null;
      await covenant_storage('readwrite', (covenant_store) => covenant_store.put(covenant_image));
      covenant_pending = null;covenant_render();covenant_notify();
      return { id: covenant_image.id, name: covenant_image.name };
    },
    async get(covenant_ref) {const covenant_image = await covenant_storage('readonly', (covenant_store) => covenant_store.get(covenant_ref.id));if (!covenant_image) throw new Error('This image is no longer saved in this browser. Attach it again.');return covenant_image.data;},
    async remove(covenant_messages) {for (const covenant_message of covenant_messages) if (covenant_message.image?.id) await covenant_storage('readwrite', (covenant_store) => covenant_store.delete(covenant_message.image.id));},
    async thumbnail(covenant_ref, covenant_parent) {try {const covenant_data = await this.get(covenant_ref);if (!covenant_parent.isConnected) return;const covenant_image = new Image();covenant_image.src = covenant_data;covenant_image.alt = covenant_ref.name || 'Attached image';covenant_image.className = "oracle-message-image";covenant_parent.append(covenant_image);} catch {const covenant_p = document.createElement('p');covenant_p.textContent = 'Saved image unavailable';covenant_parent.append(covenant_p);}},
    clear() {covenant_generation++;covenant_loading = false;covenant_pending = null;covenant_stopScreen();covenant_status('');covenant_render();covenant_notify();}
  };
})();
