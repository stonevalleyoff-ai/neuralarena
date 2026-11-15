// Neural Arena — LE WORKER DE DRESSAGE (train-worker.js)
// Le dressage tourne ici, hors de la page, à pleine vitesse : la page reste fluide et montre un combat pendant ce temps.
//   reçoit  { type: 'couver', id }            → rend { type: 'couvee', id, poids }
//           { type: 'dresser', opts }          → rend { type: 'gen', … , poids } à chaque génération
//           { type: 'arret' }                  → rend { type: 'arrete' }
importScripts('sim.js');
var dresseur = null, tour = 0;
function boucle(mien) {
  if (mien !== tour || !dresseur) return;
  var r = dresseur.generer();
  r.type = 'gen'; r.poids = dresseur.theta.slice();
  postMessage(r);
  setTimeout(function () { boucle(mien); }, 0);      // (rend la main : un « arret » peut passer)
}
onmessage = function (e) {
  var m = e.data || {};
  if (m.type === 'couver') postMessage({ type: 'couvee', id: m.id, poids: NA.couver(null, 30) });
  else if (m.type === 'dresser') { dresseur = new NA.Dresseur(m.opts); boucle(++tour); }
  else if (m.type === 'arret') { tour++; dresseur = null; postMessage({ type: 'arrete' }); }
};
