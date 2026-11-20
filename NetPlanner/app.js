'use strict';

/* =====================================================================
 * Nätverksplaneraren
 * Ren HTML/JS utan beroenden. Projektet sparas automatiskt i webbläsaren
 * (localStorage) och kan exporteras/importeras som JSON.
 * ===================================================================== */

/* ---------------- Hjälpfunktioner ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lvl = c => (c && POE_LEVEL[c]) || 0;
const fmtW = w => (Math.round((w || 0) * 10) / 10).toLocaleString('sv-SE') + ' W';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const isInfraType = t => !!(TYPES[t] && TYPES[t].infra);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NET_COLORS = ['#2563eb', '#16a34a', '#db2777', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04', '#dc2626'];
const STORAGE_KEY = 'netplanner.project.v1';
const SEV_RANK = { error: 3, warn: 2, info: 1 };
const FIT_CODES = new Set(['ports', 'sfp', 'poe-ports', 'poe-class', 'poe-watts', 'budget']);

function expandPorts(groups) {
  const out = [];
  for (const g of groups || []) {
    for (let i = 0; i < (g.n || 0); i++) {
      out.push({ t: g.t || 'rj45', sp: g.sp || '1G', poe: g.poe || null, role: g.role || 'lan' });
    }
  }
  return out;
}

function portsSummary(ports, budget) {
  const rj = ports.filter(p => p.t === 'rj45');
  const sfp = ports.length - rj.length;
  const poeBy = {};
  rj.forEach(p => { if (p.poe) poeBy[p.poe] = (poeBy[p.poe] || 0) + 1; });
  const poeTxt = Object.entries(poeBy).map(([c, n]) => `${n}× ${POE_SHORT[c]}`).join(', ');
  const wan = ports.filter(p => p.role === 'wan').length;
  let s = `${rj.length}× RJ45`;
  if (poeTxt) s += ` (${poeTxt})`;
  if (sfp) s += `, ${sfp}× SFP`;
  if (wan) s += ` · varav ${wan} WAN`;
  if (budget) s += ` · PoE-budget ${budget} W`;
  return s;
}

/* ---------------- Projekt / tillstånd ---------------- */
let project;
let history = [];
let future = [];
let selNodes = new Set();
let selLink = null;
let A = null; // senaste analysen av aktivt nätverk

function newNetwork(name, idx = 0) {
  return { id: uid(), name, color: NET_COLORS[idx % NET_COLORS.length], notes: '', nodes: [], links: [], view: { x: 80, y: 60, k: 1 } };
}
function newProject() {
  return { app: 'NetPlanner', version: 1, name: 'Nytt projekt', active: 0, networks: [newNetwork('Nätverk 1')] };
}
const net = () => project.networks[project.active] || project.networks[0];
const nodeById = id => net().nodes.find(n => n.id === id);
const connOf = n => n.conn || TYPES[n.type]?.conn || 'wired';

function snapshot() {
  history.push(JSON.stringify(project));
  if (history.length > 150) history.shift();
  future = [];
}
function undo() {
  if (!history.length) return;
  future.push(JSON.stringify(project));
  project = JSON.parse(history.pop());
  cleanSelection();
  changed();
}
function redo() {
  if (!future.length) return;
  history.push(JSON.stringify(project));
  project = JSON.parse(future.pop());
  cleanSelection();
  changed();
}
function cleanSelection() {
  const nw = net();
  selNodes = new Set([...selNodes].filter(id => nw.nodes.some(n => n.id === id)));
  if (selLink && !nw.links.some(l => l.id === selLink)) selLink = null;
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); } catch (e) { /* lagring ej tillgänglig */ }
  }, 300);
}
function changed() {
  scheduleSave();
  render();
}

/* ---------------- Specifikation för en nod ---------------- */
function spec(n) {
  const t = TYPES[n.type] || TYPES.iot;
  const m = CATALOG_BY_ID[n.model];
  let groups, budget = 0, poeIn = null, selfW = 0, wifi = !!t.wifi, cellular = false, name, vendor = GEN, note = '';
  if (n.model === 'custom') {
    const c = n.custom || {};
    const total = Math.max(0, +c.ports || 0);
    const poeN = Math.min(Math.max(0, +c.poePorts || 0), total);
    groups = [];
    if (+c.wan > 0) groups.push({ n: +c.wan, role: 'wan' });
    if (poeN) groups.push({ n: poeN, poe: c.poeClass || 'at' });
    if (total - poeN > 0) groups.push({ n: total - poeN });
    if (+c.sfp > 0) groups.push({ n: +c.sfp, t: 'sfp' });
    budget = +c.budget || 0;
    wifi = !!c.wifi;
    cellular = !!c.cellular;
    name = 'Anpassad';
  } else if (m) {
    groups = m.ports || [{ n: 1 }];
    budget = m.budget || 0;
    poeIn = m.poeIn || null;
    selfW = m.selfW || 0;
    if (m.wifi !== undefined) wifi = m.wifi;
    cellular = !!m.cellular;
    name = m.name;
    vendor = m.vendor;
    note = m.note || '';
  } else {
    groups = [{ n: 1 }];
    name = `${t.label} (generisk)`;
  }
  const ports = expandPorts(groups);
  let poeNeed, watts;
  if (poeIn) {
    poeNeed = poeIn;
    watts = n.watts ?? selfW;
  } else if (isInfraType(n.type)) {
    poeNeed = null;
    watts = 0;
  } else {
    poeNeed = n.poe !== undefined ? (n.poe || null) : (m?.poe ?? t.poe ?? null);
    watts = n.watts ?? m?.watts ?? t.watts ?? 0;
  }
  const power = n.power || (poeNeed ? 'poe' : 'local');
  return {
    ports, budget, poeIn, poeNeed, watts, power,
    needsPoe: !!poeNeed && power === 'poe',
    poeOut: ports.some(p => p.poe),
    wifi, cellular, name, vendor, note, model: m,
  };
}

/* ---------------- Porttilldelning ----------------
 * needs: [{link, peer, fiber, poe, watts, poeIn, wan, uplink}]
 * Returnerar vilken port varje anslutning hamnar på samt eventuella problem.
 */
function assignPorts(ports, needs) {
  const slot = new Array(ports.length).fill(null);
  const byLink = new Map();
  const problems = [];
  const pick = (pred, score) => {
    let best = -1, bs = Infinity;
    for (let i = 0; i < ports.length; i++) {
      if (slot[i] || !pred(ports[i])) continue;
      const sc = score(ports[i], i);
      if (sc < bs) { bs = sc; best = i; }
    }
    return best;
  };
  const prio = nd => (nd.poeIn ? 1000 : 0) + (nd.wan ? 900 : 0) + (nd.fiber ? 800 : 0) + (nd.poe ? 100 + lvl(nd.poe) * 10 : 0) + (nd.uplink ? 50 : 0);
  const order = [...needs].sort((a, b) => prio(b) - prio(a));

  for (const nd of order) {
    let i = -1;
    if (nd.fiber) {
      i = pick(p => p.t === 'sfp' && (nd.wan || p.role !== 'wan'), p => (nd.wan && p.role === 'wan') ? 0 : 10);
      if (i < 0) { problems.push({ code: 'sfp', need: nd }); continue; }
      if (nd.wan && ports[i].role !== 'wan') problems.push({ code: 'wan-lan', need: nd, port: i });
    } else if (nd.poeIn) {
      i = pick(p => p.t === 'rj45' && p.role === 'poein', (p, k) => k);
      if (i < 0) i = pick(p => p.t === 'rj45' && p.role !== 'wan', (p, k) => lvl(p.poe) * 100 + k);
    } else if (nd.wan) {
      i = pick(p => p.t === 'rj45' && p.role === 'wan', (p, k) => k);
      if (i < 0) {
        i = pick(p => p.t === 'rj45' && p.role !== 'poein', (p, k) => lvl(p.poe) * 100 + k);
        if (i >= 0) problems.push({ code: 'wan-lan', need: nd, port: i });
      }
    } else if (nd.poe) {
      const need = lvl(nd.poe);
      i = pick(p => p.t === 'rj45' && p.role === 'lan' && lvl(p.poe) >= need, (p, k) => lvl(p.poe) * 100 + k);
      if (i < 0) {
        i = pick(p => p.t === 'rj45' && p.role !== 'wan', (p, k) => -lvl(p.poe) * 100 + k);
        if (i >= 0) problems.push({ code: lvl(ports[i].poe) ? 'poe-class' : 'poe-ports', need: nd, port: i });
      } else if (nd.watts > POE_MAX_W[ports[i].poe] + 0.01) {
        problems.push({ code: 'poe-watts', need: nd, port: i });
      }
    } else if (nd.uplink) {
      i = pick(p => p.t === 'rj45' && p.role !== 'wan', (p, k) => (p.role === 'poein' ? -1000 : 0) + lvl(p.poe) * 100 - k);
    } else {
      i = pick(p => p.t === 'rj45' && p.role !== 'wan', (p, k) => lvl(p.poe) * 100 + (p.role === 'poein' ? 50 : 0) + k);
    }
    if (i < 0) { problems.push({ code: 'ports', need: nd }); continue; }
    slot[i] = nd;
    byLink.set(nd.link, i);
  }
  return { slot, byLink, problems };
}

