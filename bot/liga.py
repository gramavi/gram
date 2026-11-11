"""Gramleagues – game rules.

Pure logic, no network: positions, subs, levels, fans, stadium,
season window, tournament. State is a plain dict stored as JSON
(data/state.json). Identifiers are German, all player-facing text is English.
"""
import math
import random
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Zurich")

# --- Positionen -------------------------------------------------------------
POSITIONEN = {"GK": 1, "LB": 1, "RB": 1, "CB": 2, "CM": 3, "LW": 1, "RW": 1, "ST": 1}
SLOTS = ["GK", "LB", "CB1", "CB2", "RB", "CM1", "CM2", "CM3", "LW", "ST", "RW"]
POS_REIHENFOLGE = ["GK", "LB", "RB", "CB", "CM", "LW", "RW", "ST"]
# German codes are accepted too
ALIAS = {"TW": "GK", "LV": "LB", "RV": "RB", "IV": "CB", "ZM": "CM", "LA": "LW", "RA": "RW"}


def slot_pos(slot):
    return slot.rstrip("0123456789")


def slots_fuer(pos):
    return [s for s in SLOTS if slot_pos(s) == pos]


# --- Level & Stadion --------------------------------------------------------
# Likes on your reply -> level 0..20 (level 20 at 500 likes)
LEVEL_AB = [2, 5, 10, 20, 30, 45, 60, 80, 100, 125, 150, 180, 210, 245, 280, 320, 360, 405, 450, 500]
LEVEL_SCHWELLEN = [(ab, i + 1) for i, ab in enumerate(LEVEL_AB)]


def level(likes):
    return sum(1 for ab in LEVEL_AB if (likes or 0) >= ab)


STADIEN = [
    {"stufe": 1, "name": "Backyard Pitch", "voll": 100},
    {"stufe": 2, "name": "Sports Ground", "voll": 250},
    {"stufe": 3, "name": "Stadium", "voll": 500},
    {"stufe": 4, "name": "Arena", "voll": 1000},
    {"stufe": 5, "name": "Mega Arena", "voll": 2000},   # top level from 1000 fans; seats shown up to 2000
]


def stufe_fuer_fans(fans):
    stufe = 1
    for st in STADIEN[:-1]:
        if fans >= st["voll"]:
            stufe = st["stufe"] + 1
    return stufe


def stadion(stufe):
    return STADIEN[stufe - 1]


# Each stadium level gives every player +1 point (Backyard Pitch +1 ... Mega Arena +5)
BONUS_PRO_STUFE = 1


def bonus(team):
    return BONUS_PRO_STUFE * team.get("max_stufe", 1)


def punkte(m, team):
    """Strength points of a player: level from likes (0-20) + stadium bonus (1-5), max 25."""
    return level(m["likes"]) + bonus(team)


# --- Ergebnis ---------------------------------------------------------------
def ergebnis(staerke_a, staerke_b):
    d = abs(staerke_a - staerke_b)
    if d == 0:
        return (1, 1)
    if d <= 10:
        w, l = 1, 0
    elif d <= 25:
        w, l = 2, 1
    elif d <= 45:
        w, l = 2, 0
    else:
        w, l = 3, 0
    return (w, l) if staerke_a > staerke_b else (l, w)


# --- Zeit -------------------------------------------------------------------
def iso(dt):
    return dt.astimezone(TZ).isoformat()


def parse_zeit(text):
    """ISO-Zeit oder Instagram-Format (2026-11-11T14:00:00+0000)."""
    if text is None:
        return None
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return datetime.strptime(text, "%Y-%m-%dT%H:%M:%S%z")


def saison_fenster(now):
    """Season = calendar month (Zurich time).

    Sign-up from the 1st at 00:00 until the second-to-last day at 23:59.
    Tournament on the last day: groups 14:00, playoffs 18:00, podium 20:00. Season ends 23:59.
    """
    local = now.astimezone(TZ)

    def fenster(jahr, monat):
        start = datetime(jahr, monat, 1, 0, 0, tzinfo=TZ)
        naechster = datetime(jahr + (monat == 12), monat % 12 + 1, 1, tzinfo=TZ)
        letzter = (naechster - timedelta(days=1)).date()
        vorletzter = letzter - timedelta(days=1)

        def am(d, h, m):
            return datetime(d.year, d.month, d.day, h, m, tzinfo=TZ)

        return {
            "start": iso(start),
            "anmeldeschluss": iso(am(vorletzter, 23, 59)),
            "ende": iso(am(letzter, 23, 59)),
            "reveal": {"gruppen": iso(am(letzter, 14, 0)), "playoffs": iso(am(letzter, 18, 0)), "final": iso(am(letzter, 20, 0))},
        }

    f = fenster(local.year, local.month)
    if local >= datetime.fromisoformat(f["ende"]):
        f = fenster(local.year + (local.month == 12), local.month % 12 + 1)
    return f


