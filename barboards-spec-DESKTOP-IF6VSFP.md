# BarBoards — Experience System Specification

**Status:** design spec + working prototypes. Nothing here is production code.
**Purpose:** hand-off document for an implementation agent or engineer.
**Reference build:** NCAAFB Saturday, a 14-screen venue, Red River as the main game.

---

## 0. How to read this document

Sections 1–8 are the **model** — they should hold regardless of implementation language.
Sections 9–12 are the **reference build** — one worked example, fully specified.
Section 13 lists the **prototypes** that already exist and what to port from each.
Section 14 is the **build order** and the open questions.

Anything marked *(modelled)* is an illustrative number produced for the prototype, not a
measurement. Anything marked *(verify)* is an assumption that needs confirming against
contracts, hardware, or the live feed before it drives code.

---

## 1. Product thesis

A sports broadcast does not deliver energy evenly, and a bar does not need it evenly.

Roughly half of any broadcast's wall clock is **not live gameplay** — commercials, stoppages,
studio segments, pregame and halftime. On a muted TV in a bar, that time is worth nothing.
Across a room with 14 tuners pointed at 8 different games, that dead time is *decorrelated*:
at any instant some subset of screens is showing nothing anybody is watching.

**BarBoards assembles that subset into a single addressable canvas and puts something on it.**

Three things follow from that and they are the whole product:

1. **The bar always has a canvas — it is just never the same screens twice.** In the reference
   room the addressable set averages **8.9 of 16 outputs**, sits at 6 or more **73%** of the time,
   and never drops below 3. *(modelled — see §4)*
2. **The canvas is largest exactly when the broadcast is least interesting.** Halftime, a
   sagging third quarter, a fourth quarter that stopped being a contest. The inverse
   correlation is the opportunity.
3. **Peak game tension means minimum interference.** When the game is carrying the room, the
   correct output is nothing. A system that cannot be quiet cannot be trusted with a live room.

### The three canvases and their window economics

This is the single most important idea in the system. The three surfaces have completely
different costs, and that difference determines the whole design.

| Canvas | Needs | Availability |
|---|---|---|
| **Video** | A trusted window ≥ the cue's duration | Scarce, and scarcest exactly when the game is best |
| **Audio** | A window **and** permission to step on the call | Strictly smaller than video |
| **Patron** (phones) | Nothing | Continuous, all day |

Consequence: as a game tightens, the experience must **migrate** from the video canvas to the
patron canvas. In the final two minutes of a one-score game there is often no trusted window at
all, and phones are the only surface still working.

### KPIs the venue buys on

| KPI | Baseline *(modelled)* | With BarBoards *(modelled)* |
|---|---|---|
| Dwell (avg minutes) | 78 | 105 |
| Spend per head | $27.60 | $34.10 |
| Return coupons issued | 0 | 82 |
| Ad revenue (venue rev-share, per room per Saturday) | $0 | $40.70 |

Every cue in the library must be traceable to one of those four numbers. See §12.

---

## 2. System model

### 2.1 Streams

**16 total streams to DJ:**

- **14 DirecTV tuner outputs** — each independently tunable to a broadcast
- **2 always-on BarBoards outputs** — never carry a broadcast; permanently in dead time

The 2 always-on outputs are the **canvas floor**. They are addressable 100% of the time and
cost no window, ever. Every ambient and commerce unit lives there.

### 2.2 Screens, receivers, and the mirroring constraint

**The addressable unit is the receiver, not the screen.** Screens sharing a receiver show the
same frame at the same instant and cannot differ from each other.

Reference room: **14 screens, 8 receivers, 3 walls.**

```
LEFT WALL        BACK WALL (jumbotron, 3x2)        RIGHT WALL
[L1][L2][L3][L4] [J1][J2][J3]                      [R1][R2][R3][R4]
                 [J4][J5][J6]
```

| Receiver | Screens | Count |
|---|---|---|
| D1 | L1 | 1 |
| D2 | L2, J4, J5 | 3 |
| D3 | L3, J1, J2, J3 | 4 |
| D4 | L4 | 1 |
| D5 | R1 | 1 |
| D6 | R2 | 1 |
| D7 | J6, R3 | 2 |
| D8 | R4 | 1 |

**Key architectural move:** when the jumbotron is *reclaimed* onto the BarBoards canvas, D3, D2
and D7 stop feeding those six screens. Every remaining receiver then feeds **exactly one
screen** — giving 8 independently addressable wall screens plus 6 outputs of one sliceable
canvas. Fourteen independently addressable surfaces.

This is why cues like The Hold work: eight receivers, eight independent timings.

### 2.3 The canvas primitive

Wall-wide graphics are one canvas sliced across N outputs. Implementation in the prototypes:
each screen holds an element sized to the **full canvas**, positioned at a negative offset equal
to that screen's position within it, with `overflow:hidden` on the screen. Content continues
"behind" the bezels, which is the correct physical behaviour.

Text that must fit a canvas exactly uses SVG `textLength` + `lengthAdjust="spacingAndGlyphs"` —
deterministic, no measurement pass, no reflow.

### 2.4 Same broadcast = same dead time

**Streams tuned to the same broadcast share one dead-time schedule to the millisecond.** It is
the same feed. Dead-time schedules are generated and stored **per broadcast**, never per stream.

Consequence worth designing around: allocating 4 tuners to the main game is not redundancy, it
is **canvas shaping**. Every commercial on that broadcast hands the coordinator a contiguous
four-screen wall in a single step, at a known duration, on adjacent screens. Fourteen
independent broadcasts would give more total dead seconds but scattered one screen at a time,
which is worth much less.

---

## 3. The six components

### 3.1 Dead Time Controller

**One monitor per broadcast, three layers deep.** The only component that *produces* canvas
rather than consuming it — everything else in the system is downstream of its output. A stream
is switched away from during **its own** dead time and nobody else's.

