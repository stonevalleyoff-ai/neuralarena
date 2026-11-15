// Neural Arena — les essais du cœur de simulation, sous Node :  node outils/essai.js [générations]
// Vérifie les cartes, fait s'affronter les automates d'atelier, puis dresse un cerveau et regarde s'il apprend.
require('../sim.js');
var NA = globalThis.NA, rate = 0;
function verifier(c, texte) { if (!c) { rate++; console.log('  RATÉ : ' + texte); } }

NA.CARTES.forEach(function (c) {
  var m = new NA.Manche({ carte: c.id, graine: 1 });
  verifier(c.departs.length >= 4, c.id + ' : assez de départs');
  c.departs.forEach(function (d) {
    var tx = Math.floor(d.x / NA.T), ty = d.y / NA.T;
    verifier(m.tuile(tx, ty) !== 0, c.id + ' : un sol sous le départ ' + tx + ',' + (ty - 1));
    verifier(m.tuile(tx, ty - 1) === 0 && m.tuile(tx, ty - 2) === 0, c.id + ' : la place de tenir debout en ' + tx + ',' + (ty - 1));
  });
  for (var x = 0; x < NA.COLS; x++) verifier(m.tuile(x, 0) === m.tuile(x, NA.ROWS - 1), c.id + ' : haut et bas alignés, colonne ' + x);
});

function duel(a, b, n) {
  var g = 0, nul = 0, pas = 0;
  for (var i = 0; i < n; i++) {
    var m = new NA.Manche({ graine: 1000 + i });
    var x = m.ajouter(new NA.PiloteAuto(a, NA.alea(i * 7 + 1))); m.ajouter(new NA.PiloteAuto(b, NA.alea(i * 13 + 5)));
    while (!m.finie) m.pas();
    pas += m.t; if (m.vainqueur === x) g++; else if (!m.vainqueur) nul++;
    m.autos.forEach(function (o) { verifier(isFinite(o.x) && isFinite(o.y) && o.x >= 0 && o.x < NA.LARG && o.y >= 0 && o.y < NA.HAUT, 'un automate sorti du monde'); verifier(o.mort || !m.plein(o.x, o.y, o.w, o.h), 'un automate dans un mur'); });
  }
  return { g: g, nul: nul, duree: Math.round(pas / n / 60) };
}
var t0 = Date.now();
[[2, 1], [3, 2], [4, 3], [4, 1]].forEach(function (p) {
  var r = duel(p[0], p[1], 60);
  console.log('niveau ' + p[0] + ' contre ' + p[1] + ' : ' + r.g + ' victoires, ' + r.nul + ' nuls sur 60 (manche moyenne ' + r.duree + ' s)');
  verifier(r.g > 60 - r.g - r.nul, 'le niveau ' + p[0] + ' bat le niveau ' + p[1]);
});
console.log('  (' + (Date.now() - t0) + ' ms)');

// une manche se rejoue à l'identique
function trace(g) { var m = new NA.Manche({ graine: g }); m.ajouter(new NA.PiloteAuto(3, NA.alea(1))); m.ajouter(new NA.PiloteAuto(4, NA.alea(2))); while (!m.finie) m.pas(); return m.t + ':' + m.autos.map(function (a) { return a.x.toFixed(3) + ',' + a.pv; }).join(';'); }
verifier(trace(42) === trace(42), 'même graine, même manche');
var p0 = NA.poidsNeufs(NA.alea(3)), p1 = NA.depuisTexte(NA.versTexte(p0));
verifier(p1 && p1.length === NA.NB_POIDS && p1[17] === p0[17], 'un cerveau survit à l\'aller-retour en texte');
verifier(NA.depuisTexte('abc') === null && NA.depuisTexte(null) === null, 'un texte quelconque n\'est pas un cerveau');

var gens = +process.argv[2] || 40;
t0 = Date.now();
var d = new NA.Dresseur({ poids: NA.couver(7, 30), graine: 11 });
console.log('couvée : ' + (Date.now() - t0) + ' ms');
t0 = Date.now();
var debut = 0, fin = 0;
for (var i = 0; i < gens; i++) {
  var r = d.generer();
  if (i < 5) debut += r.note; if (i >= gens - 5) fin += r.note;
  if (i % 5 === 4 || r.monte) console.log('gén. ' + r.generation + '  note ' + r.note.toFixed(1) + '  taux ' + r.taux.toFixed(2) + '  elo ' + r.elo + '  niveau ' + r.niveau + (r.monte ? ' ↑' : '') + '  σ ' + r.sigma.toFixed(3));
}
console.log(gens + ' générations : ' + ((Date.now() - t0) / gens).toFixed(0) + ' ms chacune ; note moyenne ' + (debut / 5).toFixed(1) + ' → ' + (fin / 5).toFixed(1));
console.log(rate ? rate + ' essai(s) raté(s)' : 'tout va bien');
process.exit(rate ? 1 : 0);
