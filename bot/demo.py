"""Builds demo data for the website: two simulated seasons run through the real bot.

    python3 bot/demo.py            -> writes docs/data/league.json (with "demo": true)
"""
import json
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import liga  # noqa: E402
import run  # noqa: E402
from fake_instagram import FakeAPI  # noqa: E402

TZ = liga.TZ
TEAMS = ["Thunder FC", "Alpine Eagles", "Kick Collective", "Rhine Wave", "Storm Front 07", "Peak Climbers",
         "Fog Crows", "Lightning United", "Lake Devils", "Heartbeat FC", "Icebreakers", "Matterhorn Lions",
         "Pixel Kickers", "Foehn Storm"]


def user(rng, gebraucht):
    """Fictitious names with hyphens: Instagram does not allow hyphens, so no real account can match."""
    n = len(gebraucht) + 1
    u = f"demo-user-{n:03d}"
    gebraucht.add(u)
    return u


def likes(rng):
    return int(min(900, rng.lognormvariate(3.9, 1.1)))


def saison(api, state, rng, monat, team_namen, gebraucht, voll=True):
    f = liga.saison_fenster(monat)
    start = liga.parse_zeit(f["start"])
    letzter = liga.parse_zeit(f["ende"])
    media = api.post("New season! Found your team: TEAM Name #gramleagues", start + timedelta(minutes=5))["id"]
    api.now = start + timedelta(minutes=30)
    run.lauf(api, state, api.now, "gramleagues")
    # Bestehende Top-3-Teams: neue Likes
    for team in liga.aktive_teams(state):
        api.liken(team["id"], team["likes"] + rng.randint(40, 200))
        for slot in liga.SLOTS:
            m = team["slots"][slot]["stamm"]
            if m:
                api.liken(m["reply_id"], m["likes"] + rng.randint(5, 80))
    for k, name in enumerate(team_namen):
        ts = start + timedelta(hours=6 + k * 30)
        boss = user(rng, gebraucht)
        tid = api.kommentieren(media, boss, f"TEAM {name}", ts, likes=int(rng.lognormvariate(5.1, 0.95)))
        positionen = [p for p, n in liga.POSITIONEN.items() for _ in range(n)]
        rng.shuffle(positionen)
        fehlend = 0 if voll and k < len(team_namen) - 2 else rng.randint(1, 4)
        positionen = positionen[: 11 - fehlend] + rng.sample(list(liga.POSITIONEN), rng.randint(1, 6))
        for i, pos in enumerate(positionen):
            u = boss if i == 0 else user(rng, gebraucht)
            text = rng.choice([pos, pos.lower(), f" {pos} "])
            api.antworten_auf(tid, u, text, ts + timedelta(minutes=5 + i * 9), likes=likes(rng))
        for i in range(rng.randint(0, 35)):
            api.antworten_auf(tid, user(rng, gebraucht), rng.choice(["FAN", "fan"]), ts + timedelta(hours=2, minutes=i * 4))
        if rng.random() < 0.6:
            api.antworten_auf(tid, user(rng, gebraucht), rng.choice(["striker please", "I'm in!!", "how do I join?", "zm"]), ts + timedelta(hours=1))
        api.now = ts + timedelta(hours=4)
        run.lauf(api, state, api.now, "gramleagues")
    api.now = letzter.replace(hour=0, minute=10)
    for _ in range(12):
        run.lauf(api, state, api.now, "gramleagues")
    api.now = letzter.replace(hour=21, minute=0)
    for _ in range(8):
        run.lauf(api, state, api.now, "gramleagues")
    return api.now


def main():
    rng = random.Random(7)
    random.seed(7)
    api = FakeAPI("gramleagues")
    state = liga.neuer_zustand()
    gebraucht = set()
    saison(api, state, rng, datetime(2026, 9, 10, 12, 0, tzinfo=TZ), TEAMS[:6], gebraucht)
    api.now = datetime(2026, 10, 1, 0, 0, 30, tzinfo=TZ)
    now = saison(api, state, rng, datetime(2026, 10, 10, 12, 0, tzinfo=TZ), TEAMS[6:], gebraucht)
    out = run.export(state, now)
    out["demo"] = True
    ziel = Path(__file__).resolve().parent.parent / "docs" / "data" / "league.json"
    ziel.parent.mkdir(parents=True, exist_ok=True)
    ziel.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    t = state["turnier"]
    print("Teams:", len(out["teams"]), "in tournament:", len(t["staerken"]), "Champion:", state["teams"][t["meister"]]["name"])
    print("Archiv:", state["archiv"])
    print("Bot messages sent:", len(api.gesendet))
    print("Sample:", [x[2] for x in api.gesendet[:6]])


if __name__ == "__main__":
    main()