/* ---------------- Analys av ett nätverk ---------------- */
function analyze(nw) {
  const nodes = new Map(nw.nodes.map(n => [n.id, n]));
  const specs = new Map(nw.nodes.map(n => [n.id, spec(n)]));
  const links = nw.links.filter(l => nodes.has(l.a) && nodes.has(l.b) && l.a !== l.b);
  const adj = new Map(nw.nodes.map(n => [n.id, []]));
  for (const l of links) { adj.get(l.a).push(l); adj.get(l.b).push(l); }
  const other = (l, id) => (l.a === id ? l.b : l.a);
  const nm = id => nodes.get(id)?.name || '?';

  const issues = [];
  const nodeIssues = new Map(nw.nodes.map(n => [n.id, []]));
  const linkSev = new Map();
  const portProblems = new Map(); // nodeId -> Set(portIndex)
  const markLink = (lid, sev) => { if (lid && (SEV_RANK[sev] > (SEV_RANK[linkSev.get(lid)] || 0))) linkSev.set(lid, sev); };
  const add = (sev, code, msg, nodeId, linkId) => {
    const it = { sev, code, msg, node: nodeId, link: linkId };
    issues.push(it);
    if (nodeId && nodeIssues.has(nodeId)) nodeIssues.get(nodeId).push(it);
    markLink(linkId, sev);
  };

  /* --- Trädstruktur (BFS från internetkällor) --- */
  const isRoot = n => n.type === 'isp' || specs.get(n.id).cellular;
  const parent = new Map(), parentLink = new Map(), depth = new Map();
  const bfs = starts => {
    const q = [...starts];
    starts.forEach(s => depth.set(s.id, 0));
    while (q.length) {
      const n = q.shift();
      for (const l of adj.get(n.id)) {
        const o = other(l, n.id);
        if (depth.has(o)) continue;
        depth.set(o, depth.get(n.id) + 1);
        parent.set(o, n.id);
        parentLink.set(o, l.id);
        q.push(nodes.get(o));
      }
    }
  };
  bfs(nw.nodes.filter(isRoot));
  const rank = n => ({ isp: 4, router: 3, switch: 2, ap: 1 }[n.type] || 0) * 1000 + adj.get(n.id).length;
  for (;;) {
    const rest = nw.nodes.filter(n => !depth.has(n.id));
    if (!rest.length) break;
    rest.sort((a, b) => rank(b) - rank(a));
    bfs([rest[0]]);
  }

  /* --- WiFi-länkar --- */
  for (const l of links) {
    if (l.medium === 'wifi' && !specs.get(l.a).wifi && !specs.get(l.b).wifi) {
      add('warn', 'wifi', `WiFi-länk mellan ${nm(l.a)} och ${nm(l.b)}, men ingen av dem har WiFi-accesspunkt.`, l.a, l.id);
    }
  }

  /* --- PoE-matning: vem matar vem --- */
  const poweredBy = new Map(), powerLink = new Map();
  const powers = new Map(nw.nodes.map(n => [n.id, []]));
  for (const n of nw.nodes) {
    const s = specs.get(n.id);
    if (!s.needsPoe) continue;
    const cands = adj.get(n.id).filter(l => l.medium === 'copper' && specs.get(other(l, n.id)).poeOut);
    if (!cands.length) {
      if (adj.get(n.id).length) {
        add('warn', 'nopoe', `${n.name} behöver ${POE_SHORT[s.poeNeed]} men är inte kopplad till någon enhet med PoE-portar. Använd PoE-switch, PoE-injektor eller välj lokal strömförsörjning.`, n.id);
      }
      continue;
    }
    const pl = cands.find(l => l.id === parentLink.get(n.id)) || cands[0];
    const p = other(pl, n.id);
    poweredBy.set(n.id, p);
    powerLink.set(n.id, pl.id);
    powers.get(p).push(n.id);
  }
  const drawMemo = new Map();
  const draw = (id, stack = new Set()) => {
    if (drawMemo.has(id)) return drawMemo.get(id);
    if (stack.has(id)) return 0;
    stack.add(id);
    const s = specs.get(id);
    let w = s.watts || 0;
    if (s.needsPoe && poweredBy.has(id)) for (const c of powers.get(id)) w += draw(c, stack);
    stack.delete(id);
    drawMemo.set(id, w);
    return w;
  };
  const poweredLinks = new Set(powerLink.values());

  /* --- Portar, PoE-budget --- */
  const isWan = (n, o) => {
    if (n.type !== 'router') return false;
    if (o.type === 'isp') return true;
    if (o.type !== 'router') return false;
    return parent.get(n.id) === o.id || (specs.get(o.id).cellular && !specs.get(n.id).cellular);
  };
  const portInfo = new Map();
  for (const n of nw.nodes) {
    const s = specs.get(n.id);
    const needs = adj.get(n.id).filter(l => l.medium !== 'wifi').map(l => {
      const o = other(l, n.id);
      const powersPeer = poweredBy.get(o) === n.id;
      return {
        link: l.id, peer: o, fiber: l.medium === 'fiber',
        poe: powersPeer ? specs.get(o).poeNeed : null,
        watts: powersPeer ? draw(o) : 0,
        poeIn: poweredBy.get(n.id) === o && powerLink.get(n.id) === l.id,
        wan: isWan(n, nodes.get(o)),
        uplink: parent.get(n.id) === o,
      };
    });
    const r = assignPorts(s.ports, needs);
    const load = needs.reduce((sum, nd) => sum + (nd.poe ? nd.watts : 0), 0);
    const pp = new Set();
    portProblems.set(n.id, pp);
    portInfo.set(n.id, { needs, ...r, load, budget: s.budget });

    const over = r.problems.filter(p => p.code === 'ports');
    if (over.length) {
      const rj = s.ports.filter(p => p.t === 'rj45').length, sf = s.ports.length - rj;
      const cu = needs.filter(nd => !nd.fiber).length;
      add('error', 'ports', `${n.name}: ${plural(cu, 'kabelanslutning', 'kabelanslutningar')} men bara ${plural(rj, 'RJ45-port', 'RJ45-portar')}${sf ? ` (+ ${sf} SFP för fiber)` : ''}. ${over.length} får inte plats.`, n.id);
      over.forEach(p => markLink(p.need.link, 'error'));
    }
    const noPoe = r.problems.filter(p => p.code === 'poe-ports');
    if (noPoe.length) {
      const poeTotal = s.ports.filter(p => p.poe).length;
      add('error', 'poe-ports', `${n.name}: ${plural(noPoe.length, 'PoE-enhet', 'PoE-enheter')} får ingen PoE-port (${poeTotal} PoE-portar finns): ${noPoe.map(p => nm(p.need.peer)).join(', ')}.`, n.id);
      noPoe.forEach(p => { markLink(p.need.link, 'error'); pp.add(p.port); });
    }
    for (const p of r.problems) {
      const peer = nm(p.need.peer);
      if (p.code === 'sfp') {
        add('error', 'sfp', `${n.name} saknar ledig SFP-port för fiber till ${peer}.`, n.id, p.need.link);
      } else if (p.code === 'poe-class') {
        add('error', 'poe-class', `${peer} kräver ${POE_SHORT[p.need.poe]} men port ${p.port + 1} på ${n.name} ger bara ${POE_SHORT[s.ports[p.port].poe]}.`, n.id, p.need.link);
        pp.add(p.port);
      } else if (p.code === 'poe-watts') {
        add('error', 'poe-watts', `${peer} drar ${fmtW(p.need.watts)} – mer än port ${p.port + 1} på ${n.name} klarar (${POE_SHORT[s.ports[p.port].poe]}, max ${POE_MAX_W[s.ports[p.port].poe]} W).`, n.id, p.need.link);
        pp.add(p.port);
      } else if (p.code === 'wan-lan') {
        add('info', 'wan-lan', `${peer} är kopplad till LAN-port ${p.port + 1} på ${n.name}. Porten behöver konfigureras som extra WAN.`, n.id, p.need.link);
      }
    }
    if (s.budget > 0 && load > 0) {
      const pct = load / s.budget;
      if (pct > 1) add('error', 'budget', `${n.name}: PoE-lasten ${fmtW(load)} överstiger budgeten ${s.budget} W.`, n.id);
      else if (pct > 0.8) add('warn', 'budget80', `${n.name}: PoE-lasten ${fmtW(load)} av ${s.budget} W (${Math.round(pct * 100)} %) – liten marginal.`, n.id);
    } else if (s.poeOut && !s.budget && load > 0) {
      add('info', 'budget-unknown', `${n.name}: PoE-budget okänd – kontrollera att ${fmtW(load)} räcker.`, n.id);
    }
    if (n.type === 'router' && !s.cellular && nw.nodes.some(isRoot) && !needs.some(nd => nd.wan)) {
      add('info', 'no-wan', `${n.name} har ingen WAN-anslutning till internetkällan.`, n.id);
    }
  }

  /* --- Slingor (endast trådbundna länkar) --- */
  const uf = new Map(nw.nodes.map(n => [n.id, n.id]));
  const find = x => { while (uf.get(x) !== x) { uf.set(x, uf.get(uf.get(x))); x = uf.get(x); } return x; };
  for (const l of links) {
    if (l.medium === 'wifi') continue;
    const ra = find(l.a), rb = find(l.b);
    if (ra === rb) add('warn', 'loop', `Slinga: länken ${nm(l.a)} – ${nm(l.b)} sluter en ring. Kräver STP/länkaggregering, annars risk för broadcast-storm.`, l.a, l.id);
    else uf.set(ra, rb);
  }

  /* --- Oanslutna enheter --- */
  const hasWifiSource = nw.nodes.some(n => specs.get(n.id).wifi);
  for (const n of nw.nodes) {
    if (adj.get(n.id).length) continue;
    if (connOf(n) === 'wifi' && !isInfraType(n.type)) {
      if (!hasWifiSource) add('warn', 'nowifi', `${n.name} använder WiFi men nätverket saknar accesspunkt.`, n.id);
    } else if (nw.nodes.length > 1) {
      add('warn', 'unconnected', `${n.name} är inte ansluten.`, n.id);
    }
  }
  if (nw.nodes.length && !nw.nodes.some(isRoot)) {
    add('info', 'nowan', 'Nätverket saknar internetkälla (Starlink, 5G-router eller fiber).');
  }

  issues.sort((a, b) => SEV_RANK[b.sev] - SEV_RANK[a.sev]);
  const counts = { error: 0, warn: 0, info: 0 };
  issues.forEach(i => counts[i.sev]++);
  return { nodes, specs, adj, parent, parentLink, poweredBy, powerLink, poweredLinks, powers, draw, portInfo, portProblems, issues, nodeIssues, linkSev, counts, isRoot };
}

/* ---------------- Förslag på switchmodeller ---------------- */
const portCount = m => expandPorts(m.ports).length;
function rankModels(needs, preferVendor, excludeId, opts = {}) {
  const out = [];
  const poweredViaPoe = needs.some(nd => nd.poeIn);
  for (const m of CATALOG) {
    if (m.type !== 'switch' || m.id === excludeId) continue;
    if (opts.noPoeIn && m.poeIn) continue;
    const ports = expandPorts(m.ports);
    const nds = needs.map(nd => (nd.poeIn && !m.poeIn) ? { ...nd, poeIn: false, uplink: true } : nd);
    const r = assignPorts(ports, nds);
    if (r.problems.some(p => FIT_CODES.has(p.code))) continue;
    const load = nds.reduce((s, nd) => s + (nd.poe ? nd.watts : 0), 0);
    if (load > 0 && load > (m.budget || 0)) continue;
    out.push({
      m, load, pct: m.budget ? load / m.budget : 0, free: ports.length - nds.length,
      adapter: needs.some(nd => nd.poeIn) && !m.poeIn,
    });
  }
  /* Modeller som själva vill matas via PoE sorteras sist om enheten inte matas via PoE i dag */
  const pin = r => (!poweredViaPoe && r.m.poeIn ? 1 : 0);
  out.sort((a, b) =>
    ((b.m.vendor === preferVendor) - (a.m.vendor === preferVendor)) ||
    (pin(a) - pin(b)) ||
    ((a.pct > 0.8) - (b.pct > 0.8)) ||
    ((a.free < 2) - (b.free < 2)) ||
    (portCount(a.m) - portCount(b.m)) ||
    ((a.m.budget || 0) - (b.m.budget || 0)));
  return out;
}
function preferredVendor(n) {
  const v = CATALOG_BY_ID[n?.model]?.vendor;
  return v && v !== GEN ? v : UI;
}
function nodeNeedsFix(id) {
  return (A.nodeIssues.get(id) || []).some(i => FIT_CODES.has(i.code));
}

/* ---------------- Ändringar i modellen ---------------- */
function nextName(nw, base) {
  const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' (\\d+)$');
  let max = 0;
  nw.nodes.forEach(n => { const m = re.exec(n.name); if (m) max = Math.max(max, +m[1]); });
  return `${base} ${max + 1}`;
}

function createNode(type, model, base, x, y) {
  const nw = net();
  const n = { id: uid(), type, model: model ?? (DEFAULT_MODEL[type] || ''), name: nextName(nw, base || TYPES[type].label), x: Math.round(x), y: Math.round(y) };
  nw.nodes.push(n);
  return n;
}

function connect(aId, bId, medium) {
  if (aId === bId) return null;
  const nw = net();
  if (nw.links.some(l => (l.a === aId && l.b === bId) || (l.a === bId && l.b === aId))) return null;
  const a = nodeById(aId), b = nodeById(bId);
  if (!a || !b) return null;
  if (!medium) {
    const sa = spec(a), sb = spec(b);
    const wantsWifi = (x, sy) => connOf(x) === 'wifi' && !isInfraType(x.type) && sy.wifi;
    medium = (wantsWifi(a, sb) || wantsWifi(b, sa)) ? 'wifi' : 'copper';
  }
  if (medium !== 'wifi') {
    [a, b].forEach(x => { if (connOf(x) === 'wifi' && TYPES[x.type].canWifi) x.conn = 'wired'; });
  }
  const l = { id: uid(), a: aId, b: bId, medium };
  nw.links.push(l);
  return l;
}

function removeLink(id) {
  const nw = net();
  nw.links = nw.links.filter(l => l.id !== id);
}

