"use strict";
/* Gramleagues – Website. Liest data/league.json (vom Bot geschrieben). */

const POS_NAME = { GK: "Goalkeeper", LB: "Left back", RB: "Right back", CB: "Centre back", CM: "Central midfield", LW: "Left wing", RW: "Right wing", ST: "Striker" };
const FORMATION = { GK: [0.07, 0.5], LB: [0.29, 0.12], CB1: [0.2, 0.39], CB2: [0.2, 0.61], RB: [0.29, 0.88], CM1: [0.48, 0.26], CM2: [0.43, 0.5], CM3: [0.48, 0.74], LW: [0.74, 0.16], ST: [0.81, 0.5], RW: [0.74, 0.84] };
const FARBEN = ["#00C46A", "#FF4D6D", "#00B4D8", "#F2B705", "#9B5DE5", "#FF8C42", "#3DDC97", "#F15BB5", "#4CC9F0", "#C3F73A"];
const app = document.getElementById("app");
let D = null;
let uhr = null;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const zahl = (n) => Number(n || 0).toLocaleString("en-GB");
const team = (id) => D.teams.find((t) => t.id === id);
const teamName = (id) => (team(id) || {}).name || "–";
function farbe(t) {
  let h = 0;
  for (const c of t.name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FARBEN[h % FARBEN.length];
}
const zeit = (iso) => new Date(iso);
const offen = (key) => D.saison && Date.now() >= zeit(D.saison.reveal[key]).getTime();
const datum = (iso) => zeit(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });
const lvl = (p) => `<span class="lvl l${Math.min(5, Math.max(1, Math.ceil(p / 5)))}" title="${p} points">${p}</span>`;
const igLink = (u) => `<a href="https://www.instagram.com/${encodeURIComponent(u)}/" target="_blank" rel="noopener">@${esc(u)}</a>`;

async function laden() {
  try {
    const r = await fetch("data/league.json?t=" + Date.now(), { cache: "no-store" });
    D = await r.json();
  } catch (e) {
    app.innerHTML = `<p>The league data could not be loaded. Please try again later.</p>`;
    return;
  }
  document.getElementById("demo").hidden = !D.demo;
  document.getElementById("stand").textContent = "Updated: " + datum(D.stand);
  route();
}

/* ---------- Routing ---------- */
function route() {
  if (!D) return;
  clearInterval(uhr);
  const teile = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const [seite, a, b] = teile;
  document.querySelectorAll("[data-nav]").forEach((n) => n.classList.toggle("aktiv", n.dataset.nav === (seite || "start") || (seite === "team" && n.dataset.nav === "start")));
  if (seite === "team" && team(a)) seiteTeam(team(a), b);
  else if (seite === "turnier") seiteTurnier();
  else if (seite === "suche") seiteSuche(a || "");
  else if (seite === "regeln") seiteRegeln();
  else if (seite === "archiv") seiteArchiv();
  else seiteStart();
  if (seite) window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
document.getElementById("suchform").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = document.getElementById("suchfeld").value.trim().replace(/^@/, "");
  if (q) location.hash = "#/suche/" + encodeURIComponent(q);
});

/* ---------- Status ---------- */
function statusBox() {
  const s = D.saison;
  if (D.status === "anmeldung") {
    return `<div class="status"><span class="punkt"></span><span>Sign-up is open ·</span>
      <span class="countdown" data-bis="${esc(s.anmeldeschluss)}"></span><span class="leise">left to sign up</span></div>`;
  }
  if (D.status === "turnier" && D.turnier) {
    if (offen("final") && D.turnier.meister) {
      return `<div class="status"><span class="punkt gold"></span><span>Champions of season ${s.nr}: <b>${esc(teamName(D.turnier.meister))}</b></span><a href="#/turnier">To the tournament</a></div>`;
    }
    const naechst = !offen("gruppen") ? ["Group stage", s.reveal.gruppen] : !offen("playoffs") ? ["Playoffs", s.reveal.playoffs] : ["Final", s.reveal.final];
    return `<div class="status"><span class="punkt gold"></span><span>Matchday! ${naechst[0]} in</span><span class="countdown" data-bis="${esc(naechst[1])}"></span><a href="#/turnier">To the tournament</a></div>`;
  }
  const n = D.naechste_saison;
  return `<div class="status"><span class="punkt"></span><span>The next season starts soon. Sign-up closes: ${n ? datum(n.anmeldeschluss) : "the second-to-last day of the month, 23:59"}</span></div>`;
}

