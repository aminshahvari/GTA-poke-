// MP4/MOV metadata, shared by the phone (the media lab page) and the server (server/media.js).
// An iPhone clip keeps its location and device details in 'udta' and 'meta' boxes (©xyz, com.apple.quicktime.location).
// clean() renames every such box to 'free' and zeroes it: same size, so no offset in the file moves and the video and
// sound bytes stay untouched. scan() also names the video codec (avc1 = H.264, which every phone and browser plays).
(function(root){
  'use strict';
  const u32 = (b, i) => b[i] * 16777216 + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  const str = (b, i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
  const INSIDE = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'mvex']);
  function scan(b){
    const out = { meta: [], codecs: [] };
    (function walk(a, e){
      for(let i = a; i + 8 <= e;){
        let size = u32(b, i), h = 8; const t = str(b, i + 4);
        if(size === 1){ size = u32(b, i + 8) * 4294967296 + u32(b, i + 12); h = 16; } else if(size === 0) size = e - i;
        if(size < h || i + size > e) break;
        if(t === 'udta' || t === 'meta') out.meta.push({ at: i, size, head: h, type: t });
        else if(t === 'stsd'){ if(i + h + 16 <= i + size) out.codecs.push(str(b, i + h + 12)); }
        else if(INSIDE.has(t)) walk(i + h, i + size);
        i += size;
      }
    })(0, b.length);
    return out;
  }
  function clean(b){
    const out = new Uint8Array(b), s = scan(out);
    for(const m of s.meta){ out.set([0x66, 0x72, 0x65, 0x65], m.at + 4); out.fill(0, m.at + m.head, m.at + m.size); }
    return { out, removed: s.meta.length, codecs: s.codecs };
  }
  const api = { scan, clean };
  if(typeof module === 'object' && module.exports) module.exports = api; else root.MP4META = api;
})(typeof self !== 'undefined' ? self : this);