function deleteSelection() {
  const nw = net();
  if (selLink) {
    snapshot();
    removeLink(selLink);
    selLink = null;
    changed();
    return;
  }
  if (!selNodes.size) return;
  snapshot();
  nw.nodes = nw.nodes.filter(n => !selNodes.has(n.id));
  nw.links = nw.links.filter(l => !selNodes.has(l.a) && !selNodes.has(l.b));
  selNodes.clear();
  changed();
}

function duplicateSelection() {
  if (!selNodes.size) return;
  snapshot();
  const nw = net();
  const map = new Map();
  for (const n of nw.nodes.filter(n => selNodes.has(n.id))) {
    const c = JSON.parse(JSON.stringify(n));
    c.id = uid();
    c.x += 40; c.y += 40;
    const base = n.name.replace(/ \d+$/, '');
    c.name = nextName(nw, base);
    map.set(n.id, c.id);
    nw.nodes.push(c);
  }
  for (const l of [...nw.links]) {
    if (map.has(l.a) && map.has(l.b)) nw.links.push({ ...l, id: uid(), a: map.get(l.a), b: map.get(l.b) });
  }
  selNodes = new Set(map.values());
  selLink = null;
  changed();
}

/* Lägg till enheter från paletten. Om en switch/router/AP är markerad kopplas de nya enheterna dit. */
let addOffset = 0;
function addFromPalette(item, at) {
  const qty = clamp(parseInt($('#qty').value, 10) || 1, 1, 100);
  const nw = net();
  snapshot();
  let parentNode = null;
  if (!at && selNodes.size === 1) {
    const p = nodeById([...selNodes][0]);
    if (p && (isInfraType(p.type) || p.type === 'ap')) parentNode = p;
  }
  const added = [];
  if (parentNode) {
    const existing = nw.links.filter(l => l.a === parentNode.id || l.b === parentNode.id).length;
    for (let k = 0; k < qty; k++) {
      const j = existing + k, col = j % 6, row = Math.floor(j / 6);
      const n = createNode(item.type, item.model, item.label, parentNode.x + (col - 2.5) * 175, parentNode.y + 140 + row * 62);
      connect(parentNode.id, n.id);
      added.push(n);
    }
    toast(`${plural(qty, 'enhet', 'enheter')} kopplades till ${parentNode.name}.`);
  } else {
    let cx, cy;
    if (at) { cx = at.x; cy = at.y; } else {
      const c = viewCenter();
      cx = c.x + (addOffset % 5) * 24; cy = c.y + (addOffset % 5) * 24;
      addOffset++;
    }
    const cols = Math.ceil(Math.sqrt(qty));
    for (let k = 0; k < qty; k++) {
      const col = k % cols, row = Math.floor(k / cols);
      added.push(createNode(item.type, item.model, item.label, cx + (col - (cols - 1) / 2) * 175, cy + row * 62));
    }
    selNodes = new Set(added.map(n => n.id));
  }
  selLink = null;
  changed();
}

/* Koppla markerade enheter till en målenhet (flyttar klienternas befintliga upplänk). */
function connectSelectedTo(targetId) {
  const nw = net();
  const target = nodeById(targetId);
  if (!target) return;
  snapshot();
  const an = analyze(nw);
  let n = 0;
  for (const id of selNodes) {
    if (id === targetId) continue;
    const node = nodeById(id);
    if (!isInfraType(node.type)) {
      const pl = an.parentLink.get(id);
      if (pl) removeLink(pl);
    }
    if (connect(targetId, id)) n++;
  }
  toast(`${plural(n, 'enhet', 'enheter')} kopplades till ${target.name}.`);
  changed();
}

function needsForPeers(an, peerIds) {
  return peerIds.map(pid => {
    const s = an.specs.get(pid);
    return { link: 'x' + pid, peer: pid, fiber: false, poe: s.needsPoe ? s.poeNeed : null, watts: s.needsPoe ? an.draw(pid) : 0, poeIn: false, wan: false, uplink: false };
  });
}

/* Skapa en ny switch för markerade enheter, med en modell som klarar portar + PoE. */
function newSwitchForSelection() {
  const nw = net();
  const an = analyze(nw);
  const ids = [...selNodes].filter(id => !isInfraType(nodeById(id).type));
  if (!ids.length) { toast('Markera klientenheter (kameror, AP, datorer …) först.'); return; }
  const needs = needsForPeers(an, ids).concat([{ link: 'up', peer: 'up', uplink: true }]);
  const ranked = rankModels(needs, UI, null, { noPoeIn: true });
  const model = ranked[0]?.m || largestSwitch();
  snapshot();
  const oldParents = new Set();
  for (const id of ids) {
    const pl = an.parentLink.get(id);
    if (pl) { oldParents.add(an.parent.get(id)); removeLink(pl); }
  }
  const cx = ids.reduce((s, id) => s + nodeById(id).x, 0) / ids.length;
  const cy = Math.min(...ids.map(id => nodeById(id).y)) - 130;
  const sw = createNode('switch', model.id, 'Switch', cx, cy);
  ids.forEach(id => connect(sw.id, id, 'copper'));
  if (oldParents.size === 1) {
    const p = [...oldParents][0];
    if (p && !ids.includes(p)) connect(p, sw.id, 'copper');
  }
  selNodes = new Set([sw.id]);
  toast(`${sw.name} (${model.name}) skapades för ${plural(ids.length, 'enhet', 'enheter')}.`);
  changed();
}

function largestSwitch() {
  return CATALOG.filter(m => m.type === 'switch').sort((a, b) => portCount(b) - portCount(a) || (b.budget || 0) - (a.budget || 0))[0];
}

/* Flytta klienter från en full enhet till en ny switch som kopplas till enheten. */
function offloadToNewSwitch(id) {
  const nw = net();
  const an = analyze(nw);
  const n = nodeById(id);
  const info = an.portInfo.get(id);
  let movable = info.needs.filter(nd => !nd.uplink && !nd.wan && !nd.poeIn && !nd.fiber && !isInfraType(nodeById(nd.peer).type));
  if (!movable.length) { toast('Det finns inga klientenheter att flytta.'); return; }
  if (n.type === 'switch') {
    /* Flytta så få enheter som möjligt: först de som inte fick plats, sedan de som drar mest PoE,
       tills resten (plus upplänken till den nya switchen) ryms i portar och PoE-budget. */
    const s = spec(n);
    const failed = new Set(info.problems.filter(p => FIT_CODES.has(p.code)).map(p => p.need.link));
    movable.sort((a, b) => (failed.has(b.link) - failed.has(a.link)) || (b.watts - a.watts));
    let k = 1;
    for (; k < movable.length; k++) {
      const moved = new Set(movable.slice(0, k).map(nd => nd.link));
      const rest = info.needs.filter(nd => !moved.has(nd.link)).concat([{ link: 'new', peer: 'new', uplink: false }]);
      const r = assignPorts(s.ports, rest);
      const load = rest.reduce((sum, nd) => sum + (nd.poe ? nd.watts : 0), 0);
      if (!r.problems.some(p => FIT_CODES.has(p.code)) && (!s.budget || load <= s.budget)) break;
    }
    movable = movable.slice(0, k);
  }
  const peers = movable.map(nd => nd.peer);
  const needs = needsForPeers(an, peers).concat([{ link: 'up', peer: id, uplink: true }]);
  const model = rankModels(needs, preferredVendor(n), null, { noPoeIn: true })[0]?.m || largestSwitch();
  snapshot();
  movable.forEach(nd => removeLink(nd.link));
  const px = peers.reduce((s, p) => s + nodeById(p).x, 0) / peers.length;
  const sw = createNode('switch', model.id, 'Switch', px + 60, n.y + 120);
  connect(id, sw.id, 'copper');
  peers.forEach(p => connect(sw.id, p, 'copper'));
  selNodes = new Set([sw.id]);
  selLink = null;
  toast(`${plural(peers.length, 'enhet', 'enheter')} flyttades till ${sw.name} (${model.name}).`);
  changed();
}

function changeModel(id, modelId) {
  const n = nodeById(id);
  if (!n) return;
  snapshot();
  n.model = modelId;
  changed();
}

/* ---------------- Layout & vy ---------------- */
function nodeBox(n, s) {
  if (!isInfraType(n.type)) return { w: 160, h: 46, rows: 0, cols: 0 };
  const np = s.ports.length;
  const rows = np > 12 ? 2 : 1;
  const cols = Math.max(1, Math.ceil(np / rows));
  return { w: Math.max(184, cols * 11 + 24), h: 62 + rows * 11, rows, cols };
}

function contentBBox(nw, pad = 0) {
  if (!nw.nodes.length) return { x: 0, y: 0, w: 100, h: 100 };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of nw.nodes) {
    const b = nodeBox(n, spec(n));
    x1 = Math.min(x1, n.x - b.w / 2); x2 = Math.max(x2, n.x + b.w / 2);
    y1 = Math.min(y1, n.y - b.h / 2); y2 = Math.max(y2, n.y + b.h / 2 + 8);
  }
  return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + 2 * pad, h: y2 - y1 + 2 * pad };
}

function fitView() {
  const nw = net();
  const svg = $('#canvas');
  const W = svg.clientWidth, H = svg.clientHeight;
  if (!nw.nodes.length || !W) { nw.view = { x: 80, y: 60, k: 1 }; renderCanvas(); return; }
  const bb = contentBBox(nw, 40);
  const k = clamp(Math.min(W / bb.w, H / bb.h), 0.15, 1.4);
  nw.view = { k, x: (W - bb.w * k) / 2 - bb.x * k, y: (H - bb.h * k) / 2 - bb.y * k };
  scheduleSave();
  renderCanvas();
}

function zoomBy(f, cx, cy) {
  const v = net().view;
  const svg = $('#canvas');
  if (cx === undefined) { cx = svg.clientWidth / 2; cy = svg.clientHeight / 2; }
  const k = clamp(v.k * f, 0.15, 3);
  v.x = cx - (cx - v.x) * (k / v.k);
  v.y = cy - (cy - v.y) * (k / v.k);
  v.k = k;
  scheduleSave();
  renderCanvas();
}

function viewCenter() {
  const v = net().view, svg = $('#canvas');
  return { x: (svg.clientWidth / 2 - v.x) / v.k, y: (svg.clientHeight / 2 - v.y) / v.k };
}

function toWorld(e) {
  const r = $('#canvas').getBoundingClientRect();
  const v = net().view;
  return { x: (e.clientX - r.left - v.x) / v.k, y: (e.clientY - r.top - v.y) / v.k };
}

/* Automatisk trädlayout utifrån internetkällan */
function layoutTree() {
  const nw = net();
  if (!nw.nodes.length) return;
  snapshot();
  const an = analyze(nw);
  const kids = new Map(nw.nodes.map(n => [n.id, []]));
  const roots = [];
  for (const n of nw.nodes) {
    const p = an.parent.get(n.id);
    if (p) kids.get(p).push(n); else roots.push(n);
  }
  const typeOrder = t => ['isp', 'router', 'switch', 'nvr', 'ap', 'camera', 'workstation', 'printer', 'tv', 'phone', 'laptop', 'mobile', 'iot'].indexOf(t);
  kids.forEach(list => list.sort((a, b) => typeOrder(a.type) - typeOrder(b.type) || a.name.localeCompare(b.name, 'sv', { numeric: true })));
  const LEAF_W = 178, LEAF_H = 62, GAP = 36, LEVEL = 150;
  const blocks = new Map();
  const width = new Map();
  const measure = n => {
    const ch = kids.get(n.id);
    const leaves = ch.filter(c => !kids.get(c.id).length && !isInfraType(c.type));
    const branches = ch.filter(c => !leaves.includes(c));
    const bl = [];
    if (leaves.length) { const cols = Math.min(4, leaves.length); bl.push({ leaves, cols, w: cols * LEAF_W }); }
    for (const b of branches) bl.push({ branch: b, w: measure(b) });
    blocks.set(n.id, bl);
    const bw = bl.reduce((s, b) => s + b.w, 0) + Math.max(0, bl.length - 1) * GAP;
    const w = Math.max(nodeBox(n, an.specs.get(n.id)).w + 20, bw);
    width.set(n.id, w);
    return w;
  };
  const place = (n, cx, y) => {
    n.x = Math.round(cx); n.y = Math.round(y);
    const bl = blocks.get(n.id);
    const bw = bl.reduce((s, b) => s + b.w, 0) + Math.max(0, bl.length - 1) * GAP;
    let x = cx - bw / 2;
    for (const b of bl) {
      if (b.leaves) {
        b.leaves.forEach((c, i) => {
          c.x = Math.round(x + (i % b.cols) * LEAF_W + LEAF_W / 2);
          c.y = Math.round(y + LEVEL + Math.floor(i / b.cols) * LEAF_H);
        });
      } else {
        place(b.branch, x + b.w / 2, y + LEVEL);
      }
      x += b.w + GAP;
    }
  };
  roots.sort((a, b) => (an.isRoot(b) - an.isRoot(a)) || typeOrder(a.type) - typeOrder(b.type));
  let x = 0;
  for (const r of roots) {
    const w = measure(r);
    place(r, x + w / 2, 0);
    x += w + GAP * 2;
  }
  changed();
  fitView();
}

