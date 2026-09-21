/* Season — logique de l'appli. Sans framework. */
(() => {
  "use strict";

  const view = document.getElementById("view");
  const topTitle = document.getElementById("topTitle");
  const backBtn = document.getElementById("backBtn");
  const avenirBtn = document.getElementById("avenirBtn");
  const tabbar = document.getElementById("tabbar");
  const toastEl = document.getElementById("toast");

  const STATUS = { a_voir: "À voir", en_cours: "En cours", vu: "Vu" };

  // ---- petits utilitaires -------------------------------------------------
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }
  function fmtDuration(mins) {
    mins = Math.round(mins || 0);
    if (mins < 60) return mins + " min";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h < 24) return m ? `${h} h ${m}` : `${h} h`;
    const j = Math.floor(h / 24);
    return `${j} j ${h % 24} h`;
  }
  const spinner = () => el('<div class="spinner"></div>');

  // ---- réglages (dans le téléphone, localStorage) ---------------------------
  // plateformes de streaming choisies : [{id, name, logo}] — vide = pas de filtre
  // ---- « Pas intéressé » -------------------------------------------------
  // Titres qu'elle ne veut plus voir proposés (suggestions de fiche, pages de
  // thème). Petite liste gardée dans localStorage (`{key,title,poster}`),
  // reprise dans l'export ; ses propres titres suivis ne sont jamais filtrés.
  function hiddenList() {
    try { return JSON.parse(localStorage.getItem("season.hidden") || "[]"); } catch { return []; }
  }
  let hiddenKeys = new Set(hiddenList().map((x) => x.key));
  function setHiddenList(list) {
    try { localStorage.setItem("season.hidden", JSON.stringify(list)); } catch {}
    hiddenKeys = new Set(list.map((x) => x.key));
  }
  const isHidden = (key) => hiddenKeys.has(key);
  function setHidden(item, on) {
    const list = hiddenList().filter((x) => x.key !== item.key);
    if (on) list.push({ key: item.key, title: item.title || "", poster: item.poster || "" });
    setHiddenList(list);
  }
  // appui long sur un élément (sans gêner le tap) : sert à masquer une suggestion
  function armLongPress(node, fn, ms = 550) {
    let t = null, fired = false, sx = 0, sy = 0;
    const clear = () => { clearTimeout(t); t = null; };
    node.addEventListener("pointerdown", (e) => {
      fired = false; sx = e.clientX; sy = e.clientY;
      clear();
      t = setTimeout(() => {
        t = null;
        fired = true;
        if (navigator.vibrate) navigator.vibrate(12);
        fn();
      }, ms);
    });
    node.addEventListener("pointermove", (e) => {
      if (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8) clear();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((ty) => node.addEventListener(ty, clear));
    // le clic qui suit l'appui long ne doit pas ouvrir la fiche
    node.addEventListener("click", (e) => {
      if (!fired) return;
      fired = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
  }

  function myProviders() {
    try { return JSON.parse(localStorage.getItem("season.providers") || "[]"); } catch { return []; }
  }
  function setMyProviders(list) {
    localStorage.setItem("season.providers", JSON.stringify(list));
  }
  // vignettes par ligne dans les grilles : "auto" (2 ou 3 selon l'écran) ou "2"…"5"
  function gridCols() {
    try { return localStorage.getItem("season.cols") || "auto"; } catch { return "auto"; }
  }
  function applyGridCols() {
    const n = gridCols();
    if (n === "auto") delete document.documentElement.dataset.cols;
    else document.documentElement.dataset.cols = n;
  }
  function setGridCols(n) {
    try { localStorage.setItem("season.cols", n); } catch {}
    applyGridCols();
  }
  applyGridCols();

  // ---- navigation (pile de vues) ---------------------------------------
  let stack = [];
  let navSeq = 0; // change à chaque changement d'écran (pour ignorer les rendus tardifs)
  function setTab(tab) {
    [...tabbar.children].forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle("is-active", on);
      // la barre défile (7 onglets) : on ramène l'onglet choisi sous les yeux.
      // Calcul à la main et `scrollLeft` direct : ni scrollIntoView ni
      // `behavior: "smooth"` ne bougent dans cette barre fixée.
      if (on) tabbar.scrollLeft = b.offsetLeft + b.offsetWidth / 2 - tabbar.clientWidth / 2;
    });
  }
  // Position de défilement : mémorisée sur l'écran qu'on quitte (go), rendue au retour
  // (back). L'écran se redessine au retour, souvent en 2 temps (spinner, puis contenu,
  // parfois chargé après coup) : on attend donc que la page soit assez haute.
  let pendingScroll = null;
  // c'est l'appli qui gère la position au retour, pas le navigateur
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  function render(node) {
    view.replaceChildren(node);
    const isSpinner = node.classList && node.classList.contains("spinner");
    if (pendingScroll && !isSpinner) {
      const pos = pendingScroll;
      pendingScroll = null;
      restoreScroll(pos);
      return;
    }
    view.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }
  function restoreScroll({ y, vy, seq }) {
    const until = Date.now() + 2500;
    let cancelled = false;
    const stop = () => { cancelled = true; };
    window.addEventListener("touchstart", stop, { once: true, passive: true });
    window.addEventListener("wheel", stop, { once: true, passive: true });
    const done = () => {
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("wheel", stop);
    };
    const step = () => {
      if (cancelled || seq !== navSeq) return done(); // elle a bougé ou changé d'écran
      view.scrollTop = vy;
      window.scrollTo(0, y);
      const ok = Math.abs(window.scrollY - y) < 2 && Math.abs(view.scrollTop - vy) < 2;
      if (!ok && Date.now() < until) setTimeout(step, 30); // (rAF s'arrête si la page est masquée)
      else done();
    };
    step();
  }
  // « À venir » n'est plus un onglet (20/09/2026) : c'est une page de Séries,
  // ouverte par l'horloge de la barre du haut. Le bouton ne s'affiche donc que
  // sur l'écran Séries lui-même.
  function syncAvenirBtn() {
    avenirBtn.hidden = !(currentTab === "listes" && stack.length <= 1);
  }
  function go(fn, title, { push = true } = {}) {
    closeOverlay();
    navSeq++;
    pendingScroll = null;
    if (push && stack.length) {
      const cur = stack[stack.length - 1];
      cur.y = window.scrollY;
      cur.vy = view.scrollTop;
    }
    if (push) stack.push({ fn, title });
    else stack[stack.length - 1] = { fn, title };
    backBtn.hidden = stack.length <= 1;
    syncAvenirBtn();
    topTitle.textContent = title;
    fn();
  }
  function back() {
    if (closeOverlay()) return; // 1er retour : referme l'affiche en grand
    if (stack.length <= 1) return;
    navSeq++;
    stack.pop();
    const top = stack[stack.length - 1];
    pendingScroll = top.y || top.vy ? { y: top.y || 0, vy: top.vy || 0, seq: navSeq } : null;
    backBtn.hidden = stack.length <= 1;
    syncAvenirBtn();
    topTitle.textContent = top.title;
    top.fn();
  }
  let currentTab = "listes";
  function resetTo(fn, title, tab) {
    stack = [];
    currentTab = tab;
    setTab(tab);
    go(fn, title);
    armBackTrap();
  }
  backBtn.addEventListener("click", back);
  avenirBtn.addEventListener("click", () => go(renderAVenir, "À venir"));

  // Bouton retour d'Android (le triangle) : il remonte l'historique du navigateur,
  // or l'appli change d'écran sans y toucher → sans ça, « retour » la fermait.
  // On garde une entrée « piège » au-dessus de la 1ʳᵉ : chaque retour la consomme,
  // on fait le retour dans l'appli, puis on la remet.
  let trapArmed = false;
  let exitAsked = false;
  function armBackTrap() {
    if (trapArmed) return;
    history.pushState({ seasonTrap: true }, "");
    trapArmed = true;
  }
  // après un rechargement (mise à jour auto), le piège est déjà en place
  if (history.state && history.state.seasonTrap) trapArmed = true;
  else history.replaceState({ seasonRoot: true }, "");
  window.addEventListener("popstate", () => {
    trapArmed = false;
    if (closeOverlay()) {
      armBackTrap(); // l'affiche en grand se referme, on reste sur la fiche
      return;
    }
    if (stack.length > 1) {
      back(); // fiche / réglages → écran précédent
    } else if (currentTab !== "listes") {
      resetTo(renderSeries, "Séries", "listes"); // autre onglet → Séries
    } else if (!exitAsked) {
      exitAsked = true;
      toast("Appuie encore pour quitter");
      setTimeout(() => { exitAsked = false; armBackTrap(); }, 2200);
      return;
    } else {
      return; // 2ᵉ appui : on laisse l'appli se fermer
    }
    exitAsked = false;
    armBackTrap();
  });
  document.getElementById("settingsBtn").addEventListener("click", () => {
    if (stack[stack.length - 1]?.fn === renderReglages) return;
    go(renderReglages, "Réglages");
  });
  // ---- barre d'onglets ---------------------------------------------------
  function selectTab(tab) {
    if (tab === "listes") resetTo(renderSeries, "Séries", "listes");
    if (tab === "films") resetTo(renderFilms, "Films", "films");
    if (tab === "recherche") resetTo(renderRecherche, "Recherche", "recherche");
    if (tab === "favoris") resetTo(renderFavoris, "Favoris", "favoris");
    if (tab === "journal") resetTo(renderJournal, "Journal", "journal");
    if (tab === "meslistes") resetTo(renderMesListes, "Listes", "meslistes");
    if (tab === "stats") resetTo(renderStats, "Stats", "stats");
  }
  // 7 onglets ne tiennent pas sur un écran de 360 px : la barre déborde et
  // défile. Le défilement est fait à la main (CSS `touch-action: none`) pour
  // que le navigateur ne s'en mêle pas : rester appuyé ~300 ms prend la barre
  // en main (courte vibration, onglets estompés), un glissement franc (> 6 px)
  // la prend aussi ; dans les deux cas on ne change pas d'onglet en relâchant.
  // Le choix se fait au relâchement, sur l'onglet touché à l'appui : appuyer
  // sur un onglet à moitié visible le fait défiler sous le doigt, et le clic
  // du navigateur serait alors perdu (cible différente entre appui et relâché).
  let panT = null, panning = false, panMoved = false;
  let panX = 0, panLeft = 0, panId = null, panBtn = null, panDone = 0;
  const grabBar = () => {
    panning = true;
    tabbar.classList.add("is-panning");
    if (panId != null) { try { tabbar.setPointerCapture(panId); } catch {} }
  };
  const endPan = () => {
    clearTimeout(panT); panT = null;
    if (panning && panId != null) { try { tabbar.releasePointerCapture(panId); } catch {} }
    panning = false; panId = null;
    tabbar.classList.remove("is-panning");
  };
  tabbar.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    panMoved = false; panning = false;
    panX = e.clientX; panLeft = tabbar.scrollLeft; panId = e.pointerId;
    panBtn = e.target.closest(".tab");
    clearTimeout(panT);
    panT = setTimeout(() => {
      grabBar();
      if (navigator.vibrate) navigator.vibrate(12);
    }, 300);
  });
  tabbar.addEventListener("pointermove", (e) => {
    if (panId == null || e.pointerId !== panId) return;
    const dx = e.clientX - panX;
    if (!panning) {
      if (Math.abs(dx) < 6) return;
      clearTimeout(panT); panT = null;
      grabBar();
    }
    panMoved = true;
    tabbar.scrollLeft = panLeft - dx;
    e.preventDefault();
  });
  tabbar.addEventListener("pointerup", (e) => {
    if (panId != null && e.pointerId !== panId) return;
    const btn = panBtn, moved = panMoved;
    endPan();
    panBtn = null;
    if (moved || !btn) return;
    panDone = Date.now(); // le clic qui suivra a déjà été traité
    selectTab(btn.dataset.tab);
  });
  tabbar.addEventListener("pointercancel", () => { panBtn = null; endPan(); });
  // clavier (Entrée / Espace) : le clic arrive sans événement pointeur
  tabbar.addEventListener("click", (e) => {
    if (Date.now() - panDone < 500 || panMoved) return;
    const b = e.target.closest(".tab");
    if (b) selectTab(b.dataset.tab);
  });
  // molette (PC) : elle est verticale, on la transforme en défilement horizontal
  tabbar.addEventListener("wheel", (e) => {
    const over = tabbar.scrollWidth - tabbar.clientWidth;
    if (over <= 0) return;
    tabbar.scrollLeft += e.deltaY || e.deltaX;
    e.preventDefault();
  }, { passive: false });

  // ---- calculs partagés -------------------------------------------------
  function watchedCount(episodes) {
    return episodes.reduce((n, e) => n + (e.watched ? 1 : 0), 0);
  }
  function computeStatus(show, episodes) {
    if (show.type === "movie") return show.watchedMovie ? "vu" : show.status || "a_voir";
    const total = show.totalEpisodes || episodes.length;
    const done = watchedCount(episodes);
    if (total > 0 && done >= total) return "vu";
    if (done > 0) return "en_cours";
    return show.status === "vu" ? "en_cours" : show.status || "a_voir";
  }
  async function recomputeAndSave(show) {
    const eps = show.type === "tv" ? await DB.episodesOf(show.key) : [];
    show.status = computeStatus(show, eps);
    show.watchedEpisodes = watchedCount(eps);
    const lastEp = eps.reduce((m, e) => (e.watched && e.watchedAt > m ? e.watchedAt : m), 0);
    show.lastWatchedAt = show.type === "movie" ? show.watchedAt || 0 : lastEp;
    await DB.putShow(show);
    return show;
  }

  // date de dernier visionnage d'une série/film (pour le tri « vu récemment »)
  function lastActivity(show, epMax) {
    if (show.type === "movie") return show.watchedAt || show.updatedAt || 0;
    return (epMax && epMax.get(show.key)) || show.lastWatchedAt || show.updatedAt || 0;
  }

  // ---- LISTES : onglet Séries et onglet Films ------------------------------
  let listesKind = "tv"; // "tv" (onglet Séries) ou "movie" (onglet Films)
  const listesFilters = { tv: "en_cours", movie: "a_voir" };
  const renderSeries = () => { listesKind = "tv"; return renderListes(); };
  const renderFilms = () => { listesKind = "movie"; return renderListes(); };
  const SORTS = {
    vu: "Vu récemment",
    titre: "Titre A→Z",
    populaire: "Popularité",
  };
  // « Ajout récent » (date d'entrée dans Season) retiré le 21/09/2026 : elle le
  // confondait avec « Vu récemment ». Un choix enregistré qui n'existe plus
  // retombe sur le tri par défaut (sinon le menu s'affichait sur autre chose
  // que le tri réellement appliqué).
  const sortOr = (v, def) => (Object.hasOwn(SORTS, v || "") ? v : def);
  let listesSort = sortOr(localStorage.getItem("season.sort"), "vu");
  async function renderListes() {
    render(spinner());
    const isMovie = listesKind === "movie";
    // un film n'a pas d'état « en cours » : s'il en traîne un, il compte comme « à voir »
    const statusOf = (s) => (isMovie && s.status === "en_cours" ? "a_voir" : s.status);
    const shows = (await DB.allShows()).filter((s) => s.type === listesKind);
    const listesFilter = listesFilters[listesKind];
    const counts = { a_voir: 0, en_cours: 0, vu: 0 };
    shows.forEach((s) => { counts[statusOf(s)] = (counts[statusOf(s)] || 0) + 1; });

    const wrap = el('<div></div>');
    if (!TMDB.hasKey()) {
      wrap.append(el(
        `<div class="config-warn">Clé TMDB manquante : ouvre <b>config.js</b> et colle ta clé pour pouvoir chercher des séries et des films.</div>`
      ));
    }

    const seg = el('<div class="segmented"></div>');
    for (const k of isMovie ? ["a_voir", "vu"] : ["a_voir", "en_cours", "vu"]) {
      const b = el(
        `<button data-k="${k}">${STATUS[k]}<span class="count-pill">${counts[k] || 0}</span></button>`
      );
      if (k === listesFilter) b.classList.add("is-active");
      b.addEventListener("click", () => { listesFilters[listesKind] = k; renderListes(); });
      seg.append(b);
    }
    wrap.append(seg);

    // barre de tri
    wrap.append(sortBar(listesSort, (v) => {
      listesSort = v;
      localStorage.setItem("season.sort", listesSort);
      renderListes();
    }));
    if (listesSort === "populaire") {
      const pb = popularityBar(shows, renderListes);
      if (pb) wrap.append(pb);
    }

    // dernier visionnage par série (à partir de tous les épisodes vus)
    const epMax = listesSort === "vu" ? await lastWatchedMap() : null;
    const sorters = sortersFor(epMax);
    let inList = shows.filter((s) => statusOf(s) === listesFilter).sort(sorters[listesSort] || sorters.vu);

    // « à voir » : n'afficher que ce qu'elle peut regarder sur ses plateformes
    const provs = myProviders();
    const provIds = provs.map((p) => p.id);
    const canFilter = listesFilter === "a_voir" && provs.length > 0;
    if (canFilter) {
      const on = localStorage.getItem("season.onlyMine") === "1";
      const row = el('<div class="filter-row"></div>');
      const tog = el(`<button class="genre-tag${on ? " is-on" : ""}">▶ Sur mes plateformes seulement</button>`);
      tog.addEventListener("click", () => {
        try { localStorage.setItem("season.onlyMine", on ? "0" : "1"); } catch {}
        renderListes();
      });
      row.append(tog);
      wrap.append(row);
      if (on) {
        // ce qu'on sait déjà (relevé de moins d'une semaine) s'affiche tout de suite ;
        // le reste se vérifie à la demande, une requête par titre
        const aVerifier = inList.filter((s) => s.tmdbId && !availFresh(s));
        inList = inList.filter((s) => availFresh(s) && availOnMine(s, provIds));
        if (aVerifier.length) {
          const bar = el('<div class="reco-note" style="margin:-4px 0 12px"></div>');
          const txt = el(`<span>${aVerifier.length} titre${aVerifier.length > 1 ? "s" : ""} pas encore vérifié${
            aVerifier.length > 1 ? "s" : ""}. </span>`);
          const btn = el('<button class="link-btn">↻ Vérifier</button>');
          bar.append(txt, btn);
          btn.addEventListener("click", async () => {
            if (!navigator.onLine || !TMDB.hasKey()) { toast("Pas de réseau"); return; }
            btn.hidden = true;
            await fillAvailability(aVerifier, (d, t) => { txt.textContent = `Vérification… ${d}/${t}`; });
            renderListes();
          });
          wrap.append(bar);
        }
      }
    }

    if (!inList.length) {
      wrap.append(el(
        `<div class="empty"><span class="big">▦</span>Rien dans « ${STATUS[listesFilter]} ».<br>` +
        `Utilise l'onglet Recherche pour ajouter ${isMovie ? "un film" : "une série"}.` +
        `</div>`
      ));
    } else {
      // onglets Séries et Films : affiches seules, sans titre ni légende dessous
      // (demandé le 18/09/2026) ; la barre de progression des séries reste
      const grid = el('<div class="poster-grid no-caption"></div>');
      inList.forEach((s) => grid.append(posterCard(s)));
      wrap.append(grid);
    }
    render(wrap);
  }

  function posterCard(show) {
    const total = show.totalEpisodes || 0;
    const done = show.watchedEpisodes || 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const img = show.poster
      ? `<img loading="lazy" src="${TMDB.poster(show.poster)}" alt="">`
      : `<div class="poster-fallback">${esc(show.title)}</div>`;
    const bar =
      show.type === "tv" && total
        ? `<div class="progress-bar"><i style="width:${pct}%"></i></div>`
        : "";
    const sub =
      show.type === "tv"
        ? total
          ? `${done}/${total} épisodes`
          : "Série"
        : "Film";
    const card = el(
      `<button class="poster-card" aria-label="${esc(show.title)}">
        <div class="poster-wrap">
          ${img}${bar}
        </div>
        <div class="poster-title">${esc(show.title)}</div>
        <div class="poster-sub">${sub}</div>
      </button>`
    );
    card.addEventListener("click", () => go(() => renderDetail(show.key), show.title));
    return card;
  }

  // dernier épisode vu par série (sert aux tris « Vu récemment »)
  async function lastWatchedMap() {
    const m = new Map();
    for (const e of await DB.allEpisodes()) {
      if (e.watched && e.watchedAt) {
        const cur = m.get(e.showKey) || 0;
        if (e.watchedAt > cur) m.set(e.showKey, e.watchedAt);
      }
    }
    return m;
  }
  function sortersFor(epMax) {
    const parTitre = (a, b) => (a.title || "").localeCompare(b.title || "", "fr", { sensitivity: "base" });
    return {
      vu: (a, b) => lastActivity(b, epMax) - lastActivity(a, epMax),
      titre: parTitre,
      // popularité TMDB ; les fiches qui ne l'ont pas encore passent en dernier
      populaire: (a, b) => (b.popularity || 0) - (a.popularity || 0) || parTitre(a, b),
    };
  }
  // La popularité n'était pas enregistrée avant le 20/09/2026 : les fiches d'avant
  // ne l'ont pas. Une barre propose de la récupérer (une requête par titre, par
  // paquets de 12) ; sans ça elles se rangent simplement en dernier.
  let popFilling = false;
  function popularityBar(shows, onDone) {
    const missing = shows.filter((s) => s.tmdbId && s.popularity == null);
    if (!missing.length || popFilling) return null;
    const bar = el('<div class="reco-note" style="margin:-8px 0 12px"></div>');
    const plur = missing.length > 1 ? "s" : "";
    const txt = el(`<span>Popularité inconnue pour ${missing.length} titre${plur} (rangé${plur} en dernier). </span>`);
    const btn = el('<button class="link-btn">↻ Récupérer</button>');
    bar.append(txt, btn);
    btn.addEventListener("click", async () => {
      if (popFilling) return;
      if (!navigator.onLine || !TMDB.hasKey()) { toast("Pas de réseau"); return; }
      popFilling = true;
      btn.hidden = true;
      let done = 0;
      txt.textContent = `Popularité… 0/${missing.length}`;
      await poolRun(missing, 12, async (s) => {
        try {
          s.popularity = await TMDB.popularityOf(s.type, s.tmdbId);
          await DB.putShowQuiet(s); // sans toucher updatedAt
        } catch { /* on réessaiera la prochaine fois */ }
        txt.textContent = `Popularité… ${++done}/${missing.length}`;
      });
      popFilling = false;
      onDone();
    });
    return bar;
  }
  // barre de tri commune (Séries / Films / Favoris)
  function sortBar(current, onChange, choices = SORTS) {
    const bar = el('<div class="sort-bar"><label>Trier :</label><select></select></div>');
    const sel = bar.querySelector("select");
    for (const [k, label] of Object.entries(choices)) {
      const o = el(`<option value="${k}">${label}</option>`);
      if (k === current) o.selected = true;
      sel.append(o);
    }
    sel.addEventListener("change", () => onChange(sel.value));
    return bar;
  }

  // ---- FAVORIS ---------------------------------------------------------
  // `show.favorite` : coché à la main par le ♥ de la fiche (repris une fois des
  // imports TV Time / Letterboxd, voir seedFavorites).
  const FAV_KINDS = { all: "Tout", tv: "Séries", movie: "Films" };
  let favKind = localStorage.getItem("season.favKind") || "all";
  let favSort = sortOr(localStorage.getItem("season.favSort"), "titre");
  async function renderFavoris() {
    render(spinner());
    const favs = (await DB.allShows()).filter((s) => s.favorite);
    const counts = { all: favs.length, tv: 0, movie: 0 };
    favs.forEach((s) => { counts[s.type] = (counts[s.type] || 0) + 1; });

    const wrap = el('<div></div>');
    const seg = el('<div class="segmented"></div>');
    for (const [k, label] of Object.entries(FAV_KINDS)) {
      const b = el(`<button data-k="${k}">${label}<span class="count-pill">${counts[k] || 0}</span></button>`);
      if (k === favKind) b.classList.add("is-active");
      b.addEventListener("click", () => {
        favKind = k;
        try { localStorage.setItem("season.favKind", k); } catch {}
        renderFavoris();
      });
      seg.append(b);
    }
    wrap.append(seg);
    wrap.append(sortBar(favSort, (v) => {
      favSort = v;
      try { localStorage.setItem("season.favSort", v); } catch {}
      renderFavoris();
    }));
    if (favSort === "populaire") {
      const pb = popularityBar(favs, renderFavoris);
      if (pb) wrap.append(pb);
    }

    const epMax = favSort === "vu" ? await lastWatchedMap() : null;
    const sorters = sortersFor(epMax);
    const list = favs
      .filter((s) => favKind === "all" || s.type === favKind)
      .sort(sorters[favSort] || sorters.titre);

    if (!list.length) {
      wrap.append(el(
        `<div class="empty"><span class="big">♥</span>` +
        (favs.length
          ? `Aucun favori dans « ${FAV_KINDS[favKind]} ».`
          : `Pas encore de favori.<br>Ouvre une fiche et touche <b>♥ Ajouter aux favoris</b>.`) +
        `</div>`
      ));
    } else {
      const grid = el('<div class="poster-grid no-caption"></div>');
      list.forEach((s) => grid.append(posterCard(s)));
      wrap.append(grid);
    }
    render(wrap);
  }

  // Favoris repris une seule fois des imports (TV Time, Letterboxd) : son choix
  // du 20/09/2026 — ★ favoris TV Time, ★ favoris de profil et ♥ films aimés.
  async function seedFavorites() {
    try {
      if (localStorage.getItem("season.favSeed") === "1") return;
      const marks = ["Favori sur TV Time", "Film favori sur Letterboxd", "Aimé sur Letterboxd"];
      let n = 0;
      for (const s of await DB.allShows()) {
        if (s.favorite) continue;
        const r = s.review || "";
        if (marks.some((m) => r.includes(m))) { s.favorite = true; await DB.putShow(s); n++; }
      }
      localStorage.setItem("season.favSeed", "1");
      if (n) toast(`${n} favoris repris de TV Time / Letterboxd`);
    } catch {}
  }

  // ---- RECHERCHE -----------------------------------------------------
  let lastQuery = "";
  function renderRecherche() {
    const wrap = el('<div></div>');
    if (!TMDB.hasKey()) {
      wrap.append(el(
        `<div class="config-warn">Clé TMDB manquante : ouvre <b>config.js</b>, colle ta clé (v3 auth), enregistre et recharge.</div>`
      ));
    }
    const box = el(
      `<div class="search-box"><input type="search" placeholder="Titre d'une série ou d'un film…" autocomplete="off" enterkeyhint="search"></div>`
    );
    const input = box.querySelector("input");
    const results = el('<div id="results"></div>');
    wrap.append(box, results);
    render(wrap);

    input.value = lastQuery;
    let t;
    const run = async () => {
      const q = input.value.trim();
      lastQuery = q;
      if (q.length < 2) { results.replaceChildren(); return; }
      results.replaceChildren(spinner());
      try {
        const list = await TMDB.searchMulti(q);
        if (input.value.trim() !== q) return;
        if (!list.length) {
          results.replaceChildren(el('<div class="empty">Aucun résultat.</div>'));
          return;
        }
        const frag = document.createDocumentFragment();
        list.slice(0, 20).forEach((r) => frag.append(resultRow(r)));
        results.replaceChildren(frag);
      } catch (err) {
        results.replaceChildren(el(
          `<div class="empty">${err.message === "no-key"
            ? "Ajoute ta clé TMDB dans config.js."
            : "Recherche impossible (pas de réseau ?)."}</div>`
        ));
      }
    };
    input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(run, 350); });
    input.addEventListener("search", run);
    setTimeout(() => input.focus(), 50);
    if (lastQuery) run();
  }

  function resultRow(r) {
    const thumb = r.poster
      ? `<img class="thumb" loading="lazy" src="${TMDB.poster(r.poster, "w185")}" alt="">`
      : `<div class="thumb-fallback">${r.type === "tv" ? "📺" : "🎬"}</div>`;
    const row = el(
      `<div class="result-row">
        ${thumb}
        <div class="result-meta">
          <span class="tag">${r.type === "tv" ? "Série" : "Film"}${r.year ? " · " + r.year : ""}</span>
          <h3>${esc(r.title)}</h3>
          <p>${esc(r.overview || "")}</p>
        </div>
      </div>`
    );
    row.addEventListener("click", () =>
      go(() => renderDetail(`${r.type}:${r.tmdbId}`, r), r.title)
    );
    return row;
  }

  // ---- FICHE --------------------------------------------------------
  // Une fiche déjà suivie s'affiche tout de suite depuis le téléphone ; la mise à jour
  // TMDB (infos + épisodes) se fait ensuite en tâche de fond et la fiche est redessinée
  // sur place, sans rond de chargement ni retour en haut. (Avant : spinner, attente
  // TMDB, puis 2ᵉ rendu complet → la page « sautait ».)
  async function renderDetail(key, fallbackSearchItem) {
    const seq = navSeq;
    const still = () => seq === navSeq; // toujours sur cette fiche ?
    const [type, id] = key.split(":");
    let show = await DB.getShow(key);
    const saved = !!show;
    const online = navigator.onLine;

    const fetchMeta = async (base) => {
      const fresh = type === "tv" ? await TMDB.tv(id) : await TMDB.movie(id);
      const s = base
        ? Object.assign(base, fresh, {
            status: base.status,
            rating: base.rating,
            review: base.review,
            watchedMovie: base.watchedMovie,
            createdAt: base.createdAt,
          })
        : fresh;
      s.metaAt = Date.now();
      if (type === "tv") s.totalEpisodes = (s.seasons || []).reduce((n, x) => n + x.count, 0);
      return s;
    };

    if (!show) {
      // pas encore suivi : il faut TMDB avant d'afficher (spinner seulement si c'est long)
      const spin = setTimeout(() => still() && render(spinner()), 150);
      try {
        show = await fetchMeta(null);
      } catch (err) {
        if (fallbackSearchItem) {
          const f = fallbackSearchItem;
          show = { key, type, tmdbId: +id, title: f.title, year: f.year,
                   overview: f.overview, poster: f.poster, genres: [], seasons: [] };
        } else {
          clearTimeout(spin);
          if (still()) render(el(`<div class="empty">Impossible de charger cette fiche.<br>${
            navigator.onLine ? "Vérifie ta clé TMDB." : "Pas de réseau."
          }</div>`));
          return;
        }
      }
      clearTimeout(spin);
    }

    const draw = async (inPlace) => {
      const episodes = type === "tv" ? await DB.episodesOf(key) : [];
      const watchedMap = new Map(episodes.map((e) => [`${e.season}:${e.episode}`, e]));
      if (!still()) return;
      const node = detailNode(show, saved, watchedMap);
      if (!inPlace) { render(node); return; }
      // redessin sur place : garde la position, les saisons ouvertes et les blocs
      // déjà chargés (« Où regarder », suggestions) pour qu'ils ne se rechargent pas
      const y = window.scrollY, vy = view.scrollTop;
      const open = [...view.querySelectorAll(".season.open .s-name")].map((x) => x.textContent);
      for (const sel of [".wtw", ".related"]) {
        const old = view.querySelector(sel), neu = node.querySelector(sel);
        if (old && neu) neu.replaceWith(old);
      }
      node.querySelectorAll(".season").forEach((s) => {
        if (open.includes(s.querySelector(".s-name")?.textContent)) s.querySelector(".season-head")?.click();
      });
      view.replaceChildren(node);
      view.scrollTop = vy;
      window.scrollTo(0, y);
    };
    await draw(false);
    if (!saved || !online) return;

    // tâche de fond : infos TMDB (> 12 h) puis épisodes d'une série (> 12 h)
    let changed = false;
    // (sans mots-clés = enregistrée avant les thèmes : on les récupère tout de suite)
    // (sans bannière = enregistrée avant la nouvelle en-tête : on la complète)
    if (staleMeta(show) || !Array.isArray(show.keywordIds) || show.backdrop === undefined) {
      try { await fetchMeta(show); await DB.putShow(show); changed = true; } catch {}
    }
    if (type === "tv" && staleMeta({ metaAt: show.epAt })) {
      if (await syncEpisodes(show)) changed = true;
    }
    // pas de redessin pendant qu'elle tape dans un champ (sa saisie serait perdue)
    const typing = view.contains(document.activeElement) && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName);
    if (changed && still() && !typing) draw(true);
  }

  function staleMeta(show) {
    return !show.metaAt || Date.now() - show.metaAt > 12 * 3600 * 1000;
  }

  function detailNode(show, saved, watchedMap) {
    const wrap = el('<div></div>');
    const posterImg = show.poster
      ? `<img src="${TMDB.poster(show.poster)}" alt="">`
      : `<div class="poster-fallback">${esc(show.title)}</div>`;
    // en-tête façon Letterboxd : bannière en haut, affiche posée dessus à droite,
    // gros titre, année · réalisation, durée et bande-annonce
    const bd = show.backdrop ? TMDB.backdrop(show.backdrop) : null;
    const kind = show.type === "tv" ? "Série" : "Film";
    const dirLabel = show.type === "tv" ? "Créée par" : "Réalisé par";
    const line1 = [kind, show.year].filter(Boolean).join(" · ");
    const duree = show.type === "movie"
      ? (show.runtime ? fmtDuration(show.runtime) : "")
      : (show.epRunTime ? `${show.epRunTime} min / épisode` : "");
    wrap.append(el(
      `<div class="detail-hero${bd ? " has-bd" : ""}">
        ${bd ? `<div class="hero-bd"><img src="${bd}" alt=""></div>` : ""}
        <div class="hero-body">
          <div class="poster-wrap">${posterImg}</div>
          <h2>${esc(show.title)}</h2>
          <div class="sub">${esc(line1)}${show.director
            ? ` · <span class="hero-by">${dirLabel}</span><br><b>${esc(show.director)}</b>`
            : ""}</div>
          <div class="hero-line">
            ${show.trailer
              ? `<a class="trailer-btn" href="https://www.youtube.com/watch?v=${esc(show.trailer)}" target="_blank" rel="noopener">▶ Bande-annonce</a>`
              : ""}
            ${duree ? `<span class="hero-run">${esc(duree)}</span>` : ""}
          </div>
          <div class="genres"></div>
        </div>
      </div>`
    ));
    // l'affiche en grand quand on appuie dessus
    const posterBox = wrap.querySelector(".detail-hero .poster-wrap");
    if (show.poster) {
      posterBox.classList.add("is-tappable");
      posterBox.addEventListener("click", () => openPoster(show));
    }
    // boutons sous le sous-titre : ♥ favori (fiche suivie) et ≡ Listes (toujours)
    const actions = el('<div class="detail-actions"></div>');
    if (saved) {
      const favBtn = el('<button class="fav-btn" type="button"><span class="fav-ico">♥</span><span class="fav-lbl"></span></button>');
      const paintFav = () => {
        favBtn.classList.toggle("is-on", !!show.favorite);
        favBtn.querySelector(".fav-lbl").textContent = show.favorite ? "Favori" : "Ajouter aux favoris";
        favBtn.setAttribute("aria-pressed", show.favorite ? "true" : "false");
      };
      favBtn.addEventListener("click", async () => {
        show.favorite = !show.favorite;
        show.updatedAt = Date.now();
        await DB.putShow(show);
        paintFav();
        toast(show.favorite ? "Ajouté aux favoris" : "Retiré des favoris");
      });
      paintFav();
      actions.append(favBtn);
    }
    // ⊘ Pas intéressé : seulement sur une fiche qu'elle ne suit pas (ses propres
    // titres ne sont de toute façon jamais proposés)
    if (!saved) {
      const hideBtn = el('<button class="fav-btn" type="button"><span class="fav-ico">⊘</span><span class="fav-lbl"></span></button>');
      const item = { key: show.key, title: show.title, poster: show.poster };
      const paintHide = () => {
        const on = isHidden(show.key);
        hideBtn.classList.toggle("is-on", on);
        hideBtn.querySelector(".fav-lbl").textContent = on ? "Masqué — réafficher" : "Pas intéressé";
        hideBtn.setAttribute("aria-pressed", on ? "true" : "false");
      };
      hideBtn.addEventListener("click", () => {
        const on = !isHidden(show.key);
        setHidden(item, on);
        paintHide();
        toast(on ? "Ne sera plus proposé" : "Proposé de nouveau");
      });
      paintHide();
      actions.append(hideBtn);
    }
    // ≡ Listes : marche aussi sur une fiche pas encore suivie (le titre est recopié)
    const picker = listPicker(show);
    const listsBtn = el('<button class="fav-btn" type="button"><span class="fav-ico">≡</span><span class="fav-lbl">Listes</span></button>');
    listsBtn.addEventListener("click", () => {
      picker.box.hidden = !picker.box.hidden;
      listsBtn.classList.toggle("is-on", !picker.box.hidden);
      if (!picker.box.hidden) picker.draw();
    });
    actions.append(listsBtn);
    wrap.querySelector(".detail-hero .hero-line").after(actions);
    wrap.querySelector(".detail-hero").after(picker.box);
    // thèmes (themes.js) → page des titres de ce thème pas encore vus, sur ses plateformes ;
    // fiche suivie : ✎ pour corriger à la main (ajouts / retraits prioritaires sur l'auto)
    const tagsBox = wrap.querySelector(".genres");
    const editor = el('<div class="theme-editor" hidden></div>');
    const drawTags = () => {
      tagsBox.replaceChildren(...THEMES.themesOf(show).map((t) => {
        const b = el(`<button class="genre-tag">${esc(t.label)}</button>`);
        b.addEventListener("click", () => go(() => renderTheme(show.type, t.id), t.label));
        return b;
      }));
      if (saved) {
        const ed = el(`<button class="genre-tag tag-edit" aria-label="Modifier les thèmes">✎</button>`);
        ed.addEventListener("click", () => { editor.hidden = !editor.hidden; if (!editor.hidden) drawEditor(); });
        tagsBox.append(ed);
      }
    };
    const drawEditor = () => {
      const auto = new Set(THEMES.autoThemes(show));
      const on = new Set(THEMES.themesOf(show).map((t) => t.id));
      editor.replaceChildren(el('<div class="section-title">Thèmes de ce titre</div>'));
      const box = el('<div class="theme-pick"></div>');
      for (const t of THEMES.list) {
        const b = el(`<button class="genre-tag${on.has(t.id) ? " is-on" : ""}">${t.parent ? "· " : ""}${esc(t.label)}</button>`);
        b.addEventListener("click", async () => {
          const add = new Set(show.tagsAdd || []), rem = new Set(show.tagsRemove || []);
          if (on.has(t.id)) { add.delete(t.id); if (auto.has(t.id)) rem.add(t.id); }
          else { rem.delete(t.id); if (!auto.has(t.id)) add.add(t.id); }
          show.tagsAdd = [...add];
          show.tagsRemove = [...rem];
          await DB.putShow(show);
          drawTags();
          drawEditor();
        });
        box.append(b);
      }
      editor.append(box, el('<div class="poster-sub" style="margin-top:6px">Tes choix priment sur le classement automatique.</div>'));
    };
    drawTags();
    wrap.append(editor);

    if (show.tagline) wrap.append(el(`<div class="tagline">${esc(show.tagline)}</div>`));
    if (show.overview) wrap.append(el(`<p class="overview">${esc(show.overview)}</p>`));
    wrap.append(whereToWatchSection(show));

    if (!saved) {
      // pas encore suivi : choisir « À voir » ou « Vu » l'ajoute directement
      wrap.append(el('<div class="section-title">Statut</div>'));
      const row = el('<div class="status-row"></div>');
      for (const k of ["a_voir", "vu"]) {
        const b = el(`<button data-k="${k}">${STATUS[k]}</button>`);
        b.addEventListener("click", () => addWithStatus(show, k, row));
        row.append(b);
      }
      wrap.append(row);
      wrap.append(relatedSection(show));
      return wrap;
    }

    // --- statut ---
    wrap.append(el('<div class="section-title">Statut</div>'));
    const statusRow = el('<div class="status-row"></div>');
    const keys = show.type === "movie" ? ["a_voir", "vu"] : ["a_voir", "en_cours", "vu"];
    for (const k of keys) {
      const b = el(`<button data-k="${k}">${STATUS[k]}</button>`);
      if (show.status === k) b.classList.add("is-active");
      if (show.type === "tv" && k === "en_cours") {
        // pour une série, « en cours » se déclenche tout seul dès le 1ᵉʳ épisode coché
        b.style.pointerEvents = "none";
        b.style.opacity = show.status === "en_cours" ? "1" : "0.45";
      } else {
        b.addEventListener("click", () => setStatusManually(show, k));
      }
      statusRow.append(b);
    }
    wrap.append(statusRow);

    // --- note ---
    wrap.append(el('<div class="section-title">Ma note</div>'));
    // demi-étoiles : moitié gauche d'une étoile = x,5 ; moitié droite = x ;
    // retaper la note actuelle la remet à 0
    const stars = el('<div class="stars"></div>');
    const paint = () => {
      stars.querySelectorAll("span").forEach((x) => {
        const v = +x.dataset.v, r = show.rating || 0;
        x.classList.toggle("on", v <= r);
        x.classList.toggle("half", v - 0.5 === r);
      });
    };
    for (let i = 1; i <= 5; i++) {
      const s = el(`<span data-v="${i}">★</span>`);
      s.addEventListener("click", async (ev) => {
        const box = s.getBoundingClientRect();
        const v = ev.clientX - box.left < box.width / 2 ? i - 0.5 : i;
        show.rating = show.rating === v ? 0 : v;
        await DB.putShow(show);
        paint();
      });
      stars.append(s);
    }
    // (la valeur chiffrée « x / 5 » sous les étoiles a été retirée le 21/09/2026)
    paint();
    wrap.append(stars);

    // (« Mon avis » retiré de la fiche le 21/09/2026, sur sa demande. Le champ
    // `show.review` reste écrit en base et dans l'export : il porte les avis
    // importés de Letterboxd et les marques « ★ Favori sur TV Time » /
    // « ♥ Aimé sur Letterboxd » dont `seedFavorites` se sert.)

    // --- saisons / épisodes ---
    if (show.type === "tv" && show.seasons && show.seasons.length) {
      wrap.append(el('<div class="section-title">Épisodes</div>'));
      show.seasons.forEach((s) => wrap.append(seasonBlock(show, s, watchedMap)));
    }

    wrap.append(relatedSection(show));

    // --- retirer ---
    const del = el('<button class="link-btn" style="color:var(--warn);margin-top:24px">Retirer de mes listes</button>');
    del.addEventListener("click", async () => {
      if (!confirm(`Retirer « ${show.title} » ? Ta progression et ta note seront effacées.`)) return;
      await DB.deleteShow(show.key);
      toast("Retiré");
      back();
    });
    wrap.append(del);

    return wrap;
  }

  // ---- affiche en grand ---------------------------------------------------
  // Superposition plein écran ; un tap ou le bouton retour d'Android la referme.
  let posterOverlay = null;
  function closeOverlay() {
    if (!posterOverlay) return false;
    posterOverlay.remove();
    posterOverlay = null;
    return true;
  }
  function openPoster(show) {
    closeOverlay();
    const box = el(
      `<div class="poster-full" role="dialog" aria-label="${esc(show.title)}">
        <img src="${TMDB.poster(show.poster, "w780")}" alt="${esc(show.title)}">
        <button class="poster-full-close" aria-label="Fermer">✕</button>
      </div>`
    );
    box.addEventListener("click", closeOverlay);
    document.body.append(box);
    posterOverlay = box;
  }

  // ---- « Où regarder » (fiche) --------------------------------------------
  const wtwCache = new Map(); // « Où regarder » par fiche, le temps de la session
  function whereToWatchSection(show) {
    const box = el('<div class="wtw"></div>');
    if (!navigator.onLine || !TMDB.hasKey()) return box;
    // copie : le rendu annote les plateformes (isMine…), le cache doit rester brut
    const fill = (raw) => {
      const r = JSON.parse(JSON.stringify(raw));
      box.classList.remove("is-loading");
      box.replaceChildren();
      const mine = new Set(myProviders().map((p) => p.id));
      // ses plateformes d'abord, puis l'ordre TMDB ; sans doublon d'une ligne à l'autre
      const used = new Set();
      // variantes d'une même plateforme (« Netflix Standard with Ads », « HBO Max Amazon
      // Channel »…) fondues dans la principale ; si la variante est à elle, la principale l'est
      const pick = (...lists) => {
        const all = lists.flat().filter((p) => !used.has(p.id) && used.add(p.id));
        const base = (p) => all.find((q) => q !== p && p.name.startsWith(q.name + " "));
        const kept = all.filter((p) => !base(p));
        all.filter(base).forEach((v) => { if (mine.has(v.id)) base(v).mineVia = true; });
        kept.forEach((p) => { p.isMine = mine.has(p.id) || !!p.mineVia; });
        return kept.sort((a, b) => b.isMine - a.isMine);
      };
      // Une seule rangée, sans en-tête « Abonnement » / « Gratuit » (21/09/2026) :
      // les deux sont fondus dans la même liste, ses plateformes en tête (`pick`
      // trie sur `isMine`, le reste garde l'ordre TMDB).
      // (pas de location / achat : elle ne loue pas, demandé le 18/09/2026)
      const list = pick(r.flatrate, r.free, r.ads);

      box.append(el('<div class="section-title">Où regarder</div>'));
      if (!list.length) {
        box.append(el('<div class="poster-sub">Pas disponible en abonnement ni gratuitement en France pour l\'instant.</div>'));
        return;
      }
      // Logo seul, en grand (21/09/2026 : le nom écrit à côté a été retiré).
      // Le nom reste lisible par un lecteur d'écran (`alt`) et à l'appui long
      // (`title`) ; sans logo, on retombe sur le nom écrit.
      const chip = (p) => el(
        p.logo
          ? `<span class="wtw-chip${p.isMine ? " is-mine" : ""}" title="${esc(p.name)}"><img src="${
              TMDB.logo(p.logo, "w154")}" alt="${esc(p.name)}" loading="lazy"></span>`
          : `<span class="wtw-chip wtw-noimg${p.isMine ? " is-mine" : ""}">${esc(p.name)}</span>`
      );
      const row = el('<div class="wtw-list"></div>');
      const MAX = 6; // ce qui tient sur une ligne de 360 px ; au-delà, bouton « +N »
      list.slice(0, MAX).forEach((p) => row.append(chip(p)));
      if (list.length > MAX) {
        const more = el(`<button class="wtw-chip wtw-more">+${list.length - MAX}</button>`);
        more.addEventListener("click", () => { more.replaceWith(...list.slice(MAX).map(chip)); });
        row.append(more);
      }
      box.append(row);
      // (lien « Source : JustWatch » retiré le 21/09/2026, sa demande — voir CLAUDE.md)
    };
    // déjà vu pendant la session → affichage immédiat, sans décalage
    const cached = wtwCache.get(show.key);
    if (cached) { fill(cached); return box; }
    // sinon on réserve la place pendant le chargement (évite que la page saute)
    box.classList.add("is-loading");
    box.append(el('<div class="section-title">Où regarder</div>'), el('<div class="wtw-skel"></div>'));
    TMDB.whereToWatch(show.type, show.tmdbId || show.key.split(":")[1])
      .then((r) => { wtwCache.set(show.key, r); fill(r); })
      .catch(() => { box.classList.remove("is-loading"); box.replaceChildren(); });
    return box;
  }

  // ---- « Séries / Films similaires » : suggestions pas encore vues --------
  const relatedCache = new Map();
  function relatedSection(show) {
    const box = el('<div class="related"></div>');
    if (!navigator.onLine || !TMDB.hasKey()) return box;
    box.append(spinner());
    const provs = myProviders();
    const provById = new Map(provs.map((p) => [p.id, p]));
    (async () => {
      try {
        // on masque ce qui est vu ou commencé ; « à voir » reste (sans étiquette)
        const mine = new Map((await DB.allShows()).map((s) => [s.key, s.status]));
        const hidden = (k) => k === show.key || isHidden(k) ||
          mine.get(k) === "vu" || mine.get(k) === "en_cours";
        const cacheKey = show.key + "|" + provs.map((p) => p.id).join(",");
        let data = relatedCache.get(cacheKey);
        if (!data) {
          // on dit aussi à TMDB de sauter ce qu'elle a masqué : il propose autre chose
          const skip = new Set([...[...mine.keys()].filter(hidden), ...hiddenKeys]);
          data = await TMDB.related(show.type, show.tmdbId || show.key.split(":")[1],
            { prov: provs.map((p) => p.id), skip });
          relatedCache.set(cacheKey, data);
        }
        const keep = (list) => list.filter((x) => !hidden(`${x.type}:${x.tmdbId}`)).slice(0, 15);
        const same = keep(data.same);
        const cross = keep(data.cross);
        box.replaceChildren();
        // façon Letterboxd : titre de section + « Tout voir » à droite, puis une
        // rangée d'affiches seules qui défile (le titre reste en `aria-label`)
        const row = (title, list) => {
          if (!list.length) return;
          const head = el(`<div class="section-head"><div class="section-title">${title}</div></div>`);
          const more = el('<button class="link-btn">Tout voir</button>');
          more.addEventListener("click", () => go(() => renderSimilaires(show, title, list), title));
          head.append(more);
          box.append(head);
          const r = el('<div class="reco-row no-caption"></div>');
          list.forEach((x) => r.append(recoCard(x, provById, { onHide: (y, card) => card.remove() })));
          box.append(r);
        };
        row(show.type === "tv" ? "Séries similaires" : "Films similaires", same);
        row(show.type === "tv" ? "Films similaires" : "Séries similaires", cross);
        const none = !same.length && !cross.length;
        const note = provs.length
          ? `${none ? "Aucune suggestion sur tes plateformes. " : "Seulement sur tes plateformes. "}`
          : "Toutes plateformes confondues. ";
        const foot = el(`<div class="reco-note">${note}<button class="link-btn">${
          provs.length ? "Modifier mes plateformes" : "Choisir mes plateformes"}</button></div>`);
        foot.querySelector("button").addEventListener("click", () => go(renderReglages, "Réglages"));
        box.append(foot);
      } catch {
        box.replaceChildren();
      }
    })();
    return box;
  }

  // « Tout voir » d'une rangée de suggestions : la même liste, en grille
  function renderSimilaires(show, title, list) {
    const provById = new Map(myProviders().map((p) => [p.id, p]));
    const wrap = el('<div></div>');
    wrap.append(el(`<div class="poster-sub" style="margin:-4px 0 12px">${
      esc(title)} · d'après « ${esc(show.title)} »</div>`));
    const grid = el('<div class="poster-grid no-caption"></div>');
    const draw = () => grid.replaceChildren(
      ...list.filter((x) => !isHidden(`${x.type}:${x.tmdbId}`))
        .map((x) => recoCard(x, provById, { onHide: () => draw() }))
    );
    draw();
    wrap.append(grid);
    render(wrap);
  }

  function recoCard(x, provById = new Map(), { onHide } = {}) {
    // logo de la (1ʳᵉ) plateforme où le titre est dispo, parmi les siennes
    const p = (x.on || []).map((id) => provById.get(id)).find((q) => q && q.logo);
    const card = el(
      `<button class="poster-card reco-card" aria-label="${esc(x.title)}">
        <div class="poster-wrap">
          <img loading="lazy" src="${TMDB.poster(x.poster, "w185")}" alt="">
          ${p ? `<img class="prov-logo" src="${TMDB.logo(p.logo)}" alt="${esc(p.name)}" title="${esc(p.name)}">` : ""}
        </div>
        <div class="poster-title">${esc(x.title)}</div>
        <div class="poster-sub">${x.type === "tv" ? "Série" : "Film"}${x.year ? " · " + x.year : ""}</div>
      </button>`
    );
    card.addEventListener("click", () => go(() => renderDetail(`${x.type}:${x.tmdbId}`, x), x.title));
    // appui long : « pas intéressé », la vignette disparaît tout de suite
    if (onHide) {
      armLongPress(card, () => {
        setHidden({ key: `${x.type}:${x.tmdbId}`, title: x.title, poster: x.poster }, true);
        toast("Pas intéressé — masqué des suggestions");
        onHide(x, card);
      });
    }
    return card;
  }

  // Disponibilité gardée sur la fiche (`avail` = toutes les plateformes où le titre
  // passe en abonnement / gratuit, `availAt` = date du relevé) : la liste « à voir »
  // peut ainsi être filtrée sans tout redemander à chaque affichage. Relevé refait au
  // bout d'une semaine (les catalogues bougent).
  const AVAIL_TTL = 7 * 24 * 3600 * 1000;
  const availFresh = (s) => s.availAt && Date.now() - s.availAt < AVAIL_TTL;
  const availOnMine = (s, ids) => (s.avail || []).some((id) => ids.includes(id));
  async function fillAvailability(list, onProgress) {
    let done = 0;
    await poolRun(list, 12, async (s) => {
      try {
        s.avail = await TMDB.availableOn(s.type, s.tmdbId);
        s.availAt = Date.now();
        await DB.putShowQuiet(s); // sans toucher updatedAt
      } catch { /* on réessaiera */ }
      onProgress(++done, list.length);
    });
  }

  // ---- disponibilité sur ses plateformes -------------------------------
  // `/watch/providers` d'un titre, gardé le temps de la session (une seule requête
  // par titre) ; sert à ne garder que ce qu'elle peut vraiment regarder.
  const availCache = new Map(); // "type:id" → ids de plateformes (abonnement / gratuit)
  async function availableOn(x) {
    const k = `${x.type}:${x.tmdbId}`;
    if (!availCache.has(k)) {
      availCache.set(k, await TMDB.availableOn(x.type, x.tmdbId).catch(() => []));
    }
    return availCache.get(k);
  }
  // ne garde que les titres dispo sur une de ses plateformes, annotés `on`
  // (paquets de 8 requêtes, comme les suggestions de fiche)
  async function onlyOnMyProviders(list, provIds) {
    const want = new Set(provIds);
    const out = [];
    for (let i = 0; i < list.length; i += 8) {
      const part = await Promise.all(list.slice(i, i + 8).map(async (x) => {
        const on = (await availableOn(x)).filter((id) => want.has(id));
        return on.length ? { ...x, on } : null;
      }));
      out.push(...part.filter(Boolean));
    }
    return out;
  }

  // ---- THÈME : titres d'un thème (themes.js) pas encore vus, sur ses plateformes ----
  const themeCache = new Map(); // "type|thème|plateformes|tri" → { items, sources }
  const themeTab = new Map(); // onglet Séries/Films choisi, par page de thème
  // tri de la page d'un thème : demandé à TMDB (`sort_by`), et rejoué côté appli pour
  // fusionner les critères (genres, mots-clés) d'une même « page »
  const THEME_SORTS = {
    populaire: "Populaires",
    note: "Mieux notés",
    recent: "Plus récents",
    ancien: "Plus anciens",
  };
  const THEME_SORT_BY = {
    populaire: "popularity.desc",
    note: "vote_average.desc",
    recent: "date.desc",
    ancien: "date.asc",
  };
  const THEME_CMP = {
    populaire: (a, b) => (b.popularity || 0) - (a.popularity || 0),
    note: (a, b) => (b.voteAverage || 0) - (a.voteAverage || 0),
    recent: (a, b) => String(b.date || "").localeCompare(String(a.date || "")),
    ancien: (a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")),
  };
  let themeSort = localStorage.getItem("season.themeSort") || "populaire";
  async function renderTheme(fromType, themeId) {
    const theme = THEMES.get(themeId);
    const seq = navSeq;
    const still = () => seq === navSeq;
    if (!theme) { render(el('<div class="empty">Thème inconnu.</div>')); return; }
    if (!navigator.onLine || !TMDB.hasKey()) {
      render(el(`<div class="empty">${navigator.onLine ? "Clé TMDB manquante." : "Pas de réseau."}</div>`));
      return;
    }
    const viewKey = fromType + "|" + themeId;
    const wrap = el('<div></div>');
    const seg = el('<div class="segmented"></div>');
    const note = el('<div class="reco-note" style="margin:-6px 0 12px"></div>');
    const body = el('<div></div>');
    wrap.append(seg);

    // affiner / élargir, comme les listes Letterboxd : sous-thèmes d'un grand thème,
    // ou retour au grand thème depuis un sous-thème
    const kids = THEMES.children(themeId);
    const parent = theme.parent && THEMES.get(theme.parent);
    if (kids.length || parent) {
      const row = el('<div class="theme-subs"></div>');
      const chips = parent ? [parent, ...THEMES.children(parent.id).filter((t) => t.id !== themeId)] : kids;
      chips.forEach((t, i) => {
        const b = el(`<button class="genre-tag${parent && i === 0 ? " is-parent" : ""}">${
          parent && i === 0 ? "↑ Tout " : ""}${esc(t.label)}</button>`);
        b.addEventListener("click", () => go(() => renderTheme(fromType, t.id), t.label));
        row.append(b);
      });
      wrap.append(row);
    }
    wrap.append(sortBar(themeSort, (v) => {
      themeSort = v;
      try { localStorage.setItem("season.themeSort", v); } catch {}
      renderTheme(fromType, themeId); // même écran, rechargé avec le nouveau tri
    }, THEME_SORTS));
    wrap.append(note, body);
    render(wrap);

    const provs = myProviders();
    note.innerHTML = provs.length
      ? `Pas encore vus, sur tes plateformes (${esc(provs.map((p) => p.name).join(", "))}). `
      : "Pas encore vus, toutes plateformes confondues. ";
    const lnk = el(`<button class="link-btn">${provs.length ? "Modifier" : "Choisir mes plateformes"}</button>`);
    lnk.addEventListener("click", () => go(renderReglages, "Réglages"));
    note.append(lnk);

    // ce qu'elle a déjà : vu / en cours = masqué ; à voir = en tête, avec badge ;
    // thème retiré à la main d'un titre = ce titre n'apparaît pas ici
    const all = await DB.allShows();
    if (!still()) return;
    const byKey = new Map(all.map((s) => [s.key, s]));
    const keyOf = (x) => `${x.type}:${x.tmdbId}`;
    const hidden = (x) => {
      if (isHidden(keyOf(x))) return true; // « pas intéressé »
      const s = byKey.get(keyOf(x));
      return !!s && (s.status === "vu" || s.status === "en_cours" || (s.tagsRemove || []).includes(themeId));
    };

    const provById = new Map(provs.map((p) => [p.id, p]));
    const provIds = provs.map((p) => p.id);
    const showType = (type) => {
      themeTab.set(viewKey, type);
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.t === type));
      body.replaceChildren();
      const sources = THEMES.findFor(theme, type);
      // ses « à voir » de ce thème (auto ou ajouté à la main), en premier
      const mineAll = all
        .filter((s) => s.type === type && s.status === "a_voir" && s.poster &&
          THEMES.themesOf(s).some((t) => t.id === themeId))
        .map((s) => ({ type: s.type, tmdbId: s.tmdbId, title: s.title, year: s.year, poster: s.poster }));
      // comme les titres proposés (filtrés par /discover), ses « à voir » ne sont
      // montrés que s'ils sont sur une de ses plateformes — vérifié titre par titre
      let mineFirst = provs.length ? [] : mineAll;
      if (provs.length && mineAll.length) {
        onlyOnMyProviders(mineAll, provIds).then((ok) => {
          if (!still() || themeTab.get(viewKey) !== type) return;
          mineFirst = ok;
          paint();
        });
      }
      if (!sources.length && !mineAll.length) {
        body.append(el(`<div class="empty">Rien de ce thème côté ${type === "tv" ? "séries" : "films"}.</div>`));
        return;
      }
      const ck = `${type}|${themeId}|${provIds.join(",")}|${themeSort}`;
      if (!themeCache.has(ck)) {
        themeCache.set(ck, { items: [], sources: sources.map((c) => ({ c, page: 0, total: 1 })) });
      }
      const st = themeCache.get(ck);
      const grid = el('<div class="poster-grid no-caption"></div>');
      const more = el('<button class="btn-primary genre-more">Voir plus</button>');
      body.append(grid, more);
      const left = () => st.sources.some((s) => s.page < s.total);

      // la grille est redessinée d'un bloc : ses « à voir » arrivent après coup
      // (vérification des plateformes) et doivent rester en tête
      const paint = () => {
        const seen = new Set();
        const vis = [...mineFirst, ...st.items.filter((x) => !hidden(x))]
          .filter((x) => !seen.has(keyOf(x)) && seen.add(keyOf(x)));
        grid.replaceChildren(...vis.map((x) => recoCard(x, provById, { onHide: () => paint() })));
        more.hidden = !left();
        if (!vis.length && more.hidden) {
          body.replaceChildren(el('<div class="empty">Aucun titre de ce thème à te proposer.</div>'));
        }
      };
      // une « page » = la page suivante de chaque critère (genres, mots-clés), fusionnées
      // par popularité ; on enchaîne jusqu'à ~18 nouveaux titres visibles
      const load = async () => {
        more.disabled = true;
        more.textContent = "Chargement…";
        const visCount = () => st.items.filter((x) => !hidden(x)).length;
        const before = visCount();
        try {
          for (let n = 0; n < 5 && left(); n++) {
            const got = await Promise.all(st.sources.filter((s) => s.page < s.total).map(async (s) => {
              const r = await TMDB.discoverPage(type, s.c,
                { prov: provIds, page: s.page + 1, sort: THEME_SORT_BY[themeSort] });
              s.page++;
              s.total = r.totalPages;
              return r.results;
            }));
            const have = new Set(st.items.map((x) => x.tmdbId));
            const batch = got.flat()
              .filter((x) => !have.has(x.tmdbId) && have.add(x.tmdbId))
              .sort(THEME_CMP[themeSort] || THEME_CMP.populaire);
            // /discover filtre déjà par plateforme, mais on revérifie titre par titre :
            // ça écarte les rares faux positifs et donne le logo de la plateforme
            st.items.push(...(provs.length ? await onlyOnMyProviders(batch, provIds) : batch));
            if (visCount() - before >= 18) break;
          }
        } catch {
          toast("Chargement impossible");
        }
        if (!still() || themeTab.get(viewKey) !== type) return;
        more.disabled = false;
        more.textContent = "Voir plus";
        paint();
      };
      more.addEventListener("click", load);
      paint(); // ses « à voir » tout de suite
      if (!st.items.length && left()) load();
    };

    for (const [t, label] of [["tv", "Séries"], ["movie", "Films"]]) {
      const b = el(`<button data-t="${t}">${label}</button>`);
      b.addEventListener("click", () => showType(t));
      seg.append(b);
    }
    showType(themeTab.get(viewKey) || fromType);
  }

  // ---- JOURNAL (le « Diary » de Letterboxd) -----------------------------
  // Tout ce qu'elle a coché, du plus récent au plus ancien, groupé par mois.
  // Un film = une ligne ; les épisodes d'une même série cochés le même jour sont
  // réunis en une ligne (sinon une soirée de binge en ferait huit).
  const JOURNAL_PAGE = 60;
  function starsText(r) {
    if (!r) return "";
    return "★".repeat(Math.floor(r)) + (r % 1 ? "½" : "");
  }
  function monthLabel(d) {
    return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }
  function diaryRow(x, d) {
    const s = x.show;
    const img = s.poster
      ? `<img loading="lazy" src="${TMDB.poster(s.poster, "w92")}" alt="">`
      : `<span class="poster-fallback">${esc(s.title)}</span>`;
    let sub = "Film";
    if (x.eps) {
      const eps = x.eps.slice().sort((a, b) => a.season - b.season || a.episode - b.episode);
      const code = (e) => `S${e.season}E${e.episode}`;
      const f = eps[0], l = eps[eps.length - 1];
      sub = eps.length === 1
        ? code(f) + (f.name ? " · " + f.name : "")
        : `${code(f)} → ${code(l)} · ${eps.length} épisodes`;
    }
    const row = el(
      `<button class="diary-row">
        <span class="diary-day">${d.getDate()}</span>
        <span class="diary-poster">${img}</span>
        <span class="diary-main">
          <span class="diary-title">${esc(s.title)}${s.year ? ` <em>${esc(String(s.year))}</em>` : ""}</span>
          <span class="diary-sub">${esc(sub)}</span>
          ${s.rating ? `<span class="diary-stars">${starsText(s.rating)}</span>` : ""}
        </span>
      </button>`
    );
    row.addEventListener("click", () => go(() => renderDetail(s.key), s.title));
    return row;
  }
  async function renderJournal() {
    render(spinner());
    const [shows, eps] = [await DB.allShows(), await DB.allEpisodes()];
    const byKey = new Map(shows.map((s) => [s.key, s]));
    const entries = [];
    for (const s of shows) {
      if (s.type === "movie" && s.watchedMovie && s.watchedAt) entries.push({ ts: s.watchedAt, show: s });
    }
    const days = new Map(); // "série|jour" → épisodes cochés ce jour-là
    for (const e of eps) {
      if (!e.watched || !e.watchedAt) continue;
      const d = new Date(e.watchedAt);
      const k = `${e.showKey}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      let g = days.get(k);
      if (!g) { g = { ts: e.watchedAt, show: byKey.get(e.showKey), eps: [] }; days.set(k, g); }
      g.eps.push(e);
      if (e.watchedAt > g.ts) g.ts = e.watchedAt;
    }
    for (const g of days.values()) if (g.show) entries.push(g);
    entries.sort((a, b) => b.ts - a.ts);

    if (!entries.length) {
      render(el('<div class="empty"><span class="big">▤</span>Rien dans le journal.<br>' +
        "Coche un film ou un épisode : il s'inscrira ici avec sa date.</div>"));
      return;
    }
    const wrap = el('<div></div>');
    wrap.append(el(`<div class="poster-sub" style="margin:-4px 0 10px">${
      entries.length} entrée${entries.length > 1 ? "s" : ""} · la plus récente en haut</div>`));
    const list = el('<div class="diary"></div>');
    const more = el('<button class="btn-primary genre-more">Voir plus</button>');
    let shown = 0, lastMonth = "";
    const addPage = () => {
      for (const x of entries.slice(shown, shown + JOURNAL_PAGE)) {
        const d = new Date(x.ts);
        const mk = `${d.getFullYear()}-${d.getMonth()}`;
        if (mk !== lastMonth) {
          lastMonth = mk;
          list.append(el(`<div class="diary-month">${esc(monthLabel(d))}</div>`));
        }
        list.append(diaryRow(x, d));
      }
      shown = Math.min(shown + JOURNAL_PAGE, entries.length);
      more.hidden = shown >= entries.length;
    };
    addPage();
    more.addEventListener("click", addPage);
    wrap.append(list, more);
    render(wrap);
  }

  // ---- MES LISTES (façon Letterboxd) ------------------------------------
  // store `lists` : { id, name, description, items: [{type,tmdbId,title,year,poster}] }
  // Les titres sont recopiés dans la liste : elle reste lisible même si le titre
  // n'est pas (ou plus) suivi, et hors-ligne.
  const listItem = (show) => ({
    type: show.type,
    tmdbId: show.tmdbId || +String(show.key || "").split(":")[1] || 0,
    title: show.title,
    year: show.year || "",
    poster: show.poster || "",
  });
  const itemKey = (x) => `${x.type}:${x.tmdbId}`;
  function listCount(l) {
    const items = l.items || [];
    const n = items.length;
    const movies = items.filter((x) => x.type === "movie").length;
    if (!n) return "vide";
    if (movies === n) return `${n} film${n > 1 ? "s" : ""}`;
    if (!movies) return `${n} série${n > 1 ? "s" : ""}`;
    return `${n} titres`;
  }
  async function createList(name) {
    const l = { id: `list:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(), description: "", items: [], createdAt: Date.now() };
    await DB.putList(l);
    return l;
  }
  async function renderMesListes() {
    render(spinner());
    const lists = (await DB.allLists())
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    const wrap = el('<div></div>');
    const add = el('<button class="btn-primary list-new">＋ Nouvelle liste</button>');
    add.addEventListener("click", async () => {
      const nom = prompt("Nom de la liste ?");
      if (!nom || !nom.trim()) return;
      const l = await createList(nom);
      go(() => renderListe(l.id), l.name);
    });
    wrap.append(add);
    if (!lists.length) {
      wrap.append(el('<div class="empty"><span class="big">≡</span>Pas encore de liste.<br>' +
        "Crée-en une, puis range des titres dedans avec le bouton <b>≡ Listes</b> d'une fiche.</div>"));
      render(wrap);
      return;
    }
    for (const l of lists) {
      const card = el(
        `<button class="list-card">
          <span class="list-head"><span class="list-name">${esc(l.name)}</span>
            <span class="list-count">${esc(listCount(l))}</span></span>
          <span class="list-strip"></span>
          ${l.description ? `<span class="list-desc">${esc(l.description)}</span>` : ""}
        </button>`
      );
      const strip = card.querySelector(".list-strip");
      (l.items || []).slice(0, 8).forEach((x) => {
        if (x.poster) strip.append(el(`<img loading="lazy" src="${TMDB.poster(x.poster, "w92")}" alt="">`));
      });
      card.addEventListener("click", () => go(() => renderListe(l.id), l.name));
      wrap.append(card);
    }
    render(wrap);
  }
  async function renderListe(id) {
    render(spinner());
    const l = await DB.getList(id);
    if (!l) { render(el('<div class="empty">Liste introuvable.</div>')); return; }
    const wrap = el('<div></div>');

    // nom et description : modifiables sur place, enregistrés en sortant du champ
    const name = el('<input class="list-name-input" type="text" placeholder="Nom de la liste">');
    name.value = l.name || "";
    const desc = el('<textarea class="review" placeholder="Description (facultatif)…"></textarea>');
    desc.value = l.description || "";
    let saveT;
    const save = async () => {
      l.name = name.value.trim() || "Sans titre";
      l.description = desc.value;
      await DB.putList(l);
      topTitle.textContent = l.name;
    };
    [name, desc].forEach((f) => {
      f.addEventListener("input", () => { clearTimeout(saveT); saveT = setTimeout(save, 600); });
      f.addEventListener("blur", save);
    });
    wrap.append(name, desc);

    const bar = el('<div class="sort-bar" style="justify-content:space-between"></div>');
    const count = el(`<label>${esc(listCount(l))}</label>`);
    const edit = el('<button class="link-btn">✎ Modifier</button>');
    bar.append(count, edit);
    wrap.append(bar);

    const grid = el('<div class="poster-grid no-caption list-grid"></div>');
    const draw = () => {
      grid.replaceChildren();
      if (!(l.items || []).length) {
        grid.append(el('<div class="empty">Liste vide.<br>Ouvre une fiche et touche <b>≡ Listes</b> pour y ranger un titre.</div>'));
        return;
      }
      l.items.forEach((x, i) => {
        const card = recoCard(x);
        const del = el('<span class="item-del" role="button" aria-label="Retirer de la liste">✕</span>');
        del.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          l.items.splice(i, 1);
          await DB.putList(l);
          count.textContent = listCount(l);
          draw();
        });
        card.querySelector(".poster-wrap").append(del);
        grid.append(card);
      });
    };
    edit.addEventListener("click", () => {
      const on = grid.classList.toggle("is-editing");
      edit.textContent = on ? "✓ Terminé" : "✎ Modifier";
    });
    draw();
    wrap.append(grid);

    const del = el('<button class="link-btn" style="color:var(--warn);margin-top:24px">Supprimer la liste</button>');
    del.addEventListener("click", async () => {
      if (!confirm(`Supprimer la liste « ${l.name} » ? Les titres eux-mêmes ne sont pas touchés.`)) return;
      await DB.deleteList(l.id);
      toast("Liste supprimée");
      back();
    });
    wrap.append(del);
    render(wrap);
  }
  // panneau « ≡ Listes » d'une fiche : cocher les listes où ranger ce titre
  function listPicker(show) {
    const box = el('<div class="theme-editor" hidden></div>');
    const item = listItem(show);
    const draw = async () => {
      const lists = (await DB.allLists())
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
      box.replaceChildren(el('<div class="section-title">Ranger dans une liste</div>'));
      const pick = el('<div class="theme-pick"></div>');
      for (const l of lists) {
        const on = (l.items || []).some((x) => itemKey(x) === itemKey(item));
        const b = el(`<button class="genre-tag${on ? " is-on" : ""}">${esc(l.name)}</button>`);
        b.addEventListener("click", async () => {
          l.items = l.items || [];
          l.items = on ? l.items.filter((x) => itemKey(x) !== itemKey(item)) : [...l.items, item];
          await DB.putList(l);
          toast(on ? `Retiré de « ${l.name} »` : `Ajouté à « ${l.name} »`);
          draw();
        });
        pick.append(b);
      }
      const nu = el('<button class="genre-tag tag-edit">＋ Nouvelle liste</button>');
      nu.addEventListener("click", async () => {
        const nom = prompt("Nom de la liste ?");
        if (!nom || !nom.trim()) return;
        const l = await createList(nom);
        l.items = [item];
        await DB.putList(l);
        toast(`Ajouté à « ${l.name} »`);
        draw();
      });
      pick.append(nu);
      box.append(pick);
    };
    return { box, draw };
  }

  // ---- RÉGLAGES -----------------------------------------------------
  let providersList = null; // liste TMDB, gardée le temps de la session
  async function renderReglages() {
    const wrap = el('<div></div>');

    // --- affichage : vignettes par ligne (onglets Séries / Films) ---
    wrap.append(el('<div class="section-title">Vignettes par ligne</div>'));
    const colsSeg = el('<div class="segmented"></div>');
    for (const n of ["auto", "2", "3", "4", "5"]) {
      const b = el(`<button data-n="${n}">${n === "auto" ? "Auto" : n}</button>`);
      if (gridCols() === n) b.classList.add("is-active");
      b.addEventListener("click", () => {
        setGridCols(n);
        colsSeg.querySelectorAll("button").forEach((x) => x.classList.toggle("is-active", x === b));
      });
      colsSeg.append(b);
    }
    wrap.append(colsSeg);
    wrap.append(el('<p class="poster-sub" style="margin:-6px 0 8px">Auto = 2 sur téléphone, 3 sur un écran plus large.</p>'));

    // --- titres marqués « pas intéressé » ---
    const hiddenBox = el('<div></div>');
    const drawHidden = () => {
      const list = hiddenList();
      hiddenBox.replaceChildren(el(
        `<div class="section-title">Pas intéressé${list.length ? ` (${list.length})` : ""}</div>`
      ));
      if (!list.length) {
        hiddenBox.append(el('<p class="poster-sub" style="margin-bottom:12px">Rien de masqué. ' +
          "Appui long sur une suggestion (ou le bouton ⊘ d'une fiche) pour ne plus la voir proposée.</p>"));
        return;
      }
      hiddenBox.append(el('<p class="poster-sub" style="margin-bottom:8px">Ces titres ne sont plus ' +
        "proposés dans les suggestions ni les pages de thème. Touche un titre pour le réafficher.</p>"));
      const pick = el('<div class="theme-pick"></div>');
      for (const x of list) {
        const b = el(`<button class="genre-tag is-on">${esc(x.title || x.key)} ✕</button>`);
        b.addEventListener("click", () => {
          setHidden(x, false);
          toast("Proposé de nouveau");
          drawHidden();
        });
        pick.append(b);
      }
      hiddenBox.append(pick);
    };
    drawHidden();
    wrap.append(hiddenBox);

    wrap.append(el('<div class="section-title">Mes plateformes de streaming</div>'));
    wrap.append(el(
      `<p class="poster-sub" style="margin-bottom:12px">Les suggestions « Séries / Films similaires » ne
       montreront que ce que tu peux regarder sur ces plateformes (abonnement ou gratuit, en France).
       Rien de coché = toutes plateformes.</p>`
    ));
    const chosenBox = el('<div class="prov-chosen"></div>');
    const search = el('<div class="search-box"><input type="search" placeholder="Chercher une plateforme…" autocomplete="off"></div>');
    const listBox = el('<div class="prov-list"></div>');
    wrap.append(chosenBox, search, listBox);

    // --- sources ---
    // L'attribution JustWatch (demandée par les conditions de TMDB) a quitté la
    // fiche le 21/09/2026 : elle est ici, une fois pour toutes, plutôt que
    // répétée sous chaque « Où regarder ».
    wrap.append(el('<div class="section-title">Sources</div>'));
    wrap.append(el(
      `<p class="poster-sub" style="margin-bottom:20px">Séries, films, affiches et notes :
       <a class="src-link" href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a> ↗.
       Disponibilité sur les plateformes :
       <a class="src-link" href="https://www.justwatch.com" target="_blank" rel="noopener">JustWatch</a> ↗.
       Cette appli utilise l'API de TMDB sans être approuvée ni certifiée par TMDB.</p>`
    ));

    render(wrap);

    let chosen = myProviders();
    const isOn = (id) => chosen.some((p) => p.id === id);
    const toggle = (p) => {
      chosen = isOn(p.id) ? chosen.filter((q) => q.id !== p.id) : [...chosen, { id: p.id, name: p.name, logo: p.logo }];
      setMyProviders(chosen);
      relatedCache.clear();
      draw();
    };
    const chip = (p) => {
      const c = el(`<button class="prov-chip">${p.logo ? `<img src="${TMDB.logo(p.logo)}" alt="">` : ""}${esc(p.name)} <span>✕</span></button>`);
      c.addEventListener("click", () => toggle(p));
      return c;
    };
    const input = search.querySelector("input");
    function draw() {
      chosenBox.replaceChildren(...(chosen.length
        ? chosen.map(chip)
        : [el('<div class="poster-sub">Aucune plateforme choisie.</div>')]));
      if (!providersList) return;
      const q = input.value.trim().toLowerCase();
      const items = providersList.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, q ? 80 : 40);
      listBox.replaceChildren(...items.map((p) => {
        const row = el(
          `<label class="prov-row">
            ${p.logo ? `<img src="${TMDB.logo(p.logo)}" alt="">` : '<span class="prov-noimg"></span>'}
            <span class="prov-name">${esc(p.name)}</span>
            <input type="checkbox" ${isOn(p.id) ? "checked" : ""}>
          </label>`
        );
        row.querySelector("input").addEventListener("change", () => toggle(p));
        return row;
      }));
    }
    input.addEventListener("input", draw);
    draw();

    if (!providersList) {
      listBox.replaceChildren(spinner());
      try {
        providersList = await TMDB.providers();
      } catch {
        listBox.replaceChildren(el(`<div class="empty">Liste des plateformes indisponible${navigator.onLine ? "" : " (pas de réseau)"}.</div>`));
        return;
      }
      draw();
    }
  }

  function seasonBlock(show, season, watchedMap) {
    const eps = [];
    for (let i = 1; i <= season.count; i++) {
      eps.push(watchedMap.get(`${season.number}:${i}`) || { season: season.number, episode: i });
    }

    const block = el(
      `<div class="season">
        <div class="season-head">
          <span class="chev">›</span>
          <span class="s-name">${esc(season.name || "Saison " + season.number)}</span>
          <span class="s-count"></span>
        </div>
        <div class="season-mini-bar"><i></i></div>
        <div class="season-body"></div>
      </div>`
    );
    const body = block.querySelector(".season-body");
    const head = block.querySelector(".season-head");
    const countEl = block.querySelector(".s-count");
    const barEl = block.querySelector(".season-mini-bar > i");

    const doneCount = () => eps.filter((e) => e.watched).length;
    const doneAll = () => eps.every((e) => e.watched);
    const updateHead = () => {
      const n = doneCount();
      countEl.textContent = `${n}/${season.count}`;
      barEl.style.width = Math.round((n / season.count) * 100) + "%";
    };
    updateHead();

    const fill = () => {
      body.replaceChildren();
      const actions = el(
        `<div class="season-actions"><button class="link-btn"></button></div>`
      );
      const actBtn = actions.querySelector("button");
      const refreshActBtn = () => {
        actBtn.textContent = doneAll() ? "Tout décocher la saison" : "Tout cocher la saison";
      };
      refreshActBtn();
      actBtn.addEventListener("click", async () => {
        const target = !doneAll();
        for (const e of eps) await writeEpisode(show, e, target);
        await recomputeAndSave(show);
        updateHead();
        fill(); // redessine les cases de la saison
      });
      body.append(actions);
      eps.forEach((e) => body.append(epRow(show, season, e, updateHead)));
    };

    head.addEventListener("click", () => {
      block.classList.toggle("open");
      if (block.classList.contains("open") && !body.childElementCount) fill();
    });
    return block;
  }

  function epRow(show, season, e, onChange) {
    const row = el(
      `<div class="ep${e.watched ? " done" : ""}">
        <button class="ep-check" aria-label="Vu">✓</button>
        <div class="ep-main">
          <div class="ep-t"><b>${season.number}×${String(e.episode).padStart(2, "0")}</b>${esc(e.name || "Épisode " + e.episode)}</div>
          ${e.airDate || e.runtime ? `<div class="ep-d">${[e.airDate, e.runtime ? e.runtime + " min" : ""].filter(Boolean).join(" · ")}</div>` : ""}
        </div>
      </div>`
    );
    row.querySelector(".ep-check").addEventListener("click", async () => {
      const now = !row.classList.contains("done");
      row.classList.toggle("done", now);
      e.watched = now;
      onChange && onChange();
      await writeEpisode(show, e, now);
      await recomputeAndSave(show);
    });
    return row;
  }

  async function writeEpisode(show, e, watched) {
    await DB.putEpisode({
      key: `${show.key}:${e.season}:${e.episode}`,
      showKey: show.key,
      season: e.season,
      episode: e.episode,
      name: e.name || "",
      runtime: e.runtime || show.epRunTime || 0,
      airDate: e.airDate || "",
      still: e.still || null,
      watched,
      watchedAt: watched ? Date.now() : null,
    });
    e.watched = watched;
  }

  async function setAllEpisodes(show, watched) {
    const existing = await DB.episodesOf(show.key);
    const map = new Map(existing.map((x) => [`${x.season}:${x.episode}`, x]));
    const all = [];
    for (const s of show.seasons || []) {
      for (let i = 1; i <= s.count; i++) {
        const prev = map.get(`${s.number}:${i}`) || {};
        all.push({
          key: `${show.key}:${s.number}:${i}`,
          showKey: show.key,
          season: s.number,
          episode: i,
          name: prev.name || "",
          runtime: prev.runtime || show.epRunTime || 0,
          airDate: prev.airDate || "",
          still: prev.still || null,
          watched,
          watchedAt: watched ? prev.watchedAt || Date.now() : null,
        });
      }
    }
    if (all.length) await DB.putEpisodes(all);
  }

  // ajout d'un titre pas encore suivi, directement avec son statut
  async function addWithStatus(show, k, row) {
    row.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    row.querySelector(`[data-k="${k}"]`).classList.add("is-active");
    show.createdAt = Date.now();
    show.status = "a_voir";
    show.rating = 0;
    show.review = "";
    await DB.putShow(show);
    if (show.type === "tv") await syncEpisodes(show);
    if (k === "vu") {
      if (show.type === "movie") {
        show.watchedMovie = true;
        show.watchedAt = Date.now();
      } else {
        await setAllEpisodes(show, true);
      }
    }
    await recomputeAndSave(show);
    toast(k === "vu" ? "Ajouté aux vus" : "Ajouté à voir");
    go(() => renderDetail(show.key), show.title, { push: false });
  }

  function setStatusManually(show, k) {
    (async () => {
      if (show.type === "movie") {
        show.watchedMovie = k === "vu";
        show.watchedAt = show.watchedMovie ? Date.now() : null;
      } else if (k === "vu") {
        if (!confirm("Marquer toute la série comme vue ?")) return;
        await setAllEpisodes(show, true);
      } else if (k === "a_voir") {
        if (!confirm("Tout remettre à voir ? Ta progression sur cette série sera effacée.")) return;
        await setAllEpisodes(show, false);
      }
      show.status = k;
      await DB.putShow(show);
      await recomputeAndSave(show);
      go(() => renderDetail(show.key), show.title, { push: false });
    })();
  }

  // récupère la liste des épisodes de toutes les saisons depuis TMDB
  async function syncEpisodes(show) {
    if (!navigator.onLine || show.type !== "tv") return false;
    try {
      const existing = await DB.episodesOf(show.key);
      const wmap = new Map(existing.map((e) => [`${e.season}:${e.episode}`, e]));
      const all = [];
      for (const s of show.seasons || []) {
        const list = await TMDB.season(show.tmdbId, s.number);
        list.forEach((e) => {
          const prev = wmap.get(`${e.season}:${e.episode}`);
          all.push({
            key: `${show.key}:${e.season}:${e.episode}`,
            showKey: show.key,
            season: e.season,
            episode: e.episode,
            name: e.name,
            overview: e.overview,
            still: e.still,
            airDate: e.airDate,
            runtime: e.runtime || show.epRunTime || 0,
            watched: prev ? prev.watched : false,
            watchedAt: prev ? prev.watchedAt : null,
          });
        });
      }
      if (all.length) await DB.putEpisodes(all);
      show.epAt = Date.now();
      show.totalEpisodes = (show.seasons || []).reduce((n, s) => n + s.count, 0);
      await recomputeAndSave(show);
      return true;
    } catch {
      return false;
    }
  }

  // ---- STATS --------------------------------------------------------
  async function renderStats() {
    render(spinner());
    const [shows, eps] = [await DB.allShows(), await DB.allEpisodes()];
    const watchedEps = eps.filter((e) => e.watched);
    const watchedMovies = shows.filter((s) => s.type === "movie" && s.watchedMovie);

    const showById = new Map(shows.map((s) => [s.key, s]));
    let minutes = 0;
    watchedEps.forEach((e) => {
      const s = showById.get(e.showKey);
      minutes += e.runtime || (s && s.epRunTime) || 40;
    });
    watchedMovies.forEach((m) => (minutes += m.runtime || 100));

    const seriesEnCours = shows.filter((s) => s.type === "tv" && s.status === "en_cours").length;
    const seriesVues = shows.filter((s) => s.type === "tv" && s.status === "vu").length;

    // genres
    const genreCount = {};
    shows.forEach((s) => {
      if (s.status === "a_voir") return;
      (s.genres || []).forEach((g) => (genreCount[g] = (genreCount[g] || 0) + 1));
    });
    const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const maxG = topGenres.length ? topGenres[0][1] : 1;

    // par mois (12 derniers)
    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString("fr-FR", { month: "short" }), n: 0 });
    }
    const mIndex = new Map(months.map((m) => [m.key, m]));
    const stamp = (ts) => {
      if (!ts) return;
      const d = new Date(ts);
      const m = mIndex.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (m) m.n++;
    };
    watchedEps.forEach((e) => stamp(e.watchedAt));
    watchedMovies.forEach((m) => stamp(m.watchedAt));
    const maxM = Math.max(1, ...months.map((m) => m.n));

    const wrap = el('<div></div>');

    if (!shows.length) {
      render(el('<div class="empty"><span class="big">▲</span>Pas encore de statistiques.<br>Ajoute des titres et coche des épisodes.</div>'));
      return;
    }

    wrap.append(el(
      `<div class="stat-grid">
        <div class="stat-card"><div class="n">${fmtDuration(minutes)}</div><div class="l">Temps de visionnage</div></div>
        <div class="stat-card"><div class="n">${watchedEps.length}</div><div class="l">Épisodes vus</div></div>
        <div class="stat-card"><div class="n">${watchedMovies.length}</div><div class="l">Films vus</div></div>
        <div class="stat-card"><div class="n">${seriesVues} · ${seriesEnCours}</div><div class="l">Séries finies · en cours</div></div>
      </div>`
    ));

    if (topGenres.length) {
      wrap.append(el('<div class="section-title">Genres favoris</div>'));
      topGenres.forEach(([g, n]) => {
        wrap.append(el(
          `<div class="bar-row"><span class="bl">${esc(g)}</span>
           <span class="bt"><i style="width:${Math.round((n / maxG) * 100)}%"></i></span>
           <span class="bv">${n}</span></div>`
        ));
      });
    }

    wrap.append(el('<div class="section-title">Activité (12 mois)</div>'));
    months.forEach((m) => {
      wrap.append(el(
        `<div class="bar-row"><span class="bl">${esc(m.label)}</span>
         <span class="bt"><i style="width:${Math.round((m.n / maxM) * 100)}%"></i></span>
         <span class="bv">${m.n || ""}</span></div>`
      ));
    });

    // export / import
    wrap.append(el('<div class="section-title">Sauvegarde</div>'));
    const exp = el('<button class="link-btn">⤓ Exporter mes données (fichier)</button>');
    exp.addEventListener("click", async () => {
      const data = await DB.exportAll();
      data.settings = { providers: myProviders(), cols: gridCols(), hidden: hiddenList() };
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `season-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    const imp = el('<button class="link-btn" style="display:block;margin-top:6px">⤒ Importer une sauvegarde</button>');
    const file = el('<input type="file" accept="application/json" hidden>');
    imp.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data || !Array.isArray(data.shows)) throw new Error("format");
        await DB.importAll(data);
        if (data.settings && Array.isArray(data.settings.providers)) setMyProviders(data.settings.providers);
        if (data.settings && data.settings.cols) setGridCols(String(data.settings.cols));
        if (data.settings && Array.isArray(data.settings.hidden)) setHiddenList(data.settings.hidden);
        toast(`${data.shows.length} titres importés`);
        resetTo(renderSeries, "Séries", "listes");
      } catch {
        toast("Fichier illisible");
      }
    });
    wrap.append(exp, imp, file);

    render(wrap);
  }

  // ---- À VENIR -----------------------------------------------------
  let scanning = false;
  let scanProgress = null;

  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
  function todayISO() { return new Date().toISOString().slice(0, 10); }

  function fmtRelDate(iso) {
    const d = new Date(iso + "T00:00:00");
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const days = Math.round((d - t) / 86400000);
    if (days <= 0) return "aujourd'hui";
    if (days === 1) return "demain";
    if (days < 7) return `dans ${days} jours`;
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  }
  function fmtAgo(ts) {
    const min = Math.round((Date.now() - ts) / 60000);
    if (min < 2) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `il y a ${h} h`;
    return `il y a ${Math.round(h / 24)} j`;
  }

  async function poolRun(items, size, fn) {
    let i = 0;
    await Promise.all(
      Array.from({ length: Math.min(size, items.length) }, async () => {
        while (i < items.length) { const idx = i++; await fn(items[idx], idx); }
      })
    );
  }

  async function renderAVenir() {
    render(spinner());
    const shows = await DB.allShows();
    const tv = shows.filter((s) => s.type === "tv");
    const scannedAt = Math.max(0, ...tv.map((s) => s.nextScanAt || 0));
    const known = scannedAt > 0;

    const today = todayISO();
    const items = [];
    for (const s of tv) {
      for (const e of s.upcoming || []) {
        if (e.airDate && e.airDate >= today) items.push({ show: s, ep: e });
      }
    }
    items.sort((a, b) => a.ep.airDate.localeCompare(b.ep.airDate) || a.show.title.localeCompare(b.show.title));

    const wrap = el("<div></div>");

    const bar = el('<div class="avenir-bar"></div>');
    const btn = el('<button class="link-btn">↻ Actualiser</button>');
    btn.addEventListener("click", () => scanUpcoming(true));
    bar.append(btn);
    if (known) bar.append(el(`<span class="avenir-when">Vérifié ${fmtAgo(scannedAt)}</span>`));
    wrap.append(bar);

    scanProgress = el('<div class="scan-progress" hidden></div>');
    wrap.append(scanProgress);
    if (scanning) showScan();

    if (!items.length) {
      wrap.append(el(
        `<div class="empty"><span class="big">◷</span>${
          !navigator.onLine && !known
            ? "Pas de réseau.<br>Reviens connectée pour voir les prochaines sorties."
            : known
              ? "Aucune sortie d'épisode annoncée<br>pour tes séries."
              : "Touche « Actualiser » pour chercher les prochaines<br>sorties de tes séries. La première vérification<br>passe en revue toute ta liste, ça prend un moment."
        }</div>`
      ));
    } else {
      let curDate = null;
      for (const it of items) {
        if (it.ep.airDate !== curDate) {
          curDate = it.ep.airDate;
          wrap.append(el(`<div class="avenir-day">${esc(cap(fmtRelDate(curDate)))}</div>`));
        }
        wrap.append(avenirRow(it));
      }
    }
    render(wrap);

    // rafraîchissement auto seulement si un premier scan a déjà été fait
    // (le tout premier scan, ~230 séries, reste déclenché à la main)
    if (navigator.onLine && !scanning && known && Date.now() - scannedAt > 6 * 3600 * 1000) {
      scanUpcoming(false);
    }
  }

  function avenirRow({ show, ep }) {
    const thumb = show.poster
      ? `<img class="thumb" loading="lazy" src="${TMDB.poster(show.poster, "w185")}" alt="">`
      : `<div class="thumb-fallback">📺</div>`;
    const row = el(
      `<div class="result-row">
        ${thumb}
        <div class="result-meta">
          <span class="tag">S${ep.season} E${String(ep.episode).padStart(2, "0")}</span>
          <h3>${esc(show.title)}</h3>
          <p>${esc(ep.name || "Épisode " + ep.episode)}</p>
        </div>
      </div>`
    );
    row.addEventListener("click", () => go(() => renderDetail(show.key), show.title));
    return row;
  }

  function showScan(done, total) {
    if (!scanProgress) return;
    scanProgress.hidden = false;
    scanProgress.textContent =
      total ? `Vérification des séries… ${done}/${total}` : "Vérification des séries…";
  }

  async function scanUpcoming(manual) {
    if (scanning || !navigator.onLine || !TMDB.hasKey()) {
      if (manual && !navigator.onLine) toast("Pas de réseau");
      return;
    }
    const shows = await DB.allShows();
    const ended = new Set(["Ended", "Canceled"]);
    const targets = shows.filter((s) => {
      if (s.type !== "tv" || !s.tmdbId) return false;
      // manuel : on vérifie toutes les séries jamais scannées + celles encore
      // en production. Auto : seulement celles qui peuvent encore sortir.
      if (ended.has(s.tmdbStatus)) return false; // série finie : inutile de revérifier
      if (!s.nextScanAt) return manual; // 1er scan = seulement sur demande (≈400 séries)
      return Date.now() - s.nextScanAt > 12 * 3600 * 1000;
    });
    if (!targets.length) {
      if (manual) toast("Déjà à jour");
      return;
    }

    scanning = true;
    let done = 0;
    showScan(0, targets.length);
    await poolRun(targets, 12, async (s) => {
      try {
        const sched = await TMDB.tvSchedule(s.tmdbId);
        s.tmdbStatus = sched.status;
        if (sched.nextEp && sched.nextSeason != null) {
          let eps = [];
          try { eps = await TMDB.season(s.tmdbId, sched.nextSeason); } catch { eps = [sched.nextEp]; }
          const today = todayISO();
          s.upcoming = eps
            .filter((e) => e.airDate && e.airDate >= today)
            .map((e) => ({ season: e.season, episode: e.episode, name: e.name, airDate: e.airDate }));
          if (!s.upcoming.length) s.upcoming = [sched.nextEp];
        } else {
          s.upcoming = [];
        }
        s.nextScanAt = Date.now();
        await DB.putShow(s);
      } catch { /* on garde l'ancien cache pour cette série */ }
      showScan(++done, targets.length);
    });
    scanning = false;
    if (scanProgress) scanProgress.hidden = true;
    if (stack[stack.length - 1] && topTitle.textContent === "À venir") renderAVenir();
    else if (manual) toast("Mis à jour");
  }

  // ---- service worker + démarrage ----------------------------------
  if ("serviceWorker" in navigator) {
    // Nouvelle version publiée : le nouveau SW prend la main (skipWaiting + claim)
    // → on recharge aussitôt pour l'afficher, sans attendre une 2ᵉ ouverture.
    // (Pas au tout 1ᵉʳ lancement : il n'y avait alors aucun SW aux commandes.)
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });
    window.addEventListener("load", () =>
      navigator.serviceWorker.register("sw.js").then((reg) => {
        // Android garde l'appli en mémoire : revérifie quand on revient dessus
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
      }).catch(() => {})
    );
  }
  // Vertical seulement. Le manifeste (`orientation: portrait`) suffit pour le
  // raccourci installé ; ce verrou-ci couvre le mode plein écran. Dans un
  // onglet ordinaire il est refusé (NotSupportedError) — c'est le CSS
  // `#rotate` qui prend le relais.
  try { screen.orientation?.lock?.("portrait").catch(() => {}); } catch {}

  window.addEventListener("online", () => toast("De retour en ligne"));

  resetTo(renderSeries, "Séries", "listes");
  seedFavorites();
})();