The three layers are not just categories, they are **different certainty regimes**, and the
window gets longer and more trustworthy as you go up:

| Layer | Covers | Detected from | Typical window | Treatment |
|---|---|---|---|---|
| **L3 · Scheduled** | Studio shows, whip-arounds, analysis blocks — anything that is not the game | **EPG, days or weeks ahead** | 10 min – hours | Nobody in a bar can hear talking heads. Worth nothing on the broadcast, everything on the canvas. **The only dead time sellable before the week starts.** |
| **L2 · Game structure** | Pregame show, quarter breaks, halftime, timeouts, reviews, injury stoppages, postgame show | Sportradar game state and clock | 40 s – 15 min, length usually reliable | Forecastable. `remaining_timeouts` tells you a stoppage is coming *before* it happens; halftime is on the schedule a week out. |
| **L1 · TV break** | Commercials — network and local avails | In-feed detection, at the moment it starts | 120–180 s, **length unknown** | Trust the minimum only. A spot cut off by the game returning is worth less than no spot. |
| **L0 · Always-on** | The 2 BarBoards outputs | By definition | All day | The canvas floor. Costs no window ever, and is why the addressable set never reaches zero. |

Rules:
- **Per broadcast, never per stream.** The same feed breaks at the same second on every output
  carrying it.
- **Fails closed.** Anything unconfirmed is treated as live ball.
- L2 and L3 must be distinguished in the render, not just in the data — a stream in *its own*
  pregame should still read as that game (on the turf, with a PREGAME chip), while a scheduled
  studio show should read as a different programme entirely (a desk set, no field). Otherwise the
  operator cannot tell at a glance why a screen is dead.

Measured layer mix in the reference room *(modelled)*: live ball 54%, **L3 21%**, **L2 18%**,
**L1 4%**, between plays 3%.

The counter-intuitive result: **L1 is the layer everyone thinks of as "the ad break," and it is
the smallest and least trustworthy of the three.** L3 is five times bigger and known in advance.

### 3.2 Matrix Controller
Owns the scarcest physical resource: which of 14 tuners points at which of 14 screens. The only
component that can **create** canvas rather than spend it.

- Feature wall follows fan mix from patron app check-ins
- Clusters predicted breaks so the canvas is contiguous
- **Demotes garbage-time streams** to BarBoards content — one tuner released, one output
  permanently addressable
- Reallocates a finished game to the tightest one on the slate
- Pre-reads `expected_latency` the day before: only λ=2 games get tight reactive cues (§8.3)

### 3.3 Experience Controller
Knows, frame by frame, which outputs are in dead time and therefore addressable. Assembles them
into a canvas and answers exactly one question per proposed cue: *can this run right now, on
these surfaces, for this long.*

- Maintains dead-time state per broadcast (§4)
- Always-on outputs are permanently addressable — the canvas floor
- Runs the five gates (§6)
- Schedules the hand-back **before the first frame renders**
- Never starts a cue it cannot finish inside the trusted window

### 3.4 Experience Coordinator
Consumes game intelligence across **every game on the slate** and decides what *should* happen
over a period of time. The only component with an opinion about the shape of the afternoon
rather than the next two seconds.

- Subscribes filtered to `scoring_play`, `turnover`, `big_play`, `redzone`, `two_minute`
- Sizes the cue to win-probability delta, not to the event label
- **Cross-game promotion** — the best play of the day, onto every dead screen
- Refractory and tier budget per period
- Register gate overrides everything (§7)

**Coordinator proposes, Controller grants.** These counts differ constantly and the gap is the
reason they are separate components. Surface it in any operator UI:
`"Look left · pick six — proposed 14, granted 12"`.

### 3.5 Audio Controller
One bus, three sources, the tightest constraint in the building.

- **TV call** — de-embedded from the receiver carrying the main game
- **Music** — owned arrangements only, so they can start and stop anywhere a break does
- **Box** — VO and FX generated by BarBoards

Rules:
- Never step on a live call, even when the window allows it
- Duck in breaks; claim only in known windows
- **Restore the held reference level exactly on hand-back — never a recomputed one**
- Coming back too loud is worse than coming back too soft

### 3.6 Patron Canvas
A web app, no install, joined from a code on every always-on screen. The only surface that needs
no window — which makes it the only thing still working in the last two minutes of a one-score
game.

- **Stadium Squares** — a card of play outcomes, auto-daubed off push events, across all games
- **Calls** — binary predictions opened and locked inside known windows
- **Surge** — taps aggregate to a threshold; fires only in dead time, never during live play
- **Prizes** — high-margin plate items, redeemed **at the bar, not the table**
- **Return coupons** — pre-load next week's card before they leave the building

Critical secondary role: **the patron canvas is an input, not just an output.** Aggregate
conviction is how the box knows whether a split room can take a room-wide detonation.

---

## 4. Dead time

### 4.1 Definition
Any time a broadcast is not showing live gameplay or something otherwise worth watching.
Talking heads in a bar are on mute and are worth nothing.

### 4.2 Render states vs. layers

Keep these separate. The **render state** is what is on the glass; the **layer** is why it is
dead and how far ahead you knew.

| Render state | Description | Layer | Addressable |
|---|---|---|---|
| `live` | Ball in play | — | No |
| `slack` | Between plays, huddle, pre-snap | — | Overlay only, no takeover |
| `ad` | Commercial break | **L1** | Yes — trust the **minimum** only |
| `stop` | Timeout, review, injury, end of quarter | **L2** | Yes |
| `studio` | This game's pregame / halftime / postgame show | **L2** | Yes |
| `sched` | Network programming that is not this game | **L3** | Yes |
| `off` | Always-on BarBoards outputs | **L0** | Yes |

```
addressable = ad | stop | studio | sched | off
LAYER       = { ad:1, stop:2, studio:2, sched:3, off:0 }
```

`studio` and `sched` are deliberately different render states even though both are "talking
heads" — see §3.1.

