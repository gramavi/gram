/* Gramleagues – 3D stadium world.
   Every team has a stadium that grows with its fans. Players stand on the pitch,
   named fans sit front and centre. Data: data/league.json (written by the bot). */
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import * as UI from "./ui.js";

const FX = 30, FZ = 19;               // halbe Feldlänge/-breite
const SITZ = 0.9;                      // Sitzabstand
const ZELLE_X = 230, ZELLE_Z = 200;    // Quartiergrösse (inkl. Strasse)
const STRASSE = 18;                    // Strassenbreite
const SOCKEL = 0.35;                   // Trottoir-/Blockhöhe
const STUFE_H = 0.55, STUFEN_N = 3;    // Podest-Stufen
const PODEST = SOCKEL + STUFE_H * STUFEN_N;
const HAUT = ["#F1C27D", "#E0AC69", "#C68642", "#8D5524", "#FFDBAC", "#D9A066"];
const NEUTRAL = ["#EEF0F7", "#D4D8EC", "#B6BCDB", "#8E95BE", "#5E668F", "#2B2F55"];
const FORMATION = { GK: [-0.88, 0], LB: [-0.48, -0.74], CB1: [-0.6, -0.27], CB2: [-0.6, 0.27], RB: [-0.48, 0.74], CM1: [-0.08, -0.48], CM2: [-0.18, 0], CM3: [-0.08, 0.48], LW: [0.45, -0.66], ST: [0.6, 0], RW: [0.45, 0.66] };
const STUFEN = {
  1: { seiten: 4, rise: 0, base: 0, gap: 2.4, tiefe: 1.0, extra: 0, art: "wiese" },
  2: { seiten: 2, rise: 0.45, base: 0.35, gap: 2.8, tiefe: 1.0, extra: 1, art: "holz" },
  3: { seiten: 4, rise: 0.62, base: 0.7, gap: 3.0, tiefe: 1.1, extra: 2, art: "beton" },
  4: { seiten: 4, rise: 0.75, base: 0.9, gap: 3.0, tiefe: 1.1, extra: 3, art: "beton", licht: true },
  5: { seiten: 4, rise: 0.9, base: 1.1, gap: 3.0, tiefe: 1.15, extra: 4, art: "beton", licht: true, dach: true },
};

let D = null;
const $ = (id) => document.getElementById(id);
const zustand = { modus: "welt", team: null, ziel: null };
const stadien = new Map();   // team.id -> { gruppe, mitte, fans, spieler, ... }
const klickbar = [];

