// Neural Arena — LE CŒUR DE SIMULATION (sim.js)
// Partagé par la page, le worker de dressage et les essais sous Node : aucun accès au DOM.
// Contenu : les arènes (tuiles, bords qui rebouclent), les automates (course, saut, mur, ruée), les traits, les aléas,
// le réseau de neurones, les pilotes (cerveau, automate scripté, humain) et le dresseur (stratégie d'évolution).
// Tout tourne à pas fixe, 60 pas par seconde, et tout hasard passe par une graine : une manche se rejoue à l'identique.
(function (racine) {
  'use strict';

  var T = 20, COLS = 40, ROWS = 24, LARG = COLS * T, HAUT = ROWS * T;
  var PV = 3, CARQUOIS = 3, RECHARGE = 50, CD_TIR = 14, V_TRAIT = 10.5, G_TRAIT = 0.09, VIE_TRAIT = 200;
  var RUEE_T = 9, RUEE_V = 7.5, RUEE_CD = 55, INVUL = 50, PAS_IA = 2;
  var PHY = { course: 3.2, accSol: 0.55, frein: 0.7, accAir: 0.32, freinAir: 0.08, gMonte: 0.38, gDescend: 0.52, saut: -9.4, sautCoupe: -3,
    chute: 8.5, chuteVite: 11, glisse: 1.8, sautMurX: 4.4, sautMurY: -8.4 };      // (un saut monte de cinq tuiles et demie : assez pour chaque étage)

  // ---------- le hasard ----------
  function alea(g) {
    g = g >>> 0;
    return function () { g = g + 0x6D2B79F5 | 0; var t = Math.imul(g ^ g >>> 15, 1 | g); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function gauss(r) { var u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); }
  function borne(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ecartX(d) { return d - LARG * Math.round(d / LARG); }      // le plus court écart, à travers les bords
  function ecartY(d) { return d - HAUT * Math.round(d / HAUT); }
  function tour(v, n) { return ((v % n) + n) % n; }

  // ---------- les arènes ----------
  // On n'écrit que la moitié gauche : la droite est son miroir, donc personne n'est avantagé. La première et la dernière ligne
  // sont identiques, pour que les puits du bas débouchent sur les trappes du haut.
  // '#' mur · '-' passerelle (on la traverse par en dessous) · 'S' départ · '.' vide
  var PLANS = [
    { id: 'atelier', nom: 'Atelier', teinte: 205, moitie: [
      '##########....######', '#...................', '#...................', '#...S...............', '#..#####........----', '#...................',
      '#...................', '#...........S.......', '#.........######....', '....................', '....................', '..S.................',
      '#####...............', '#...........--------', '#...................', '#...................', '#.....S.............', '#...#####......#####',
      '#...................', '#...................', '#...................', '#..S..........S.....', '##########....######', '##########....######'] },
    { id: 'fonderie', nom: 'Fonderie', teinte: 18, moitie: [
      '####################', '#...................', '#...................', '#..S................', '#.#####.......------', '#...................',
      '#..................#', '#.........S........#', '#.......#####......#', '#..................#', '...................#', '...................#',
      '..S................#', '######.............#', '#...........S......#', '#.........#####...##', '#...................', '#...................',
      '#....----...........', '#...................', '#...................', '#......S.........S..', '####################', '####################'] },
    { id: 'serre', nom: 'Serre', teinte: 140, moitie: [
      '####......##########', '#...................', '#...................', '#.......S...........', '#.....------....####', '#...................',
      '#...................', '#..S...........S....', '#.-----......------.', '#...................', '....................', '....................',
      '.S.........S........', '####.....------.....', '#...................', '#...................', '#......S............', '#....------.....####',
      '#...................', '#...................', '#...................', '#.S..........S......', '####......##########', '####......##########'] },
    { id: 'puits', nom: 'Puits', teinte: 268, moitie: [
      '######....##....####', '#...................', '#...................', '#...S...............', '#..####....##.......', '#..........##.......',
      '#..........##...S...', '#..........##..#####', '#...................', '....................', '....................', '..S.................',
      '####....---.........', '#...................', '#.............##....', '#.....S.......##....', '#....####.....##....', '#.............##....',
      '#...................', '#...................', '#...................', '#.S.......S.........', '######....##....####', '######....##....####'] }
  ];
  var CARTES = PLANS.map(function (p) {
    if (p.moitie.length !== ROWS) throw new Error('carte ' + p.id + ' : ' + p.moitie.length + ' lignes');
    var g = new Uint8Array(COLS * ROWS), departs = [];
    p.moitie.forEach(function (l, y) {
      if (l.length !== COLS / 2) throw new Error('carte ' + p.id + ', ligne ' + y + ' : ' + l.length + ' cases');
      var ligne = l + l.split('').reverse().join('');
      for (var x = 0; x < COLS; x++) {
        var c = ligne[x];
        g[y * COLS + x] = c === '#' ? 1 : c === '-' ? 2 : 0;
        if (c === 'S') departs.push({ x: x * T + T / 2, y: (y + 1) * T });      // (le milieu des pieds)
      }
    });
    return { id: p.id, nom: p.nom, teinte: p.teinte, g: g, departs: departs };
  });
  function carte(id) { for (var i = 0; i < CARTES.length; i++) if (CARTES[i].id === id) return CARTES[i]; return null; }

  // ---------- l'automate : un combattant ----------
  function Automate(i, pilote) {
    this.i = i; this.pilote = pilote; this.w = 16; this.h = 24;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.face = 1; this.visee = 0;
    this.sol = false; this.mur = 0; this.murDir = 0; this.murT = 0; this.verrou = 0; this.coyote = 0; this.tampon = 0; this.traverse = 0; this.passerelle = false;
    this.pv = PV; this.mort = false; this.invul = 0; this.carquois = CARQUOIS; this.cdTir = 0;
    this.rueeT = 0; this.rueeCd = 0; this.rdx = 0; this.rdy = 0; this.pousse = 0;
    this.sautAvant = false; this.rueeAvant = false;
    this.ctl = { mx: 0, saut: false, bas: false, ruee: false, tir: false, visee: 0 };
    this.stats = { tirs: 0, tirsVus: 0, touches: 0, encaisses: 0, presque: 0, esquives: 0, distance: 0, pas: 0 };
  }
  Automate.prototype.cx = function () { return this.x + this.w / 2; };
  Automate.prototype.cy = function () { return this.y + this.h / 2; };

  // ---------- la manche ----------
  // o : { carte, graine, duree (pas), modifs: { vent, mines, lune, subite }, fx (garder les événements pour l'affichage) }
  function Manche(o) {
    o = o || {};
    this.rng = alea(o.graine == null ? (Math.random() * 4294967296) : o.graine);
    this.carte = carte(o.carte) || CARTES[Math.floor(this.rng() * CARTES.length)];
    this.g = this.carte.g;
    this.duree = o.duree || 45 * 60; this.t = 0; this.finie = false; this.vainqueur = null;
    this.modifs = o.modifs || {}; this.fx = !!o.fx; this.evts = [];
    this.autos = []; this.traits = []; this.mines = []; this.vent = 0; this.ventT = 240 + Math.floor(this.rng() * 200);
    this.phy = PHY;
    if (this.modifs.lune) { this.phy = {}; for (var k in PHY) this.phy[k] = PHY[k]; this.phy.gMonte *= 0.5; this.phy.gDescend *= 0.5; this.phy.saut *= 0.82; this.phy.sautMurY *= 0.82; this.phy.chute = 6; }
    this.libres = this.carte.departs.slice();
    if (this.modifs.mines) for (var i = 0; i < 5; i++) this.poserMine();
  }
  Manche.prototype.tuile = function (tx, ty) { return this.g[tour(ty, ROWS) * COLS + tour(tx, COLS)]; };
  Manche.prototype.mur = function (x, y) { return this.tuile(Math.floor(x / T), Math.floor(y / T)) === 1; };
  Manche.prototype.plein = function (x, y, w, h) {
    var x0 = Math.floor(x / T), x1 = Math.floor((x + w - 0.001) / T), y0 = Math.floor(y / T), y1 = Math.floor((y + h - 0.001) / T);
    for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) if (this.tuile(tx, ty) === 1) return true;
    return false;
  };
  Manche.prototype.surPasserelle = function (x, w, ty) {
    var x0 = Math.floor(x / T), x1 = Math.floor((x + w - 0.001) / T);
    for (var tx = x0; tx <= x1; tx++) if (this.tuile(tx, ty) === 2) return true;
    return false;
  };
  // la distance au premier mur dans une direction, de 0 (collé) à 1 (rien jusqu'à « max »)
  Manche.prototype.rayon = function (x, y, dx, dy, max) {
    for (var d = 10; d <= max; d += 10) if (this.mur(x + dx * d, y + dy * d)) return (d - 10) / max;
    return 1;
  };
  Manche.prototype.ligneDeVue = function (a, b) {
    var dx = ecartX(b.cx() - a.cx()), dy = ecartY(b.cy() - a.cy()), n = Math.ceil(Math.hypot(dx, dy) / 10);
    for (var i = 1; i < n; i++) if (this.mur(a.cx() + dx * i / n, a.cy() + dy * i / n)) return false;
    return true;
  };
  // un départ loin des autres
  Manche.prototype.ajouter = function (pilote) {
    var a = new Automate(this.autos.length, pilote), meilleur = 0, note = -1;
    for (var e = 0; e < 4 && this.libres.length; e++) {
      var k = Math.floor(this.rng() * this.libres.length), d = this.libres[k], pres = 1e9;
      for (var j = 0; j < this.autos.length; j++) pres = Math.min(pres, Math.hypot(ecartX(d.x - this.autos[j].cx()), ecartY(d.y - this.autos[j].cy())));
      if (pres > note) { note = pres; meilleur = k; }
    }
    var dep = this.libres.splice(meilleur, 1)[0] || this.carte.departs[0];
    a.x = dep.x - a.w / 2; a.y = dep.y - a.h; a.face = dep.x < LARG / 2 ? 1 : -1; a.visee = a.face > 0 ? 0 : Math.PI;
    if (this.modifs.subite) a.pv = 1;
    this.autos.push(a);
    return a;
  };
  Manche.prototype.vivants = function () { var n = 0; for (var i = 0; i < this.autos.length; i++) if (!this.autos[i].mort) n++; return n; };
  // l'adversaire vivant le plus proche
  Manche.prototype.cible = function (moi) {
    var c = null, m = 1e9;
    for (var i = 0; i < this.autos.length; i++) {
      var a = this.autos[i]; if (a === moi || a.mort) continue;
      var d = Math.hypot(ecartX(a.cx() - moi.cx()), ecartY(a.cy() - moi.cy()));
      if (d < m) { m = d; c = a; }
    }
    return c;
  };
  // ce trait menace-t-il cet automate ? De 0 à 1 : il vient droit dessus, et bientôt
  Manche.prototype.danger = function (tr, a) {
    var rx = ecartX(tr.x - a.cx()), ry = ecartY(tr.y - a.cy()), v2 = tr.vx * tr.vx + tr.vy * tr.vy;
    if (v2 < 1) return 0;
    var tca = -(rx * tr.vx + ry * tr.vy) / v2;
    if (tca < 0 || tca > 45) return 0;
    var rate = Math.hypot(rx + tr.vx * tca, ry + tr.vy * tca + 0.5 * G_TRAIT * tca * tca);
    return rate > 36 ? 0 : (1 - rate / 36) * (1 - tca / 45);
  };
  Manche.prototype.traitHostile = function (a) {          // (le plus menaçant, sinon le plus proche)
    var m = null, note = -1;
    for (var i = 0; i < this.traits.length; i++) {
      var tr = this.traits[i]; if (tr.plante || tr.de === a) continue;
      var d = Math.hypot(ecartX(tr.x - a.cx()), ecartY(tr.y - a.cy())), n = this.danger(tr, a) * 10 + 1 / (1 + d);
      if (n > note) { note = n; m = tr; }
    }
    return m;
  };
  Manche.prototype.evt = function (t, x, y, i, v) { if (this.fx) this.evts.push({ t: t, x: x, y: y, i: i, v: v }); };

  Manche.prototype.poserMine = function () {
    for (var e = 0; e < 40; e++) {
      var tx = 2 + Math.floor(this.rng() * (COLS - 4)), ty = 2 + Math.floor(this.rng() * (ROWS - 4));
      if (this.tuile(tx, ty) === 0 && this.tuile(tx, ty + 1) !== 0) {
        var loin = true, x = tx * T + T / 2, y = (ty + 1) * T - 4;
        for (var j = 0; j < this.autos.length; j++) if (Math.hypot(this.autos[j].cx() - x, this.autos[j].cy() - y) < 90) loin = false;
        for (var k = 0; k < this.carte.departs.length; k++) if (Math.hypot(this.carte.departs[k].x - x, this.carte.departs[k].y - y) < 50) loin = false;
        if (loin) { this.mines.push({ x: x, y: y, meche: 0 }); return; }
      }
    }
  };

  Manche.prototype.blesser = function (a, par, vx, vy) {
    if (a.mort || a.invul > 0 || a.rueeT > 0) return false;
    a.pv--; a.invul = INVUL; a.vx += vx * 0.35; a.vy = Math.min(a.vy, 0) - 2.2; a.stats.encaisses++;
    if (par) par.stats.touches++;
    this.evt('touche', a.cx(), a.cy(), a.i, par ? par.i : -1);
    if (a.pv <= 0) { a.mort = true; this.evt('mort', a.cx(), a.cy(), a.i, par ? par.i : -1); }
    return true;
  };

  Manche.prototype.pasAutomate = function (a) {
    var c = a.ctl, P = this.phy, s = a.stats;
    if (a.invul > 0) a.invul--; if (a.cdTir > 0) a.cdTir--; if (a.rueeCd > 0) a.rueeCd--;
    if (a.carquois < CARQUOIS) a.carquois = Math.min(CARQUOIS, a.carquois + 1 / RECHARGE);
    var appuiSaut = c.saut && !a.sautAvant, appuiRuee = c.ruee && !a.rueeAvant;
    a.sautAvant = c.saut; a.rueeAvant = c.ruee;
    if (appuiSaut) a.tampon = 6; else if (a.tampon > 0) a.tampon--;
    if (a.sol) a.coyote = 6; else if (a.coyote > 0) a.coyote--;
    var mur = 0;
    if (!a.sol) { if (this.plein(a.x - 1, a.y + 3, 1, a.h - 6)) mur = -1; else if (this.plein(a.x + a.w, a.y + 3, 1, a.h - 6)) mur = 1; }
    if (mur) { a.murDir = mur; a.murT = 5; } else if (a.murT > 0) a.murT--;
    a.mur = mur;
    var mx = c.mx > 0.33 ? 1 : c.mx < -0.33 ? -1 : 0;
    if (mx) a.face = mx;
    a.visee = c.visee;
    if (c.bas && a.sol && a.passerelle) a.traverse = 8;                      // (se laisser tomber à travers la passerelle)

    if (appuiRuee && a.rueeCd <= 0 && a.rueeT <= 0) {
      var dx = mx, dy = c.bas ? 1 : (c.saut ? -1 : 0);
      if (!dx && !dy) dx = a.face;
      var n = Math.hypot(dx, dy); a.rdx = dx / n; a.rdy = dy / n; a.rueeT = RUEE_T; a.rueeCd = RUEE_CD;
      this.evt('ruee', a.cx(), a.cy(), a.i);
    }
    if (a.rueeT > 0) {
      a.vx = a.rdx * RUEE_V; a.vy = a.rdy * RUEE_V;
      if (--a.rueeT === 0) { a.vx *= 0.45; a.vy *= 0.45; }
    } else {
      var cible = mx * P.course, acc = a.sol ? (mx ? P.accSol : P.frein) : (mx ? P.accAir : P.freinAir);
      if (a.verrou > 0) { a.verrou--; acc *= 0.3; }
      a.vx = a.vx < cible ? Math.min(a.vx + acc, cible) : Math.max(a.vx - acc, cible);
      if (a.tampon > 0) {
        if (a.sol || a.coyote > 0) { a.vy = P.saut; a.tampon = 0; a.coyote = 0; a.sol = false; this.evt('saut', a.cx(), a.y + a.h, a.i); }
        else if (a.murT > 0) { a.vy = P.sautMurY; a.vx = -a.murDir * P.sautMurX; a.face = -a.murDir; a.tampon = 0; a.murT = 0; a.verrou = 8; this.evt('saut', a.cx() + a.murDir * 8, a.cy(), a.i); }
      }
      if (!c.saut && a.vy < P.sautCoupe) a.vy = P.sautCoupe;                 // (bouton relâché : petit saut)
      a.vy += a.vy < 0 ? P.gMonte : P.gDescend;
      var max = c.bas ? P.chuteVite : P.chute;
      if (mur && a.vy > 0 && mx === mur) max = P.glisse;                     // (glissade le long du mur qu'on pousse)
      if (a.vy > max) a.vy = max;
    }

    var dxm = a.vx + a.pousse; a.pousse = 0;
    a.x += dxm;
    if (dxm && this.plein(a.x, a.y, a.w, a.h)) {
      a.x = dxm > 0 ? Math.floor((a.x + a.w) / T) * T - a.w - 0.01 : (Math.floor(a.x / T) + 1) * T + 0.01;
      a.vx = 0;
    }
    var bas0 = a.y + a.h, chute = a.vy, auSol = a.sol;
    a.y += a.vy; a.sol = false; a.passerelle = false;
    if (a.vy > 0) {
      if (this.plein(a.x, a.y, a.w, a.h)) { a.y = Math.floor((a.y + a.h) / T) * T - a.h; a.vy = 0; a.sol = true; }
      else if (a.traverse > 0) a.traverse--;
      else {
        var ty = Math.floor((a.y + a.h) / T);
        if (bas0 <= ty * T + 0.01 && this.surPasserelle(a.x, a.w, ty)) { a.y = ty * T - a.h; a.vy = 0; a.sol = true; a.passerelle = true; }
      }
      if (a.sol && !auSol && chute > 4) this.evt('pose', a.cx(), a.y + a.h, a.i);
    } else if (a.vy < 0 && this.plein(a.x, a.y, a.w, a.h)) {
      var glisse = false;                                                    // (un coin de plafond frôlé : on glisse à côté)
      for (var d = 1; d <= 5 && !glisse; d++) {
        if (!this.plein(a.x + d, a.y, a.w, a.h)) { a.x += d; glisse = true; } else if (!this.plein(a.x - d, a.y, a.w, a.h)) { a.x -= d; glisse = true; }
      }
      if (!glisse) { a.y = (Math.floor(a.y / T) + 1) * T; a.vy = 0; }
    }
    a.x = tour(a.x, LARG); a.y = tour(a.y, HAUT);
    s.distance += Math.abs(dxm) + Math.abs(chute); s.pas++;

    if (c.tir && a.cdTir <= 0 && a.carquois >= 1) {
      var ax = Math.cos(a.visee), ay = Math.sin(a.visee);
      this.traits.push({ x: a.cx() + ax * 10, y: a.cy() + ay * 10, vx: ax * V_TRAIT + a.vx * 0.25, vy: ay * V_TRAIT + a.vy * 0.15, de: a, vie: VIE_TRAIT, plante: 0, pres: 1e9, qui: null, ang: a.visee });
      a.carquois -= 1; a.cdTir = CD_TIR; a.vx -= ax * 0.6; s.tirs++;
      var ci = this.cible(a); if (ci && this.ligneDeVue(a, ci)) s.tirsVus++;
      this.evt('tir', a.cx(), a.cy(), a.i);
    }
  };

  Manche.prototype.pasTraits = function () {
    for (var i = this.traits.length - 1; i >= 0; i--) {
      var tr = this.traits[i];
      if (tr.plante) { if (--tr.plante <= 0) this.traits.splice(i, 1); continue; }
      tr.vy += G_TRAIT; tr.vx += this.vent * 0.035;
      var fini = false;
      for (var k = 0; k < 2 && !fini; k++) {                                 // (deux demi-pas : un trait ne saute pas par-dessus un automate)
        tr.x = tour(tr.x + tr.vx / 2, LARG); tr.y = tour(tr.y + tr.vy / 2, HAUT);
        if (this.mur(tr.x, tr.y)) { tr.plante = 70; tr.ang = Math.atan2(tr.vy, tr.vx); this.evt('plante', tr.x, tr.y, tr.de.i); fini = true; break; }
        for (var j = 0; j < this.autos.length; j++) {
          var a = this.autos[j]; if (a === tr.de || a.mort) continue;
          var dx = Math.abs(ecartX(tr.x - a.cx())), dy = Math.abs(ecartY(tr.y - a.cy())), d = Math.hypot(dx, dy);
          if (d < tr.pres) { tr.pres = d; tr.qui = a; }
          if (dx < a.w / 2 + 2 && dy < a.h / 2 + 2 && this.blesser(a, tr.de, tr.vx, tr.vy)) { tr.pres = 0; this.traits.splice(i, 1); fini = true; break; }
        }
      }
      if (fini) { if (tr.plante) this.compterRate(tr); continue; }
      if (--tr.vie <= 0) { this.compterRate(tr); this.traits.splice(i, 1); }
    }
  };
  // un trait passé tout près sans toucher : un « presque » pour le tireur, une esquive pour l'autre
  Manche.prototype.compterRate = function (tr) {
    if (tr.pres > 0 && tr.pres < 30 && tr.qui) { tr.de.stats.presque++; tr.qui.stats.esquives++; }
    tr.pres = 0;
  };

  Manche.prototype.pasAleas = function () {
    var i, j, a;
    if (this.modifs.vent) {
      if (--this.ventT <= 0) {
        if (this.vent) { this.vent = 0; this.ventT = 260 + Math.floor(this.rng() * 240); }
        else { this.vent = this.rng() < 0.5 ? -1 : 1; this.ventT = 170; this.evt('vent', 0, 0, -1, this.vent); }
      }
      if (this.vent) for (i = 0; i < this.autos.length; i++) this.autos[i].pousse += this.vent * (this.autos[i].sol ? 0.7 : 1.2);
    }
    for (i = this.mines.length - 1; i >= 0; i--) {
      var m = this.mines[i];
      if (!m.meche) { for (j = 0; j < this.autos.length; j++) { a = this.autos[j]; if (!a.mort && Math.hypot(ecartX(a.cx() - m.x), ecartY(a.cy() - m.y)) < 30) { m.meche = 32; this.evt('meche', m.x, m.y, -1); break; } } }
      else if (--m.meche <= 0) {
        for (j = 0; j < this.autos.length; j++) { a = this.autos[j]; var dx = ecartX(a.cx() - m.x), dy = ecartY(a.cy() - m.y); if (Math.hypot(dx, dy) < 50) this.blesser(a, null, dx > 0 ? 8 : -8, 0); }
        this.evt('boum', m.x, m.y, -1); this.mines.splice(i, 1); this.poserMine();
      }
    }
  };

  Manche.prototype.pas = function () {
    if (this.finie) return;
    var i, a;
    for (i = 0; i < this.autos.length; i++) { a = this.autos[i]; if (!a.mort && a.pilote) a.pilote.decider(this, a); }
    for (i = 0; i < this.autos.length; i++) { a = this.autos[i]; if (!a.mort) this.pasAutomate(a); }
    this.pasTraits(); this.pasAleas();
    this.t++;
    var v = this.vivants();
    if (v <= 1 || this.t >= this.duree) {
      this.finie = true;
      var mieux = -1, egal = false;
      for (i = 0; i < this.autos.length; i++) { a = this.autos[i]; if (a.mort) continue; if (a.pv > mieux) { mieux = a.pv; this.vainqueur = a; egal = false; } else if (a.pv === mieux) egal = true; }
      if (egal) this.vainqueur = null;
      for (i = 0; i < this.traits.length; i++) this.compterRate(this.traits[i]);
    }
  };

  // ---------- le réseau ----------
  // 31 entrées → 20 → 14 → 10 sorties, en tanh. Quatre sorties reviennent en entrée au pas suivant : c'est sa mémoire.
  // Le cerveau voit le monde « face à sa cible » (les x sont retournés quand elle est à gauche) : ce qu'il apprend d'un côté vaut de l'autre.
  var FORME = [31, 20, 14, 10], MEM = 4, NB_POIDS = 0, FORMAT = 'na-1';
  for (var f = 1; f < FORME.length; f++) NB_POIDS += (FORME[f - 1] + 1) * FORME[f];
  var ENTREES = ['écart x', 'écart y', 'distance', 'ma vitesse x', 'ma vitesse y', 'sa vitesse x', 'sa vitesse y', 'au sol', 'contre un mur', 'carquois', 'ruée prête',
    'ligne de vue', 'trait x', 'trait y', 'trait vx', 'trait vy', 'danger', 'mur devant', 'mur derrière', 'plafond', 'vide dessous', 'sol devant', 'sol derrière',
    'cible intouchable', 'avance aux points', 'temps', 'biais', 'mémoire 1', 'mémoire 2', 'mémoire 3', 'mémoire 4'];
  var SORTIES = ['avancer', 'sauter', 'descendre', 'ruée', 'tirer', 'lever la visée'];
  function poidsNeufs(rng) {
    var p = new Float32Array(NB_POIDS), k = 0;
    for (var c = 1; c < FORME.length; c++) {
      var n = FORME[c - 1], e = Math.sqrt(1 / n);
      for (var j = 0; j < FORME[c]; j++) { for (var i = 0; i < n; i++) p[k++] = gauss(rng) * e; p[k++] = 0; }
    }
    return p;
  }
  function Reseau(poids) {
    this.p = poids;
    this.a = FORME.map(function (n) { return new Float32Array(n); });
  }
  Reseau.prototype.oublier = function () { for (var i = 0; i < MEM; i++) this.a[0][FORME[0] - MEM + i] = 0; };
  Reseau.prototype.avancer = function () {                // (les entrées sont déjà dans this.a[0])
    var p = this.p, k = 0;
    for (var c = 1; c < FORME.length; c++) {
      var x = this.a[c - 1], y = this.a[c], n = x.length;
      for (var j = 0; j < y.length; j++) { var s = 0; for (var i = 0; i < n; i++) s += p[k++] * x[i]; y[j] = Math.tanh(s + p[k++]); }
    }
    var out = this.a[FORME.length - 1], e = this.a[0];
    for (var m = 0; m < MEM; m++) e[FORME[0] - MEM + m] = out[FORME[FORME.length - 1] - MEM + m];
    return out;
  };
  function versTexte(p) {
    var o = new Uint8Array(p.buffer, p.byteOffset, p.byteLength), s = '';
    for (var i = 0; i < o.length; i += 4096) s += String.fromCharCode.apply(null, o.subarray(i, i + 4096));
    return btoa(s);
  }
  function depuisTexte(t) {                               // (rend null si ce n'est pas un cerveau de la bonne forme)
    try {
      if (typeof t !== 'string' || t.length > 20000) return null;
      var s = atob(t); if (s.length !== NB_POIDS * 4) return null;
      var o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
      var p = new Float32Array(o.buffer);
      for (var j = 0; j < p.length; j++) if (!isFinite(p[j]) || Math.abs(p[j]) > 1e3) return null;
      return p;
    } catch (e) { return null; }
  }

  // ---------- les pilotes ----------
  function PiloteCerveau(poids) { this.r = new Reseau(poids); this.bascule = false; this.s = 1; this.vu = null; }
  PiloteCerveau.prototype.genre = 'cerveau';
  PiloteCerveau.prototype.percevoir = function (m, moi, ci) {
    var e = this.r.a[0], dx = ecartX(ci.cx() - moi.cx()), dy = ecartY(ci.cy() - moi.cy()), s = dx >= 0 ? 1 : -1, x = moi.cx(), y = moi.cy();
    this.s = s;
    e[0] = Math.abs(dx) / 400; e[1] = dy / 240; e[2] = Math.min(1, Math.hypot(dx, dy) / 450);
    e[3] = moi.vx * s / PHY.course; e[4] = moi.vy / 9; e[5] = ci.vx * s / PHY.course; e[6] = ci.vy / 9;
    e[7] = moi.sol ? 1 : 0; e[8] = moi.mur * s; e[9] = moi.carquois / CARQUOIS; e[10] = moi.rueeCd <= 0 ? 1 : 0;
    e[11] = m.ligneDeVue(moi, ci) ? 1 : 0;
    var tr = m.traitHostile(moi);
    if (tr) { e[12] = borne(ecartX(tr.x - x) * s / 200, -1, 1); e[13] = borne(ecartY(tr.y - y) / 200, -1, 1); e[14] = tr.vx * s / V_TRAIT; e[15] = tr.vy / V_TRAIT; e[16] = m.danger(tr, moi); }
    else { e[12] = 0; e[13] = 0; e[14] = 0; e[15] = 0; e[16] = 0; }
    e[17] = m.rayon(x, y, s, 0, 160); e[18] = m.rayon(x, y, -s, 0, 160); e[19] = m.rayon(x, y, 0, -1, 160); e[20] = m.rayon(x, y, 0, 1, 240);
    e[21] = m.rayon(x, y, s * 0.707, 0.707, 200); e[22] = m.rayon(x, y, -s * 0.707, 0.707, 200);
    e[23] = (ci.invul > 0 || ci.rueeT > 0) ? 1 : 0; e[24] = (moi.pv - ci.pv) / PV; e[25] = m.t / m.duree; e[26] = 1;
  };
  PiloteCerveau.prototype.decider = function (m, moi) {
    if ((m.t + moi.i) % PAS_IA) return;
    var ci = m.cible(moi), c = moi.ctl; if (!ci) return;
    this.percevoir(m, moi, ci);
    var o = this.r.avancer(), s = this.s;
    c.mx = o[0] > 0.33 ? s : o[0] < -0.33 ? -s : 0;
    // maintenir « sauter » au sol ou contre un mur rappuie : le cerveau n'a pas à apprendre à relâcher
    c.saut = o[1] > 0 && ((moi.sol || moi.murT > 0) ? (this.bascule = !this.bascule) : true);
    c.bas = o[2] > 0.5; c.ruee = o[3] > 0.5; c.tir = o[4] > 0;
    c.visee = Math.atan2(ecartY(ci.cy() - moi.cy()), ecartX(ci.cx() - moi.cx())) - s * o[5] * 0.7;
  };

  // Les automates d'atelier : quatre niveaux, du plus rouillé au plus affûté.
  var NIVEAUX = [null,
    { nom: 'Rouille', titre: 'le grippé', elo: 900, reac: 22, bruit: 0.38, avance: 0, chute: 0.3, cadence: 60, esquive: 0, ruee: 0, ligne: 0, dist: 260 },
    { nom: 'Cliquet', titre: 'l\'appliqué', elo: 1150, reac: 14, bruit: 0.17, avance: 0, chute: 1, cadence: 36, esquive: 0.3, ruee: 0, ligne: 0.5, dist: 230 },
    { nom: 'Mèche', titre: 'la traqueuse', elo: 1400, reac: 8, bruit: 0.08, avance: 0.7, chute: 1, cadence: 22, esquive: 0.65, ruee: 0.5, ligne: 1, dist: 210 },
    { nom: 'Zénith', titre: 'le sans-faute', elo: 1650, reac: 4, bruit: 0.03, avance: 1, chute: 1, cadence: 14, esquive: 0.92, ruee: 0.8, ligne: 1, dist: 190 }];
  function PiloteAuto(niveau, rng) {
    this.niveau = borne(niveau | 0, 1, 4); this.N = NIVEAUX[this.niveau]; this.rng = rng || Math.random;
    this.attente = 0; this.mx = 0; this.cote = 1; this.sautT = 0; this.cd = 20; this.peut = false; this.bas = 0; this.rueeT = 0; this.vus = [];
    this.visee = 0;
  }
  PiloteAuto.prototype.genre = 'auto';
  PiloteAuto.prototype.decider = function (m, moi) {
    var N = this.N, r = this.rng, c = moi.ctl, ci = m.cible(moi); if (!ci) return;
    var dx = ecartX(ci.cx() - moi.cx()), dy = ecartY(ci.cy() - moi.cy()), dist = Math.hypot(dx, dy), s = dx >= 0 ? 1 : -1, saut = false;
    if (--this.attente <= 0) {
      this.attente = N.reac * (0.7 + r() * 0.6);
      if (r() < 0.08) this.cote = -this.cote;
      this.mx = dist > N.dist + 50 ? s : dist < N.dist - 70 ? -s : (r() < 0.6 ? this.cote : 0);
      var vue = m.ligneDeVue(moi, ci);
      if (!vue) this.mx = r() < 0.75 ? s : -s;
      if (moi.sol) {
        if (dy < -50 && r() < 0.5) saut = true;
        if (this.mx && m.rayon(moi.cx(), moi.cy(), this.mx, 0, 160) < 0.13) saut = true;
        if (r() < 0.03 * this.niveau) saut = true;
        if (dy > 60 && moi.passerelle && r() < 0.5) this.bas = 6;
      } else if (moi.mur && r() < 0.6) saut = true;
      var t = dist / V_TRAIT, px = dx + ci.vx * t * N.avance, py = dy + ci.vy * t * N.avance * 0.4 - 0.5 * G_TRAIT * t * t * N.chute;
      this.visee = Math.atan2(py, px) + gauss(r) * N.bruit;
      this.peut = vue || r() > N.ligne;
    }
    // l'esquive : chaque trait menaçant est jugé une seule fois
    var tr = m.traitHostile(moi);
    if (tr && this.vus.indexOf(tr) < 0 && m.danger(tr, moi) > 0.35) {
      this.vus.push(tr); if (this.vus.length > 8) this.vus.shift();
      if (r() < N.esquive) { if (r() < N.ruee && moi.rueeCd <= 0) { this.rueeT = 2; saut = true; } else saut = true; }
    }
    if (saut && this.sautT <= 0) this.sautT = 12;
    c.mx = this.mx; c.saut = this.sautT > 1; if (this.sautT > 0) this.sautT--;
    c.bas = this.bas > 0; if (this.bas > 0) this.bas--;
    c.ruee = this.rueeT > 0; if (this.rueeT > 0) this.rueeT--;
    c.visee = this.visee;
    c.tir = false;
    if (--this.cd <= 0 && this.peut && moi.carquois >= 1) { c.tir = true; this.cd = N.cadence * (0.7 + r() * 0.6); }
  };

  function PiloteHumain() { this.e = { mx: 0, saut: false, bas: false, ruee: false, tir: false, visee: 0 }; }
  PiloteHumain.prototype.genre = 'humain';
  PiloteHumain.prototype.decider = function (m, moi) { var c = moi.ctl, e = this.e; c.mx = e.mx; c.saut = e.saut; c.bas = e.bas; c.ruee = e.ruee; c.tir = e.tir; c.visee = e.visee; };

  // ---------- le dressage ----------
  // Ce que vaut une manche pour un cerveau. Le « foyer » déplace l'accent : ce que le dresseur veut voir grandir.
  var FOYERS = {
    equilibre: { nom: 'Équilibré', touche: 30, encaisse: 20, gagne: 30, presque: 3, esquive: 2, rate: 0 },
    precision: { nom: 'Précision', touche: 36, encaisse: 16, gagne: 24, presque: 4, esquive: 1, rate: 1.5 },
    esquive: { nom: 'Esquive', touche: 22, encaisse: 32, gagne: 26, presque: 2, esquive: 5, rate: 0 },
    assaut: { nom: 'Assaut', touche: 42, encaisse: 14, gagne: 36, presque: 4, esquive: 1, rate: 0 }
  };
  function noter(m, a, foyer) {
    var F = FOYERS[foyer] || FOYERS.equilibre, s = a.stats, n = F.touche * s.touches - F.encaisse * s.encaisses;
    if (m.vainqueur === a) n += F.gagne + 10 * a.pv / PV + 8 * (1 - m.t / m.duree); else if (m.vainqueur) n -= 10;
    n += F.presque * Math.min(s.presque, 6) + F.esquive * Math.min(s.esquives, 6) + 0.4 * Math.min(s.tirsVus, 15);
    n -= F.rate * Math.max(0, s.tirs - s.touches - s.presque);
    if (s.distance < 200) n -= 8;                                            // (planté sur place : non)
    return n;
  }
  // Un cerveau contre un automate, sur plusieurs manches. Les graines fixent tout le hasard : deux cerveaux jugés sur les mêmes
  // graines ont eu exactement les mêmes manches en face.
  // « rivaux » (facultatif) : d'autres cerveaux, { poids, elo }. Une manche sur deux se joue alors contre l'un d'eux.
  function evaluer(poids, graines, niveau, foyer, duree, rivaux) {
    var note = 0, gagne = 0, nul = 0, duels = [], tot = { tirs: 0, touches: 0, encaisses: 0, presque: 0, esquives: 0, distance: 0, pas: 0, pv: 0 };
    for (var i = 0; i < graines.length; i++) {
      var m = new Manche({ graine: graines[i], duree: duree || 1800 }), niv = niveau, tirage = m.rng(), choix = m.rng(), rival = null;
      if (niveau > 1 && tirage < 0.25) niv = niveau - 1;
      if (rivaux && rivaux.length && i % 2) rival = rivaux[Math.floor(choix * rivaux.length)];
      var a = m.ajouter(new PiloteCerveau(poids));
      m.ajouter(rival ? new PiloteCerveau(rival.poids) : new PiloteAuto(niv, alea(graines[i] ^ 0x9e3779b9)));
      while (!m.finie) m.pas();
      note += noter(m, a, foyer);
      var score = m.vainqueur === a ? 1 : m.vainqueur ? 0 : 0.5;
      if (score === 1) gagne++; else if (score === 0.5) nul++;
      duels.push({ elo: rival ? rival.elo : NIVEAUX[niv].elo, score: score, rival: !!rival });
      for (var k in tot) if (k !== 'pv') tot[k] += a.stats[k];
      tot.pv += Math.max(0, a.pv);
    }
    return { note: note / graines.length, gagne: gagne, nul: nul, manches: graines.length, stats: tot, duels: duels };
  }
  // le profil d'un cerveau, cinq notes de 0 à 1, tiré de ce qu'il a fait pendant ses manches
  function profil(e) {
    var s = e.stats, min = s.pas / 3600;
    return {
      precision: s.tirs ? borne(s.touches / s.tirs * 2.5, 0, 1) : 0,
      esquive: (s.esquives + s.encaisses) ? s.esquives / (s.esquives + s.encaisses) : 0.5,
      assaut: borne(s.tirs / Math.max(min, 0.01) / 75, 0, 1),
      survie: s.pv / (PV * e.manches),
      mobilite: borne(s.distance / Math.max(s.pas, 1) / 8, 0, 1)
    };
  }
  function eloAttendu(a, b) { return 1 / (1 + Math.pow(10, (b - a) / 400)); }

  // Le dresseur : une stratégie d'évolution. À chaque génération, il essaie des variantes du cerveau (par paires opposées),
  // les fait toutes jouer les mêmes manches, et déplace le cerveau vers la moyenne pondérée des meilleures.
  // o : { poids, sigma, niveau, auto (monter de niveau tout seul), foyer, elo, generation, graine }
  function Dresseur(o) {
    this.theta = new Float32Array(o.poids); this.sigma = o.sigma || 0.05; this.niveau = borne(o.niveau || 1, 1, 4); this.auto = o.auto !== false;
    this.foyer = o.foyer || 'equilibre'; this.elo = o.elo || 1000; this.generation = o.generation || 0;
    this.rng = alea(o.graine == null ? Math.random() * 4294967296 : o.graine);
    // (réglé aux essais : un pas d'exploration petit et huit manches par variante apprennent plus sûrement qu'un grand pas sur quatre)
    this.n = o.n || 20; this.manches = o.manches || 8; this.sMax = o.sMax || 0.05; this.seuil = o.seuil || 0.4; this.recents = [];
    // La ligue : une manche sur deux contre d'autres cerveaux. « rivaux » vient du dehors (les autres cerveaux du joueur, ceux de la
    // communauté) ; « anciens » sont ses propres versions passées, une toutes les huit générations, les six dernières. S'entraîner
    // contre soi-même et contre d'autres force à couvrir ses failles, au lieu d'apprendre un automate par cœur.
    this.ligue = !!o.ligue; this.rivaux = (o.rivaux || []).filter(function (x) { return x && x.poids && x.poids.length === NB_POIDS; }); this.anciens = [];
    if (this.ligue) this.anciens.push({ poids: new Float32Array(this.theta), elo: this.elo });
  }
  Dresseur.prototype.generer = function () {
    var d = this.theta.length, n = this.n, r = this.rng, graines = [], i, j, k;
    for (i = 0; i < this.manches; i++) graines.push(Math.floor(r() * 4294967296));
    var bassin = this.ligue ? this.rivaux.concat(this.anciens) : null;
    var centre = evaluer(this.theta, graines, this.niveau, this.foyer, 0, bassin), essais = [], cand = new Float32Array(d);
    for (i = 0; i < n / 2; i++) {
      var eps = new Float32Array(d);
      for (j = 0; j < d; j++) eps[j] = gauss(r);
      for (k = 1; k >= -1; k -= 2) {
        for (j = 0; j < d; j++) cand[j] = this.theta[j] + k * this.sigma * eps[j];
        essais.push({ eps: eps, signe: k, note: evaluer(cand, graines, this.niveau, this.foyer, 0, bassin).note });
      }
    }
    essais.sort(function (a, b) { return b.note - a.note; });
    var mu = Math.floor(n / 4), w = [], somme = 0, mieux = 0;
    for (i = 0; i < mu; i++) { w.push(Math.log(mu + 0.5) - Math.log(i + 1)); somme += w[i]; }
    for (i = 0; i < n; i++) if (essais[i].note > centre.note) mieux++;
    for (i = 0; i < mu; i++) {
      var pas = w[i] / somme * this.sigma * essais[i].signe, e = essais[i].eps;
      for (j = 0; j < d; j++) this.theta[j] += pas * e[j];
    }
    for (j = 0; j < d; j++) this.theta[j] *= 0.9995;                          // (une légère pente vers zéro : les poids ne s'emballent pas)
    this.sigma = borne(this.sigma * (mieux / n > this.seuil ? 1.08 : 0.94), 0.02, this.sMax);
    this.generation++;
    // le classement : chaque manche compte comme une partie, contre le classement de celui d'en face
    var score = 0, autos = 0, gAutos = 0, nRivaux = 0, gRivaux = 0, delta = 0;
    for (i = 0; i < centre.duels.length; i++) {
      var du = centre.duels[i]; score += du.score; delta += du.score - eloAttendu(this.elo, du.elo);
      if (du.rival) { nRivaux++; gRivaux += du.score; } else { autos++; gAutos += du.score; }
    }
    this.elo = Math.round(borne(this.elo + 10 * delta, 400, 3000));
    if (this.ligue && this.generation % 8 === 0) { this.anciens.push({ poids: new Float32Array(this.theta), elo: this.elo }); if (this.anciens.length > 6) this.anciens.shift(); }
    // monter de niveau ne dépend que des manches contre l'automate
    this.recents.push(gAutos / Math.max(autos, 1)); if (this.recents.length > 6) this.recents.shift();
    var monte = false;
    if (this.auto && this.niveau < 4 && this.recents.length >= 6) {
      var moy = 0; for (i = 0; i < this.recents.length; i++) moy += this.recents[i];
      if (moy / this.recents.length >= 0.7) { this.niveau++; this.recents = []; monte = true; }
    }
    return { generation: this.generation, note: centre.note, meilleure: essais[0].note, taux: score / centre.manches, tauxRivaux: nRivaux ? gRivaux / nRivaux : null, elo: this.elo,
      niveau: this.niveau, monte: monte, sigma: this.sigma, profil: profil(centre) };
  };
  // la couvée : parmi des cerveaux tirés au hasard, garder celui qui se débrouille le moins mal
  function couver(graine, nombre) {
    var r = alea(graine == null ? Math.random() * 4294967296 : graine), graines = [r() * 4294967296 >>> 0, r() * 4294967296 >>> 0, r() * 4294967296 >>> 0], mieux = null, note = -1e9;
    for (var i = 0; i < (nombre || 30); i++) {
      var p = poidsNeufs(r), e = evaluer(p, graines, 1, 'equilibre', 1200);
      if (e.note > note) { note = e.note; mieux = p; }
    }
    return mieux;
  }

  racine.NA = {
    T: T, COLS: COLS, ROWS: ROWS, LARG: LARG, HAUT: HAUT, PV: PV, CARQUOIS: CARQUOIS, RUEE_CD: RUEE_CD, INVUL: INVUL, PHY: PHY,
    CARTES: CARTES, carte: carte, NIVEAUX: NIVEAUX, FOYERS: FOYERS, FORME: FORME, NB_POIDS: NB_POIDS, FORMAT: FORMAT, ENTREES: ENTREES, SORTIES: SORTIES,
    alea: alea, gauss: gauss, borne: borne, ecartX: ecartX, ecartY: ecartY,
    Manche: Manche, Reseau: Reseau, PiloteCerveau: PiloteCerveau, PiloteAuto: PiloteAuto, PiloteHumain: PiloteHumain,
    poidsNeufs: poidsNeufs, versTexte: versTexte, depuisTexte: depuisTexte, evaluer: evaluer, profil: profil, noter: noter, Dresseur: Dresseur, couver: couver
  };
})(typeof self !== 'undefined' ? self : globalThis);