### 4.3 Window trust classes
- **Downtime** — fully trusted (pregame, postgame, always-on outputs)
- **Known** — trusted from the signal (halftime, two-minute warning, end of period)
- **Ad time** — start detected, length unknown. **Trust the minimum and nothing more.**
- **No window** — live ball. Overlay accents only, never a claim.

### 4.4 Measured canvas — reference room *(modelled)*
Across a 4-hour Saturday with 8 games on 14 tuners plus 2 always-on:

- Average **8.9 of 16** outputs addressable at any instant
- **6 or more for 73%** of the day
- Minimum 3, maximum 16
- Distribution is **lumpy, not uniform** — the canvas arrives in blocks because 4 streams carry
  the main game and break together

Peak: a **halftime cascade** where six games hit the half within four minutes and 15 of 16
outputs go addressable simultaneously. This is on the schedule a week in advance.

---

## 5. Cue tiers

Sorted by what a cue costs the room, not by what triggers it.

| Tier | Name | Surface | Audio | Duration | Refractory | Budget |
|---|---|---|---|---|---|---|
| **T0** | Ambient | Always-on outputs only | None | Continuous | None | Unlimited |
| **T1** | Accent | Overlay, feed stays up | None | ≤ 2 s | None | Unlimited |
| **T2** | Feature | Feature wall claim | Ducked, not claimed | 3–8 s | ~2 min | ~6 / quarter |
| **T3** | Takeover | Whole room | Claimed | 8–20 s | ≥ 8 min | 4–5 / game |
| **T4** | Room / patron | Whole room, patron-triggered | Claimed at fire | Threshold | ~10 min | 2–3 / game |
| **—** | Register hold | Suppression state | Muted | Until cleared | — | — |
| **$** | Commerce | Always-on outputs | None | 10–15 s | Off cue decay | — |

**Tier 3 is the only class permitted to override the Controller** and interrupt a broadcast that
is still running. Everything else waits for real dead time.

### The energy economy
- Every takeover spends currency that does not refill for ~8 minutes.
- A room taken over four times an hour **stops looking up on the fifth**.
- Three takeovers in a quarter is not three times the effect of one; it is less than one.

---

## 6. The five gates

Every proposed cue must clear all five. Four of them have nothing to do with whether the trigger
fired.

| # | Gate | Question |
|---|---|---|
| 1 | **Window** | Is the trusted window ≥ the cue's required duration, and are we before the hard cutoff? |
| 2 | **Surface** | Enough free outputs, adjacent enough to read as one thing, and does the phrase parse from the back row? |
| 3 | **Energy** | Has the refractory period elapsed, and is there tier budget left in this period? |
| 4 | **Register** | Is the room's emotional register compatible with what this cue does? |
| 5 | **Audio** | Is the claim available, and can the held reference be restored exactly on hand-back? |

Gate 4 **fails closed**. It is the reason the system can be left running in a live room.

---

## 7. Registers

The gate that overrides the tier. Read from game state and room composition.

| Register | Read from | What is allowed |
|---|---|---|
| **Celebratory** | Home scoring event, WP swing in favour | Everything. The only register the full library is available in. |
| **Tense** | WP inside 65/35, under 4 min, fourth down | **Subtractive cues only.** Nothing that adds noise, claims audio, or sells. |
| **Adverse** | Opponent scores, turnover against | A factual scoreline for ~2 s. No motion, no colour, no sound. Acknowledge and get out. |
| **Solemn** | Injury cart, anthem, tribute, moment of silence | **Nothing.** Plain neutral slate, rail dark, until the feed clears it. |
| **Indifferent** | No dominant allegiance, fragmented viewing | Ambient and commerce only. Spectacle in a room that does not care reads as an ad anyway. |

**Never celebrate against your own room.** The opponent scores roughly as often as you do; half
the addressable emotional events in a night are bad ones. In a split room, use opposition
grammar (the boundary/flip) rather than celebration.

---

## 8. Sportradar integration

### 8.1 Feed
NCAAFB Push Events. Reference: `https://developer.sportradar.com/football/reference/ncaafb-push-events`

**Stream-level filters:**
- `event_category` — `redzone`, `two_minute`, `scoring_play`, `big_play`, `turnover`
- `event_type` — `setup`, `timeout`, `tv_timeout`, `two_minute_warning`, `comment`, `period_end`, `game_over`
- also `match`, `team`, `status`

**`play.type`** — `pass`, `rush`, `faircatch_kick`, `extra_point`, `conversion`, `free_kick`,
`kickoff`, `punt`, `field_goal`, `penalty`

### 8.2 Fields that matter most

| Field | Why it matters |
|---|---|
| `game.expected_latency` | **2 / 10 / 25 / 50 s, published the day before gameday.** See §8.3 |
| `play.official = false` | The play is under review — this is the window-open signal |
| `review.result` / `review.reversed` | The binary payoff at the end of that window |
| `details.recovery.type` | `interception`, `fumble recovery`, `blocked kick recovery` |
| `defense.int_touchdown`, `fumble.opp_rec_td` | Pick six, scoop and score |
| `return.touchdown`, `return.category` | Kick / punt return TD |
| `block.category` | `field_goal`, `extra_point`, `punt` |
| `details.safety`, `defense.safety` | Rarest scoring play |
| `fake_field_goal`, `fake_punt` | Extremely rare, very high novelty |
| `field_goal.att_yards` | Scale the cue to the distance |
| `drive.inside_20`, `drive.scoring_drive`, `drive.end_reason` | Red-zone state, drive summaries |
| `end_situation.down` / `yfd` / `goaltogo` | Fourth-down and goal-line detection |
| `boxscore.*.remaining_timeouts` | **Forecast** the next stoppage before it happens |

### 8.3 `expected_latency` is a planning input, not a runtime one
It is published the day before. The **Matrix Controller** reads it to plan the week:

