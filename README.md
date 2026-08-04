# BarBoards — SEC push-event animator

A themed animator for 50 example [Sportradar NCAAFB push events](https://developer.sportradar.com/football/reference/ncaafb-push-events),
coded to the colours, venues and chants of the 16 SEC schools, with a TV layout chooser
and one addressable URL per output.

Single file, no build step, no dependencies beyond Google Fonts (Anton + IBM Plex).

## The files

| File | What it is |
|---|---|
| `sec-push-animator.html` | The animator. Control room by default; single output with `?tv=N`. |
| `ncaafb-saturday-floor_2.html` | The earlier floor prototype — 3D room sim, 16-stream matrix, event ladder, controllers. |
| `barboards-spec.md` | The experience-system specification the animator is built against. |
| `index.html` | Redirect to the animator, so the bare host URL works. |

## Two independent axes

A push event has two axes: **what happened**, and **who it happened to**. They are selected
separately, so all 35 cues are available for all 16 schools against any opponent.

**35 cues**

| Group | Types |
|---|---|
| Custom message | **your own copy, on the touchdown animation** |
| Scoring | touchdown · two-point conversion · safety |
| Kicking | field goal 50+ · walk-off field goal |
| Return touchdowns | pick six · scoop and score · kick return TD · blocked kick returned |
| Turnovers | interception · fumble lost · turnover on downs |
| Big plays | explosive play 40+ · fourth-down conversion · fake punt |
| States & stoppages | red zone · two-minute warning · goal-line stand · review overturned |
| Ritual | chant / call track |
| House cues · no push event | the wave · decibel meter · kickoff countdown · rally clap · phones up · spotlight sweep · ambient rail |
| Patron · interactive | Color Wars |
| Broadcast furniture | **BarBoards Sports open** · BarBoards Saturday open · score bug · lower third · replay wipe |
| Benchmark | stadium flyover · stadium flyover 3D |

## BarBoards Sports — the network open

A 12-second show open in the big-network idiom: cold field, a streak tears across, search
lights rake off the horizon, metal parts fly in and seat, and a chromed wordmark lands on the
downbeat with SPORTS wiping out of the rule beneath it. It ends on the school's colour, so
the same open serves sixteen rooms.

It is an **original mark in that genre**, not a redraw of anyone's logo — the language of the
form is the interesting part and the only part worth building.

The technical problem is chrome. There is no gradient-filled text primitive here and no way
to clip a gradient to a glyph, so metal is built the way it was before shaders: a dark body
extruded back for mass, a shadow dropped low, a bright face, a highlight lifted high. Four
passes of flat type read as one bevelled solid. Two things that took a rebuild to get right:

- **The offsets have to be tiny.** A glyph shifted far enough to notice is a ghost, not an
  edge — a few percent of cap height and the eye integrates the passes into one object.
- **No team colour in the letterforms.** The first cut tinted the face with the school primary
  and the metal went straight to beige plastic. Chrome is neutral; it takes its colour from
  what it reflects. The accent lives in the ground and the plates instead.

The specular rake had the same lesson in reverse: drawn as a translucent white band across
the frame it read as a solid grey bar laid *on* the picture, because over a dark ground
translucent white **is** grey. So the band is narrow and faint, and the actual brightening
happens on the letterforms — the word is redrawn in white with a Gaussian peak as the light
crosses it.

Type on the accent plate takes `depth 0`: the bevel is lit for a dark ground, and against a
bright plate the extrude stops reading as depth and starts reading as a badly registered
second copy. On a plate, the plate is the contrast.

## Custom message

The **Custom message** cue is the Texas touchdown animation with the words swapped out. It
keeps the whole spine — the run across the wall, the landing, the 384 ms flash, the school's
own payoff move, the lockup — and takes three lines from you:

| Line | Default | Where it goes |
|---|---|---|
| 1 | `TOUCHDOWN` | runs the length of the wall |
| 2 | the school (`TEXAS`) | lands, and holds the lockup |
| 3 | the venue | the small line under the lockup |

That is the point of building it on the touchdown rather than as a new look: the room already
knows what that animation means, so `LAST CALL / KITCHEN / CLOSES AT ELEVEN` borrows the
recognition. Leave a line blank and it falls back, so with nothing typed it is a plain
touchdown.

Copy is measured before it is placed and scaled to fit, so any length works in any of the
twelve layouts. Line one holds centred instead of scrolling when it is too long to cross the
wall in one pass. The text travels over the link with the cue, so every output switches to
the same words on the same tick.

**16 schools**, each supplying its colours, venue, touchdown call, chant beat table and
payoff move. The opponent defaults to the in-conference rivalry and can be overridden.

Every combination carries a realistic push-event payload — `event_category`, `event_type`,
`play.type`, and the fields that actually distinguish the event: `defense.int_touchdown`,
`fumble.opp_rec_td`, `return.category`, `block.category`, `details.safety`,
`play.official=false` → `review.reversed`, `game.expected_latency`.

Player names in descriptions are **synthetic** and deterministic per school — the payload
reads like the feed without attributing a play to a real player.

## Theming

Each school gets its own **payoff move**, not a recolour. Texas is burnt orange racing out
from the centre to both corners; Alabama is a tide sweep with foam on the leading edge;
Tennessee's checkerboard fills on the diagonal; Mississippi State rings cowbell shock
rings; Florida's jaws close three times; Georgia's hedges grow in from both edges before
red floods between them; Arkansas escalates a three-beat hog call; Texas A&M's 12th Man
rises as a standing wave; Vanderbilt drops an anchor.

## Layouts

Twelve arrangements. The cue changes **shape**, not just scale:

| Mode | Layouts | What the cue does |
|---|---|---|
| `scroll` | pair, row3, row4, row6, rail of 8 | The word runs the full arrangement as one object, continuing behind every bezel |
| `grid` | quad 2×2, jumbotron 3×2, block 4×2 | Travel gives way to scale; the payoff floods radially |
| `split` | facing walls 4+4, reference room 14 | The word is thrown, not travelled — left wall calls, right wall answers |
| `stack` | column of 3 | Travel runs top to bottom |
| `single` | single screen | Scaled in place |

## Permanent TV URLs, driven live from the control panel

Each output's URL carries **only which screen it is** and which room to listen to. Set it
once per television and never touch it again:

```
…/?tv=1&room=<code>
…/?tv=2&room=<code>
…/?tv=3&room=<code>
```

The control panel then chooses the event, school, opponent, layout and gap, and every
output follows.

### Why latency doesn't matter

The command channel carries *which cue*, never timing. Two mechanisms keep it honest:

1. **The frame comes from the clock**, so an output that hears late joins the cue already
   in progress at exactly the right frame — no drift, nothing to catch up. Measured: an
   output that switched 762 ms late and one that switched 12 ms late both satisfied
   `ms = (now − epoch) mod period` exactly.
2. **The switch is scheduled, not immediate.** Every command carries `at`, a wall-clock
   instant ~700 ms out. Every output holding the command flips on that tick, so a slow
   channel produces a *late* transition rather than a *ragged* one. All outputs are handed
   an identical `at`; a foregrounded screen hits it within ~12 ms.

That second point is why the transport choice barely matters. It is also why the switch is
driven by a timer rather than the render loop — `requestAnimationFrame` does not fire in a
hidden or throttled tab, so a cue scheduled from the frame loop would never arrive on a
backgrounded output.

### Transport

Selected by URL scheme, so moving between them is a one-URL change:

| Scheme | Transport | Setup |
|---|---|---|
| `wss://` | MQTT over WebSocket (default: HiveMQ public broker) | none |
| `https://` | The Cloudflare Worker in `worker/` | `wrangler deploy` |

The default is a **public broker**, which needs no account and nothing deployed. The room
code is the only thing separating your wall from anyone else on that broker, so the control
panel generates a random one. There is no uptime guarantee. For anything beyond a
prototype, deploy `worker/` and paste its https URL as the broker — same interface, private,
strongly consistent, with a websocket for push and a 1 Hz poll underneath guaranteeing
delivery.

The MQTT state topic is published **retained**, so a television powered on hours later
receives the current cue the instant it subscribes.

If no room is configured the file falls back to carrying the full selection in each URL,
exactly as it did before, and still works with no network at all.

## One URL per output, and no sync problem

Every frame is a pure function of `u`, and `u` comes from `Date.now()` — not from a start
message, a socket, or any page state:

```
u = ((Date.now() + skew - epoch) mod (duration + rest)) / duration
```

So there is nothing to synchronise. A device joining ten minutes late lands on the correct
frame immediately, and a device that reloads never falls out of step.

```
…/sec-push-animator.html?tv=1&event=td&team=TEX&layout=row4
…/sec-push-animator.html?tv=2&event=td&team=TEX&layout=row4
…/sec-push-animator.html?tv=3&event=td&team=TEX&layout=row4
…/sec-push-animator.html?tv=4&event=td&team=TEX&layout=row4
```

Each output letterboxes itself to 16:9 and renders its own window into the shared canvas,
so panels of different sizes still frame identically — verified to within 1.1e-16 across
all 156 cells in all 12 layouts.

### The one thing that can desync it: the clock

`u` is a pure function of `Date.now()`, which is the device's **own OS clock**. That is the
whole design and it is sound — right up until two devices disagree about what time it is.
NTP drift of 50–200 ms is ordinary on edge hardware, and it presents exactly as *one screen
running slightly ahead of another*, with no other symptom.

So the room agrees a clock rather than trusting each device's. One participant is the
reference; every other measures its offset with the NTP exchange over the same MQTT link
that already carries cues:

```
t1  sent           offset = t2 − (t1 + t3)/2
t2  at reference   rtt    = t3 − t1
t3  received
```

That form **cancels** transit rather than including it. Three details make it exact:

- **Keep the lowest-RTT sample** of a sliding window. A round trip slower than the floor was
  slower in one direction more than the other, and that asymmetry *is* the error — so the
  fastest exchange observed is also the most trustworthy. Averaging would mix the good
  samples back in with the bad.
- **Age samples out, and detect steps.** A lucky low-RTT sample would otherwise pin the
  estimate forever, so a device whose clock was later corrected would never converge. One
  wild reading is noise; two that agree with each other are the clock moving, and the window
  is cleared.
- **Corrections slew, they never jump.** A step would be a visible skip. The applied offset
  moves at 2% of real time — invisible — and converges in seconds. Only a first fix or a
  gross break (>350 ms) snaps.

**The outputs outrank the control room.** Rank is `tv1 < tv2 < … < control`, and the lowest
rank heard from in 12 s is the reference. This is deliberate and looks backwards: the panel
is a laptop that gets minimised, and a minimised tab has its timers throttled until the
broker drops it. The screens run fullscreen for twelve hours, so **the screens keep the time
and the panel follows the wall.**

Scheduled cue switches (`at`) use the agreed clock too, so skew no longer makes transitions
ragged either.

Measured on a **public** broker with a 268 ms round trip: outputs agree to **±1 ms**, and a
screen acquires in **~340 ms** after a reload. `?sync=0` disables it.

### Testing it on real devices

Press **Sync test** in the control room. It probes every output directly over the wire with
the same NTP exchange and prints a table — per-output offset, RTT, sample count, and the
spread across the wall. This is a *measurement*, not each screen reporting that it feels
fine.

Rough reading of the spread: under 10 ms is in step, under 40 ms is below what people
notice, above that is visible and worth chasing.

### Running the screens remotely

The outputs are on poles and in ceilings, so these are driven from the panel. They live in
the **Wall link** panel — first section of the right-hand column, under **The screens** —
next to the link status and the output dots, because an operator reaching for "reload the
screens" is already looking at the screens.

| Control | What it does |
|---|---|
| **Reload TVs** | Reloads every output on a shared instant. Shift-click for a cache-busting reload that a stale cache cannot answer. |
| **Ident** | Flashes each screen with its own output number — for mapping physical positions to `tv=` indices. |
| **Sync test** | Probes every output and reports the real spread. |
| **Device report** | Asks each screen to profile *itself* and send the report back — GPU, live frame times, browser floor, thermal and clock drift, with a verdict. |

### Making it flawless on a Jetson Orin

Frame-rate advice is worthless without knowing *which* failure you have, and on a Jetson
there are five, with five different fixes and no overlap between them. **Device report**
separates them from the frame-gap series and names the remedy, instead of handing you a
checklist to guess with:

| Signature | What it means | The fix |
|---|---|---|
| Renderer says SwiftShader / llvmpipe | Software rasterisation | `--use-gl=egl --ignore-gpu-blocklist --enable-gpu-rasterization`; confirm `chrome://gpu` says Canvas: Hardware accelerated |
| An **empty** rAF loop already drops | Compositor or display path, not the app | Run Chromium fullscreen with `--ozone-platform=drm` so it drives KMS directly, or drop the compositing WM |
| Gaps on exact **multiples** of the refresh interval | GPU can't finish in budget — whole flips missed, not jitter | `?scale=0.8` renders below native and lets the compositor upscale; then `?fx=1` |
| Run gets **worse** end to end | Thermal throttle | `tegrastats` — watch GPU clock fall and thermal zones climb. A fanless box behind a TV will throttle and no software change fixes it |
| Run gets **better** end to end | DVFS ramp — clocks were still climbing | `sudo nvpmodel -m 0` then `sudo jetson_clocks` |

That last one is the Jetson **default**, it looks exactly like jank at the start of every
cue, and it is one command to fix — so check it first:

```bash
sudo nvpmodel -m 0 && sudo jetson_clocks
```

EMC matters as much as the GPU clock here, because this is a fill-rate load rather than a
shader load, and `jetson_clocks` locks all three.

The report is deliberately run **on the screen**, not on the panel: a desktop's frame times
say nothing about an Orin, and the screens are exactly the machines nobody can reach. It also
refuses to diagnose a screen it could not measure — a hidden or throttled page presents no
frames and therefore drops none, which would otherwise read as a perfect result.

Every one of these is **visible on a webcam from the observation station**, because a whole
screen changing colour carries further than any text:

| Colour | Meaning |
|---|---|
| **Red** — RELOADING | the order landed on this screen |
| **Green** — READY + build number | it came back, and on which build |
| **Blue** — the output number | identifying itself |
| **Purple** — ±ms | its display-lag trim changed |

Reload commands are **never retained**, because a retained reload is a boot loop that
survives every restart and can only be cleared by publishing over it — from a wall that is
busy rebooting. A stale-`at` guard discards any command replayed more than 60 s late.

### Self-update — and the trap it exists to avoid

Remote reload has a bootstrap problem that only bites once, and bites hard: **a build can
only obey the reload command if it already has the reload command.** A screen running an
older build cannot be told to fetch the build that would let it be told. On hardware nobody
can physically reach, that is a trap with no exit — the fix ships to the server and stays
there.

So outputs check what the server is serving and reload themselves when it differs. From
v1.0027 onward, every future build reaches the wall on its own.

This is a page that reloads itself on unreachable hardware, so the failure mode to design
against is not a missed update, it is a **boot loop**. Three guards:

- it reloads *only* when the served version differs from the running one, so the steady state
  is silent (verified: a full check cycle passes with no reload and nothing written);
- a target that fails to take hold three times is abandoned permanently — this covers the
  nasty case where a cache serves the new file to `fetch()` and the old file to navigation,
  which would otherwise cycle forever;
- anything unexpected — failed fetch, captive portal, error page, a response with no
  `VERSION` in it — does nothing at all.

Screens land on a shared 30-second mark so the wall turns over together, the reload is
cache-busted so a stale cache cannot answer it, and the badge goes **amber — UPDATING**
with both version numbers, then green with the new one. First check is staggered 20–80 s so
sixteen screens don't hit the host at once, then every 10 minutes. `?update=0` disables it.

The control room shows the build each screen reports and flags a **MIXED FLEET** in red when
they disagree — a wall running two builds is the thing most likely to look wrong and least
likely to be suspected. Screens older than v1.0027 report no version at all, which is itself
the answer: they cannot be reloaded remotely and need a restart by some other means.

### Clock sync vs. display lag — two different faults

Once the clocks agree, anything still visibly off is **not** a clock problem: it is the
display pipeline. Mixed hardware makes this likely — an Orin and a QCS6490 do not composite
in the same number of milliseconds, and a television with motion processing enabled can add
40–100 ms on its own.

That is what `skew` is for, and the two-step diagnosis is:

1. Run **Sync test**. If the spread is small, the clocks are fine.
2. Whatever difference remains by eye is pipeline latency. Trim it per device with `skew`
   (positive runs that screen ahead). The value **persists on the device** and survives a
   reload, so it only has to be dialled in once per panel.

### What this actually buys you over the internet

The estimator was simulated against a realistic public-broker path — a hard delay floor plus
one-sided, heavy-tailed queueing, which is the real shape of internet delay, since a packet
can be delayed but never hurried. Median and 95th-percentile error, in ms:

| Path | 10-sample window | 64-sample window |
|---|---|---|
| mild queueing | 2.4 / 9 | **0.7 / 3** |
| congested | 6.3 / 23 | **2.1 / 7** |
| 30 ms asymmetric floors | 14.9 / 22 | 15.0 / 18 |

Two things fall out of that, and both are shipped:

- **Window size is worth ~3×**, so the window is 64 samples over a 10-minute horizon rather
  than 10 over 90 seconds. Accuracy keeps improving for about five minutes after a screen
  starts, then holds.
- **Averaging the window is a trap.** It looks better under symmetric jitter and collapses to
  40 ms median / 156 ms p95 once delay is one-sided, because a mean has no defence against a
  tail that only points one way. Hence lowest-RTT, like NTP. This was measured before it was
  chosen.

**The one thing no estimator can fix is a path that is asymmetric in a sustained way.** A
route whose uplink is consistently 60 ms slower than its downlink produces a 30 ms bias that
is mathematically indistinguishable from a clock offset — more samples do not help, and
neither does a better filter. Two screens with *opposite* asymmetry can therefore sit ~130 ms
apart with the clock layer working perfectly.

If your screens are on the same site and route, their asymmetry is similar and largely
cancels in the relative skew, which is what you actually see. If they are genuinely on
different networks, this is the floor, and it is why the next section matters.

### Getting past that floor

The browser layer needs no infrastructure and self-corrects, which is why it is the default,
and over the public broker it measured **±1 ms** in practice. But the floor above is real. On
dedicated hardware you can remove it:

- **Run a broker on the same LAN** (Mosquitto is the obvious choice) instead of the public
  HiveMQ default. Round trip drops from ~270 ms to ~1–3 ms, the estimate tightens with it,
  and the wall stops depending on the internet. Point every device at it with `?link=`.
- **Run `chrony` on the devices themselves**, with one host on the LAN as the server. This
  fixes the underlying OS clocks rather than compensating for them, and gets well under a
  millisecond on wired Ethernet. The browser layer then converges to ~0 and simply confirms
  it.
- **PTP (IEEE 1588)** if the switches support it. Orin's Ethernet MAC does hardware
  timestamping; this is the sub-microsecond answer if you ever need it.

Do the broker first — it is one URL and it improves the measurement, the latency and the
privacy at once.

### Parameters

| Param | Meaning |
|---|---|
| `tv` | 1-based output index. Omit for the control room. |
| `event` | Event **type**, e.g. `td`, `pick6`, `chant` |
| `team` | School, e.g. `TEX`. Independent of the type. |
| `opp` | Opponent. Defaults to the school's rival. |
| `t1` `t2` `t3` | The three lines of the **Custom message** cue. Blank falls back to `TOUCHDOWN`, the school and the venue. Upper-cased, capped at 22/18/40 characters. |
| `layout` | Layout id, e.g. `row4` |
| `gap` | Bezel gap in screen widths. `0` (default) butts panels pixel to pixel. **Must match on every output in a wall** — it is canvas geometry, not decoration. |
| `t0` | Epoch override in ms. Same value everywhere = same phase. |
| `rest` | Ms of lockup between loops. Default 2500. |
| `skew` | Per-device **display-lag** trim in ms; positive runs that screen ahead. Not a clock fix — see above. Settable from the panel and persisted on the device. |
| `sync` | `0` disables clock discipline and falls back to the raw OS clock. |
| `update` | `0` disables self-update. Outputs otherwise reload themselves when the server serves a different build. |
| `updatems` | Self-update check interval, default 600000 (10 min), minimum 60000. |
| `bezel` | `0` to drop the letterbox guides. |
| `diag` | `1` for the clock overlay (or press `i` on any output). |

Params work as a query string **or** a hash. Changing the hash on a running screen swaps
the cue with no reload and no flash.

## Rendering

Target hardware is a QCS6490 driving two 1080p60 outputs, so the render path is
immediate-mode rather than retained.

It began as a DOM painter — up to 131 absolutely positioned elements per screen,
every one restyled each frame, paying style-recalc → layout → paint → composite on
all of them. Frame *construction* in JS measures 11 µs, so the DOM was the entire cost.

Two changes carry almost all of the win:

**Culling.** Every output used to rasterise the *whole wall* and crop it with
`overflow:hidden` — 4× the pixels on a row of four, 8× on a rail of eight, **26.9×**
on the reference room. Driving two 1080p60 surfaces that way is ~1 Gpx/s of composite
to show 249 Mpx/s of picture. The context is now translated to the output's own window
and any layer whose bounding box misses it is rejected before a pixel is touched. On
`room14` that leaves **6 of 101** layers to draw.

**Immediate mode.** One opaque canvas per output, the layer array drawn straight into
it. The layer array already *was* a display list. No nodes, no style invalidation, and
the frame flips as a single surface so elements cannot tear against each other.

The rest is the usual bag of tricks: glyph sizes quantised to buckets so the browser's
glyph atlas is reused instead of being invalidated by a fractional `font-size` every
frame, with the residual taken up by a transform scale; radial gradients cached rather
than rebuilt; vignette and scanlines baked once into an offscreen surface and blitted;
circles under a couple of pixels drawn as rects; a sine lookup table for the particle
cues; `{alpha:false, desynchronized:true}` on the context.

The control-room preview uses the **same renderer** as the outputs — one code path, so
the preview cannot quietly disagree with the wall.

### Measuring it on the device

Numbers from a desktop say nothing about an Adreno 643, so measure on the hardware:

```
…/?tv=1&room=<code>&bench=1
```

That puts a rolling HUD on the output — frame time, rolling average against the
16.67 ms budget, layers drawn vs culled, dropped frames, and the overdraw factor
avoided. `window.__BB.bench(layout, cue, team, w, h, fx, N)` runs a headless sweep on
the device and returns the same figures.

On a desktop at 1920×1080 with FX at max and a forced GPU flush (pessimistic — the
readback stalls the pipeline), the heaviest cues land at 3.8–9.8 ms against a 16.67 ms
budget.

## Running it locally

```bash
python -m http.server 8000
```

Then `http://localhost:8000/sec-push-animator.html?tv=1&event=td-tex&layout=row4`.
Use the machine's LAN address instead of `localhost` to reach real TVs and phones.

## Scripting

`window.__BB` is exposed in both modes — `get()`, `set({event, layout})`, `seek(ms)`,
plus `TEAMS`, `EVENTS`, `LAYOUTS`, `frameAt()` and `payload()`. An output also accepts
`postMessage({type:"bb:seek", t})`, `{type:"bb:play"}` and `{type:"bb:event", id}`.

## Self-audit

The file audits itself on load and logs to the console: duplicate ids, unknown teams or
grammars, chant durations that don't match their beat tables, phase overruns, schools with
no events, and a frame sweep across three layouts asserting finite geometry, in-range
alpha, and — the check that caught a real bug — no opaque fill sitting on top of type that
is meant to be read.

---

Prototype. Figures in `barboards-spec.md` marked *(modelled)* are illustrative and items
marked *(verify)* need confirming before they drive implementation.
