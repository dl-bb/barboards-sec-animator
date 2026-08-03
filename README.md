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
separately, so all 20 types are available for all 16 schools against any opponent.

**20 event types**

| Group | Types |
|---|---|
| Scoring | touchdown · two-point conversion · safety |
| Kicking | field goal 50+ · walk-off field goal |
| Return touchdowns | pick six · scoop and score · kick return TD · blocked kick returned |
| Turnovers | interception · fumble lost · turnover on downs |
| Big plays | explosive play 40+ · fourth-down conversion · fake punt |
| States & stoppages | red zone · two-minute warning · goal-line stand · review overturned |
| Ritual | chant / call track |

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

### Parameters

| Param | Meaning |
|---|---|
| `tv` | 1-based output index. Omit for the control room. |
| `event` | Event **type**, e.g. `td`, `pick6`, `chant` |
| `team` | School, e.g. `TEX`. Independent of the type. |
| `opp` | Opponent. Defaults to the school's rival. |
| `layout` | Layout id, e.g. `row4` |
| `gap` | Bezel gap in screen widths. `0` (default) butts panels pixel to pixel. **Must match on every output in a wall** — it is canvas geometry, not decoration. |
| `t0` | Epoch override in ms. Same value everywhere = same phase. |
| `rest` | Ms of lockup between loops. Default 2500. |
| `skew` | Per-device offset in ms; positive runs ahead. |
| `bezel` | `0` to drop the letterbox guides. |
| `diag` | `1` for the clock overlay (or press `i` on any output). |

Params work as a query string **or** a hash. Changing the hash on a running screen swaps
the cue with no reload and no flash.

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