- **λ = 2 s** → tight reactive cues allowed on the feature wall
- **λ = 10 s** → feature tier only, no frame-critical timing
- **λ = 25–50 s** → ambient treatment only. A cue would land half a minute after the room
  already reacted, which is worse than no cue.

Surface λ next to every stream in any operator UI.

### 8.4 The event ladder

**Rank by crowd amplitude and you get a highlight reel. Rank by window seconds and you get the
business.** The two axes are nearly uncorrelated, and the loudest events create the shortest
windows.

| Event | Amp | Window | Tier | Sportradar field | Coordinator action |
|---|---:|---:|---|---|---|
| Walk-off go-ahead TD | 100 | 150 s | T3 | `scoring_play` + `two_minute` | Room takeover, audio claimed |
| Kick / punt return TD | 97 | 150 s | T3 | `return.touchdown=1` | Room takeover — highest surprise per second in the sport |
| Pick six | 96 | 150 s | T3 | `defense.int_touchdown=1` | Room takeover; cross-game promote if it lands elsewhere |
| Scoop and score | 94 | 150 s | T3 | `fumble.opp_rec_td=1` | Room takeover |
| Blocked kick returned | 93 | 140 s | T3 | `block.category` + `return.touchdown` | Room takeover |
| Walk-off field goal | 92 | ∞ | T3 | `field_goal.made` + `event_type=game_over` | Takeover into unlimited postgame |
| Fake punt / fake FG | 86 | 35 s | T2 | `fake_punt` / `fake_field_goal` | Feature — rarity does the work |
| Safety | 80 | 120 s | T3 | `details.safety=true` | Takeover; free kick follows |
| Turnover on downs | 79 | 40 s | T2 | `down_conversion.down=4`, fail | Feature on the wall |
| Interception | 78 | 45 s | T2 | `event_category=turnover` | Feature · the steal |
| Fumble lost | 76 | 45 s | T2 | `fumble.lost=1` | Feature · the steal |
| Touchdown | 75 | 150 s | T3 | `scoring_play=true` | Takeover if unified, flip if split |
| Two-point conversion | 71 | 90 s | T2 | `conversion.complete=1` | Feature, then the exhale |
| Long field goal 50+ | 68 | 120 s | T2 | `field_goal.made` + `att_yards≥50` | Feature, scaled by distance |
| Explosive play 40+ | 64 | **0 s** | T1 | `event_category=big_play` | Accent only — no stoppage exists |
| Fourth-down conversion | 62 | **0 s** | T1 | `down_conversion.down=4`, complete | Accent — the tension cue fired before it |
| Review overturned | 60 | **180 s** | T2 | `play.official=false` → `review.reversed` | Long window **plus** a binary the room can vote on |
| Goal-line stand | 58 | 40 s | T2 | `goaltogo=true` + fail | The Hold, then the flood on the stop |
| Red zone entry | 54 | 0 s | T1 | `event_category=redzone` | Sustained **state** — edge tint, not an event |
| Sack on third down | 50 | 30 s | T1 | `defense.sack` + `down=3` | Accent; punt team creates the window |
| Missed field goal | 46 | 60 s | T1 | `field_goal.missed=1` | Accent — adverse for half the room, state it dryly |
| Two-minute warning | 40 | 100 s | T2 | `event_type=two_minute_warning` | Tension cue — subtract, never celebrate |
| Penalty 15 yd | 33 | 35 s | T1 | `penalty.yards≥15`, accepted | Accent, usually adverse |
| First down | 28 | 0 s | T1 | `down_conversion.complete` | Accent · the chain sweep |
| Period end | 20 | 120 s | WINDOW | `event_type=period_end` | Halftime is the same event with 900 s behind it |
| Timeout | 6 | 75 s | WINDOW | `event_type=timeout` | `remaining_timeouts` forecasts the next one |
| **TV timeout** | **2** | **165 s** | WINDOW | `event_type=tv_timeout` | **Dead last on excitement, first on revenue** |
| Injury stoppage | 0 | 190 s | **FORBIDDEN** | `event_type=comment` + prolonged stop | Longest guaranteed window of the day. Register suppresses everything. |
| Setup | 0 | 0 s | — | `event_type=setup` | Housekeeping. Tells you the next snap is coming. |

Two quadrants matter:
- **Loud, no room to put it** — explosive plays, 4th-down conversions, red zone. Huge reaction,
  zero stoppage to claim. Accent tier only.
- **Silent, and the entire business** — `tv_timeout`, `period_end`, postgame. Amplitude near
  zero, window seconds enormous.

---

## 9. Cue library

### 9.1 Generic cues (any sport)

| Cue | Tier | Dur | Window needed | Surface | Audio | Register |
|---|---|---|---|---|---|---|
| **Rail** | T0 | ∞ | Continuous | Always-on | None | Any |
| **Board** | T0 | ∞ | Continuous | One output | None | Any |
| **Chain** (first down) | T1 | 1.4 s | None | Wall, feed stays | None | Any but solemn |
| **Red zone** | T1 | State | None | Wall, feed stays | None | Any but solemn |
| **Burst** (explosive play) | T1 | 1.8 s | None | Wall, feed stays | None | Celebratory |
| **Steal** (turnover) | T2 | 2.4 s | 3 s | Wall claim | Ducked | Celebratory |
| **The Hold** — stop | T2 | 7.2 s | 8 s | Wall claim | Ducked → claimed | **Tense only** |
| **The Hold** — convert | T2 | 6.2 s | 8 s | Wall claim | Ducked only | **Tense only** |
| **Flip** (lead change) | T2 | 4.0 s | 4 s | Wall claim | Ducked | Celebratory · adverse |
| **Clock** (2-min warning) | T2 | 4.6 s | Known | Wall claim | Ducked | **Tense only** |
| **Flood** (score) | T3 | 6.5 s | 7 s | Whole room | Claimed | Celebratory |
| **The Take** (halftime) | T3 | ≤ 12 min | Known | Whole room | Claimed | Any but solemn |
| **Final — win** | T3 | 6.5 s | Known | Whole room | Claimed | Celebratory |
| **Final — loss** | T3 | 7.5 s | Known | Whole room | **Not claimed** | Adverse |
| **Surge** (patron) | T4 | Threshold | Dead time | Whole room | Claimed at fire | Celebratory |
| **Solemn hold** | — | Until cleared | — | Whole room | Muted | Solemn |
| **Exhale** (commerce) | $ | 10 s post-takeover | None | One output | None | Any but solemn |