/* ---------------- Rendering ---------------- */
function render() {
  renderTabs();
  renderCanvas();
  renderInspector();
  $('#projectName').value = project.name;
  $('#btnUndo').disabled = !history.length;
  $('#btnRedo').disabled = !future.length;
}

function renderTabs() {
  const html = project.networks.map((nw, i) => {
    const an = i === project.active && A ? A : analyze(nw);
    const badge = an.counts.error ? `<span class="badge error" title="Fel">${an.counts.error}</span>`
      : an.counts.warn ? `<span class="badge warn" title="Varningar">${an.counts.warn}</span>` : '';
    return `<button class="tab${i === project.active ? ' active' : ''}" data-tab="${i}" style="--tab-color:${esc(nw.color)}">
      <span class="dot"></span>${esc(nw.name)}${badge}</button>`;
  }).join('') + `<button class="tab" id="addNet" title="Lägg till ett fysiskt separat nätverk">＋ Nätverk</button>`;
  $('#tabs').innerHTML = html;
}

function trunc(s, max) {
  s = String(s);
  return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;
}

function edgePoint(c, box, tx, ty) {
  const dx = tx - c.x, dy = ty - c.y;
  if (!dx && !dy) return { x: c.x, y: c.y };
  const sx = dx ? (box.w / 2) / Math.abs(dx) : Infinity;
  const sy = dy ? (box.h / 2) / Math.abs(dy) : Infinity;
  const t = Math.min(sx, sy, 1);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

function renderCanvas() {
  const nw = net();
  A = analyze(nw);
  const v = nw.view;
  $('#viewport').setAttribute('transform', `translate(${v.x},${v.y}) scale(${v.k})`);
  $('#grid').setAttribute('patternTransform', `translate(${v.x},${v.y}) scale(${v.k})`);
  $('#emptyHint').hidden = nw.nodes.length > 0;

  const boxes = new Map(nw.nodes.map(n => [n.id, nodeBox(n, A.specs.get(n.id))]));

  /* Länkar */
  let lh = '';
  for (const l of nw.links) {
    const a = A.nodes.get(l.a), b = A.nodes.get(l.b);
    if (!a || !b) continue;
    const p1 = edgePoint(a, boxes.get(a.id), b.x, b.y);
    const p2 = edgePoint(b, boxes.get(b.id), a.x, a.y);
    const sev = A.linkSev.get(l.id);
    const powered = A.poweredLinks.has(l.id);
    let color = l.medium === 'fiber' ? 'var(--fiber)' : l.medium === 'wifi' ? 'var(--wifi)' : powered ? 'var(--poe)' : 'var(--link)';
    if (sev === 'error') color = 'var(--error)';
    else if (sev === 'warn') color = 'var(--warn)';
    const width = (l.id === selLink ? 2 : 0) + (l.medium === 'fiber' ? 3 : 2);
    const dash = l.medium === 'wifi' ? 'stroke-dasharray="6 5"' : '';
    lh += `<g data-link="${l.id}">
      <line class="link-hit" x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"/>
      ${l.id === selLink ? `<line class="link-line" x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" style="stroke:var(--accent);stroke-width:${width + 5};opacity:.25"/>` : ''}
      <line class="link-line" x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" style="stroke:${color};stroke-width:${width}" ${dash}/>`;
    /* portetiketter nära infrastrukturens ände */
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const ux = (p2.x - p1.x) / len, uy = (p2.y - p1.y) / len;
    for (const [nd, p, dir] of [[a, p1, 1], [b, p2, -1]]) {
      const pi = A.portInfo.get(nd.id);
      if (!isInfraType(nd.type) || !pi || !pi.byLink.has(l.id) || len < 70) continue;
      const lx = p.x + ux * dir * 16 + (Math.abs(uy) > 0.5 ? 10 : 0);
      const ly = p.y + uy * dir * 16 + (Math.abs(uy) > 0.5 ? 0 : -6);
      lh += `<text class="link-label" x="${lx}" y="${ly + 3}" text-anchor="middle">${pi.byLink.get(l.id) + 1}</text>`;
    }
    if (powered && len > 90) {
      const target = [...A.powerLink.entries()].find(([, lid]) => lid === l.id)?.[0];
      const w = target ? A.draw(target) : 0;
      lh += `<text class="link-label poe" x="${(p1.x + p2.x) / 2 + 6}" y="${(p1.y + p2.y) / 2 - 4}">⚡${esc(fmtW(w))}</text>`;
    }
    lh += '</g>';
  }
  $('#linksLayer').innerHTML = lh;

  /* Noder */
  let nh = '';
  for (const n of nw.nodes) {
    const s = A.specs.get(n.id);
    const t = TYPES[n.type] || TYPES.iot;
    const b = boxes.get(n.id);
    const x0 = -b.w / 2, y0 = -b.h / 2;
    const sel = selNodes.has(n.id);
    const iss = A.nodeIssues.get(n.id) || [];
    const worst = iss.reduce((m, i) => Math.max(m, SEV_RANK[i.sev]), 0);
    const maxChars = Math.floor((b.w - 50) / 7.2);
    nh += `<g class="node${sel ? ' selected' : ''}" data-node="${n.id}" transform="translate(${n.x},${n.y})">
      <rect class="card" x="${x0}" y="${y0}" width="${b.w}" height="${b.h}" rx="8" style="stroke:${t.color}"/>
      <rect x="${x0}" y="${y0 + 6}" width="4" height="${b.h - 12}" rx="2" style="fill:${t.color}"/>`;
    if (isInfraType(n.type)) {
      const pi = A.portInfo.get(n.id);
      const used = pi.byLink.size;
      const over = pi.needs.length > used ? ` (+${pi.needs.length - used})` : '';
      let sum = `${used}/${s.ports.length} portar${over}`;
      if (s.budget) sum += ` · ⚡${Math.round(pi.load)}/${s.budget} W`;
      const sumColor = worst >= 3 ? 'var(--error)' : worst === 2 ? 'var(--warn)' : 'var(--muted)';
      nh += `<text x="${x0 + 12}" y="${y0 + 26}" font-size="20">${t.icon}</text>
        <text x="${x0 + 42}" y="${y0 + 18}" font-size="13" font-weight="600">${esc(trunc(n.name, maxChars))}</text>
        <text class="sub" x="${x0 + 42}" y="${y0 + 32}" font-size="11">${esc(trunc(s.name, maxChars + 2))}</text>
        <text x="${x0 + 12}" y="${y0 + 49}" font-size="11" style="fill:${sumColor}">${esc(sum)}</text>`;
      const px0 = -b.cols * 11 / 2 + 1;
      const py0 = y0 + 56;
      const probs = A.portProblems.get(n.id) || new Set();
      s.ports.forEach((p, i) => {
        const col = b.rows === 2 ? Math.floor(i / 2) : i;
        const row = b.rows === 2 ? i % 2 : 0;
        const nd = pi.slot[i];
        let fill = 'var(--port-free)';
        if (nd) fill = nd.poe ? 'var(--poe)' : 'var(--ok)';
        if (probs.has(i)) fill = 'var(--error)';
        const stroke = p.role === 'wan' ? 'stroke:var(--accent);stroke-width:1.6;' : p.t === 'sfp' ? 'stroke:var(--text);stroke-width:1;' : '';
        const tip = `Port ${i + 1}: ${p.t === 'sfp' ? 'SFP' : 'RJ45'} ${p.sp}${p.poe ? ' ' + POE_SHORT[p.poe] : ''}${p.role === 'wan' ? ' (WAN)' : p.role === 'poein' ? ' (PoE in/upplänk)' : ''}${nd ? ' → ' + (A.nodes.get(nd.peer)?.name || '') : ' – ledig'}`;
        nh += `<rect x="${px0 + col * 11}" y="${py0 + row * 11}" width="9" height="9" rx="${p.t === 'sfp' ? 0 : 2}" style="fill:${fill};${stroke}"><title>${esc(tip)}</title></rect>`;
      });
    } else {
      let sub = n.model ? s.name : t.label;
      const extras = [];
      if (connOf(n) === 'wifi') extras.push('WiFi');
      if (s.needsPoe) extras.push(`⚡${fmtW(A.draw(n.id))}`);
      if (n.type === 'ap') {
        const clients = (A.adj.get(n.id) || []).filter(l => l.medium === 'wifi').length;
        if (clients) extras.push(`${clients} klienter`);
      }
      if (extras.length) sub = trunc(sub, Math.max(6, maxChars - extras.join(' · ').length - 1)) + ' · ' + extras.join(' · ');
      nh += `<text x="${x0 + 12}" y="${y0 + 30}" font-size="19">${t.icon}</text>
        <text x="${x0 + 40}" y="${y0 + 19}" font-size="13" font-weight="600">${esc(trunc(n.name, maxChars))}</text>
        <text class="sub" x="${x0 + 40}" y="${y0 + 35}" font-size="11">${esc(trunc(sub, maxChars + 4))}</text>`;
    }
    if (worst) {
      const c = worst === 3 ? 'var(--error)' : worst === 2 ? 'var(--warn)' : 'var(--info)';
      nh += `<g transform="translate(${b.w / 2 - 2},${y0 + 2})"><circle r="9" style="fill:${c}"/><text text-anchor="middle" y="4" font-size="12" font-weight="700" style="fill:#fff">${worst === 1 ? 'i' : '!'}</text><title>${esc(iss.map(i => i.msg).join('\n'))}</title></g>`;
    }
    nh += `<circle class="handle" data-handle="${n.id}" cx="0" cy="${b.h / 2}" r="7"><title>Dra för att koppla ihop</title></circle></g>`;
  }
  $('#nodesLayer').innerHTML = nh;
}

/* ---------------- Inspektör (högerpanel) ---------------- */
function meter(label, used, total, unit = '', warnAt = 0.8) {
  const pct = total ? used / total : (used ? 2 : 0);
  const cls = pct > 1 ? 'error' : pct > warnAt ? 'warn' : '';
  const u = unit ? ' ' + unit : '';
  const fmt = x => (Math.round(x * 10) / 10).toLocaleString('sv-SE');
  return `<div class="meter ${cls}"><div class="lbl"><span>${label}</span><span>${fmt(used)}${u} / ${fmt(total)}${u}</span></div>
    <div class="bar"><i style="width:${Math.min(100, pct * 100)}%"></i></div></div>`;
}

function issuesList(list, clickable) {
  if (!list.length) return '<p class="ok-msg">✔ Inga problem hittades.</p>';
  return `<ul class="issues">${list.map(i => `<li class="${i.sev}${clickable && i.node ? ' clickable' : ''}" ${clickable && i.node ? `data-act="select" data-id="${i.node}"` : ''}>${esc(i.msg)}</li>`).join('')}</ul>`;
}

function modelOptions(n) {
  const list = CATALOG.filter(m => m.type === n.type);
  const groups = {};
  list.forEach(m => (groups[m.vendor] = groups[m.vendor] || []).push(m));
  let html = '';
  if (!isInfraType(n.type)) html += `<option value="" ${!n.model ? 'selected' : ''}>Generisk ${esc(TYPES[n.type].label.toLowerCase())}</option>`;
  for (const [v, ms] of Object.entries(groups)) {
    html += `<optgroup label="${esc(v)}">${ms.map(m => `<option value="${m.id}" ${m.id === n.model ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</optgroup>`;
  }
  if (isInfraType(n.type)) html += `<option value="custom" ${n.model === 'custom' ? 'selected' : ''}>Anpassad (ange själv)…</option>`;
  return html;
}

function field(label, inner, cls = '') {
  return `<div class="field ${cls}"><label>${label}</label>${inner}</div>`;
}

function renderInspector() {
  const el = $('#inspector');
  const active = document.activeElement;
  let focusKey = null, selStart = null;
  if (active && el.contains(active) && active.dataset.f) {
    focusKey = active.dataset.f + '|' + (active.dataset.id || '');
    try { selStart = active.selectionStart; } catch (e) { /* ej textfält */ }
  }
  if (selLink) el.innerHTML = inspLink();
  else if (selNodes.size === 1) el.innerHTML = inspNode(nodeById([...selNodes][0]));
  else if (selNodes.size > 1) el.innerHTML = inspMulti();
  else el.innerHTML = inspNetwork();
  if (focusKey) {
    const [f, id] = focusKey.split('|');
    const target = $$('[data-f]', el).find(x => x.dataset.f === f && (x.dataset.id || '') === id);
    if (target) {
      target.focus();
      if (selStart !== null) try { target.setSelectionRange(selStart, selStart); } catch (e) { /* ignorera */ }
    }
  }
}

function inspNetwork() {
  const nw = net();
  const an = A;
  const byType = {};
  nw.nodes.forEach(n => byType[n.type] = (byType[n.type] || 0) + 1);
  /* Summera bara last från matande enheter som inte själva matas via PoE (undvik dubbelräkning) */
  let poeLoad = 0;
  an.portInfo.forEach((pi, id) => { if (!an.specs.get(id).needsPoe) poeLoad += pi.load; });
  const cables = nw.links.filter(l => l.medium === 'copper').length;
  const fibers = nw.links.filter(l => l.medium === 'fiber').length;
  const colors = NET_COLORS.map(c => `<option value="${c}" ${c === nw.color ? 'selected' : ''} style="color:${c}">● ${c}</option>`).join('');
  return `<h3><span style="color:${esc(nw.color)}">●</span> Nätverk</h3>
    ${field('Namn', `<input data-f="net.name" value="${esc(nw.name)}">`)}
    ${field('Färg', `<select data-f="net.color">${colors}</select>`)}
    ${field('Anteckningar', `<textarea data-f="net.notes" rows="2">${esc(nw.notes || '')}</textarea>`)}
    <h4>Översikt</h4>
    <div class="stat-grid">
      <div class="stat"><b>${nw.nodes.length}</b><span class="muted small">enheter</span></div>
      <div class="stat"><b>${(byType.switch || 0) + (byType.router || 0)}</b><span class="muted small">switchar/routrar</span></div>
      <div class="stat"><b>${fmtW(poeLoad)}</b><span class="muted small">total PoE-last</span></div>
      <div class="stat"><b>${cables}${fibers ? ' + ' + fibers : ''}</b><span class="muted small">kablar${fibers ? ' + fiber' : ''}</span></div>
    </div>
    <h4>Problem och kontroller</h4>
    ${issuesList(an.issues, true)}
    <div class="btn-row">
      <button data-act="dup-net">Duplicera nätverk</button>
      <button data-act="del-net" class="danger" ${project.networks.length < 2 ? 'disabled' : ''}>Ta bort nätverk</button>
    </div>
    <h4>Tips</h4>
    <ul class="muted small" style="padding-left:18px;margin:0">
      <li>Markera en switch och klicka på en enhet i paletten – då kopplas den direkt till switchen (ange antal överst).</li>
      <li>Dra från pricken under en enhet till en annan för att koppla.</li>
      <li>Skift + dra på bakgrunden markerar flera. Dra bakgrunden för att panorera, scrolla för att zooma.</li>
      <li>Del = ta bort, Ctrl+D = duplicera, Ctrl+Z/Y = ångra/gör om.</li>
      <li>Varje flik är ett fysiskt separat nätverk.</li>
    </ul>`;
}

function connectTargetsOptions(excludeIds) {
  const nw = net();
  const cand = nw.nodes.filter(n => !excludeIds.has(n.id) && (isInfraType(n.type) || n.type === 'ap' || n.type === 'nvr'));
  const rest = nw.nodes.filter(n => !excludeIds.has(n.id) && !cand.includes(n));
  const opt = n => `<option value="${n.id}">${TYPES[n.type].icon} ${esc(n.name)}</option>`;
  if (!cand.length && !rest.length) return '';
  return (cand.length ? `<optgroup label="Nätverksenheter">${cand.map(opt).join('')}</optgroup>` : '') +
    (rest.length ? `<optgroup label="Övriga">${rest.map(opt).join('')}</optgroup>` : '');
}

function inspNode(n) {
  if (!n) return '';
  const s = A.specs.get(n.id);
  const t = TYPES[n.type];
  const pi = A.portInfo.get(n.id);
  const infra = isInfraType(n.type);
  const typeOpts = Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${k === n.type ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('');
  let h = `<h3>${t.icon} ${esc(n.name)}</h3>
    ${field('Namn', `<input data-f="name" data-id="${n.id}" value="${esc(n.name)}">`)}
    ${field('Typ', `<select data-f="type" data-id="${n.id}">${typeOpts}</select>`)}
    ${field('Modell', `<select data-f="model" data-id="${n.id}">${modelOptions(n)}</select>`)}`;
  if (s.note) h += `<div class="note">${esc(s.note)}</div>`;
  if (infra || s.ports.length > 1) h += `<div class="note">${esc(portsSummary(s.ports, s.budget))}</div>`;

  if (n.model === 'custom') {
    const c = n.custom || {};
    const num = (k, label) => field(label, `<input type="number" min="0" data-f="custom.${k}" data-id="${n.id}" value="${esc(c[k] ?? 0)}">`);
    h += num('ports', 'LAN-portar (RJ45)') + num('poePorts', 'varav PoE') +
      field('PoE-klass', `<select data-f="custom.poeClass" data-id="${n.id}">${['af', 'at', 'bt'].map(k => `<option value="${k}" ${(c.poeClass || 'at') === k ? 'selected' : ''}>${POE_LONG[k]}</option>`).join('')}</select>`) +
      num('budget', 'PoE-budget (W)') + num('sfp', 'SFP-portar') + num('wan', 'WAN-portar') +
      field('WiFi', `<input type="checkbox" data-f="custom.wifi" data-id="${n.id}" ${c.wifi ? 'checked' : ''}>`) +
      (n.type !== 'switch' ? field('Mobilt internet', `<input type="checkbox" data-f="custom.cellular" data-id="${n.id}" ${c.cellular ? 'checked' : ''}>`) : '');
  }

  if (!infra && t.canWifi) {
    h += field('Anslutning', `<select data-f="conn" data-id="${n.id}">
      <option value="wired" ${connOf(n) === 'wired' ? 'selected' : ''}>Kabel</option>
      <option value="wifi" ${connOf(n) === 'wifi' ? 'selected' : ''}>WiFi</option></select>`);
  }
  if (!infra) {
    const cur = s.poeNeed || '';
    h += field('PoE-behov', `<select data-f="poe" data-id="${n.id}">
      <option value="" ${!cur ? 'selected' : ''}>Ingen PoE</option>
      ${['af', 'at', 'bt'].map(k => `<option value="${k}" ${cur === k ? 'selected' : ''}>${POE_LONG[k]}</option>`).join('')}</select>`);
    if (s.poeNeed) h += field('Effekt (W)', `<input type="number" min="0" step="0.5" data-f="watts" data-id="${n.id}" value="${esc(s.watts)}">`);
  }
  if (s.poeNeed) {
    h += field('Strömmatning', `<select data-f="power" data-id="${n.id}">
      <option value="poe" ${s.power === 'poe' ? 'selected' : ''}>Via PoE</option>
      <option value="local" ${s.power === 'local' ? 'selected' : ''}>Egen adapter / injektor</option></select>`);
    if (s.needsPoe) {
      const by = A.poweredBy.get(n.id);
      h += `<div class="note">${by ? `Matas av <b>${esc(A.nodes.get(by).name)}</b> – drar ${fmtW(A.draw(n.id))}.` : 'Ingen PoE-källa hittad.'}</div>`;
    }
  }
  h += field('IP-adress', `<input data-f="ip" data-id="${n.id}" value="${esc(n.ip || '')}" placeholder="t.ex. 192.168.1.10">`);
  h += field('VLAN', `<input data-f="vlan" data-id="${n.id}" value="${esc(n.vlan || '')}" placeholder="t.ex. 10 / Kameror">`);
  h += field('Plats / notering', `<textarea data-f="notes" data-id="${n.id}" rows="2">${esc(n.notes || '')}</textarea>`);

  /* Anslutningar */
  const links = A.adj.get(n.id) || [];
  h += `<h4>Anslutningar (${links.length})</h4><ul class="conn-list">`;
  for (const l of links) {
    const o = A.nodes.get(l.a === n.id ? l.b : l.a);
    const myPort = pi.byLink.has(l.id) ? `<span class="port-tag" title="Port på ${esc(n.name)}">P${pi.byLink.get(l.id) + 1}</span>` : '';
    const opi = A.portInfo.get(o.id);
    const theirPort = opi.byLink.has(l.id) && isInfraType(o.type) ? `<span class="port-tag" title="Port på ${esc(o.name)}">P${opi.byLink.get(l.id) + 1}</span>` : '';
    const sev = A.linkSev.get(l.id);
    h += `<li>${myPort}<span class="peer" data-act="select" data-id="${o.id}" title="${esc(o.name)}">${sev === 'error' ? '⛔ ' : ''}${TYPES[o.type].icon} ${esc(o.name)}</span>${theirPort}
      <select data-f="medium" data-id="${l.id}" title="Medium">
        <option value="copper" ${l.medium === 'copper' ? 'selected' : ''}>Kabel</option>
        <option value="fiber" ${l.medium === 'fiber' ? 'selected' : ''}>Fiber</option>
        <option value="wifi" ${l.medium === 'wifi' ? 'selected' : ''}>WiFi</option>
      </select>
      <button class="small" data-act="unlink" data-id="${l.id}" title="Koppla bort">✕</button></li>`;
  }
  h += `</ul>`;
  const opts = connectTargetsOptions(new Set([n.id]));
  if (opts) h += `<div class="row" style="margin-top:6px"><select id="connTarget">${opts}</select><button data-act="connect-one" data-id="${n.id}">Anslut</button></div>`;

  /* Kapacitet för infrastruktur */
  if (infra) {
    const rj = s.ports.filter(p => p.t === 'rj45');
    const sfp = s.ports.filter(p => p.t === 'sfp');
    const rjUsed = pi.slot.filter((x, i) => x && s.ports[i].t === 'rj45').length + pi.problems.filter(p => p.code === 'ports' && !p.need.fiber).length;
    const sfpUsed = pi.slot.filter((x, i) => x && s.ports[i].t === 'sfp').length + pi.problems.filter(p => p.code === 'sfp').length;
    const poeNeeds = pi.needs.filter(nd => nd.poe).length;
    const poePorts = s.ports.filter(p => p.poe).length;
    h += `<h4>Kapacitet</h4>`;
    h += meter('RJ45-portar', rjUsed, rj.length, '', 0.9);
    if (sfp.length || sfpUsed) h += meter('SFP-portar', sfpUsed, sfp.length, '', 0.99);
    if (poePorts || poeNeeds) h += meter('PoE-portar', poeNeeds, poePorts, '', 0.9);
    if (s.budget || pi.load) h += meter('PoE-budget', pi.load, s.budget, 'W');

    const myIssues = A.nodeIssues.get(n.id) || [];
    h += issuesList(myIssues, false);

    if (nodeNeedsFix(n.id)) {
      if (n.type === 'switch') {
        const ranked = rankModels(pi.needs, preferredVendor(n), n.model).slice(0, 4);
        h += `<h4>Förslag: byt modell</h4>`;
        if (ranked.length) {
          h += ranked.map(r => `<div class="suggest"><div><b>${esc(r.m.name)}</b><br><span class="muted small">${esc(portsSummary(expandPorts(r.m.ports), r.m.budget))}${r.load ? ` · last ${Math.round(r.pct * 100)} %` : ''}${r.adapter ? ' · kräver strömadapter' : ''}</span></div>
            <button class="small primary" data-act="set-model" data-id="${n.id}" data-model="${r.m.id}">Byt</button></div>`).join('');
        } else {
          h += `<p class="muted small">Ingen enskild switch i katalogen räcker – dela upp på flera switchar.</p>`;
        }
      }
      h += `<h4>Förslag: dela upp</h4>
        <div class="suggest"><div><b>Lägg till en switch</b><br><span class="muted small">Flytta klientenheter till en ny switch som kopplas hit.</span></div>
        <button class="small" data-act="offload" data-id="${n.id}">Gör det</button></div>`;
    }

    h += `<details style="margin-top:10px"><summary class="small">Porttabell</summary><table class="ports"><tr><th>Port</th><th>Typ</th><th>Ansluten</th><th>PoE</th></tr>
      ${s.ports.map((p, i) => {
        const nd = pi.slot[i];
        const peer = nd ? A.nodes.get(nd.peer) : null;
        return `<tr><td>${i + 1}${p.role === 'wan' ? ' WAN' : ''}</td><td>${p.t === 'sfp' ? 'SFP' : 'RJ45'} ${p.sp}${p.poe ? ' ' + POE_SHORT[p.poe] : ''}</td>
          <td>${peer ? esc(peer.name) : '<span class="muted">–</span>'}</td><td>${nd && nd.poe ? fmtW(nd.watts) : ''}</td></tr>`;
      }).join('')}</table></details>`;
  } else {
    const myIssues = A.nodeIssues.get(n.id) || [];
    if (myIssues.length) h += `<h4>Problem</h4>${issuesList(myIssues, false)}`;
  }

  h += `<div class="btn-row"><button data-act="dup">Duplicera</button><button data-act="delete" class="danger">Ta bort</button></div>`;
  return h;
}

function inspMulti() {
  const nw = net();
  const sel = nw.nodes.filter(n => selNodes.has(n.id));
  const byType = {};
  sel.forEach(n => byType[n.type] = (byType[n.type] || 0) + 1);
  const opts = connectTargetsOptions(selNodes);
  let poe = 0;
  sel.forEach(n => { const s = A.specs.get(n.id); if (s.needsPoe) poe += A.draw(n.id); });
  return `<h3>${sel.length} markerade enheter</h3>
    <p class="muted small">${Object.entries(byType).map(([k, v]) => `${TYPES[k].icon} ${v} ${esc(TYPES[k].label.toLowerCase())}`).join(' · ')}</p>
    ${poe ? `<p class="small">Sammanlagt PoE-behov: <b>${fmtW(poe)}</b></p>` : ''}
    <h4>Samma switch</h4>
    ${opts ? `<div class="row"><select id="connTarget">${opts}</select><button data-act="connect-sel" class="primary">Anslut alla</button></div>
    <p class="muted small">Klientenheter flyttas från sin nuvarande switch.</p>` : ''}
    <div class="btn-row"><button data-act="new-switch">🔀 Skapa ny switch för markerade</button></div>
    <p class="muted small">Väljer automatiskt en switch som räcker för portar och PoE.</p>
    <h4>Anslutningssätt</h4>
    <div class="btn-row"><button data-act="set-conn" data-v="wired">Alla via kabel</button><button data-act="set-conn" data-v="wifi">Alla via WiFi</button></div>
    <div class="btn-row" style="margin-top:16px"><button data-act="dup">Duplicera</button><button data-act="delete" class="danger">Ta bort</button></div>`;
}

function inspLink() {
  const nw = net();
  const l = nw.links.find(x => x.id === selLink);
  if (!l) return '';
  const a = nodeById(l.a), b = nodeById(l.b);
  const pa = A.portInfo.get(a.id), pb = A.portInfo.get(b.id);
  const linkIssues = A.issues.filter(i => i.link === l.id);
  const powered = A.poweredLinks.has(l.id);
  return `<h3>🔗 Anslutning</h3>
    <p><b data-act="select" data-id="${a.id}" style="cursor:pointer">${TYPES[a.type].icon} ${esc(a.name)}</b>${pa.byLink.has(l.id) ? ` <span class="port-tag">P${pa.byLink.get(l.id) + 1}</span>` : ''}
    ↔ <b data-act="select" data-id="${b.id}" style="cursor:pointer">${TYPES[b.type].icon} ${esc(b.name)}</b>${pb.byLink.has(l.id) ? ` <span class="port-tag">P${pb.byLink.get(l.id) + 1}</span>` : ''}</p>
    ${field('Medium', `<select data-f="medium" data-id="${l.id}">
      <option value="copper" ${l.medium === 'copper' ? 'selected' : ''}>Kabel (RJ45)</option>
      <option value="fiber" ${l.medium === 'fiber' ? 'selected' : ''}>Fiber (SFP)</option>
      <option value="wifi" ${l.medium === 'wifi' ? 'selected' : ''}>WiFi / trådlös</option></select>`)}
    ${field('Notering', `<input data-f="link.notes" data-id="${l.id}" value="${esc(l.notes || '')}" placeholder="t.ex. kabellängd">`)}
    ${powered ? `<div class="note">⚡ Länken bär PoE.</div>` : ''}
    ${linkIssues.length ? issuesList(linkIssues, false) : ''}
    <div class="btn-row"><button data-act="delete" class="danger">Ta bort anslutning</button></div>`;
}

/* ---------------- Händelser i inspektören ---------------- */
let editSnap = false;
function applyField(el) {
  const f = el.dataset.f;
  const id = el.dataset.id;
  const val = el.type === 'checkbox' ? el.checked : el.value;
  const nw = net();
  if (!editSnap) { snapshot(); editSnap = true; }
  if (f.startsWith('net.')) {
    nw[f.slice(4)] = val;
    return;
  }
  if (f === 'medium' || f === 'link.notes') {
    const l = nw.links.find(x => x.id === id);
    if (!l) return;
    if (f === 'medium') l.medium = val; else l.notes = val;
    return;
  }
  const n = nodeById(id);
  if (!n) return;
  switch (f) {
    case 'name': case 'ip': case 'vlan': case 'notes':
      n[f] = val; break;
    case 'type':
      n.type = val;
      n.model = DEFAULT_MODEL[val] || '';
      delete n.poe; delete n.watts; delete n.custom; delete n.power; delete n.conn;
      break;
    case 'model':
      if (val === 'custom' && !n.custom) {
        const s = spec(n);
        const rj = s.ports.filter(p => p.t === 'rj45' && p.role !== 'wan');
        n.custom = {
          ports: rj.length, poePorts: rj.filter(p => p.poe).length, poeClass: 'at', budget: s.budget,
          sfp: s.ports.filter(p => p.t === 'sfp').length, wan: s.ports.filter(p => p.role === 'wan').length, wifi: s.wifi, cellular: s.cellular,
        };
      }
      n.model = val;
      delete n.power; delete n.watts;
      break;
    case 'conn': {
      n.conn = val;
      for (const l of nw.links) {
        if (l.a !== n.id && l.b !== n.id) continue;
        const o = nodeById(l.a === n.id ? l.b : l.a);
        if (val === 'wifi' && l.medium === 'copper' && spec(o).wifi) l.medium = 'wifi';
        if (val === 'wired' && l.medium === 'wifi' && !isInfraType(o.type) && o.type !== 'ap') l.medium = 'copper';
        else if (val === 'wired' && l.medium === 'wifi') l.medium = 'copper';
      }
      break;
    }
    case 'poe': n.poe = val || ''; if (!val) delete n.power; break;
    case 'watts': if (val === '') delete n.watts; else n.watts = Math.max(0, +val); break;
    case 'power': n.power = val; break;
    default:
      if (f.startsWith('custom.')) {
        n.custom = n.custom || {};
        const k = f.slice(7);
        n.custom[k] = (k === 'poeClass') ? val : (typeof val === 'boolean' ? val : Math.max(0, +val || 0));
      }
  }
}

function initInspectorEvents() {
  const el = $('#inspector');
  el.addEventListener('focusin', () => { editSnap = false; });
  el.addEventListener('input', e => {
    const t = e.target;
    if (!t.dataset.f || t.tagName === 'SELECT' || t.type === 'checkbox') return;
    applyField(t);
    scheduleSave();
    renderCanvas();
    renderTabs();
  });
  el.addEventListener('change', e => {
    const t = e.target;
    if (!t.dataset.f) return;
    if (t.tagName === 'SELECT' || t.type === 'checkbox') applyField(t);
    editSnap = false;
    scheduleSave();
    const textual = t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type === 'text') || (t.tagName === 'INPUT' && !t.type);
    if (textual) { renderCanvas(); renderTabs(); return; }
    setTimeout(render, 0);
  });
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const id = b.dataset.id;
    switch (b.dataset.act) {
      case 'select': selNodes = new Set([id]); selLink = null; centerOn(id); render(); break;
      case 'unlink': snapshot(); removeLink(id); changed(); break;
      case 'delete': deleteSelection(); break;
      case 'dup': duplicateSelection(); break;
      case 'connect-one': {
        const tgt = $('#connTarget').value;
        snapshot();
        if (connect(id, tgt)) changed(); else { history.pop(); toast('Enheterna är redan ihopkopplade.'); }
        break;
      }
      case 'connect-sel': connectSelectedTo($('#connTarget').value); break;
      case 'new-switch': newSwitchForSelection(); break;
      case 'set-model': changeModel(id, b.dataset.model); break;
      case 'offload': offloadToNewSwitch(id); break;
      case 'set-conn': {
        snapshot();
        for (const sid of selNodes) {
          const n = nodeById(sid);
          if (!TYPES[n.type].canWifi) continue;
          applyField({ dataset: { f: 'conn', id: sid }, value: b.dataset.v, type: 'select' });
        }
        changed();
        break;
      }
      case 'dup-net': {
        snapshot();
        const copy = JSON.parse(JSON.stringify(net()));
        copy.id = uid();
        copy.name = net().name + ' (kopia)';
        project.networks.splice(project.active + 1, 0, copy);
        project.active++;
        selNodes.clear(); selLink = null;
        changed();
        break;
      }
      case 'del-net': {
        if (project.networks.length < 2) return;
        if (!confirm(`Ta bort nätverket "${net().name}" med alla enheter?`)) return;
        snapshot();
        project.networks.splice(project.active, 1);
        project.active = Math.max(0, project.active - 1);
        selNodes.clear(); selLink = null;
        changed();
        break;
      }
    }
  });
}

function centerOn(id) {
  const n = nodeById(id);
  if (!n) return;
  const svg = $('#canvas'), v = net().view;
  const sx = n.x * v.k + v.x, sy = n.y * v.k + v.y;
  if (sx < 40 || sy < 40 || sx > svg.clientWidth - 40 || sy > svg.clientHeight - 40) {
    v.x = svg.clientWidth / 2 - n.x * v.k;
    v.y = svg.clientHeight / 2 - n.y * v.k;
  }
}

/* ---------------- Interaktion på ritytan ---------------- */
let drag = null;

function initCanvasEvents() {
  const svg = $('#canvas');

  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.button !== 1) return;
    const handle = e.target.closest('[data-handle]');
    const nodeEl = e.target.closest('[data-node]');
    const linkEl = e.target.closest('[data-link]');
    const w = toWorld(e);
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1) {
      drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: net().view.x, vy: net().view.y };
      svg.classList.add('panning');
      return;
    }
    if (handle) {
      drag = { mode: 'link', from: handle.dataset.handle, start: w };
      return;
    }
    if (nodeEl) {
      const id = nodeEl.dataset.node;
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        if (selNodes.has(id)) selNodes.delete(id); else selNodes.add(id);
        selLink = null;
        render();
        drag = null;
        return;
      }
      if (!selNodes.has(id)) { selNodes = new Set([id]); selLink = null; render(); }
      const nw = net();
      drag = {
        mode: 'move', start: w, moved: false,
        orig: nw.nodes.filter(n => selNodes.has(n.id)).map(n => ({ n, x: n.x, y: n.y })),
      };
      return;
    }
    if (linkEl) {
      selLink = linkEl.dataset.link;
      selNodes.clear();
      render();
      drag = null;
      return;
    }
    if (e.shiftKey) {
      drag = { mode: 'marquee', start: w, sx: e.clientX, sy: e.clientY, add: new Set(selNodes) };
      return;
    }
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: net().view.x, vy: net().view.y, moved: false };
    svg.classList.add('panning');
  });

  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    const w = toWorld(e);
    if (drag.mode === 'pan') {
      const v = net().view;
      v.x = drag.vx + e.clientX - drag.sx;
      v.y = drag.vy + e.clientY - drag.sy;
      if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 3) drag.moved = true;
      $('#viewport').setAttribute('transform', `translate(${v.x},${v.y}) scale(${v.k})`);
      $('#grid').setAttribute('patternTransform', `translate(${v.x},${v.y}) scale(${v.k})`);
    } else if (drag.mode === 'move') {
      const dx = w.x - drag.start.x, dy = w.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      if (!drag.moved) { snapshot(); drag.moved = true; }
      const snap = !e.altKey;
      for (const o of drag.orig) {
        o.n.x = snap ? Math.round((o.x + dx) / 10) * 10 : o.x + dx;
        o.n.y = snap ? Math.round((o.y + dy) / 10) * 10 : o.y + dy;
      }
      renderCanvas();
    } else if (drag.mode === 'link') {
      const from = nodeById(drag.from);
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-node]');
      $$('.drop-target').forEach(x => x.classList.remove('drop-target'));
      if (target && target.dataset.node !== drag.from) target.classList.add('drop-target');
      const b = nodeBox(from, spec(from));
      $('#overlayLayer').innerHTML = `<line x1="${from.x}" y1="${from.y + b.h / 2}" x2="${w.x}" y2="${w.y}" style="stroke:var(--accent);stroke-width:2;pointer-events:none" stroke-dasharray="5 4"/>`;
    } else if (drag.mode === 'marquee') {
      const r = $('#canvas').getBoundingClientRect();
      const x = Math.min(e.clientX, drag.sx) - r.left, y = Math.min(e.clientY, drag.sy) - r.top;
      const m = $('#marquee');
      m.setAttribute('x', x); m.setAttribute('y', y);
      m.setAttribute('width', Math.abs(e.clientX - drag.sx)); m.setAttribute('height', Math.abs(e.clientY - drag.sy));
      m.setAttribute('visibility', 'visible');
      const x1 = Math.min(w.x, drag.start.x), x2 = Math.max(w.x, drag.start.x);
      const y1 = Math.min(w.y, drag.start.y), y2 = Math.max(w.y, drag.start.y);
      selNodes = new Set(drag.add);
      net().nodes.forEach(n => { if (n.x >= x1 && n.x <= x2 && n.y >= y1 && n.y <= y2) selNodes.add(n.id); });
      selLink = null;
      renderCanvas();
    }
  });

  const end = e => {
    if (!drag) return;
    const d = drag;
    drag = null;
    svg.classList.remove('panning');
    if (d.mode === 'pan') {
      scheduleSave();
      if (!d.moved && (selNodes.size || selLink)) { selNodes.clear(); selLink = null; render(); }
    } else if (d.mode === 'move') {
      if (d.moved) changed();
    } else if (d.mode === 'link') {
      $('#overlayLayer').innerHTML = '';
      $$('.drop-target').forEach(x => x.classList.remove('drop-target'));
      const target = e && document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-node]');
      if (target && target.dataset.node !== d.from) {
        snapshot();
        const l = connect(d.from, target.dataset.node);
        if (l) { selLink = null; changed(); } else { history.pop(); toast('Enheterna är redan ihopkopplade.'); }
      }
    } else if (d.mode === 'marquee') {
      $('#marquee').setAttribute('visibility', 'hidden');
      render();
    }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', () => end(null));

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    zoomBy(f, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  svg.addEventListener('dblclick', e => {
    const nodeEl = e.target.closest('[data-node]');
    if (nodeEl) {
      const inp = $('#inspector [data-f="name"]');
      if (inp) { inp.focus(); inp.select(); }
    }
  });

  /* Dra från paletten */
  const wrap = $('#canvasWrap');
  wrap.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  wrap.addEventListener('drop', e => {
    e.preventDefault();
    const key = e.dataTransfer.getData('text/plain');
    const item = paletteItem(key);
    if (!item) return;
    addFromPalette(item, toWorld(e));
  });
}

/* ---------------- Palett ---------------- */
function paletteItem(key) {
  const m = /^pal:(\d+):(\d+)$/.exec(key || '');
  return m ? PALETTE[+m[1]]?.items[+m[2]] : null;
}
function renderPalette() {
  $('#paletteItems').innerHTML = PALETTE.map((g, gi) => `<div class="pal-group"><h4>${esc(g.group)}</h4>
    ${g.items.map((it, ii) => `<button class="pal-item" draggable="true" data-pal="pal:${gi}:${ii}" title="${esc(CATALOG_BY_ID[it.model]?.name || TYPES[it.type].label)}">
      <span class="ic">${TYPES[it.type].icon}</span>${esc(it.label)}</button>`).join('')}</div>`).join('');
  const box = $('#paletteItems');
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-pal]');
    if (b) addFromPalette(paletteItem(b.dataset.pal));
  });
  box.addEventListener('dragstart', e => {
    const b = e.target.closest('[data-pal]');
    if (b) { e.dataTransfer.setData('text/plain', b.dataset.pal); e.dataTransfer.effectAllowed = 'copy'; }
  });
}

/* ---------------- Rapport / materiallista ---------------- */
function bomFor(nw) {
  const rows = new Map();
  for (const n of nw.nodes) {
    const m = CATALOG_BY_ID[n.model];
    const name = n.model === 'custom' ? `${TYPES[n.type].label} (anpassad)` : m ? m.name : `${TYPES[n.type].label} (generisk)`;
    const key = n.type + '|' + name;
    const r = rows.get(key) || { type: n.type, name, vendor: m?.vendor || '', count: 0 };
    r.count++;
    rows.set(key, r);
  }
  const order = Object.keys(TYPES);
  const list = [...rows.values()].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.name.localeCompare(b.name, 'sv'));
  const copper = nw.links.filter(l => l.medium === 'copper').length;
  const fiber = nw.links.filter(l => l.medium === 'fiber').length;
  if (copper) list.push({ type: 'cable', name: 'Nätverkskabel (RJ45)', vendor: '', count: copper });
  if (fiber) list.push({ type: 'cable', name: 'Fiberkabel + SFP-moduler (par)', vendor: '', count: fiber });
  return list;
}

function renderReport() {
  const total = new Map();
  let html = `<p class="muted small">Projekt: <b>${esc(project.name)}</b> · ${new Date().toLocaleDateString('sv-SE')} · Specifikationer är ungefärliga – verifiera mot datablad.</p>`;
  for (const nw of project.networks) {
    const an = analyze(nw);
    const bom = bomFor(nw);
    bom.forEach(r => {
      const k = r.type + '|' + r.name;
      const t = total.get(k) || { ...r, count: 0 };
      t.count += r.count;
      total.set(k, t);
    });
    html += `<h3><span style="color:${esc(nw.color)}">●</span> ${esc(nw.name)}</h3>`;
    if (nw.notes) html += `<p class="muted small">${esc(nw.notes)}</p>`;
    html += `<h4>Materiallista</h4><table class="rep"><tr><th>Typ</th><th>Modell</th><th class="num">Antal</th></tr>
      ${bom.map(r => `<tr><td>${r.type === 'cable' ? '🔌 Kabel' : TYPES[r.type].icon + ' ' + esc(TYPES[r.type].label)}</td><td>${esc(r.name)}</td><td class="num">${r.count}</td></tr>`).join('')}</table>`;
    const infra = nw.nodes.filter(n => isInfraType(n.type));
    if (infra.length) {
      html += `<h4>Switchar och routrar</h4><table class="rep"><tr><th>Enhet</th><th>Modell</th><th class="num">Portar</th><th class="num">PoE-portar</th><th class="num">PoE-last</th></tr>
        ${infra.map(n => {
          const s = an.specs.get(n.id), pi = an.portInfo.get(n.id);
          const poeUsed = pi.needs.filter(nd => nd.poe).length;
          const bad = (an.nodeIssues.get(n.id) || []).some(i => i.sev === 'error');
          return `<tr><td>${bad ? '⛔ ' : ''}${esc(n.name)}</td><td>${esc(s.name)}</td><td class="num">${pi.needs.length}/${s.ports.length}</td>
            <td class="num">${poeUsed}/${s.ports.filter(p => p.poe).length}</td><td class="num">${fmtW(pi.load)}${s.budget ? ' / ' + s.budget + ' W' : ''}</td></tr>`;
        }).join('')}</table>`;
    }
    html += `<h4>Problem</h4>${issuesList(an.issues, false)}`;
  }
  if (project.networks.length > 1) {
    html += `<h3>Totalt för projektet</h3><table class="rep"><tr><th>Typ</th><th>Modell</th><th class="num">Antal</th></tr>
      ${[...total.values()].map(r => `<tr><td>${r.type === 'cable' ? '🔌 Kabel' : TYPES[r.type].icon + ' ' + esc(TYPES[r.type].label)}</td><td>${esc(r.name)}</td><td class="num">${r.count}</td></tr>`).join('')}</table>`;
  }
  $('#reportBody').innerHTML = html;
}

function bomCsv() {
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [['Nätverk', 'Typ', 'Modell', 'Tillverkare', 'Antal'].map(q).join(';')];
  for (const nw of project.networks) {
    for (const r of bomFor(nw)) {
      lines.push([nw.name, r.type === 'cable' ? 'Kabel' : TYPES[r.type].label, r.name, r.vendor, r.count].map(q).join(';'));
    }
  }
  lines.push('');
  lines.push(['Nätverk', 'Enhet', 'Typ', 'Modell', 'IP', 'VLAN', 'Ansluten till', 'Port', 'PoE (W)', 'Notering'].map(q).join(';'));
  for (const nw of project.networks) {
    const an = analyze(nw);
    for (const n of nw.nodes) {
      const pl = an.parentLink.get(n.id);
      const p = an.parent.get(n.id);
      const ppi = p ? an.portInfo.get(p) : null;
      const port = ppi && ppi.byLink.has(pl) ? ppi.byLink.get(pl) + 1 : '';
      const s = an.specs.get(n.id);
      lines.push([nw.name, n.name, TYPES[n.type].label, s.name, n.ip || '', n.vlan || '', p ? an.nodes.get(p).name : '', port,
        s.needsPoe ? String(Math.round(an.draw(n.id) * 10) / 10).replace('.', ',') : '', n.notes || ''].map(q).join(';'));
    }
  }
  return '﻿' + lines.join('\r\n');
}

/* ---------------- Export / import ---------------- */
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const fileBase = () => (project.name || 'natverk').replace(/[^\wåäöÅÄÖ\- ]+/g, '').trim().replace(/\s+/g, '_') || 'natverk';

function exportJson() {
  const data = { ...project, app: 'NetPlanner', version: 1, exported: new Date().toISOString() };
  download(fileBase() + '.json', JSON.stringify(data, null, 2), 'application/json');
}

function normalizeProject(p) {
  if (!p || !Array.isArray(p.networks)) throw new Error('Filen innehåller inget giltigt projekt.');
  p.name = String(p.name || 'Importerat projekt');
  p.networks = p.networks.map((nw, i) => {
    const nodes = (nw.nodes || []).filter(n => n && TYPES[n.type]).map(n => ({
      ...n, id: String(n.id || uid()), name: String(n.name || TYPES[n.type].label), x: +n.x || 0, y: +n.y || 0, model: n.model ?? '',
    }));
    const ids = new Set(nodes.map(n => n.id));
    const links = (nw.links || []).filter(l => l && ids.has(l.a) && ids.has(l.b)).map(l => ({
      ...l, id: String(l.id || uid()), medium: ['copper', 'fiber', 'wifi'].includes(l.medium) ? l.medium : 'copper',
    }));
    return {
      id: String(nw.id || uid()), name: String(nw.name || `Nätverk ${i + 1}`), color: nw.color || NET_COLORS[i % NET_COLORS.length],
      notes: nw.notes || '', nodes, links, view: nw.view && isFinite(nw.view.k) ? nw.view : { x: 80, y: 60, k: 1 },
    };
  });
  if (!p.networks.length) p.networks = [newNetwork('Nätverk 1')];
  p.active = clamp(+p.active || 0, 0, p.networks.length - 1);
  return { app: 'NetPlanner', version: 1, name: p.name, active: p.active, networks: p.networks };
}

function importFile(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const p = normalizeProject(JSON.parse(r.result));
      snapshot();
      project = p;
      selNodes.clear(); selLink = null;
      changed();
      setTimeout(fitView, 0);
      toast(`Projektet "${p.name}" importerades.`);
    } catch (err) {
      alert('Kunde inte importera: ' + err.message);
    }
  };
  r.readAsText(file);
}

function buildExportSvg() {
  const nw = net();
  if (!nw.nodes.length) { toast('Nätverket är tomt.'); return null; }
  const prevSel = selNodes, prevLink = selLink;
  selNodes = new Set(); selLink = null;
  renderCanvas();
  const vp = $('#viewport');
  const clone = vp.cloneNode(true);
  const src = [vp, ...vp.querySelectorAll('*')];
  const dst = [clone, ...clone.querySelectorAll('*')];
  const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-size', 'font-weight', 'font-family', 'paint-order', 'stroke-linejoin'];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    props.forEach(p => dst[i].style.setProperty(p, cs.getPropertyValue(p)));
  });
  clone.querySelectorAll('.handle, .link-hit, title').forEach(e => e.remove());
  const bb = contentBBox(nw, 30);
  clone.setAttribute('transform', `translate(${-bb.x},${-bb.y})`);
  clone.removeAttribute('id');
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim() || '#ffffff';
  const title = `<text x="12" y="20" style="font: 600 14px system-ui, sans-serif; fill:${getComputedStyle(document.documentElement).getPropertyValue('--muted')}">${esc(project.name)} – ${esc(nw.name)}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(bb.w)}" height="${Math.ceil(bb.h + 20)}" viewBox="0 -20 ${Math.ceil(bb.w)} ${Math.ceil(bb.h + 20)}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">
<rect x="0" y="-20" width="100%" height="100%" fill="${bg}"/><g transform="translate(0,-14)">${title}</g>${new XMLSerializer().serializeToString(clone)}</svg>`;
  selNodes = prevSel; selLink = prevLink;
  renderCanvas();
  return { svg, w: Math.ceil(bb.w), h: Math.ceil(bb.h + 20) };
}

function exportSvg() {
  const r = buildExportSvg();
  if (r) download(`${fileBase()}_${net().name.replace(/\s+/g, '_')}.svg`, r.svg, 'image/svg+xml');
}

function exportPng() {
  const r = buildExportSvg();
  if (!r) return;
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const c = document.createElement('canvas');
    c.width = r.w * scale; c.height = r.h * scale;
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    c.toBlob(b => download(`${fileBase()}_${net().name.replace(/\s+/g, '_')}.png`, b, 'image/png'), 'image/png');
  };
  img.onerror = () => toast('Kunde inte skapa PNG – använd SVG-exporten.');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg);
}

/* ---------------- Exempelprojekt ---------------- */
function exampleProject() {
  const p = { app: 'NetPlanner', version: 1, name: 'Exempelprojekt', active: 0, networks: [] };
  const mk = (name, idx) => { const nw = newNetwork(name, idx); p.networks.push(nw); return nw; };
  const add = (nw, type, model, name, x, y, extra = {}) => { const n = { id: uid(), type, model, name, x, y, ...extra }; nw.nodes.push(n); return n; };
  const ln = (nw, a, b, medium = 'copper') => nw.links.push({ id: uid(), a: a.id, b: b.id, medium });

  /* Nätverk 1: kontor med Starlink + 5G som backup */
  const a = mk('Kontor', 0);
  const sl = add(a, 'isp', 'starlink-gen3', 'Starlink', -200, 0);
  const g5 = add(a, 'router', 'rutx50', '5G-backup', 200, 0);
  const gw = add(a, 'router', 'ucg-max', 'Gateway', 0, 150);
  const sw = add(a, 'switch', 'usw-24-poe', 'Switch kontor', 0, 310);
  ln(a, sl, gw); ln(a, g5, gw); ln(a, gw, sw);
  const ap1 = add(a, 'ap', 'u6-plus', 'AP Kontor', -440, 470);
  const ap2 = add(a, 'ap', 'u7-pro', 'AP Lager', -260, 470);
  ln(a, sw, ap1); ln(a, sw, ap2);
  for (let i = 0; i < 4; i++) ln(a, sw, add(a, 'camera', 'g5-bullet', `Kamera ${i + 1}`, -80 + i * 175, 470));
  ln(a, sw, add(a, 'camera', 'cam-ptz', 'PTZ Gård', 620, 470));
  ln(a, sw, add(a, 'nvr', 'unvr', 'NVR', 620, 160));
  ln(a, sw, add(a, 'workstation', '', 'Arbetsstation 1', -440, 560));
  ln(a, sw, add(a, 'workstation', '', 'Arbetsstation 2', -260, 560));
  ln(a, sw, add(a, 'printer', '', 'Skrivare 1', -80, 560));
  ln(a, sw, add(a, 'tv', '', 'TV Möte', 95, 560));
  ln(a, ap1, add(a, 'laptop', '', 'Laptop 1', -440, 680, { conn: 'wifi' }), 'wifi');
  ln(a, ap1, add(a, 'mobile', '', 'Mobil 1', -260, 680, { conn: 'wifi' }), 'wifi');
  ln(a, ap2, add(a, 'laptop', '', 'Laptop 2', -80, 680, { conn: 'wifi' }), 'wifi');

  /* Nätverk 2: separat kameranät på arbetsplats, för litet med flit */
  const b = mk('Byggarbetsplats', 1);
  const r5 = add(b, 'router', 'rutx50', '5G-router', 0, 0);
  const s2 = add(b, 'switch', 'usw-lite-8-poe', 'Switch bod', 0, 160);
  ln(b, r5, s2);
  const ap = add(b, 'ap', 'u6-mesh', 'AP bod', -360, 320);
  ln(b, s2, ap);
  for (let i = 0; i < 5; i++) ln(b, s2, add(b, 'camera', i < 3 ? 'g5-bullet' : 'cam-ptz', i < 3 ? `Kamera ${i + 1}` : `PTZ ${i - 2}`, -180 + i * 175, 320));
  ln(b, ap, add(b, 'mobile', '', 'Surfplatta', -360, 440, { conn: 'wifi' }), 'wifi');
  b.notes = 'Medvetet underdimensionerad – markera switchen för att se förslag.';
  return p;
}

/* ---------------- Övrigt UI ---------------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

function initTopbar() {
  $('#projectName').addEventListener('focus', () => { editSnap = false; });
  $('#projectName').addEventListener('input', e => {
    if (!editSnap) { snapshot(); editSnap = true; }
    project.name = e.target.value;
    scheduleSave();
  });
  $('#tabs').addEventListener('click', e => {
    if (e.target.closest('#addNet')) {
      snapshot();
      project.networks.push(newNetwork(`Nätverk ${project.networks.length + 1}`, project.networks.length));
      project.active = project.networks.length - 1;
      selNodes.clear(); selLink = null;
      changed();
      return;
    }
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      project.active = +tab.dataset.tab;
      selNodes.clear(); selLink = null;
      scheduleSave();
      render();
    }
  });
  $('#btnUndo').onclick = undo;
  $('#btnRedo').onclick = redo;
  $('#btnLayout').onclick = layoutTree;
  $('#btnReport').onclick = () => { renderReport(); $('#reportDlg').showModal(); };
  $('#reportClose').onclick = () => $('#reportDlg').close();
  $('#reportPrint').onclick = () => window.print();
  $('#reportCsv').onclick = () => download(fileBase() + '_materiallista.csv', bomCsv(), 'text/csv');
  $('#zoomIn').onclick = () => zoomBy(1.25);
  $('#zoomOut').onclick = () => zoomBy(0.8);
  $('#zoomFit').onclick = fitView;
  $('#fileInput').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) importFile(f);
    e.target.value = '';
  });
  $('.menu-body').addEventListener('click', e => {
    const b = e.target.closest('[data-menu]');
    if (!b) return;
    $('.menu').open = false;
    switch (b.dataset.menu) {
      case 'new':
        if (!confirm('Starta ett nytt tomt projekt? (Det nuvarande kan ångras med Ctrl+Z eller exporteras först.)')) return;
        snapshot(); project = newProject(); selNodes.clear(); selLink = null; changed(); break;
      case 'example':
        snapshot(); project = exampleProject(); selNodes.clear(); selLink = null; changed(); setTimeout(fitView, 0); break;
      case 'import': $('#fileInput').click(); break;
      case 'export-json': exportJson(); break;
      case 'export-svg': exportSvg(); break;
      case 'export-png': exportPng(); break;
      case 'export-csv': download(fileBase() + '_materiallista.csv', bomCsv(), 'text/csv'); break;
    }
  });
  document.addEventListener('click', e => {
    const m = $('.menu');
    if (m.open && !m.contains(e.target)) m.open = false;
  });

  document.addEventListener('keydown', e => {
    const tag = e.target.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); exportJson(); return; }
    if (typing || $('#reportDlg').open) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); }
    else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selNodes = new Set(net().nodes.map(n => n.id)); selLink = null; render(); }
    else if (e.key === 'Escape') { selNodes.clear(); selLink = null; render(); }
  });
  window.addEventListener('resize', () => renderCanvas());
}

/* ---------------- Start ---------------- */
function load() {
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ej tillgängligt */ }
  if (saved) {
    try { project = normalizeProject(JSON.parse(saved)); return false; } catch (e) { /* trasig data */ }
  }
  project = exampleProject();
  return true;
}

const first = load();
renderPalette();
initTopbar();
initCanvasEvents();
initInspectorEvents();
render();
if (first) setTimeout(fitView, 0);
