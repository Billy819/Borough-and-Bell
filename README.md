# LAX Mission Control

A daily to-do calendar, played as a game. You are the CEO of Los Angeles World Airports.
Every day you log opens a new real LAX route — 122 days, 122 routes, from a quiet ski hop
to the busiest flights on earth. Log all of them and LAX becomes the number one airport in the world.

Runs entirely in the browser. No build step, no server, no account, no tracking.

---

## Put it online with GitHub Pages

**1. Make a repository**

Go to <https://github.com/new>, give it a name (for example `lax-mission-control`),
choose **Public**, and click **Create repository**.

**2. Upload the files**

On the new repo page click **uploading an existing file**.

Drag in **the contents of this folder** — that means `index.html`, `README.md`, and the
whole `assets` folder. Do **not** drag in a folder that contains them, or `index.html`
will end up one level too deep and the site will not load.

When the upload finishes, click **Commit changes**.

Your repository should look exactly like this:

```
index.html          <-- must be at the top level
README.md
.nojekyll
assets/
  css/style.css
  js/app.js
  js/data.js
  img/...
  audio/...
```

> Tip: if the web uploader struggles with the number of files, upload the `assets`
> folder on its own in a second commit. Both ways work.

**3. Turn on Pages**

In your repository go to **Settings** → **Pages** (left sidebar).

- Under **Source**, choose **Deploy from a branch**
- **Branch**: `main`
- **Folder**: `/ (root)`
- Click **Save**

**4. Wait a minute, then open it**

Your address will be:

```
https://YOUR-USERNAME.github.io/lax-mission-control/
```

The first build takes one to two minutes. Refresh if you get a 404 at first.

---

## Where your progress is saved

Your tasks, notes, points and unlocked routes are saved **on your own device**, in your
browser's storage. Nothing is uploaded anywhere and no one else can see it.

Two things follow from that:

- Progress is **per browser and per device**. Your phone and your laptop keep separate seasons.
- Clearing your browsing data for the site will erase it.

To move a season between devices, or to keep a backup, use
**Settings → Export my season** and then **Import a season** on the other device.

---

## Time blocking

Every task can carry a time block, written in the format **`00h.00m - 00h.00m`**.

There are three ways to set one, and they all end up in the same place:

1. **Tap the time** next to any task on the board. A small panel opens with a *From* and
   *To* picker, plus **+30m**, **+1h** and **+90m** shortcuts so you usually only set the
   start. **Save** commits it, **Clear** removes the block again.
2. **Use the two clock boxes** beside the Add button when you are adding a new task.
3. **Type it inline**: `08.00-09.30 Deep work` in the task box is split automatically into
   a block and a task name.

The inline form is forgiving. All of these work:

```
08.00-09.30 Deep work
8:30-9:15 Gym
9-10 Standup
08h.00m - 09h.30m Deep work
23.30-00.30 Night shift        <- blocks may run past midnight
```

Text that only looks like a time is left alone, so `Read 10 pages`, `Buy 2-3 apples` and
`Call mum 5-6pm` all stay as ordinary tasks.

Once anything on the day has a block:

- Tasks **sort themselves** into time order. Untimed tasks sit at the bottom, in the order
  you added them.
- A **strip above the board** draws your day end to end, with hour markers and the total
  time you have planned. Finished blocks turn green.
- **Overlapping blocks are outlined in gold** on both the strip and the row, so you can see
  where the day is over-committed.

Times are entirely optional. A task with no block still counts for exactly the same points.

You can put times in your template too — see **Editing it yourself** below.

---

## How the scoring works

Points are awarded for the day when you log it:

| Tasks finished | Points |
| --- | --- |
| 50% or more | 4 |
| 75% or more | 8 |
| 100% | 16 |

122 days × 16 = **1,952 points** for a perfect season.

Every logged day opens the next route, whatever score you got. Missing a day costs you
points, never a route — you simply cannot reach #1 until all 122 are logged. Days stay
open, so you can go back and fill one in later.

World rank rises through nine tiers as your points grow. **#1 is reserved**: it unlocks
only when all 122 days are logged.

---

## What is inside

| Tab | What it does |
| --- | --- |
| **Tower** | Your dashboard — rank, points, streak, progress |
| **Schedule** | The calendar and the daily split-flap departure board |
| **Airfield** | The LAX diagram — drag, zoom, tap a terminal |
| **Network** | All 122 routes, sealed until you open them |
| **How to play** | A short guide, with videos |
| **Discover LA** | Things to do in Los Angeles |
| **Settings** | Your name, theme, sound, template, backup, reset |

---

## Editing it yourself

**Your daily template** does not need code — edit it in **Settings**, one task per line.
"Load my template" and "Fill month with template" both use it. Start a line with a time
range to give that task a block every time it is loaded:

```
07.00-07.20 Move for 20 minutes
09.00-10.30 Deep work block - no phone
Read 10 pages
```

The Daily Ops and Executive Turnaround presets ship with times already set. The Gentle Day
preset is deliberately left untimed.

**The routes** live in `assets/js/data.js`, in the `ROUTES` array. Each looks like:

```js
{ c:'Tokyo', r:'Japan', a:'HND', k:'I', al:'ana', t:'TBIT', mi:5487, fn:'NH 175',
  b:'The overnight to Haneda...' }
```

`c` city · `r` region · `a` airport code · `k` D for domestic, I for international ·
`al` airline (must match a file in `assets/img/airlines/`) · `t` terminal ·
`mi` miles · `fn` flight number · `b` the blurb shown when it opens.

**Tasks** are stored as `{ x: 'task text', d: false, s: 480, e: 570 }` — `s` and `e` are the
start and end of the time block in minutes past midnight (480 = 08h.00m), or `null` when the
task has no block.

Keep the array at **122 entries** — one per day of the season. They open in the order listed.

**The season dates** are set by `SEASON` at the bottom of `data.js`.

**Colours and fonts** are CSS variables at the top of `assets/css/style.css`.

---

## Videos

Every video uses `youtube-nocookie.com` and loads **only when you press play**. Until
then it is just a still picture, so nothing is requested from YouTube and no cookies are
set by simply visiting the page.

---

## Sound

The four chimes in `assets/audio/` were generated as plain tones for this project, so
there is nothing to license. Sound can be switched off in Settings.

---

## Credits and notes

This is a personal fan project. It is **not affiliated with, endorsed by, or connected to**
Los Angeles World Airports or Los Angeles International Airport.

Airline names, codes and logos belong to their respective owners and appear here only to
identify real routes. Photographs of LAX and the airport diagram were supplied by the site
owner. Route details are based on real published schedules and are for entertainment.

Fonts are Barlow Condensed, Archivo and JetBrains Mono, loaded from Google Fonts. If you
would rather load nothing from Google, delete the two `<link>` tags in the `<head>` of
`index.html` — the site falls back to your system fonts and still works.
