// Neural Arena — L'APPLICATION (app.js)
// Les quatre écrans (jouer, dresser, cerveaux, communauté), le combat en plein écran, le stockage local et la synchronisation au compte.
// Les cerveaux vivent d'abord dans ce navigateur (« neuralarena:v1 ») ; connecté, ils sont aussi gardés en ligne (les fonctions na_…).
(function () {
  'use strict';
  var NA = window.NA, Compte = NA.Compte, C4 = NA.COULEURS;
  var $ = function (id) { return document.getElementById(id); };
  function h(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(t) { var e = $('toast'); e.textContent = t; e.classList.add('vu'); clearTimeout(toast.t); toast.t = setTimeout(function () { e.classList.remove('vu'); }, 3200); }
  function uuid() { return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : r & 3 | 8).toString(16); }); }
  function nomPropre(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24).trim(); }
  function nomAuHasard() {
    var a = ['Bro', 'Cli', 'Dra', 'Fer', 'Gri', 'Hul', 'Jas', 'Kor', 'Lum', 'Mor', 'Nix', 'Oxy', 'Pyr', 'Rho', 'Sil', 'Tor', 'Vex', 'Zin'], b = ['ko', 'ta', 'mi', 'ron', 'lux', 'dar', 'vek', 'bo', 'nia', 'tek'];
    return a[Math.random() * a.length | 0] + b[Math.random() * b.length | 0] + '-' + (10 + Math.random() * 90 | 0);
  }
  var MAX_CERVEAUX = 12;
  // une question posée dans la page (les boîtes du navigateur ne s'ouvrent pas partout). Rend une promesse : le texte saisi, vrai, ou null.
  function demander(titre, texte, o) {
    o = o || {};
    var d = $('d-question');
    $('q-titre').textContent = titre; $('q-texte').textContent = texte || ''; $('q-champ').hidden = o.valeur == null; $('q-valeur').value = o.valeur || '';
    $('q-oui').textContent = o.oui || 'D\'accord'; $('q-oui').className = 'plein' + (o.danger ? ' rouge' : '');
    return new Promise(function (suite) {
      function finir(v) { $('f-question').onsubmit = null; $('q-non').onclick = null; d.onclose = null; if (d.open) d.close(); suite(v); }
      $('f-question').onsubmit = function (e) { e.preventDefault(); finir(o.valeur == null ? true : $('q-valeur').value); };
      $('q-non').onclick = function () { finir(null); }; d.onclose = function () { finir(null); };
      d.showModal(); if (o.valeur != null) $('q-valeur').select();
    });
  }

  // ---------- l'état, gardé dans le navigateur ----------
  var CLE = 'neuralarena:v1';
  var E = { cerveaux: [], supprimes: [], son: true,
    combat: { places: ['humain', 'a:2', 'vide', 'vide'], carte: 'hasard', modifs: {}, manches: 3 }, dressage: { cerveau: null, foyer: 'equilibre', niveau: 0, ligue: false } };
  var invites = {};                                              // (les cerveaux de la communauté qu'on affronte : le temps de la page)
  (function lire() {
    try {
      var s = JSON.parse(localStorage.getItem(CLE) || 'null'); if (!s) return;
      if (Array.isArray(s.cerveaux)) E.cerveaux = s.cerveaux.filter(function (c) { return c && c.id && NA.depuisTexte(c.poids); });
      if (Array.isArray(s.supprimes)) E.supprimes = s.supprimes;
      if (typeof s.son === 'boolean') E.son = s.son;
      if (s.combat && Array.isArray(s.combat.places) && s.combat.places.length === 4) E.combat = s.combat;
      if (s.dressage) E.dressage = s.dressage;
    } catch (e) { /* un stockage illisible : on repart de rien */ }
  })();
  function garder() { try { localStorage.setItem(CLE, JSON.stringify(E)); } catch (e) { /* stockage refusé : tout tient le temps de la page */ } }
  function cerveau(id) { for (var i = 0; i < E.cerveaux.length; i++) if (E.cerveaux[i].id === id) return E.cerveaux[i]; return null; }
  function neuf(nom, poids, plus) {
    var c = { id: uuid(), nom: nom, poids: NA.versTexte(poids), elo: 1000, generation: 0, niveau: 1, sigma: 0.05, profil: null, courbe: [], public: false, sale: true, enLigne: null, origine: null };
    for (var k in (plus || {})) c[k] = plus[k];
    E.cerveaux.push(c); garder();
    return c;
  }

  // ---------- l'atelier : le worker qui couve et qui dresse ----------
  var worker = null, attentes = {}, surGen = null;
  function atelier() {
    if (worker) return worker;
    // (en page unique, sans fichiers à côté, les sources du worker sont dans la page)
    var src = $('src-worker');
    worker = src ? new Worker(URL.createObjectURL(new Blob([$('src-sim').textContent, '\n', src.textContent], { type: 'text/javascript' }))) : new Worker('train-worker.js');
    worker.onmessage = function (e) {
      var m = e.data;
      if (m.type === 'couvee' && attentes[m.id]) { attentes[m.id](m.poids); delete attentes[m.id]; }
      else if (m.type === 'gen' && surGen) surGen(m);
    };
    worker.onerror = function () { toast('L\'atelier de dressage a calé. Recharge la page.'); };
    return worker;
  }
  function couver(suite) { var id = uuid(); attentes[id] = suite; atelier().postMessage({ type: 'couver', id: id }); }

  // ---------- le son : quelques bips synthétiques ----------
  var audio = null;
  function bip(f0, f1, duree, type, vol) {
    if (!E.son) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
      o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + duree);
      g.gain.setValueAtTime(vol || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
      o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + duree);
    } catch (e) { /* pas de son : tant pis */ }
  }
  function son(e) {
    if (e.t === 'tir') bip(760, 300, 0.07, 'square', 0.035); else if (e.t === 'touche') bip(240, 70, 0.16, 'sawtooth', 0.09);
    else if (e.t === 'mort') { bip(180, 40, 0.5, 'sawtooth', 0.11); bip(620, 90, 0.35, 'square', 0.05); }
    else if (e.t === 'saut') bip(300, 460, 0.06, 'sine', 0.03); else if (e.t === 'ruee') bip(520, 900, 0.09, 'triangle', 0.05);
    else if (e.t === 'boum') bip(120, 35, 0.4, 'sawtooth', 0.12); else if (e.t === 'meche') bip(980, 980, 0.05, 'square', 0.03);
  }
  $('b-son').addEventListener('click', function () { E.son = !E.son; this.setAttribute('aria-pressed', E.son); garder(); if (E.son) bip(520, 780, 0.08, 'sine', 0.05); });
  $('b-son').setAttribute('aria-pressed', E.son);

  // ---------- les écrans ----------
  var ECRANS = ['jouer', 'dresser', 'cerveaux', 'communaute'], ecran = '';
  function montrer() {
    var n = location.hash.slice(1); if (ECRANS.indexOf(n) < 0) n = 'jouer';
    ecran = n;
    ECRANS.forEach(function (e) { $('ecran-' + e).hidden = e !== n; });
    document.querySelectorAll('.onglets a').forEach(function (a) { if (a.dataset.onglet === n) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (n === 'jouer') peindreJouer(); else if (n === 'dresser') peindreDresser(); else if (n === 'cerveaux') peindreCerveaux(); else chargerClassement(false);
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', montrer);

  // =====================================================================================================================
  //  JOUER : la préparation du combat
  // =====================================================================================================================
  var ALEAS = [['vent', 'Vent', 'Des rafales poussent les automates et dévient les traits'], ['mines', 'Mines', 'Elles sautent une demi-seconde après qu\'on s\'en approche'],
    ['lune', 'Lune', 'La pesanteur de moitié : on saute haut, on retombe lentement'], ['subite', 'Mort subite', 'Une seule touche suffit']];
  function petitAutomate(c) {
    return '<svg viewBox="0 0 32 32" width="38" height="38" aria-hidden="true"><rect x="7" y="6" width="18" height="21" rx="6" fill="' + c + '"/><rect x="9.5" y="10.5" width="13" height="7" rx="3.5" fill="#10151c"/><circle cx="19" cy="14" r="2.2" fill="#fff"/><path d="M16 6V2.5" stroke="' + c + '" stroke-width="2" stroke-linecap="round"/></svg>';
  }
  function nomPlace(v) {
    if (v === 'humain') return 'Toi';
    if (v.slice(0, 2) === 'a:') return NA.NIVEAUX[+v.slice(2)].nom;
    if (v.slice(0, 2) === 'c:') { var c = cerveau(v.slice(2)); return c ? c.nom : null; }
    if (v.slice(0, 2) === 'i:') { var i = invites[v.slice(2)]; return i ? i.nom : null; }
    return null;
  }
  function detailPlace(v) {
    if (v === 'humain') return 'Au clavier et à la souris, ou au doigt';
    if (v.slice(0, 2) === 'a:') { var n = NA.NIVEAUX[+v.slice(2)]; return 'Automate d\'atelier, ' + n.titre + ' · ' + n.elo; }
    if (v.slice(0, 2) === 'c:') { var c = cerveau(v.slice(2)); return c ? 'Ton cerveau · ' + c.elo + ' · génération ' + c.generation : ''; }
    if (v.slice(0, 2) === 'i:') { var i = invites[v.slice(2)]; return i ? 'Cerveau de ' + i.auteur + ' · ' + i.elo : ''; }
    return 'Place libre';
  }
  function peindreJouer() {
    var P = E.combat.places, rang = 0;
    for (var k = 0; k < 4; k++) if (P[k] !== 'vide' && nomPlace(P[k]) === null) P[k] = 'vide';       // (un cerveau disparu libère sa place)
    $('places').innerHTML = P.map(function (v, k) {
      var c = v === 'vide' ? '#3a4556' : C4[rang++], opts = '<option value="vide">— place libre —</option><option value="humain">Toi</option>';
      opts += '<optgroup label="Tes cerveaux">' + E.cerveaux.map(function (b) { return '<option value="c:' + h(b.id) + '">' + h(b.nom) + ' (' + b.elo + ')</option>'; }).join('') + '</optgroup>';
      opts += '<optgroup label="Automates d\'atelier">' + [1, 2, 3, 4].map(function (n) { return '<option value="a:' + n + '">' + NA.NIVEAUX[n].nom + ', ' + NA.NIVEAUX[n].titre + '</option>'; }).join('') + '</optgroup>';
      var inv = Object.keys(invites);
      if (inv.length) opts += '<optgroup label="Invités de la communauté">' + inv.map(function (id) { return '<option value="i:' + h(id) + '">' + h(invites[id].nom) + ' (' + h(invites[id].auteur) + ')</option>'; }).join('') + '</optgroup>';
      return '<div class="place' + (v === 'vide' ? ' vide' : '') + '" style="--c:' + c + '">' + petitAutomate(c) + '<div><select data-place="' + k + '" aria-label="Combattant ' + (k + 1) + '">' + opts + '</select><div class="qui">' + h(detailPlace(v)) + '</div></div></div>';
    }).join('');
    $('places').querySelectorAll('select').forEach(function (s) { s.value = P[+s.dataset.place]; });
    $('cartes').innerHTML = '<button type="button" role="radio" data-carte="hasard"><span class="hasard">?</span>Au hasard</button>' +
      NA.CARTES.map(function (c) { return '<button type="button" role="radio" data-carte="' + c.id + '"><canvas width="200" height="120"></canvas>' + c.nom + '</button>'; }).join('');
    $('cartes').querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-checked', b.dataset.carte === E.combat.carte);
      var cv = b.querySelector('canvas'); if (cv) NA.vignette(cv, NA.carte(b.dataset.carte));
    });
    $('aleas').innerHTML = ALEAS.map(function (a) { return '<button type="button" data-alea="' + a[0] + '" aria-pressed="' + !!E.combat.modifs[a[0]] + '" title="' + h(a[2]) + '">' + a[1] + '</button>'; }).join('');
    $('manches').innerHTML = [1, 2, 3, 5].map(function (n) { return '<button type="button" role="radio" data-manches="' + n + '" aria-checked="' + (E.combat.manches === n) + '">' + n + '</button>'; }).join('');
    var n = P.filter(function (v) { return v !== 'vide'; }).length, moi = P.indexOf('humain') >= 0;
    $('b-lancer').disabled = n < 2;
    $('aide-lancer').textContent = n < 2 ? 'Il faut au moins deux combattants.' : moi ? 'Tu joues. Chacun pour soi.' : 'Tu regardes : aucun combattant n\'est toi.';
  }
  $('places').addEventListener('change', function (e) {
    var k = +e.target.dataset.place, v = e.target.value, P = E.combat.places;
    if (v === 'humain') for (var i = 0; i < 4; i++) if (i !== k && P[i] === 'humain') P[i] = 'a:2';         // (un seul joueur humain)
    P[k] = v; garder(); peindreJouer();
  });
  $('cartes').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; E.combat.carte = b.dataset.carte; garder(); peindreJouer(); });
  $('aleas').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; E.combat.modifs[b.dataset.alea] = !E.combat.modifs[b.dataset.alea]; garder(); peindreJouer(); });
  $('manches').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; E.combat.manches = +b.dataset.manches; garder(); peindreJouer(); });
  $('b-lancer').addEventListener('click', function () { lancerCombat(); });

  // =====================================================================================================================
  //  LE COMBAT
  // =====================================================================================================================
  var K = null;                                                  // (le combat en cours)
  var rendu = new NA.Rendu($('c-combat'));
  var entree = { g: false, d: false, saut: false, bas: false, ruee: false, tir: false, sx: NA.LARG / 2, sy: 0, tactile: false, mgx: 0, mgy: 0, mdx: 0, mdy: 0, vise: false };

  function lancerCombat() {
    var joueurs = [];
    E.combat.places.forEach(function (v) {
      var nom = v === 'vide' ? null : nomPlace(v); if (nom === null) return;
      joueurs.push({ v: v, nom: nom, gagne: 0 });
    });
    if (joueurs.length < 2) return;
    K = { joueurs: joueurs, manche: 0, m: null, pause: false, gel: 0, fin: 0, humain: null, acc: 0, dernier: 0, termine: false, moi: -1 };
    $('combat').hidden = false; document.body.style.overflow = 'hidden';
    $('tactile').hidden = !(entree.tactile && E.combat.places.indexOf('humain') >= 0);
    $('voile').hidden = true;
    try { if (audio && audio.state === 'suspended') audio.resume(); } catch (e) { /* rien */ }
    mancheSuivante();
    K.dernier = performance.now();
    requestAnimationFrame(boucle);
  }
  function piloteDe(v, rng) {
    if (v === 'humain') return new NA.PiloteHumain();
    if (v.slice(0, 2) === 'a:') return new NA.PiloteAuto(+v.slice(2), rng);
    var src = v.slice(0, 2) === 'c:' ? cerveau(v.slice(2)) : invites[v.slice(2)];
    return new NA.PiloteCerveau(NA.depuisTexte(src.poids));
  }
  function mancheSuivante() {
    K.manche++;
    var m = K.m = new NA.Manche({ carte: E.combat.carte === 'hasard' ? null : E.combat.carte, modifs: E.combat.modifs, fx: true });
    K.humain = null; K.moi = -1; K.etiquettes = {};
    K.joueurs.forEach(function (j, i) {
      var p = piloteDe(j.v, m.rng); m.ajouter(p);
      if (j.v === 'humain') { K.humain = p; K.moi = i; K.etiquettes[i] = 'TOI'; p.e.visee = m.autos[i].visee; }
    });
    rendu.vider(); K.gel = 70; K.fin = 0;
    annoncer('Manche ' + K.manche, m.carte.nom + (K.humain ? ' · tu es ' + NA.NOMS_COULEURS[K.moi] : ''), 1100);
    peindreScores(); $('h-manche').textContent = 'manche ' + K.manche;
  }
  function annoncer(t, sous, ms, couleur) {
    var a = $('annonce'); a.innerHTML = h(t) + (sous ? '<small>' + h(sous) + '</small>' : ''); a.style.color = couleur || ''; a.hidden = false;
    a.style.animation = 'none'; void a.offsetWidth; a.style.animation = '';
    clearTimeout(annoncer.t); if (ms) annoncer.t = setTimeout(function () { a.hidden = true; }, ms);
  }
  function peindreScores() {
    var cible = E.combat.manches;
    $('scores').innerHTML = K.joueurs.map(function (j, i) {
      var pts = ''; for (var k = 0; k < cible; k++) pts += k < j.gagne ? '●' : '○';
      return '<div class="score' + (K.m.autos[i].mort ? ' mort' : '') + '" style="--c:' + C4[i] + '"><b>' + h(j.nom) + '</b><span class="pts">' + pts + '</span></div>';
    }).join('');
  }
  function lireEntrees() {
    var e = K.humain.e, a = K.m.autos[K.moi];
    if (entree.tactile) {
      e.mx = entree.mgx > 0.3 ? 1 : entree.mgx < -0.3 ? -1 : 0; e.saut = entree.mgy < -0.5; e.bas = entree.mgy > 0.6; e.ruee = entree.ruee;
      if (entree.vise) e.visee = Math.atan2(entree.mdy, entree.mdx);
      e.tir = entree.vise;
    } else {
      e.mx = (entree.d ? 1 : 0) - (entree.g ? 1 : 0); e.saut = entree.saut; e.bas = entree.bas; e.ruee = entree.ruee; e.tir = entree.tir;
      e.visee = Math.atan2(entree.sy - a.cy(), entree.sx - a.cx());
    }
  }
  function boucle(t) {
    if (!K || K.termine) return;
    requestAnimationFrame(boucle);
    var dt = Math.min(100, t - K.dernier); K.dernier = t;
    rendu.cadrer();
    if (!K.pause) {
      K.acc += dt;
      var mortsAvant = K.m.vivants();
      while (K.acc >= 1000 / 60) {
        K.acc -= 1000 / 60;
        if (K.gel > 0) { K.gel--; continue; }
        if (K.humain && !K.m.autos[K.moi].mort) lireEntrees();
        if (!K.m.finie) K.m.pas();
        else if (K.fin > 0 && --K.fin === 0) { apresManche(); break; }
        if (K.m.finie && !K.fin && !K.termine) finManche();
      }
      if (K.m.vivants() !== mortsAvant) peindreScores();
      var reste = Math.max(0, Math.ceil((K.m.duree - K.m.t) / 60));
      $('h-temps').textContent = Math.floor(reste / 60) + ':' + ('0' + reste % 60).slice(-2);
      $('h-temps').classList.toggle('presse', reste <= 10);
    }
    rendu.dessiner(K.m, { etiquettes: K.etiquettes, son: son, fige: K.pause });
  }
  function finManche() {
    var v = K.m.vainqueur;
    if (v) { K.joueurs[v.i].gagne++; annoncer(K.joueurs[v.i].nom + ' prend la manche', K.m.t >= K.m.duree ? 'aux points, à la fin du temps' : '', 0, C4[v.i]); bip(520, 1040, 0.25, 'triangle', 0.07); }
    else annoncer('Manche nulle', 'personne ne marque', 0);
    peindreScores(); K.fin = 110;
  }
  function apresManche() {
    $('annonce').hidden = true;
    var gagnant = null;
    K.joueurs.forEach(function (j) { if (j.gagne >= E.combat.manches) gagnant = j; });
    if (!gagnant) return mancheSuivante();
    var ordre = K.joueurs.map(function (j, i) { return { j: j, i: i }; }).sort(function (a, b) { return b.j.gagne - a.j.gagne; });
    voile(gagnant.v === 'humain' ? 'Tu as gagné' : gagnant.nom + ' l\'emporte',
      '<div class="podium">' + ordre.map(function (o) { return '<div style="--c:' + C4[o.i] + '"><span>' + h(o.j.nom) + '</span><b>' + o.j.gagne + '</b></div>'; }).join('') + '</div>',
      [['Revanche', 'plein', function () { fermerVoile(); K.joueurs.forEach(function (j) { j.gagne = 0; }); K.manche = 0; mancheSuivante(); }], ['Retour', '', quitterCombat]]);
    K.pause = true; bip(660, 1320, 0.5, 'triangle', 0.08);
  }
  function voile(titre, corps, boutons) {
    $('v-titre').textContent = titre; $('v-corps').innerHTML = corps || '';
    var z = $('v-actions'); z.innerHTML = '';
    boutons.forEach(function (b) { var e = document.createElement('button'); e.type = 'button'; e.textContent = b[0]; if (b[1]) e.className = b[1]; e.addEventListener('click', b[2]); z.appendChild(e); });
    $('voile').hidden = false; z.firstChild.focus();
  }
  function fermerVoile() { $('voile').hidden = true; K.pause = false; K.dernier = performance.now(); K.acc = 0; }
  function pause() {
    if (!K || !$('voile').hidden) return;
    K.pause = true;
    voile('Pause', '<p class="doux">' + (K.humain ? 'Courir, sauter (contre un mur aussi), descendre, ruée, viser, tirer. La ruée traverse les traits.' : 'Tu regardes le combat.') + '</p>',
      [['Reprendre', 'plein', fermerVoile], ['Quitter le combat', '', quitterCombat]]);
  }
  function quitterCombat() {
    if (K) K.termine = true; K = null;
    $('combat').hidden = true; $('voile').hidden = true; $('annonce').hidden = true; document.body.style.overflow = '';
    montrer();
  }
  $('b-pause').addEventListener('click', pause);

  // --- le clavier et la souris (par position des touches : ZQSD ou WASD, c'est pareil)
  var TOUCHES = { KeyA: 'g', ArrowLeft: 'g', KeyD: 'd', ArrowRight: 'd', KeyW: 'saut', ArrowUp: 'saut', Space: 'saut', KeyS: 'bas', ArrowDown: 'bas', ShiftLeft: 'ruee', ShiftRight: 'ruee', KeyE: 'ruee', KeyF: 'tir' };
  window.addEventListener('keydown', function (e) {
    if (!K) return;
    if (e.code === 'Escape') { e.preventDefault(); if ($('voile').hidden) pause(); else if ($('v-titre').textContent === 'Pause') fermerVoile(); return; }
    var k = TOUCHES[e.code]; if (k) { entree[k] = true; entree.tactile = false; if (!e.target.closest || !e.target.closest('button')) e.preventDefault(); }
  });
  window.addEventListener('keyup', function (e) { var k = TOUCHES[e.code]; if (k) entree[k] = false; });
  window.addEventListener('blur', function () { entree.g = entree.d = entree.saut = entree.bas = entree.ruee = entree.tir = false; if (K && K.humain) pause(); });
  function versArene(cx, cy) {
    var c = rendu.cadrer();
    entree.sx = (cx - c.gauche - c.ox) / c.ech; entree.sy = (cy - c.haut - c.oy) / c.ech;
  }
  var terrain = $('c-combat');
  terrain.addEventListener('mousemove', function (e) { versArene(e.clientX, e.clientY); });
  terrain.addEventListener('mousedown', function (e) { if (e.button === 0) { entree.tir = true; entree.tactile = false; versArene(e.clientX, e.clientY); } });
  window.addEventListener('mouseup', function () { entree.tir = false; });
  terrain.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // --- le tactile : le pouce gauche court et saute, le pouce droit vise (et tire tant qu'il vise), un bouton pour la ruée
  var doigts = {};
  function manette(id, x, y) { var i = $(id).firstElementChild; i.style.transform = 'translate(' + x * 34 + 'px,' + y * 34 + 'px)'; }
  function toucher(e) {
    if (!K) return;
    if (e.target.closest('button')) return;
    e.preventDefault();
    if (!entree.tactile) { entree.tactile = true; $('tactile').hidden = !K.humain; }
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (e.type === 'touchstart') doigts[t.identifier] = { cote: t.clientX < window.innerWidth / 2 ? 'g' : 'd', x: t.clientX, y: t.clientY };
      var d = doigts[t.identifier]; if (!d) continue;
      if (e.type === 'touchend' || e.type === 'touchcancel') {
        if (d.cote === 'g') { entree.mgx = entree.mgy = 0; manette('m-gauche', 0, 0); } else { entree.vise = false; manette('m-droite', 0, 0); }
        delete doigts[t.identifier]; continue;
      }
      var dx = (t.clientX - d.x) / 44, dy = (t.clientY - d.y) / 44, n = Math.hypot(dx, dy);
      if (n > 1) { dx /= n; dy /= n; d.x = t.clientX - dx * 44; d.y = t.clientY - dy * 44; }      // (la base suit le pouce qui déborde)
      if (d.cote === 'g') { entree.mgx = dx; entree.mgy = dy; manette('m-gauche', dx, dy); }
      else { if (n > 0.3) { entree.mdx = dx; entree.mdy = dy; entree.vise = true; } manette('m-droite', dx, dy); }
    }
  }
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function (n) { $('combat').addEventListener(n, toucher, { passive: false }); });
  $('t-ruee').addEventListener('touchstart', function (e) { e.preventDefault(); entree.ruee = true; });
  $('t-ruee').addEventListener('touchend', function (e) { e.preventDefault(); entree.ruee = false; });

  // =====================================================================================================================
  //  DRESSER
  // =====================================================================================================================
  var D = { actif: false, id: null, m: null, pilote: null, rendu: new NA.Rendu($('c-dresser')), liens: null, liensDe: '', pousse: 0, dernier: 0, acc: 0 };
  function peindreDresser() {
    var R = E.dressage;
    if (!cerveau(R.cerveau)) R.cerveau = E.cerveaux.length ? E.cerveaux[0].id : null;
    $('d-cerveau').innerHTML = E.cerveaux.length ? E.cerveaux.map(function (c) { return '<option value="' + h(c.id) + '">' + h(c.nom) + ' · ' + c.elo + '</option>'; }).join('') : '<option value="">Aucun cerveau : va en couver un</option>';
    $('d-cerveau').value = R.cerveau || ''; $('d-cerveau').disabled = D.actif;
    $('d-foyer').innerHTML = Object.keys(NA.FOYERS).map(function (k) { return '<button type="button" data-foyer="' + k + '" aria-pressed="' + (R.foyer === k) + '">' + NA.FOYERS[k].nom + '</button>'; }).join('');
    $('d-niveau').innerHTML = [0, 1, 2, 3, 4].map(function (n) { return '<button type="button" role="radio" data-niveau="' + n + '" aria-checked="' + (R.niveau === n) + '">' + (n ? n : 'Auto') + '</button>'; }).join('');
    $('d-ligue').innerHTML = [[0, 'Automates seuls'], [1, 'Ligue']].map(function (o) { return '<button type="button" role="radio" data-ligue="' + o[0] + '" aria-checked="' + (!!R.ligue === !!o[0]) + '">' + o[1] + '</button>'; }).join('');
    $('d-ligue').querySelectorAll('button').forEach(function (b) { b.disabled = D.actif; });
    if (R.ligue) chargerRivaux();
    peindrePartenaires();
    $('d-foyer').querySelectorAll('button').forEach(function (b) { b.disabled = D.actif; });
    $('d-niveau').querySelectorAll('button').forEach(function (b) { b.disabled = D.actif; });
    var c = cerveau(R.cerveau), niv = R.niveau || (c ? c.niveau : 1), N = NA.NIVEAUX[niv];
    $('d-adversaire').textContent = R.niveau ? 'Toujours ' + N.nom + ', ' + N.titre + '.' : 'Il affronte ' + N.nom + ', ' + N.titre + ', et monte d\'un niveau dès qu\'il gagne sept manches sur dix.';
    $('b-dresser').textContent = D.actif ? 'Arrêter' : 'Dresser'; $('b-dresser').classList.toggle('arret', D.actif); $('b-dresser').disabled = !c;
    if (!D.actif) $('d-etat').textContent = c ? 'Compte une à deux secondes par génération. Tu peux changer d\'écran : le dressage continue.' : '';
    peindreTuiles(c, null); courbe(c);
    if (c && D.id !== c.id) { D.id = c.id; D.m = null; }
    if (!D.tourne) { D.tourne = true; D.dernier = performance.now(); requestAnimationFrame(vueDressage); }
  }
  function peindreTuiles(c, taux) {
    $('t-gen').textContent = c ? c.generation : '–'; $('t-elo').textContent = c ? c.elo : '–';
    $('t-niv').textContent = c ? (E.dressage.niveau || c.niveau) : '–';
    if (taux != null) $('t-taux').textContent = Math.round(taux * 100) + ' %'; else if (!D.actif) $('t-taux').textContent = '–';
  }
  $('d-cerveau').addEventListener('change', function () { E.dressage.cerveau = this.value; garder(); peindreDresser(); });
  $('d-foyer').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b || D.actif) return; E.dressage.foyer = b.dataset.foyer; garder(); peindreDresser(); });
  $('d-niveau').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b || D.actif) return; E.dressage.niveau = +b.dataset.niveau; garder(); D.m = null; peindreDresser(); });
  $('d-ligue').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b || D.actif) return; E.dressage.ligue = b.dataset.ligue === '1'; garder(); D.m = null; peindreDresser(); });
  $('b-dresser').addEventListener('click', function () { if (D.actif) arreterDressage(); else demarrerDressage(); });

  // --- la ligue : une manche sur deux contre d'autres cerveaux. Ses rivaux : les autres cerveaux du joueur, ceux qu'il a invités, et les
  // meilleurs de la communauté (pris une fois, si le service répond). Ses propres versions passées s'y ajoutent dans le worker.
  var commu = null, commuDemande = false;
  function chargerRivaux() {
    if (commuDemande) return; commuDemande = true;
    Compte.rpc('na_classement', {}, true).then(function (r) {
      if (r.code !== 200 || !Array.isArray(r.json)) { commuDemande = false; return; }
      var ids = r.json.filter(function (l) { return !l.a_moi; }).slice(0, 5).map(function (l) { return l.id; });
      commu = [];
      return Promise.all(ids.map(function (id) { return Compte.rpc('na_prendre', { id: id }, true).then(function (q) {
        var d = q.json; if (q.code === 200 && d && NA.depuisTexte(d.poids)) commu.push({ nom: nomPropre(d.nom) || 'Sans nom', poids: d.poids, elo: NA.borne(d.elo | 0, 400, 3000) });
      }); })).then(function () { if (ecran === 'dresser') peindrePartenaires(); });
    });
  }
  function rivaux(sauf) {
    var l = [];
    E.cerveaux.forEach(function (c) { if (c.id !== sauf) l.push({ nom: c.nom, poids: c.poids, elo: c.elo }); });
    Object.keys(invites).forEach(function (id) { l.push({ nom: invites[id].nom, poids: invites[id].poids, elo: NA.borne(invites[id].elo, 400, 3000) || 1000 }); });
    (commu || []).forEach(function (c) { if (!l.some(function (x) { return x.poids === c.poids; })) l.push(c); });
    return l.slice(0, 12);
  }
  function peindrePartenaires() {
    var R = E.dressage, n = rivaux(R.cerveau).length;
    $('d-partenaires').textContent = !R.ligue ? 'Il n\'affronte que l\'automate. Rapide, mais il finit par l\'apprendre par cœur.'
      : 'Une manche sur deux contre d\'autres cerveaux : ses propres versions passées' + (n ? ', et ' + n + (n > 1 ? ' rivaux' : ' rival') + ' (tes autres cerveaux, tes invités, les meilleurs publiés).' : '. Couve ou adopte d\'autres cerveaux pour lui donner des rivaux.') + ' Deux fois plus lent, mais il apprend à se battre contre ce qui lui ressemble.';
  }

  function demarrerDressage() {
    var c = cerveau(E.dressage.cerveau); if (!c) return;
    D.actif = true; D.entraine = c.id; D.lisse = null; D.ancien = c.poids; D.ligue = !!E.dressage.ligue;
    surGen = function (r) {
      var b = cerveau(D.entraine); if (!b || !D.actif) return;
      b.poids = NA.versTexte(r.poids); b.elo = r.elo; b.generation = r.generation; b.sigma = r.sigma; if (!E.dressage.niveau) b.niveau = r.niveau;
      var p = b.profil || r.profil; for (var k in r.profil) p[k] = p[k] * 0.85 + r.profil[k] * 0.15; b.profil = p;
      D.lisse = D.lisse == null ? r.taux : D.lisse * 0.8 + r.taux * 0.2;
      b.courbe.push([r.generation, r.elo, Math.round(D.lisse * 100) / 100]);
      if (b.courbe.length > 120) b.courbe = b.courbe.filter(function (x, i) { return i % 2 === 1; });   // (une courbe qui s'allonge se dilue)
      b.sale = true; garder();
      if (r.generation % 8 === 0) D.ancien = b.poids;
      if (ecran === 'dresser' && E.dressage.cerveau === b.id) { peindreTuiles(b, D.lisse); courbe(b); $('d-etat').textContent = 'Dressage en cours…' + (r.tauxRivaux != null ? ' Contre les autres cerveaux, cette génération : ' + Math.round(r.tauxRivaux * 100) + ' %.' : '') + (r.monte ? ' Il passe au niveau ' + r.niveau + ' !' : ''); }
      if (r.monte && ecran === 'dresser' && E.dressage.cerveau === b.id) $('d-adversaire').textContent = 'Il affronte ' + NA.NIVEAUX[r.niveau].nom + ', ' + NA.NIVEAUX[r.niveau].titre + ', et monte d\'un niveau dès qu\'il gagne sept manches sur dix.';
      if (r.monte) toast(b.nom + ' passe au niveau ' + r.niveau + ' : il affronte ' + NA.NIVEAUX[r.niveau].nom + '.');
      if (Date.now() - D.pousse > 60000) { D.pousse = Date.now(); pousser(b); }
    };
    atelier().postMessage({ type: 'dresser', opts: { poids: NA.depuisTexte(c.poids), sigma: c.sigma, niveau: E.dressage.niveau || c.niveau, auto: !E.dressage.niveau, foyer: E.dressage.foyer, elo: c.elo, generation: c.generation, ligue: D.ligue,
      rivaux: D.ligue ? rivaux(c.id).map(function (x) { return { poids: NA.depuisTexte(x.poids), elo: x.elo }; }) : [] } });
    D.pousse = Date.now();
    peindreDresser(); $('d-etat').textContent = 'Dressage en cours…';
  }
  function arreterDressage() {
    if (!D.actif) return;
    D.actif = false; atelier().postMessage({ type: 'arret' });
    var b = cerveau(D.entraine); if (b) pousser(b);
    if (ecran === 'dresser') peindreDresser();
  }

  // --- la scène : le cerveau choisi se bat sous tes yeux, avec ses poids du moment
  function vueDressage(t) {
    if (ecran !== 'dresser' || K) { D.tourne = false; return; }
    requestAnimationFrame(vueDressage);
    var c = cerveau(E.dressage.cerveau), dt = Math.min(100, t - D.dernier); D.dernier = t;
    if (!c) return;
    if (!D.m || (D.m.finie && --D.repos <= 0)) {
      var niv = E.dressage.niveau || c.niveau;
      D.m = new NA.Manche({ fx: true, duree: 30 * 60 });
      D.pilote = new NA.PiloteCerveau(NA.depuisTexte(c.poids));
      // (en ligue, une manche sur deux contre un rival, ou contre sa propre version d'il y a quelques générations)
      var adv = null; D.tourVue = (D.tourVue || 0) + 1;
      if (E.dressage.ligue && D.tourVue % 2 === 0) { var rv = rivaux(c.id); adv = rv.length && Math.random() < 0.7 ? rv[Math.random() * rv.length | 0] : { nom: 'son ancienne version', poids: D.actif && D.entraine === c.id ? D.ancien : c.poids }; }
      D.m.ajouter(D.pilote); D.m.ajouter(adv ? new NA.PiloteCerveau(NA.depuisTexte(adv.poids)) : new NA.PiloteAuto(niv, D.m.rng));
      D.repos = 60; D.rendu.vider(); D.acc = 0;
      $('d-bandeau').textContent = c.nom + ' (corail) contre ' + (adv ? adv.nom : NA.NIVEAUX[niv].nom) + ' (azur) · ' + D.m.carte.nom;
    }
    D.acc += dt;
    while (D.acc >= 1000 / 60) { D.acc -= 1000 / 60; if (!D.m.finie) D.m.pas(); }
    D.rendu.cadrer(); D.rendu.dessiner(D.m);
    reseau(c);
  }
  function courbe(c) {
    var cv = $('c-courbe'), x = cv.getContext('2d'), W = cv.width, H = cv.height, P = c ? c.courbe : [];
    x.clearRect(0, 0, W, H);
    x.strokeStyle = '#232c38'; x.lineWidth = 1;
    for (var g = 0; g <= 4; g++) { var y = 12 + g * (H - 30) / 4; x.beginPath(); x.moveTo(34, y); x.lineTo(W - 6, y); x.stroke(); }
    x.font = '11px ui-monospace,Menlo,Consolas,monospace'; x.fillStyle = '#93a0b0';
    if (P.length < 2) { x.textAlign = 'center'; x.fillText('La courbe se dessine dès les premières générations.', W / 2, H / 2); return; }
    var min = 1e9, max = -1e9; P.forEach(function (p) { min = Math.min(min, p[1]); max = Math.max(max, p[1]); });
    min = Math.floor((min - 20) / 50) * 50; max = Math.ceil((max + 20) / 50) * 50;
    function trace(col, f) {
      x.strokeStyle = col; x.lineWidth = 2; x.lineJoin = 'round'; x.beginPath();
      P.forEach(function (p, i) { var px = 34 + i * (W - 40) / (P.length - 1), py = 12 + (1 - f(p)) * (H - 30); if (i) x.lineTo(px, py); else x.moveTo(px, py); });
      x.stroke();
    }
    trace('#4fc3f7', function (p) { return p[2]; }); trace('#ffb547', function (p) { return (p[1] - min) / (max - min); });
    x.textAlign = 'left'; x.fillStyle = '#ffb547'; x.fillText(max, 2, 16); x.fillText(min, 2, H - 16);
    x.fillStyle = '#93a0b0'; x.textAlign = 'center'; x.fillText('génération ' + P[0][0] + ' → ' + P[P.length - 1][0], W / 2, H - 3);
  }
  // les neurones du cerveau qui se bat, allumés selon ce qu'ils valent à l'instant ; les fils sont ses liaisons les plus fortes
  function reseau(c) {
    var cv = $('c-reseau'), x = cv.getContext('2d'), W = cv.width, H = cv.height, F = NA.FORME, a = D.pilote.r.a, p = D.pilote.r.p, colX = [16, 190, 330, 436], i, j, k;
    function pos(l, n) { return [colX[l], 8 + (n + 0.5) * (H - 16) / F[l]]; }
    if (D.liensDe !== c.poids) {                                   // (recalculés seulement quand les poids changent)
      D.liensDe = c.poids; D.liens = []; var base = 0;
      for (var l = 1; l < F.length; l++) {
        var tous = [];
        for (j = 0; j < F[l]; j++) { for (i = 0; i < F[l - 1]; i++) tous.push([Math.abs(p[base + j * (F[l - 1] + 1) + i]), i, j, p[base + j * (F[l - 1] + 1) + i]]); }
        tous.sort(function (u, v) { return v[0] - u[0]; });
        tous.slice(0, 46).forEach(function (u) { D.liens.push([l, u[1], u[2], u[3]]); });
        base += (F[l - 1] + 1) * F[l];
      }
    }
    x.clearRect(0, 0, W, H); x.lineWidth = 1;
    for (k = 0; k < D.liens.length; k++) {
      var L = D.liens[k], s = a[L[0] - 1][L[1]] * L[3], A = pos(L[0] - 1, L[1]), B = pos(L[0], L[2]);
      x.strokeStyle = s > 0 ? 'rgba(255,181,71,' + Math.min(0.75, 0.06 + Math.abs(s) * 0.5) + ')' : 'rgba(79,195,247,' + Math.min(0.75, 0.06 + Math.abs(s) * 0.5) + ')';
      x.beginPath(); x.moveTo(A[0], A[1]); x.lineTo(B[0], B[1]); x.stroke();
    }
    for (var l2 = 0; l2 < F.length; l2++) for (i = 0; i < F[l2]; i++) {
      var v = Math.max(-1, Math.min(1, a[l2][i])), q = pos(l2, i);
      x.fillStyle = v >= 0 ? 'rgba(255,181,71,' + (0.18 + v * 0.82) + ')' : 'rgba(79,195,247,' + (0.18 - v * 0.82) + ')';
      x.beginPath(); x.arc(q[0], q[1], l2 === 0 ? 2.3 : 3.6, 0, 7); x.fill();
    }
    x.font = '11px ui-monospace,Menlo,Consolas,monospace'; x.textAlign = 'left';
    var o = a[F.length - 1];
    for (i = 0; i < F[3]; i++) {
      var actif = i === 0 ? Math.abs(o[0]) > 0.33 : i === 1 || i === 4 ? o[i] > 0 : i < 6 ? o[i] > 0.5 : false, q2 = pos(3, i);
      x.fillStyle = actif ? '#e8edf2' : '#5d6978';
      x.fillText(i < 6 ? (i === 0 ? (o[0] < -0.33 ? 'reculer' : 'avancer') : i === 5 ? (o[5] < 0 ? 'baisser la visée' : 'lever la visée') : NA.SORTIES[i]) : 'mémoire', 448, q2[1] + 4);
    }
  }

  // =====================================================================================================================
  //  LES CERVEAUX
  // =====================================================================================================================
  var AXES = [['precision', 'Précision'], ['esquive', 'Esquive'], ['assaut', 'Assaut'], ['survie', 'Survie'], ['mobilite', 'Mobilité']];
  function radar(cv, profil) {
    var d = Math.min(window.devicePixelRatio || 1, 2); cv.width = 170 * d; cv.height = 120 * d;
    var x = cv.getContext('2d'), R = 36, cx = 85, cy = 62, i, a;
    x.scale(d, d); x.strokeStyle = '#283242'; x.lineWidth = 1;
    for (var r = 1; r <= 3; r++) { x.beginPath(); for (i = 0; i <= 5; i++) { a = -Math.PI / 2 + i * 1.2566; x.lineTo(cx + Math.cos(a) * R * r / 3, cy + Math.sin(a) * R * r / 3); } x.stroke(); }
    x.font = '8.5px ui-monospace,Menlo,Consolas,monospace'; x.fillStyle = '#93a0b0'; x.textAlign = 'center';
    AXES.forEach(function (ax, k) { a = -Math.PI / 2 + k * 1.2566; var co = Math.cos(a); x.textAlign = co > 0.3 ? 'left' : co < -0.3 ? 'right' : 'center'; x.fillText(ax[1], cx + co * (R + 5), cy + Math.sin(a) * (R + 9) + 3); });
    if (!profil) return;
    x.beginPath(); AXES.forEach(function (ax, k) { a = -Math.PI / 2 + k * 1.2566; var v = 0.08 + 0.92 * Math.max(0, Math.min(1, profil[ax[0]] || 0)); x.lineTo(cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v); });
    x.closePath(); x.fillStyle = 'rgba(255,181,71,0.22)'; x.fill(); x.strokeStyle = '#ffb547'; x.lineWidth = 1.5; x.stroke();
  }
  function peindreCerveaux() {
    var z = $('liste-cerveaux');
    if (!E.cerveaux.length) { z.innerHTML = '<p class="vide-liste">Aucun cerveau pour l\'instant. Couves-en un : il naît en deux secondes.</p>'; return; }
    z.innerHTML = E.cerveaux.map(function (c) {
      return '<article class="fiche" data-id="' + h(c.id) + '"><header><h3>' + h(c.nom) + '</h3>' + (c.public ? '<span class="etiquette pub">publié</span>' : '') +
        (c.origine ? '<span class="etiquette" title="Adopté de ' + h(c.origine.auteur) + '">adopté</span>' : '') + '</header>' +
        '<div class="corps"><canvas aria-label="Profil"></canvas><dl><dt>Classement</dt><dd>' + c.elo + '</dd><dt>Génération</dt><dd>' + c.generation + '</dd><dt>Adversaire</dt><dd>' + NA.NIVEAUX[c.niveau].nom + ' (' + c.niveau + ')</dd>' +
        '<dt>En ligne</dt><dd>' + (c.enLigne && !c.sale ? 'gardé' : Compte.session() ? 'à envoyer' : 'non') + '</dd></dl></div>' +
        '<div class="actions"><button type="button" data-a="dresser" class="plein">Dresser</button><button type="button" data-a="combattre">Combattre</button><button type="button" data-a="renommer">Renommer</button>' +
        '<button type="button" data-a="publier">' + (c.public ? 'Retirer du classement' : 'Publier') + '</button><button type="button" data-a="exporter">Exporter</button><button type="button" data-a="supprimer" class="danger">Supprimer</button></div></article>';
    }).join('');
    z.querySelectorAll('.fiche').forEach(function (f) { radar(f.querySelector('canvas'), cerveau(f.dataset.id).profil); });
  }
  $('liste-cerveaux').addEventListener('click', function (e) {
    var b = e.target.closest('button'), f = e.target.closest('.fiche'); if (!b || !f) return;
    var c = cerveau(f.dataset.id), a = b.dataset.a; if (!c) return;
    if (a === 'dresser') { if (D.actif && D.entraine !== c.id) arreterDressage(); E.dressage.cerveau = c.id; garder(); location.hash = '#dresser'; }
    else if (a === 'combattre') { var P = E.combat.places; if (P.indexOf('c:' + c.id) < 0) { P[0] = 'humain'; P[1] = 'c:' + c.id; } garder(); location.hash = '#jouer'; }
    else if (a === 'renommer') demander('Renommer ce cerveau', '24 caractères au plus.', { valeur: c.nom, oui: 'Renommer' }).then(function (v) { var n = nomPropre(v); if (n) { c.nom = n; c.sale = true; garder(); peindreCerveaux(); pousser(c); } });
    else if (a === 'publier') {
      if (!Compte.session()) { toast('Publier demande un compte : connecte-toi d\'abord.'); ouvrirCompte(); return; }
      c.public = !c.public; c.sale = true; garder(); peindreCerveaux(); classementLe = 0;
      pousser(c).then(function (ok) { if (ok) toast(c.public ? c.nom + ' est au classement de la communauté.' : c.nom + ' n\'est plus publié.'); });
    }
    else if (a === 'exporter') {
      var u = URL.createObjectURL(new Blob([JSON.stringify({ jeu: 'neural-arena', format: NA.FORMAT, nom: c.nom, poids: c.poids, elo: c.elo, generation: c.generation, niveau: c.niveau, profil: c.profil })], { type: 'application/json' }));
      var l = document.createElement('a'); l.href = u; l.download = c.nom.replace(/[^\w-]+/g, '_') + '.cerveau.json'; l.click(); setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
    }
    else if (a === 'supprimer') {
      demander('Supprimer « ' + c.nom + ' » ?', 'Ses ' + c.generation + ' générations de dressage seront perdues.', { oui: 'Supprimer', danger: true }).then(function (v) {
        if (!v) return;
        if (D.actif && D.entraine === c.id) arreterDressage();
        E.cerveaux = E.cerveaux.filter(function (x) { return x !== c; });
        if (c.enLigne) { E.supprimes.push(c.id); oublierEnLigne(); }
        garder(); peindreCerveaux();
      });
    }
  });
  $('b-couver').addEventListener('click', function () {
    if (E.cerveaux.length >= MAX_CERVEAUX) return toast('Douze cerveaux au plus : supprimes-en un d\'abord.');
    var b = this; b.disabled = true; b.textContent = 'La couvée éclot…';
    couver(function (p) { var c = neuf(nomAuHasard(), p); b.disabled = false; b.textContent = '+ Couver un cerveau'; peindreCerveaux(); toast(c.nom + ' est né. Trente candidats, le plus dégourdi a été gardé.'); pousser(c); });
  });
  $('b-importer').addEventListener('click', function () { $('f-importer').click(); });
  $('f-importer').addEventListener('change', function () {
    var f = this.files[0]; this.value = ''; if (!f) return;
    if (f.size > 200000) return toast('Ce fichier est trop gros pour être un cerveau.');
    f.text().then(function (t) {
      var d = null; try { d = JSON.parse(t); } catch (e) { d = null; }
      var p = d && d.jeu === 'neural-arena' ? NA.depuisTexte(d.poids) : null;
      if (!p) return toast('Ce fichier n\'est pas un cerveau de Neural Arena.');
      if (E.cerveaux.length >= MAX_CERVEAUX) return toast('Douze cerveaux au plus : supprimes-en un d\'abord.');
      var c = neuf(nomPropre(d.nom) || nomAuHasard(), p, { elo: NA.borne(d.elo | 0, 400, 3000) || 1000, generation: Math.max(0, d.generation | 0), niveau: NA.borne(d.niveau | 0, 1, 4) });
      peindreCerveaux(); toast(c.nom + ' a rejoint tes cerveaux.'); pousser(c);
    });
  });

  // =====================================================================================================================
  //  LA COMMUNAUTÉ
  // =====================================================================================================================
  var classementLe = 0, lignes = null;
  function chargerClassement(force) {
    var z = $('classement');
    if (!force && lignes && Date.now() - classementLe < 30000) return peindreClassement();
    z.innerHTML = '<p class="message">Le classement arrive…</p>';
    Compte.rpc('na_classement', {}, true).then(function (r) {
      if (r.code !== 200 || !Array.isArray(r.json)) { lignes = null; z.innerHTML = '<p class="message">' + h(Compte.dire(r)) + '</p>'; return; }
      lignes = r.json; classementLe = Date.now(); peindreClassement();
    });
  }
  function peindreClassement() {
    var z = $('classement');
    if (!lignes.length) { z.innerHTML = '<p class="message">Personne n\'a encore publié de cerveau. Le premier peut être le tien : écran « Cerveaux », bouton « Publier ».</p>'; return; }
    z.innerHTML = '<table><thead><tr><th>#</th><th>Cerveau</th><th>Dresseur</th><th>Classement</th><th>Génération</th><th></th></tr></thead><tbody>' + lignes.map(function (l, i) {
      return '<tr' + (l.a_moi ? ' class="moi"' : '') + '><td class="n rang">' + (i + 1) + '</td><td><b>' + h(l.nom) + '</b></td><td>' + h(l.auteur) + (l.a_moi ? ' (toi)' : '') + '</td><td class="n">' + (l.elo | 0) + '</td><td class="n">' + (l.generation | 0) + '</td>' +
        '<td><div class="actions"><button type="button" data-a="affronter" data-id="' + h(l.id) + '">Affronter</button>' + (l.a_moi ? '' : '<button type="button" data-a="adopter" data-id="' + h(l.id) + '">Adopter</button>') + '</div></td></tr>';
    }).join('') + '</tbody></table>';
  }
  $('b-rafraichir').addEventListener('click', function () { chargerClassement(true); });
  $('classement').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    b.disabled = true;
    Compte.rpc('na_prendre', { id: b.dataset.id }, true).then(function (r) {
      b.disabled = false;
      var d = r.json, p = r.code === 200 && d ? NA.depuisTexte(d.poids) : null;
      if (!p) return toast(r.code === 200 ? 'Ce cerveau n\'est plus publié.' : Compte.dire(r));
      var nom = nomPropre(d.nom) || 'Sans nom', auteur = nomPropre(d.auteur).slice(0, 16) || 'Anonyme';
      if (b.dataset.a === 'affronter') {
        invites[d.id] = { nom: nom, auteur: auteur, poids: d.poids, elo: d.elo | 0 };
        var P = E.combat.places; if (P.indexOf('humain') < 0 && P[0] !== 'i:' + d.id) P[0] = 'humain';
        var k = P.indexOf('i:' + d.id); if (k < 0) { k = P[0] === 'humain' ? 1 : 0; P[k] = 'i:' + d.id; }
        location.hash = '#jouer'; toast(nom + ', de ' + auteur + ', t\'attend dans l\'arène.');
      } else {
        if (E.cerveaux.length >= MAX_CERVEAUX) return toast('Douze cerveaux au plus : supprimes-en un d\'abord.');
        var c = neuf(nom, p, { elo: NA.borne(d.elo | 0, 400, 3000), generation: Math.max(0, d.generation | 0), profil: d.profil && typeof d.profil === 'object' ? profilPropre(d.profil) : null, origine: { nom: nom, auteur: auteur } });
        toast(c.nom + ' est adopté : il est à toi, dresse-le à ta façon.'); pousser(c);
      }
    });
  });
  function profilPropre(p) { var o = {}; AXES.forEach(function (a) { o[a[0]] = NA.borne(+p[a[0]] || 0, 0, 1); }); return o; }

  // =====================================================================================================================
  //  LE COMPTE ET LA SYNCHRONISATION
  // =====================================================================================================================
  var synchro = { etat: '', texte: '' };
  function etatSynchro(etat, texte) {
    synchro.etat = etat; synchro.texte = texte;
    $('pastille').className = 'pastille ' + (etat === 'ok' ? 'ok' : etat === 'cours' ? 'cours' : etat === 'mal' ? 'mal' : '');
    var a = $('c-synchro'); a.textContent = texte; a.className = 'avis' + (etat === 'mal' ? ' mal' : etat === 'ok' ? ' bien' : '');
  }
  function versLigne(c) {
    return { id: c.id, nom: c.nom, format: NA.FORMAT, poids: c.poids, elo: c.elo, generation: c.generation, public: !!c.public,
      stats: { niveau: c.niveau, sigma: c.sigma, profil: c.profil, courbe: c.courbe.slice(-60), origine: c.origine } };
  }
  function depuisLigne(l, uid) {
    if (!l || !l.id || !NA.depuisTexte(l.poids)) return null;
    var s = l.stats && typeof l.stats === 'object' ? l.stats : {};
    return { id: String(l.id), nom: nomPropre(l.nom) || 'Sans nom', poids: l.poids, elo: NA.borne(l.elo | 0, 400, 3000), generation: Math.max(0, l.generation | 0), niveau: NA.borne(s.niveau | 0, 1, 4),
      sigma: NA.borne(+s.sigma || 0.05, 0.02, 0.05), profil: s.profil && typeof s.profil === 'object' ? profilPropre(s.profil) : null,
      courbe: Array.isArray(s.courbe) ? s.courbe.filter(function (p) { return Array.isArray(p) && p.length === 3 && p.every(isFinite); }).slice(-120) : [],
      public: !!l.public, sale: false, enLigne: uid, origine: s.origine && typeof s.origine === 'object' ? { nom: nomPropre(s.origine.nom), auteur: nomPropre(s.origine.auteur).slice(0, 16) } : null };
  }
  // envoyer un cerveau au compte. Rend une promesse : vrai si c'est gardé en ligne.
  function pousser(c) {
    var S = Compte.session(); if (!S) return Promise.resolve(false);
    var uid = S.uid, envoye = c.poids + '|' + c.nom + '|' + c.public;
    etatSynchro('cours', 'Envoi de ' + c.nom + '…');
    return Compte.rpc('na_garder', { cerveau: versLigne(c) }).then(function (r) {
      if (r.code !== 200) { etatSynchro('mal', Compte.dire(r)); return false; }
      c.enLigne = uid; if (envoye === c.poids + '|' + c.nom + '|' + c.public) c.sale = false;      // (changé pendant l'envoi : il reste à renvoyer)
      garder(); etatSynchro('ok', c.nom + ' est gardé en ligne.');
      if (ecran === 'cerveaux') peindreCerveaux();
      return true;
    });
  }
  function oublierEnLigne() {
    if (!Compte.session() || !E.supprimes.length) return Promise.resolve();
    var id = E.supprimes[0];
    return Compte.rpc('na_oublier', { id: id }).then(function (r) {
      if (r.code !== 200) return;
      E.supprimes = E.supprimes.filter(function (x) { return x !== id; }); garder(); classementLe = 0;
      return oublierEnLigne();
    });
  }
  // Tout mettre d'accord. Ce qui a changé ici depuis le dernier envoi (« sale ») part en ligne ; le reste suit ce qui est en ligne.
  function synchroniser() {
    var S = Compte.session(); if (!S) return Promise.resolve();
    var uid = S.uid;
    // (un autre compte s'est connecté sur ce navigateur : les cerveaux du précédent restent chez lui, en ligne)
    E.cerveaux = E.cerveaux.filter(function (c) { return !c.enLigne || c.enLigne === uid; });
    etatSynchro('cours', 'Synchronisation…');
    return oublierEnLigne().then(function () { return Compte.rpc('na_mes_cerveaux'); }).then(function (r) {
      if (r.code !== 200 || !Array.isArray(r.json)) { etatSynchro('mal', Compte.dire(r)); return; }
      var vus = {};
      r.json.forEach(function (l) {
        var d = depuisLigne(l, uid); if (!d || E.supprimes.indexOf(d.id) >= 0) return;
        vus[d.id] = true;
        var loc = cerveau(d.id);
        if (!loc) E.cerveaux.push(d); else if (!loc.sale && !(D.actif && D.entraine === loc.id)) E.cerveaux[E.cerveaux.indexOf(loc)] = d;
      });
      // (gardé en ligne ici, absent là-bas : supprimé depuis un autre appareil)
      E.cerveaux = E.cerveaux.filter(function (c) { return !(c.enLigne === uid && !c.sale && !vus[c.id]); });
      garder();
      var file = E.cerveaux.filter(function (c) { return c.sale || !c.enLigne; }), ok = true;
      function suivant() { var c = file.shift(); if (!c) return; return pousser(c).then(function (b) { ok = ok && b; return suivant(); }); }
      return Promise.resolve(suivant()).then(function () {
        if (ok) etatSynchro('ok', E.cerveaux.length > 1 ? 'Tes ' + E.cerveaux.length + ' cerveaux sont gardés en ligne.' : E.cerveaux.length ? 'Ton cerveau est gardé en ligne.' : 'Connecté. Aucun cerveau pour l\'instant.');
        if (ecran === 'cerveaux') peindreCerveaux(); else if (ecran === 'jouer') peindreJouer(); else if (ecran === 'dresser') peindreDresser();
      });
    });
  }
  function peindreCompte() {
    var S = Compte.session();
    $('nom-compte').textContent = S ? Compte.nom() : 'Se connecter';
    $('compte-hors').hidden = !!S; $('compte-dans').hidden = !S;
    if (S) { $('c-pseudo').textContent = Compte.nom(); $('c-adresse').textContent = S.email; } else etatSynchro('', '');
  }
  function ouvrirCompte() { peindreCompte(); var d = $('d-compte'); if (!d.open) d.showModal(); }
  $('b-compte').addEventListener('click', ouvrirCompte);
  $('f-connexion').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = this.querySelector('button'), a = $('c-avis'); b.disabled = true; a.className = 'avis'; a.textContent = 'Connexion…';
    Compte.connecter($('c-email').value.trim(), $('c-mdp').value).then(function (r) {
      b.disabled = false; $('c-mdp').value = '';
      if (r.code !== 200) { a.className = 'avis mal'; a.textContent = Compte.dire(r); return; }
      a.textContent = '';
    });
  });
  $('b-sortir').addEventListener('click', function () { Compte.quitter(); });
  $('b-synchro').addEventListener('click', synchroniser);
  var dernierUid = Compte.session() ? Compte.session().uid : null;
  Compte.quand(function (S) {
    peindreCompte();
    var uid = S ? S.uid : null;
    if (uid && uid !== dernierUid) synchroniser();
    dernierUid = uid;
    if (ecran === 'cerveaux') peindreCerveaux();
  });

  // ---------- l'application installable ----------
  // Le service worker garde le jeu pour l'ouvrir sans réseau ; le bouton d'installation ne paraît que si le navigateur la propose.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* pas de service worker : le jeu marche sans */ });
  }
  var invite = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); invite = e; $('b-installer').hidden = false; });
  window.addEventListener('appinstalled', function () { invite = null; $('b-installer').hidden = true; toast('Neural Arena est installé.'); });
  $('b-installer').addEventListener('click', function () { if (invite) { invite.prompt(); invite = null; this.hidden = true; } });

  // ---------- le départ ----------
  window.addEventListener('beforeunload', function () { garder(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && K && K.humain) pause(); });
  peindreCompte(); montrer();
  if (Compte.session()) synchroniser().then(premier); else premier();
  function premier() {
    if (E.cerveaux.length) return;
    couver(function (p) {
      if (E.cerveaux.length) return;
      var c = neuf(nomAuHasard(), p); E.dressage.cerveau = c.id; garder();
      toast('Un premier cerveau t\'attend : ' + c.nom + '. Va le dresser.');
      if (ecran === 'cerveaux') peindreCerveaux(); else if (ecran === 'jouer') peindreJouer(); else if (ecran === 'dresser') peindreDresser();
      pousser(c);
    });
  }
  window.NA.essai = { E: E, combat: function () { return K; }, dressage: D };      // (une prise pour les essais automatiques)
})();
