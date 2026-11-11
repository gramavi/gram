/* Gramleagues – panel content for the 3D world (tournament, squad, rules, archive, team list). */
export const POS_NAME = { GK: "Goalkeeper", LB: "Left back", RB: "Right back", CB: "Centre back", CM: "Central midfield", LW: "Left wing", RW: "Right wing", ST: "Striker" };
const FARBEN = ["#00C46A", "#FF4D6D", "#00B4D8", "#F2B705", "#9B5DE5", "#FF8C42", "#3DDC97", "#F15BB5", "#4CC9F0", "#C3F73A"];

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const zahl = (n) => Number(n || 0).toLocaleString("en-GB");
export function farbe(t) {
  let h = 0;
  for (const c of t.name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FARBEN[h % FARBEN.length];
}
export const datum = (iso) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });
export const ig = (u) => `<a href="https://www.instagram.com/${encodeURIComponent(u)}/" target="_blank" rel="noopener">@${esc(u)}</a>`;
const lvl = (p) => `<span class="lvl l${Math.min(5, Math.max(1, Math.ceil(p / 5)))}" title="${p} strength points">${p}</span>`;

export function offen(D, key) {
  return D.saison && Date.now() >= new Date(D.saison.reveal[key]).getTime();
}
const teamName = (D, id) => (D.teams.find((t) => t.id === id) || {}).name || "–";

/* Status line with countdown (data-bis is filled by tick) */
export function statusHTML(D) {
  const s = D.saison;
  if (D.status === "anmeldung") return `<span class="pkt"></span>Sign-up is open · <b class="cd" data-bis="${esc(s.anmeldeschluss)}"></b> left`;
  if (D.status === "turnier" && D.turnier) {
    if (offen(D, "final") && D.turnier.meister) return `<span class="pkt gold"></span>Champions of the month: <b>${esc(teamName(D, D.turnier.meister))}</b>`;
    const n = !offen(D, "gruppen") ? ["Group stage", s.reveal.gruppen] : !offen(D, "playoffs") ? ["Playoffs", s.reveal.playoffs] : ["Final", s.reveal.final];
    return `<span class="pkt gold"></span>Matchday · ${n[0]} in <b class="cd" data-bis="${esc(n[1])}"></b>`;
  }
  const n = D.naechste_saison;
  return `<span class="pkt"></span>The next season starts soon${n ? " · sign-up closes " + datum(n.anmeldeschluss) : ""}`;
}

export function tick() {
  document.querySelectorAll("[data-bis]").forEach((el) => {
    let ms = new Date(el.dataset.bis).getTime() - Date.now();
    if (ms <= 0) { el.textContent = "now"; return; }
    const t = Math.floor(ms / 86400000); ms %= 86400000;
    const h = Math.floor(ms / 3600000); ms %= 3600000;
    const m = Math.floor(ms / 60000); const sek = Math.floor((ms % 60000) / 1000);
    el.textContent = (t ? t + "d " : "") + [h, m, sek].map((x) => String(x).padStart(2, "0")).join(":");
  });
}

export function teamListeHTML(D) {
  const teams = [...D.teams].sort((a, b) => b.komplett - a.komplett || b.staerke - a.staerke || b.fans - a.fans);
  if (!teams.length) return `<h2>Teams</h2><p class="leise">No teams yet. Comment <b>TEAM Your Name</b> under the season post.</p>`;
  return `<h2>Teams${D.saison ? " · Season " + D.saison.nr : ""}</h2>
  <p class="leise">${teams.length} teams, ${teams.filter((t) => t.komplett).length} ready to play. Tap a team to fly into its stadium.</p>
  <div class="liste">${teams.map((t) => `<button class="zeile" data-team="${esc(t.id)}" style="--team:${farbe(t)}">
    <span class="farbe"></span><span class="name"><b>${esc(t.name)}</b><small>${esc(t.stadion)} · ${zahl(t.fans)} fans${t.behalten ? " · Top 3" : ""}</small></span>
    <span class="werte"><b>${t.staerke}</b><small>${t.komplett ? "ready" : t.stammelf + "/11"}</small></span></button>`).join("")}</div>`;
}

