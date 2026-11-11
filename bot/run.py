"""Gramleagues-Bot: ein Durchlauf.

Wird von GitHub Actions alle 15 Minuten gestartet:
  1. Saisonwechsel prüfen (Sonntag 23:59)
  2. Saison-Post finden (neuester Post mit #gramleagues in der Beschreibung)
  3. Team-Kommentare und Antworten lesen, Positionen/Fans vergeben, Likes zählen
  4. Nach Anmeldeschluss (Samstag 23:59) das Turnier berechnen
  5. Antworten auf Instagram senden
  6. docs/data/league.json für die Website schreiben
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import liga  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
STATE_DATEI = ROOT / "data" / "state.json"
LEAGUE_DATEI = ROOT / "docs" / "data" / "league.json"
HASHTAG = "#gramleagues"
MAX_AKTIONEN = 40


def p(t):
    return liga.parse_zeit(t)


def saison_post_finden(api, fenster):
    frueheste = p(fenster["start"]) - timedelta(hours=6)
    kandidaten = [m for m in api.medien() if HASHTAG in (m.get("caption") or "").lower() and p(m["timestamp"]) >= frueheste]
    kandidaten.sort(key=lambda m: p(m["timestamp"]))
    return kandidaten[0] if kandidaten else None


def synchronisieren(api, state, eigener_name):
    s = state["saison"]
    schluss = p(s["anmeldeschluss"])

    kommentare = sorted(api.kommentare(s["media_id"]), key=lambda c: p(c["timestamp"]))
    for c in kommentare:
        if p(c["timestamp"]) < schluss:
            liga.team_kommentar_verarbeiten(state, c, s["media_id"], eigener_name)

    neu = []
    for team in liga.aktive_teams(state):
        info = api.kommentar(team["id"])
        if info is None:
            team["aufgeloest"] = True
            continue
        antworten = api.antworten(team["id"])
        liga.team_abgleichen(state, team, info.get("like_count", 0), antworten)
        for r in antworten:
            if r["id"] not in state["verarbeitet"] and p(r["timestamp"]) < schluss:
                neu.append((p(r["timestamp"]), team["id"], r))
    neu.sort(key=lambda x: (x[0], x[2]["id"]))
    for _, team_id, r in neu:
        team = state["teams"][team_id]
        if not team.get("aufgeloest"):
            liga.antwort_verarbeiten(state, team, r, eigener_name)


def shoutout_text(state):
    t = state["turnier"]
    team = state["teams"][t["meister"]]
    spieler = []
    for slot in liga.SLOTS:
        rolle, m = liga.aufstellung(team)[slot]
        if m:
            spieler.append("@" + m["user"])
    return (f"Shoutout to {team['name']}, champions of Gramleagues season {state['saison']['nr']}! "
            f"Congrats {' '.join(spieler)}")


def lauf(api, state, now, eigener_name):
    if state["saison"] and now >= p(state["saison"]["ende"]):
        liga.saison_abschliessen(state)

    if not state["saison"]:
        fenster = liga.saison_fenster(now)
        media = saison_post_finden(api, fenster)
        if media:
            nr = state["archiv"][-1]["nr"] + 1 if state["archiv"] else 1
            state["saison"] = {"nr": nr, "media_id": media["id"], "permalink": media.get("permalink"), **fenster}

    s = state["saison"]
    if s and state["turnier"] is None:
        synchronisieren(api, state, eigener_name)
        if now >= p(s["anmeldeschluss"]):
            komplett = {i: t for i, t in state["teams"].items() if not t.get("aufgeloest") and liga.ist_komplett(t)}
            state["turnier"] = liga.turnier_berechnen(komplett, seed=f"{s['nr']}-{s['media_id']}")
            state["turnier"]["berechnet"] = liga.iso(now)

    if s and state["turnier"] and not state["shoutout"] and now >= p(s["reveal"]["final"]):
        if state["turnier"].get("meister"):
            state["aktionen"].append({"typ": "media_kommentar", "media_id": s["media_id"], "text": shoutout_text(state)})
        state["shoutout"] = True

    aktionen_ausfuehren(api, state)


def aktionen_ausfuehren(api, state):
    offen = state["aktionen"]
    jetzt, spaeter = offen[:MAX_AKTIONEN], offen[MAX_AKTIONEN:]
    for a in jetzt:
        try:
            if a["typ"] == "antwort":
                api.antworten_senden(a["comment_id"], a["text"])
            elif a["typ"] == "ausblenden":
                api.ausblenden(a["comment_id"])
            elif a["typ"] == "media_kommentar":
                api.media_kommentar(a["media_id"], a["text"])
        except Exception as e:  # eine fehlgeschlagene Antwort darf den Lauf nicht stoppen
            print("Aktion fehlgeschlagen:", a, e, file=sys.stderr)
    state["aktionen"] = spaeter


def _mitglied(m, t):
    if not m:
        return None
    return {"user": m["user"], "likes": m["likes"], "level": liga.level(m["likes"]), "punkte": liga.punkte(m, t)}


def export(state, now):
    s = state["saison"]
    teams = []
    for t in liga.aktive_teams(state):
        auf = liga.aufstellung(t)
        slots = []
        for sl in liga.SLOTS:
            st, aw = t["slots"][sl]["stamm"], t["slots"][sl]["aw"]
            slots.append({"slot": sl, "pos": liga.slot_pos(sl), "stamm": _mitglied(st, t), "aw": _mitglied(aw, t), "spielt": auf[sl][0]})
        stadion = liga.stadion(t["max_stufe"])
        teams.append({
            "id": t["id"], "name": t["name"], "gruender": t["gruender"], "erstellt": t["erstellt"],
            "fans": liga.team_fans(t), "fans_anonym": t["likes"],
            "fans_benannt": [f["user"] for f in sorted(t["fans_benannt"], key=lambda f: f["ts"])],
            "stufe": t["max_stufe"], "stadion": stadion["name"], "kapazitaet": stadion["voll"],
            "stammelf": liga.stammelf_anzahl(t), "komplett": liga.ist_komplett(t),
            "staerke": liga.staerke(t), "likes_total": liga.likes_total(t), "bonus": liga.bonus(t),
            "behalten": t.get("behalten", 0), "slots": slots,
        })
    if not s:
        status = "warten"
    elif now < p(s["anmeldeschluss"]):
        status = "anmeldung"
    else:
        status = "turnier"
    saison = None
    if s:
        saison = {k: s[k] for k in ("nr", "permalink", "start", "anmeldeschluss", "ende", "reveal")}
    return {
        "stand": liga.iso(now),
        "status": status,
        "saison": saison,
        "naechste_saison": None if s else liga.saison_fenster(now),
        "stadien": liga.STADIEN,
        "level": [{"ab": 0, "level": 0}] + [{"ab": a, "level": l} for a, l in liga.LEVEL_SCHWELLEN],
        "bonus_pro_stufe": liga.BONUS_PRO_STUFE,
        "teams": teams,
        "turnier": state["turnier"],
        "archiv": state["archiv"],
    }


def laden():
    if STATE_DATEI.exists():
        return json.loads(STATE_DATEI.read_text())
    return liga.neuer_zustand()


def speichern(state, now, state_datei=STATE_DATEI, league_datei=LEAGUE_DATEI):
    state_datei.parent.mkdir(parents=True, exist_ok=True)
    league_datei.parent.mkdir(parents=True, exist_ok=True)
    state_datei.write_text(json.dumps(state, ensure_ascii=False, indent=1))
    league_datei.write_text(json.dumps(export(state, now), ensure_ascii=False, indent=1))


def main():
    from instagram import InstagramAPI

    token = os.environ.get("IG_TOKEN")
    user_id = os.environ.get("IG_USER_ID")
    eigener_name = os.environ.get("IG_USERNAME", "")
    if not token or not user_id:
        print("IG_TOKEN and IG_USER_ID are missing (GitHub secrets).", file=sys.stderr)
        sys.exit(1)
    api = InstagramAPI(token, user_id)
    state = laden()
    now = datetime.now(timezone.utc)
    lauf(api, state, now, eigener_name)
    speichern(state, now)
    print("OK", liga.iso(now), "Teams:", len(liga.aktive_teams(state)))


if __name__ == "__main__":
    main()
