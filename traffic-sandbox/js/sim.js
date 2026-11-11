'use strict';
/*
 * Traffic Sandbox – simulation core.
 *
 * World units are metres and seconds. Right-hand traffic.
 * Screen-style coordinates are used throughout (x to the right, y downwards),
 * so a positive angle change is a turn to the right.
 *
 * The user edits a coarse grid network (nodes + road segments). From that the
 * simulation builds a lane graph: road lanes (one per direction per segment)
 * and junction lanes (connectors, roundabout entries/ring arcs/exits).
 * Cars follow a route of lanes and use the Intelligent Driver Model (IDM) for
 * car-following, plus look-ahead speed planning and junction logic.
 */

const TAU = Math.PI * 2;
const LANE_OFFSET = 1.75;      // lane centre distance from road centre line
const RB_RADIUS = 13;          // roundabout ring lane radius
const RB_TRIM = 25;            // where approach roads end at a roundabout
const RB_ANGLE = 0.45;         // angular offset of merge/diverge points from arm axis
const LIGHT_GREEN = 12, LIGHT_YELLOW = 3, LIGHT_ALLRED = 2;

const DRIVERS = {
  defensive: {
    label: 'Defensive',
    excess: 0,          // km/h above the limit
    T: 1.8,             // desired time headway (s)
    s0: 3.0,            // minimum standstill gap (m)
    a: 1.2,             // max acceleration (m/s²)
    b: 1.6,             // comfortable deceleration (m/s²)
    bPlan: 0.9,         // deceleration used when planning for lower limits / curves ahead
    margin: 10,         // reach the new lower speed this many metres before it starts
    freeDecel: 1.6,     // cap on deceleration when slowing to a lower desired speed
    alat: 1.8,          // accepted lateral acceleration in curves
    look: 260,          // planning horizon (m)
    gap: 5.0,           // accepted time gap to priority traffic (s)
    rbGap: 1.6,         // extra margin when entering a roundabout (s)
    yellowDecel: 4.0,   // stops for yellow if the needed deceleration is below this
    evalExtra: 30,      // starts judging a junction this far before the point of no return
  },
  aggressive: {
    label: 'Aggressive',
    excess: 10,
    T: 0.8,
    s0: 1.5,
    a: 2.8,
    b: 3.8,
    bPlan: 3.8,
    margin: -3,
    freeDecel: 4.5,
    alat: 3.6,
    look: 120,
    gap: 2.6,
    rbGap: 0.6,
    yellowDecel: 2.2,
    evalExtra: 8,
  },
};

// ---------- small geometry helpers ----------
const vec = (x, y) => ({ x, y });
const vadd = (a, b) => vec(a.x + b.x, a.y + b.y);
const vsub = (a, b) => vec(a.x - b.x, a.y - b.y);
const vmul = (a, s) => vec(a.x * s, a.y * s);
const vlen = (a) => Math.hypot(a.x, a.y);
const vnorm = (a) => { const l = vlen(a) || 1; return vec(a.x / l, a.y / l); };
const rightOf = (d) => vec(-d.y, d.x);
function normAngle(a) { while (a <= -Math.PI) a += TAU; while (a > Math.PI) a -= TAU; return a; }

function bezier(p0, p1, p2, p3, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    pts.push(vec(a * p0.x + b * p1.x + c * p2.x + d * p3.x, a * p0.y + b * p1.y + c * p2.y + d * p3.y));
  }
  return pts;
}

function arcPoints(c, r, a0, a1) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.12));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push(vec(c.x + r * Math.cos(a), c.y + r * Math.sin(a)));
  }
  return pts;
}

function segmentsIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
}

function polylinesIntersect(a, b) {
  for (let i = 0; i < a.length - 1; i++)
    for (let j = 0; j < b.length - 1; j++)
      if (segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1])) return true;
  return false;
}

function distToSegment(p, a, b) {
  const ab = vsub(b, a), l2 = ab.x * ab.x + ab.y * ab.y;
  let t = l2 ? ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { d: vlen(vsub(p, vadd(a, vmul(ab, t)))), t };
}

function removeFromArray(arr, item) {
  const i = arr.indexOf(item);
  if (i >= 0) arr.splice(i, 1);
}

