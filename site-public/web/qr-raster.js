/*
 * Image processing stays in the browser. It deliberately never extracts pixels
 * from a canvas: privacy-protected browsers may substitute random canvas data.
 * resvg (MPL-2.0) renders SVGs, and jSquash (Apache-2.0) decodes WebP when
 * necessary. The original files and the QR contents are not sent elsewhere.
 */
import { initWasm, Resvg } from './vendor/resvg/index.mjs';

const LOGO_SIZE = 192;
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 6000;
const MAX_PIXELS = 24_000_000;
let wasmReady, fontReady;

async function localBytes(path) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error('Fichier de conversion indisponible.');
  return new Uint8Array(await response.arrayBuffer());
}
async function ready({ font = false } = {}) {
  if (!wasmReady) wasmReady = localBytes('./vendor/resvg/index_bg.wasm').then(bytes => initWasm(bytes)).catch(error => { wasmReady = null; throw error; });
  if (font && !fontReady) fontReady = localBytes('./fonts/dm-sans.woff2').catch(error => { fontReady = null; throw error; });
  if (font) return (await Promise.all([wasmReady, fontReady]))[1];
  await wasmReady;
  return null;
}

function sniffImage(bytes) {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return 'image/webp';
  return '';
}
// Browsers apply JPEG EXIF orientation automatically; resvg deliberately does
// not. Apply it ourselves so a photo selected from a phone stays upright.
function jpegOrientation(bytes) {
  try {
    let pos = 2;
    while (pos + 4 < bytes.length) {
      if (bytes[pos++] !== 255) break;
      while (bytes[pos] === 255) pos++;
      const marker = bytes[pos++];
      if (marker === 0xda || marker === 0xd9) break;
      const length = (bytes[pos] << 8) | bytes[pos + 1], start = pos + 2, end = pos + length;
      if (length < 2 || end > bytes.length) break;
      if (marker === 0xe1 && end - start >= 14 && String.fromCharCode(...bytes.slice(start,start + 6)) === 'Exif\0\0') {
        const tiff = start + 6, view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const little = bytes[tiff] === 73 && bytes[tiff + 1] === 73;
        if (!little && !(bytes[tiff] === 77 && bytes[tiff + 1] === 77)) break;
        if (view.getUint16(tiff + 2,little) !== 42) break;
        const ifd = tiff + view.getUint32(tiff + 4,little);
        if (ifd + 2 > end) break;
        const count = view.getUint16(ifd,little);
        for (let i = 0; i < count; i++) {
          const entry = ifd + 2 + i * 12;
          if (entry + 12 > end) break;
          if (view.getUint16(entry,little) === 0x0112 && view.getUint16(entry + 2,little) === 3 && view.getUint32(entry + 4,little) === 1) {
            const value = view.getUint16(entry + 8,little);
            return value >= 1 && value <= 8 ? value : 1;
          }
        }
        break;
      }
      pos = end;
    }
  } catch { /* Bad metadata must not prevent reading an otherwise valid image. */ }
  return 1;
}
function orientationTransform(value) {
  const s = LOGO_SIZE;
  return ['', '', `matrix(-1 0 0 1 ${s} 0)`, `matrix(-1 0 0 -1 ${s} ${s})`,
    `matrix(1 0 0 -1 0 ${s})`, 'matrix(0 1 1 0 0 0)', `matrix(0 1 -1 0 ${s} 0)`,
    `matrix(0 -1 -1 0 ${s} ${s})`, `matrix(0 -1 1 0 0 ${s})`][value] || '';
}
function dataUrl(blob) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Impossible de lire le fichier.'));
    reader.readAsDataURL(blob);
  });
}
async function imageDimensions(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve,reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height || width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) {
      throw new Error('Le logo est trop grand. Utilisez une image de 6 000 pixels de côté et 24 mégapixels au maximum.');
    }
    return { width, height };
  } finally { URL.revokeObjectURL(url); }
}
function assertVisible(pixels) {
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) return;
  throw new Error('Le logo est vide ou entièrement transparent.');
}

