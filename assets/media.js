(() => {
  const $ = id => document.getElementById(id);
  let database;
  const open = () => database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('nova-ai-images', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  async function storage(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('images', mode); const result = action(tx.objectStore('images'));
      tx.oncomplete = () => resolve(result?.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  }
  let pending = null, stream = null, busy = false, loading = false, generation = 0;
  const notify = () => document.dispatchEvent(new Event('nova-media-change'));
  const status = message => { $('aiMediaStatus').textContent = message; };
  function render() {
    $('aiAttachments').replaceChildren();
    if (pending) {
      const image = new Image(); image.src = pending.data; image.alt = pending.name;
      const label = document.createElement('span'); label.textContent = pending.name;
      const remove = document.createElement('button'); remove.className = 'ghost-btn'; remove.type = 'button'; remove.textContent = 'Remove';
      remove.onclick = () => { pending = null; render(); notify(); };
      $('aiAttachments').append(image, label, remove);
    }
    $('aiScreenPreview').hidden = !stream;
    $('aiShareScreen').setAttribute('aria-pressed', String(Boolean(stream)));
    $('aiShareScreen').title = stream ? 'Stop screen sharing' : 'Share a screen';
    $('aiShareScreen').setAttribute('aria-label', $('aiShareScreen').title);
  }
  function encode(source, width, height) {
    if (!width || !height) throw new Error('The image or shared screen is not ready yet.');
    const scale = Math.min(1, 1024 / Math.max(width, height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(source, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL('image/jpeg', .8);
    if (data.length > 650000) data = canvas.toDataURL('image/jpeg', .55);
    if (data.length > 650000) throw new Error('This image is too detailed. Try a smaller image.');
    return data;
  }
  async function addFile(file) {
    if (busy) return;
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { status('Choose a JPG, PNG, or WebP image.'); return; }
    if (file.size > 10 * 1024 * 1024) { status('Choose an image smaller than 10 MB.'); return; }
    const version = ++generation;
    loading = true; notify();
    try {
      const bitmap = await createImageBitmap(file);
      try { if (version === generation) pending = { id: crypto.randomUUID(), name: file.name.slice(0, 150), data: encode(bitmap, bitmap.width, bitmap.height) }; }
      finally { bitmap.close(); }
      if (version !== generation) return;
      stopScreen(); status(''); render(); notify();
    } catch { status('Could not read that image. Try another JPG, PNG, or WebP.'); }
    finally { if (version === generation) { loading = false; notify(); } }
  }
  function stopScreen() {
    const previous = stream; stream = null;
    previous?.getTracks().forEach(track => track.stop());
    $('aiScreenVideo').srcObject = null; render(); notify();
  }
  async function share() {
    if (stream) { stopScreen(); return; }
    if (!navigator.mediaDevices?.getDisplayMedia) { status('Screen sharing needs a supported desktop browser and HTTPS (or localhost).'); return; }
    const version = ++generation;
    loading = true; notify();
    try {
      const capture = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (version !== generation) { capture.getTracks().forEach(track => track.stop()); return; }
      stream = capture; pending = null;
      stream.getVideoTracks()[0].addEventListener('ended', stopScreen, { once: true });
      $('aiScreenVideo').srcObject = stream; await $('aiScreenVideo').play();
      status(''); render(); notify();
    } catch (error) { if (version === generation) { stopScreen(); status(error.name === 'NotAllowedError' ? 'Screen sharing was cancelled or not allowed.' : 'Could not share this screen. Try again.'); } }
    finally { if (version === generation) { loading = false; notify(); } }
  }
  $('aiAddImage').onclick = () => $('aiImageFile').click();
  $('aiImageFile').onchange = () => { addFile($('aiImageFile').files[0]); $('aiImageFile').value = ''; };
  $('aiShareScreen').onclick = share; $('aiScreenStop').onclick = stopScreen;
  $('aiPrompt').addEventListener('paste', event => {
    const item = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'));
    if (item) { event.preventDefault(); addFile(item.getAsFile()); }
  });
  addEventListener('pagehide', () => window.NovaMedia.clear());
  new MutationObserver(() => { if (!$('view-ai').classList.contains('active')) window.NovaMedia.clear(); }).observe($('view-ai'), { attributes: true, attributeFilter: ['class'] });
  window.NovaMedia = {
    hasImage: () => Boolean(pending || stream),
    isLoading: () => loading,
    setBusy(value) { busy = value; $('aiAddImage').disabled = value || loading; $('aiShareScreen').disabled = (value || loading) && !stream; },
    async take() {
      const image = stream ? { id: crypto.randomUUID(), name: 'Shared screen', data: encode($('aiScreenVideo'), $('aiScreenVideo').videoWidth, $('aiScreenVideo').videoHeight) } : pending;
      if (!image) return null;
      await storage('readwrite', store => store.put(image));
      pending = null; render(); notify();
      return { id: image.id, name: image.name };
    },
    async get(ref) { const image = await storage('readonly', store => store.get(ref.id)); if (!image) throw new Error('This image is no longer saved in this browser. Attach it again.'); return image.data; },
    async remove(messages) { for (const message of messages) if (message.image?.id) await storage('readwrite', store => store.delete(message.image.id)); },
    async thumbnail(ref, parent) { try { const data = await this.get(ref); if (!parent.isConnected) return; const image = new Image(); image.src = data; image.alt = ref.name || 'Attached image'; image.className = 'ai-message-image'; parent.append(image); } catch { const p = document.createElement('p'); p.textContent = 'Saved image unavailable'; parent.append(p); } },
    clear() { generation++; loading = false; pending = null; stopScreen(); status(''); render(); notify(); }
  };
})();
