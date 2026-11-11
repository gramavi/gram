# Gramleagues – the league in the comments

People play on Instagram and watch on a website (GitHub Pages).
A bot (GitHub Actions) reads the comments every 15 minutes, hands out
positions and fan seats, counts likes, runs the monthly tournament and
writes everything to `docs/data/league.json`. The website turns that into
a 3D world: every team has a stadium that grows with its fans.

```
Instagram (comments, likes)
      │  every 15 min
      ▼
GitHub Actions: bot/run.py  ──►  data/state.json   (bot memory)
      │                     └─►  docs/data/league.json
      ▼
GitHub Pages: docs/  (3D stadium: index.html, list view: liste.html)
```

## How to play (for your followers)

| Comment | Where | Effect |
|---|---|---|
| `TEAM Thunder FC` | under the season post | founds a team (name 3–20 characters) |
| `GK` `LB` `RB` `CB` `CM` `LW` `RW` `ST` | reply to a team comment | joins as starter, or as the sub if the starting spot is taken |
| `FAN` | reply to a team comment | named fan with a seat in the stadium |
| ❤️ on your reply | | level 0–20 (level 20 at 500 likes, see below) |
| ❤️ on the team comment | | fans; stadium grows at 100 / 250 / 500 / 1,000 fans |
| stadium level | | every player gets +1 point per stadium level (Backyard Pitch +1 … Mega Arena +5) |

Strength points per player = level + stadium bonus (max 25). Team strength = sum of the 11 players (max 275).

Level thresholds (likes): 1 = 2, 2 = 5, 3 = 10, 4 = 20, 5 = 30, 6 = 45, 7 = 60, 8 = 80, 9 = 100, 10 = 125,
11 = 150, 12 = 180, 13 = 210, 14 = 245, 15 = 280, 16 = 320, 17 = 360, 18 = 405, 19 = 450, 20 = 500.

Match result from the strength difference: 0 = 1:1, 1–10 = 1:0, 11–25 = 2:1, 26–45 = 2:0, 46+ = 3:0.

German codes (TW, LV, RV, IV, ZM, LA, RA) are accepted too.

## Setup (about 30 minutes)

### 1. Repository
1. Create a new **public** repository on GitHub (e.g. `gramleagues`).
2. Upload the whole content of this folder (including `.github/`).

### 2. Turn on the website
Settings › Pages › *Build and deployment*: **Deploy from a branch**, branch `main`, folder **`/docs`**.
After 1–2 minutes the site is live at `https://<your-name>.github.io/<repo>/`.
Until the bot has run once, it shows demo data.

### 3. Prepare Instagram
1. Switch your Instagram account to **Creator** or **Business** in the settings.
2. On <https://developers.facebook.com> create an app with the use case
   **"Instagram API with Instagram Login"**.
3. In the app dashboard under *Instagram › API setup*, add your account and generate a
   **token** (permissions `instagram_business_basic` and `instagram_business_manage_comments`).
   Also note your **Instagram user ID**. For your own account "Standard Access" is enough;
   no App Review needed.

### 4. Add secrets
Settings › Secrets and variables › Actions:

| Type | Name | Value |
|---|---|---|
| Secret | `IG_TOKEN` | the Instagram token |
| Secret | `IG_USER_ID` | the Instagram user ID |
| Variable | `IG_USERNAME` | your Instagram name without @ (so the bot ignores its own replies) |
| Secret (optional) | `GH_PAT` | personal access token with "Secrets: Read and write" – renews the Instagram token automatically |

### 5. Start the bot
Actions › **Gramleagues Bot** › *Run workflow*. After that it runs every 15 minutes on its own.
Tip: make a test post first and check that the replies look right.

## Every month (Zurich time)

1. **1st of the month, 00:00:** sign-up opens. Publish a new post with **`#gramleagues`**
   in the caption (ideally right after midnight). That's the season post; the bot finds it automatically.
2. All month long people found teams, join, become fans and collect likes.
3. **Second-to-last day, 23:59** (e.g. 30 November 23:59): sign-up closes. The bot freezes likes and draws the tournament.
4. **Last day of the month** (e.g. 31 December): the website reveals the group stage at 14:00, the playoffs at 18:00
   and the podium at 20:00. At 20:00 the bot posts a shoutout for the champions under the season post.
5. The top 3 keep their players, likes and fans for the next season.

## Statues for monthly winners

Edit `docs/data/statuen.json` and put the Instagram names (without @) of the winners in `statuen`:

```json
{ "statuen": ["name_one", "name_two", "name_three"] }
```

All statues stand on the plinth around the **biggest stadium** of the league (highest level, then most fans).
Click a statue to see who it is.
Replace the demo names before you go live.

## Folders

| Path | Content |
|---|---|
| `bot/liga.py` | all game rules (positions, subs, levels, fans, stadium, tournament) and bot reply texts |
| `bot/run.py` | one bot run, writes `league.json` |
| `bot/instagram.py` | Instagram API client (standard library only) |
| `bot/test_liga.py` | tests: `python3 bot/test_liga.py` |
| `bot/demo.py` | builds demo data (two simulated seasons) |
| `docs/` | website: `index.html` + `welt.js` (3D), `liste.html` + `app.js` (list view) |
| `docs/vendor/` | three.js 0.160 (MIT licence) |

## Good to know
- The Instagram API only returns the **number** of likes, not who liked.
  That's why like-fans are anonymous; only people who reply `FAN` get a named seat.
- The bot answers at most 40 comments per run; the rest follow 15 minutes later.
- Tournament results are in `league.json` from the night before the last day; the website only shows them at the reveal times.
- Share a link to your own seat: `…/index.html?name=yourname`