# --- Kommentare lesen ---------------------------------------------------------
TEAM_RE = re.compile(r"^\s*team\s+(.+?)\s*$", re.I | re.S)
NAME_OK = re.compile(r"^[\w .'&\-]{3,20}$")
SPERRWOERTER = {"fuck", "shit", "cunt", "bitch", "nazi", "whore", "arsch", "fick", "hure", "wichser", "fotze", "schlampe"}
MENTION_RE = re.compile(r"^(?:@[\w.]+[\s,:]*)+")


def parse_team(text):
    """Gibt (status, name) zurück: ('ok', name), ('ungueltig', name) oder (None, None)."""
    m = TEAM_RE.match(text or "")
    if not m:
        return None, None
    name = " ".join(m.group(1).split())
    if not NAME_OK.match(name) or "_" in name:
        return "ungueltig", name
    if any(w in name.lower() for w in SPERRWOERTER):
        return "gesperrt", name
    return "ok", name


def parse_antwort(text):
    t = MENTION_RE.sub("", (text or "").strip()).strip().upper()
    if t == "FAN":
        return "fan", None
    t = ALIAS.get(t, t) or t
    if t in POSITIONEN:
        return "pos", t
    return "ungueltig", None


# --- Zustand ----------------------------------------------------------------
def neuer_zustand():
    return {
        "version": 1,
        "saison": None,
        "teams": {},
        "verarbeitet": {},
        "team_kommentare": {},
        "turnier": None,
        "shoutout": False,
        "archiv": [],
        "aktionen": [],
    }


def neues_team(comment, name, media_id):
    return {
        "id": comment["id"],
        "name": name,
        "gruender": comment.get("username"),
        "erstellt": comment["timestamp"],
        "media_id": media_id,
        "likes": comment.get("like_count", 0) or 0,
        "fans_benannt": [],
        "slots": {s: {"stamm": None, "aw": None} for s in SLOTS},
        "max_stufe": 1,
        "behalten": 0,
        "aufgeloest": False,
    }


def team_fans(team):
    return (team.get("likes") or 0) + len(team["fans_benannt"])


def stammelf_anzahl(team):
    return sum(1 for s in SLOTS if team["slots"][s]["stamm"])


def ist_komplett(team):
    return stammelf_anzahl(team) == len(SLOTS)


def aktive_teams(state):
    return [t for t in state["teams"].values() if not t.get("aufgeloest")]


def spieler_team(state, user):
    u = user.lower()
    for t in aktive_teams(state):
        for s in SLOTS:
            for rolle in ("stamm", "aw"):
                m = t["slots"][s][rolle]
                if m and m["user"].lower() == u:
                    return t
    return None


def fan_team(state, user):
    u = user.lower()
    for t in aktive_teams(state):
        if any(f["user"].lower() == u for f in t["fans_benannt"]):
            return t
    return None


def freie_positionen(team):
    frei = []
    for pos in POS_REIHENFOLGE:
        for s in slots_fuer(pos):
            if not team["slots"][s]["stamm"] or not team["slots"][s]["aw"]:
                frei.append(pos)
                break
    return frei


def _antwort(state, team_id, text):
    state["aktionen"].append({"typ": "antwort", "comment_id": team_id, "text": text})


def _ausblenden(state, comment_id):
    state["aktionen"].append({"typ": "ausblenden", "comment_id": comment_id})