/* ---------- Grundgerüst ---------- */
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", logarithmicDepthBuffer: true }); }
catch (e) { location.replace("liste.html"); throw e; }
const GROSS = Math.min(innerWidth, innerHeight) > 600;   // Schatten nur auf grösseren Bildschirmen
renderer.setPixelRatio(Math.min(window.devicePixelRatio, GROSS ? 2 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = GROSS;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const HORIZONT = "#D3E4EF";
const ASPHALT = "#45484E";
function himmelTextur() {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 512;
  const g = c.getContext("2d");
  const v = g.createLinearGradient(0, 0, 0, 512);
  v.addColorStop(0, "#4F8FD0"); v.addColorStop(0.55, "#9CC6E6"); v.addColorStop(1, HORIZONT);
  g.fillStyle = v; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const szene = new THREE.Scene();
szene.background = himmelTextur();
szene.fog = new THREE.Fog(HORIZONT, 380, 1300);
const kamera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 9000);
kamera.position.set(0, 220, 320);
const steuerung = new OrbitControls(kamera, renderer.domElement);
steuerung.enableDamping = true;
steuerung.dampingFactor = 0.08;
steuerung.maxPolarAngle = 1.42;
steuerung.minDistance = 6;
steuerung.maxDistance = 1700;
steuerung.screenSpacePanning = false;

szene.add(new THREE.HemisphereLight("#EAF2FF", "#6E7562", 1.15));
const sonne = new THREE.DirectionalLight("#FFF1DA", 2.4);
sonne.position.set(-320, 420, 240);
sonne.castShadow = GROSS;
sonne.shadow.mapSize.set(4096, 4096);
sonne.shadow.bias = -0.0004;
sonne.shadow.normalBias = 0.6;
szene.add(sonne, sonne.target);

const boden = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshStandardMaterial({ color: "#8E9C80", roughness: 1 }));
boden.rotation.x = -Math.PI / 2;
boden.position.y = -0.05;
boden.receiveShadow = true;
szene.add(boden);

/* ---------- Hilfen ---------- */
const mat = (() => {
  const cache = new Map();
  return (farbe, extra = {}) => {
    const key = farbe + JSON.stringify(extra);
    if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.85, metalness: 0, ...extra }));
    return cache.get(key);
  };
})();
function box(w, h, d, farbe, x = 0, y = 0, z = 0, extra) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(farbe, extra));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function zufall(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const dunkler = (hex, f) => "#" + new THREE.Color(hex).multiplyScalar(f).getHexString();

function schildTextur(zeilen, farbe) {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(12,12,14,.62)";
  g.beginPath(); g.roundRect(8, 8, 1008, 240, 18); g.fill();
  const glanz = g.createLinearGradient(0, 8, 0, 130);
  glanz.addColorStop(0, "rgba(255,255,255,.22)"); glanz.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glanz; g.beginPath(); g.roundRect(8, 8, 1008, 122, [18, 18, 0, 0]); g.fill();
  g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 4;
  g.beginPath(); g.roundRect(10, 10, 1004, 236, 16); g.stroke();
  g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
  let groesse = 104;
  g.font = `800 ${groesse}px Inter, system-ui, sans-serif`;
  while (g.measureText(zeilen[0]).width > 940 && groesse > 40) { groesse -= 6; g.font = `800 ${groesse}px Inter, system-ui, sans-serif`; }
  g.fillText(zeilen[0], 512, 92);
  g.font = "600 44px Inter, system-ui, sans-serif"; g.fillStyle = "#D8D8DC";
  g.fillText(zeilen[1], 512, 172);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function rasenTextur() {
  const c = document.createElement("canvas");
  c.width = 1280; c.height = 840;
  const g = c.getContext("2d");
  const sx = c.width / (2 * FX + 6), sz = c.height / (2 * FZ + 6);
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? "#2E9A52" : "#35A85B"; g.fillRect((i * c.width) / 16, 0, c.width / 16 + 1, c.height); }
  const X = (x) => (x + FX + 3) * sx, Z = (z) => (z + FZ + 3) * sz;
  g.strokeStyle = "rgba(255,255,255,.92)"; g.lineWidth = 6;
  g.strokeRect(X(-FX), Z(-FZ), 2 * FX * sx, 2 * FZ * sz);
  g.beginPath(); g.moveTo(X(0), Z(-FZ)); g.lineTo(X(0), Z(FZ)); g.stroke();
  g.beginPath(); g.ellipse(X(0), Z(0), 5.5 * sx, 5.5 * sz, 0, 0, Math.PI * 2); g.stroke();
  for (const s of [-1, 1]) {
    g.strokeRect(s < 0 ? X(-FX) : X(FX - 10), Z(-12), 10 * sx, 24 * sz);
    g.strokeRect(s < 0 ? X(-FX) : X(FX - 3.5), Z(-6), 3.5 * sx, 12 * sz);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const RASEN = rasenTextur();

/* ---------- Sitzplätze ---------- */
function sitzplaetze(stufe, kap) {
  const cfg = STUFEN[stufe];
  const seiten = cfg.seiten === 4 ? ["N", "S", "W", "O"] : ["N", "S"];
  const alle = [];
  let reihe = 0;
  while (alle.length < kap && reihe < 40) {
    const dist = cfg.gap + reihe * cfg.tiefe + cfg.tiefe / 2;
    const y = cfg.base + reihe * cfg.rise;
    for (const s of seiten) {
      const len = s === "N" || s === "S" ? 2 * (FX + cfg.gap - 0.6) : 2 * (FZ - 0.6);
      const n = Math.floor(len / SITZ);
      for (let i = 0; i < n; i++) {
        const o = (i - (n - 1) / 2) * SITZ;
        const p = s === "N" ? [o, y, -(FZ + dist)] : s === "S" ? [o, y, FZ + dist] : s === "W" ? [-(FX + dist), y, o] : [FX + dist, y, o];
        alle.push({ x: p[0], y: p[1], z: p[2], seite: s, reihe, o: Math.abs(o) });
      }
    }
    reihe++;
  }
  alle.sort((a, b) => a.reihe - b.reihe || a.o - b.o);
  return { plaetze: alle.slice(0, kap), reihen: reihe };
}

/* ---------- Stadion bauen ---------- */
function baueStadion(team, mitte) {
  const g = new THREE.Group();
  g.position.copy(mitte);
  const farbe = UI.farbe(team);
  const cfg = STUFEN[team.stufe];
  const { plaetze, reihen } = sitzplaetze(team.stufe, team.kapazitaet);
  const R = reihen + cfg.extra;
  const aussenX = FX + cfg.gap + R * cfg.tiefe, aussenZ = FZ + cfg.gap + R * cfg.tiefe;

  // Podest mit Stufen (in Weltkoordinaten) und Vorplatz
  const px = aussenX + 9, pz = aussenZ + 9;
  for (let k = 0; k < STUFEN_N; k++) {
    const ext = (STUFEN_N - 1 - k) * 1.7;
    const h = (k + 1) * STUFE_H;
    szene.add(box(2 * (px + ext), h, 2 * (pz + ext), k % 2 ? "#D8D3C6" : "#CDC7B8", mitte.x, SOCKEL + h / 2, mitte.z));
  }
  const platz = new THREE.Mesh(new THREE.PlaneGeometry(2 * px, 2 * pz), mat(team.stufe >= 3 ? "#E2DED3" : team.stufe === 2 ? "#CDBB94" : "#86BA6C"));
  platz.rotation.x = -Math.PI / 2; platz.position.y = 0.03; platz.receiveShadow = true; g.add(platz);
  const rasen = new THREE.Mesh(new THREE.PlaneGeometry(2 * FX + 6, 2 * FZ + 6), new THREE.MeshStandardMaterial({ map: RASEN, roughness: 0.95 }));
  rasen.rotation.x = -Math.PI / 2; rasen.position.y = 0.1; rasen.receiveShadow = true; g.add(rasen);

  // Tore
  for (const s of [-1, 1]) {
    const x = s * (FX + 0.6);
    g.add(box(0.18, 2.4, 0.18, "#FFFFFF", x, 1.2, -3.66), box(0.18, 2.4, 0.18, "#FFFFFF", x, 1.2, 3.66), box(0.18, 0.18, 7.5, "#FFFFFF", x, 2.4, 0));
    g.add(box(1.2, 2.3, 7.3, "#FFFFFF", x + s * 0.7, 1.15, 0, { transparent: true, opacity: 0.25 }));
  }

  // Tribünen
  const seiten = cfg.seiten === 4 ? ["N", "S", "W", "O"] : ["N", "S"];
  const tribFarbe = cfg.art === "holz" ? "#9B6B3B" : "#A9AEC2";
  if (cfg.art === "wiese") {
    for (const s of [-1, 1]) {
      g.add(box(2 * FX + 6, 0.5, 0.08, "#E8E2D0", 0, 0.25, s * (FZ + 1.6)));
      g.add(box(0.08, 0.5, 2 * FZ + 3.2, "#E8E2D0", s * (FX + 1.6), 0.25, 0));
    }
  } else {
    for (const s of seiten) {
      const lang = s === "N" || s === "S";
      const len = lang ? 2 * (FX + cfg.gap) : 2 * FZ;
      for (let r = 0; r < R; r++) {
        const h = cfg.base + r * cfg.rise;
        const dist = cfg.gap + r * cfg.tiefe + cfg.tiefe / 2;
        const farbeR = r % 2 ? tribFarbe : dunkler(tribFarbe, 0.92);
        const m = lang ? box(len, h, cfg.tiefe, farbeR, 0, h / 2, (s === "N" ? -1 : 1) * (FZ + dist)) : box(cfg.tiefe, h, len, farbeR, (s === "W" ? -1 : 1) * (FX + dist), h / 2, 0);
        g.add(m);
      }
      if (cfg.art === "beton") {
        const top = cfg.base + R * cfg.rise + 1.6;
        const dist = cfg.gap + R * cfg.tiefe + 0.3;
        const wand = lang ? box(len + (cfg.seiten === 4 ? 0 : 0), top, 0.6, "#7C8299", 0, top / 2, (s === "N" ? -1 : 1) * (FZ + dist)) : box(0.6, top, len, "#7C8299", (s === "W" ? -1 : 1) * (FX + dist), top / 2, 0);
        g.add(wand);
        const band = lang ? box(len, 0.7, 0.66, farbe, 0, top - 0.6, (s === "N" ? -1 : 1) * (FZ + dist)) : box(0.66, 0.7, len, farbe, (s === "W" ? -1 : 1) * (FX + dist), top - 0.6, 0);
        g.add(band);
      }
    }
    if (cfg.art === "beton") {
      // Ecken schliessen
      const top = cfg.base + R * cfg.rise;
      const tiefe = R * cfg.tiefe + cfg.gap;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        g.add(box(tiefe, top, tiefe, "#8D92A8", sx * (FX + tiefe / 2), top / 2, sz * (FZ + tiefe / 2)));
      }
    }
  }

  // Sitze
  if (team.stufe >= 2) {
    const sitzFarbe = team.stufe >= 4 ? dunkler(farbe, 0.75) : team.stufe === 3 ? "#4F5A86" : "#6B4A2A";
    const sitze = new THREE.InstancedMesh(new THREE.BoxGeometry(0.72, 0.14, 0.6), mat(sitzFarbe), plaetze.length);
    const dummy = new THREE.Object3D();
    plaetze.forEach((p, i) => {
      dummy.position.set(p.x, p.y + 0.07, p.z);
      dummy.rotation.set(0, p.seite === "W" || p.seite === "O" ? Math.PI / 2 : 0, 0);
      dummy.updateMatrix();
      sitze.setMatrixAt(i, dummy.matrix);
    });
    sitze.instanceMatrix.needsUpdate = true;
    g.add(sitze);
  }

  // Fans
  const anzahl = Math.min(team.fans, plaetze.length);
  const benannt = team.fans_benannt.length;
  const zuf = zufall(hash(team.id));
  const koerper = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.27, 0.78, 8), mat("#FFFFFF"), Math.max(anzahl, 1));
  const koepfe = new THREE.InstancedMesh(new THREE.SphereGeometry(0.19, 10, 8), mat("#FFFFFF"), Math.max(anzahl, 1));
  const dummy = new THREE.Object3D();
  const fanPos = [];
  const teamC = new THREE.Color(farbe);
  for (let i = 0; i < anzahl; i++) {
    const p = plaetze[i];
    const sitzt = team.stufe >= 2;
    const y = p.y + (sitzt ? 0.14 : 0);
    dummy.position.set(p.x + (sitzt ? 0 : (zuf() - 0.5) * 0.3), y + 0.39, p.z + (sitzt ? 0 : (zuf() - 0.5) * 0.3));
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    koerper.setMatrixAt(i, dummy.matrix);
    let c;
    if (i < benannt) c = teamC;
    else c = zuf() < 0.45 ? teamC.clone().lerp(new THREE.Color("#FFFFFF"), 0.35 + zuf() * 0.3) : new THREE.Color(NEUTRAL[Math.floor(zuf() * NEUTRAL.length)]);
    koerper.setColorAt(i, c);
    dummy.position.y = y + 0.95;
    dummy.updateMatrix();
    koepfe.setMatrixAt(i, dummy.matrix);
    koepfe.setColorAt(i, new THREE.Color(HAUT[Math.floor(zuf() * HAUT.length)]));
    fanPos.push(new THREE.Vector3(p.x, y + 1.25, p.z));
  }
  koerper.count = anzahl; koepfe.count = anzahl;
  [koerper, koepfe].forEach((m) => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); });
  koerper.userData = { typ: "fan", team }; koepfe.userData = { typ: "fan", team };
  g.add(koerper, koepfe);
  klickbar.push(koerper, koepfe);

  // Flutlicht
  if (cfg.licht) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (aussenX + 3), z = sz * (aussenZ + 3);
      const hoehe = 14 + team.stufe * 3;
      g.add(box(0.7, hoehe, 0.7, "#5C6278", x, hoehe / 2, z));
      const kopf = box(4, 2.4, 0.6, "#FFF6C8", x - sx * 0.3, hoehe + 0.6, z - sz * 0.3, { emissive: "#FFE9A0", emissiveIntensity: 0.9 });
      kopf.lookAt(g.position.clone().setY(hoehe));
      g.add(kopf);
    }
  }
  // Dach
  if (cfg.dach) {
    const top = cfg.base + R * cfg.rise + 5;
    const tiefe = R * cfg.tiefe * 0.75;
    const dachMat = { transparent: true, opacity: 0.88 };
    for (const s of seiten) {
      const lang = s === "N" || s === "S";
      const dist = cfg.gap + R * cfg.tiefe - tiefe / 2 + 0.3;
      g.add(lang ? box(2 * aussenX, 0.35, tiefe, "#E9ECF6", 0, top, (s === "N" ? -1 : 1) * (FZ + dist), dachMat) : box(tiefe, 0.35, 2 * FZ, "#E9ECF6", (s === "W" ? -1 : 1) * (FX + dist), top, 0, dachMat));
      for (let k = -2; k <= 2; k++) {
        const pos = lang ? [k * aussenX * 0.45, (s === "N" ? -1 : 1) * (aussenZ + 0.2)] : [(s === "W" ? -1 : 1) * (aussenX + 0.2), k * FZ * 0.45];
        g.add(box(0.35, top, 0.35, "#C6CADB", pos[0], top / 2, pos[1]));
      }
    }
  }

  // Spieler
  const spieler = [];
  team.slots.forEach((sl) => {
    const m = sl.spielt === "aw" ? sl.aw : sl.stamm;
    const [fx, fz] = FORMATION[sl.slot];
    const pos = new THREE.Vector3(fx * FX, 0, fz * FZ);
    const fig = new THREE.Group();
    fig.position.copy(pos);
    if (!m) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 24), mat("#FFFFFF", { transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.16;
      fig.add(ring);
      g.add(fig);
      spieler.push({ sl, m: null, fig, kopf: new THREE.Vector3(pos.x, 1.4, pos.z) });
      return;
    }
    const torwart = sl.pos === "GK";
    const trikot = torwart ? "#F2B705" : farbe;
    const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.55, 10), mat("#1B1D45")); hose.position.y = 0.75;
    const beine = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.6, 8), mat("#F3F4FB")); beine.position.y = 0.3;
    const koerperS = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.95, 12), mat(trikot)); koerperS.position.y = 1.45;
    const kopf = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), mat(HAUT[hash(m.user) % HAUT.length])); kopf.position.y = 2.2;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.2, 28), mat(sl.spielt === "aw" ? "#FF4D6D" : "#FFFFFF", { side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.16;
    fig.add(hose, beine, koerperS, kopf, ring);
    fig.scale.setScalar(1.25);
    fig.rotation.y = Math.PI / 2;
    [hose, beine, koerperS, kopf].forEach((x) => { x.userData = { typ: "spieler", team, sl }; klickbar.push(x); });
    g.add(fig);
    spieler.push({ sl, m, fig, kopf: new THREE.Vector3(pos.x, 3.3, pos.z), phase: hash(m.user) % 100 });
  });

  // Teamschild
  const naechste = D.stadien[team.stufe];
  const schild = new THREE.Sprite(new THREE.SpriteMaterial({ map: schildTextur([team.name, `${team.stadion} · ${UI.zahl(team.fans)} fans · strength ${team.staerke}`], farbe), depthWrite: false }));
  const schildY = cfg.base + R * cfg.rise + (cfg.dach ? 14 : 10) + 6;
  schild.position.set(0, schildY, -aussenZ * 0.2);
  schild.scale.set(40, 10, 1);
  g.add(schild);

  // Unsichtbare Fläche zum Anklicken des Stadions
  const treffer = new THREE.Mesh(new THREE.BoxGeometry(2 * aussenX + 10, schildY + 6, 2 * aussenZ + 10), new THREE.MeshBasicMaterial({ visible: false }));
  treffer.position.y = (schildY + 6) / 2;
  treffer.userData = { typ: "stadion", team };
  g.add(treffer);

  szene.add(g);
  stadien.set(team.id, { team, g, mitte, plaetze, fanPos, spieler, aussenX, aussenZ, treffer, naechste, schild });
  return { aussenX, aussenZ, px, pz, stufe: team.stufe };
}

