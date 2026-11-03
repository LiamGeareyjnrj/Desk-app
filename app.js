/* Desk app. Plan B: reads JSON from d/{DATA_PATH}/ only. FOMO links come from the JSON verbatim (links.py). */
(function () {
  "use strict";
  const RM = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TZ = "Europe/London";
  const POLL = 15, STALE = 900;

  // ---- data path: #d= or ?d= (kept in the URL so Add to Home Screen keeps it), then localStorage ----
  (function () {
    const m = location.hash.match(/[#&]d=([^&]+)/) || location.search.match(/[?&]d=([^&]+)/);
    if (m) localStorage.setItem("desk.dp", decodeURIComponent(m[1]));
    const dp = localStorage.getItem("desk.dp");
    if (!dp) return;
    const q = "?d=" + encodeURIComponent(dp);
    if (location.search !== q || /[#&]d=/.test(location.hash)) history.replaceState(null, "", location.pathname + q + (/[#&]d=/.test(location.hash) ? "#/" : (location.hash || "#/")));
    try {
      const base = location.origin + location.pathname.replace(/[^/]*$/, "");
      const man = { name: "Desk", short_name: "Desk", start_url: base + q + "#/", scope: base, display: "standalone", orientation: "portrait",
        background_color: "#000000", theme_color: "#000000",
        icons: [{ src: base + "icons/icon-192.png", sizes: "192x192", type: "image/png" }, { src: base + "icons/icon-512.png", sizes: "512x512", type: "image/png" }] };
      const l = document.querySelector('link[rel="manifest"]');
      if (l) l.href = URL.createObjectURL(new Blob([JSON.stringify(man)], { type: "application/manifest+json" }));
    } catch (e) {}
  })();
  const DP = localStorage.getItem("desk.dp");
  const base = () => "d/" + encodeURIComponent(DP) + "/";

  const S = { state: null, chart: null, act: null, coins: {}, lastOk: 0, failing: false, nextTry: 0, range: "LIVE", actShown: 30, sheet: null, q: "" };

  // ---- formatting ----
  const usd = (v, dp) => v == null ? "n/a" : (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dp == null ? 2 : dp, maximumFractionDigits: dp == null ? 2 : dp });
  const usdK = v => v == null ? "n/a" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : usd(v);
  const price = v => {
    if (v == null) return "n/a";
    if (v >= 1) return usd(v, v >= 1000 ? 2 : 4);
    const d = Math.min(14, Math.max(2, 3 - Math.floor(Math.log10(v))));
    return "$" + v.toFixed(d);
  };
  // big header price: tiny prices as $0.0₈2634 (subscript = number of zeros after the point), like DexScreener
  const bigPrice = v => {
    const s = price(v), m = /^\$0\.(0{4,})(\d+)$/.exec(s);
    return m ? { html: `$0.0<sub>${m[1].length}</sub>${m[2].slice(0, 4)}`, n: 5 + String(m[1].length).length + 2 }
             : { html: s, n: s.length };
  };
  const pct = (v, d = 2) => v == null ? "n/a" : (v >= 0 ? "+" : "") + v.toFixed(d) + "%";
  const hm = ts => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(ts * 1000));
  const age = ts => { if (!ts) return ""; const m = Math.max(0, (Date.now() / 1000 - ts) / 60); return m < 60 ? Math.round(m) + "m old" : m < 2880 ? Math.round(m / 60) + "h old" : Math.round(m / 1440) + "d old"; };
  const left = ts => { const s = Math.max(0, ts - Date.now() / 1000); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h}h ${m}m` : `${m}m`; };
  const ext = (url, text, cls) => url ? `<a class="${cls || ""}" href="${esc(url)}" target="_blank" rel="noopener">${text}</a>` : text;

  // ---- fetch loop ----
  async function get(path) {
    const r = await fetch(base() + path + "?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  async function poll() {
    if (!DP) return render();
    try {
      const [st, ch, ac] = await Promise.all([get("state.json"), get("chart.json"), get("activity.json")]);
      S.state = st; S.chart = ch; S.act = ac; S.lastOk = Date.now(); S.failing = false;
      const r = route();
      if (r.mint) await loadCoin(r.mint, true);
    } catch (e) { S.failing = true; }
    S.nextTry = Date.now() + POLL * 1000;
    render();
  }
  async function loadCoin(mint, quiet) {
    try { S.coins[mint] = await get("coin/" + encodeURIComponent(mint) + ".json"); S.coins[mint]._ok = true; }
    catch (e) { if (!S.coins[mint]) S.coins[mint] = { _missing: true }; if (!quiet) S.failing = !S.state; }
  }
  setInterval(poll, POLL * 1000);
  setInterval(banner, 1000);

  const OFF = $("#offline");   // one red row, kept right under the current navbar
  function banner() {
    const el = OFF;
    const nb = document.querySelector("#view .navbar");
    if (nb && nb.nextElementSibling !== el) nb.after(el);
    const stale = S.state && (Date.now() / 1000 - S.state.generated_at > STALE);
    if (!(S.failing || stale)) { el.hidden = true; return; }
    const n = Math.max(0, Math.ceil((S.nextTry - Date.now()) / 1000));
    const last = S.state ? hm(S.state.generated_at) : "never";
    el.textContent = `Desk offline · retrying in ${n}s · last update ${last}`;
    el.hidden = false;
  }
  new MutationObserver(() => { if (!OFF.hidden) banner(); }).observe($("#view"), { childList: true });

  // ---- router ----
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    const [a, b] = h.split("/");
    if (a === "coin" || a === "auditor") return { name: a, mint: decodeURIComponent(b || "") };
    const [n, q] = (a || "").split("?");
    return { name: n || "home", q: new URLSearchParams(q || "") };
  }
  window.addEventListener("hashchange", async () => {
    S.sheet = null; window.scrollTo(0, 0);
    const r = route();
    render();
    if (r.mint && !S.coins[r.mint]) { await loadCoin(r.mint); render(); }
  });

  // ---- odometer ----
  const odo = document.createElement("div"); odo.className = "odo num"; odo._v = null;
  function setOdo(text) {
    if (odo._v === text) return;
    const old = odo._v; odo._v = text;
    const animate = old != null && old.length === text.length && !RM();
    if (!animate) {
      odo.innerHTML = [...text].map(ch => /\d/.test(ch)
        ? `<span class="d"><span class="strip" style="transform:translateY(-${ch}0%)">${[..."0123456789"].map(x => `<span>${x}</span>`).join("")}</span></span>`
        : `<span class="s">${esc(ch)}</span>`).join("");
      return;
    }
    const kids = [...odo.children], n = text.length;
    let fromRight = 0;
    for (let i = n - 1; i >= 0; i--, fromRight++) {
      const ch = text[i], k = kids[i];
      if (/\d/.test(ch) && k.classList.contains("d")) {
        const s = k.firstChild;
        if (old[i] !== ch) { s.style.transitionDelay = (fromRight * 30) + "ms"; s.style.transform = `translateY(-${ch}0%)`; }
      } else if (!/\d/.test(ch)) k.textContent = ch;
    }
  }

  // persistent canvases so animations survive re-render
  const homeCv = document.createElement("canvas");
  const coinCv = document.createElement("canvas");

  // ---- skeletons ----
  const sk = (h, w, mt) => `<div class="sk" style="height:${h}px;${w ? "width:" + w + ";" : ""}margin:${mt || 0}px 16px 0"></div>`;
  function skeleton(name) {
    if (name === "home") return navbar(true) + sk(66, "70%", 8) + sk(20, "40%", 10) + sk(240, null, 16) + sk(44, null, 8) +
      `<div class="sec-head"><span>Agents</span></div><div class="carousel"><div class="acard sk"></div></div>` + sk(60, null, 24) + sk(60, null, 1);
    return `<div class="navbar"></div>` + sk(40, "50%", 8) + Array.from({ length: 6 }, (_, i) => sk(60, null, i ? 1 : 16)).join("");
  }

  // ---- shared bits ----
  const paperPill = st => st && st.mode === "PAPER" ? `<span class="pill paper">PAPER</span>` : "";
  function unread() { const seen = +localStorage.getItem("desk.seen") || 0; return (S.state ? S.state.pushes : []).some(p => p.id > seen); }
  function navbar() {
    const st = S.state, h = st ? (st.account.fomo_handle || "?") : "";
    return `<div class="navbar">
      <a class="icon-btn" href="#/account" aria-label="Account"><span class="avatar">${esc(h.replace("@", "").slice(0, 1).toUpperCase())}</span></a>
      <a class="title" href="#/agents">Grok Bot <span class="chev">›</span></a>
      <button class="icon-btn" data-act="search" aria-label="Search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button>
      <button class="icon-btn" data-act="bell" aria-label="Alerts"><svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/></svg>${unread() ? '<i class="dot"></i>' : ""}</button>
    </div>`;
  }
  const backbar = (title, extra) => `<div class="navbar"><a class="back" href="javascript:history.length>1?history.back():location.hash='#/'">‹ Back</a><span class="title" style="justify-content:center">${esc(title || "")}</span>${extra || '<span style="width:44px"></span>'}</div>`;
  const agentById = id => S.state.agents.find(a => a.id === id);
  const hasFile = mint => !!(S.state && S.state.search.find(c => c.mint === mint && c.has_file));

  // ---- activity row ----
  function actRow(r) {
    const ic = { bought: ["+", "#0a84ff"], sold: ["↑", "#00d35a"], stopped: ["↓", "#ff453a"], rejected: ["×", "rgba(235,235,245,0.3)"] }[r.kind] || ["•", "#fff"];
    const v = String(r.value || "");
    const vc = r.kind === "rejected" ? "ter" : r.kind === "stopped" || v.startsWith("-") ? "down" : r.kind === "sold" && v.startsWith("+") ? "up" : "";
    const href = r.mint && hasFile(r.mint) ? `#/${r.screen}/${encodeURIComponent(r.mint)}` : null;
    const inner = `<span class="ic" style="background:${ic[1]}22;color:${ic[1]}">${ic[0]}</span>
      <span class="tx"><div class="t">${esc(r.title)}</div><div class="st">${esc(r.subtitle)}</div></span>
      <span class="rv ${vc}">${esc(v)}</span>`;
    return href ? `<a class="row" href="${href}">${inner}</a>` : `<div class="row">${inner}</div>`;
  }

  // ---- agent card (home carousel) ----
  function card(a) {
    const c = a.card || {};
    const head = `<h3 style="color:${a.color}"><span class="sdot ${a.status}"></span>${esc(a.name)}</h3>`;
    let body = "";
    if (a.id === "scanner") {
      const feed = (c.feed || []).slice(0, 4).map(d => d.verdict === "pass"
        ? `<div class="p">${esc(d.coin)} <span class="sec">→ auditor</span></div>`
        : `<div class="k">${esc(d.coin)}<small>${esc(d.reason)}</small></div>`).join("");
      body = `<div class="meta">${a.count} pools · ${c.waiting} in waiting room</div>
        <div class="feed">${feed || '<div class="sec">Listening for graduations</div>'}</div>
        <div class="big" style="color:${a.color}">${a.count} <span class="sec" style="font-size:20px">pools</span></div>`;
    } else if (a.id === "auditor") {
      const s = c.strips || [], last = c.last;
      const strips = Array.from({ length: 8 }, (_, i) => `<i class="${s[i] === true ? "ok" : s[i] === false ? "no" : ""}"></i>`).join("");
      const line = c.busy ? `taking apart ${esc(c.busy.coin)}…` : last ? (last.pass ? `${esc(last.coin)} · 8/8 → Executor` : `${esc(last.coin)} · ${esc(last.reason)}`) : "No coin taken apart yet";
      body = `<div class="meta">${a.count} taken apart</div><div class="strips">${strips}</div>
        <div class="feed"><div class="${last && !last.pass && !c.busy ? "down" : ""}">${line}</div></div>
        <div class="big">${a.count} <span class="sec" style="font-size:20px">taken apart</span></div>
        <div class="foot">${a.rejected} rejected</div>`;
    } else if (a.id === "analyst") {
      const l = c.last;
      body = `<div class="meta">Scoring · ${esc(c.mode)} · min ${c.min_score}</div>
        <canvas class="ring" data-ring="${l ? l.score : ""}" data-min="${c.min_score}"></canvas>
        <div class="feed">${l ? `<div>${esc(l.coin)} · <span class="${l.verdict === "pass" ? "up" : "down"}">${l.verdict === "pass" ? "pass" : "reject"}</span></div><div class="sec">${esc(l.reason)}</div>` : '<div class="sec">Nothing scored yet</div>'}</div>
        <div class="big" style="color:${a.color}">${a.count} <span class="sec" style="font-size:20px">scored</span></div>`;
    } else if (a.id === "executor") {
      const l = c.last;
      const bar = c.busy ? `<div class="bar"><i style="width:100%;opacity:.5"></i></div><div class="foot">Executing… ${esc(c.busy.coin)}</div>`
        : l ? `<div class="bar"><i style="width:100%"></i></div><div class="foot up">✓ ${l.status === "filled" ? "Filled" : "Sent to Telegram"}</div>` : "";
      body = `<div class="meta">${a.count} trades</div>
        <div class="feed">${l ? `<div>${esc(l.coin)}</div><div class="sec">${usd(l.size_usd)} · ${l.stack_pct}% of stack</div>` : '<div class="sec">No trades yet</div>'}</div>${bar}
        <div class="big" style="color:${a.color}">${a.count} <span class="sec" style="font-size:20px">trades</span></div>`;
    } else {
      const l = c.last;
      body = `<div class="meta">Guarding · ${c.open} open</div>
        <div class="feed">${l ? `<div>${esc(l.text)} · ${esc(l.coin)}</div>` : '<div class="sec">Nothing to guard yet</div>'}</div>
        <div class="big" style="color:${a.color}">${c.open} <span class="sec" style="font-size:20px">open</span></div>
        <div class="foot"><span class="pill mono red">stop -${c.stop_pct}%</span><span class="pill mono green">trail ${c.trail_pct}%</span></div>`;
    }
    return `<a class="acard" href="#/agents?a=${a.id}">${head}${body}</a>`;
  }

  // ---- screens ----
  function home() {
    const st = S.state, ch = S.chart;
    setOdo(usd(st.balance));
    const pts = (ch.ranges[S.range] || []);
    const trades = ch.marks.length > 0;
    const val = ts => { let best = null; for (const p of pts) { if (p[0] <= ts) best = p[1]; } return best == null ? (pts[0] || [0, st.balance])[1] : best; };
    const colors = { bought: "#0a84ff", sold: "#00d35a", stopped: "#ff453a" };
    const marks = ch.marks.map((m, i) => ({ ts: m.ts, value: val(m.ts), text: m.label, color: colors[m.kind], key: m.kind + m.mint + m.ts }));
    const acts = (S.act.rows || []).slice(0, 5);
    const html = navbar() + `
      <section class="balance">
        <div class="bal-row"><span id="odo-slot"></span>${paperPill(st)}</div>
        <div class="today"><span class="${st.today_pct >= 0 ? "up" : "down"}">${pct(st.today_pct)}</span><span class="sec">today</span>
          <span class="pill mult">${st.multiplier.toFixed(2)}×</span></div>
      </section>
      <div class="chart-wrap"><span id="cv-slot"></span>${trades ? "" : '<div class="chart-empty">Waiting for the first trade</div>'}</div>
      <div class="ranges">${["LIVE", "1H", "4H", "1D", "1W", "ALL"].map(r => `<button data-range="${r}" class="${r === S.range ? "on" : ""}">${r}</button>`).join("")}</div>
      <div class="sec-head"><span>Agents <span class="sub">· ${st.running} running</span></span></div>
      <div class="carousel" id="car">${st.agents.map(card).join("")}</div>
      <div class="sec-head"><span>Activity</span><a href="#/activity">See all</a></div>
      ${acts.length ? `<div class="list">${acts.map(actRow).join("")}</div>` : '<div class="empty">Nothing yet tonight</div>'}`;
    return { html, after() {
      $("#odo-slot").replaceWith(odo); $("#cv-slot").replaceWith(homeCv);
      homeCv.style.height = "240px";
      Charts.line(homeCv, { points: trades ? pts : [], start: ch.start_value, marks: trades ? marks : [], empty: true });
    } };
  }

  function agents(q) {
    const st = S.state;
    const html = `<div class="navbar"><span class="title">Agents</span></div><div class="large-title">Agents</div>` +
      st.agents.map(a => {
        const alias = a.id;
        const dec = (a.decisions || []).map(d => `<div class="dec"><span class="tm">${hm(d.ts)}</span>
          <span>${ext(d.coin_url, esc(d.coin))} · <b class="${/pass|filled|8\/8|sold/.test(d.verdict) ? "up" : /reject|stopped|skipped|\d\/8/.test(d.verdict) ? "down" : ""}">${esc(d.verdict)}</b></span>
          <span class="why">${esc(d.reason || "")}</span></div>`).join("");
        return `<section class="afull" id="ag-${a.id}">
          <div class="hd"><h3 style="color:${a.color}">${esc(a.name)} <span class="sdot ${a.status}"></span></h3>
            <span class="sec">${a.count} ${esc(a.count_label)} today</span>
            <span class="switch ${a.paused ? "off" : ""}" role="switch" aria-checked="${!a.paused}" aria-disabled="true"></span></div>
          <div class="cmd">${a.status} · to ${a.paused ? "resume" : "pause"}, send “${esc(a.command)}” in Telegram</div>
          <div style="margin-top:10px">${dec || `<div class="sec" style="padding:8px 0">${a.id === "scanner" ? "Listening for graduations" : a.id === "auditor" ? "No coin taken apart yet" : "Nothing yet tonight"}</div>`}</div>
          <a class="link-btn" href="#/account?g=${alias}">Settings ›</a></section>`;
      }).join("");
    return { html, after() { const a = q && q.get("a"); if (a) { const el = $("#ag-" + a); if (el) el.scrollIntoView(); } } };
  }

  function activity() {
    const rows = S.act.rows || [];
    const html = `<div class="navbar"><span class="title">Activity</span></div><div class="large-title">Activity</div>` +
      (rows.length ? `<div class="list">${rows.slice(0, S.actShown).map(actRow).join("")}</div>` +
        (rows.length > S.actShown ? `<button class="more" data-act="more">Show ${Math.min(S.act.page_size, rows.length - S.actShown)} more</button>` : "")
        : '<div class="empty">Nothing yet tonight</div>');
    return { html };
  }

  function account(q) {
    const st = S.state, a = st.account;
    const groups = st.settings.map(g => `<div class="group-h" id="set-${g.agent}">${g.agent[0].toUpperCase() + g.agent.slice(1)}</div>
      <div class="list set">${g.items.map(i => `<div class="row"><span class="tx"><div class="t">${esc(i.name)}<small>${esc(i.aliases.length ? "set " + i.aliases[0] + " to …" : i.key)}</small></div></span><span class="rv">${esc(i.value)}</span></div>`).join("")}</div>`).join("");
    const html = `<div class="navbar"><span class="title">Account</span></div><div class="large-title">Account</div>
      <div class="list">
        <div class="row"><span class="tx"><div class="t">Mode</div><div class="st">Send “${a.mode === "PAPER" ? "live" : "paper"}” in Telegram to switch</div></span>${a.mode === "PAPER" ? '<span class="pill paper">PAPER</span>' : '<span class="pill green">LIVE</span>'}</div>
        <div class="row"><span class="tx"><div class="t">Stack</div><div class="st">${a.mode === "LIVE" ? "LIVE stack" : "Paper cash + open positions at entry"}</div></span><span class="rv">${usd(a.stack)}</span></div>
        <a class="row" href="${esc(a.profile_url)}" target="_blank" rel="noopener"><span class="tx"><div class="t">Your FOMO profile</div><div class="st">@${esc(String(a.fomo_handle || "").replace(/^@/, ""))}</div></span><span class="chev">›</span></a>
        <button class="row" style="width:100%;text-align:left" data-act="invite" data-url="${esc(a.signup_url)}"><span class="tx"><div class="t">Invite a friend</div><div class="st">Share your FOMO invite link</div></span><span class="chev">›</span></button>
        <div class="row"><span class="tx"><div class="t">Telegram</div></span><span class="rv ${a.telegram ? "up" : "down"}">${a.telegram ? "Connected" : "Not connected"}</span></div>
        <div class="row"><span class="tx"><div class="t">Web push</div><div class="st">${esc(a.webpush)}</div></span></div>
      </div>
      <div class="group-h">Settings are read-only here. Change them in Telegram, e.g. “set stop to -8%”. Live min stack ${usd(a.min_stack)}.</div>
      ${groups}`;
    return { html, after() { const g = q && q.get("g"); if (g) { const el = $("#set-" + g); if (el) el.scrollIntoView(); } } };
  }

  const played = new Set();
  function auditor(mint) {
    const c = S.coins[mint];
    if (!c || c._missing) return { html: backbar("Auditor") + (c && c._missing ? '<div class="empty">No coin taken apart yet</div>' : skeleton("x")) };
    const au = c.audit;
    const names = au ? au.layers.map(l => l.name) : Array.from({ length: 8 }, (_, i) => "Layer " + (i + 1));
    const key = au ? mint + au.ts : null;
    const play = au && !played.has(key) && !RM();
    const discs = names.map((n, i) => {
      const l = au && au.layers[i];
      const cls = l && !play ? (l.pass ? "ok" : "no") : "";
      return `<div class="disc ${cls}" data-i="${i}"><span>${i + 1} · ${esc(n)}</span><span class="mk">${l && !play ? (l.pass ? "✓" : "✕") : ""}</span></div>`;
    }).join("");
    let verdict;
    if (!au) verdict = c.status === "scanned" ? `<h2>Taking apart…</h2><p>Waiting for the Auditor</p>` : `<h2 class="sec">No coin taken apart yet</h2>`;
    else if (au.passed) verdict = `<h2 class="up">Cleared · 8/8 parts</h2><p>${c.signal ? `Sent to Executor · ${usd(c.signal.size_usd)}` : c.status === "rejected" ? `Then stopped by ${esc(c.stopped_by)} · ${esc(c.reason)}` : "Sent to Executor"}</p>`;
    else verdict = `<h2 class="down">Rejected · ${esc(au.reason)}</h2><p>Grok Bot won't buy ${esc(c.label)}</p>`;
    const rows = au ? au.layers.map(l => `<div class="row vrow"><span class="ic" style="background:${l.pass ? "#00d35a22" : "#ff453a22"};color:${l.pass ? "#00d35a" : "#ff453a"}">${l.pass ? "✓" : "✕"}</span>
        <span class="tx"><div class="t">${l.n} · ${esc(l.name)}</div><div class="st">${esc(l.rule ? "rule " + l.rule : "")}${l.source ? " · " + esc(l.source) : ""}</div></span><span class="rv">${esc(l.value)}</span></div>`).join("") : "";
    const alias = (S.state.settings.find(g => g.agent === "auditor").items.find(i => i.key === "auditor.enabled") || {}).aliases || [];
    const html = backbar(c.label) + `<div class="discs" id="discs">${discs}</div><div class="verdict">${verdict}</div>
      ${rows ? `<div class="list">${rows}</div>` : ""}
      <div class="list" style="margin-top:16px"><div class="row"><span class="tx"><div class="t">Take apart before buying</div><div class="st">Send “set ${esc(alias[0] || "auditor.enabled")} to ${S.state.audit_enabled ? "off" : "on"}” in Telegram</div></span><span class="switch ${S.state.audit_enabled ? "" : "off"}" aria-disabled="true"></span></div></div>
      <a class="cta" href="${esc(c.coin_url)}" target="_blank" rel="noopener">Open on FOMO</a>`;
    return { html, after() {
      const ds = [...document.querySelectorAll("#discs .disc")];
      if (!au && c.status === "scanned" && !RM()) {   // waiting on the server: beam only, no colours
        let i = 0; const t = setInterval(() => { if (!document.body.contains(ds[0])) return clearInterval(t);
          ds.forEach(d => d.classList.remove("beam")); void ds[i].offsetWidth; ds[i].classList.add("beam"); i = (i + 1) % 8; }, 350);
      }
      if (play) {
        played.add(key);
        au.layers.forEach((l, i) => {
          setTimeout(() => ds[i].classList.add("beam"), i * 350);
          setTimeout(() => { ds[i].classList.remove("beam"); ds[i].classList.add(l.pass ? "ok" : "no"); ds[i].querySelector(".mk").textContent = l.pass ? "✓" : "✕"; }, i * 350 + 350);
        });
      }
    } };
  }

  function coin(mint) {
    const c = S.coins[mint];
    if (!c || c._missing) return { html: backbar("Coin") + (c && c._missing ? '<div class="empty">This coin isn’t on the desk.</div>' : skeleton("x")) };
    const p = c.position, ex = c.exit, au = c.audit, st = c.stats || {};
    const shield = au ? `<a class="chip ${au.passed ? "" : "no"}" href="#/auditor/${encodeURIComponent(mint)}">🛡 ${au.passed_count}/8</a>` : "";
    const since = p ? `<div class="today" style="padding:0 16px"><span class="${p.change_pct >= 0 ? "up" : "down"}">${p.change_pct >= 0 ? "▲" : "▼"} ${Math.abs(p.change_pct).toFixed(2)}%</span><span class="sec">since entry</span></div>` : "";
    const statusLine = !p && c.status === "rejected" ? `<div class="today" style="padding:0 16px"><span class="down">Stopped by ${esc(c.stopped_by)}</span><span class="sec">${esc(c.reason)}</span></div>` : "";
    const posCard = p ? `<div class="card"><h3>Your position · ${usd(p.size_usd)} in · Executor</h3>
        <div class="kv"><span>Entry</span><span>${price(p.entry_price)} · ${hm(p.opened_at)}</span></div>
        ${p.open ? "" : `<div class="kv"><span>Exit</span><span>${price(p.exit_price)} · ${esc(p.exit_reason)}</span></div><div class="kv"><span>P&amp;L</span><span class="${p.pnl_usd >= 0 ? "up" : "down"}">${(p.pnl_usd >= 0 ? "+" : "") + usd(p.pnl_usd)}</span></div>`}</div>` : "";
    const exitCard = ex ? `<div class="card"><h3>Exit · Risk</h3>
        <div class="kv"><span>Stop line</span><span><span class="pill mono red">stop -${ex.stop_pct}%</span> ${price(ex.stop_line)}</span></div>
        <div class="kv"><span>Trail line</span><span><span class="pill mono green">trail ${ex.trail_pct}%</span> ${ex.trail_active ? price(ex.trail_line) : "starts at " + price(ex.trail_start_line)}</span></div>
        <div class="kv"><span>Timeout</span><span>${left(ex.timeout_at)} left</span></div></div>` : "";
    const html = backbar(c.symbol || "", paperPill(S.state) || '<span style="width:44px"></span>') + `
      <div class="coin-head"><h1>${esc(c.name || c.mint.slice(0, 6))} ${shield}</h1>
        <div class="sec">${esc(c.symbol || "")} · ${esc(c.chain)} · ${age(c.migrated_at)}</div></div>
      <div class="price" style="--n:${bigPrice(c.price).n}">${bigPrice(c.price).html}</div>${since}${statusLine}
      <div class="chart-wrap"><span id="cv-slot"></span>${(c.candles || []).length ? "" : '<div class="chart-empty">No price yet</div>'}</div>
      <div class="stats"><div><b>${usdK(st.market_cap)}</b><span>Market cap</span></div><div><b>${usdK(st.liquidity)}</b><span>Liquidity</span></div>
        <div><b>${usdK(st.volume_24h)}</b><span>24h volume</span></div><div><b>${st.holders == null ? "n/a" : st.holders.toLocaleString("en-US")}</b><span>Holders</span></div></div>
      ${posCard}${exitCard}
      <a class="cta ${p && p.open ? "sell" : ""}" href="${esc(c.coin_url)}" target="_blank" rel="noopener">${p && p.open ? "Sell on FOMO" : "Buy on FOMO"}</a>`;
    return { html, after() {
      $("#cv-slot").replaceWith(coinCv); coinCv.style.height = "260px";
      Charts.candles(coinCv, { candles: c.candles, lines: ex ? [{ value: ex.exit_line, color: "#ff9f0a", label: "Risk trailing stop" }] : [] });
    } };
  }

  // ---- overlays ----
  function sheet() {
    const el = $("#sheet");
    if (!S.sheet || !S.state) { el.hidden = true; return; }
    el.hidden = false;
    if (S.sheet === "bell") {
      const ps = S.state.pushes;
      el.innerHTML = `<div class="navbar"><span class="title">Alerts</span><button class="back" data-act="close">Done</button></div>` +
        (ps.length ? `<div class="list">${ps.map(p => `<div class="row"><span class="tx"><div class="t">${esc(p.title)}</div><div class="st">${hm(p.ts)} · ${esc(p.kind)}</div></span>${p.coin_url ? ext(p.coin_url, '<span class="chev">›</span>') : ""}</div>`).join("")}</div>` : '<div class="empty">Nothing yet tonight</div>');
      localStorage.setItem("desk.seen", Math.max(0, ...ps.map(p => p.id)));
    } else {
      if (!el.querySelector(".search-in")) {
        el.innerHTML = `<div class="navbar"><input class="search-in" placeholder="Name, symbol or mint" autocomplete="off" autocapitalize="off"><button class="back" data-act="close">Cancel</button></div><div id="res"></div>`;
        const inp = el.querySelector(".search-in"); inp.value = S.q; inp.focus();
        inp.addEventListener("input", () => { S.q = inp.value; results(); });
      }
      results();
    }
  }
  function results() {
    const q = S.q.trim().toLowerCase(), box = $("#res");
    if (!box) return;
    const hits = q ? S.state.search.filter(c => [c.name, c.symbol, c.mint].some(v => v && v.toLowerCase().includes(q))).slice(0, 40) : [];
    box.innerHTML = hits.length ? `<div class="list">${hits.map(c => {
      const t = `<span class="tx"><div class="t">${esc(c.name || c.mint.slice(0, 8))}</div><div class="st">${esc(c.symbol || "")} · ${esc(c.mint.slice(0, 6))}…</div></span><span class="chev">›</span>`;
      return c.has_file ? `<a class="row" href="#/coin/${encodeURIComponent(c.mint)}">${t}</a>` : `<a class="row" href="${esc(c.coin_url)}" target="_blank" rel="noopener">${t}</a>`;
    }).join("")}</div>` : (q ? '<div class="empty">No coin matches</div>' : "");
  }

  // ---- render ----
  function render() {
    const r = route(), v = $("#view");
    document.querySelectorAll(".tabbar a").forEach(a => a.classList.toggle("on", a.dataset.tab === (["coin", "auditor"].includes(r.name) ? "" : r.name)));
    banner();
    if (!DP) { v.innerHTML = `<div class="navbar"><span class="title">Desk</span></div><div class="empty">Open the desk link from Telegram in Safari, then Share and Add to Home Screen. Or paste the desk link here:<br><br><input id="dpin" type="url" placeholder="Paste desk link" style="width:90%;padding:10px;font-size:16px;border-radius:10px;border:1px solid #333;background:#111;color:#fff"><br><br><button id="dpgo" style="padding:10px 18px;font-size:16px;border-radius:10px">Open desk</button></div>`;
      const go = $("#dpgo"); if (go) go.onclick = () => { const m = ($("#dpin").value || "").match(/[#?&]d=([^&#]+)/); if (m) { localStorage.setItem("desk.dp", decodeURIComponent(m[1])); location.replace(location.pathname + "?d=" + m[1] + "#/"); } };
      return; }
    if (!S.state) { v.innerHTML = skeleton(r.name); return; }
    const car = $("#car"), sl = car ? car.scrollLeft : 0, y = window.scrollY;
    const scr = r.name === "home" ? home() : r.name === "agents" ? agents(r.q) : r.name === "activity" ? activity()
      : r.name === "account" ? account(r.q) : r.name === "coin" ? coin(r.mint) : r.name === "auditor" ? auditor(r.mint) : home();
    v.innerHTML = scr.html;
    if (scr.after) scr.after();
    document.querySelectorAll("canvas[data-ring]").forEach(cv => Charts.ring(cv, cv.dataset.ring === "" ? null : +cv.dataset.ring, +cv.dataset.min));
    const car2 = $("#car"); if (car2) car2.scrollLeft = sl;
    if (!(r.q && (r.q.get("a") || r.q.get("g")))) window.scrollTo(0, y);
    sheet();
  }

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-act],[data-range]");
    if (!b) return;
    if (b.dataset.range) { S.range = b.dataset.range; return render(); }
    const act = b.dataset.act;
    if (act === "search" || act === "bell") { S.sheet = act; S.q = ""; $("#sheet").innerHTML = ""; return render(); }
    if (act === "close") { S.sheet = null; $("#sheet").innerHTML = ""; return render(); }
    if (act === "more") { S.actShown += S.act.page_size; return render(); }
    if (act === "invite") {
      const url = b.dataset.url;
      try { if (navigator.share) { await navigator.share({ title: "FOMO", url }); return; } } catch (err) { if (err && err.name === "AbortError") return; }
      try { await navigator.clipboard.writeText(url); } catch (err) {
        const t = document.createElement("textarea"); t.value = url; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
      }
      const ts = $("#toast"); ts.textContent = "Link copied"; ts.hidden = false; setTimeout(() => ts.hidden = true, 1600);
    }
  });
  addEventListener("resize", () => render());
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  render(); poll();
})();
