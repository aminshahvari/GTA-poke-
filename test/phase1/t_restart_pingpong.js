// P0 deploy race: restart_pingpong (the evidence-package repro, item 02 section 3.3, as a test)
// A Render deploy overlap: OLD is running, NEW boots and takes the lease. A small supervisor plays Render: during the
// overlap any process that exits is restarted in the same instance (same RENDER_INSTANCE_ID, new pid); at the end OLD
// gets SIGTERM. Before the fix, OLD exited on lease loss, was restarted, and re-claimed the lease (epoch 1 -> 6).
// Pass: the lease changes hands exactly once (epoch 1 -> 2), no process is restarted, NEW ends healthy at epoch 2,
// and OLD exits 0 on SIGTERM.
const L = require('./lib');
const NAME = 'restart_pingpong', EXPECT_FAIL = false;
const OVERLAP = 12000, RESTART_MS = 1500;
const procs = {};
let client;
L.guard(NAME, EXPECT_FAIL, async () => {
  const dbDir = L.tmpdir('pingpong');
  const ports = { OLD: await L.freePort(), NEW: await L.freePort() };
  const ids = { OLD: 'srv-hibernate-old-ckzdq', NEW: 'srv-hibernate-new-9mhp7' };
  const restarts = { OLD: 0, NEW: 0 }, epochs = new Set();
  let windowOpen = true, retired = false;
  async function boot(who){
    const s = await L.startServer({ mode: 'pg', dbDir, port: ports[who], label: who, env: { RENDER_INSTANCE_ID: ids[who] } });
    procs[who] = s;
    s.exited.then(async () => {
      if(who === 'OLD' && retired) return;
      if(windowOpen || who === 'NEW'){ restarts[who]++; await L.sleep(RESTART_MS); if(who === 'OLD' && retired) return; await boot(who).catch(() => {}); }
    });
    return s;
  }
  await boot('OLD');
  const tokens = await L.setupClub(procs.OLD.base, 2);
  client = await L.connect(ports.OLD, tokens[1], { i: 1 });
  await L.sleep(500);
  await boot('NEW');
  const watch = setInterval(() => { const l = L.readDb(dbDir).lease || {}; if(l.epoch != null) epochs.add(l.epoch); }, 50);
  await L.sleep(OVERLAP);
  windowOpen = false; retired = true;
  const old = procs.OLD; old.proc.kill('SIGTERM');
  const oldExit = await Promise.race([old.exited, L.sleep(2000).then(() => null)]);
  await L.sleep(1500);
  clearInterval(watch);
  const h = await fetch(procs.NEW.base + '/healthz').then(async r => ({ status: r.status, ...(await r.json()) })).catch(e => ({ error: e.message }));
  const maxEpoch = Math.max(...epochs), issues = [];
  if(maxEpoch !== 2) issues.push(`lease epoch went 1 -> ${maxEpoch} (${maxEpoch - 1} handovers, expected 1)`);
  if(restarts.OLD || restarts.NEW) issues.push(`restarts OLD=${restarts.OLD} NEW=${restarts.NEW}`);
  if(h.status !== 200 || h.epoch !== 2) issues.push('NEW /healthz ' + JSON.stringify(h));
  if(!oldExit || oldExit.code !== 0) issues.push('OLD on SIGTERM: ' + JSON.stringify(oldExit));
  if(client.closeCode !== 4001) issues.push('member on OLD closed with ' + client.closeCode);
  L.result(NAME, { pass: !issues.length, expectFail: EXPECT_FAIL,
    reason: issues.length ? issues.join('; ') : 'one handover (epoch 1 -> 2) in a 12 s overlap with a restarting supervisor; OLD stayed fenced, exited 0 on SIGTERM',
    notes: [`epochs seen ${[...epochs].join(',')}; restarts ${JSON.stringify(restarts)}; NEW healthz ${JSON.stringify(h)}; OLD exit ${JSON.stringify(oldExit)}`] });
}, () => { if(client) L.closeAll([client]); Object.values(procs).forEach(p => L.stop(p)); });
