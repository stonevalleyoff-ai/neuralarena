// Neural Arena — LE RENDU (rendu.js)
// Dessine une manche dans un canevas : le décor (gardé en cache par carte), les automates, les traits, les aléas, les étincelles.
// Il ne décide de rien : il lit la manche et vide sa file d'événements (qu'il passe aussi au son).
(function () {
  'use strict';
  var NA = window.NA, T = NA.T, LARG = NA.LARG, HAUT = NA.HAUT;
  var COULEURS = ['#ff6b5e', '#4fc3f7', '#a5e06c', '#c69bff'];
  var NOMS_COULEURS = ['corail', 'azur', 'tilleul', 'lilas'];
  var decors = {};

  function decor(carte) {
    if (decors[carte.id]) return decors[carte.id];
    var c = document.createElement('canvas'); c.width = LARG * 2; c.height = HAUT * 2;
    var x = c.getContext('2d'), h = carte.teinte, tx, ty;
    x.scale(2, 2);
    var g = x.createLinearGradient(0, 0, 0, HAUT);
    g.addColorStop(0, 'hsl(' + h + ',28%,11%)'); g.addColorStop(1, 'hsl(' + h + ',32%,6%)');
    x.fillStyle = g; x.fillRect(0, 0, LARG, HAUT);
    x.strokeStyle = 'hsla(' + h + ',40%,60%,0.05)'; x.lineWidth = 1;                 // (le quadrillage d'un plan d'atelier)
    for (tx = 0; tx <= LARG; tx += 40) { x.beginPath(); x.moveTo(tx + 0.5, 0); x.lineTo(tx + 0.5, HAUT); x.stroke(); }
    for (ty = 0; ty <= HAUT; ty += 40) { x.beginPath(); x.moveTo(0, ty + 0.5); x.lineTo(LARG, ty + 0.5); x.stroke(); }
    x.strokeStyle = 'hsla(' + h + ',50%,65%,0.07)'; x.lineWidth = 2;
    [[200, 150, 90], [620, 330, 130], [400, 240, 210]].forEach(function (r) { x.beginPath(); x.arc(r[0], r[1], r[2], 0, 7); x.stroke(); });
    function t(a, b) { return carte.g[((b + NA.ROWS) % NA.ROWS) * NA.COLS + ((a + NA.COLS) % NA.COLS)]; }
    for (ty = 0; ty < NA.ROWS; ty++) for (tx = 0; tx < NA.COLS; tx++) {
      var v = t(tx, ty), px = tx * T, py = ty * T;
      if (v === 1) {
        x.fillStyle = 'hsl(' + h + ',20%,' + (20 + ((tx * 7 + ty * 13) % 3)) + '%)'; x.fillRect(px, py, T, T);
        if (t(tx, ty - 1) !== 1) { x.fillStyle = 'hsl(' + h + ',45%,58%)'; x.fillRect(px, py, T, 3); }
        if (t(tx, ty + 1) !== 1) { x.fillStyle = 'hsla(' + h + ',30%,4%,0.55)'; x.fillRect(px, py + T - 4, T, 4); }
        if (t(tx - 1, ty) !== 1) { x.fillStyle = 'hsla(' + h + ',40%,60%,0.25)'; x.fillRect(px, py, 1.5, T); }
        if (t(tx + 1, ty) !== 1) { x.fillStyle = 'hsla(' + h + ',30%,4%,0.4)'; x.fillRect(px + T - 1.5, py, 1.5, T); }
        if ((tx * 31 + ty * 17) % 11 === 0) { x.fillStyle = 'hsla(' + h + ',30%,70%,0.12)'; x.beginPath(); x.arc(px + 10, py + 11, 2, 0, 7); x.fill(); }   // (un rivet)
      } else if (v === 2) {
        x.fillStyle = '#d9a441'; x.fillRect(px, py, T, 4);
        x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(px, py + 4, T, 2);
        x.fillStyle = '#8a6424'; x.fillRect(px + 2, py + 4, 2, 5); x.fillRect(px + T - 4, py + 4, 2, 5);
      }
    }
    return (decors[carte.id] = c);
  }

  function Rendu(canvas) {
    this.c = canvas; this.x = canvas.getContext('2d');
    this.parts = []; this.secousse = 0; this.traces = {}; this.souffle = []; this.n = 0;
  }
  // ajuste la taille interne du canevas à sa taille à l'écran ; rend l'échelle (pixels d'écran par pixel d'arène)
  Rendu.prototype.cadrer = function () {
    var r = this.c.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
    if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
    this.ech = Math.min(w / LARG, h / HAUT); this.ox = (w - LARG * this.ech) / 2; this.oy = (h - HAUT * this.ech) / 2;
    return { ech: this.ech / d, ox: this.ox / d, oy: this.oy / d, gauche: r.left, haut: r.top };
  };
  Rendu.prototype.eclats = function (x, y, c, n, f) {
    for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, v = (0.5 + Math.random()) * f; this.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6, vie: 18 + Math.random() * 16, c: c, t: 1.5 + Math.random() * 2 }); }
    if (this.parts.length > 500) this.parts.splice(0, this.parts.length - 500);
  };
  Rendu.prototype.evenement = function (e) {
    var c = e.i >= 0 ? COULEURS[e.i % 4] : '#ffd27a';
    if (e.t === 'touche') { this.eclats(e.x, e.y, c, 14, 2.4); this.eclats(e.x, e.y, '#ffffff', 6, 1.6); this.secousse = 6; }
    else if (e.t === 'mort') { this.eclats(e.x, e.y, c, 40, 3.6); this.parts.push({ x: e.x, y: e.y, anneau: 4, vie: 22, c: c }); this.secousse = 11; }
    else if (e.t === 'plante') this.eclats(e.x, e.y, '#cfd8e3', 3, 1);
    else if (e.t === 'saut' || e.t === 'pose') this.eclats(e.x, e.y, 'rgba(210,220,235,0.6)', 4, 0.9);
    else if (e.t === 'ruee') this.eclats(e.x, e.y, c, 6, 1.2);
    else if (e.t === 'boum') { this.eclats(e.x, e.y, '#ffb547', 30, 4); this.parts.push({ x: e.x, y: e.y, anneau: 6, vie: 20, c: '#ffb547' }); this.secousse = 9; }
  };

  function automate(x, a, c, n, etiquette) {
    var px = a.x, py = a.y, w = a.w, h = a.h, cx = px + w / 2;
    x.save();
    if (a.invul > 0 && (n >> 2) % 2) x.globalAlpha = 0.4;
    var ecrase = a.rueeT > 0 ? 0.8 : 1;
    x.translate(cx, py + h); x.scale(a.rueeT > 0 ? 1.25 : 1, ecrase); x.translate(-cx, -(py + h));
    // les pieds
    var foulee = a.sol && Math.abs(a.vx) > 0.4 ? Math.sin(a.x * 0.45) * 2.5 : 0;
    x.fillStyle = '#1b222c';
    x.fillRect(px + 2 + foulee, py + h - 4, 5, 4); x.fillRect(px + w - 7 - foulee, py + h - 4, 5, 4);
    // le corps
    x.fillStyle = c; rond(x, px, py + 2, w, h - 5, 5); x.fill();
    x.fillStyle = 'rgba(0,0,0,0.22)'; rond(x, px, py + h - 11, w, 8, 4); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.28)'; x.fillRect(px + 2, py + 4, 2, 7);
    // l'antenne
    x.strokeStyle = c; x.lineWidth = 1.5; x.beginPath(); x.moveTo(cx, py + 2); x.lineTo(cx - a.face * 2, py - 4); x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(cx - a.face * 2, py - 5, 1.6, 0, 7); x.fill();
    // la visière, et l'œil qui suit la visée
    x.fillStyle = '#10151c'; rond(x, px + 2, py + 5, w - 4, 7, 3); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(cx + Math.cos(a.visee) * 3.2, py + 8.5 + Math.sin(a.visee) * 1.6, 1.9, 0, 7); x.fill();
    x.restore();
    // le lance-traits
    var ax = Math.cos(a.visee), ay = Math.sin(a.visee), recul = a.cdTir > 8 ? 3 : 0, my = py + h / 2 + 1;
    x.strokeStyle = '#e8edf2'; x.lineWidth = 2.5; x.lineCap = 'round';
    x.beginPath(); x.moveTo(cx + ax * 5, my + ay * 5); x.lineTo(cx + ax * (15 - recul), my + ay * (15 - recul)); x.stroke();
    x.strokeStyle = c; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(cx + ax * 11 - ay * 5, my + ay * 11 + ax * 5); x.lineTo(cx + ax * (15 - recul), my + ay * (15 - recul)); x.lineTo(cx + ax * 11 + ay * 5, my + ay * 11 - ax * 5); x.stroke();
    // la vie et le carquois
    var i;
    for (i = 0; i < NA.PV; i++) { x.fillStyle = i < a.pv ? c : 'rgba(255,255,255,0.14)'; x.fillRect(cx - 9 + i * 7, py - 14, 5, 3); }
    for (i = 0; i < NA.CARQUOIS; i++) { x.fillStyle = i < Math.floor(a.carquois) ? '#e8edf2' : 'rgba(255,255,255,0.14)'; x.fillRect(cx - 7 + i * 5.5, py - 9.5, 3, 1.6); }
    if (etiquette) { x.font = '700 9px ui-monospace,Menlo,Consolas,monospace'; x.textAlign = 'center'; x.fillStyle = '#fff'; x.fillText(etiquette, cx, py - 18); }
  }
  function rond(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  // dessiner aussi de l'autre côté d'un bord quand on le chevauche
  function reboucle(x, px, py, marge, f) {
    f();
    var dx = px < marge ? LARG : px > LARG - marge ? -LARG : 0, dy = py < marge ? HAUT : py > HAUT - marge ? -HAUT : 0;
    if (dx) { x.save(); x.translate(dx, 0); f(); x.restore(); }
    if (dy) { x.save(); x.translate(0, dy); f(); x.restore(); }
  }

  // o : { etiquettes: { indice: 'TOI' }, son: function (evt), fige (ne pas faire vivre les étincelles) }
  Rendu.prototype.dessiner = function (m, o) {
    o = o || {};
    var x = this.x, self = this, i, n = ++this.n;
    while (m.evts.length) { var e = m.evts.shift(); this.evenement(e); if (o.son) o.son(e); }
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#0b0e12'; x.fillRect(0, 0, this.c.width, this.c.height);
    var sx = 0, sy = 0;
    if (this.secousse > 0.3) { sx = (Math.random() - 0.5) * this.secousse; sy = (Math.random() - 0.5) * this.secousse; this.secousse *= 0.85; }
    x.setTransform(this.ech, 0, 0, this.ech, this.ox + sx * this.ech, this.oy + sy * this.ech);
    x.save(); x.beginPath(); x.rect(0, 0, LARG, HAUT); x.clip();
    x.drawImage(decor(m.carte), 0, 0, LARG, HAUT);

    if (m.vent) {                                                              // (le vent : des filets qui traversent)
      if (this.souffle.length < 26) this.souffle.push({ x: Math.random() * LARG, y: Math.random() * HAUT, l: 20 + Math.random() * 40 });
      x.strokeStyle = 'rgba(220,235,255,0.22)'; x.lineWidth = 1.2;
      this.souffle.forEach(function (s) { s.x = (s.x + m.vent * 9 + LARG) % LARG; x.beginPath(); x.moveTo(s.x, s.y); x.lineTo(s.x - m.vent * s.l, s.y); x.stroke(); });
    } else if (this.souffle.length) this.souffle.length = 0;

    for (i = 0; i < m.mines.length; i++) {
      var mi = m.mines[i], clign = mi.meche ? (n >> 1) % 2 : (n >> 5) % 2;
      x.fillStyle = '#2a323d'; x.beginPath(); x.arc(mi.x, mi.y + 4, 7, Math.PI, 0); x.fill();
      x.fillStyle = clign ? '#ff5a4a' : '#6b2a24'; x.beginPath(); x.arc(mi.x, mi.y - 1, 2.4, 0, 7); x.fill();
      if (mi.meche) { x.strokeStyle = 'rgba(255,90,74,' + (0.2 + 0.5 * (1 - mi.meche / 32)) + ')'; x.lineWidth = 1.5; x.beginPath(); x.arc(mi.x, mi.y, 50 * (1 - mi.meche / 32), 0, 7); x.stroke(); }
    }

    for (i = 0; i < m.traits.length; i++) {
      var tr = m.traits[i], c = COULEURS[tr.de.i % 4], ang = tr.plante ? tr.ang : Math.atan2(tr.vy, tr.vx), ux = Math.cos(ang), uy = Math.sin(ang);
      x.globalAlpha = tr.plante ? Math.min(1, tr.plante / 20) * 0.7 : 1;
      if (!tr.plante) { var gr = x.createLinearGradient(tr.x, tr.y, tr.x - ux * 34, tr.y - uy * 34); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.strokeStyle = gr; x.lineWidth = 3; x.beginPath(); x.moveTo(tr.x, tr.y); x.lineTo(tr.x - ux * 34, tr.y - uy * 34); x.stroke(); }
      x.strokeStyle = '#f4f7fa'; x.lineWidth = 1.8; x.beginPath(); x.moveTo(tr.x + ux * 2, tr.y + uy * 2); x.lineTo(tr.x - ux * 11, tr.y - uy * 11); x.stroke();
      x.fillStyle = c; x.beginPath(); x.arc(tr.x - ux * 11, tr.y - uy * 11, 1.8, 0, 7); x.fill();
      x.globalAlpha = 1;
    }

    m.autos.forEach(function (a) {
      if (a.mort) return;
      var c = COULEURS[a.i % 4], tr = self.traces[a.i] || (self.traces[a.i] = []);
      if (a.rueeT > 0) tr.push({ x: a.x, y: a.y, v: 10 });
      for (var k = tr.length - 1; k >= 0; k--) { var g = tr[k]; x.globalAlpha = g.v / 26; x.fillStyle = c; rond(x, g.x, g.y + 2, a.w, a.h - 5, 5); x.fill(); if (!o.fige && --g.v <= 0) tr.splice(k, 1); }
      x.globalAlpha = 1;
      reboucle(x, a.cx(), a.cy(), 30, function () { automate(x, a, c, n, o.etiquettes && o.etiquettes[a.i]); });
    });

    for (i = this.parts.length - 1; i >= 0; i--) {
      var p = this.parts[i];
      if (p.anneau) { x.strokeStyle = p.c; x.globalAlpha = p.vie / 22; x.lineWidth = 2.5; x.beginPath(); x.arc(p.x, p.y, p.anneau, 0, 7); x.stroke(); if (!o.fige) p.anneau += 3; }
      else { x.globalAlpha = Math.min(1, p.vie / 14); x.fillStyle = p.c; x.fillRect(p.x - p.t / 2, p.y - p.t / 2, p.t, p.t); if (!o.fige) { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.97; } }
      if (!o.fige && --p.vie <= 0) this.parts.splice(i, 1);
    }
    x.globalAlpha = 1;
    x.restore();
  };
  Rendu.prototype.vider = function () { this.parts.length = 0; this.traces = {}; this.secousse = 0; };

  // une vignette de carte, pour le choix de l'arène
  function vignette(canvas, carte) {
    var x = canvas.getContext('2d');
    x.drawImage(decor(carte), 0, 0, canvas.width, canvas.height);
  }

  window.NA.Rendu = Rendu; window.NA.COULEURS = COULEURS; window.NA.NOMS_COULEURS = NOMS_COULEURS; window.NA.vignette = vignette;
})();
