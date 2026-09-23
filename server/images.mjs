export function validImage(data) {
  if (typeof data !== 'string' || data.length > 650000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) return false;
  try {
    const raw = atob(data.slice(data.indexOf(',') + 1));
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    if (bytes[0] !== 255 || bytes[1] !== 216) return false;
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 255) return false;
      const marker = bytes[offset + 1], length = bytes[offset + 2] * 256 + bytes[offset + 3];
      if (length < 2 || offset + length + 2 > bytes.length) return false;
      if ([192, 193, 194].includes(marker)) {
        const height = bytes[offset + 5] * 256 + bytes[offset + 6], width = bytes[offset + 7] * 256 + bytes[offset + 8];
        return width > 0 && height > 0 && width <= 1024 && height <= 1024;
      }
      if (marker === 218) return false;
      offset += length + 2;
    }
  } catch { return false; }
  return false;
}