# --- Verarbeitung -----------------------------------------------------------
def team_kommentar_verarbeiten(state, comment, media_id, eigener_name):
    cid = comment["id"]
    if cid in state["team_kommentare"] or cid in state["teams"]:
        return
    if (comment.get("username") or "").lower() == (eigener_name or "").lower():
        return
    status, name = parse_team(comment.get("text"))
    if status is None:
        return  # normaler Kommentar, kein Team
    if status != "ok":
        state["team_kommentare"][cid] = status
        if status == "ungueltig":
            _antwort(state, cid, "Team names need 3 to 20 characters (letters, numbers, spaces). Example: TEAM Thunder FC")
        else:
            _ausblenden(state, cid)
        return
    if any(t["name"].lower() == name.lower() for t in aktive_teams(state)):
        state["team_kommentare"][cid] = "vergeben"
        _antwort(state, cid, f"The name {name} is already taken. Please pick another one.")
        return
    state["team_kommentare"][cid] = "team"
    state["teams"][cid] = neues_team(comment, name, media_id)
    _antwort(state, cid, f"{name} has been founded! Reply with your position (GK, LB, RB, CB, CM, LW, RW, ST) to join, or with FAN.")


def stadion_pruefen(state, team):
    neu = stufe_fuer_fans(team_fans(team))
    if neu > team["max_stufe"]:
        team["max_stufe"] = neu
        st = stadion(neu)
        _antwort(state, team["id"], f"{team['name']} now has {team_fans(team)} fans! The stadium grows to level {neu}: {st['name']}.")


def antwort_verarbeiten(state, team, reply, eigener_name):
    rid = reply["id"]
    user = reply.get("username") or ""
    if rid in state["verarbeitet"] or user.lower() == (eigener_name or "").lower():
        return
    art, pos = parse_antwort(reply.get("text"))
    likes = reply.get("like_count", 0) or 0
    mitglied = {"user": user, "reply_id": rid, "ts": reply["timestamp"], "likes": likes}

    if art == "ungueltig":
        state["verarbeitet"][rid] = "ungueltig"
        _antwort(state, team["id"], f"@{user} Please reply with a position only (GK, LB, RB, CB, CM, LW, RW, ST) or with FAN.")
        _ausblenden(state, rid)
        return

    if art == "fan":
        anderes = fan_team(state, user)
        if anderes:
            state["verarbeitet"][rid] = "abgelehnt"
            _antwort(state, team["id"], f"@{user} you are already a fan of {anderes['name']} this season.")
            return
        state["verarbeitet"][rid] = "fan"
        team["fans_benannt"].append({"user": user, "reply_id": rid, "ts": reply["timestamp"]})
        voll = stadion(team["max_stufe"])["voll"]
        _antwort(state, team["id"], f"@{user} now has a seat in the {team['name']} stadium ({team_fans(team)}/{voll}).")
        stadion_pruefen(state, team)
        return

    anderes = spieler_team(state, user)
    if anderes:
        state["verarbeitet"][rid] = "abgelehnt"
        _antwort(state, team["id"], f"@{user} you are already playing for {anderes['name']} this season.")
        return
    for s in slots_fuer(pos):
        if not team["slots"][s]["stamm"]:
            team["slots"][s]["stamm"] = mitglied
            state["verarbeitet"][rid] = "stamm"
            n = stammelf_anzahl(team)
            _antwort(state, team["id"], f"@{user} is {pos} for {team['name']} (starting XI {n}/11).")
            if n == 11:
                _antwort(state, team["id"], f"{team['name']} is complete (11/11) and ready to play!")
            return
    for s in slots_fuer(pos):
        if not team["slots"][s]["aw"]:
            team["slots"][s]["aw"] = mitglied
            state["verarbeitet"][rid] = "aw"
            _antwort(state, team["id"], f"@{user}, you are the sub for {pos} at {team['name']}.")
            return
    state["verarbeitet"][rid] = "voll"
    frei = ", ".join(freie_positionen(team)) or "none"
    _antwort(state, team["id"], f"@{user} {pos} is fully taken. Open: {frei}")


def team_abgleichen(state, team, like_count, replies):
    """Likes aktualisieren, gelöschte Antworten entfernen, AW nachrücken lassen."""
    team["likes"] = like_count or 0
    nach_id = {r["id"]: r for r in replies}
    for s in SLOTS:
        slot = team["slots"][s]
        for rolle in ("stamm", "aw"):
            m = slot[rolle]
            if not m:
                continue
            r = nach_id.get(m["reply_id"])
            if r is None:
                slot[rolle] = None
            else:
                m["likes"] = r.get("like_count", 0) or 0
        if not slot["stamm"] and slot["aw"]:
            slot["stamm"], slot["aw"] = slot["aw"], None
            _antwort(state, team["id"], f"@{slot['stamm']['user']} moves up into the starting XI of {team['name']} at {slot_pos(s)}.")
    team["fans_benannt"] = [f for f in team["fans_benannt"] if f["reply_id"] in nach_id]
    stadion_pruefen(state, team)


