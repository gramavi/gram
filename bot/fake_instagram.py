"""Nachbau der Instagram API im Speicher – für Tests und die Demo-Woche."""
from datetime import timezone


def ig_zeit(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+0000")


class FakeAPI:
    def __init__(self, eigener_name):
        self.eigener_name = eigener_name
        self.now = None
        self._n = 1000
        self.media = []
        self.c = {}
        self.versteckt = set()
        self.gesendet = []

    def _id(self):
        self._n += 1
        return str(self._n)

    # Simulation
    def post(self, caption, ts):
        m = {"id": self._id(), "caption": caption, "timestamp": ig_zeit(ts), "permalink": None}
        self.media.append(m)
        return m

    def kommentieren(self, media_id, user, text, ts, likes=0, parent=None):
        cid = self._id()
        self.c[cid] = {"id": cid, "media": media_id, "parent": parent, "username": user, "text": text,
                       "timestamp": ig_zeit(ts), "like_count": likes, "geloescht": False}
        return cid

    def antworten_auf(self, parent, user, text, ts, likes=0):
        return self.kommentieren(self.c[parent]["media"], user, text, ts, likes, parent)

    def liken(self, cid, n):
        self.c[cid]["like_count"] = n

    def loeschen(self, cid):
        self.c[cid]["geloescht"] = True

    @staticmethod
    def _aus(c):
        return {k: c[k] for k in ("id", "text", "timestamp", "username", "like_count")}

    # API
    def medien(self):
        return sorted(self.media, key=lambda m: m["timestamp"], reverse=True)

    def kommentare(self, media_id):
        return [self._aus(c) for c in self.c.values() if c["media"] == media_id and not c["parent"] and not c["geloescht"]]

    def antworten(self, comment_id):
        return [self._aus(c) for c in self.c.values() if c["parent"] == comment_id and not c["geloescht"]]

    def kommentar(self, comment_id):
        c = self.c.get(comment_id)
        return None if not c or c["geloescht"] else self._aus(c)

    def antworten_senden(self, comment_id, text):
        self.gesendet.append(("antwort", comment_id, text))
        self.antworten_auf(comment_id, self.eigener_name, text, self.now)

    def ausblenden(self, comment_id):
        self.gesendet.append(("ausblenden", comment_id, None))
        self.versteckt.add(comment_id)

    def media_kommentar(self, media_id, text):
        self.gesendet.append(("media", media_id, text))
        self.kommentieren(media_id, self.eigener_name, text, self.now)
