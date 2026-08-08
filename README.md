# Borough &amp; Bell

**Greater London Focus Chronometer** — a 60/10/40 Pomodoro timer where every two
hours of focused work restores one of London's 33 boroughs to the map. Sixty-six
hours restores the whole capital.

---

## Putting it on GitHub Pages

You do not need to install anything. This is a plain static site — no build step,
no npm, no server code.

### The easy way (drag and drop, ~3 minutes)

1. Go to **https://github.com/new** and create a repository.
   - Name it whatever you like, e.g. `borough-and-bell`.
   - Set it to **Public** (GitHub Pages needs Public on a free account).
   - Do **not** tick "Add a README" — this project already has one.
2. On the empty repository page, click **uploading an existing file**.
3. Unzip `borough-and-bell.zip` on your computer, open the folder, then select
   **everything inside it** and drag it into the browser window.
   - Drag the *contents* — `index.html`, `assets/`, `README.md`, `.nojekyll` —
     not the folder itself. If you drag the folder, your site will end up at
     `/borough-and-bell/index.html` instead of the root and the links will break.
   - GitHub keeps the folder structure inside `assets/`, so it is safe to drag
     the whole `assets` folder in one go.
4. Wait for all files to finish uploading (there are about 60), then click
   **Commit changes**.
5. Go to **Settings → Pages** in your repository.
6. Under **Build and deployment → Source**, choose **Deploy from a branch**.
   Set the branch to **main** and the folder to **/ (root)**. Click **Save**.
7. Wait one to two minutes, then reload the Settings → Pages screen. Your address
   will appear at the top:

   ```
   https://<your-username>.github.io/<repository-name>/
   ```

That is it. Open the link on your phone too — it is fully responsive, and you can
add it to your home screen.

### If you prefer the command line

```bash
unzip borough-and-bell.zip
cd borough-and-bell
git init
git add .
git commit -m "Borough & Bell"
git branch -M main
git remote add origin https://github.com/<your-username>/<repository-name>.git
git push -u origin main
```

Then follow steps 5–7 above to switch Pages on.

### Testing it locally first

Opening `index.html` straight off your disk mostly works, but browsers block some
features on `file://`. Run a tiny local server instead:

```bash
cd borough-and-bell
python3 -m http.server 8000
```

Then open **http://localhost:8000**.

---

## What is in the folder

```
index.html                  the whole interface
.nojekyll                   tells GitHub Pages to serve every file as-is
README.md                   this file
assets/
  css/style.css             all styling
  js/data.js                33 boroughs, 5 regions, map geometry
  js/app.js                 timer engine, map, stats, game logic
  fonts/        (6 files)   Hammersmith One + Karla, self-hosted
  audio/        (5 files)   Westminster bell chimes
  img/          (44 files)  borough photographs from your Footage.zip
  logo.png                  London County Council arms
  favicon.ico
  apple-touch-icon.png
```

Total: about 11 MB, which is comfortably inside GitHub's limits.

**Keep `.nojekyll`.** Without it, GitHub Pages runs the site through Jekyll, which
ignores files and folders beginning with an underscore. It is an empty file and it
will not show in Finder or Explorer unless hidden files are visible — but it is in
the zip, and the drag-and-drop upload will carry it across.

---

## How the game is wired

| | |
|---|---|
| Rhythm | 60 min sitting · 10 min short break · 40 min long break after 4 sittings |
| Borough unlocked | every **2 hours** of focused work |
| Boroughs | **33** (32 boroughs + the City of London) |
| Full campaign | **66 hours** |
| Planning regions | Central (16 h) · East (36 h) · North (42 h) · South (52 h) · West (66 h) |

Eight measures rise as you work — human development, quality of life, healthcare,
safety, education, tourism, population and GDP — each on its own curve, so they do
not all move in lockstep. Safety and tourism improve late; education improves
early. All eight reach *World-Leading* at 66 hours.

Only time spent **running in a sitting** counts. Breaks and paused timers do not.

---

## About the timer keeping time

This was the thing you asked about specifically, so here is what it does.

The timer never counts down by subtracting one from a number. When you press
Start it records the exact wall-clock millisecond the session should end, and
every update simply asks the system clock how much is left. It runs that check on
a **Web Worker** thread as well as the main thread, and re-checks immediately
whenever the tab becomes visible again, the window regains focus, or the page is
restored from the back/forward cache.

The practical result:

- Switching tabs, minimising, or locking your phone does not slow it down.
- Closing the browser entirely and returning later still gives the right answer.
- Time is credited only up to the end of the session, never past it — sleeping
  through a 60-minute sitting banks exactly 60 minutes, not the four hours your
  laptop was shut.
- A backwards system-clock correction cannot double-count time.

Verified by simulation: 14,400 consecutive quarter-second ticks over an hour
drift by 0.0000 minutes.

---

## Your progress, and one warning

Everything is stored in your browser's `localStorage` on that device. There is no
account and nothing is uploaded.

- Progress **does not sync between devices**. Hours built on your laptop will not
  appear on your phone.
- Clearing browser data, or using private/incognito browsing, clears your hours.
- Two tabs open at once is safe — saves are merged so the higher total always
  wins, and a stale tab cannot erase work done in another.

**Settings → Start again** wipes everything deliberately. It asks first.

---

## Keyboard

| Key | |
|---|---|
| `Space` | start / pause |
| `R` | reset the session |
| `S` | skip to the next session |
| `1` `2` `3` | sitting / short break / long break |
| `Esc` | close any panel |

Shortcuts are ignored while you are typing.

---

## Credits and licences

- **Borough photographs** — from the `Footage.zip` you supplied. Resized to
  1280 px and re-encoded as progressive JPEG. Several are from Geograph and
  Wikimedia Commons and carry their own licences; check before republishing.
- **Map** — derived from the Wikimedia SVG of Greater London's administrative
  divisions. Simplified from 308 KB of path data to 61 KB with no visible change
  in outline.
- **Arms** — the London County Council coat of arms you supplied.
- **Borough descriptions** — your `London_Boroughs_Guide.md`, unaltered.
- **Bells** — synthesised from scratch for this project (additive bell partials in
  the Westminster Quarters, E major). No licence attached; they are yours.
- **Fonts** — Hammersmith One and Karla, both SIL Open Font Licence 1.1.
  Hammersmith One is drawn after Edward Johnston's Underground lettering, which
  is why it suits the clock face.
- **Video** — *If—* read by Sir Michael Caine, embedded through
  `youtube-nocookie.com`, so no YouTube tracking cookie is set unless you press
  play.