### 9.2 Design notes on the important ones

**The Hold** is the showpiece and the argument for the whole system.
Fourth and goal. The wall desaturates, the rail goes out, and every receiver contracts a single
hairline toward its own centre — **deliberately not in step**, because a room holding its breath
is not synchronised either. Nothing is rendered. Forty people look up inside two seconds.

Two refinements from the prototypes:
1. **It runs on per-receiver timing, so it needs no cross-screen frame lock** — it ships on
   hardware that cannot do a synchronised canvas.
2. **When the ball is live, it takes every screen that is NOT carrying the play.** The room goes
   quiet *around* the game rather than on top of it. The eight screens showing the down never
   lose a frame.

Only when the stop comes does the room get to be loud — 500 ms flash, then ~2 s of flood. The
convert branch renders **nothing at all**: the lines dissolve, colour returns, the room simply
gets its picture back. Every tension cue needs a branch that costs nothing, or the system only
knows how to celebrate and cannot be trusted to be quiet.

**Final — loss.** Half of all nights end this way and nobody designs for it. No flash, no
colour. State the score once, plainly, then give the room a reason to stay: next kickoff, board
payout, the thing happening at the bar in ten minutes. The commercial objective of the last
twenty minutes of a loss is one more round.

**The Exhale.** Nobody orders during a touchdown. Ten seconds after one, the whole room is
standing, talking and holding an empty glass — and the wall has already gone back to the game.
Commerce fires off the **decay of the celebration**, not off the clock, and lands on the
always-on output alone so it costs no window.

### 9.3 NCAAFB-specific cues built for the reference build

| Cue | Tier | Dur | What it does |
|---|---|---|---|
| **The slate** | T3 | 9.5 s | Eight games cycle as a live board, rows drop away as the Matrix Controller ranks them on fan mix and λ, then RED RIVER runs across and takes the feature wall |
| **Pregame show** | T3 | 19.0 s | Countdown wave 8→1 with team gradient · WELCOME / TO / BARBOARDS / SATURDAY · staged Texas→Oklahoma reveal · accelerating trade · blastoff · kickoff |
| **Third down stand** | T2 | 9.0 s | Left wall calls THIRD, right wall answers DOWN, jumbotron carries a GET LOUD meter filled by patron taps, resolves into SACK |
| **Look left · cross-game promote** | T3 | 8.5 s | Twelve screens turn into arrows pointing at the two carrying the play, then the scoreline, then the replay card |
| **Squares sweep** | T0/T1 | 8.5 s | The Stadium Squares board on the canvas with five push events daubing live |
| **Reclaim** | T0 | 6.0 s | A blowout stream demoted to BarBoards content — one tuner released |
| **Halftime take** | T3 | 15.5 s | Halftime open · sponsor 0:30 · leaderboard cascade · prize · coupon · back |
| **Fourth and goal** | T2 | 8.5 s | The Hold, room scale, around the live game |
| **Touchdown Texas** | T3 | 8.0 s | TOUCHDOWN runs the canvas → TEXAS → flash → burnt orange racing out from the feature wall to both corners |
| **Texas Fight** | T3 | 11.8 s | Call and response on 700 ms beats, quiet side holding bright; turns to OU SUCKS on beats 4 and 8 |
| **Winner** | T3 | 13.5 s | Stadium Squares winner named, score, phone cascade, prize, redemption |
| **Come back** | T3 | 7.5 s | Coupons out, next Saturday's card pre-loaded |
| **Tomorrow's board** | T0 | 4.5 s | Two always-on outputs cycling Sunday's card, standings, next Saturday |

### 9.4 Cross-game promotion

The single most defensible new mechanic. When a high-amplitude event lands on a side game:

1. Every **dead** screen in the building flips to a directional arrow pointing at the screens
   carrying it.
2. **The screens showing the play are never taken** — they are the thing being pointed at.
3. Then the scoreline, then the replay card, then everything goes straight back.

Nobody in a bar should miss the best play of the afternoon because it happened on the wrong TV.
Total spend: a few seconds of outputs nobody was using.

---

## 10. Pacing rules

Derived by walking the reference timeline at 200 ms and measuring how long each distinct
on-screen state actually holds. Target distribution across ~85 states:

| Band | Use | Target share |
|---|---|---|
| < 0.4 s | Flash / blast / shockwave only | ~2% |
| 0.4 – 0.7 s | Call-and-response chant beats | ~20% |
| 0.7 – 6.0 s | **Readable holds — the bulk of everything** | ~70% |
| > 6.0 s | Deliberate rests and continuous animations only | ~5% |

Concrete rules:
- A card carrying text to read: **≥ 1.2 s**, ideally 1.5–2.5 s
- A run-across word on the canvas: 1.2–2.0 s
- White flash: 250–500 ms. Never longer — a 2 s flash eats the payoff behind it.
- Chant beat: 620–700 ms per slot
- Ad spot frames: roughly equal thirds of the excerpt
- Feed rests between cues: 2.5–7 s
- **The payoff must be longer than the setup.** The most common bug found in review was a
  build-up eating the moment it was building to.

**Never let a cue's internal script run past its allotted duration.** Write an automated check:
parse each scene's last internal threshold, compare to the cue's `d`, fail the build on
overrun. This caught two hard truncations and four mistimed segments in the prototype.

---

## 11. Reference build — NCAAFB Saturday