/* ---------- Stadt ---------- */
const FASSADEN = ["#EEE7DA", "#E2D6C4", "#D2C8B8", "#C6CCD6", "#B5C0CE", "#E8DCCB", "#D6DDE4", "#A9B4C2", "#F1EEE8", "#C9B9A6", "#DCC7B5", "#BFC9C2"];

function fassadenTextur() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 8; r++) {
    g.fillStyle = "rgba(0,0,0,.07)"; g.fillRect(0, 3 + r * 32, 256, 3);
    for (let k = 0; k < 6; k++) {
      const x = 9 + k * 41.5, y = 11 + r * 32;
      g.fillStyle = "#6F86A6"; g.fillRect(x, y, 25, 17);
      g.fillStyle = "rgba(255,255,255,.38)"; g.fillRect(x, y, 25, 5);
      g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x, y + 17, 25, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function strassenTextur() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = ASPHALT; g.fillRect(0, 0, 512, 128);
  g.fillStyle = "rgba(255,255,255,.75)";
  g.fillRect(0, 8, 512, 3); g.fillRect(0, 117, 512, 3);
  for (let x = 10; x < 512; x += 85) g.fillRect(x, 62, 48, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function flaeche(w, d, farbe, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(farbe, { roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  szene.add(m);
  return m;
}

function baueStadt(spalten, zeilen, stadionZellen) {
  const zuf = zufall(77);
  const RING = 2;
  const mitteVon = (c, r) => [(c - (spalten - 1) / 2) * ZELLE_X, (r - (zeilen - 1) / 2) * ZELLE_Z];
  const x0 = mitteVon(-RING, 0)[0] - ZELLE_X / 2, x1 = mitteVon(spalten - 1 + RING, 0)[0] + ZELLE_X / 2;
  const z0 = mitteVon(0, -RING)[1] - ZELLE_Z / 2, z1 = mitteVon(0, zeilen - 1 + RING)[1] + ZELLE_Z / 2;

  // Strassennetz: Abschnitte zwischen den Kreuzungen, Kreuzungen als eigene Flächen mit Zebrastreifen
  const basis = strassenTextur();
  const streifen = [];   // [x, z, breite, tiefe] weisse Markierungen (Zebrastreifen, Parkfelder)
  const abschnitt = (laenge, quer, x, z) => {
    const t = basis.clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, Math.round(laenge / 70)), 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(laenge, STRASSE), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
    m.rotation.x = -Math.PI / 2;
    if (quer) m.rotation.z = Math.PI / 2;
    m.position.set(x, 0.04, z);
    m.receiveShadow = true;
    szene.add(m);
  };
  const kreuzGeo = new THREE.PlaneGeometry(STRASSE, STRASSE);
  const kreuzMat = mat(ASPHALT, { roughness: 1 });
  for (let r = -RING; r <= zeilen + RING; r++) for (let c = -RING; c <= spalten + RING; c++) {
    const kx = mitteVon(c, 0)[0] - ZELLE_X / 2, kz = mitteVon(0, r)[1] - ZELLE_Z / 2;
    const k = new THREE.Mesh(kreuzGeo, kreuzMat);
    k.rotation.x = -Math.PI / 2; k.position.set(kx, 0.04, kz); k.receiveShadow = true;
    szene.add(k);
    const arme = [];
    if (c < spalten + RING) arme.push([1, 0]);
    if (c > -RING) arme.push([-1, 0]);
    if (r < zeilen + RING) arme.push([0, 1]);
    if (r > -RING) arme.push([0, -1]);
    for (const [dx, dz] of arme) {
      const ax = kx + dx * (STRASSE / 2 + 2.4), az = kz + dz * (STRASSE / 2 + 2.4);
      for (let q = -6.6; q <= 6.7; q += 2.2) streifen.push(dx ? [ax, az + q, 3.4, 1.1] : [ax + q, az, 1.1, 3.4]);
    }
    if (c < spalten + RING) abschnitt(ZELLE_X - STRASSE, false, kx + ZELLE_X / 2, kz);
    if (r < zeilen + RING) abschnitt(ZELLE_Z - STRASSE, true, kx, kz + ZELLE_Z / 2);
  }

  const bx = (ZELLE_X - STRASSE) / 2, bz = (ZELLE_Z - STRASSE) / 2;
  const lots = [];
  const baeume = [];
  const sockelMat = mat("#C4C7CE", { roughness: 1 });

  const autos = [], lampen = [];
  const RAND = 3;   // Tiefe des Bordsteins am Blockrand
  const zugangStrasse = (stufe, s) => (s === 1 ? stufe >= 3 : stufe >= 5);
  const zugangBreite = (stufe, s) => (zugangStrasse(stufe, s) ? 16.6 : stufe === 1 ? 4 : stufe === 2 ? 7 : 11);
  function parkplatz(x0p, z0p, w, d, stufe) {
    flaeche(w, d, ASPHALT, x0p + w / 2, SOCKEL + 0.09, z0p + d / 2);
    const reihen = d >= 17 ? [z0p + 3, z0p + d - 3] : [z0p + 3];
    const gasse = d >= 17 ? z0p + d / 2 : z0p + 5.6 + (d - 5.6) / 2;
    const belegung = 0.45 + stufe * 0.08;
    for (const rz of reihen) {
      let x = x0p + 1.2;
      for (; x + 2.7 <= x0p + w - 1; x += 2.7) {
        streifen.push([x, rz, 0.16, 5.2, SOCKEL + 0.15]);
        if (zuf() < belegung) autos.push([x + 1.35, rz]);
      }
      streifen.push([x, rz, 0.16, 5.2, SOCKEL + 0.15]);
    }
    return gasse;
  }

  function ring(cx, cz, tiefe, luecken, hMin, hMax) {
    const add = (x, z, w, d) => {
      if (luecken.some((l) => Math.abs(x - l.x) < w / 2 + l.w / 2 && Math.abs(z - l.z) < tiefe + 2)) return;
      const turm = zuf() < 0.07;
      const h = turm ? hMax * (1.5 + zuf() * 0.5) : hMin + zuf() * (hMax - hMin);
      lots.push({ x, z, w: w - 1.4, d: d - 1.4, h, farbe: FASSADEN[Math.floor(zuf() * FASSADEN.length)] });
    };
    for (const s of [-1, 1]) {
      let x = cx - bx + 1;
      while (x < cx + bx - 2) {
        let w = 15 + zuf() * 15;
        if (x + w > cx + bx - 1) w = cx + bx - 1 - x;
        if (w >= 8) add(x + w / 2, cz + s * (bz - tiefe / 2 - 1), w, tiefe);
        x += w;
      }
    }
    for (const s of [-1, 1]) {
      let z = cz - bz + tiefe + 1;
      while (z < cz + bz - tiefe - 2) {
        let d = 14 + zuf() * 14;
        if (z + d > cz + bz - tiefe - 1) d = cz + bz - tiefe - 1 - z;
        if (d >= 8) add(cx + s * (bx - tiefe / 2 - 1), z + d / 2, tiefe, d);
        z += d;
      }
    }
  }

  for (let r = -RING; r < zeilen + RING; r++) for (let c = -RING; c < spalten + RING; c++) {
    const [cx, cz] = mitteVon(c, r);
    const st = stadionZellen.get(`${c},${r}`);
    const sockelTeil = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, SOCKEL, d), sockelMat);
      m.position.set(x, SOCKEL / 2, z); m.receiveShadow = true; szene.add(m);
    };
    if (!st) sockelTeil(2 * bx, 2 * bz, cx, cz);
    else {
      // Sockel mit abgesenktem Bordstein bei den Zugängen
      sockelTeil(2 * bx, 2 * bz - 2 * RAND, cx, cz);
      for (const s of [-1, 1]) {
        const lw = zugangBreite(st.stufe, s);
        const rest = (2 * bx - lw) / 2;
        for (const q of [-1, 1]) sockelTeil(rest, RAND, cx + q * (lw / 2 + rest / 2), cz + s * (bz - RAND / 2));
        const neigung = Math.atan2(SOCKEL + 0.04, RAND);
        const geo = new THREE.PlaneGeometry(lw, Math.hypot(RAND, SOCKEL)).rotateX(-Math.PI / 2);
        const rampe = new THREE.Mesh(geo, mat(zugangStrasse(st.stufe, s) ? ASPHALT : st.stufe === 1 ? "#CBBD9A" : "#BDB7AA", { roughness: 1 }));
        rampe.position.set(cx, (SOCKEL + 0.09 + 0.05) / 2, cz + s * (bz - RAND / 2));
        rampe.rotation.x = s * neigung;
        rampe.receiveShadow = true;
        szene.add(rampe);
      }
    }
    if (st) {
      // Stadionquartier: Platz, Zugänge je nach Stufe, Parkplätze, Allee, niedriger Häuserring
      flaeche(2 * bx - 2, 2 * bz - 2, "#DAD6CC", cx, SOCKEL + 0.04, cz);
      const kante = st.pz + (STUFEN_N - 1) * 1.7;
      const breite = st.px + (STUFEN_N - 1) * 1.7;
      const innenX = bx - 22, innenZ = bz - 22;
      const stufe = st.stufe;
      // Parkplätze zuerst: ab Stadion (Stufe 3) einer, Arena zwei, Grossarena vier
      const parkSeiten = [];
      if (stufe >= 3) parkSeiten.push([1, 1]);
      if (stufe >= 4) parkSeiten.push([-1, 1]);
      if (stufe >= 5) parkSeiten.push([1, -1], [-1, -1]);
      const strassenEnde = {};   // Seite -> z, bis wohin die Zufahrtsstrasse reicht
      for (const [sx, sz] of parkSeiten) {
        const zA = cz + sz * (kante + 8), zB = cz + sz * (innenZ - 2);
        const xA = cx + sx * 10, xB = cx + sx * (innenX - 2);
        if (Math.abs(zB - zA) < 7) continue;
        const gasse = parkplatz(Math.min(xA, xB), Math.min(zA, zB), Math.abs(xB - xA), Math.abs(zB - zA), stufe);
        flaeche(5.4, 7, ASPHALT, cx + sx * 7.75, SOCKEL + 0.12, gasse);   // Einfahrt über das Trottoir
        const ende = gasse - sz * 3.5;   // innere Kante der Einfahrt
        if (strassenEnde[sz] === undefined || Math.abs(ende - cz) < Math.abs(strassenEnde[sz] - cz)) strassenEnde[sz] = ende;
      }
      for (const s of [-1, 1]) {
        const a = cz + s * kante, b = cz + s * (bz - RAND);
        const zufahrt = zugangStrasse(stufe, s);
        // Fussweg / Promenade vom Podest bis zur Strasse bzw. bis zum Blockrand
        const w = stufe === 1 ? 4 : stufe === 2 ? 7 : 11;
        const wegEnde = zufahrt ? (strassenEnde[s] ?? a) : b;
        const wegLang = Math.abs(wegEnde - a);
        if (wegLang > 0.5) {
          flaeche(w, wegLang, stufe === 1 ? "#CBBD9A" : "#BDB7AA", cx, SOCKEL + 0.09, (a + wegEnde) / 2);
          if (stufe >= 2) for (let k = 5; k < wegLang - 2; k += 11) for (const q of [-1, 1]) lampen.push([cx + q * (w / 2 + 0.9), a + s * k]);
        }
        if (zufahrt) {
          // Zufahrtsstrasse vom Blockrand bis zur letzten Parkplatz-Einfahrt, mit Wendeplatz
          const lang = Math.abs(b - wegEnde), mz = (b + wegEnde) / 2;
          flaeche(11, lang, ASPHALT, cx, SOCKEL + 0.09, mz);
          for (let k = 6; k < lang - 3; k += 6) streifen.push([cx, wegEnde + s * k, 0.35, 2.6, SOCKEL + 0.15]);
          for (const q of [-1, 1]) flaeche(2.4, lang, "#BDB7AA", cx + q * 6.8, SOCKEL + 0.09, mz);
          streifen.push([cx + 2.75, b - s * 1.2, 5.5, 0.45, SOCKEL + 0.15]);   // Haltelinie
          for (let q = -4.4; q <= 4.5; q += 2.2) streifen.push([cx + q, b - s * 4, 1.1, 2.6, SOCKEL + 0.15]);   // Fussgängerstreifen
          for (let q = -4.4; q <= 4.5; q += 2.2) streifen.push([cx + q, wegEnde - s * 1.6, 1.1, 2.6, SOCKEL + 0.16]);   // Übergang zur Promenade
          for (let k = 8; k < lang - 2; k += 12) for (const q of [-1, 1]) lampen.push([cx + q * 8.4, wegEnde + s * k]);
        }
      }
      ring(cx, cz, 22, [{ x: cx, z: cz + bz, w: 18 }, { x: cx, z: cz - bz, w: 18 }], 9, 24);
      // Allee rund ums Podest
      for (const s of [-1, 1]) {
        const zz = cz + s * (kante + 4.5);
        for (let x = cx - breite + 2; x <= cx + breite - 2; x += 9) if (Math.abs(x - cx) > 10) baeume.push([x, zz, 0.85]);
        const xx = cx + s * (breite + 6);
        if (Math.abs(xx - cx) < innenX - 3) for (let z = cz - kante; z <= cz + kante; z += 9) baeume.push([xx, z, 0.9]);
      }
    } else if (zuf() < 0.15) {
      // Park
      flaeche(2 * bx - 4, 2 * bz - 4, "#7FAE66", cx, SOCKEL + 0.04, cz);
      flaeche(2 * bx - 4, 5, "#D9D1BC", cx, SOCKEL + 0.1, cz);
      flaeche(5, 2 * bz - 4, "#D9D1BC", cx, SOCKEL + 0.16, cz);
      const teich = new THREE.Mesh(new THREE.CircleGeometry(14, 32), mat("#6FA8C9", { roughness: 0.2 }));
      teich.rotation.x = -Math.PI / 2; teich.position.set(cx + bx * 0.45, SOCKEL + 0.12, cz - bz * 0.45); szene.add(teich);
      for (let i = 0; i < 46; i++) {
        const x = cx + (zuf() - 0.5) * (2 * bx - 14), z = cz + (zuf() - 0.5) * (2 * bz - 14);
        if (Math.abs(x - cx) < 6 || Math.abs(z - cz) < 6) continue;
        if (Math.hypot(x - (cx + bx * 0.45), z - (cz - bz * 0.45)) < 17) continue;
        baeume.push([x, z, 0.8 + zuf() * 0.7]);
      }
    } else {
      // Wohn- und Geschäftsquartier mit Innenhof
      flaeche(2 * bx - 60, 2 * bz - 60, "#8DB777", cx, SOCKEL + 0.04, cz);
      ring(cx, cz, 26, [], 12, 44);
      for (let i = 0; i < 6; i++) baeume.push([cx + (zuf() - 0.5) * (2 * bx - 76), cz + (zuf() - 0.5) * (2 * bz - 76), 0.8 + zuf() * 0.5]);
    }
  }

  // Markierungen, Autos, Lampen als Instanzen
  {
    const d = new THREE.Object3D();
    const mk = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat("#F1F1F1", { roughness: 0.6 }), streifen.length);
    streifen.forEach(([x, z, w, t, y], i) => {
      d.position.set(x, y ?? 0.1, z); d.rotation.set(-Math.PI / 2, 0, 0); d.scale.set(w, t, 1); d.updateMatrix();
      mk.setMatrixAt(i, d.matrix);
    });
    mk.receiveShadow = true;
    szene.add(mk);
    const AUTOFARBEN = ["#E9ECEF", "#1F2430", "#9AA3AE", "#B3261E", "#1E4FA8", "#F2F2F2", "#4A5560", "#2E6B4A", "#C9A227"];
    const koerper = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.75, 4.2), mat("#FFFFFF", { roughness: 0.4 }), autos.length);
    const kabine = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.6, 2.1), mat("#2B3240", { roughness: 0.25 }), autos.length);
    autos.forEach(([x, z], i) => {
      d.rotation.set(0, (zuf() - 0.5) * 0.06, 0); d.scale.set(1, 1, 1);
      d.position.set(x, SOCKEL + 0.65, z); d.updateMatrix(); koerper.setMatrixAt(i, d.matrix);
      koerper.setColorAt(i, new THREE.Color(AUTOFARBEN[Math.floor(zuf() * AUTOFARBEN.length)]));
      d.position.set(x, SOCKEL + 1.3, z - 0.2); d.updateMatrix(); kabine.setMatrixAt(i, d.matrix);
    });
    [koerper, kabine].forEach((m) => { m.castShadow = m.receiveShadow = true; });
    szene.add(koerper, kabine);
    const mast = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 4.6, 6), mat("#5E6470"), lampen.length);
    const licht = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.25, 0.5), mat("#FFF4CC", { emissive: "#FFE7A0", emissiveIntensity: 0.6 }), lampen.length);
    lampen.forEach(([x, z], i) => {
      d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
      d.position.set(x, SOCKEL + 2.3, z); d.updateMatrix(); mast.setMatrixAt(i, d.matrix);
      d.position.set(x, SOCKEL + 4.65, z); d.updateMatrix(); licht.setMatrixAt(i, d.matrix);
    });
    mast.castShadow = true;
    szene.add(mast, licht);
  }

  // Häuser als Instanzen
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const fassade = new THREE.MeshStandardMaterial({ map: fassadenTextur(), roughness: 0.78 });
  const dach = new THREE.MeshStandardMaterial({ color: "#E4E4E4", roughness: 0.95 });
  const haeuser = new THREE.InstancedMesh(geo, [fassade, fassade, dach, dach, fassade, fassade], lots.length);
  const aufbauten = new THREE.InstancedMesh(geo, mat("#8A909B"), lots.length);
  const d = new THREE.Object3D();
  lots.forEach((l, i) => {
    d.position.set(l.x, SOCKEL, l.z); d.scale.set(l.w, l.h, l.d); d.rotation.set(0, 0, 0); d.updateMatrix();
    haeuser.setMatrixAt(i, d.matrix);
    haeuser.setColorAt(i, new THREE.Color(l.farbe));
    d.position.set(l.x + (zuf() - 0.5) * l.w * 0.3, SOCKEL + l.h, l.z + (zuf() - 0.5) * l.d * 0.3);
    d.scale.set(l.w * 0.32, 1.4 + zuf() * 1.6, l.d * 0.32); d.updateMatrix();
    aufbauten.setMatrixAt(i, d.matrix);
  });
  [haeuser, aufbauten].forEach((m) => { m.castShadow = m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; });
  szene.add(haeuser, aufbauten);

  // Bäume
  const stamm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.42, 3, 6), mat("#6B4A2A"), baeume.length);
  const krone = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.4, 1), mat("#FFFFFF", { flatShading: true }), baeume.length);
  baeume.forEach(([x, z, s], i) => {
    d.position.set(x, SOCKEL + 1.5 * s, z); d.scale.set(s, s, s); d.updateMatrix();
    stamm.setMatrixAt(i, d.matrix);
    d.position.y = SOCKEL + 4.4 * s; d.scale.set(s, s * 1.1, s); d.updateMatrix();
    krone.setMatrixAt(i, d.matrix);
    krone.setColorAt(i, new THREE.Color().setHSL(0.24 + zuf() * 0.1, 0.42, 0.3 + zuf() * 0.1));
  });
  [stamm, krone].forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
  szene.add(stamm, krone);

  stadtHalbX = (x1 - x0) / 2; stadtHalbZ = (z1 - z0) / 2;
  baueTal(Math.hypot(stadtHalbX, stadtHalbZ) + 30);

  // Schattenbereich auf die Stadt zuschneiden
  const halb = Math.max(x1 - x0, z1 - z0) / 2 + 60;
  Object.assign(sonne.shadow.camera, { left: -halb, right: halb, top: halb, bottom: -halb, near: 10, far: 2400 });
  sonne.shadow.camera.updateProjectionMatrix();
}


