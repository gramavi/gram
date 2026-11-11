"""Kleiner Client für die Instagram API (Instagram Login, graph.instagram.com).

Benötigt ein Instagram-Profi-Konto und einen Token mit
instagram_business_basic + instagram_business_manage_comments.
Nur Python-Standardbibliothek.
"""
import json
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://graph.instagram.com/v23.0"
FELDER = "id,text,timestamp,username,like_count"


class ApiFehler(Exception):
    def __init__(self, status, daten):
        super().__init__(f"HTTP {status}: {daten}")
        self.status = status
        self.daten = daten


class InstagramAPI:
    def __init__(self, token, user_id, base=BASE):
        self.token = token
        self.user_id = user_id
        self.base = base

    def _req(self, methode, pfad, params=None):
        params = dict(params or {})
        params["access_token"] = self.token
        if pfad.startswith("http"):
            url = pfad
            daten = None
        else:
            url = f"{self.base}/{pfad.lstrip('/')}"
            daten = None
            if methode == "GET":
                url += "?" + urllib.parse.urlencode(params)
            else:
                daten = urllib.parse.urlencode(params).encode()
        req = urllib.request.Request(url, data=daten, method=methode)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            try:
                inhalt = json.loads(e.read().decode())
            except Exception:
                inhalt = {}
            raise ApiFehler(e.code, inhalt) from None

    def _alle(self, pfad, params):
        antwort = self._req("GET", pfad, params)
        daten = list(antwort.get("data", []))
        weiter = antwort.get("paging", {}).get("next")
        seiten = 0
        while weiter and seiten < 50:
            antwort = self._req("GET", weiter)
            daten.extend(antwort.get("data", []))
            weiter = antwort.get("paging", {}).get("next")
            seiten += 1
        return daten

    # Lesen
    def medien(self):
        return self._req("GET", f"{self.user_id}/media", {"fields": "id,caption,timestamp,permalink", "limit": 25}).get("data", [])

    def kommentare(self, media_id):
        return self._alle(f"{media_id}/comments", {"fields": FELDER, "limit": 50})

    def antworten(self, comment_id):
        return self._alle(f"{comment_id}/replies", {"fields": FELDER, "limit": 50})

    def kommentar(self, comment_id):
        """Gibt den Kommentar zurück oder None, wenn er gelöscht wurde."""
        try:
            return self._req("GET", comment_id, {"fields": FELDER})
        except ApiFehler as e:
            fehler = (e.daten or {}).get("error", {})
            # Code 100 = Objekt existiert nicht (gelöscht). Alles andere (z. B. 190 = Token) weiterwerfen.
            if e.status in (400, 404) and fehler.get("code") == 100:
                return None
            raise

    # Schreiben
    def antworten_senden(self, comment_id, text):
        return self._req("POST", f"{comment_id}/replies", {"message": text})

    def ausblenden(self, comment_id):
        return self._req("POST", comment_id, {"hide": "true"})

    def media_kommentar(self, media_id, text):
        return self._req("POST", f"{media_id}/comments", {"message": text})
