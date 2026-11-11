"""Tests: python3 bot/test_liga.py"""
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import liga  # noqa: E402
import run  # noqa: E402
from fake_instagram import FakeAPI  # noqa: E402

TZ = liga.TZ


def t(*a):
    return datetime(*a, tzinfo=TZ)


def test_fenster():
    f = liga.saison_fenster(t(2026, 11, 11, 15, 0))
    assert f["start"].startswith("2026-11-01T00:00"), f
    assert f["anmeldeschluss"].startswith("2026-11-29T23:59")
    assert f["reveal"]["final"].startswith("2026-11-30T20:00")
    assert f["ende"].startswith("2026-11-30T23:59")
    assert liga.saison_fenster(t(2026, 11, 30, 23, 59, 30))["start"].startswith("2026-12-01T00:00")
    d = liga.saison_fenster(t(2026, 12, 5, 9, 0))
    assert d["anmeldeschluss"].startswith("2026-12-30T23:59") and d["ende"].startswith("2026-12-31T23:59")
    assert liga.saison_fenster(t(2027, 2, 10, 9, 0))["anmeldeschluss"].startswith("2027-02-27T23:59")
    assert liga.saison_fenster(t(2026, 12, 31, 23, 59, 30))["start"].startswith("2027-01-01T00:00")


def test_parser():
    assert liga.parse_antwort("@some.player ZM") == ("pos", "CM")
    assert liga.parse_antwort("  cm ") == ("pos", "CM")
    assert liga.parse_antwort("zm") == ("pos", "CM") and liga.parse_antwort("TW") == ("pos", "GK")
    assert liga.parse_antwort("fan") == ("fan", None)
    assert liga.parse_antwort("Stürmer bitte")[0] == "ungueltig"
    assert liga.parse_team("TEAM FC Bergblitz") == ("ok", "FC Bergblitz")
    assert liga.parse_team("team   Los  Adlers ") == ("ok", "Los Adlers")
    assert liga.parse_team("TEAM ab")[0] == "ungueltig"
    assert liga.parse_team("Hallo zusammen") == (None, None)


def test_werte():
    assert [liga.level(x) for x in (0, 1, 2, 4, 5, 99, 100, 499, 500, 5000)] == [0, 0, 1, 1, 2, 8, 9, 19, 20, 20]
    assert [liga.stufe_fuer_fans(x) for x in (0, 99, 100, 249, 250, 499, 500, 999, 1000, 3000)] == [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]
    assert liga.ergebnis(30, 30) == (1, 1)
    assert liga.ergebnis(40, 30) == (1, 0)
    assert liga.ergebnis(60, 40) == (2, 1)
    assert liga.ergebnis(20, 60) == (0, 2)
    assert liga.ergebnis(100, 40) == (3, 0)
    t = liga.neues_team({"id": "x", "username": "u", "timestamp": "2026-11-10T10:00:00+00:00"}, "Bonus FC", "m")
    t["max_stufe"] = 5
    assert liga.bonus(t) == 5 and liga.punkte({"likes": 500}, t) == 25 and liga.punkte({"likes": 0}, t) == 5


def _team_voll(api, media, name, ts, prefix, likes=lambda: 10):
    tid = api.kommentieren(media, prefix + "_boss", "TEAM " + name, ts, likes=30)
    i = 0
    for pos, n in liga.POSITIONEN.items():
        for _ in range(n):
            i += 1
            api.antworten_auf(tid, f"{prefix}_{i}", f"@{prefix}_boss {pos}", ts + timedelta(minutes=i), likes())
    return tid


