/* ===== app.js — 1% HFT Matrix router (tier matrix, mastery, theme) =====
   Replaces the old 22-day course router. Four tiers, each loaded from
   data/tierN.json and rendered by js/render.js (renderTier). All Java
   execution is backend-only (Judge0 via /api); render.js shows a clear
   notice when no backend is configured. */
(function () {
  "use strict";

  const TIER_COUNT = 4;
  const STORE_KEY = "hft_matrix_mastery_v1";
  const THEME_KEY = "java_hft_theme";
  const app = document.getElementById("app");

  // ---- mastery state (localStorage) ----
  function loadMastery() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p.mastered === "object" && p.mastered) return { mastered: p.mastered };
      }
    } catch (e) { /* ignore */ }
    return { mastered: {} };
  }
  function saveMastery(p) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); }
    catch (e) { /* private mode / quota: just won't persist */ }
  }
  let mastery = loadMastery();
  const masteredCount = () => Object.keys(mastery.mastered).filter((k) => mastery.mastered[k]).length;

  function updateBadge() {
    const c = document.getElementById("streakCount");
    if (c) c.textContent = masteredCount();
  }

  // Exposed so render.js can flag a problem mastered when all tests pass.
  window.HFTMatrix = {
    isMastered: (id) => !!mastery.mastered[id],
    markMastered: (id) => {
      if (!id || mastery.mastered[id]) return;
      mastery.mastered[id] = true;
      saveMastery(mastery);
      updateBadge();
    },
    masteredCount,
  };

  // ---- data ----
  let tiersIndex = null;
  async function getTiers() {
    if (tiersIndex) return tiersIndex;
    const res = await fetch("data/tiers.json");
    if (!res.ok) throw new Error("tiers.json not found");
    tiersIndex = await res.json();
    return tiersIndex;
  }
  async function getTier(n) {
    const res = await fetch("data/tier" + n + ".json");
    if (!res.ok) { const e = new Error("Tier not found"); e.status = res.status; throw e; }
    return res.json();
  }

  // ---- views ----
  async function viewMatrix() {
    app.innerHTML = '<div class="center-msg">Loading the Matrix…</div>';
    let idx;
    try { idx = await getTiers(); }
    catch (e) { app.innerHTML = '<div class="center-msg">Could not load the track. Run this on a server (see README).</div>'; return; }

    const hero = document.createElement("div");
    hero.className = "matrix-hero view-enter";
    hero.innerHTML =
      '<h1>The <span class="accent">1% HFT Matrix</span></h1>' +
      "<p>" + escapeInline(idx.track || "Java Systems Engineering") + "</p>" +
      '<p class="matrix-sub">Four tiers of production-grade, interview-killing systems problems — graded against real execution on the backend.</p>';

    const grid = document.createElement("div");
    grid.className = "matrix-grid";
    (idx.tiers || []).forEach((t, i) => {
      const card = document.createElement("a");
      card.className = "tier-card card-enter";
      card.style.setProperty("--i", Math.min(i, 8));
      card.href = "#/tier/" + t.tier;
      card.innerHTML =
        '<div class="tier-emoji">' + (t.emoji || "⚡") + "</div>" +
        '<div class="tier-rank">Tier ' + t.tier + "</div>" +
        '<div class="tier-title">' + escapeInline(t.title || "") + "</div>" +
        '<div class="tier-tag">#' + escapeInline(t.tag || "") + "</div>" +
        '<div class="tier-summary">' + escapeInline(t.summary || "") + "</div>";
      grid.appendChild(card);
    });

    app.innerHTML = "";
    app.appendChild(hero);
    app.appendChild(grid);
    window.scrollTo(0, 0);
  }

  async function viewTier(n) {
    n = Number(n);
    if (!n || n < 1 || n > TIER_COUNT) return viewMatrix();
    app.innerHTML = '<div class="center-msg">Opening Tier ' + n + "…</div>";
    let data;
    try { data = await getTier(n); }
    catch (e) {
      if (e && e.status === 404) {
        app.innerHTML = '<div class="center-msg">🧱 Tier ' + n + ' is being written. Check back soon.' +
          '<br><br><a class="hero-cta" href="#/">⌂ Back to the Matrix</a></div>';
      } else {
        app.innerHTML = '<div class="center-msg">Couldn\'t load this tier — if you opened the file directly, run it on a server (see README).' +
          '<br><br><a class="hero-cta" href="#/">⌂ Back to the Matrix</a></div>';
      }
      return;
    }

    const view = window.Render.renderTier(data);

    const nav = document.createElement("div");
    nav.className = "lesson-nav";
    const prevBtn = document.createElement("button");
    prevBtn.className = "navbtn";
    prevBtn.textContent = "← Tier " + (n - 1);
    prevBtn.disabled = n === 1;
    prevBtn.addEventListener("click", () => { location.hash = "#/tier/" + (n - 1); });
    const homeBtn = document.createElement("button");
    homeBtn.className = "navbtn";
    homeBtn.textContent = "⌂ Matrix";
    homeBtn.addEventListener("click", () => { location.hash = "#/"; });
    const nextBtn = document.createElement("button");
    nextBtn.className = "navbtn";
    nextBtn.textContent = "Tier " + (n + 1) + " →";
    nextBtn.disabled = n === TIER_COUNT;
    nextBtn.addEventListener("click", () => { location.hash = "#/tier/" + (n + 1); });
    nav.appendChild(prevBtn);
    nav.appendChild(homeBtn);
    nav.appendChild(nextBtn);
    view.appendChild(nav);

    app.innerHTML = "";
    app.appendChild(view);
    window.scrollTo(0, 0);
  }

  function escapeInline(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ---- router ----
  function route() {
    const hash = location.hash || "#/";
    let m;
    if ((m = hash.match(/^#\/tier\/(\d+)/))) viewTier(m[1]);
    else viewMatrix();
  }

  // ---- reset ----
  const resetBtn = document.getElementById("resetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (confirm("Reset all mastery progress? This can't be undone.")) {
        mastery = { mastered: {} };
        saveMastery(mastery);
        updateBadge();
        location.hash = "#/";
        route();
      }
    });
  }

  // ---- theme toggle ----
  const themeBtn = document.getElementById("themeToggle");
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    if (themeBtn) themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
  }
  function loadTheme() {
    try { return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"; }
    catch (e) { return "light"; }
  }
  applyTheme(loadTheme());
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const next = loadTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    });
  }

  window.addEventListener("hashchange", route);
  updateBadge();
  route();
})();
