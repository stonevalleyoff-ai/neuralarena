// Neural Arena — un faux service de comptes et de cerveaux, pour les essais sur sa machine :  node outils/faux-service.js [port]
// Il imite ce que le jeu demande à Supabase (connexion, renouvellement, les fonctions na_…), en mémoire. Un seul compte : essai@exemple.fr / motdepasse.
// On l'indique au jeu une fois dans l'adresse :  http://127.0.0.1:8000/?service=http://127.0.0.1:8787
var http = require('http'), port = +process.argv[2] || 8787;
var comptes = { 'essai@exemple.fr': { id: '11111111-1111-4111-8111-111111111111', mdp: 'motdepasse', pseudo: 'Essai' }, 'autre@exemple.fr': { id: '22222222-2222-4222-8222-222222222222', mdp: 'motdepasse', pseudo: 'Autre' } };
var jetons = {}, cerveaux = {}, n = 0;
function session(email) { var c = comptes[email], j = 'jeton-' + (++n); jetons[j] = c.id; return { access_token: j, refresh_token: 'r-' + email, expires_in: 3600, user: { id: c.id, email: email, user_metadata: { pseudo: c.pseudo } } }; }
function pseudo(id) { for (var e in comptes) if (comptes[e].id === id) return comptes[e].pseudo; return 'Anonyme'; }
http.createServer(function (q, r) {
  var corps = '';
  q.on('data', function (d) { corps += d; });
  q.on('end', function () {
    function rendre(code, o) { r.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }); r.end(o === undefined ? '' : JSON.stringify(o)); }
    if (q.method === 'OPTIONS') return rendre(204);
    var d = {}; try { d = corps ? JSON.parse(corps) : {}; } catch (e) { d = {}; }
    var moi = jetons[(q.headers.authorization || '').replace('Bearer ', '')] || null, u = q.url;
    if (u.indexOf('/auth/v1/token?grant_type=password') === 0) { var c = comptes[d.email]; return c && c.mdp === d.password ? rendre(200, session(d.email)) : rendre(400, { error_code: 'invalid_credentials' }); }
    if (u.indexOf('/auth/v1/token?grant_type=refresh_token') === 0) { var e = String(d.refresh_token || '').slice(2); return comptes[e] ? rendre(200, session(e)) : rendre(400, {}); }
    if (u.indexOf('/auth/v1/logout') === 0) return rendre(204);
    var f = (u.match(/^\/rest\/v1\/rpc\/(\w+)/) || [])[1];
    function refus(m) { rendre(400, { code: 'P0001', message: m }); }
    function miens() { return Object.keys(cerveaux).map(function (k) { return cerveaux[k]; }).filter(function (x) { return x.utilisateur === moi; }); }
    if (f === 'na_classement') return rendre(200, Object.keys(cerveaux).map(function (k) { return cerveaux[k]; }).filter(function (x) { return x.public; }).sort(function (a, b) { return b.elo - a.elo; })
      .map(function (x) { return { id: x.id, nom: x.nom, elo: x.elo, generation: x.generation, profil: x.stats.profil, auteur: pseudo(x.utilisateur), a_moi: x.utilisateur === moi }; }));
    if (f === 'na_prendre') { var x = cerveaux[d.id]; return rendre(200, x && (x.public || x.utilisateur === moi) ? { id: x.id, nom: x.nom, format: x.format, poids: x.poids, elo: x.elo, generation: x.generation, profil: x.stats.profil, auteur: pseudo(x.utilisateur) } : null); }
    if (!f) return rendre(404, {});
    if (!moi) return refus('compte requis');
    if (f === 'na_mes_cerveaux') return rendre(200, miens());
    if (f === 'na_garder') {
      var b = d.cerveau || {}, la = cerveaux[b.id];
      if (la && la.utilisateur !== moi) return refus('ce cerveau appartient à un autre compte');
      if (!la && miens().length >= 12) return refus('douze cerveaux au plus par compte');
      cerveaux[b.id] = { id: b.id, utilisateur: moi, nom: b.nom, format: b.format, poids: b.poids, elo: b.elo, generation: b.generation, stats: b.stats || {}, public: !!b.public, maj_le: new Date().toISOString() };
      return rendre(200, { id: b.id });
    }
    if (f === 'na_oublier') { var y = cerveaux[d.id]; if (y && y.utilisateur === moi) delete cerveaux[d.id]; return rendre(200, { supprime: y ? 1 : 0 }); }
    rendre(404, { code: 'PGRST202' });
  });
}).listen(port, '127.0.0.1', function () { console.log('faux service sur http://127.0.0.1:' + port); });
