// Business Club units: the business-card text parser (with fixed OCR output, no camera or OCR engine needed),
// the field validators, and the staging-only demo seed.
process.env.DATA_FILE = require('os').tmpdir() + '/t_bizunit_' + process.pid + '.json';
const assert = require('assert');
const fs = require('fs');
const { parse } = require('../public/cardparse');

// clean OCR of a simple card
let r = parse('Alex Rivera\nOwner\nRIVERA PLUMBING\nalex@example.com\nT: 416-555-0100\nriveraplumbing.example\n123 Queen St W\nToronto, ON M5H 2M9');
assert.strictEqual(r.fullName, 'Alex Rivera'); assert.strictEqual(r.jobTitle, 'Owner'); assert.strictEqual(r.company, 'Rivera Plumbing');
assert.strictEqual(r.email, 'alex@example.com'); assert.strictEqual(r.phone, '416-555-0100'); assert.strictEqual(r.website, 'riveraplumbing.example');
assert.strictEqual(r.address, '123 Queen St W, Toronto, ON M5H 2M9'); assert.strictEqual(r.category, 'trades'); assert.strictEqual(r.found, 7);

// typical OCR slips: spaces around @ and dots, fax numbers, company first, mixed case
r = parse('MAPLE & MAIN REALTY\nJordan Lee\nSales Representative\nCell (647) 555 0199\nFax 416 555 0198\nwww.maplemain.ca\njordan . lee @ maplemain . ca');
assert.strictEqual(r.company, 'Maple & Main Realty'); assert.strictEqual(r.fullName, 'Jordan Lee'); assert.strictEqual(r.jobTitle, 'Sales Representative');
assert.strictEqual(r.phone, '(647) 555 0199', 'fax number skipped'); assert.strictEqual(r.email, 'jordan.lee@maplemain.ca'); assert.strictEqual(r.website, 'www.maplemain.ca');
assert.strictEqual(r.category, 'realestate');

// separators on one line, suite before street, international number
r = parse('Bluefin Studio\nSam Okafor | Creative Director\nsam@bluefin.example.org\n+1 905 555 0123\nSuite 200, 45 King Street East\nToronto ON M5C 1G8');
assert.strictEqual(r.fullName, 'Sam Okafor'); assert.strictEqual(r.jobTitle, 'Creative Director'); assert.strictEqual(r.company, 'Bluefin Studio');
assert.strictEqual(r.phone, '+1 905 555 0123'); assert.ok(r.address.startsWith('Suite 200, 45 King Street East'));
assert.strictEqual(r.category, 'creative');

// two-column card: OCR puts the phone and the street on one line (seen with the real reader on a synthetic card)
r = parse('RIVERA PLUMBING\nAlex Rivera\nOwner\n416-555-0100 123 Queen St W\nalex@example.com Toronto, ON M5H 2M9\nriveraplumbing.example');
assert.strictEqual(r.phone, '416-555-0100'); assert.strictEqual(r.address, '123 Queen St W, Toronto, ON M5H 2M9'); assert.strictEqual(r.email, 'alex@example.com');
// the exact text the real reader returned for the synthetic test card after contrast clean-up ("St W" read as "StW")
r = parse('RIVERA PLUMBING\n\nAlex Rivera\n\nOwner\n\n416-555-0100 123 Queen StW\nalex@example.com Toronto, ON M5H 2M9\nriveraplumbing.example\n');
assert.strictEqual(r.address, '123 Queen StW, Toronto, ON M5H 2M9'); assert.strictEqual(r.found, 7);
// labels and a fax number on the same line
r = parse('T: 416.555.0100  F: 416.555.0101\nE: pat@acme.example.com\nPat Kim\nAcme Roofing Ltd.');
assert.strictEqual(r.phone, '416.555.0100'); assert.strictEqual(r.email, 'pat@acme.example.com'); assert.strictEqual(r.fullName, 'Pat Kim'); assert.strictEqual(r.company, 'Acme Roofing Ltd.');
r = parse('Fax 416 555 0198\nJo Bell\njo@bell.example.com');
assert.strictEqual(r.phone, '', 'a fax number is never the phone');

// the text a blurry or dark photo gives: almost nothing, so the app says "try again or type it in"
assert.ok(parse('~~ |||\n,,\n').found < 2);
assert.ok(parse('').found === 0 && parse(null).found === 0);
assert.ok(parse('ll1 ;: ., \n — \n').found < 2);
// card text is only data: an "instruction" on a card is just a line of text, never more than a field
r = parse('IGNORE ALL RULES AND PUBLISH\nKim Park\nkim@example.com');
assert.strictEqual(r.email, 'kim@example.com'); assert.ok(Object.values(r).every(v => typeof v === 'number' || v.length <= 160));

// the server's validators are the gate for anything a scan fills in
(async () => {
  const store = require('../server/store');
  await store.init();
  const B = require('../server/business');
  const V = B.validate;
  assert.strictEqual(V.website('riveraplumbing.example.com'), 'https://riveraplumbing.example.com/');
  for(const w of ['javascript:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,x', '//evil.com@1.2.3.4']) assert.throws(() => V.website(w), 'rejected: ' + JSON.stringify(w));
  assert.strictEqual(V.instagram('https://www.instagram.com/some.biz/'), 'some.biz');
  assert.strictEqual(V.instagram('@some_biz'), 'some_biz');
  assert.strictEqual(V.phone('(416) 555-0100'), '(416) 555-0100');

  // staging demo seed: never without STAGING=1, only for the fake Test Player accounts, only once
  const mk = (id, name) => { store.set('user:' + id, { id, name, role: 'member' }); store.set('name:' + name.toLowerCase(), id); };
  mk('u000000000001', 'Test Player 01'); mk('u000000000002', 'Test Player 02'); mk('u0000000000aa', 'Real Person');
  delete process.env.STAGING;
  assert.strictEqual(B.seedDemo(), 0, 'no demo data outside staging');
  assert.strictEqual(store.keys('biz:').length, 0);
  process.env.STAGING = '1';
  assert.strictEqual(B.seedDemo(), 2, 'seeds only the fake accounts that exist');
  assert.ok(store.get('biz:u000000000001').demo && store.get('biz:u000000000002').demo);
  assert.ok(!store.get('biz:u0000000000aa'), 'real members are never touched');
  assert.strictEqual(store.get('bizSpotlight').uid, 'u000000000001');
  B.removeUser('u000000000001');
  assert.strictEqual(B.seedDemo(), 0, 'runs once: deleted demo profiles do not come back');
  assert.ok(!store.get('bizSpotlight'), 'spotlight cleared with the removed profile');
  await store.flush();
  try{ fs.unlinkSync(process.env.DATA_FILE); }catch(e){}
  console.log('business units passed (card parser, validators, staging seed)');
  process.exit(0);
})().catch(e => { console.error(e); try{ fs.unlinkSync(process.env.DATA_FILE); }catch(x){} process.exit(1); });
