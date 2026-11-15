// Neural Arena — LE COMPTE (compte.js)
// Le compte StoneValley : le projet Supabase « Vallée de pierre », le même que le portail et les autres jeux. La clé ci-dessous est
// sa clé publique, faite pour être dans une page : elle n'ouvre rien sans le mot de passe de quelqu'un.
// La session suit la règle commune du site : gardée sous « stonevalley:session », de forme { jeton, refresh, exp, uid, email, pseudo }.
// Servi à la même adresse que le portail, le jeu partage donc sa connexion. Un jeton de renouvellement ne sert qu'une fois : avant
// de renouveler, on relit la clé, et si un autre vient de le faire on prend sa session. Le mot de passe n'est gardé nulle part.
(function () {
  'use strict';
  var SERVICE = 'https://ldazucyrnpewkqdneznc.supabase.co';
  var CLE = 'sb_publishable_qUrfgAsAUzc3jd_tiqkY9g_EVkkQRAs';
  var STOCKAGE = 'stonevalley:session';
  // (sur sa propre machine seulement, pour les essais : un autre service, donné une fois dans l'adresse, tenu le temps de l'onglet)
  if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
    var autre = new URLSearchParams(location.search).get('service');
    try { if (autre) sessionStorage.setItem('sv:service', autre); else autre = sessionStorage.getItem('sv:service'); } catch (e) { /* l'adresse seule */ }
    if (autre) SERVICE = autre;
  }

  var S = null, ecouteurs = [], renouvellement = null;
  function gardee() { try { var s = JSON.parse(localStorage.getItem(STOCKAGE) || 'null'); return s && s.jeton && s.uid ? s : null; } catch (e) { return null; } }
  function ecrire() { try { if (S) localStorage.setItem(STOCKAGE, JSON.stringify(S)); else localStorage.removeItem(STOCKAGE); } catch (e) { /* la session ne tiendra que cette page */ } }
  function change() { ecouteurs.forEach(function (f) { f(S); }); }
  function renouveleeAilleurs() {
    var g = gardee();
    if (!S || !g || g.uid !== S.uid || !g.refresh || g.refresh === S.refresh || !(g.exp > Date.now() + 60000)) return false;
    S = g; return true;
  }
  function prendre(r) {
    if (!r || !r.access_token) return false;
    var u = r.user || {}, meta = u.user_metadata || {};
    S = { jeton: r.access_token, refresh: r.refresh_token || (S && S.refresh) || null, exp: Date.now() + (r.expires_in || 3600) * 1000,
      uid: u.id || (S && S.uid) || null, email: u.email || (S && S.email) || '', pseudo: meta.pseudo || (S && S.pseudo) || '' };
    ecrire(); change();
    return true;
  }
  function oublier() { S = null; ecrire(); change(); }
  function appel(methode, chemin, corps, jeton) {
    var entetes = { apikey: CLE, 'Content-Type': 'application/json' };
    if (jeton) entetes.Authorization = 'Bearer ' + jeton;
    return fetch(SERVICE + chemin, { method: methode, headers: entetes, cache: 'no-store', referrerPolicy: 'no-referrer', body: corps ? JSON.stringify(corps) : undefined })
      .then(function (r) { return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; } return { code: r.status, json: j }; }); })
      .catch(function () { return { code: 0, json: null }; });
  }
  // le jeton ne vaut qu'une heure : on le renouvelle une minute avant, une seule demande à la fois
  function jeton() {
    if (!S) return Promise.resolve(null);
    if (Date.now() < S.exp - 60000 || !S.refresh || renouveleeAilleurs()) return Promise.resolve(S.jeton);
    if (!renouvellement) renouvellement = appel('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: S.refresh }).then(function (r) {
      renouvellement = null;
      if (r.code === 200 && prendre(r.json)) return S.jeton;
      if (renouveleeAilleurs()) return S.jeton;
      if (r.code === 400 || r.code === 401 || r.code === 403) { oublier(); return null; }
      return S ? S.jeton : null;
    });
    return renouvellement;
  }
  function dire(r) {
    var code = (r.json && (r.json.error_code || r.json.code)) || '';
    if (r.code === 0) return 'Le service ne répond pas. Vérifie ta connexion.';
    var textes = { invalid_credentials: 'L\'e-mail ou le mot de passe ne va pas.', email_not_confirmed: 'Cette adresse n\'est pas encore confirmée : ouvre le lien de l\'e-mail que tu as reçu.',
      over_request_rate_limit: 'Trop d\'essais. Attends une minute.', user_banned: 'Ce compte est suspendu.', PGRST202: 'Le service des cerveaux n\'est pas encore ouvert.' };
    if (textes[code]) return textes[code];
    if (code === 'P0001' && r.json.message) return r.json.message.charAt(0).toUpperCase() + r.json.message.slice(1) + '.';
    if (r.code === 404) return textes.PGRST202;
    if (r.code === 429) return 'Trop d\'essais. Attends une minute.';
    if (r.code === 401) return 'Ta session a expiré : reconnecte-toi.';
    return 'Le service a refusé (' + r.code + ').';
  }

  S = gardee();
  window.addEventListener('storage', function (e) { if (e.key === STOCKAGE || e.key === null) { S = gardee(); change(); } });

  window.NA.Compte = {
    session: function () { return S; },
    nom: function () { return S ? (S.pseudo || (S.email || '').split('@')[0] || 'Mon compte') : ''; },
    quand: function (f) { ecouteurs.push(f); },
    connecter: function (email, mdp) { return appel('POST', '/auth/v1/token?grant_type=password', { email: email, password: mdp }).then(function (r) { if (r.code === 200) prendre(r.json); return r; }); },
    quitter: function () { var j = S && S.jeton; oublier(); return j ? appel('POST', '/auth/v1/logout?scope=local', {}, j) : Promise.resolve(); },
    // une fonction de la base ; « ouverte » : on peut l'appeler sans compte (le classement)
    rpc: function (n, p, ouverte) {
      return jeton().then(function (j) { return (j || ouverte) ? appel('POST', '/rest/v1/rpc/' + n, p || {}, j) : { code: 401, json: null }; });
    },
    dire: dire
  };
})();