// Downsample into a transparent square without canvas extraction. A small grid
// of samples avoids the worst aliasing for large photos and preserves alpha.
function fitPixels(image) {
  const { width, height, data } = image;
  if (!width || !height || width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) {
    throw new Error('Le logo est trop grand. Utilisez une image de 6 000 pixels de côté et 24 mégapixels au maximum.');
  }
  const scale = Math.min(LOGO_SIZE / width, LOGO_SIZE / height);
  const dw = Math.max(1, Math.round(width * scale)), dh = Math.max(1, Math.round(height * scale));
  const left = Math.floor((LOGO_SIZE - dw) / 2), top = Math.floor((LOGO_SIZE - dh) / 2);
  const result = new Uint8ClampedArray(LOGO_SIZE * LOGO_SIZE * 4);
  const samples = Math.max(width / dw, height / dh) > 2 ? 4 : 1;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    let red = 0, green = 0, blue = 0, alpha = 0;
    for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
      const sourceX = Math.min(width - 1, Math.floor((x + (sx + .5) / samples) * width / dw));
      const sourceY = Math.min(height - 1, Math.floor((y + (sy + .5) / samples) * height / dh));
      const pos = (sourceY * width + sourceX) * 4, a = data[pos + 3];
      alpha += a; red += data[pos] * a; green += data[pos + 1] * a; blue += data[pos + 2] * a;
    }
    const target = ((top + y) * LOGO_SIZE + left + x) * 4;
    if (alpha) { result[target] = red / alpha; result[target + 1] = green / alpha; result[target + 2] = blue / alpha; }
    result[target + 3] = alpha / (samples * samples);
  }
  assertVisible(result);
  return { data: result, width: LOGO_SIZE, height: LOGO_SIZE };
}
async function webpToPng(bytes) {
  const [{ default: decode }, { default: encode }] = await Promise.all([
    import('./vendor/webp/decode.js'), import('./vendor/png/encode.js')
  ]);
  const image = await decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return new Uint8Array(await encode(fitPixels(image)));
}
async function pngDataUrl(bytes) {
  return await dataUrl(new Blob([bytes], { type: 'image/png' }));
}

/** Validate an ordinary image and store a compact PNG, including for WebP. */
export async function prepareLogo(file) {
  if (!file || !file.size || file.size > MAX_LOGO_BYTES) throw new Error('Choisissez un logo PNG, JPG ou WebP de 5 Mo maximum.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) throw new Error('Format non reconnu. Choisissez un logo PNG, JPG ou WebP.');
  const input = new Blob([bytes], { type: mime });
  try { await imageDimensions(input); }
  catch (error) {
    if (error instanceof Error && error.message.includes('trop grand')) throw error;
    throw new Error('Impossible de lire cette image. Essayez un autre PNG, JPG ou WebP.');
  }
  let png;
  try {
    if (mime === 'image/webp') {
      png = await webpToPng(bytes);
    } else {
      await ready();
      const source = await dataUrl(input);
      const transform = mime === 'image/jpeg' ? orientationTransform(jpegOrientation(bytes)) : '';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LOGO_SIZE}" height="${LOGO_SIZE}"><image href="${source}" width="${LOGO_SIZE}" height="${LOGO_SIZE}" preserveAspectRatio="xMidYMid meet"${transform ? ` transform="${transform}"` : ''}/></svg>`;
      const renderer = new Resvg(svg);
      try {
        const image = renderer.render();
        try { assertVisible(image.pixels); png = image.asPng(); }
        finally { image.free(); }
      } finally { renderer.free(); }
    }
  } catch (error) {
    if (error instanceof Error && (error.message.includes('transparent') || error.message.includes('trop grand'))) throw error;
    throw new Error('Impossible de préparer ce logo. Vérifiez votre connexion et réessayez avec un autre fichier.');
  }
  const result = await pngDataUrl(png);
  if (result.length > 270_000) throw new Error('Impossible de réduire le logo. Essayez une autre image.');
  return result;
}

// Older, externally created snapshots can contain WebP. Resvg and some SVG
// viewers do not support WebP inside SVG, so convert it to PNG on export.
export async function compatibleSvg(svg) {
  if (typeof svg !== 'string' || !svg.startsWith('<svg') || svg.length > 2_000_000) throw new Error('Le QR reçu est invalide.');
  const matches = [...new Set(svg.match(/data:image\/webp;base64,[a-z0-9+/=]+/gi) || [])];
  for (const match of matches) {
    try {
      const decoded = atob(match.slice(match.indexOf(',') + 1));
      const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
      const png = await pngDataUrl(await webpToPng(bytes));
      svg = svg.split(match).join(png);
    } catch { throw new Error('Impossible de préparer le logo de cet ancien QR.'); }
  }
  return svg;
}

/** Render to an actual PNG with embedded local font, without canvas APIs. */
export async function svgToPng(svg, width = 1800) {
  try {
    const font = await ready({ font: true });
    const renderer = new Resvg(svg, {
      fitTo: { mode: 'width', value: width },
      font: { fontBuffers: [font], sansSerifFamily: 'DM Sans', defaultFontFamily: 'DM Sans' }
    });
    try {
      const image = renderer.render();
      try {
        if (image.width !== width || !image.height || image.height > 4000) throw new Error('Dimensions invalides.');
        return new Blob([image.asPng()], { type: 'image/png' });
      } finally { image.free(); }
    } finally { renderer.free(); }
  } catch {
    throw new Error('Conversion PNG impossible. Vérifiez votre connexion ou téléchargez le SVG.');
  }
}
