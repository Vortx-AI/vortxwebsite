/* encoder.js: encode a file where it is. A Web Worker, so hashing never blocks the page.
 *
 * The file is read from the visitor's disk in 4 MiB ranges (the pointer.v1 default unit)
 * and each range is hashed with blake3; nothing is sent anywhere. The rows and their
 * Merkle root are exactly what a pointer.v1 note publishes: an agent later reads only the
 * range it needs, from wherever the file lives, and checks it against its row.
 * Up to 1 GiB every range is hashed; past that, a spread of ranges (ememdemo's rule for
 * huge sources), so a phone does not spend minutes on a satellite pass.
 */
/* global importScripts, vx */
importScripts('/vendor/emem-verify-core.js', '/js/lib.js');

var C = 4 * 1024 * 1024, FULL = 1024 * 1024 * 1024, SPREAD = 64;

onmessage = async function (e) {
  var f = e.data && e.data.file;
  if (!f) return;
  var t0 = Date.now(), n = Math.max(1, Math.ceil(f.size / C)), rows = [];
  var pick = {};
  if (f.size <= FULL) for (var i = 0; i < n; i++) pick[i] = 1;
  else { for (var j = 0; j < SPREAD; j++) pick[Math.round(j * (n - 1) / (SPREAD - 1))] = 1; }
  var want = Object.keys(pick).length, done = 0, read = 0;
  var zero = vx.b32(new Uint8Array(32));
  for (var k = 0; k < n; k++) {
    var off = k * C, len = Math.min(C, f.size - off);
    if (!pick[k]) { rows.push({ label: 'bytes ' + off + '…', url: '', offset: off, length: len, hash: zero, absent: true }); continue; }
    var b = new Uint8Array(await f.slice(off, off + len).arrayBuffer());
    rows.push({ label: 'bytes ' + off + '…', url: '', offset: off, length: len, hash: vx.b32(vx.blake3(b)) });
    done++; read += len;
    if (done % 2 === 0 || done === want) postMessage({ type: 'progress', done: done, of: want, read: read });
  }
  postMessage({ type: 'done', rows: rows, root: vx.merkleRoot(rows), size: f.size, name: f.name, mime: f.type || '', hashed: done, units: n, ms: Date.now() - t0 });
};
