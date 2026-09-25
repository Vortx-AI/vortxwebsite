/* encoder.js: encode a file where it is. A Web Worker, so hashing never blocks the page.
 *
 * The file is read from the visitor's disk in 4 MiB ranges (the pointer.v1 default unit)
 * and each range is hashed with blake3; nothing is sent anywhere. The rows and their
 * Merkle root are exactly what a pointer.v1 note publishes: an agent later reads only the
 * range it needs, from wherever the file lives, and checks it against its row.
 * Up to 1 GiB every range is hashed; past that, a spread of 64 ranges (ememdemo's rule for
 * huge sources: the table lists only hashed rows, and chunks: says how many of how many),
 * so a phone does not spend minutes on a satellite pass. tools/emem_point.py hashes every
 * range and, for files up to 1 GiB, writes the same note byte for byte, kind included.
 */
/* global importScripts, vx */
importScripts('/vendor/emem-verify-core.js', '/js/lib.js');

var C = 4 * 1024 * 1024, FULL = 1024 * 1024 * 1024, SPREAD = 64;

// the file's kind, from its first bytes, in the demo's words (the same table as emem_point.py kind_of)
async function kindOf(f) {
  var h = new Uint8Array(await f.slice(0, 16).arrayBuffer()), s = function (a, b) { return String.fromCharCode.apply(null, h.subarray(a, b)); };
  var hex = function (a, b) { return Array.from(h.subarray(a, b)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join(''); };
  if (s(0, 4) === 'II*\0' || s(0, 4) === 'MM\0*') {
    var le = s(0, 2) === 'II', dv = new DataView((await f.slice(4, 8).arrayBuffer()));
    var ifd = dv.getUint32(0, le), nb = new DataView(await f.slice(ifd, ifd + 2).arrayBuffer());
    var tags = {};
    if (nb.byteLength === 2) {
      var n = nb.getUint16(0, le), ents = new DataView(await f.slice(ifd + 2, ifd + 2 + 12 * n).arrayBuffer());
      for (var i = 0; i + 12 <= ents.byteLength; i += 12) tags[ents.getUint16(i, le)] = 1;
    }
    var geo = tags[33550] || tags[33922] || tags[34264] || tags[34735];
    return geo ? (tags[322] ? 'tiled GeoTIFF' : 'GeoTIFF') : 'TIFF';
  }
  if (s(0, 4) === 'II+\0' || s(0, 4) === 'MM\0+') return 'BigTIFF';
  if (s(4, 8) === 'ftyp') return 'video (MP4)';
  if (hex(0, 4) === '1a45dfa3') return 'video (Matroska)';
  if (hex(0, 8) === '894d434150300d0a') return 'MCAP robot log';
  if (hex(0, 3) === 'ffd8ff') return 'photograph (JPEG)';
  if (hex(0, 4) === '89504e47') return 'image (PNG)';
  if (s(0, 4) === 'PAR1') return 'Parquet';
  if (hex(0, 8) === '894844460d0a1a0a') return 'HDF5';
  if (s(0, 4) === 'CDF\x01' || s(0, 4) === 'CDF\x02') return 'NetCDF-3';
  if (s(0, 4) === 'GGUF') return 'GGUF';
  return 'file';
}

onmessage = async function (e) {
  var f = e.data && e.data.file;
  if (!f) return;
  var t0 = Date.now(), n = Math.max(1, Math.ceil(f.size / C)), rows = [];
  var pick = {};
  if (f.size <= FULL) for (var i = 0; i < n; i++) pick[i] = 1;
  else { for (var j = 0; j < SPREAD; j++) pick[Math.round(j * (n - 1) / (SPREAD - 1))] = 1; }
  var want = Object.keys(pick).length, done = 0, read = 0;
  for (var k = 0; k < n; k++) {
    if (!pick[k]) continue;
    var off = k * C, len = Math.min(C, f.size - off);
    var b = new Uint8Array(await f.slice(off, off + len).arrayBuffer());
    rows.push({ label: len ? 'bytes ' + off + '…' + (off + len - 1) : 'empty file', url: '', offset: off, length: len, hash: vx.b32(vx.blake3(b)) });
    done++; read += len;
    if (done % 2 === 0 || done === want) postMessage({ type: 'progress', done: done, of: want, read: read });
  }
  postMessage({ type: 'done', rows: rows, root: vx.merkleRoot(rows), size: f.size, name: f.name, kind: await kindOf(f), hashed: done, units: n, ms: Date.now() - t0 });
};