# --- Turnier ----------------------------------------------------------------
def aufstellung(team):
    """Pro Slot spielt, wer mehr Likes hat; bei Gleichstand der Stammspieler."""
    out = {}
    for s in SLOTS:
        st, aw = team["slots"][s]["stamm"], team["slots"][s]["aw"]
        if aw and (not st or aw["likes"] > st["likes"]):
            out[s] = ("aw", aw)
        elif st:
            out[s] = ("stamm", st)
        else:
            out[s] = (None, None)
    return out


def staerke(team):
    return sum(punkte(m, team) for _, m in aufstellung(team).values() if m)


def likes_total(team):
    return sum(m["likes"] for _, m in aufstellung(team).values() if m)


def _round_robin(ids):
    ids = list(ids)
    if len(ids) % 2:
        ids.append(None)
    n = len(ids)
    runden = []
    for _ in range(n - 1):
        paare = [(ids[i], ids[n - 1 - i]) for i in range(n // 2)]
        runden.append([p for p in paare if None not in p])
        ids = [ids[0]] + [ids[-1]] + ids[1:-1]
    return runden


def _tabelle(gruppe_ids, spiele, teams):
    tab = {i: {"team": i, "sp": 0, "s": 0, "u": 0, "n": 0, "tore": 0, "gegen": 0, "pkt": 0} for i in gruppe_ids}
    for sp in spiele:
        h, a = sp["heim"], sp["gast"]
        gh, ga = sp["tore"]
        for x, gx, gy in ((h, gh, ga), (a, ga, gh)):
            r = tab[x]
            r["sp"] += 1
            r["tore"] += gx
            r["gegen"] += gy
            if gx > gy:
                r["s"] += 1
                r["pkt"] += 3
            elif gx == gy:
                r["u"] += 1
                r["pkt"] += 1
            else:
                r["n"] += 1
    zeilen = list(tab.values())
    zeilen.sort(key=lambda r: (-r["pkt"], -(r["tore"] - r["gegen"]), -r["tore"], -team_fans(teams[r["team"]]), teams[r["team"]]["erstellt"]))
    return zeilen


def _ko_sieger(a, b, teams, st):
    ga, gb = ergebnis(st[a], st[b])
    penalty = None
    if ga > gb:
        sieger = a
    elif gb > ga:
        sieger = b
    else:
        ka = (likes_total(teams[a]), team_fans(teams[a]))
        kb = (likes_total(teams[b]), team_fans(teams[b]))
        if ka != kb:
            sieger = a if ka > kb else b
        else:
            sieger = a if teams[a]["erstellt"] <= teams[b]["erstellt"] else b
        penalty = sieger
    return {"heim": a, "gast": b, "tore": [ga, gb], "sieger": sieger, "penalty": penalty}


def _rundenname(spiele):
    return {1: "Final", 2: "Semi-finals", 4: "Quarter-finals", 8: "Round of 16"}.get(spiele, f"Round of {spiele * 2}")


def turnier_berechnen(teams_dict, seed):
    """teams_dict: id -> team (nur komplette Teams). Gibt das Turnier zurück."""
    ids = sorted(teams_dict, key=lambda i: teams_dict[i]["erstellt"])
    st = {i: staerke(teams_dict[i]) for i in ids}
    turnier = {"staerken": st, "gruppen": [], "playoffs": [], "platz3": None, "top3": [], "meister": None}
    n = len(ids)
    if n < 2:
        return turnier
    rng = random.Random(seed)
    rng.shuffle(ids)

    if n == 2:
        fin = _ko_sieger(ids[0], ids[1], teams_dict, st)
        turnier["playoffs"] = [{"name": "Final", "spiele": [fin]}]
        verlierer = ids[1] if fin["sieger"] == ids[0] else ids[0]
        turnier["top3"] = [fin["sieger"], verlierer]
        turnier["meister"] = fin["sieger"]
        return turnier

    g = 1 if n <= 5 else math.ceil(n / 4)
    gruppen = [ids[i::g] for i in range(g)]
    qualifiziert_sieger, qualifiziert_zweite = [], []
    for gi, gids in enumerate(gruppen):
        spiele = []
        for runde in _round_robin(gids):
            for h, a in runde:
                spiele.append({"heim": h, "gast": a, "tore": list(ergebnis(st[h], st[a]))})
        tab = _tabelle(gids, spiele, teams_dict)
        turnier["gruppen"].append({"name": "Group " + "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[gi], "teams": gids, "spiele": spiele, "tabelle": tab})
        qualifiziert_sieger.append(tab[0])
        qualifiziert_zweite.append(tab[1])

    def rang(r):
        return (-r["pkt"], -(r["tore"] - r["gegen"]), -r["tore"], -team_fans(teams_dict[r["team"]]))

    if g == 1:
        tab = turnier["gruppen"][0]["tabelle"]
        fin = _ko_sieger(tab[0]["team"], tab[1]["team"], teams_dict, st)
        turnier["playoffs"] = [{"name": "Final", "spiele": [fin]}]
        verlierer = tab[1]["team"] if fin["sieger"] == tab[0]["team"] else tab[0]["team"]
        turnier["top3"] = [fin["sieger"], verlierer, tab[2]["team"]]
        turnier["meister"] = fin["sieger"]
        return turnier

    setzliste = [r["team"] for r in sorted(qualifiziert_sieger, key=rang)] + [r["team"] for r in sorted(qualifiziert_zweite, key=rang)]
    p = 1
    while p < len(setzliste):
        p *= 2
    setz = setzliste + [None] * (p - len(setzliste))
    # Standard-Klammer: 1 gegen p, 2 gegen p-1 ...
    reihenfolge = [1]
    while len(reihenfolge) < p:
        m = len(reihenfolge) * 2
        reihenfolge = [x for r in reihenfolge for x in (r, m + 1 - r)]
    feld = [setz[i - 1] for i in reihenfolge]

    halbfinal_verlierer = []
    while len(feld) > 1:
        spiele, weiter = [], []
        for i in range(0, len(feld), 2):
            a, b = feld[i], feld[i + 1]
            if a is None or b is None:
                weiter.append(a if b is None else b)
                spiele.append({"heim": a or b, "gast": None, "freilos": True, "sieger": a or b})
                continue
            sp = _ko_sieger(a, b, teams_dict, st)
            spiele.append(sp)
            weiter.append(sp["sieger"])
            if len(feld) == 4:
                halbfinal_verlierer.append(b if sp["sieger"] == a else a)
        turnier["playoffs"].append({"name": _rundenname(len(feld) // 2), "spiele": spiele})
        feld = weiter

    fin = turnier["playoffs"][-1]["spiele"][0]
    meister = fin["sieger"]
    zweiter = fin["gast"] if meister == fin["heim"] else fin["heim"]
    dritter = None
    if len(halbfinal_verlierer) == 2:
        sp3 = _ko_sieger(halbfinal_verlierer[0], halbfinal_verlierer[1], teams_dict, st)
        turnier["platz3"] = sp3
        dritter = sp3["sieger"]
    elif len(halbfinal_verlierer) == 1:
        dritter = halbfinal_verlierer[0]
    turnier["meister"] = meister
    turnier["top3"] = [x for x in (meister, zweiter, dritter) if x]
    return turnier


# --- Saisonwechsel ----------------------------------------------------------
def saison_abschliessen(state):
    s = state["saison"]
    t = state["turnier"]
    top3 = (t or {}).get("top3", [])
    if s:
        state["archiv"].append({
            "nr": s["nr"],
            "ende": s["ende"],
            "teams": len([x for x in aktive_teams(state) if ist_komplett(x)]),
            "top3": [state["teams"][i]["name"] for i in top3 if i in state["teams"]],
            "meister": state["teams"][t["meister"]]["name"] if t and t.get("meister") in state["teams"] else None,
        })
    neue_teams = {}
    for i in top3:
        team = state["teams"].get(i)
        if team:
            team["behalten"] = team.get("behalten", 0) + 1
            neue_teams[i] = team
    state["teams"] = neue_teams
    state["turnier"] = None
    state["shoutout"] = False
    state["saison"] = None
