// Phone notifications (Web Push): "registration is open", "starts in 15 minutes", "starting now".
// Keys are made once and kept in the store, so subscriptions survive restarts.
const webpush = require('web-push');
const store = require('./store');

let ready = false;
function init(){
  if(ready) return true;
  let k = store.get('vapid');
  if(!k){ k = webpush.generateVAPIDKeys(); store.set('vapid', k); }
  webpush.setVapidDetails(process.env.PUBLIC_URL || 'https://gta-poker.onrender.com', k.publicKey, k.privateKey);
  ready = true; return true;
}
const publicKey = () => { init(); return store.get('vapid').publicKey; };

function subscribe(uid, sub){
  if(!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) throw new Error('That notification setup did not work.');
  const clean = { endpoint: sub.endpoint.slice(0, 600), keys: { p256dh: String(sub.keys.p256dh).slice(0, 200), auth: String(sub.keys.auth).slice(0, 100) } };
  const list = (store.get('push:' + uid) || []).filter(s => s.endpoint !== clean.endpoint);
  store.set('push:' + uid, [...list, clean].slice(-5));
}
function unsubscribe(uid, endpoint){
  const list = (store.get('push:' + uid) || []).filter(s => s.endpoint !== endpoint);
  if(list.length) store.set('push:' + uid, list); else store.del('push:' + uid);
}
const hasPush = uid => (store.get('push:' + uid) || []).length > 0;

// Fire and forget. Subscriptions the browser has dropped (404/410) are removed.
async function notify(uids, msg){
  if(process.env.PUSH_LOG) console.log('push', msg.tag, msg.title, '->', [...new Set(uids)].length, 'players');
  if(process.env.NO_PUSH) return 0;
  init();
  const body = JSON.stringify({ title: msg.title, body: msg.body, tag: msg.tag || 'club', url: msg.url || '/' });
  let sent = 0;
  await Promise.all([...new Set(uids)].flatMap(uid => (store.get('push:' + uid) || []).map(s =>
    webpush.sendNotification(s, body, { TTL: msg.ttl || 3600, urgency: 'high' }).then(() => { sent++; })
      .catch(e => { if(e.statusCode === 404 || e.statusCode === 410) unsubscribe(uid, s.endpoint); else console.error('push failed', e.statusCode || e.message); }))));
  return sent;
}
module.exports = { publicKey, subscribe, unsubscribe, hasPush, notify };
