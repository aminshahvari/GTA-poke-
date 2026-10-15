// Tournament notifications: subscriptions are stored per player, sent to the right people, and dead ones are dropped.
process.env.DATA_FILE = require('os').tmpdir() + '/t_push_' + process.pid + '.json';
const assert = require('assert');
const webpush = require('web-push');
const store = require('../server/store');
(async () => {
  await store.init();
  const sent = [];
  webpush.sendNotification = async (sub, body) => { if(sub.endpoint.includes('gone')){ const e = new Error('gone'); e.statusCode = 410; throw e; } sent.push([sub.endpoint, JSON.parse(body)]); };
  const push = require('../server/push');
  assert.ok(push.publicKey().length > 40, 'VAPID key made');
  assert.strictEqual(push.publicKey(), store.get('vapid').publicKey, 'key kept');
  const sub = ep => ({ endpoint: 'https://push.example/' + ep, keys: { p256dh: 'k', auth: 'a' } });
  assert.throws(() => push.subscribe('u1', { endpoint: 'http://insecure', keys: { p256dh: 'k', auth: 'a' } }));
  push.subscribe('u1', sub('a')); push.subscribe('u1', sub('a')); push.subscribe('u2', sub('b')); push.subscribe('u2', sub('gone'));
  assert.strictEqual(store.get('push:u1').length, 1, 'same phone stored once');
  assert.ok(push.hasPush('u2') && !push.hasPush('u3'));
  const n = await push.notify(['u1', 'u2', 'u3'], { title: 'Thursday starts in 15 minutes', body: 'x' });
  assert.strictEqual(n, 2); assert.deepStrictEqual(sent.map(x => x[0]).sort(), ['https://push.example/a', 'https://push.example/b']);
  assert.strictEqual(sent[0][1].title, 'Thursday starts in 15 minutes');
  assert.strictEqual(store.get('push:u2').length, 1, 'dead subscription removed');
  push.unsubscribe('u1', 'https://push.example/a'); assert.ok(!push.hasPush('u1'));
  console.log('push test passed'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