### 11.1 The slate

| Game | Kick | Network | λ | Notes |
|---|---|---|---|---|
| **#4 Texas at #9 Oklahoma** | 12:30 | ABC | 2 | Main game, 4 streams |
| Alabama at LSU | 12:00 | CBS | 2 | 2 streams; pick six here |
| Ohio State at Penn State | 12:30 | FOX | 10 | 2 streams |
| Michigan at Michigan State | 12:00 | BTN | 10 | 1 stream |
| Georgia at Tennessee | 3:30 | CBS | 25 | 1 stream |
| Oregon at Washington | 3:30 | FOX | 2 | 1 stream — studio all first half, the canvas floor |
| TCU at Baylor | 12:00 | ESPN | 25 | 1 stream — **demoted at 1:24**, blowout |
| Utah at Arizona State | 11:00 | P12 | 50 | 1 stream — **ends at 2:07**, retuned to main |
| Saturday whip-around | — | — | 50 | 1 stream — mostly studio, low value |

Room composition: **62% Texas**, split enough that a naive celebration would land badly on a
third of the bar.

### 11.2 Broadcast differentiation

Every broadcast must be **visually distinguishable at a glance**. In the prototype each gets:

- its own turf gradient
- its own **mow pattern** — vertical stripes / wide horizontal bands / checkerboard
- its own endzone colours
- its own **score bug position** — bottom-left, top-centre, bottom-right
- its own network tag and accent colour
- its own drive clock **at its own phase**, so scrimmage lines and balls never move together

Dead-time states render distinctly too, and **the layer must be readable at a glance**:
- `ad` (L1) → network-coloured commercial slate with a progress bar
- `stop` (L2) → the live look with a dark scrim
- `studio` (L2) → **on the turf**, same field and endzones, with a set/desk overlay and a
  PREGAME / HALFTIME chip in the bug. A stream in *its own* pregame must still read as that game.
- `sched` (L3) → **a studio set, no field**, network-branded with the show name. This is a
  different programme, and it must not be mistaken for the game.

Measured share of screen-seconds across the day *(modelled)*: live field 47%, **L3 studio show
26%**, house board 19%, **L1 commercial 5%**, **L2 pre/half/post 4%**.

### 11.3 Matrix decisions on the timeline

| Time | Decision |
|---|---|
| 1:24 | TCU–Baylor 38–3 → stream demoted to BarBoards content, one output permanently addressable |
| 2:07 | Utah–ASU final → retuned to Red River as it tightens |
| 3:00 | Whip-around dropped → fourth stream added to the main game |

Cohort size is shown live per lane (`TEX@OU ×4` → `×5` → `×6`).

### 11.4 The day, cue by cue

| Wall clock | Cue | Notes |
|---|---|---|
| 12:00 | Room as found | 14 screens, 4 broadcasts, 8 receivers, three different pictures |
| 12:00 | Receiver vs broadcast | The mirroring constraint, explained on the wall |
| 12:02 | **The slate** | Matrix decision made visible |
| 12:09 | **Pregame show** | The only ritual allowed to interrupt a running broadcast |
| 12:36 | **Third down stand** | Red River live → meter runs on *other games'* breaks |
| 12:48 | **Look left · pick six** | Cross-game promote, 12 of 14 |
| 12:52 | **Break spot · Bud Light 0:15** | Second half of the same detected timeout |
| 1:00 | **Squares sweep** | Ambient, waits for the snap to end |
| 1:24 | **Reclaim** | One screen changes hands, thirteen never move |
| 1:35 | **Next round · Miller Lite** | Exhale, always-on outputs only |
| 1:44 | **Halftime take** | 15 of 16 outputs · Crown Royal 0:30 · payout · prize · coupon |
| 3:20 | **Fourth and goal** | The Hold, around the live game |
| 3:26 | **Touchdown Texas** | Tier 3 override, 31–28, 0:04 |
| 3:36 | **Texas Fight** | Call and response |
| 3:46 | **Winner** | Stadium Squares payout on the room, prize on the phone |
| 3:50 | **Come back** | Coupons, next week's card |
| 3:55 | **Late window · Coca-Cola 0:30** | Postgame, 14 outputs, no contention |
| 4:00 | **Tomorrow's board** | Two always-on outputs, last impression of the day |

---

## 12. Advertising

> **Status: hypothetical for this example.** The four holdco relationships and all creative,
> rates and revenue figures below are illustrative, built to show the inventory shape. Nothing
> here reflects a signed agreement. *(verify)*

### 12.1 The constraint that makes it sellable

**Every unit runs on outputs the box controls, inside dead time the box detected, and only after
switching away from the broadcast. No feed is ever modified and nothing is ever laid over live
gameplay.**

Sources carry a **profile**, and a policy engine decides per source which switch windows are
open. A restricted source simply has fewer slots — not a different product. *(verify against
current contracts before this drives code.)*

### 12.2 Example brands

| Holdco | Brands used |
|---|---|
| Coca-Cola Company | Coca-Cola, Powerade |
| AB InBev | Bud Light, Michelob Ultra |
| Molson Coors | Coors Light, Miller Lite |
| Diageo | Crown Royal, Captain Morgan |

Alcohol endcards carry **DRINK RESPONSIBLY · 21+**.

### 12.3 Inventory ladder

