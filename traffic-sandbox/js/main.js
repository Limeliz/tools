'use strict';
/* Traffic Sandbox – UI wiring. */

const world = new World();
const canvas = document.getElementById('canvas');
const renderer = new Renderer(canvas, world);
const $ = (id) => document.getElementById(id);

let running = true;
let simSpeed = 1;
let tool = 'select';

const TOOL_HELP = {
  select: 'Click a car to follow its details. Drag to pan, scroll to zoom.',
  remove: 'Click a car to remove it.',
  addDef: 'Click on a road to place a defensive driver.',
  addAgg: 'Click on a road to place an aggressive driver.',
  plain: 'Click a crossing to make it a plain junction (give way to the right).',
  lights: 'Click a crossing to add traffic lights (needs 3+ roads).',
  roundabout: 'Click a crossing to turn it into a roundabout.',
  road: 'Click a road segment to remove it, or a dashed line to build it.',
  limit30: 'Click a road segment to set its speed limit to 30 km/h.',
  limit50: 'Click a road segment to set its speed limit to 50 km/h.',
};

world.onCarRestored = (id, car) => {
  if (renderer.selected && renderer.selected.id === id) renderer.selected = car;
};

// ---------- initial traffic ----------
world.addRandomCars('defensive', 14);
world.addRandomCars('aggressive', 8);

// ---------- toolbar ----------
function setTool(t) {
  tool = t;
  renderer.tool = t;
  for (const b of document.querySelectorAll('#tools button')) b.classList.toggle('active', b.dataset.tool === t);
  $('toolHelp').textContent = TOOL_HELP[t];
  canvas.style.cursor = t === 'select' ? 'grab' : 'crosshair';
}
for (const b of document.querySelectorAll('#tools button')) b.addEventListener('click', () => setTool(b.dataset.tool));
setTool('select');

function setRunning(r) {
  running = r;
  $('btnPlay').textContent = r ? 'Pause' : 'Play';
}
$('btnPlay').addEventListener('click', () => setRunning(!running));
$('simSpeed').addEventListener('change', (e) => (simSpeed = parseFloat(e.target.value)));
$('btnResetView').addEventListener('click', () => renderer.resetView());
$('btnResetLayout').addEventListener('click', () => {
  world.resetLayout();
  world.addRandomCars('defensive', 14);
  world.addRandomCars('aggressive', 8);
  renderer.selected = null;
  renderer.resetView();
});

$('addDef5').addEventListener('click', () => addMany('defensive'));
$('addAgg5').addEventListener('click', () => addMany('aggressive'));
function addMany(type) {
  const n = world.addRandomCars(type, 5);
  if (n < 5) toast(n ? `Only room for ${n} more` : 'No free space on the roads');
}
function removeOne(type) {
  const list = world.cars.filter((c) => c.type === type);
  if (!list.length) return;
  const c = list[list.length - 1];
  if (renderer.selected === c) renderer.selected = null;
  world.removeCar(c);
}
$('removeDef').addEventListener('click', () => removeOne('defensive'));
$('removeAgg').addEventListener('click', () => removeOne('aggressive'));
$('removeAll').addEventListener('click', () => {
  for (const c of [...world.cars]) world.removeCar(c);
  renderer.selected = null;
});

$('ciToggle').addEventListener('click', () => {
  const c = renderer.selected;
  if (c) world.setCarType(c, c.type === 'defensive' ? 'aggressive' : 'defensive');
});
$('ciRemove').addEventListener('click', () => {
  if (renderer.selected) world.removeCar(renderer.selected);
  renderer.selected = null;
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !['INPUT', 'SELECT', 'BUTTON'].includes(e.target.tagName)) {
    e.preventDefault();
    setRunning(!running);
  }
});

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

// ---------- map interaction ----------
function eventWorld(e) {
  const r = canvas.getBoundingClientRect();
  return renderer.toWorld(e.clientX - r.left, e.clientY - r.top);
}

function findTarget(p) {
  switch (tool) {
    case 'select':
    case 'remove': {
      const car = world.nearestCar(p, 5);
      return car ? { kind: 'car', car } : null;
    }
    case 'addDef':
    case 'addAgg': {
      const r = world.nearestRoadLane(p, 4);
      return r ? { kind: 'lane', lane: r.lane, pos: r.pos } : null;
    }
    case 'plain':
    case 'lights':
    case 'roundabout': {
      const node = world.nearestNode(p, 24);
      return node && node.arms.length ? { kind: 'node', node } : null;
    }
    case 'road': {
      const edge = world.nearestEdge(p, true, 10);
      return edge ? { kind: 'edge', edge, color: edge.enabled ? 'rgba(255,59,48,0.45)' : 'rgba(255,212,0,0.45)' } : null;
    }
    case 'limit30':
    case 'limit50': {
      const edge = world.nearestEdge(p, false, 10);
      return edge ? { kind: 'edge', edge } : null;
    }
  }
  return null;
}