function uhrStarten() {
  const tick = () => {
    document.querySelectorAll("[data-bis]").forEach((el) => {
      let ms = zeit(el.dataset.bis).getTime() - Date.now();
      if (ms <= 0) { el.textContent = "now"; return; }
      const t = Math.floor(ms / 86400000); ms %= 86400000;
      const h = Math.floor(ms / 3600000); ms %= 3600000;
      const m = Math.floor(ms / 60000); const sek = Math.floor((ms % 60000) / 1000);
      el.textContent = (t ? t + "d " : "") + [h, m, sek].map((x) => String(x).padStart(2, "0")).join(":");
    });
  };
  tick();
  uhr = setInterval(tick, 1000);
}

/* ---------- Startseite ---------- */
function teamKarte(t) {
  const f = farbe(t);
  const quote = Math.min(100, (t.fans / t.kapazitaet) * 100);
  const chips = [];
  if (t.behalten) chips.push(`<span class="marke-chip gold">Top 3 · stays</span>`);
  chips.push(t.komplett ? `<span class="marke-chip gruen">Ready</span>` : `<span class="marke-chip">Starting XI ${t.stammelf}/11</span>`);
  if (D.turnier && D.turnier.meister === t.id && offen("final")) chips.push(`<span class="marke-chip gold">Champions</span>`);
  return `<a class="karte" href="#/team/${encodeURIComponent(t.id)}" style="--team:${f}">
    <span class="leise klein">${esc(t.stadion)} · level ${t.stufe}</span>
    <h3>${esc(t.name)}</h3>
    <div class="werte">
      <div class="wert"><span>Strength</span><strong>${t.staerke}</strong></div>
      <div class="wert"><span>Fans</span><strong>${zahl(t.fans)}</strong></div>
      <div class="wert"><span>Squad</span><strong>${t.slots.reduce((n, s) => n + (s.stamm ? 1 : 0) + (s.aw ? 1 : 0), 0)}</strong></div>
    </div>
    <div class="balken" title="${t.fans} of ${t.kapazitaet} fans"><i style="width:${quote}%"></i></div>
    <div class="marken">${chips.join("")}</div>
  </a>`;
}

function seiteStart() {
  const teams = [...D.teams].sort((a, b) => b.komplett - a.komplett || b.staerke - a.staerke || b.fans - a.fans);
  const post = D.saison && D.saison.permalink ? `<a class="knopf" href="${esc(D.saison.permalink)}" target="_blank" rel="noopener">Season post</a>` : "";
  app.innerHTML = `
  <section class="hero">
    <div>
      <h1>The league in the comments</h1>
      <p>Found a team on Instagram, claim your position and collect likes. Every like makes your player stronger and fills the stadium. The tournament is on the last day of the month.</p>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center">${statusBox()} ${post}</div>
    </div>
    <img src="logo.svg" alt="Gramleagues eagle">
  </section>
  <div class="schritte">
    <div class="schritt"><b>1 · Found a team</b>Comment <code>TEAM Your Name</code> under the season post.</div>
    <div class="schritt"><b>2 · Claim a position</b>Reply to a team comment with <code>GK</code> <code>CB</code> <code>CM</code> <code>ST</code> … or <code>FAN</code>.</div>
    <div class="schritt"><b>3 · Collect likes</b>Likes on your reply = level. Likes on the team name = fans in the stadium.</div>
  </div>
  <div class="abschnitt"><h2>Teams${D.saison ? " · Season " + D.saison.nr : ""}</h2><span class="leise">${D.teams.length} teams, ${D.teams.filter((t) => t.komplett).length} ready to play</span></div>
  ${teams.length ? `<div class="raster">${teams.map(teamKarte).join("")}</div>` : `<p class="leise">No teams yet. Be the first: comment <b>TEAM Your Name</b> under the season post.</p>`}`;
  uhrStarten();
}

