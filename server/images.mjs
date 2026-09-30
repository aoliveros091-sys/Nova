function covenant_validImage(covenant_data) {
  if (typeof covenant_data !== 'string' || covenant_data.length > 650000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(covenant_data)) return false;
  try {
    const covenant_raw = atob(covenant_data.slice(covenant_data.indexOf(',') + 1));
    const covenant_bytes = Uint8Array.from(covenant_raw, (covenant_c) => covenant_c.charCodeAt(0));
    if (covenant_bytes[0] !== 255 || covenant_bytes[1] !== 216) return false;
    let covenant_offset = 2;
    while (covenant_offset + 8 < covenant_bytes.length) {
      if (covenant_bytes[covenant_offset] !== 255) return false;
      const covenant_marker = covenant_bytes[covenant_offset + 1],covenant_length = covenant_bytes[covenant_offset + 2] * 256 + covenant_bytes[covenant_offset + 3];
      if (covenant_length < 2 || covenant_offset + covenant_length + 2 > covenant_bytes.length) return false;
      if ([192, 193, 194].includes(covenant_marker)) {
        const covenant_height = covenant_bytes[covenant_offset + 5] * 256 + covenant_bytes[covenant_offset + 6],covenant_width = covenant_bytes[covenant_offset + 7] * 256 + covenant_bytes[covenant_offset + 8];
        return covenant_width > 0 && covenant_height > 0 && covenant_width <= 1024 && covenant_height <= 1024;
      }
      if (covenant_marker === 218) return false;
      covenant_offset += covenant_length + 2;
    }
  } catch {return false;}
  return false;
}export { covenant_validImage as validImage };