function applyTool(p) {
  const t = findTarget(p);
  switch (tool) {
    case 'select':
      renderer.selected = t ? t.car : null;
      break;
    case 'remove':
      if (t) { if (renderer.selected === t.car) renderer.selected = null; world.removeCar(t.car); }
      break;
    case 'addDef':
    case 'addAgg':
      if (!t) return toast('Click closer to a road');
      if (!world.addCar(tool === 'addDef' ? 'defensive' : 'aggressive', t.lane, t.pos)) toast('No room here');
      break;
    case 'plain':
    case 'lights':
    case 'roundabout':
      if (!t) return toast('Click on a crossing');
      if (tool === 'lights' && t.node.arms.length < 3) toast('Traffic lights need at least three roads – set anyway');
      world.setNodeType(t.node, tool);
      break;
    case 'road':
      if (!t) return toast('Click on a road segment');
      world.toggleEdge(t.edge);
      break;
    case 'limit30':
    case 'limit50':
      if (!t) return toast('Click on a road segment');
      world.setEdgeLimit(t.edge, tool === 'limit30' ? 30 : 50);
      break;
  }
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, moved: false, pan: e.button !== 0 || tool === 'select' };
  if (drag.pan) canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.moved && (drag.pan || e.buttons & 6)) {
      renderer.panX += dx;
      renderer.panY += dy;
      renderer.updateView();
      drag.x = e.clientX;
      drag.y = e.clientY;
      return;
    }
  }
  renderer.hover = findTarget(eventWorld(e));
});
canvas.addEventListener('pointerup', (e) => {
  if (drag && !drag.moved && e.button === 0) applyTool(eventWorld(e));
  drag = null;
  canvas.style.cursor = tool === 'select' ? 'grab' : 'crosshair';
});
canvas.addEventListener('pointerleave', () => (renderer.hover = null));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  renderer.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });
window.addEventListener('resize', () => renderer.resize());

// ---------- panel updates ----------
function fmtPct(x) { return Math.round(x * 100) + '%'; }
function updatePanel() {
  const s = world.summary();
  $('sDefN').textContent = s.defensive.count;
  $('sAggN').textContent = s.aggressive.count;
  $('sDefV').textContent = s.defensive.count ? s.defensive.avgSpeed.toFixed(0) : '–';
  $('sAggV').textContent = s.aggressive.count ? s.aggressive.avgSpeed.toFixed(0) : '–';
  $('sDefS').textContent = fmtPct(s.defensive.speedingShare);
  $('sAggS').textContent = fmtPct(s.aggressive.speedingShare);

  const c = renderer.selected;
  if (c && !c.lane) renderer.selected = null;
  $('carInfo').hidden = !renderer.selected;
  if (renderer.selected) {
    const limit = c.lane.limit;
    $('ciId').textContent = '#' + c.id;
    $('ciType').innerHTML = `<i class="dot ${c.type === 'defensive' ? 'def' : 'agg'}"></i> ${DRIVERS[c.type].label}`;
    $('ciSpeed').textContent = (c.v * 3.6).toFixed(0) + ' km/h' + (c.v * 3.6 > limit + 1 ? ' (over limit)' : '');
    $('ciLimit').textContent = limit + ' km/h' + (c.lane.kind === 'road' ? '' : ' (in junction)');
    $('ciWant').textContent = (c.v0 * 3.6).toFixed(0) + ' km/h';
    $('ciAcc').textContent = (c.acc >= 0 ? '+' : '') + c.acc.toFixed(1) + ' m/s²';
    $('ciState').textContent = c.state;
    $('ciToggle').textContent = c.type === 'defensive' ? 'Make aggressive' : 'Make defensive';
  }
}

// ---------- main loop ----------
const DT = 1 / 30;
let acc = 0, last = performance.now(), panelT = 0;
function frame(now) {
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running) {
    acc += elapsed * simSpeed;
    let steps = 0;
    while (acc >= DT && steps < 400) { world.step(DT); acc -= DT; steps++; }
  }
  renderer.draw();
  panelT += elapsed;
  if (panelT > 0.2) { panelT = 0; updatePanel(); }
  requestAnimationFrame(frame);
}
updatePanel();
requestAnimationFrame(frame);