/* ---------- Stadion ---------- */
const STAND = [
  { boden: "#17482A", tribuene: "#24683B", leer: "#2D7A48", t: 40 },
  { boden: "#1A3A2C", tribuene: "#3A4357", leer: "#4A5470", t: 50 },
  { boden: "#1A1C44", tribuene: "#30366E", leer: "#3E4585", t: 62 },
  { boden: "#16183C", tribuene: "#353C80", leer: "#454D99", t: 74 },
  { boden: "#131433", tribuene: "#3B2F7E", leer: "#4C3F98", t: 88 },
];

function sitze(t, W, H, x0, y0, n) {
  const P = 6;
  const flaeche = (W + 2 * t) * (H + 2 * t) - W * H;
  let s = Math.sqrt(flaeche / Math.max(n, 1));
  const rects = (s) => {
    const zellen = [];
    const feld = (x, y, w, h, nahe) => {
      const cols = Math.floor(w / s), rows = Math.floor(h / s);
      const ox = x + (w - cols * s) / 2, oy = y + (h - rows * s) / 2;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const cx = ox + c * s, cy = oy + r * s;
        zellen.push({ x: cx, y: cy, reihe: nahe(r, c, rows, cols), ord: cx + cy });
      }
    };
    const innen = t - P - 4;
    feld(x0 - t + 4, y0 - t + 4, W + 2 * t - 8, innen, (r, c, rows) => rows - 1 - r);
    feld(x0 - t + 4, y0 + H + P, W + 2 * t - 8, innen, (r) => r);
    feld(x0 - t + 4, y0, innen, H, (r, c, rows, cols) => cols - 1 - c);
    feld(x0 + W + P, y0, innen, H, (r, c) => c);
    return zellen;
  };
  let z = rects(s);
  let guard = 0;
  while (z.length < n && guard++ < 200) { s *= 0.97; z = rects(s); }
  z.sort((a, b) => a.reihe - b.reihe || a.ord - b.ord);
  return { zellen: z.slice(0, n), s };
}