/* ---------- Statuen (Gewinner aus data/statuen.json) ---------- */
const statuen = [];   // { kopf: Vector3, user, team }
const BRONZE = () => mat("#D99A3E", { metalness: 0.25, roughness: 0.4, emissive: "#3A2408", emissiveIntensity: 0.25 });
function statue(x, y, z, user, team, blick = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = blick;
  const stein = (w, h, d, yy, f) => { const m = box(w, h, d, f, 0, yy, 0); g.add(m); };
  stein(3.2, 0.5, 3.2, 0.25, "#D9D4C7");
  stein(2.4, 2.2, 2.4, 1.6, "#ECE8DE");
  stein(2.8, 0.3, 2.8, 2.85, "#D9D4C7");
  const b = BRONZE();
  const teil = (geo, px, py, pz, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, b); m.position.set(px, py, pz); m.rotation.set(rx, 0, rz); m.castShadow = true; m.userData = { typ: "statue", user, team }; klickbar.push(m); g.add(m); };
  teil(new THREE.CylinderGeometry(0.26, 0.3, 1.5, 10), -0.22, 3.75, 0);
  teil(new THREE.CylinderGeometry(0.26, 0.3, 1.5, 10), 0.22, 3.75, 0);
  teil(new THREE.CylinderGeometry(0.55, 0.45, 1.6, 12), 0, 5.2, 0);
  teil(new THREE.SphereGeometry(0.42, 16, 12), 0, 6.35, 0);
  teil(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 8), 0.75, 6.3, 0, 0, -0.45);
  teil(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 8), -0.75, 6.3, 0, 0, 0.45);
  teil(new THREE.SphereGeometry(0.42, 16, 12), 0, 7.55, 0);   // Ball über dem Kopf
  szene.add(g);
  statuen.push({ kopf: new THREE.Vector3(x, y + 8.3, z), user, team });
}
function stelleStatuenAuf(namen) {
  const liste = [];
  for (const roh of namen) {
    const user = String(roh || "").trim().replace(/^@/, "");
    if (user && (D.demo || !user.startsWith("demo-user-"))) liste.push(user);
  }
  if (!liste.length || !stadien.size) return;
  // grösstes Stadion: höchste Stufe, bei Gleichstand am meisten Fans
  const st = [...stadien.values()].sort((a, b) => b.team.stufe - a.team.stufe || b.team.fans - a.team.fans)[0];
  const ax = st.aussenX + 4.5, az = st.aussenZ + 4.5;
  const plaetze = [];
  const reihe = (laenge) => { const r = []; for (let o = 4; o <= laenge - 4; o += 8) r.push(o, -o); return r; };
  for (const o of reihe(st.aussenX)) if (Math.abs(o) > 8) plaetze.push([o, -az, Math.PI]);   // Nordseite
  for (const o of reihe(st.aussenX)) if (Math.abs(o) > 8) plaetze.push([o, az, 0]);          // Südseite
  for (const o of reihe(st.aussenZ)) plaetze.push([ax, o, Math.PI / 2]);                     // Ostseite
  for (const o of reihe(st.aussenZ)) plaetze.push([-ax, o, -Math.PI / 2]);                   // Westseite
  liste.slice(0, plaetze.length).forEach((user, i) => {
    const [x, z, blick] = plaetze[i];
    statue(st.mitte.x + x, PODEST, st.mitte.z + z, user, st.team, blick);
  });
}