export function kaderHTML(D, t) {
  const zeilen = t.slots.map((sl) => {
    const z = (m, rolle) => m ? `<span class="${sl.spielt === rolle ? "spielt" : ""}">${lvl(m.punkte)}${ig(m.user)}</span> <small class="leise">${zahl(m.likes)} likes · lvl ${m.level}</small>` : `<span class="leise">open</span>`;
    return `<tr><td><b>${sl.pos}</b></td><td>${z(sl.stamm, "stamm")}</td><td>${z(sl.aw, "aw")}</td></tr>`;
  }).join("");
  const naechste = D.stadien[t.stufe];
  return `<h2 style="--team:${farbe(t)}"><span class="balkenfarbe"></span>${esc(t.name)}</h2>
  <p class="leise">Founded by ${t.gruender ? ig(t.gruender) : "–"}${t.behalten ? ` · Top 3, in the league for ${t.behalten + 1} seasons` : ""}</p>
  <div class="kacheln">
    <div><small>Team strength</small><b>${t.staerke}</b><small>out of 275 · stadium +${t.bonus ?? 0}/player</small></div>
    <div><small>Starting XI</small><b>${t.stammelf}/11</b><small>${t.komplett ? "ready to play" : "not complete yet"}</small></div>
    <div><small>${esc(t.stadion)}</small><b>${zahl(Math.min(t.fans, t.kapazitaet))}/${zahl(t.kapazitaet)}</b><small>${naechste ? "full = " + esc(naechste.name) : "top level"}</small></div>
  </div>
  <h3>Squad <small class="leise">points = level from likes + ${t.bonus ?? 0} stadium bonus · highlighted = plays on matchday</small></h3>
  <div class="tab"><table><thead><tr><th>Pos</th><th>Starter</th><th>Sub</th></tr></thead><tbody>${zeilen}</tbody></table></div>
  <h3>Named fans <small class="leise">${t.fans_benannt.length} of ${zahl(t.fans)}</small></h3>
  ${t.fans_benannt.length ? `<div class="chips">${t.fans_benannt.map((u) => `<button class="chip" data-finde="${esc(u)}">@${esc(u)}</button>`).join("")}</div>` : `<p class="leise">None yet. Reply <b>FAN</b> to the team comment.</p>`}`;
}

export function turnierHTML(D) {
  const tu = D.turnier;
  if (!tu) {
    const bereit = D.teams.filter((t) => t.komplett);
    return `<h2>Tournament</h2><p class="leise">The tournament is on the last day of the month. Every team with a full starting XI plays. Groups are drawn at random, the top two of each group reach the playoffs. Group stage from 14:00, playoffs from 18:00, podium at 20:00 (Zurich time).</p>
    <p><b>${bereit.length}</b> teams are ready to play${bereit.length ? ": " + bereit.map((t) => esc(t.name)).join(", ") : "."}</p>`;
  }
  const og = offen(D, "gruppen"), op = offen(D, "playoffs"), of = offen(D, "final");
  const n = (id) => esc(teamName(D, id));
  let html = `<h2>Tournament · Season ${D.saison.nr}</h2>`;
  if (of && tu.meister) html += `<div class="meister"><small>Champions of the month</small><b>${n(tu.meister)}</b><span>${tu.top3.map((id, i) => `${i + 1}. ${n(id)}`).join(" · ")}</span><small>The top 3 stay together for next season.</small></div>`;
  html += `<h3>Group stage ${og ? "" : '<small class="leise">results from 14:00</small>'}</h3>`;
  html += tu.gruppen.map((g) => `<div class="gruppe"><b>${esc(g.name)}</b>
    <div class="tab"><table><thead><tr><th>#</th><th>Team</th><th class="r">Goals</th><th class="r">Pts</th></tr></thead><tbody>
    ${(og ? g.tabelle : g.teams.map((id) => ({ team: id }))).map((r, i) => `<tr class="${og && i < 2 ? "weiter" : ""}"><td>${og ? i + 1 : "–"}</td><td>${n(r.team)} <small class="leise">${tu.staerken[r.team]}</small></td><td class="r">${og ? r.tore + ":" + r.gegen : "–"}</td><td class="r"><b>${og ? r.pkt : "–"}</b></td></tr>`).join("")}
    </tbody></table></div>
    ${g.spiele.map((sp) => `<div class="spiel"><span>${n(sp.heim)}</span><b>${og ? sp.tore.join(":") : "–:–"}</b><span>${n(sp.gast)}</span></div>`).join("")}</div>`).join("");
  const box = (sp, sicht) => sp.freilos ? `<div class="match"><div class="sieger"><span>${n(sp.heim)}</span><b>Bye</b></div></div>`
    : `<div class="match">${[[sp.heim, sp.tore[0]], [sp.gast, sp.tore[1]]].map(([id, g]) => `<div class="${sicht && sp.sieger === id ? "sieger" : ""}"><span>${n(id)} <small class="leise">${tu.staerken[id]}</small></span><b>${sicht ? g : "–"}</b></div>`).join("")}${sicht && sp.penalty ? "<small>Draw – decided by more likes</small>" : ""}</div>`;
  if (tu.playoffs.length) {
    html += `<h3>Playoffs</h3>`;
    html += tu.playoffs.map((r) => {
      const sicht = r.name === "Final" ? of : op;
      return `<div class="runde"><b>${esc(r.name)}</b> ${sicht ? "" : `<small class="leise">from ${r.name === "Final" ? "20:00" : "18:00"}</small>`}${r.spiele.map((sp) => box(sp, sicht)).join("")}</div>`;
    }).join("");
    if (tu.platz3) html += `<div class="runde"><b>Third-place match</b> ${of ? "" : '<small class="leise">from 20:00</small>'}${box(tu.platz3, of)}</div>`;
  }
  return html;
}