// ---------- lanes ----------
let laneSeq = 0;
class Lane {
  constructor(points, props) {
    this.id = laneSeq++;
    this.points = points;
    Object.assign(this, props);
    this.cars = [];
    this.cum = [0];
    for (let i = 1; i < points.length; i++) this.cum.push(this.cum[i - 1] + vlen(vsub(points[i], points[i - 1])));
    this.length = Math.max(0.5, this.cum[this.cum.length - 1]);
    // maximum curvature, estimated from heading change over neighbouring segments
    let k = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const h1 = Math.atan2(points[i].y - points[i - 1].y, points[i].x - points[i - 1].x);
      const h2 = Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x);
      const ds = (this.cum[i + 1] - this.cum[i - 1]) / 2;
      if (ds > 1e-6) k = Math.max(k, Math.abs(normAngle(h2 - h1)) / ds);
    }
    this.kappa = Math.min(k, 0.3);
  }

  at(s) {
    const pts = this.points, cum = this.cum;
    s = Math.max(0, Math.min(this.length, s));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const seg = cum[hi] - cum[lo] || 1;
    const t = (s - cum[lo]) / seg;
    const a = pts[lo], b = pts[hi];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  get start() { return this.points[0]; }
  get end() { return this.points[this.points.length - 1]; }
}

function turnType(inAngle, outAngle) {
  // inAngle/outAngle: direction from the node towards the arm.
  const rel = normAngle(outAngle - inAngle);
  if (Math.abs(rel) > 3 * Math.PI / 4) return 'straight';
  if (Math.abs(rel) < Math.PI / 4) return 'uturn';
  return rel < 0 ? 'right' : 'left';
}

// ---------- world ----------
class World {
  constructor() {
    this.cols = 5;
    this.rows = 4;
    this.spacing = 80;
    this.cars = [];
    this.time = 0;
    this.nextCarId = 1;
    this.stats = { defensive: { time: 0, speeding: 0 }, aggressive: { time: 0, speeding: 0 } };
    this.resetLayout();
  }

  // ----- network editing -----
  resetLayout() {
    for (const c of [...this.cars]) this.removeCar(c);
    this.nodes = [];
    this.edges = new Map();
    for (let j = 0; j < this.rows; j++)
      for (let i = 0; i < this.cols; i++)
        this.nodes.push({ id: this.nodes.length, i, j, x: i * this.spacing, y: j * this.spacing, type: 'plain' });
    for (let j = 0; j < this.rows; j++)
      for (let i = 0; i < this.cols; i++) {
        if (i < this.cols - 1) this.addEdge(`h${i},${j}`, this.node(i, j), this.node(i + 1, j));
        if (j < this.rows - 1) this.addEdge(`v${i},${j}`, this.node(i, j), this.node(i, j + 1));
      }
    // A varied default town
    this.node(1, 1).type = 'lights';
    this.node(3, 2).type = 'lights';
    this.node(3, 1).type = 'roundabout';
    this.node(1, 2).type = 'roundabout';
    this.edges.get('v4,1').enabled = false;
    this.edges.get('h0,3').enabled = false;
    for (const id of ['h0,2', 'h1,2', 'h1,3', 'v0,2', 'v1,2', 'v2,2', 'h2,3']) this.edges.get(id).limit = 30;
    this.build();
  }

  addEdge(id, a, b) { this.edges.set(id, { id, a: a.id, b: b.id, enabled: true, limit: 50 }); }
  node(i, j) { return this.nodes[j * this.cols + i]; }

  get bounds() {
    return { x0: 0, y0: 0, x1: (this.cols - 1) * this.spacing, y1: (this.rows - 1) * this.spacing };
  }

  setNodeType(node, type) { node.type = type; this.build(); }
  setEdgeLimit(edge, limit) { edge.limit = limit; this.build(); }
  toggleEdge(edge) { edge.enabled = !edge.enabled; this.build(); }