| Unit | Example brands | Where it runs | Window cost | Pricing logic |
|---|---|---|---|---|
| **Presenting tag** | Coors Light · Michelob Ultra · Bud Light | 2–3 s on the front or back of a cue that already had a window | **Zero** | Highest rate per second in the deck. Welded to a moment the room made itself. |
| **Break spot 0:15 / 0:30** | Bud Light · Coors Light | Detected commercial, switched away from the feed | The break | The unit that pays for the box. Priced on outputs × dwell, not impressions. |
| **Room takeover 0:30** | Crown Royal | Halftime, every addressable output plus the mix | Known window | The only inventory in a bar you can schedule a week out. Sold across the estate. |
| **Sponsored trigger** | Bud Light · Michelob Ultra | Welded to a push event — a stop, a turnover, a touchdown | **Zero** | Sold as a season-long right to a *play type*, not a slot — nobody can say when the sack comes. |
| **Ambient lockup** | Miller Lite · Powerade | Always-on outputs, all day | **Zero** | Pure incremental inventory. Cheap per hour, enormous per day. |
| **Exhale / commerce** | Miller Lite · Captain Morgan | Always-on outputs, 10–15 s after a takeover clears | **Zero** | Fires off the decay, not the clock. |
| **Late window 0:30** | Coca-Cola · Powerade | Postgame studio, every output | **Free** | Largest block of unsold attention in the day. The one slot a soft drink outbids a beer for. |
| **Prize funding** | Coors Light | The Stadium Squares comp itself | **Zero** | Brand buys trial, venue keeps plate margin, patron walks past 14 screens. The only unit that is also a conversion. |

Five of the eight cost no window at all.

### 12.4 Modelled revenue, one room, one Saturday

| Unit | Revenue |
|---|---:|
| Crown Royal 0:30 halftime takeover | $14.20 |
| Coca-Cola 0:30 late window | $9.60 |
| Bud Light 0:15 in a detected TV timeout | $6.40 |
| Bud Light tag on the back of the touchdown | $4.80 |
| Coors Light funding the squares comp | $3.00 |
| Coors Light presenting tag on the slate | $1.10 |
| Michelob Ultra third-down trigger | $0.90 |
| Miller Lite exhale | $0.70 |
| **Total** | **$40.70** |

The shape matters more than the total: **the 0:15 in a detected break earns more per second than
either 0:30**, because it lands on a room that is looking up. And the two-second touchdown tag
beats the 0:15 on rate-per-second while costing zero window.

### 12.5 What moves which KPI

| KPI | Mechanism | How it works | Modelled lift |
|---|---|---|---|
| Dwell | Unresolved engagement | A squares card that settles at the half, a call that settles in Q3, a coupon that unlocks at the final. Issued long before it pays. | +26 min |
| Dwell | Halftime cascade | The largest canvas of the day lands exactly when a bar normally loses a third of its room. | +9 min |
| Spend | The exhale | Commerce 10–15 s after a takeover, at the trough, always-on output only. | +$1.85/head |
| Spend | Redeem at the bar | High-margin plate items, redeemed at the bar not the table. The walk is the point. | +$3.50/head |
| Spend | Cross-game promote | Keeps heads in the room instead of on phones elsewhere. | +$0.55/head |
| Return | Coupon at the payout | Issued at the emotional peak, not on the receipt, into an account that already holds next week's card. | 82 issued |
| Return | Pre-loaded card | Next Saturday's card is live in the app before they leave. | 44% open rate |

---

## 13. Existing prototypes

Four standalone HTML files. All are single-file, no build step, no dependencies beyond Google
Fonts (Anton + IBM Plex Sans/Mono). All run offline except for the fonts.

| File | What it is | What to port |
|---|---|---|
| `experience-orchestrator.html` | The model: game arc, 17-cue library with live demos, the five gates with a "will it fire" simulator | Cue definitions, gate logic, the arc/energy model |
| `the-hold-room-scale.html` | The Hold across 14 screens, 8 receivers, both branches | Per-receiver stagger, the audio reference/restore meter |
| `quarter-three-canvases.html` | Super Bowl XLII 4th quarter across video / audio / patron canvases | The three-canvas availability lanes — the clearest proof of the thesis |
| `ncaafb-saturday-floor.html` | **The main one.** Four tabs: The room (3D sim), The floor (16-stream matrix), Event ladder, Controllers | Everything below |

### 13.1 Architecture of the main prototype

One shared cue list drives both the room simulation and the floor timeline:

```js
window.__BB = { SPAN, GSCHED, CUES, get(), set() }
```

- `CUES[]` — `{ t, d, sc, lb, tier, s[], tag, txt }`
  `sc` names the room scene, `s` lists the proposed output indices, `tier` gates the override
- `GSCHED{}` — dead-time schedule **per broadcast**, shared by every stream tuned to it
- Both tabs read the same clock, so switching tabs preserves position

Per-output rendering on the floor is a **function of progress and output index**:

```js
LOOK["Look left · pick six"] = function(u, i, lt) { ... return {t, s, bg, c, soft} }
```

`soft: true` means the phase releases any output that has gone back to live ball — used for the
halftime take, which gives screens back as games restart.

### 13.2 Keyboard transport (room tab)

| Key | Action |
|---|---|
| ← → | 1 second |
| shift + ← → | 5 seconds |
| alt + ← → | Cue to cue; back once returns to the current cue's start |
| space | Play / pause |
| home | Back to the top |

First arrow press auto-pauses, like a video scrubber. Both ends wrap.

### 13.3 Dead-time layer reference

The prototype encodes the layers as a brightness ramp — **more amber means longer and more
certain** — which makes the stream matrix readable without a legend:

| | Colour | Meaning |
|---|---|---|
| `live` | `#1F2A22` dark green | Ball in play, untouchable |
| `slack` | `#241E18` near-black | Between plays, overlay only |
| `ad` | `#4A3A1A` dim amber | L1 · TV break |
| `stop` | `#6A5320` mid amber | L2 · stoppage |
| `studio` | `#7E6224` | L2 · pregame / halftime / postgame |
| `sched` | `#9A7A2A` | L3 · scheduled programming |
| `off` | `#B8912F` bright amber | L0 · always-on, permanent |


### 13.4 Cue assets — the source animations

`asset-format-README.md` plus 33 standalone animation files. **These are the deliverable an
output controller consumes.** Each file is ONE continuous surface — not a room, not a screen.
If a cue reads TOUCHDOWN TEXAS across six outputs, that is one file, and the controller decides
where the cuts fall.