export function regelnHTML(D) {
  return `<h2>Rules</h2><p class="leise">A season lasts one month: sign-up from the 1st at 00:00 until the second-to-last day at 23:59. The tournament is on the last day of the month, the podium is announced at 20:00 (Zurich time).</p>
  <h3>Found a team</h3><ul><li>Comment under the season post: <b>TEAM Name</b> (3–20 characters)</li><li>Likes on the team comment = fans in the stadium</li></ul>
  <h3>Join</h3><ul><li>Reply to the team comment: <b>GK, LB, RB, CB, CM, LW, RW, ST</b></li><li>Starting spot free = starter, otherwise you become the sub for that position</li><li>One team per season; ready to play with 11 starters</li><li>Reply <b>FAN</b> = named fan with your own seat</li></ul>
  <h3>Levels & points</h3><ul><li>Likes on your reply give a level from 0 to 20 (level 20 at 500 likes)</li><li>Level from: ${D.level.slice(1).map((l) => `${l.level} = ${l.ab}`).join(", ")} likes</li><li>Stadium bonus: +1 point per stadium level (Backyard Pitch +1 … Mega Arena +5)</li><li>Strength points = level + stadium bonus, max 25 per player</li><li>If the sub has more likes than the starter, the sub plays</li></ul>
  <h3>Stadium</h3><ul>${D.stadien.map((s) => `<li>${esc(s.name)}: full at ${zahl(s.voll)} fans</li>`).join("")}<li>Each stadium level gives every player +1 strength point</li></ul>
  <h3>Matchday (last day of the month)</h3><ul><li>Team strength = sum of the 11 players\' points (max 275)</li><li>Random groups, top 2 reach the playoffs; a knockout draw goes to the team with more likes</li><li>The top 3 stay together for another season, the champions get a shoutout</li></ul>`;
}

export function archivHTML(D) {
  const a = [...(D.archiv || [])].reverse();
  if (!a.length) return `<h2>Archive</h2><p class="leise">No finished season yet.</p>`;
  return `<h2>Archive</h2><div class="tab"><table><thead><tr><th>Season</th><th>Champions</th><th>2nd</th><th>3rd</th></tr></thead><tbody>
  ${a.map((s) => `<tr><td>${s.nr}</td><td><b>${esc(s.meister || "–")}</b></td><td>${esc(s.top3[1] || "–")}</td><td>${esc(s.top3[2] || "–")}</td></tr>`).join("")}</tbody></table></div>`;
}