def test_ablauf():
    api = FakeAPI("gramleagues")
    state = liga.neuer_zustand()
    mo = t(2026, 11, 9, 10, 0)
    api.now = mo
    media = api.post("Saison 1 #Gramleagues", mo)["id"]
    a = _team_voll(api, media, "FC Bergblitz", mo + timedelta(hours=1), "a")
    api.kommentieren(media, "x", "TEAM fc bergblitz", mo + timedelta(hours=2))  # Name vergeben
    api.now = mo + timedelta(hours=3)
    run.lauf(api, state, api.now, "gramleagues")
    team = state["teams"][a]
    assert liga.ist_komplett(team)
    assert len([x for x in state["teams"].values()]) == 1
    # AW, doppelt, ungültig, Fan
    aw = api.antworten_auf(a, "a_aw", "ST", mo + timedelta(hours=4), likes=99)
    api.antworten_auf(a, "a_aw", "CM", mo + timedelta(hours=4, minutes=1))
    api.antworten_auf(a, "a_aw2", "ST", mo + timedelta(hours=4, minutes=2))
    bad = api.antworten_auf(a, "spam", "Hallo!", mo + timedelta(hours=4, minutes=3))
    api.antworten_auf(a, "fan1", "FAN", mo + timedelta(hours=4, minutes=4))
    api.now = mo + timedelta(hours=5)
    run.lauf(api, state, api.now, "gramleagues")
    assert team["slots"]["ST"]["aw"]["user"] == "a_aw"
    assert state["verarbeitet"][bad] == "ungueltig" and bad in api.versteckt
    assert team["fans_benannt"][0]["user"] == "fan1"
    assert liga.team_fans(team) == 31  # 30 Likes + 1 Fan
    assert liga.aufstellung(team)["ST"][0] == "aw"  # 99 Likes > 10
    # Stammspieler löscht Antwort -> AW rückt nach
    st_id = team["slots"]["ST"]["stamm"]["reply_id"]
    api.loeschen(st_id)
    api.liken(a, 120)  # 120 Likes + 1 Fan -> Stufe 2
    api.now = mo + timedelta(hours=6)
    run.lauf(api, state, api.now, "gramleagues")
    assert team["slots"]["ST"]["stamm"]["reply_id"] == aw and team["slots"]["ST"]["aw"] is None
    assert team["max_stufe"] == 2
    texte = [x[2] for x in api.gesendet if x[0] == "antwort"]
    assert any("already taken" in x for x in texte)
    assert any("already playing for FC Bergblitz" in x for x in texte)
    assert any("grows to level 2: Sports Ground" in x for x in texte)

    # Weitere Teams, Turnier, Saisonwechsel
    ids = [a]
    for k in range(1, 8):
        ids.append(_team_voll(api, media, f"Team {k}", mo + timedelta(days=1, hours=k), f"t{k}", likes=lambda: random.randint(0, 300)))
    spaet = api.kommentieren(media, "spaet", "TEAM Zu Spaet", t(2026, 11, 30, 1, 0))
    api.now = t(2026, 11, 30, 0, 10)
    run.lauf(api, state, api.now, "gramleagues")
    tu = state["turnier"]
    assert tu and tu["meister"] and len(tu["top3"]) == 3 and len(set(tu["top3"])) == 3
    assert spaet not in state["teams"]
    assert len(tu["gruppen"]) == 2
    for minuten in (5, 20, 35, 50):
        api.now = t(2026, 11, 30, 20, minuten)
        run.lauf(api, state, api.now, "gramleagues")
    assert state["shoutout"] and any(x[0] == "media" for x in api.gesendet)
    top3 = list(tu["top3"])
    api.now = t(2026, 12, 1, 9, 0)
    api.post("Saison 2 #gramleagues", t(2026, 12, 1, 0, 5))
    run.lauf(api, state, api.now, "gramleagues")
    assert state["saison"]["nr"] == 2
    assert set(state["teams"]) == set(top3)
    assert state["archiv"][0]["meister"]
    run.export(state, api.now)


def test_turniergroessen():
    for n in range(0, 25):
        teams = {}
        for i in range(n):
            tm = liga.neues_team({"id": f"t{i}", "username": "x", "timestamp": f"2026-11-1{i % 9}T10:00:00+00:00"}, f"Team {i}", "m")
            for k, s in enumerate(liga.SLOTS):
                tm["slots"][s]["stamm"] = {"user": f"u{i}_{k}", "reply_id": f"r{i}_{k}", "ts": "x", "likes": (i * 37 + k * 11) % 600}
            teams[tm["id"]] = tm
        tu = liga.turnier_berechnen(teams, seed=n)
        if n >= 2:
            assert tu["meister"] in teams
            assert len(set(tu["top3"])) == len(tu["top3"]) == min(3, n)
        else:
            assert tu["meister"] is None


if __name__ == "__main__":
    random.seed(1)
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
    print("All tests passed.")
