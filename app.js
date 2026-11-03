// Desk web app (plan B): polls static JSON at d/{DATA_PATH}/ published by the desk every ~2 min.
// FOMO links come ready-made in the JSON (built by links.py); this file never builds a FOMO URL.
(function () {
  "use strict";
  const POLL_MS = 60000;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const params = () => Object.fromEntries(location.hash.replace(/^#/, "").split("&").filter(Boolean).map((p) => p.split("=").map(decodeURIComponent)));
  let D = { state: null, activity: [], coins: [], positions: [] }, lastOk = 0, lastErr = null, tab = "home";

  function dataPath() {
    const p = params();
    if (p.d) { try { localStorage.setItem("desk.d", p.d); } catch (e) {} return p.d; }
    try { return localStorage.getItem("desk.d"); } catch (e) { return null; }
  }
  function setHash(extra) {
    const d = dataPath();
    location.hash = "d=" + encodeURIComponent(d || "") + (extra ? "&" + extra : "");
  }

  const usd = (v, d = 2) => v == null ? "n/a" : (Math.abs(v) >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : Math.abs(v) >= 1e4 ? "$" + (v / 1e3).toFixed(0) + "k" : (v < 0 ? "-$" : "$") + Math.abs(v).toFixed(d));
  const pct = (v) => v == null ? "n/a" : (v >= 0 ? "+" : "") + Number(v).toFixed(1) + "%";
  const cls = (v) => v == null ? "" : v >= 0 ? "g" : "r";
  const price = (p) => { if (p == null) return "n/a"; return p >= 1 ? "$" + p.toFixed(4) : "$" + Number(p).toPrecision(4); };
  const ago = (t) => { if (!t) return "never"; const s = Math.max(0, Date.now() / 1000 - t); return s < 90 ? Math.round(s) + "s ago" : s < 5400 ? Math.round(s / 60) + " min ago" : s < 172800 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " d ago"; };
  const isoT = (iso) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : "";
  const btn = (label, url, kind) => url ? `<a class="btn sm ${kind || ""}" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>` : "";

  async function load() {
    const d = dataPath();
    if (!d) { lastErr = "nopath"; render(); return; }
    const base = "d/" + encodeURIComponent(d) + "/";
    try {
      const t = Date.now();
      const get = (f) => fetch(base + f + "?t=" + t, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(f + " HTTP " + r.status); return r.json(); });
      const [state, activity, coins, positions] = await Promise.all(["state.json", "activity.json", "coins.json", "positions.json"].map(get));
      D = { state, activity, coins, positions }; lastOk = Date.now(); lastErr = null;
    } catch (e) { lastErr = String(e.message || e); }
    render();
  }

  function banner() {
    const b = $("#banner");
    let msg = "", warn = false;
    if (lastErr && lastErr !== "nopath") msg = D.state ? `Can't reach desk data (${esc(lastErr)}). Showing data from ${ago(D.state.generated_at)}.` : `Can't reach desk data (${esc(lastErr)}). Retrying every minute.`;
    else if (D.state && Date.now() / 1000 - D.state.generated_at > 900) { msg = `Desk data is ${ago(D.state.generated_at)}. The desk may be down; pushes come via Telegram.`; warn = true; }
    b.className = "banner" + (warn ? " warn" : "") + (msg ? "" : " hidden");
    b.innerHTML = msg;
  }

  function chart(canvas, pts, opts = {}) {
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = opts.h || 120;
    canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.height = h + "px";
    const c = canvas.getContext("2d"); c.scale(dpr, dpr);
    if (!pts || pts.length < 2) { c.fillStyle = "#8b93a7"; c.font = "12px system-ui"; c.textAlign = "center"; c.fillText(opts.empty || "Not enough data yet", w / 2, h / 2); return; }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    (opts.lines || []).forEach((l) => { if (l.y != null) { y0 = Math.min(y0, l.y); y1 = Math.max(y1, l.y); } });
    if (y1 === y0) { y1 += Math.abs(y1) * 0.01 || 1; y0 -= Math.abs(y0) * 0.01 || 1; }
    const pad = 6, X = (x) => pad + (x - x0) / (x1 - x0 || 1) * (w - 2 * pad), Y = (y) => h - pad - (y - y0) / (y1 - y0) * (h - 2 * pad);
    (opts.lines || []).forEach((l) => { if (l.y == null) return; c.strokeStyle = l.color; c.setLineDash([4, 4]); c.lineWidth = 1; c.beginPath(); c.moveTo(pad, Y(l.y)); c.lineTo(w - pad, Y(l.y)); c.stroke(); c.setLineDash([]); });
    const up = ys[ys.length - 1] >= ys[0];
    c.strokeStyle = opts.color || (up ? "#2fd27a" : "#ff5d5d"); c.lineWidth = 2; c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1])))); c.stroke();
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, (opts.color || (up ? "#2fd27a" : "#ff5d5d")) + "33"); g.addColorStop(1, "#0000");
    c.lineTo(X(x1), h); c.lineTo(X(x0), h); c.closePath(); c.fillStyle = g; c.fill();
  }

  const empty = (ico, t, sub) => `<div class="empty"><div class="ico">${ico}</div><div><b>${esc(t)}</b></div><div class="small">${sub || ""}</div></div>`;

  function activityItem(a) {
    return `<div class="item"><div class="row"><div><span class="tag">${esc(a.agent)}</span> <b>${esc(a.title)}</b></div><span class="muted small">${isoT(a.ts)}</span></div>
      ${a.line2 ? `<div class="small">${esc(a.line2)}</div>` : ""}${a.line3 ? `<div class="small muted">${esc(a.line3)}</div>` : ""}
      ${a.link ? `<div style="margin-top:6px">${btn("Open on FOMO", a.link, "ghost")}</div>` : ""}</div>`;
  }

  function vHome() {
    const s = D.state, open = D.positions.filter((p) => p.status === "open");
    const today = D.positions.filter((p) => p.status === "closed" && Date.now() / 1000 - p.closed_at < 86400);
    const pnl = today.reduce((a, p) => a + (p.pnl_usd || 0), 0);
    const c = s.counts;
    let h = `<div class="card"><div class="muted small">${s.mode === "PAPER" ? "Paper balance" : "Live stack"}</div>
      <div class="row"><div class="big">${usd(s.stack)}</div><div class="${cls(s.stack - s.paper_start)}">${s.mode === "PAPER" ? pct(100 * (s.stack / s.paper_start - 1)) : ""}</div></div>
      <div class="small muted">Cash ${usd(s.cash)} · 24h P&L <span class="${cls(pnl)}">${usd(pnl)}</span> · ticket ${usd(s.ticket)}</div>
      <canvas id="eq"></canvas></div>`;
    h += `<h2>Open positions</h2>`;
    h += open.length ? open.map((p) => { const g = p.last_price ? 100 * (p.last_price / p.entry_price - 1) : null;
      return `<div class="card"><a class="coin" href="#d=${encodeURIComponent(dataPath())}&c=${encodeURIComponent(p.mint)}"><div class="row"><b>${esc(p.name)}</b><b class="${cls(g)}">${pct(g)}</b></div>
      <div class="small muted">${usd(p.size_usd)} at ${price(p.entry_price)} · stop ${price(p.stop_price)}${p.trail_active ? " (trailing)" : ""} · ${ago(p.opened_at)}</div></a>
      <canvas data-series="${p.id}"></canvas><div style="margin-top:8px">${btn("Sell on FOMO", p.link, "sell")}</div></div>`; }).join("")
      : `<div class="card">${empty("◎", "No open positions", "Executor buys only coins that pass Scanner, all 8 audit layers and the Analyst.")}</div>`;
    h += `<h2>Tonight</h2><div class="card grid"><div><b>${c.migrations}</b><span class="small muted">graduates</span></div><div><b>${c.scanned_pass}</b><span class="small muted">scanned</span></div><div><b>${c.audit_pass}/${c.audited}</b><span class="small muted">audit pass</span></div><div><b>${c.bought}</b><span class="small muted">bought</span></div></div>`;
    h += `<h2>Activity</h2><div class="card feed">${D.activity.length ? D.activity.slice(0, 40).map(activityItem).join("") : empty("…", "No activity yet", "Waiting for the first pump.fun graduate.")}</div>`;
    $("#view").innerHTML = h;
    chart($("#eq"), [[s.generated_at - 86400 * 7, s.paper_start]].concat(s.equity || []).concat([[s.generated_at, s.stack]]), { h: 90, empty: "Equity curve starts with the first closed trade" });
    open.forEach((p) => { const cv = document.querySelector(`canvas[data-series="${p.id}"]`); if (cv) chart(cv, p.series, { h: 80, lines: [{ y: p.entry_price, color: "#8b93a7" }, { y: p.stop_price, color: "#ff5d5d" }] }); });
  }

  function hbClass(a, gen) {
    if (a.paused) return "warn";
    if (!a.beat) return "bad";
    const age = gen - a.beat;
    if (a.status && a.status.startsWith("error")) return "warn";
    return age < 300 ? "ok" : age < 900 ? "warn" : "bad";
  }

  function vAgents() {
    const s = D.state, c = s.counts, gen = s.generated_at;
    const desc = { scanner: `Room ${c.room} · passed ${c.scanned_pass} of ${c.migrations} tonight`, auditor: `Audited ${c.audited} · passed ${c.audit_pass}`,
      analyst: `${s.settings["analyst.mode"]} · analyzed ${c.analyzed} · passed ${c.analyst_pass} · Jev calls ${s.totals.jev_calls}`,
      executor: `Ticket ${usd(s.ticket)} · bought ${c.bought}`, risk: `Stop -${s.settings["risk.stop_pct"]}% · trail ${s.settings["risk.trail_pct"]}% from +${s.settings["risk.trail_start_pct"]}% · timeout ${s.settings["risk.timeout_h"]}h` };
    let h = s.agents.map((a) => `<div class="card"><div class="row"><div><span class="dot ${hbClass(a, gen)}"></span><b>${a.name}</b></div><span class="small muted">${a.paused ? "paused" : esc(a.status || "no heartbeat")}</span></div>
      <div class="small">${esc(desc[a.id])}</div><div class="small muted">Heartbeat ${a.beat ? Math.round(gen - a.beat) + "s before publish" : "never"}</div>
      <div class="feed small" style="margin-top:6px">${D.activity.filter((x) => x.agent === a.id).slice(0, 3).map((x) => `<div class="item">${esc(x.title)}<div class="muted">${esc(x.line2 || "")}</div></div>`).join("") || '<div class="muted">No activity yet</div>'}</div></div>`).join("");
    h += `<div class="card small muted">PumpPortal stream: last message ${ago(s.ws.last_msg)} · reconnects 24h ${s.ws.reconnects_24h}. Pause or resume agents in Telegram: <b>pause scanner</b>.</div>`;
    $("#view").innerHTML = h;
  }

  function layerBar(a) { return a && a.layers ? `<div class="layers">${a.layers.map((l) => `<span class="${l.ok ? "ok" : ""}" title="${esc(l.layer)}"></span>`).join("")}</div>` : ""; }

  function vAuditor() {
    const list = D.coins.filter((c) => c.audit);
    $("#view").innerHTML = list.length ? list.map((c) => { const n = c.audit.layers.filter((l) => l.ok).length;
      return `<div class="card"><a class="coin" href="#d=${encodeURIComponent(dataPath())}&c=${encodeURIComponent(c.mint)}"><div class="row"><b>${esc(c.label)}</b><b class="${n === 8 ? "g" : "r"}">${n}/8</b></div>
      <div class="small muted">${c.audit.passed ? "Passed all 8 layers" : esc(c.audit.reason)} · ${isoT(c.audit.ts)}</div>${layerBar(c.audit)}</a></div>`; }).join("")
      : `<div class="card">${empty("🛡", "No audits yet", "A coin reaches the Auditor after Scanner sees enough liquidity, pool age and a low top-10 share.")}</div>`;
  }

  function vCoin(mint) {
    const c = D.coins.find((x) => x.mint === mint), p = D.positions.find((x) => x.mint === mint);
    if (!c && !p) { $("#view").innerHTML = `<a class="back" href="#d=${encodeURIComponent(dataPath())}">‹ Back</a><div class="card">${empty("?", "Coin not in the published data", "Only the latest 150 coins are published.")}</div>`; return; }
    const name = c ? c.label : p.name, link = (c || p).link;
    let h = `<a class="back" href="#d=${encodeURIComponent(dataPath())}">‹ Back</a><div class="card"><div class="row"><div><b style="font-size:20px">${esc(name)}</b><div class="small muted" style="word-break:break-all">${esc(mint)}</div></div></div>
      ${c ? `<div class="small" style="margin-top:6px">Status <b>${esc(c.status)}</b>${c.reason ? ` · ${esc(c.reason)}` : ""}</div>
      <div class="small muted">Liq ${usd(c.liq)} · top10 ${c.top10 != null ? c.top10.toFixed(1) + "%" : "n/a"} · h1 ${pct(c.h1)} · holders ${c.holders ?? "n/a"} · graduated ${ago(c.migrated_at)}</div>` : ""}
      <canvas id="cc"></canvas><div class="row" style="margin-top:10px">${btn(p && p.status === "open" ? "Sell on FOMO" : "Buy on FOMO", link, p && p.status === "open" ? "sell" : "")}</div></div>`;
    if (p) { const g = p.status === "open" ? (p.last_price ? 100 * (p.last_price / p.entry_price - 1) : null) : p.pct;
      h += `<h2>Position (${esc(p.mode)})</h2><div class="card"><div class="row"><span>${usd(p.size_usd)} at ${price(p.entry_price)}</span><b class="${cls(g)}">${pct(g)}</b></div>
      <div class="small muted">${p.status === "open" ? `Stop ${price(p.stop_price)}${p.trail_active ? " (trailing)" : ""} · peak ${price(p.peak)}` : `Closed ${esc(p.exit_reason)} at ${price(p.exit_price)} · ${usd(p.pnl_usd)} after fees ${usd(p.fees_usd)}`}</div></div>`; }
    if (c && c.audit) h += `<h2>Audit ${c.audit.layers.filter((l) => l.ok).length}/8</h2><div class="card">${c.audit.layers.map((l) => `<div class="lrow"><span class="${l.ok ? "g" : "r"}">${l.ok ? "✓" : "✕"}</span><span>${l.n}. ${esc(l.layer)}</span><span class="v">${esc(l.value)}<div class="small muted">${esc(l.rule)}</div></span></div>`).join("")}</div>`;
    if (c && c.analysis) { const a = c.analysis;
      h += `<h2>Analyst (${esc(a.mode)})</h2><div class="card">${Object.entries(a.answers || {}).map(([k, v]) => `<div class="set"><span>${esc(k)}</span><span>${v == null ? "n/a" : Number(v).toFixed(2)}</span></div>`).join("")}
      ${a.score != null ? `<div class="set"><span>score</span><span>${a.score}</span></div>` : ""}<div class="small ${a.passed ? "g" : "r"}" style="margin-top:6px">${a.passed ? "Passed" : esc((a.failed || []).join("; "))}</div>${a.note ? `<div class="small muted">${esc(a.note)}</div>` : ""}</div>`; }
    $("#view").innerHTML = h;
    const series = (p && p.series && p.series.length ? p.series : c ? c.series : []) || [];
    chart($("#cc"), series, { h: 140, lines: p ? [{ y: p.entry_price, color: "#8b93a7" }] : [] });
  }

  function vAccount() {
    const s = D.state, st = s.settings;
    const groups = {};
    Object.keys(st).sort().forEach((k) => { const g = k.split(".")[0]; (groups[g] = groups[g] || []).push(k); });
    let h = `<div class="card"><div class="row"><span>Mode</span><b>${esc(s.mode)}</b></div><div class="row"><span>Stack</span><b>${usd(s.stack)}</b></div>
      <div class="row"><span>Ticket</span><b>${usd(s.ticket)}</b></div><div class="row"><span>Stack for ${st["executor.stack_pct"]}% without bump</span><b>${usd(s.min_stack)}</b></div>
      <div class="row"><span>FOMO</span><b>${esc(st["desk.fomo_handle"])}</b></div>
      <div class="row" style="margin-top:10px;gap:8px;justify-content:flex-start">${btn("My FOMO profile", s.links.profile, "ghost")}${btn("Invite friends", s.links.invite, "ghost")}</div></div>
      <div class="card small muted">Read-only here. Change any setting in Telegram, e.g. <b>set stop to -8%</b>, <b>pause scanner</b>, <b>paper</b> / <b>live</b>. The app refreshes every ~1-2 min (published every ${s.publish.push_min_s}s at most).</div>`;
    for (const g of Object.keys(groups)) h += `<h2>${esc(g)}</h2><div class="card">${groups[g].filter((k) => k !== "desk.rpc_url").map((k) => `<div class="set"><span>${esc(k.split(".")[1])}</span><span>${esc(typeof st[k] === "boolean" ? (st[k] ? "on" : "off") : st[k])}</span></div>`).join("")}</div>`;
    h += `<div class="card small muted">Jev usage: ${s.totals.jev_calls} calls · ${s.totals.jev_tokens_in} in / ${s.totals.jev_tokens_out} out tokens.</div>`;
    $("#view").innerHTML = h;
  }

  function render() {
    const p = params();
    if (p.c) tab = "coin"; else if (p.t) tab = p.t; else if (tab === "coin") tab = "home";
    document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
    banner();
    const m = $("#mode");
    if (lastErr === "nopath") { m.textContent = "—"; $("#view").innerHTML = `<div class="card">${empty("🔑", "Open your private desk link", "This app needs the link that ends in <b>#d=…</b>. Open it once and it is remembered on this device.")}</div>`; return; }
    if (!D.state) { m.textContent = "…"; $("#view").innerHTML = lastErr ? `<div class="card">${empty("⚠", "Desk data unavailable", "Nothing published yet at this link, or the network is down. Retrying every minute.")}</div>` : `<div class="card">${empty("…", "Loading", "")}</div>`; return; }
    m.textContent = D.state.mode; m.className = "badge" + (D.state.mode === "LIVE" ? " live" : "");
    $("#updated").textContent = "Updated " + ago(D.state.generated_at);
    ({ home: vHome, agents: vAgents, auditor: vAuditor, account: vAccount, coin: () => vCoin(p.c) }[tab] || vHome)();
  }

  document.querySelectorAll("#tabs a").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); tab = a.dataset.tab; setHash(tab === "home" ? "" : "t=" + tab); window.scrollTo(0, 0); }));
  window.addEventListener("hashchange", render);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  setInterval(load, POLL_MS);
  setInterval(() => { if (D.state) $("#updated").textContent = "Updated " + ago(D.state.generated_at); }, 15000);
  load();
})();