function stadionSVG(t, hl) {
  const f = farbe(t);
  const st = STAND[t.stufe - 1];
  const VW = 760, VH = 500, W = 380, H = 240, x0 = 190, y0 = 130, T = st.t;
  const { zellen, s } = sitze(T, W, H, x0, y0, t.kapazitaet);
  const benannt = t.fans_benannt;
  const anz = Math.min(t.fans, t.kapazitaet);
  const g = Math.max(1.6, s - Math.max(1, s * 0.22));
  let ring = "";
  let svg = `<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="${esc(t.stadion)} of ${esc(t.name)} with ${t.fans} fans and the line-up">`;
  svg += `<rect width="${VW}" height="${VH}" rx="16" fill="${st.boden}"/>`;
  if (t.stufe >= 5) svg += `<rect x="${x0 - T - 12}" y="${y0 - T - 12}" width="${W + 2 * T + 24}" height="${H + 2 * T + 24}" rx="34" fill="none" stroke="#CFD3F5" stroke-opacity=".35" stroke-width="10"/>`;
  svg += `<rect x="${x0 - T}" y="${y0 - T}" width="${W + 2 * T}" height="${H + 2 * T}" rx="${t.stufe >= 3 ? 26 : 10}" fill="${st.tribuene}"/>`;
  zellen.forEach((c, i) => {
    if (i < benannt.length) {
      const u = benannt[i];
      const treffer = hl && hl.toLowerCase() === u.toLowerCase();
      svg += `<rect class="seat named" data-fan="${esc(u)}" x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" width="${g.toFixed(1)}" height="${g.toFixed(1)}" rx="${(g / 4).toFixed(1)}" fill="${treffer ? "#F2B705" : f}"><title>@${esc(u)}</title></rect>`;
      if (treffer) ring = `<circle class="treffer" cx="${(c.x + g / 2).toFixed(1)}" cy="${(c.y + g / 2).toFixed(1)}" r="${(g / 2 + 7).toFixed(1)}" fill="none" stroke="#F2B705" stroke-width="3.5" pointer-events="none"/>`;
    } else if (i < anz) {
      svg += `<rect class="seat" x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" width="${g.toFixed(1)}" height="${g.toFixed(1)}" rx="${(g / 4).toFixed(1)}" fill="#AEB3D9" fill-opacity=".85"/>`;
    } else {
      svg += `<rect x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" width="${g.toFixed(1)}" height="${g.toFixed(1)}" rx="${(g / 4).toFixed(1)}" fill="${st.leer}"/>`;
    }
  });
  // Rasen
  for (let i = 0; i < 10; i++) svg += `<rect x="${x0 + (i * W) / 10}" y="${y0}" width="${W / 10 + 0.5}" height="${H}" fill="${i % 2 ? "#2A9150" : "#2F9E57"}"/>`;
  const L = `fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="2"`;
  svg += `<rect x="${x0 + 8}" y="${y0 + 8}" width="${W - 16}" height="${H - 16}" ${L}/>
    <line x1="${x0 + W / 2}" y1="${y0 + 8}" x2="${x0 + W / 2}" y2="${y0 + H - 8}" ${L}/>
    <circle cx="${x0 + W / 2}" cy="${y0 + H / 2}" r="34" ${L}/>
    <rect x="${x0 + 8}" y="${y0 + H / 2 - 60}" width="58" height="120" ${L}/>
    <rect x="${x0 + W - 66}" y="${y0 + H / 2 - 60}" width="58" height="120" ${L}/>
    <rect x="${x0 + 8}" y="${y0 + H / 2 - 28}" width="22" height="56" ${L}/>
    <rect x="${x0 + W - 30}" y="${y0 + H / 2 - 28}" width="22" height="56" ${L}/>
    <rect x="${x0 + 1}" y="${y0 + H / 2 - 14}" width="7" height="28" fill="#fff" fill-opacity=".9"/>
    <rect x="${x0 + W - 8}" y="${y0 + H / 2 - 14}" width="7" height="28" fill="#fff" fill-opacity=".9"/>`;
  // Flutlicht
  const ecken = [[x0 - T - 4, y0 - T - 4], [x0 + W + T + 4, y0 + H + T + 4], [x0 + W + T + 4, y0 - T - 4], [x0 - T - 4, y0 + H + T + 4]];
  const lichter = t.stufe >= 4 ? 4 : t.stufe === 3 ? 2 : 0;
  ecken.slice(0, lichter).forEach(([x, y]) => { svg += `<circle cx="${x}" cy="${y}" r="16" fill="#F2B705" fill-opacity=".18"/><circle cx="${x}" cy="${y}" r="7" fill="#F2B705"/>`; });
  // Spieler
  t.slots.forEach((sl) => {
    const [fx, fy] = FORMATION[sl.slot];
    const x = x0 + fx * W, y = y0 + fy * H;
    const m = sl.spielt === "aw" ? sl.aw : sl.stamm;
    if (!m) {
      svg += `<g><circle cx="${x}" cy="${y}" r="15" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2" stroke-dasharray="4 3"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" fill-opacity=".8">${sl.pos}</text></g>`;
      return;
    }
    const treffer = hl && [sl.stamm, sl.aw].some((p) => p && p.user.toLowerCase() === hl.toLowerCase());
    const name = m.user.length > 13 ? m.user.slice(0, 12) + "…" : m.user;
    const breite = name.length * 6.4 + 14;
    svg += `<g class="spieler${treffer ? " treffer" : ""}" data-slot="${sl.slot}" tabindex="0" role="button" aria-label="${esc(sl.pos)} @${esc(m.user)}, ${m.punkte} points">
      <circle class="koerper" cx="${x}" cy="${y}" r="15" fill="${treffer ? "#F2B705" : f}" stroke="#fff" stroke-width="2.5"/>
      <text x="${x}" y="${y + 5}" text-anchor="middle" font-size="14" font-weight="800" fill="#0D0E2B">${m.punkte}</text>
      <rect x="${x - breite / 2}" y="${y + 19}" width="${breite}" height="17" rx="8.5" fill="#0D0E2B" fill-opacity=".82"/>
      <text x="${x}" y="${y + 31}" text-anchor="middle" font-size="11" font-weight="600" fill="#fff">@${esc(name)}</text>
      ${sl.spielt === "aw" ? `<rect x="${x + 9}" y="${y - 22}" width="22" height="13" rx="4" fill="#FF4D6D"/><text x="${x + 20}" y="${y - 12}" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">AW</text>` : ""}
    </g>`;
  });
  svg += ring;
  svg += `<text x="${VW - 18}" y="${VH - 14}" text-anchor="end" font-size="12" fill="#A9ADD6">${esc(t.stadion)} · ${Math.min(t.fans, t.kapazitaet)}/${t.kapazitaet} seats taken</text>`;
  return svg + "</svg>";
}

/* ---------- Teamseite ---------- */
function seiteTeam(t, hl) {
  const f = farbe(t);
  const naechste = D.stadien[t.stufe] || null;
  const quote = Math.min(100, (t.fans / t.kapazitaet) * 100);
  const imTurnier = D.turnier && D.turnier.staerken && t.id in D.turnier.staerken;
  const zeilen = t.slots.map((sl) => {
    const zelle = (m, rolle) => m ? `<span class="${sl.spielt === rolle ? "spielt" : ""}">${lvl(m.punkte)}${igLink(m.user)}</span> <span class="leise klein">${zahl(m.likes)} likes</span>` : `<span class="leise">open</span>`;
    return `<tr><td><b>${sl.pos}</b> <span class="leise klein">${POS_NAME[sl.pos]}</span></td><td>${zelle(sl.stamm, "stamm")}</td><td>${zelle(sl.aw, "aw")}</td></tr>`;
  }).join("");
  app.innerHTML = `
  <div class="teamkopf" style="--team:${f}">
    <div><div class="linie"></div><h1>${esc(t.name)}</h1>
      <span class="leise">Founded by ${t.gruender ? igLink(t.gruender) : "–"}${t.behalten ? ` · in the league for ${t.behalten + 1} seasons` : ""}</span></div>
    <div class="marken">${t.behalten ? `<span class="marke-chip gold">Top 3 · stays</span>` : ""}${t.komplett ? `<span class="marke-chip gruen">Ready</span>` : `<span class="marke-chip pink">${11 - t.stammelf} starting spots open</span>`}${imTurnier ? `<span class="marke-chip">In the tournament</span>` : ""}</div>
  </div>
  <div class="statreihe" style="--team:${f}">
    <div class="wert"><span>Team strength</span><strong>${t.staerke}</strong> <span class="leise klein" style="display:inline">out of 275</span></div>
    <div class="wert"><span>Likes on players</span><strong>${zahl(t.likes_total)}</strong></div>
    <div class="wert"><span>Fans</span><strong>${zahl(t.fans)}</strong> <span class="leise klein" style="display:inline">${t.fans_benannt.length} named</span></div>
    <div class="wert"><span>${esc(t.stadion)} · level ${t.stufe}/5</span><strong>${zahl(Math.min(t.fans, t.kapazitaet))}/${zahl(t.kapazitaet)}</strong>
      <div class="balken"><i style="width:${quote}%"></i></div>
      <span class="leise klein" style="margin-top:4px">${naechste ? `Full = upgrade to ${esc(naechste.name)}` : "Top level reached"}</span></div>
  </div>
  <div class="stadion-box" style="--team:${f}">${stadionSVG(t, hl)}</div>
  <div class="info" id="info" aria-live="polite"><span class="leise">Tap a player or a coloured seat to see who it is.</span></div>
  <div class="legende">
    <span><i style="background:${f}"></i>Named fan (reply FAN)</span>
    <span><i style="background:#AEB3D9"></i>Fan (like)</span>
    <span><i style="background:${STAND[t.stufe - 1].leer}"></i>empty seat</span>
    <span><i style="background:#FF4D6D"></i>Sub plays (more likes)</span>
  </div>
  <div class="abschnitt"><h2>Squad</h2><span class="leise">Highlighted = plays on matchday</span></div>
  <div class="tabelle-wrap"><table><thead><tr><th>Position</th><th>Starter</th><th>Sub</th></tr></thead><tbody>${zeilen}</tbody></table></div>
  <div class="abschnitt"><h2>Named fans</h2><span class="leise">${t.fans_benannt.length} of ${zahl(t.fans)} fans</span></div>
  ${t.fans_benannt.length ? `<div class="fans-liste">${t.fans_benannt.map((u) => `<a href="#/team/${encodeURIComponent(t.id)}/${encodeURIComponent(u)}" class="${hl && hl.toLowerCase() === u.toLowerCase() ? "hl" : ""}">@${esc(u)}</a>`).join("")}</div>` : `<p class="leise">None yet. Reply <b>FAN</b> to the team comment to get a seat with your name.</p>`}
  `;
  const info = document.getElementById("info");
  const zeigeSpieler = (slot) => {
    const sl = t.slots.find((s) => s.slot === slot);
    const teil = (m, rolle) => m ? `${igLink(m.user)} <span class="leise">${rolle}</span> ${lvl(m.punkte)}<span class="leise">${zahl(m.likes)} likes</span>` : "";
    info.innerHTML = `<b>${sl.pos} · ${POS_NAME[sl.pos]}</b> ${teil(sl.stamm, "Starter")} ${sl.aw ? "· " + teil(sl.aw, "Sub") : ""} <span class="spielt">Plays: @${esc((sl.spielt === "aw" ? sl.aw : sl.stamm).user)}</span>`;
  };
  app.querySelectorAll(".spieler").forEach((el) => {
    el.addEventListener("click", () => zeigeSpieler(el.dataset.slot));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); zeigeSpieler(el.dataset.slot); } });
  });
  app.querySelectorAll(".seat.named").forEach((el) => el.addEventListener("click", () => {
    const u = el.dataset.fan;
    info.innerHTML = `<b>Fan</b> ${igLink(u)} <span class="leise">sits in the ${esc(t.stadion)} of ${esc(t.name)}</span>`;
  }));
  if (hl) {
    const sl = t.slots.find((s) => [s.stamm, s.aw].some((p) => p && p.user.toLowerCase() === hl.toLowerCase()));
    if (sl) {
      const rolle = sl.stamm && sl.stamm.user.toLowerCase() === hl.toLowerCase() ? "the starter" : "the sub";
      info.innerHTML = `<b>Found:</b> ${igLink(hl)} is ${rolle} at ${sl.pos} (${POS_NAME[sl.pos]}).`;
    } else if (t.fans_benannt.some((u) => u.toLowerCase() === hl.toLowerCase())) {
      info.innerHTML = `<b>Found:</b> ${igLink(hl)} sits as a fan in the ${esc(t.stadion)} (marked in yellow).`;
    }
    setTimeout(() => app.querySelector(".stadion-box").scrollIntoView({ block: "center" }), 50);
  }
}

/* ---------- Turnier ---------- */
function seiteTurnier() {
  const tu = D.turnier;
  if (!tu) {
    const bereit = D.teams.filter((t) => t.komplett);
    app.innerHTML = `<h1>Tournament</h1>
      <p class="leise">On the last day of the month every team with a full starting XI plays. Groups are drawn at random, the top two of each group reach the playoffs. Group stage from 14:00, playoffs from 18:00, podium at 20:00.</p>
      ${statusBox()}
      <div class="abschnitt"><h2>Ready to play</h2><span class="leise">${bereit.length} teams</span></div>
      ${bereit.length ? `<div class="raster">${bereit.map(teamKarte).join("")}</div>` : `<p class="leise">No team has 11 starters yet.</p>`}`;
    uhrStarten();
    return;
  }
  const og = offen("gruppen"), op = offen("playoffs"), of = offen("final");
  const tor = (sp, sichtbar) => sichtbar ? `${sp.tore[0]}:${sp.tore[1]}` : "–:–";
  const gruppen = tu.gruppen.map((g) => `
    <div class="gruppe"><h3>${esc(g.name)}</h3>
      <table><thead><tr><th>#</th><th>Team</th><th class="zahl">Sp</th><th class="zahl">Tore</th><th class="zahl">Pkt</th></tr></thead><tbody>
      ${(og ? g.tabelle : g.teams.map((id) => ({ team: id }))).map((r, i) => `<tr class="${og && i < 2 && (tu.gruppen.length > 1 || i < 2) ? "weiter" : ""}"><td>${og ? i + 1 : "–"}</td><td><a href="#/team/${encodeURIComponent(r.team)}">${esc(teamName(r.team))}</a> <span class="leise klein">${tu.staerken[r.team]}</span></td><td class="zahl">${og ? r.sp : 0}</td><td class="zahl">${og ? r.tore + ":" + r.gegen : "0:0"}</td><td class="zahl"><b>${og ? r.pkt : 0}</b></td></tr>`).join("")}
      </tbody></table>
      <div class="spiele">${g.spiele.map((sp) => `<div class="spiel"><span>${esc(teamName(sp.heim))}</span><span class="score">${tor(sp, og)}</span><span>${esc(teamName(sp.gast))}</span></div>`).join("")}</div>
    </div>`).join("");

  const matchBox = (sp, sichtbar) => {
    if (sp.freilos) return `<div class="match"><div class="sieger"><span>${esc(teamName(sp.heim))}</span><b>Bye</b></div></div>`;
    const zeile = (id, t) => `<div class="${sichtbar && sp.sieger === id ? "sieger" : ""}"><span>${esc(teamName(id))} <span class="leise klein">${tu.staerken[id]}</span></span><b>${sichtbar ? t : "–"}</b></div>`;
    return `<div class="match">${zeile(sp.heim, sp.tore[0])}${zeile(sp.gast, sp.tore[1])}${sichtbar && sp.penalty ? `<small>Draw – decided by more likes</small>` : ""}</div>`;
  };
  const runden = tu.playoffs.map((r) => {
    const sichtbar = r.name === "Final" ? of : op;
    return `<div class="runde"><h3>${esc(r.name)}${sichtbar ? "" : ` <span class="verdeckt">from ${r.name === "Final" ? "20:00" : "18:00"}</span>`}</h3>${r.spiele.map((sp) => matchBox(sp, sichtbar)).join("")}</div>`;
  }).join("");
  const p3 = tu.platz3 ? `<div class="runde"><h3>Third-place match${of ? "" : ` <span class="verdeckt">from 20:00</span>`}</h3>${matchBox(tu.platz3, of)}</div>` : "";

  const meister = of && tu.meister ? `<div class="meister"><div class="pokal"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg></div>
    <div><span class="leise">Champions of season ${D.saison.nr}</span><h2 style="margin:2px 0 6px"><a href="#/team/${encodeURIComponent(tu.meister)}" style="color:var(--text)">${esc(teamName(tu.meister))}</a></h2>
    <div class="podest">${tu.top3.map((id, i) => `<span>${i + 1}. ${esc(teamName(id))}</span>`).join("")}<span>· The top 3 stay together for next season.</span></div></div></div>` : "";

  app.innerHTML = `<h1>Tournament · Season ${D.saison.nr}</h1>
    ${meister || `<div style="margin-bottom:18px">${statusBox()}</div>`}
    <div class="abschnitt"><h2>Group stage</h2><span class="leise">${og ? "Number next to the team = team strength" : "Results from 14:00"}</span></div>
    <div class="gruppen">${gruppen}</div>
    ${tu.playoffs.length ? `<div class="abschnitt"><h2>Playoffs</h2><span class="leise">A draw goes to the team with more likes</span></div><div class="klammer">${runden}${p3}</div>` : ""}`;
  uhrStarten();
}

/* ---------- Suche ---------- */
function seiteSuche(q) {
  document.getElementById("suchfeld").value = q;
  const ql = q.toLowerCase();
  const treffer = [];
  D.teams.forEach((t) => {
    t.slots.forEach((sl) => [["stamm", "Starter"], ["aw", "Sub"]].forEach(([k, rolle]) => {
      const m = sl[k];
      if (m && m.user.toLowerCase().includes(ql)) treffer.push({ t, u: m.user, text: `${rolle} · ${sl.pos} · ${m.punkte} points · ${zahl(m.likes)} likes`, exakt: m.user.toLowerCase() === ql });
    }));
    t.fans_benannt.forEach((u) => { if (u.toLowerCase().includes(ql)) treffer.push({ t, u, text: `Fan in the ${t.stadion}`, exakt: u.toLowerCase() === ql }); });
  });
  treffer.sort((a, b) => b.exakt - a.exakt || a.u.localeCompare(b.u));
  app.innerHTML = `<h1>Search</h1><p class="leise">${treffer.length} results for “@${esc(q)}”</p>
    ${treffer.length ? `<div class="treffer-liste">${treffer.slice(0, 100).map((x) => `<a href="#/team/${encodeURIComponent(x.t.id)}/${encodeURIComponent(x.u)}" style="--team:${farbe(x.t)}"><span><b>@${esc(x.u)}</b> · ${esc(x.t.name)}</span><span class="leise">${esc(x.text)}</span></a>`).join("")}</div>`
      : `<p>Nobody found. Players and named fans appear once the bot has processed their reply (about every 15 minutes). Likes alone are anonymous.</p>`}`;
}

/* ---------- Regeln & Archiv ---------- */
function seiteRegeln() {
  const st = D.stadien.map((s) => `<li><b>${esc(s.name)}</b> full at ${zahl(s.voll)} fans</li>`).join("");
  app.innerHTML = `<h1>Rules</h1><p class="leise">Short version. A season lasts one month: sign-up from the 1st until the second-to-last day 23:59, tournament on the last day, podium at 20:00.</p>
  <div class="regeln">
    <div class="karte"><h3>Found a team</h3><ul><li>Comment under the season post: <b>TEAM Name</b></li><li>Name 3–20 characters, must be free</li><li>Likes on the team comment = fans</li></ul></div>
    <div class="karte"><h3>Join</h3><ul><li>Reply to the team comment: <b>GK, LB, RB, CB, CM, LW, RW, ST</b></li><li>Starting spot free? You are a starter. Otherwise the sub for that position.</li><li>One team per season. Ready to play with 11 starters.</li></ul></div>
    <div class="karte"><h3>Levels</h3><ul><li>Likes on your reply = level 0–20 (level 20 at 500 likes)</li><li>+1 point per stadium level (max +5)</li><li>Max 25 points per player</li></ul></div>
    <div class="karte"><h3>Substitutions</h3><ul><li>If the sub has more likes than the starter, the sub plays</li><li>On a tie the starter plays</li><li>If a starter deletes their reply, the sub moves up</li></ul></div>
    <div class="karte"><h3>Fans & stadium</h3><ul><li>Like on the team name = fan, reply <b>FAN</b> = named fan</li>${st}<li>Each stadium level gives every player +1 point</li></ul></div>
    <div class="karte"><h3>Matchday</h3><ul><li>Team strength = sum of the 11 players' points (max 275)</li><li>Random groups, top 2 reach the playoffs</li><li>Knockout draw: more likes wins</li><li>The top 3 stay together for another season</li></ul></div>
  </div>`;
}

function seiteArchiv() {
  const a = [...(D.archiv || [])].reverse();
  app.innerHTML = `<h1>Archive</h1>${a.length ? `<div class="tabelle-wrap"><table><thead><tr><th>Season</th><th>End</th><th>Champions</th><th>2nd</th><th>3rd</th><th class="zahl">Teams</th></tr></thead><tbody>
    ${a.map((s) => `<tr><td>${s.nr}</td><td>${datum(s.ende)}</td><td><b>${esc(s.meister || "–")}</b></td><td>${esc(s.top3[1] || "–")}</td><td>${esc(s.top3[2] || "–")}</td><td class="zahl">${s.teams}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="leise">No finished season yet.</p>`}`;
}

laden();
setInterval(() => { if (document.visibilityState === "visible") fetch("data/league.json?t=" + Date.now(), { cache: "no-store" }).then((r) => r.json()).then((d) => { if (d.stand !== D.stand) { D = d; document.getElementById("stand").textContent = "Updated: " + datum(D.stand); } }).catch(() => {}); }, 120000);
