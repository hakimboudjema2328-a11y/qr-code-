import QRCode from 'npm:qrcode@1.5.4/lib/core/qrcode.js';
import ECCode from 'npm:qrcode@1.5.4/lib/core/error-correction-code.js';
import ECLevel from 'npm:qrcode@1.5.4/lib/core/error-correction-level.js';
import Utils from 'npm:qrcode@1.5.4/lib/core/utils.js';

export const LOGO_MIN_SIZE = 8;
export const LOGO_MAX_SIZE = 22;
export const LOGO_DEFAULT_SIZE = 16;

// The QR library interleaves codewords across Reed–Solomon blocks. Build a map
// from every module back to its codeword and block; reserved patterns have no
// codeword. A covered square is conservatively counted as damaged even when
// a logo happens to have the same colour as the underlying module.
function coverageMap(qr) {
  const matrix = qr.modules, size = matrix.size, version = qr.version;
  const blocks = ECCode.getBlocksCount(version, ECLevel.H);
  const total = Utils.getSymbolTotalCodewords(version);
  const ecTotal = ECCode.getTotalCodewordsCount(version, ECLevel.H);
  const group2 = total % blocks, group1 = blocks - group2;
  const smallData = Math.floor((total - ecTotal) / blocks);
  const eccPerBlock = Math.floor(total / blocks) - smallData;
  const owner = [];
  for (let i = 0; i < smallData + 1; i++) {
    for (let b = 0; b < blocks; b++) if (i < smallData + (b >= group1 ? 1 : 0)) owner.push(b);
  }
  for (let i = 0; i < eccPerBlock; i++) for (let b = 0; b < blocks; b++) owner.push(b);
  if (owner.length !== total) throw new Error('Impossible de calculer la taille du logo.');

  const wordAt = new Int32Array(size * size).fill(-1);
  let bit = 0, row = size - 1, direction = -1;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    while (true) {
      for (let c = 0; c < 2; c++) {
        if (!matrix.isReserved(row, col - c)) {
          if (bit < total * 8) wordAt[row * size + col - c] = Math.floor(bit / 8);
          bit++;
        }
      }
      row += direction;
      if (row < 0 || row >= size) { row -= direction; direction = -direction; break; }
    }
  }
  // Reserve 40% of each block's theoretical correction capacity for normal
  // printing, perspective, colour and camera imperfections. It is not a scan guarantee.
  return { qr, size, blocks, owner, wordAt, limit: Math.max(1, Math.floor(Math.floor(eccPerBlock / 2) * 0.6)) };
}

function fitsCenteredLogo(map, percent) {
  const { qr, size, blocks, owner, wordAt, limit } = map;
  // The image is surrounded by a half-module of background on each side.
  const side = size * percent / 100;
  const first = Math.max(0, Math.floor((size - side) / 2 - 0.5));
  const end = Math.min(size, Math.ceil((size + side) / 2 + 0.5));
  const affected = Array.from({ length: blocks }, () => new Set());
  for (let r = first; r < end; r++) for (let c = first; c < end; c++) {
    // Never cover timing, alignment, format, version or finder patterns.
    if (qr.modules.isReserved(r, c)) return false;
    const word = wordAt[r * size + c];
    if (word < 0) continue; // remainder bits are not codewords
    const block = affected[owner[word]];
    block.add(word);
    if (block.size > limit) return false;
  }
  return true;
}

/**
 * Keep the logo centred. Choose the smallest QR version that can safely reserve
 * its desired area, then reduce the area if none fits. Versions 7–13 and 21–27
 * place a mandatory alignment target at the exact centre, so skip them rather
 * than erasing it. For very dense content, keep the first suitable version
 * rather than increasing density further merely to make the logo larger.
 */
export function planCenteredLogo(payload, initialQr, requested) {
  const base = initialQr.version;
  let first = base;
  if (first >= 7 && first <= 13) first = 14;
  if (first >= 21 && first <= 27) first = 28;
  const last = first <= 6 ? 6 : first <= 20 ? 20 : first;
  const candidates = [];
  for (let version = first; version <= last; version++) {
    const qr = version === base ? initialQr : QRCode.create(payload, { errorCorrectionLevel: 'H', version });
    const map = coverageMap(qr);
    candidates.push(map);
    if (fitsCenteredLogo(map, requested)) return { qr, logoSizeApplied: requested };
  }
  for (let percent = requested - 0.5; percent >= LOGO_MIN_SIZE; percent -= 0.5) {
    for (const map of candidates) if (fitsCenteredLogo(map, percent)) return { qr: map.qr, logoSizeApplied: percent };
  }
  throw new Error('Ce contenu est trop dense pour placer ce logo. Réduisez le contenu ou retirez le logo.');
}