  // ----- lane graph construction -----
  build() {
    const saved = this.cars.map((c) => this.snapshotCar(c));
    for (const c of this.cars) c.lane = null;
    this.cars = [];
    this.lanes = [];
    this.roadLanes = new Map();

    for (const n of this.nodes) { n.arms = []; n.occupants = new Set(); n.evalCars = new Set(); }
    for (const e of this.edges.values()) {
      if (!e.enabled) continue;
      const a = this.nodes[e.a], b = this.nodes[e.b];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      a.arms.push({ edge: e, other: b, angle: ang });
      b.arms.push({ edge: e, other: a, angle: normAngle(ang + Math.PI) });
    }
    for (const n of this.nodes) {
      n.arms.sort((p, q) => p.angle - q.angle);
      n.arms.forEach((arm, i) => (arm.idx = i));
      const deg = n.arms.length;
      n.kind = deg === 0 ? 'none' : n.type === 'roundabout' ? 'roundabout' : deg === 1 ? 'deadend' : deg === 2 ? 'bend' : n.type;
      n.trim = { none: 0, roundabout: RB_TRIM, deadend: 0, bend: 7, plain: 11, lights: 11 }[n.kind];
    }
    for (const e of this.edges.values()) {
      if (!e.enabled) continue;
      for (const [from, to] of [[this.nodes[e.a], this.nodes[e.b]], [this.nodes[e.b], this.nodes[e.a]]]) {
        const u = vnorm(vsub(to, from)), r = rightOf(u);
        const start = vadd(vadd(from, vmul(u, from.trim)), vmul(r, LANE_OFFSET));
        const end = vadd(vsub(to, vmul(u, to.trim)), vmul(r, LANE_OFFSET));
        const fromArm = from.arms.find((a) => a.edge === e);
        const toArm = to.arms.find((a) => a.edge === e);
        const lane = new Lane([start, end], {
          kind: 'road', edge: e, limit: e.limit, fromNode: from, toNode: to, dir: u,
          fromArm: fromArm.idx, toArm: toArm.idx,
        });
        fromArm.outLane = lane;
        toArm.inLane = lane;
        this.lanes.push(lane);
        this.roadLanes.set(`${e.id}:${from.id}`, lane);
      }
    }
    for (const n of this.nodes) {
      if (n.kind === 'roundabout') this.buildRoundabout(n);
      else this.buildJunction(n);
    }
    // predecessor links, used to see cars that are about to merge into a lane
    for (const l of this.lanes) { l.prevs = []; l.nexts = []; }
    for (const n of this.nodes) {
      if (n.kind === 'none') continue;
      for (const A of n.arms) for (const O of n.arms) {
        const path = n.paths[A.idx][O.idx];
        if (!path) continue;
        const chain = [A.inLane, ...path, O.outLane];
        for (let i = 1; i < chain.length; i++)
          if (!chain[i].prevs.includes(chain[i - 1])) { chain[i].prevs.push(chain[i - 1]); chain[i - 1].nexts.push(chain[i]); }
      }
    }
    for (const s of saved) this.restoreCar(s);
  }

  buildJunction(n) {
    n.paths = n.arms.map(() => []);
    n.connectors = [];
    n.conflicts = new Set();
    if (n.kind === 'none') return;
    const controlled = n.kind === 'plain' || n.kind === 'lights';
    for (const A of n.arms) {
      for (const O of n.arms) {
        if (A === O && n.arms.length > 1) continue;
        const inL = A.inLane, outL = O.outLane;
        const p0 = inL.end, p3 = outL.start;
        const turn = turnType(A.angle, O.angle);
        let pts;
        if (turn === 'straight') pts = [p0, p3];
        else {
          const k = turn === 'uturn' ? 8 : vlen(vsub(p3, p0)) * 0.42;
          pts = bezier(p0, vadd(p0, vmul(inL.dir, k)), vsub(p3, vmul(outL.dir, k)), p3, 14);
        }
        const c = new Lane(pts, {
          kind: 'conn', junction: n, control: controlled ? n : null,
          armIn: A.idx, armOut: O.idx, turn,
          limit: Math.min(inL.limit, outL.limit), inRoad: inL, outRoad: outL,
        });
        n.paths[A.idx][O.idx] = [c];
        n.connectors.push(c);
        this.lanes.push(c);
      }
    }
    for (const a of n.connectors)
      for (const b of n.connectors) {
        if (a === b || a.inRoad === b.inRoad) continue;
        if (a.outRoad === b.outRoad || polylinesIntersect(a.points, b.points)) n.conflicts.add(a.id + ':' + b.id);
      }
    if (n.kind === 'lights') {
      n.phases = [];
      const used = new Set();
      for (const A of n.arms) {
        if (used.has(A.idx)) continue;
        used.add(A.idx);
        const group = [A.idx];
        const opp = n.arms.find((O) => !used.has(O.idx) && Math.abs(normAngle(O.angle - A.angle)) > 3 * Math.PI / 4);
        if (opp) { used.add(opp.idx); group.push(opp.idx); }
        n.phases.push(group);
      }
      if (n.phaseIdx === undefined || n.phaseIdx >= n.phases.length) {
        n.phaseIdx = Math.floor(Math.random() * n.phases.length);
        n.lightState = 'green';
        n.lightT = Math.random() * LIGHT_GREEN;
      }
    }
  }

