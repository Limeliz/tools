'use strict';
/* Traffic Sandbox – canvas renderer. Draws in world metres via a canvas transform. */

const COLORS = {
  grass: '#9dbb83',
  grassDark: '#8fae76',
  asphalt: '#4a4d53',
  marking: '#f4f4f0',
  zone30: 'rgba(245, 178, 50, 0.55)',
  island: '#86a96c',
  curb: '#d8d8d2',
  defensive: ['#2b6fd6', '#3b8ae8', '#1f5bb5'],
  aggressive: ['#d93a3a', '#e8622c', '#b82a4a'],
  highlight: '#ffd400',
  remove: '#ff3b30',
};

class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.hover = null;     // {kind:'node'|'edge'|'car'|'lane', ...}
    this.selected = null;  // car
    this.tool = 'select';
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.updateView();
  }

  updateView() {
    const b = this.world.bounds, m = 40;
    const ww = b.x1 - b.x0 + 2 * m, wh = b.y1 - b.y0 + 2 * m;
    const base = Math.min(this.w / ww, this.h / wh);
    this.scale = base * this.zoom;
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    this.ox = this.w / 2 - cx * this.scale + this.panX;
    this.oy = this.h / 2 - cy * this.scale + this.panY;
  }

  toWorld(sx, sy) { return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale }; }

  zoomAt(sx, sy, factor) {
    const before = this.toWorld(sx, sy);
    this.zoom = Math.max(0.6, Math.min(8, this.zoom * factor));
    this.updateView();
    const after = this.toWorld(sx, sy);
    this.panX += (after.x - before.x) * this.scale;
    this.panY += (after.y - before.y) * this.scale;
    this.updateView();
  }

  resetView() { this.zoom = 1; this.panX = 0; this.panY = 0; this.updateView(); }

  draw() {
    const ctx = this.ctx, w = this.world;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * this.ox, this.dpr * this.oy);

    this.drawGrassTexture();
    if (this.tool === 'road') this.drawDisabledEdges();
    this.drawZones();
    this.drawJunctionPads();
    this.drawLanes();
    this.drawRoundaboutIslands();
    this.drawMarkings();
    this.drawSigns();
    this.drawLights();
    this.drawCars();
    this.drawHover();
  }

  drawGrassTexture() {
    const ctx = this.ctx, b = this.world.bounds;
    ctx.fillStyle = COLORS.grassDark;
    const s = this.world.spacing;
    for (let x = b.x0 - s; x < b.x1 + s; x += s)
      for (let y = b.y0 - s; y < b.y1 + s; y += s) {
        if (((x + y) / s) % 2 === 0) ctx.fillRect(x + 14, y + 14, s - 28, s - 28);
      }
  }

  edgeEnds(e) {
    const a = this.world.nodes[e.a], b = this.world.nodes[e.b];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
    const ux = dx / l, uy = dy / l;
    return {
      a, b, ux, uy,
      p: { x: a.x + ux * (a.trim || 0), y: a.y + uy * (a.trim || 0) },
      q: { x: b.x - ux * (b.trim || 0), y: b.y - uy * (b.trim || 0) },
    };
  }

  drawDisabledEdges() {
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.2;
    for (const e of this.world.edges.values()) {
      if (e.enabled) continue;
      const a = this.world.nodes[e.a], b = this.world.nodes[e.b];
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }

  drawZones() {
    const ctx = this.ctx;
    ctx.strokeStyle = COLORS.zone30;
    ctx.lineWidth = 13;
    ctx.lineCap = 'butt';
    for (const e of this.world.edges.values()) {
      if (!e.enabled || e.limit !== 30) continue;
      const { p, q } = this.edgeEnds(e);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
  }

  drawJunctionPads() {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.asphalt;
    for (const n of this.world.nodes) {
      if (n.kind === 'plain' || n.kind === 'lights') {
        ctx.beginPath(); ctx.arc(n.x, n.y, n.trim + 1.5, 0, Math.PI * 2); ctx.fill();
      } else if (n.kind === 'roundabout') {
        ctx.beginPath(); ctx.arc(n.x, n.y, 13 + 2.8, 0, Math.PI * 2); ctx.fill();
      } else if (n.kind === 'deadend') {
        const A = n.arms[0], ux = Math.cos(A.angle), uy = Math.sin(A.angle);
        ctx.beginPath(); ctx.arc(n.x - ux * 2.5, n.y - uy * 2.5, 8, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  drawLanes() {
    const ctx = this.ctx;
    ctx.strokeStyle = COLORS.asphalt;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const l of this.world.lanes) {
      ctx.lineWidth = l.kind === 'ring' ? 5 : 4.2;
      ctx.beginPath();
      ctx.moveTo(l.points[0].x, l.points[0].y);
      for (let i = 1; i < l.points.length; i++) ctx.lineTo(l.points[i].x, l.points[i].y);
      ctx.stroke();
    }
  }

  drawRoundaboutIslands() {
    const ctx = this.ctx;
    for (const n of this.world.nodes) {
      if (n.kind !== 'roundabout') continue;
      ctx.fillStyle = COLORS.curb;
      ctx.beginPath(); ctx.arc(n.x, n.y, 10.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORS.island;
      ctx.beginPath(); ctx.arc(n.x, n.y, 9.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6f9558';
      ctx.beginPath(); ctx.arc(n.x - 1.5, n.y - 1, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(n.x + 2.4, n.y + 1.6, 2.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawMarkings() {
    const ctx = this.ctx;
    ctx.strokeStyle = COLORS.marking;
    ctx.lineCap = 'butt';
    // centre lines
    ctx.lineWidth = 0.25;
    ctx.setLineDash([3, 3]);
    for (const e of this.world.edges.values()) {
      if (!e.enabled) continue;
      const { p, q } = this.edgeEnds(e);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    // stop / give-way lines
    for (const n of this.world.nodes) {
      if (!['plain', 'lights', 'roundabout'].includes(n.kind)) continue;
      for (const A of n.arms) {
        const L = A.inLane, e = L.end, d = L.dir;
        const r = { x: -d.y, y: d.x };
        ctx.lineWidth = n.kind === 'lights' ? 0.5 : 0.35;
        ctx.setLineDash(n.kind === 'lights' ? [] : [0.6, 0.5]);
        ctx.beginPath();
        ctx.moveTo(e.x - r.x * 1.7, e.y - r.y * 1.7);
        ctx.lineTo(e.x + r.x * 1.9, e.y + r.y * 1.9);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  drawSigns() {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of this.world.lanes) {
      if (l.kind !== 'road' || l.length < 30) continue;
      // only where the limit changes (or after a dead end / at the map edge for 30 zones)
      const changes = l.fromNode.arms.some((A) => A.inLane && A.inLane !== l && A.inLane.limit !== l.limit);
      if (!changes && !(l.limit === 30 && l.fromNode.arms.length === 1)) continue;
      const d = l.dir, r = { x: -d.y, y: d.x };
      const x = l.start.x + d.x * 6 + r.x * 4.6, y = l.start.y + d.y * 6 + r.y * 4.6;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d42020';
      ctx.lineWidth = 0.55;
      ctx.beginPath(); ctx.arc(x, y, 2.1, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#111';
      ctx.font = 'bold 2.3px system-ui, sans-serif';
      ctx.fillText(String(l.limit), x, y + 0.1);
    }
  }

  drawLights() {
    const ctx = this.ctx, w = this.world;
    for (const n of w.nodes) {
      if (n.kind !== 'lights') continue;
      for (const A of n.arms) {
        const L = A.inLane, e = L.end, d = L.dir;
        const r = { x: -d.y, y: d.x };
        const x = e.x + r.x * 3.6 - d.x * 0.5, y = e.y + r.y * 3.6 - d.y * 0.5;
        const s = w.signal(n, A.idx);
        ctx.fillStyle = '#1b1b1b';
        ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = s === 'green' ? '#35e05a' : s === 'yellow' ? '#ffcc00' : '#ff3030';
        ctx.beginPath(); ctx.arc(x, y, 1.15, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  drawCars() {
    const ctx = this.ctx;
    for (const c of this.world.cars) {
      const p = c.lane.at(c.pos);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      const L = c.length, W = c.width;
      if (c === this.selected || (this.hover && this.hover.kind === 'car' && this.hover.car === c)) {
        ctx.fillStyle = this.tool === 'remove' ? COLORS.remove : COLORS.highlight;
        roundRect(ctx, -L / 2 - 0.8, -W / 2 - 0.8, L + 1.6, W + 1.6, 1.2);
        ctx.fill();
      }
      const pal = COLORS[c.type];
      ctx.fillStyle = pal[Math.floor(c.shade * pal.length) % pal.length];
      roundRect(ctx, -L / 2, -W / 2, L, W, 0.6);
      ctx.fill();
      // windscreen + roof
      ctx.fillStyle = 'rgba(20,30,45,0.75)';
      ctx.fillRect(L * 0.08, -W / 2 + 0.25, L * 0.18, W - 0.5);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-L * 0.28, -W / 2 + 0.3, L * 0.34, W - 0.6);
      // headlights
      ctx.fillStyle = '#fff6c8';
      ctx.fillRect(L / 2 - 0.25, -W / 2 + 0.2, 0.25, 0.45);
      ctx.fillRect(L / 2 - 0.25, W / 2 - 0.65, 0.25, 0.45);
      // brake lights
      ctx.fillStyle = c.acc < -0.6 ? '#ff2020' : '#7a1010';
      ctx.fillRect(-L / 2, -W / 2 + 0.15, 0.35, 0.5);
      ctx.fillRect(-L / 2, W / 2 - 0.65, 0.35, 0.5);
      ctx.restore();
    }
  }

  drawHover() {
    const ctx = this.ctx, h = this.hover;
    if (!h) return;
    ctx.save();
    if (h.kind === 'node') {
      ctx.strokeStyle = COLORS.highlight;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2.5, 1.5]);
      ctx.beginPath(); ctx.arc(h.node.x, h.node.y, 20, 0, Math.PI * 2); ctx.stroke();
    } else if (h.kind === 'edge') {
      const { p, q } = this.edgeEnds(h.edge);
      ctx.strokeStyle = h.color || 'rgba(255,212,0,0.45)';
      ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    } else if (h.kind === 'lane') {
      const pt = h.lane.at(h.pos), c = this.tool === 'addDef' ? COLORS.defensive[0] : COLORS.aggressive[0];
      ctx.translate(pt.x, pt.y); ctx.rotate(pt.a);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = c;
      roundRect(ctx, -2.25, -0.95, 4.5, 1.9, 0.6);
      ctx.fill();
    }
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
