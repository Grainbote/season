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

  // ---- navigation (pile de vues) ---------------------------------------
  let stack = [];
  function setTab(tab) {
    [...tabbar.children].forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
  }
  function render(node) {
    view.replaceChildren(node);
    view.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }
  function go(fn, title, { push = true } = {}) {
    if (push) stack.push({ fn, title });
    else stack[stack.length - 1] = { fn, title };
    backBtn.hidden = stack.length <= 1;
    topTitle.textContent = title;
    fn();
  }
  function back() {
    if (stack.length <= 1) return;
    stack.pop();
    const top = stack[stack.length - 1];
    backBtn.hidden = stack.length <= 1;
    topTitle.textContent = top.title;
    top.fn();
  }
  function resetTo(fn, title, tab) {
    stack = [];
    setTab(tab);
    go(fn, title);
  }
  backBtn.addEventListener("click", back);
  tabbar.addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (!b) return;
    const tab = b.dataset.tab;
    if (tab === "listes") resetTo(renderListes, "Listes", "listes");
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
    await DB.putShow(show);
    return show;
  }

  // ---- LISTES ----------------------------------------------------------
  let listesFilter = "en_cours";
  async function renderListes() {
    render(spinner());
    const shows = await DB.allShows();
    if (!TMDB.hasKey()) {
      // avertissement clé manquante
    }
    const counts = { a_voir: 0, en_cours: 0, vu: 0 };
    shows.forEach((s) => { counts[s.status] = (counts[s.status] || 0) + 1; });

    const wrap = el('<div></div>');
    if (!TMDB.hasKey()) {
      wrap.append(el(
        `<div class="config-warn">Clé TMDB manquante : ouvre <b>config.js</b> et colle ta clé pour pouvoir chercher des séries et des films.</div>`
      ));
    }

    const seg = el('<div class="segmented"></div>');
    for (const k of ["a_voir", "en_cours", "vu"]) {
      const b = el(
        `<button data-k="${k}">${STATUS[k]}<span class="count-pill">${counts[k] || 0}</span></button>`
      );
      if (k === listesFilter) b.classList.add("is-active");
      b.addEventListener("click", () => { listesFilter = k; renderListes(); });
      seg.append(b);
    }
    wrap.append(seg);

    const inList = shows
      .filter((s) => s.status === listesFilter)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    if (!inList.length) {
      wrap.append(el(
        `<div class="empty"><span class="big">▦</span>Rien dans « ${STATUS[listesFilter]} ».<br>` +
        `Utilise l'onglet Recherche pour ajouter une série ou un film.` +
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
  async function renderDetail(key, fallbackSearchItem) {
    render(spinner());
    const [type, id] = key.split(":");
    let show = await DB.getShow(key);
    const saved = !!show;
    const online = navigator.onLine;

    // charge / rafraîchit les métadonnées depuis TMDB
    if (!show || (online && staleMeta(show))) {
      try {
        const fresh = type === "tv" ? await TMDB.tv(id) : await TMDB.movie(id);
        if (show) {
          Object.assign(show, fresh, {
            status: show.status,
            rating: show.rating,
            review: show.review,
            watchedMovie: show.watchedMovie,
            createdAt: show.createdAt,
          });
        } else {
          show = fresh;
        }
        show.metaAt = Date.now();
        if (type === "tv") {
          show.totalEpisodes = (show.seasons || []).reduce((n, s) => n + s.count, 0);
        }
        if (saved) await DB.putShow(show);
      } catch (err) {
        if (!show && fallbackSearchItem) {
          const f = fallbackSearchItem;
          show = { key, type, tmdbId: +id, title: f.title, year: f.year,
                   overview: f.overview, poster: f.poster, genres: [], seasons: [] };
        } else if (!show) {
          render(el(`<div class="empty">Impossible de charger cette fiche.<br>${
            navigator.onLine ? "Vérifie ta clé TMDB." : "Pas de réseau."
          }</div>`));
          return;
        }
      }
    }

    const episodes = type === "tv" ? await DB.episodesOf(key) : [];
    const watchedMap = new Map(episodes.map((e) => [`${e.season}:${e.episode}`, e]));

    view.replaceChildren(detailNode(show, saved, watchedMap));
    view.scrollTo(0, 0);

    // pour une série déjà suivie : rafraîchir les épisodes en tâche de fond
    if (saved && type === "tv" && online && staleMeta({ metaAt: show.epAt })) {
      syncEpisodes(show).then((changed) => {
        if (changed && stack[stack.length - 1]?.title === show.title) renderDetail(key);
      });
    }
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

    if (!saved) {
      const addBtn = el(`<button class="btn-primary">＋ Ajouter à mes listes</button>`);
      addBtn.addEventListener("click", async () => {
        show.createdAt = Date.now();
        show.status = "a_voir";
        show.rating = 0;
        show.review = "";
        await DB.putShow(show);
        if (show.type === "tv") await syncEpisodes(show);
        toast("Ajouté");
        go(() => renderDetail(show.key), show.title, { push: false });
      });
      wrap.append(addBtn);
      render(wrap);
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
    const stars = el('<div class="stars"></div>');
    for (let i = 1; i <= 5; i++) {
      const s = el(`<span data-v="${i}">★</span>`);
      if (i <= (show.rating || 0)) s.classList.add("on");
      s.addEventListener("click", async () => {
        show.rating = show.rating === i ? 0 : i;
        await DB.putShow(show);
        stars.querySelectorAll("span").forEach((x) =>
          x.classList.toggle("on", +x.dataset.v <= show.rating)
        );
      });
      stars.append(s);
    }
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

    // --- retirer ---
    const del = el('<button class="link-btn" style="color:var(--warn);margin-top:24px">Retirer de mes listes</button>');
    del.addEventListener("click", async () => {
      if (!confirm(`Retirer « ${show.title} » ? Ta progression et ton avis seront effacés.`)) return;
      await DB.deleteShow(show.key);
      toast("Retiré");
      back();
    });
    wrap.append(del);

    render(wrap);
    return wrap;
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
        await DB.importAll(data);
        toast("Sauvegarde importée");
        renderStats();
      } catch {
        toast("Fichier illisible");
      }
    });
    wrap.append(exp, imp, file);

    render(wrap);
  }

  // ---- service worker + démarrage ----------------------------------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () =>
      navigator.serviceWorker.register("sw.js").catch(() => {})
    );
  }
  window.addEventListener("online", () => toast("De retour en ligne"));

  resetTo(renderListes, "Listes", "listes");
})();