/* ---------- Tal und Berge ---------- */
let stadtHalbX = 400, stadtHalbZ = 400;
function rauschen(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const h = (a, b) => { let n = Math.imul(a, 374761393) + Math.imul(b, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const s = (t) => t * t * (3 - 2 * t);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}
function fbm(x, y) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < 5; i++) { s += a * rauschen(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
const glatt = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function baueTal(r0) {
  // Boden der Talsohle
  boden.geometry.dispose();
  boden.geometry = new THREE.CircleGeometry(r0 + 40, 96);
  boden.material.color.set("#86A06C");
  const hoehe = (x, z) => {
    const r = Math.hypot(x, z), a = Math.atan2(z, x);
    const berg = glatt(r0 + 60, r0 + 1100, r);
    const n = fbm(Math.cos(a) * 2.6 + 7, Math.sin(a) * 2.6 + r / 520);
    const grat = 0.55 + 0.45 * Math.abs(Math.sin(a * 5 + n * 6));
    const huegel = fbm(x / 140 + 3, z / 140) * 18 * glatt(r0, r0 + 200, r);
    return berg * (160 + 760 * n * n) * grat + huegel - 0.4 * (1 - glatt(r0, r0 + 30, r));
  };
  const SA = 260, SR = 70, R1 = r0 + 3400;
  const pos = [], farben = [], idx = [];
  const c = new THREE.Color();
  for (let i = 0; i <= SR; i++) {
    const r = r0 + (R1 - r0) * Math.pow(i / SR, 1.5);
    for (let j = 0; j <= SA; j++) {
      const a = (j / SA) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = hoehe(x, z);
      pos.push(x, y, z);
      const n = rauschen(x / 40, z / 40) * 60;
      if (y + n > 520) c.set("#F3F5F8");
      else if (y + n > 300) c.set("#8C8F93");
      else if (y + n * 0.5 > 90) c.set("#4E6E46");
      else c.set("#7E9B63");
      farben.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < SR; i++) for (let j = 0; j < SA; j++) {
    const a = i * (SA + 1) + j, b = a + SA + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(farben, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const berge = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  szene.add(berge);

  // Wald an den Hängen
  const zuf = zufall(31);
  const baeume = [];
  for (let k = 0; k < 2600 && baeume.length < 1400; k++) {
    const a = zuf() * Math.PI * 2, r = r0 - 20 + zuf() * 900;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < stadtHalbX + 15 && Math.abs(z) < stadtHalbZ + 15) continue;
    const y = hoehe(x, z);
    if (y > 260) continue;
    baeume.push([x, y, z, 1.4 + zuf() * 1.6]);
  }
  const d = new THREE.Object3D();
  const tannen = new THREE.InstancedMesh(new THREE.ConeGeometry(2.4, 8, 6), mat("#FFFFFF", { flatShading: true }), baeume.length);
  baeume.forEach(([x, y, z, s], i) => {
    d.position.set(x, y + 3.6 * s, z); d.scale.setScalar(s); d.updateMatrix();
    tannen.setMatrixAt(i, d.matrix);
    tannen.setColorAt(i, new THREE.Color().setHSL(0.3 + zuf() * 0.05, 0.38, 0.22 + zuf() * 0.08));
  });
  szene.add(tannen);
}

/* ---------- Welt aufbauen ---------- */
let weltWeite = 200, weltBreite = 300, weltTiefe = 200;
function baueWelt(statuenNamen = []) {
  const teams = [...D.teams].sort((a, b) => b.staerke - a.staerke || a.erstellt.localeCompare(b.erstellt));
  const n = Math.max(teams.length, 1);
  const spalten = Math.ceil(Math.sqrt(n * 1.4));
  const zeilen = Math.ceil(n / spalten);
  const zellen = new Map();
  teams.forEach((t, i) => {
    const r = Math.floor(i / spalten), c = i % spalten;
    const x = (c - (spalten - 1) / 2) * ZELLE_X;
    const z = (r - (zeilen - 1) / 2) * ZELLE_Z;
    zellen.set(`${c},${r}`, baueStadion(t, new THREE.Vector3(x, PODEST, z)));
  });
  weltBreite = Math.max(spalten * ZELLE_X, 300);
  weltTiefe = Math.max(zeilen * ZELLE_Z, 220);
  weltWeite = Math.max(weltBreite, weltTiefe) / 2;
  baueStadt(spalten, zeilen, zellen);
  stelleStatuenAuf(statuenNamen);
}

/* ---------- Kamera-Flug ---------- */
let flug = null;
function fliege(pos, ziel, dauer = 1.5) {
  flug = { von: kamera.position.clone(), vonZiel: steuerung.target.clone(), nach: pos.clone(), nachZiel: ziel.clone(), t0: performance.now(), dauer: dauer * 1000 };
}
function passendeDistanz(halbX, halbZ) {
  const vfov = THREE.MathUtils.degToRad(kamera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * kamera.aspect);
  return Math.max(halbX / Math.tan(hfov / 2), halbZ / Math.tan(vfov / 2));
}
const BLICK = new THREE.Vector3(0, 0.62, 0.78).normalize();
function weltAnsicht() {
  const d = passendeDistanz(weltBreite * 0.5, weltTiefe * 0.55) + 30;
  return [new THREE.Vector3(0, 0.5, 0.866).multiplyScalar(d), new THREE.Vector3(0, 0, -weltTiefe * 0.12)];
}
function teamAnsicht(s) {
  const d = passendeDistanz(s.aussenX + 6, s.aussenZ + 10) * 0.92 + 12;
  return [s.mitte.clone().add(BLICK.clone().multiplyScalar(d)), s.mitte.clone().add(new THREE.Vector3(0, 0, 3))];
}

/* ---------- Namensschilder ---------- */
const schildEbene = $("namensschilder");
const pool = [];
function schildAus(i) {
  if (!pool[i]) { const el = document.createElement("div"); el.className = "ns"; schildEbene.appendChild(el); pool[i] = el; }
  return pool[i];
}
const v = new THREE.Vector3();
function aufBildschirm(welt) {
  v.copy(welt).project(kamera);
  if (v.z > 1 || v.z < -1) return null;
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
}
function schilderZeichnen() {
  let k = 0;
  const s = zustand.team && stadien.get(zustand.team.id);
  if (s) {
    const dist = kamera.position.distanceTo(s.mitte);
    const farbe = UI.farbe(s.team);
    if (dist < 420) {
      for (const sp of s.spieler) {
        if (!sp.m) continue;
        const w = sp.kopf.clone().add(s.mitte);
        const p = aufBildschirm(w);
        if (!p) continue;
        const el = schildAus(k++);
        el.className = "ns spieler";
        el.style.setProperty("--team", farbe);
        el.innerHTML = `<i>${sp.m.punkte}</i>${sp.sl.pos} @${UI.esc(sp.m.user)}`;
        const skal = Math.max(0.65, Math.min(1.1, 90 / kamera.position.distanceTo(w)));
        el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-100%) scale(${skal})`;
        el.style.display = "block";
      }
    }
    if (dist < 120) {
      const kandidaten = [];
      const n = Math.min(s.team.fans_benannt.length, s.fanPos.length);
      for (let i = 0; i < n; i++) {
        const w = s.fanPos[i].clone().add(s.mitte);
        const d = kamera.position.distanceTo(w);
        if (d < 75) kandidaten.push([d, i, w]);
      }
      kandidaten.sort((a, b) => a[0] - b[0]);
      for (const [d, i, w] of kandidaten.slice(0, 90)) {
        const p = aufBildschirm(w);
        if (!p) continue;
        const el = schildAus(k++);
        el.className = "ns";
        el.textContent = "@" + s.team.fans_benannt[i];
        const skal = Math.max(0.55, Math.min(1, 26 / d));
        el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-100%) scale(${skal})`;
        el.style.display = "block";
      }
    }
  }
  for (const st of statuen) {
    const d = kamera.position.distanceTo(st.kopf);
    if (d > 170) continue;
    const p = aufBildschirm(st.kopf);
    if (!p) continue;
    const el = schildAus(k++);
    el.className = "ns statue";
    el.innerHTML = `<i>★</i>@${UI.esc(st.user)}`;
    el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-100%) scale(${Math.max(0.6, Math.min(1.05, 60 / d))})`;
    el.style.display = "block";
  }
  for (let i = k; i < pool.length; i++) if (pool[i].style.display !== "none") pool[i].style.display = "none";
  // eigenes Schild
  const mein = $("mein");
  if (zustand.ziel) {
    const p = aufBildschirm(zustand.ziel.pos);
    if (p) { mein.style.display = "block"; mein.style.left = p.x + "px"; mein.style.top = p.y + "px"; mein.textContent = zustand.ziel.text; }
    else mein.style.display = "none";
  } else mein.style.display = "none";
}

/* ---------- Markierung ---------- */
const marker = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 8, 28), new THREE.MeshBasicMaterial({ color: "#F2B705" }));
marker.rotation.x = Math.PI / 2;
marker.visible = false;
szene.add(marker);
const leuchte = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.6, 30, 16, 1, true), new THREE.MeshBasicMaterial({ color: "#FFE58A", transparent: true, opacity: 0.35, depthWrite: false }));
leuchte.visible = false;
szene.add(leuchte);

/* ---------- Oberfläche ---------- */
function kopfZeigen() {
  const t = zustand.team;
  for (const st of stadien.values()) st.schild.visible = !t || st.team.id !== t.id;
  $("zurueck").hidden = !t;
  $("kaderknopf").hidden = !t;
  $("balken").hidden = !t;
  if (!t) {
    $("titel").innerHTML = "Gram<b>Leagues</b>";
    $("tag").textContent = (D.saison ? "Season " + D.saison.nr : "") + (D.demo ? " · Demo" : "");
    $("zeile").innerHTML = UI.statusHTML(D);
    $("unterzeile").textContent = D.teams.length ? `${D.teams.length} teams · ${D.teams.filter((x) => x.komplett).length} ready to play · tap a stadium` : "No teams yet – comment TEAM Your Name under the season post";
  } else {
    const s = stadien.get(t.id);
    $("titel").textContent = t.name;
    $("tag").textContent = t.stadion;
    $("zeile").innerHTML = `<b>${UI.zahl(Math.min(t.fans, t.kapazitaet))}</b>/${UI.zahl(t.kapazitaet)} fans · strength <b>${t.staerke}</b> · starting XI <b>${t.stammelf}/11</b>${t.behalten ? " · Top 3" : ""}`;
    $("kopf").style.setProperty("--team", UI.farbe(t));
    $("balken").firstElementChild.style.width = Math.min(100, (t.fans / t.kapazitaet) * 100) + "%";
    $("unterzeile").textContent = s.naechste ? `${UI.zahl(Math.max(0, t.kapazitaet - t.fans))} more fans until the upgrade: ${s.naechste.name}` : "Top level reached – sold out at 2,000 fans";
  }
  UI.tick();
}

function oeffneTeam(id, ohneFlug) {
  const s = stadien.get(id);
  if (!s) return;
  zustand.team = s.team;
  zustand.modus = "team";
  kopfZeigen();
  if (!ohneFlug) { const [p, z] = teamAnsicht(s); fliege(p, z); }
}
function zurWelt() {
  zustand.team = null;
  zustand.modus = "welt";
  zustand.ziel = null;
  marker.visible = leuchte.visible = false;
  meldung(null);
  kopfZeigen();
  const [p, z] = weltAnsicht();
  fliege(p, z, 1.6);
}

function meldung(html) {
  $("meldung").classList.toggle("zeigen", !!html);
  $("meldtext").innerHTML = html || "";
}

function finde(name) {
  const q = name.trim().replace(/^@/, "").toLowerCase();
  if (!q) return;
  for (const t of D.teams) {
    const s = stadien.get(t.id);
    const sp = s.spieler.find((x) => x.m && x.m.user.toLowerCase() === q);
    const slot = t.slots.find((x) => [x.stamm, x.aw].some((m) => m && m.user.toLowerCase() === q));
    if (slot) {
      oeffneTeam(t.id, true);
      const istAw = slot.aw && slot.aw.user.toLowerCase() === q;
      const m = istAw ? slot.aw : slot.stamm;
      const spielt = slot.spielt === (istAw ? "aw" : "stamm");
      const ziel = sp && spielt ? sp.kopf.clone().add(s.mitte) : s.mitte.clone().add(new THREE.Vector3(FORMATION[slot.slot][0] * FX, 3.3, FORMATION[slot.slot][1] * FZ));
      zeigeZiel(ziel, `@${m.user}`, 16);
      meldung(`<b>@${UI.esc(m.user)}</b> is the ${istAw ? "sub" : "starter"} at ${slot.pos} for ${UI.esc(t.name)} · ${m.punkte} points (level ${m.level} from ${UI.zahl(m.likes)} likes + ${t.bonus} stadium)${spielt ? " · plays on matchday" : " · on the bench"}.`);
      return;
    }
    const i = t.fans_benannt.findIndex((u) => u.toLowerCase() === q);
    if (i >= 0 && s.fanPos[i]) {
      oeffneTeam(t.id, true);
      const w = s.fanPos[i].clone().add(s.mitte);
      zeigeZiel(w, `@${t.fans_benannt[i]}`, 10);
      const p = s.plaetze[i];
      const block = { N: "North", S: "South", W: "West", O: "East" }[p.seite];
      meldung(`Found you! <b>@${UI.esc(t.fans_benannt[i])}</b> sits in the ${UI.esc(t.stadion)} of ${UI.esc(t.name)} · ${block} stand, row ${p.reihe + 1}.`);
      return;
    }
  }
  meldung(`We couldn\'t find <b>@${UI.esc(q)}</b>. Reply to a team comment with a position or <b>FAN</b> – the bot adds you within about 15 minutes.`);
}

function zeigeZiel(w, text, abstand) {
  zustand.ziel = { pos: w.clone().add(new THREE.Vector3(0, 0.6, 0)), text };
  marker.position.copy(w).add(new THREE.Vector3(0, 0.4, 0));
  leuchte.position.copy(w).add(new THREE.Vector3(0, 15, 0));
  marker.visible = leuchte.visible = true;
  const s = stadien.get(zustand.team.id);
  const richtung = s.mitte.clone().sub(w).setY(0);
  if (richtung.lengthSq() < 1) richtung.set(0, 0, 1);
  richtung.normalize();
  const pos = w.clone().add(richtung.multiplyScalar(abstand)).add(new THREE.Vector3(0, abstand * 0.55, 0));
  fliege(pos, w, 1.8);
}

/* Panel */
function panel(art) {
  const p = $("panel");
  const inhalt = $("panelinhalt");
  if (!art) { p.hidden = true; document.querySelectorAll(".knoepfe button").forEach((b) => b.classList.remove("aktiv")); return; }
  const html = art === "teams" ? UI.teamListeHTML(D) : art === "turnier" ? UI.turnierHTML(D) : art === "regeln" ? UI.regelnHTML(D) : art === "archiv" ? UI.archivHTML(D) : art === "kader" && zustand.team ? UI.kaderHTML(D, zustand.team) : "";
  inhalt.innerHTML = html + (art === "regeln" ? `<p class="leise" style="margin-top:16px">Prefer a simple list? <a href="liste.html">Open the list view</a></p>` : "");
  p.hidden = false;
  p.scrollTop = 0;
  document.querySelectorAll(".knoepfe button").forEach((b) => b.classList.toggle("aktiv", b.dataset.panel === art));
  UI.tick();
}
$("panelinhalt").addEventListener("click", (e) => {
  const t = e.target.closest("[data-team]");
  if (t) { panel(null); oeffneTeam(t.dataset.team); return; }
  const f = e.target.closest("[data-finde]");
  if (f) { panel(null); $("eingabe").value = f.dataset.finde; finde(f.dataset.finde); }
});
document.querySelectorAll(".knoepfe button").forEach((b) => b.addEventListener("click", () => panel($("panel").hidden || !b.classList.contains("aktiv") ? b.dataset.panel : null)));
$("panelzu").addEventListener("click", () => panel(null));
$("zurueck").addEventListener("click", zurWelt);
$("heim").addEventListener("click", zurWelt);
$("schliessen").addEventListener("click", () => {
  meldung(null);
  zustand.ziel = null;
  marker.visible = leuchte.visible = false;
  if (zustand.team) { const [p, z] = teamAnsicht(stadien.get(zustand.team.id)); fliege(p, z, 1.2); }
});
$("suche").addEventListener("submit", (e) => { e.preventDefault(); panel(null); finde($("eingabe").value); $("eingabe").blur(); });
function zoom(f) {
  const ziel = steuerung.target.clone();
  const pos = kamera.position.clone().sub(ziel).multiplyScalar(f).add(ziel);
  const d = pos.distanceTo(ziel);
  if (d < steuerung.minDistance || d > steuerung.maxDistance) return;
  fliege(pos, ziel, 0.45);
}
$("rein").addEventListener("click", () => zoom(0.7));
$("raus").addEventListener("click", () => zoom(1.4));
addEventListener("keydown", (e) => { if (e.key === "Escape") { if (!$("panel").hidden) panel(null); else if (zustand.team) zurWelt(); } });

/* Klicken & Hovern */
const strahl = new THREE.Raycaster();
const maus = new THREE.Vector2();
function treffer(x, y) {
  maus.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  strahl.setFromCamera(maus, kamera);
  const ziele = [...klickbar, ...[...stadien.values()].map((s) => s.treffer)];
  const hits = strahl.intersectObjects(ziele, false).filter((h) => !(h.object.userData.typ === "fan" && h.instanceId >= h.object.userData.team.fans_benannt.length));
  const echt = hits.find((h) => h.object.userData.typ !== "stadion");
  return echt && echt.distance < 260 ? echt : hits[0];
}
function beschreibe(h) {
  if (!h) return null;
  const u = h.object.userData;
  if (u.typ === "spieler") {
    const m = u.sl.spielt === "aw" ? u.sl.aw : u.sl.stamm;
    return { text: `${u.sl.pos} @${m.user} · ${m.punkte} pts`, user: m.user, team: u.team };
  }
  if (u.typ === "fan") {
    const i = h.instanceId;
    if (i < u.team.fans_benannt.length) return { text: "@" + u.team.fans_benannt[i], user: u.team.fans_benannt[i], team: u.team };
    return null;
  }
  if (u.typ === "statue") return { text: `★ @${u.user} · statue`, statue: u.user, team: u.team };
  if (u.typ === "stadion") return { text: u.team.name, team: u.team, stadion: true };
  return null;
}
let start = null;
renderer.domElement.addEventListener("pointerdown", (e) => { start = [e.clientX, e.clientY]; flug = null; });
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 6) return;
  const b = beschreibe(treffer(e.clientX, e.clientY));
  if (!b) return;
  if (b.statue) { meldung(`<b>★ @${UI.esc(b.statue)}</b> – statue for a monthly winner, at the biggest stadium of the league.`); return; }
  if (!zustand.team || zustand.team.id !== b.team.id || b.stadion) {
    if (!zustand.team || zustand.team.id !== b.team.id) { oeffneTeam(b.team.id); return; }
  }
  if (b.user) { $("eingabe").value = b.user; finde(b.user); }
});
const hover = $("hover");
let hoverZeit = 0;
renderer.domElement.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" || e.buttons) { hover.style.display = "none"; return; }
  const jetzt = performance.now();
  if (jetzt - hoverZeit < 60) return;
  hoverZeit = jetzt;
  const b = beschreibe(treffer(e.clientX, e.clientY));
  if (b && (b.user || b.statue || (b.stadion && (!zustand.team || zustand.team.id !== b.team.id)))) {
    hover.textContent = b.stadion ? `${b.text} · visit` : b.text;
    hover.style.display = "block";
    hover.style.left = e.clientX + "px";
    hover.style.top = e.clientY + "px";
    renderer.domElement.style.cursor = "pointer";
  } else { hover.style.display = "none"; renderer.domElement.style.cursor = ""; }
});
renderer.domElement.addEventListener("pointerleave", () => { hover.style.display = "none"; });

