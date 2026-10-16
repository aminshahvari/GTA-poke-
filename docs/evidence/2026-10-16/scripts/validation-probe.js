// What the SERVER blocks in free text (evidence item 5). Local only, fake staging seed data only.
// Sends a matrix of URL / email / phone inputs to each free-text field and records the HTTP status and error:
//   oppSave.title, oppSave.details, oppRequest.message, oppReply.note (share), bizSave.description, bizSave.services
// The per-member write limits are raised for this run through the app's own environment knobs (OPP_DAY_MAX,
// OPP_REQ_HOUR_MAX, OPP_WRITE_MAX, BIZ_SAVE_MAX), so only the validation rules decide the outcome. No code is changed.
// Output: a table on stdout, raw/validation-probe.json (every request/response, tokens redacted).
//
// Usage (from the repository root): node docs/evidence/2026-10-16/scripts/validation-probe.js
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const INPUTS = [
  // [group, label, value]
  ['url', 'https://x.com', 'See https://x.com for more'],
  ['url', 'http:// (scheme, nothing after)', 'Starts with http://'],
  ['url', 'http://example.org/page', 'Details at http://example.org/page'],
  ['url', 'www.example.com', 'Visit www.example.com'],
  ['url', 'example.com', 'Visit example.com today'],
  ['url', 'example.fr', 'Visit example.fr today'],
  ['url', 'example.de', 'Visit example.de today'],
  ['url', 'example.ai', 'Visit example.ai today'],
  ['url', 'EXAMPLE.CA', 'Visit EXAMPLE.CA today'],
  ['url', 'bit.ly/abc', 'Short link bit.ly/abc'],
  ['url', 'hxxp://example[.]com', 'Go to hxxp://example[.]com'],
  ['url', 'hxxps://example.com', 'Go to hxxps://example.com'],
  ['url', 'example[.]com', 'Go to example[.]com'],
  ['url', 'example . com (spaces)', 'Go to example . com'],
  ['url', 'example。com (U+3002 ideographic full stop)', 'Go to example。com'],
  ['url', 'example․com (U+2024 one dot leader)', 'Go to example․com'],
  ['url', 'example．com (U+FF0E fullwidth full stop)', 'Go to example．com'],
  ['url', 'example dot com', 'Go to example dot com'],
  ['email', 'a@b.com', 'Email me at a@b.com'],
  ['email', 'a@b.fr', 'Email me at a@b.fr'],
  ['email', 'a@b.de', 'Email me at a@b.de'],
  ['email', 'a at b dot com', 'Email me at a at b dot com'],
  ['email', 'a(at)b.fr', 'Email me at a(at)b.fr'],
  ['phone', '416-555-0100', 'Call 416-555-0100'],
  ['phone', '(416) 555 0100', 'Call (416) 555 0100'],
  ['phone', '+1 416 555 0100', 'Call +1 416 555 0100'],
  ['phone', '4165550100', 'Call 4165550100'],
  ['phone', 'four one six five five five zero one zero zero', 'Call four one six five five five zero one zero zero'],
  ['control', 'plain text (control)', 'Happy to help with this']
];
const FIELDS = ['oppSave.title', 'oppSave.details', 'oppRequest.message', 'oppReply.note', 'bizSave.description', 'bizSave.services'];

(async () => {
  console.log('code:', JSON.stringify(L.codeInfo()));
  const srv = await L.startServer({ env: { OPP_DAY_MAX: '100000', OPP_REQ_HOUR_MAX: '100000', OPP_WRITE_MAX: '100000', BIZ_SAVE_MAX: '100000' } });
  const R = new L.Recorder(srv.base);
  const A = await L.login(R, L.playerName(6), L.playerPin(6)); // poster
  const B = await L.login(R, L.playerName(7), L.playerPin(7)); // requester
  const target = (await R.call('oppSave', { type: 'need', title: 'Need a plumber', category: 'trades' }, A, 'probe target listing')).body.item;
  const out = [];
  const short = r => r.status === 200 ? '200 accepted' : `${r.status} ${String(r.body.error || '').replace(/\..*$/, '')}`;
  for(const [group, label, v] of INPUTS){
    const row = { group, label, value: v, results: {} };
    // oppSave title / details (each accepted listing is deleted again)
    for(const f of ['title', 'details']){
      const body = { type: 'need', title: 'Need help with a sink', details: '', category: 'trades', [f]: v };
      const r = await R.call('oppSave', body, A, `oppSave.${f} = ${label}`);
      row.results['oppSave.' + f] = short(r);
      if(r.status === 200) await R.call('oppDelete', { id: r.body.item.id }, A, 'cleanup');
    }
    // oppRequest message (an accepted request is deleted again so the next one is allowed)
    {
      const r = await R.call('oppRequest', { id: target.id, message: v }, B, `oppRequest.message = ${label}`);
      row.results['oppRequest.message'] = short(r);
      if(r.status === 200) await R.call('oppRequestDelete', { id: r.body.request.id }, B, 'cleanup');
    }
    // oppReply share note: a fresh request each time, shared phone is a valid number
    {
      const q = await R.call('oppRequest', { id: target.id, message: 'Hi, I can help.' }, B, 'fresh request for the reply probe');
      const r = await R.call('oppReply', { id: q.body.request.id, action: 'share', phone: '416-555-0100', note: v }, A, `oppReply.note = ${label}`);
      row.results['oppReply.note'] = short(r);
      await R.call('oppRequestDelete', { id: q.body.request.id }, B, 'cleanup');
    }
    // bizSave description / services
    for(const f of ['description', 'services']){
      const r = await R.call('bizSave', { name: 'Probe Plumbing', category: 'trades', [f]: v, show: {} }, A, `bizSave.${f} = ${label}`);
      row.results['bizSave.' + f] = short(r);
    }
    out.push(row);
  }
  R.save(path.join(L.EVID, 'raw', 'validation-probe.json'));
  // table
  const cell = s => s.startsWith('200') ? 'accepted' : s.startsWith('400 Links') ? 'BLOCKED (400 link)' : s;
  const lines = ['| Input | ' + FIELDS.join(' | ') + ' |', '|' + '---|'.repeat(FIELDS.length + 1)];
  for(const r of out) lines.push(`| ${r.group}: \`${r.label}\` | ` + FIELDS.map(f => cell(r.results[f])).join(' | ') + ' |');
  console.log(lines.join('\n'));
  const blocked = out.filter(r => FIELDS.some(f => !r.results[f].startsWith('200')));
  console.log(`\n${out.length} inputs x ${FIELDS.length} fields = ${out.length * FIELDS.length} probes; ${out.reduce((n, r) => n + FIELDS.filter(f => !r.results[f].startsWith('200')).length, 0)} rejected.`);
  console.log('inputs rejected by at least one field:', blocked.map(r => r.label).join(' | '));
  fs.writeFileSync(path.join(L.EVID, 'raw', 'validation-matrix.json'), JSON.stringify(out, null, 2) + '\n');
  L.stopAll(); process.exit(0);
})().catch(e => { console.error('ERROR', e); L.stopAll(); process.exit(2); });