  buildRoundabout(n) {
    n.paths = n.arms.map(() => []);
    n.connectors = [];
    n.conflicts = new Set();
    n.ringLanes = [];
    const R = RB_RADIUS;
    const tangent = (th) => vec(Math.sin(th), -Math.cos(th)); // travel direction (angle decreasing)
    const onRing = (th) => vec(n.x + R * Math.cos(th), n.y + R * Math.sin(th));
    const limit = Math.min(...n.arms.map((a) => a.edge.limit));

    // special points on the ring, ordered by travel direction (decreasing angle)
    const pts = [];
    for (const A of n.arms) {
      pts.push({ arm: A.idx, type: 'diverge', angle: A.angle + RB_ANGLE });
      pts.push({ arm: A.idx, type: 'merge', angle: A.angle - RB_ANGLE });
    }
    pts.sort((p, q) => q.angle - p.angle);
    const arcFrom = new Map();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      let a1 = q.angle;
      while (a1 >= p.angle) a1 -= TAU;
      const lane = new Lane(arcPoints(n, R, p.angle, a1), { kind: 'ring', junction: n, limit, startP: p, endP: q });
      arcFrom.set(p, lane);
      n.ringLanes.push(lane);
      this.lanes.push(lane);
    }
    const entries = [], exits = [];
    for (const A of n.arms) {
      const M = pts.find((p) => p.arm === A.idx && p.type === 'merge');
      const D = pts.find((p) => p.arm === A.idx && p.type === 'diverge');
      const inL = A.inLane, outL = A.outLane;
      const mPos = onRing(M.angle), dPos = onRing(D.angle);
      const entry = new Lane(
        bezier(inL.end, vadd(inL.end, vmul(inL.dir, 5)), vsub(mPos, vmul(tangent(M.angle), 5)), mPos, 12),
        { kind: 'entry', junction: n, control: n, armIn: A.idx, limit: Math.min(limit, inL.limit), inRoad: inL, mergeArc: arcFrom.get(M) });
      const exit = new Lane(
        bezier(dPos, vadd(dPos, vmul(tangent(D.angle), 5)), vsub(outL.start, vmul(outL.dir, 5)), outL.start, 12),
        { kind: 'exit', junction: n, limit: Math.min(limit, outL.limit), outRoad: outL, divergeP: D });
      entries[A.idx] = { lane: entry, M };
      exits[A.idx] = { lane: exit, D };
      n.connectors.push(entry, exit);
      this.lanes.push(entry, exit);
    }
    for (const A of n.arms) {
      for (const O of n.arms) {
        const path = [entries[A.idx].lane];
        let arc = arcFrom.get(entries[A.idx].M);
        for (let guard = 0; guard < pts.length + 1; guard++) {
          path.push(arc);
          if (arc.endP === exits[O.idx].D) break;
          arc = arcFrom.get(arc.endP);
        }
        path.push(exits[O.idx].lane);
        n.paths[A.idx][O.idx] = path;
      }
    }
  }

  // ----- lights -----
  signal(n, armIdx) {
    if (n.kind !== 'lights') return 'green';
    if (n.lightState === 'allred' || !n.phases[n.phaseIdx].includes(armIdx)) return 'red';
    return n.lightState;
  }

  updateLights(dt) {
    for (const n of this.nodes) {
      if (n.kind !== 'lights') continue;
      n.lightT += dt;
      if (n.lightState === 'green' && n.lightT >= LIGHT_GREEN) { n.lightState = 'yellow'; n.lightT = 0; }
      else if (n.lightState === 'yellow' && n.lightT >= LIGHT_YELLOW) { n.lightState = 'allred'; n.lightT = 0; }
      else if (n.lightState === 'allred' && n.lightT >= LIGHT_ALLRED) {
        n.lightState = 'green'; n.lightT = 0;
        n.phaseIdx = (n.phaseIdx + 1) % n.phases.length;
      }
    }
  }

  // ----- cars -----
  isFree(lane, pos, minGap = 9) {
    for (const c of lane.cars) if (Math.abs(c.pos - pos) < minGap) return false;
    return true;
  }

  addCar(type, lane, pos, opts = {}) {
    if (!lane || lane.kind !== 'road') return null;
    pos = Math.max(3, Math.min(lane.length - 3, pos));
    let p = pos;
    while (p < lane.length - 3 && !this.isFree(lane, p)) p += 3;
    if (p >= lane.length - 3 || !this.isFree(lane, p)) return null;
    const d = DRIVERS[type];
    const car = {
      id: opts.id || this.nextCarId++,
      type, lane, pos: p,
      v: opts.v !== undefined ? opts.v : this.vmax(lane, d) * 0.6,
      acc: 0, v0: 0,
      route: [lane],
      length: 4.5, width: 1.9,
      shade: opts.shade !== undefined ? opts.shade : Math.random(),
      commitLane: null, commitJ: null, evalLane: null,
      wait: 0, stopDist: Infinity, state: 'cruising',
    };
    lane.cars.push(car);
    this.cars.push(car);
    this.extendRoute(car);
    return car;
  }

  addRandomCars(type, count) {
    const roads = this.lanes.filter((l) => l.kind === 'road' && l.length > 15);
    let added = 0;
    for (let tries = 0; tries < count * 40 && added < count && roads.length; tries++) {
      const lane = roads[Math.floor(Math.random() * roads.length)];
      const pos = 5 + Math.random() * (lane.length - 10);
      if (!this.isFree(lane, pos, 12)) continue;
      if (this.addCar(type, lane, pos)) added++;
    }
    return added;
  }

  removeCar(car) {
    if (car.lane) removeFromArray(car.lane.cars, car);
    removeFromArray(this.cars, car);
    this.uncommit(car);
    if (car.evalLane && car.evalLane.control) car.evalLane.control.evalCars.delete(car);
    car.lane = null;
  }

  setCarType(car, type) { car.type = type; }

  snapshotCar(c) {
    let lane = c.lane, frac = c.pos / c.lane.length;
    if (lane.kind !== 'road') { lane = c.route.find((l) => l.kind === 'road'); frac = 0; }
    if (!lane) return null;
    return { type: c.type, id: c.id, v: c.v, shade: c.shade, key: `${lane.edge.id}:${lane.fromNode.id}`, frac };
  }

  restoreCar(s) {
    if (!s) return;
    const lane = this.roadLanes.get(s.key);
    if (!lane) return;
    const car = this.addCar(s.type, lane, s.frac * lane.length, { id: s.id, v: s.v, shade: s.shade });
    if (car && this.onCarRestored) this.onCarRestored(s.id, car);
  }

  vmax(lane, d) {
    let v = (lane.limit + d.excess) / 3.6;
    if (lane.kappa > 1e-3) v = Math.min(v, Math.sqrt(d.alat / lane.kappa));
    return v;
  }

  // how crowded a road lane is (0 = empty, 1 = bumper to bumper)
  laneLoad(lane) {
    let used = 0, minPos = lane.length;
    for (const c of lane.cars) { used += c.length + 3; minPos = Math.min(minPos, c.pos - c.length / 2); }
    return { load: used / lane.length, room: minPos };
  }

  extendRoute(car, avoid = null) {
    let rem = -car.pos;
    for (const l of car.route) rem += l.length;
    for (let guard = 0; (rem < 350 || car.route.length < 4) && guard < 20; guard++) {
      const last = car.route[car.route.length - 1];
      const n = last.toNode;
      const inIdx = last.toArm;
      let opts = n.arms.map((a) => a.idx).filter((i) => i !== inIdx);
      if (!opts.length) opts = [inIdx];
      // slight preference for going straight, avoid crowded roads
      const weights = opts.map((o) => {
        const outLane = n.arms[o].outLane;
        const { load, room } = this.laneLoad(outLane);
        let w = turnType(n.arms[inIdx].angle, n.arms[o].angle) === 'straight' ? 1.6 : 1;
        w /= 1 + 8 * load * load;
        if (room < 10) w *= 0.1;
        if (outLane === avoid) w *= 0.02;
        return w;
      });
      let r = Math.random() * weights.reduce((s, w) => s + w, 0), out = opts[0];
      for (let i = 0; i < opts.length; i++) { r -= weights[i]; if (r <= 0) { out = opts[i]; break; } }
      for (const p of n.paths[inIdx][out]) { car.route.push(p); rem += p.length; }
      const outLane = n.arms[out].outLane;
      car.route.push(outLane);
      rem += outLane.length;
    }
  }

  // ----- simulation step -----
  step(dt) {
    this.time += dt;
    this.updateLights(dt);
    for (const c of this.cars) c.acc = this.accel(c, dt);
    for (const c of this.cars) {
      const v = c.v;
      c.v = Math.max(0, v + c.acc * dt);
      c.pos += (v + c.v) / 2 * dt;
      while (c.pos >= c.lane.length) { c.pos -= c.lane.length; this.advance(c); }
      if (c.lane.kind === 'road') {
        const st = this.stats[c.type];
        st.time += dt;
        if (c.v * 3.6 > c.lane.limit + 1) st.speeding += dt;
      }
    }
  }

  advance(c) {
    removeFromArray(c.lane.cars, c);
    c.route.shift();
    if (!c.route.length) c.route.push(c.lane); // should not happen
    const L = c.route[0];
    c.lane = L;
    L.cars.push(c);
    if (c.commitJ && L.junction !== c.commitJ) this.uncommit(c);
    if (L.control && c.commitLane !== L) this.commit(c, L, L.control);
    this.extendRoute(c);
  }

  commit(car, L, J) {
    if (car.commitJ && car.commitJ !== J) this.uncommit(car);
    car.commitLane = L;
    car.commitJ = J;
    J.occupants.add(car);
    J.evalCars.delete(car);
    if (car.evalLane === L) car.evalLane = null;
    car.wait = 0;
  }

  uncommit(car) {
    if (car.commitJ) car.commitJ.occupants.delete(car);
    car.commitLane = null;
    car.commitJ = null;
  }

  accel(car, dt) {
    const d = DRIVERS[car.type];
    // desired speed with look-ahead planning (speed limits and curves)
    let v0 = this.vmax(car.lane, d);
    let off = car.lane.length - car.pos;
    for (let i = 1; i < car.route.length && off < d.look; i++) {
      const L = car.route[i];
      const vl = this.vmax(L, d);
      v0 = Math.min(v0, Math.sqrt(vl * vl + 2 * d.bPlan * Math.max(0, off - d.margin)));
      off += L.length;
    }
    car.v0 = v0;
    const v = car.v;
    const aFree = v <= v0 ? d.a * (1 - Math.pow(v / Math.max(v0, 0.1), 4)) : -Math.min(d.freeDecel, 1.2 * (v - v0));
    const idm = (gap, vLead) => {
      const sStar = d.s0 + Math.max(0, v * d.T + v * (v - vLead) / (2 * Math.sqrt(d.a * d.b)));
      return aFree - d.a * Math.pow(sStar / Math.max(gap, 0.1), 2);
    };

    let acc = aFree;
    car.state = v < v0 - 1.5 ? 'accelerating' : v > v0 + 0.5 ? 'slowing for limit/curve' : 'cruising';
    car.leader = null;
    const ld = this.leader(car);
    if (ld) {
      const a = idm(ld.gap, ld.v);
      if (a < acc) { acc = a; if (ld.gap < 40) car.state = 'following'; }
      car.leader = ld.car;
    }
    const ob = this.control(car, dt);
    if (ob) {
      const a = idm(ob.gap, 0);
      if (a < acc) acc = a;
      car.state = ob.reason;
    }
    return Math.max(-9, Math.min(d.a, acc));
  }

  leader(car) {
    let off = -car.pos;
    for (let i = 0; i < car.route.length && off < 200; i++) {
      const L = car.route[i];
      let m = null;
      for (const c of L.cars) {
        if (c === car) continue;
        if (i === 0 && c.pos <= car.pos) continue;
        if (!m || c.pos < m.pos) m = c;
      }
      let best = m ? { gap: off + m.pos - (m.length + car.length) / 2, v: m.v, car: m } : null;
      // cars that just turned off onto a lane splitting from the same point are still in the way
      if (i > 0 && off < 40) {
        for (const S of car.route[i - 1].nexts) {
          if (S === L) continue;
          for (const c of S.cars) {
            if (c.pos > 10) continue;
            const gap = off + c.pos - (c.length + car.length) / 2;
            if (!best || gap < best.gap) best = { gap, v: c.v * 0.5, car: c };
          }
        }
      }
      // cars on other lanes merging into L that are closer to the merge point than we are
      if (i > 0 && L.prevs.length > 1 && off < 60) {
        const P = car.route[i - 1];
        for (const Q of L.prevs) {
          if (Q === P) continue;
          for (const c of Q.cars) {
            if (c.route[1] !== L || (Q.control && !c.commitLane)) continue;
            const dO = Q.length - c.pos;
            if (dO >= off) continue;
            const gap = off - dO - (c.length + car.length) / 2;
            if (!best || gap < best.gap) best = { gap, v: c.v, car: c };
          }
        }
      }
      if (best) return best;
      off += L.length;
    }
    return null;
  }

  // Returns a virtual stopped obstacle (stop line) if the car must not enter the next junction.
  control(car, dt) {
    const d = DRIVERS[car.type];
    let off = car.lane.length - car.pos;
    for (let i = 1; i < car.route.length && off < 250; i++) {
      const L = car.route[i];
      if (L.control) {
        if (L === car.commitLane) {
          if (L.control.kind === 'lights' && !this.lightOk(car, L, off, d)) this.uncommit(car);
          else return null;
        }
        return this.decide(car, L, L.control, off, dt, d);
      }
      off += L.length;
    }
    return null;
  }

  decide(car, L, J, off, dt, d) {
    const v = car.v;
    const commitDist = v * v / (2 * d.b) + 2 + v * 0.5;
    if (off > commitDist + d.evalExtra + 10 && car.evalLane !== L) return null;
    if (car.evalLane !== L) {
      if (car.evalLane && car.evalLane.control) car.evalLane.control.evalCars.delete(car);
      car.evalLane = L;
      J.evalCars.add(car);
      car.wait = 0;
    }
    car.stopDist = off;
    const reason = this.mayEnter(car, L, J, off, d);
    car.blockedBy = reason;
    if (!reason) {
      if (off <= commitDist) this.commit(car, L, J);
      return null;
    }
    if (v < 0.5) car.wait += dt;
    car.blockedBy = reason;
    // stuck behind a full exit for a while: pick another way
    if ((reason === 'exit blocked' && car.wait > 6) || (J.kind !== 'lights' && car.wait > 25)) this.reroute(car);
    return { gap: off + d.s0 - 1.0, reason };
  }

  reroute(car) {
    if (car.lane.kind !== 'road') return;
    const blocked = this.pathExit(car, car.route[1]);
    if (car.evalLane && car.evalLane.control) car.evalLane.control.evalCars.delete(car);
    car.evalLane = null;
    car.wait = 0;
    car.route = [car.lane];
    this.extendRoute(car, blocked);
  }

  // the road lane a car will be on after passing junction lane L
  pathExit(car, L) {
    const i = car.route.indexOf(L);
    if (i < 0) return null;
    for (let k = i + 1; k < car.route.length; k++) if (car.route[k].kind === 'road') return car.route[k];
    return null;
  }

  lightOk(car, L, off, d) {
    const s = this.signal(L.control, L.armIn);
    if (s === 'green' || off < 0.5) return true;
    const need = car.v * car.v / (2 * Math.max(off, 0.3));
    if (s === 'yellow') return need > d.yellowDecel;
    return need > 8; // red: only if physically unable to stop
  }

  mayEnter(car, L, J, off, d) {
    if (J.kind === 'lights' && !this.lightOk(car, L, off, d)) {
      return this.signal(J, L.armIn) === 'yellow' ? 'stopping for yellow' : 'waiting at red light';
    }
    if (J.kind === 'roundabout') {
      const outL = this.pathExit(car, L);
      if (outL && this.laneLoad(outL).room < car.length + d.s0 + 1) return 'exit blocked';
      return this.roundaboutCheck(car, L, J, off, d);
    }

    if (!this.exitSpace(car, L, J, d)) return 'exit blocked';
    for (const o of J.occupants) {
      if (o !== car && o.commitLane && J.conflicts.has(L.id + ':' + o.commitLane.id)) return 'waiting for crossing traffic';
    }
    for (const A of J.arms) {
      const inL = A.inLane;
      if (inL === L.inRoad) continue;
      for (const c of inL.cars) {
        if (c.commitLane) continue;
        const cl = c.route[1];
        if (!cl || cl.control !== J || !J.conflicts.has(L.id + ':' + cl.id)) continue;
        if (!this.hasPriority(J, cl, L)) continue;
        if (J.kind === 'lights' && this.signal(J, cl.armIn) === 'red') continue;
        // a car that is standing still because it is itself blocked does not hold anyone up
        if (c.v < 0.5 && c.blockedBy) continue;
        const dist = inL.length - c.pos;
        const eta = dist / Math.max(c.v, 0.5);
        if (eta < d.gap || dist < 12) return J.kind === 'lights' ? 'yielding to oncoming traffic' : 'giving way';
      }
    }
    return null;
  }

  // does a car on connector `other` have right of way over a car on connector `mine`?
  hasPriority(J, other, mine) {
    const rel = normAngle(J.arms[other.armIn].angle - J.arms[mine.armIn].angle);
    const opposite = Math.abs(rel) > 3 * Math.PI / 4;
    const myLeft = mine.turn === 'left' || mine.turn === 'uturn';
    const theirLeft = other.turn === 'left' || other.turn === 'uturn';
    if (J.kind === 'lights') return opposite && myLeft && !theirLeft;
    if (rel < -Math.PI / 4 && rel > -3 * Math.PI / 4) return true; // coming from my right
    return opposite && myLeft && !theirLeft;
  }

  exitSpace(car, L, J, d) {
    const outL = L.outRoad;
    let minPos = outL.length;
    for (const c of outL.cars) minPos = Math.min(minPos, c.pos - c.length / 2);
    let pending = 0;
    for (const o of J.occupants)
      if (o !== car && o.commitLane && o.commitLane.outRoad === outL && o.lane !== outL) pending += o.length + 2;
    return minPos - pending > car.length + d.s0 + 1;
  }

  roundaboutCheck(car, L, J, off, d) {
    const M = L.mergeArc;
    const distToMerge = off + L.length;
    const tSelf = car.v > 3 ? distToMerge / car.v : Math.sqrt(2 * distToMerge / d.a);
    for (const o of J.occupants) {
      if (o === car || o.commitLane === L) continue;
      if (o.lane === M) {
        if (o.pos - o.length / 2 < car.length + d.s0 + 1) return 'yielding to roundabout traffic';
        continue;
      }
      const dist = this.distAlongRoute(o, M);
      if (dist === null) continue;
      const eta = dist / Math.max(o.v, 1.5);
      if (dist < 8 + o.length || eta < tSelf + d.rbGap) return 'yielding to roundabout traffic';
    }
    return null;
  }

  distAlongRoute(c, lane) {
    let off = c.lane.length - c.pos;
    for (let i = 1; i < c.route.length && off < 150; i++) {
      if (c.route[i] === lane) return off;
      off += c.route[i].length;
    }
    return null;
  }

  // ----- queries for UI -----
  carPose(c) { return c.lane.at(c.pos); }

  nearestRoadLane(p, maxDist = 6) {
    let best = null;
    for (const l of this.lanes) {
      if (l.kind !== 'road') continue;
      const r = distToSegment(p, l.start, l.end);
      if (r.d < maxDist && (!best || r.d < best.d)) best = { lane: l, pos: r.t * l.length, d: r.d };
    }
    return best;
  }

  nearestCar(p, maxDist = 5) {
    let best = null, bd = maxDist;
    for (const c of this.cars) {
      const q = c.lane.at(c.pos);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  nearestNode(p, maxDist = 22) {
    let best = null, bd = maxDist;
    for (const n of this.nodes) {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  nearestEdge(p, includeDisabled, maxDist = 10) {
    let best = null, bd = maxDist;
    for (const e of this.edges.values()) {
      if (!e.enabled && !includeDisabled) continue;
      const a = this.nodes[e.a], b = this.nodes[e.b];
      const r = distToSegment(p, a, b);
      const along = r.t * this.spacing;
      if (along < 14 || along > this.spacing - 14) continue;
      if (r.d < bd) { bd = r.d; best = e; }
    }
    return best;
  }

  summary() {
    const out = {};
    for (const type of Object.keys(DRIVERS)) {
      const cars = this.cars.filter((c) => c.type === type);
      const st = this.stats[type];
      out[type] = {
        count: cars.length,
        avgSpeed: cars.length ? cars.reduce((s, c) => s + c.v, 0) / cars.length * 3.6 : 0,
        speedingNow: cars.filter((c) => c.lane.kind === 'road' && c.v * 3.6 > c.lane.limit + 1).length,
        speedingShare: st.time > 0 ? st.speeding / st.time : 0,
      };
    }
    return out;
  }
}

if (typeof module !== 'undefined') module.exports = { World, DRIVERS, Lane };