addEventListener("resize", () => {
  kamera.aspect = innerWidth / innerHeight;
  kamera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------- Schleife ---------- */
const uhr = new THREE.Clock();
function schleife() {
  const t = uhr.getElapsedTime();
  if (flug) {
    const k = Math.min(1, (performance.now() - flug.t0) / flug.dauer);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    kamera.position.lerpVectors(flug.von, flug.nach, e);
    steuerung.target.lerpVectors(flug.vonZiel, flug.nachZiel, e);
    if (k >= 1) flug = null;
  }
  steuerung.update();
  const abstand = kamera.position.distanceTo(steuerung.target);
  szene.fog.near = abstand * 1.1 + 250;
  szene.fog.far = abstand * 3.2 + 2200;
  steuerung.target.x = THREE.MathUtils.clamp(steuerung.target.x, -stadtHalbX, stadtHalbX);
  steuerung.target.z = THREE.MathUtils.clamp(steuerung.target.z, -stadtHalbZ, stadtHalbZ);
  steuerung.target.y = THREE.MathUtils.clamp(steuerung.target.y, 0, 60);
  if (zustand.team) {
    const s = stadien.get(zustand.team.id);
    for (const sp of s.spieler) if (sp.m) sp.fig.position.y = Math.abs(Math.sin(t * 2.2 + sp.phase)) * 0.12;
  }
  if (marker.visible) { marker.rotation.z = t * 2; marker.scale.setScalar(1 + Math.sin(t * 5) * 0.12); }
  renderer.render(szene, kamera);
  schilderZeichnen();
  requestAnimationFrame(schleife);
}

/* ---------- Start ---------- */
async function start_() {
  try {
    const r = await fetch("data/league.json?t=" + Date.now(), { cache: "no-store" });
    D = await r.json();
  } catch (e) {
    $("wolken").querySelector(".wolkentext").textContent = "The league could not be loaded.";
    return;
  }
  let statuenNamen = [];
  try {
    const r = await fetch("data/statuen.json?t=" + Date.now(), { cache: "no-store" });
    if (r.ok) statuenNamen = (await r.json()).statuen || [];
  } catch (e) { /* keine Statuen */ }
  baueWelt(statuenNamen);
  const [p, z] = weltAnsicht();
  kamera.position.copy(p).multiplyScalar(2.4).add(new THREE.Vector3(0, 260, 0));
  steuerung.target.copy(z);
  kopfZeigen();
  setInterval(UI.tick, 1000);
  schleife();
  const params = new URLSearchParams(location.search);
  const ladeEnde = () => {
    $("wolken").classList.add("auf");
    fliege(p, z, 3.2);
    setTimeout(() => $("wolken").classList.add("weg"), 3600);
    if (params.get("name")) { $("eingabe").value = params.get("name"); setTimeout(() => finde(params.get("name")), 3300); }
    else if (params.get("team") && stadien.has(params.get("team"))) setTimeout(() => oeffneTeam(params.get("team")), 3300);
  };
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ladeEnde, 350)));
}

start_();
window.gramleagues = { kamera, steuerung, fliege, THREE };