- `grammar-*.html` — 17 sport-agnostic primitives (rail, chain, hold, flood, flip, clock, …)
- `ncaafb-*.html` — 16 worked-example surfaces (slate, pregame, td, fight, winner, ad spots, …)
- `contact-sheet.html` — all 33 playing at once

Key contract: a cue emits **pixels** and a **control track**. The control track (`desat`, `dim`,
`edge`, `flash`, `audio`, `tally`) is applied by the controller to the *broadcast underneath* and
is deliberately not baked into the asset — otherwise the file would have to carry a copy of the
feed. `?slice=r,c` makes one file render a single cell of the grid full-bleed;
`postMessage({type:"bb:seek", t})` frame-locks N instances.

### 13.5 Per-cue library (room-context players)

All 35 cues are also available as in-room players, which show each one inside the 14-screen
reference room with real dead-time gating — useful for reviewing behaviour, not for display — each as a self-contained standalone
player plus a recreation spec written to be sufficient on its own.

- `cue-library-README.md` — index, shared conventions, and a suggested reading order
- `wall-*.html` / `.md` — 17 wall cues (4 outputs, `paint(u)` API)
- `room-*.html` / `.md` — 18 room cues (14 screens on 8 receivers, `plan(ms)` API)

Each `.md` carries: intent, mechanic, a phase-by-phase timing table, why it is built that way,
the failure modes, the surface primitive, the render contract, and the actual source.


---

## 14. Build order and open questions

### 14.1 Suggested order

1. **Dead Time Controller.** Everything depends on it. One monitor per broadcast, three layers.
   Build them in reverse order of difficulty:
   - **L3 first** — pure EPG ingest, known days ahead, no detection needed. It is the largest
     layer and it ships without touching a feed.
   - **L2 second** — from Sportradar game state. `event_type` gives period_end, timeout,
     tv_timeout; `remaining_timeouts` lets you forecast.
   - **L1 last** — in-feed ad-break detection, the hardest and least trustworthy.

   Classify into `live / slack / ad / stop / studio / sched`, tag each with its layer, and treat
   everything unconfirmed as `live` (fail closed).
2. **Experience Controller + the five gates.** Pure logic, fully testable without hardware.
   Model the receiver→screen map and the addressable-set computation.
3. **The canvas primitive.** One surface sliced across N outputs, with the negative-offset
   technique. Test with the run-across grammar first — it is the hardest thing to get right and
   everything else is easier than it.
4. **Tier 0 and Tier 1 cues on the two always-on outputs.** Ships with no window logic at all
   and proves the rendering pipeline in a real room.
5. **Sportradar ingest + Coordinator.** Filtered subscription, event→tier mapping, refractory
   and budget.
6. **Audio Controller.** De-embed, duck, claim, restore-to-held-reference. The restore is the
   part that will bite.
7. **Patron web app.** Stadium Squares first — it is the spine and it needs no window.
8. **Matrix Controller.** The last piece, because it needs everything above to have an opinion.
9. **Ad server integration.** Only after the window gate is trustworthy. A spot cut off by the
   game returning is worth less than no spot.

### 14.2 Non-negotiable invariants

- Never render over live gameplay.
- Switch away from a broadcast only during **that broadcast's own** dead time.
- Dead time is computed per broadcast and shared by every stream carrying it. Never per stream.
- Never modify a broadcast feed. Switch away from it.
- Never start a cue that cannot finish inside the trusted window.
- Always restore the held audio reference exactly; never recompute it.
- The register gate fails closed. Solemn suppresses everything.
- Screens sharing a receiver are one surface. Never try to make them differ.
- Every claim schedules its hand-back before the first frame renders.

### 14.3 Open questions

- **L1 ad-break detection.** How reliable, and what is the true minimum trusted window? *(verify)*
  Note this is the *smallest* of the three layers — do not let it block shipping L3 and L2.
- **L3 EPG source.** Which listings feed, how far ahead, and how reliable are mid-day schedule
  changes? This layer is the largest and the only one sellable in advance. *(verify)*
- **L2 / L3 boundary.** Where does a network's pregame show end and the game's own coverage
  begin? The render differs, so the classification has to be unambiguous. *(verify)*
- **Source policy.** Which switch windows are open per source profile, and how is that
  configured per venue? *(verify against contracts)*
- **Audio de-embed path.** Which receiver carries the call, what happens on a Matrix retune
  mid-claim, and how is the reference level captured?
- **Allegiance detection.** Room composition currently assumed. Real inputs: app check-ins,
  check data, and the board. How much can be inferred before anyone opts in?
- **Win probability.** Sourced or computed? The tier sizing depends on ΔWP, and the prototype's
  curves are modelled.
- **Frame sync.** Which cues genuinely need it. The V3/V4 split in the prototype assumes
  time-carried meaning ships without it and space-carried meaning does not.
- **Prize fulfilment.** How a comp is authorised, redeemed and reconciled at the POS.

### 14.4 Test harness worth building early

The prototype's audits caught real bugs and should exist in the real system:

1. **Overrun check** — every cue's internal script must end before its allotted duration.
2. **Pacing audit** — walk the timeline, measure how long each distinct on-screen state holds,
   flag anything under 0.7 s that is not a flash or a chant beat, and anything over 6 s that is
   not a deliberate rest.
3. **Live-ball assertion** — no claim may ever land on an output whose broadcast is `live`,
   except tier 3.
6. **Layer assertion** — every addressable output reports a layer, and every stream carrying the
   same broadcast reports the same layer at the same instant.
4. **Cohort assertion** — screens sharing a receiver must be byte-identical every frame.
5. **Hand-back assertion** — audio returns to the exact held reference, and the picture returns
   before the feed does.

---

*Prepared from the design sessions and the four working prototypes. Figures marked (modelled)
are illustrative; items marked (verify) need confirming before they drive implementation.*
