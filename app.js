/* Season — logique de l'appli. Sans framework. */
(() => {
  "use strict";

  const view = document.getElementById("view");
  const topTitle = document.getElementById("topTitle");
  const backBtn = document.getElementById("backBtn");
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
  function myProviders() {
    try { return JSON.parse(localStorage.getItem("season.providers") || "[]"); } catch { return []; }
  }
  function setMyProviders(list) {
    localStorage.setItem("season.providers", JSON.stringify(list));
  }

  // ---- navigation (pile de vues) ---------------------------------------
  let stack = [];
  let navSeq = 0; // change à chaque changement d'écran (pour ignorer les rendus tardifs)
  function setTab(tab) {
    [...tabbar.children].forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
  }
  function render(node) {
    view.replaceChildren(node);
    view.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }
  function go(fn, title, { push = true } = {}) {
    navSeq++;
    if (push) stack.push({ fn, title });
    else stack[stack.length - 1] = { fn, title };
    backBtn.hidden = stack.length <= 1;
    topTitle.textContent = title;
    fn();
  }
  function back() {
    if (stack.length <= 1) return;
    navSeq++;
    stack.pop();
    const top = stack[stack.length - 1];
    backBtn.hidden = stack.length <= 1;
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
  tabbar.addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (!b) return;
    const tab = b.dataset.tab;
    if (tab === "listes") resetTo(renderSeries, "Séries", "listes");
    if (tab === "films") resetTo(renderFilms, "Films", "films");
    if (tab === "avenir") resetTo(renderAVenir, "À venir", "avenir");
    if (tab === "recherche") resetTo(renderRecherche, "Recherche", "recherche");
    if (tab === "stats") resetTo(renderStats, "Stats", "stats");
  });

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
    ajout: "Ajout récent",
    titre: "Titre A→Z",
  };
  let listesSort = localStorage.getItem("season.sort") || "vu";
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
    const sortBar = el('<div class="sort-bar"><label>Trier :</label><select></select></div>');
    const sel = sortBar.querySelector("select");
    for (const [k, label] of Object.entries(SORTS)) {
      const o = el(`<option value="${k}">${label}</option>`);
      if (k === listesSort) o.selected = true;
      sel.append(o);
    }
    sel.addEventListener("change", () => {
      listesSort = sel.value;
      localStorage.setItem("season.sort", listesSort);
      renderListes();
    });
    wrap.append(sortBar);

    // dernier visionnage par série (à partir de tous les épisodes vus)
    let epMax = null;
    if (listesSort === "vu") {
      epMax = new Map();
      for (const e of await DB.allEpisodes()) {
        if (e.watched && e.watchedAt) {
          const cur = epMax.get(e.showKey) || 0;
          if (e.watchedAt > cur) epMax.set(e.showKey, e.watchedAt);
        }
      }
    }

    const sorters = {
      vu: (a, b) => lastActivity(b, epMax) - lastActivity(a, epMax),
      ajout: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
      titre: (a, b) => (a.title || "").localeCompare(b.title || "", "fr", { sensitivity: "base" }),
    };
    const inList = shows.filter((s) => statusOf(s) === listesFilter).sort(sorters[listesSort] || sorters.vu);

    if (!inList.length) {
      wrap.append(el(
        `<div class="empty"><span class="big">▦</span>Rien dans « ${STATUS[listesFilter]} ».<br>` +
        `Utilise l'onglet Recherche pour ajouter ${isMovie ? "un film" : "une série"}.` +
        `</div>`
      ));
    } else {
      const grid = el('<div class="poster-grid"></div>');
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
      `<button class="poster-card">
        <div class="poster-wrap">
          <span class="badge-type">${show.type === "tv" ? "Série" : "Film"}</span>
          ${img}${bar}
        </div>
        <div class="poster-title">${esc(show.title)}</div>
        <div class="poster-sub">${sub}</div>
      </button>`
    );
    card.addEventListener("click", () => go(() => renderDetail(show.key), show.title));
    return card;
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
    if (staleMeta(show)) {
      try { await fetchMeta(show); await DB.putShow(show); changed = true; } catch {}
    }
    if (type === "tv" && staleMeta({ metaAt: show.epAt })) {
      if (await syncEpisodes(show)) changed = true;
    }
    // pas de redessin pendant qu'elle écrit son avis (le texte en cours serait perdu)
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
    const sub = [show.type === "tv" ? "Série" : "Film", show.year].filter(Boolean).join(" · ");

    wrap.append(el(
      `<div class="detail-hero">
        <div class="poster-wrap">${posterImg}</div>
        <div>
          <h2>${esc(show.title)}</h2>
          <div class="sub">${esc(sub)}</div>
          ${show.genres && show.genres.length ? `<div class="genres">${esc(show.genres.join(" · "))}</div>` : ""}
        </div>
      </div>`
    ));

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
    if (show.type === "tv") {
      wrap.append(el(
        '<div class="poster-sub" style="margin:-8px 0 4px">« À voir » / « Vu » cochent ou décochent toute la série.</div>'
      ));
    }

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
      starsVal.textContent = show.rating ? String(show.rating).replace(".", ",") + " / 5" : "";
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
    const starsVal = el('<em class="stars-val"></em>');
    stars.append(starsVal);
    paint();
    wrap.append(stars);

    // --- avis ---
    wrap.append(el('<div class="section-title">Mon avis</div>'));
    const ta = el(`<textarea class="review" placeholder="Ce que j'en ai pensé…"></textarea>`);
    ta.value = show.review || "";
    let saveT;
    const saveReview = async () => { show.review = ta.value; await DB.putShow(show); };
    ta.addEventListener("input", () => { clearTimeout(saveT); saveT = setTimeout(saveReview, 600); });
    ta.addEventListener("blur", saveReview);
    wrap.append(ta);

    // --- saisons / épisodes ---
    if (show.type === "tv" && show.seasons && show.seasons.length) {
      wrap.append(el('<div class="section-title">Épisodes</div>'));
      show.seasons.forEach((s) => wrap.append(seasonBlock(show, s, watchedMap)));
    }

    wrap.append(relatedSection(show));

    // --- retirer ---
    const del = el('<button class="link-btn" style="color:var(--warn);margin-top:24px">Retirer de mes listes</button>');
    del.addEventListener("click", async () => {
      if (!confirm(`Retirer « ${show.title} » ? Ta progression et ton avis seront effacés.`)) return;
      await DB.deleteShow(show.key);
      toast("Retiré");
      back();
    });
    wrap.append(del);

    return wrap;
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
      const groups = [
        ["Abonnement", pick(r.flatrate)],
        ["Gratuit", pick(r.free, r.ads)],
        // pas de location / achat : elle ne loue pas (demandé le 18/09/2026)
      ].filter(([, l]) => l.length);

      box.append(el('<div class="section-title">Où regarder</div>'));
      if (!groups.length) {
        box.append(el('<div class="poster-sub">Pas disponible en abonnement ni gratuitement en France pour l\'instant.</div>'));
        return;
      }
      for (const [label, list] of groups) {
        const row = el(`<div class="wtw-row"><div class="wtw-label">${label}</div><div class="wtw-list"></div></div>`);
        const chip = (p) => el(
          `<span class="wtw-chip${p.isMine ? " is-mine" : ""}">${
            p.logo ? `<img src="${TMDB.logo(p.logo)}" alt="">` : ""}${esc(p.name)}</span>`
        );
        const MAX = 5; // au-delà, bouton « +N »
        list.slice(0, MAX).forEach((p) => row.lastElementChild.append(chip(p)));
        if (list.length > MAX) {
          const more = el(`<button class="wtw-chip wtw-more">+${list.length - MAX}</button>`);
          more.addEventListener("click", () => { more.replaceWith(...list.slice(MAX).map(chip)); });
          row.lastElementChild.append(more);
        }
        box.append(row);
      }
      if (r.link) {
        box.append(el(`<a class="wtw-src" href="${esc(r.link)}" target="_blank" rel="noopener">Source : JustWatch ↗</a>`));
      }
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

  // ---- « Dans le même genre » : suggestions pas encore vues --------------
  const relatedCache = new Map();
  function relatedSection(show) {
    const box = el('<div class="related"></div>');
    if (!navigator.onLine || !TMDB.hasKey()) return box;
    box.append(spinner());
    const provs = myProviders();
    const provById = new Map(provs.map((p) => [p.id, p]));
    (async () => {
      try {
        // on masque ce qui est vu ou commencé ; « à voir » reste, avec un repère
        const mine = new Map((await DB.allShows()).map((s) => [s.key, s.status]));
        const hidden = (k) => k === show.key || mine.get(k) === "vu" || mine.get(k) === "en_cours";
        const cacheKey = show.key + "|" + provs.map((p) => p.id).join(",");
        let data = relatedCache.get(cacheKey);
        if (!data) {
          const skip = new Set([...mine.keys()].filter(hidden));
          data = await TMDB.related(show.type, show.tmdbId || show.key.split(":")[1],
            { prov: provs.map((p) => p.id), skip });
          relatedCache.set(cacheKey, data);
        }
        const keep = (list) => list.filter((x) => !hidden(`${x.type}:${x.tmdbId}`)).slice(0, 15);
        const same = keep(data.same);
        const cross = keep(data.cross);
        box.replaceChildren();
        const row = (title, list) => {
          if (!list.length) return;
          box.append(el(`<div class="section-title">${title}</div>`));
          const r = el('<div class="reco-row"></div>');
          list.forEach((x) => r.append(recoCard(x, mine.get(`${x.type}:${x.tmdbId}`), provById)));
          box.append(r);
        };
        row(`Dans le même genre · ${show.type === "tv" ? "séries" : "films"}`, same);
        row(`Dans le même genre · ${show.type === "tv" ? "films" : "séries"}`, cross);
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

  function recoCard(x, status, provById = new Map()) {
    // logo de la (1ʳᵉ) plateforme où le titre est dispo, parmi les siennes
    const p = (x.on || []).map((id) => provById.get(id)).find((q) => q && q.logo);
    const card = el(
      `<button class="poster-card reco-card">
        <div class="poster-wrap">
          ${status ? '<span class="badge-type badge-list">À voir</span>' : ""}
          <img loading="lazy" src="${TMDB.poster(x.poster, "w185")}" alt="">
          ${p ? `<img class="prov-logo" src="${TMDB.logo(p.logo)}" alt="${esc(p.name)}" title="${esc(p.name)}">` : ""}
        </div>
        <div class="poster-title">${esc(x.title)}</div>
        <div class="poster-sub">${x.type === "tv" ? "Série" : "Film"}${x.year ? " · " + x.year : ""}</div>
      </button>`
    );
    card.addEventListener("click", () => go(() => renderDetail(`${x.type}:${x.tmdbId}`, x), x.title));
    return card;
  }

  // ---- RÉGLAGES -----------------------------------------------------
  let providersList = null; // liste TMDB, gardée le temps de la session
  async function renderReglages() {
    const wrap = el('<div></div>');
    wrap.append(el('<div class="section-title">Mes plateformes de streaming</div>'));
    wrap.append(el(
      `<p class="poster-sub" style="margin-bottom:12px">Les suggestions « Dans le même genre » ne
       montreront que ce que tu peux regarder sur ces plateformes (abonnement ou gratuit, en France).
       Rien de coché = toutes plateformes.</p>`
    ));
    const chosenBox = el('<div class="prov-chosen"></div>');
    const search = el('<div class="search-box"><input type="search" placeholder="Chercher une plateforme…" autocomplete="off"></div>');
    const listBox = el('<div class="prov-list"></div>');
    wrap.append(chosenBox, search, listBox);
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
      data.settings = { providers: myProviders() };
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
  window.addEventListener("online", () => toast("De retour en ligne"));

  resetTo(renderSeries, "Séries", "listes");
})();
