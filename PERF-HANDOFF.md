# Frame-rate investigation — consolidated state

**As of v1.0054.** Everything below was measured on the target hardware
(QCS6490, Adreno 643, Ubuntu 24.04, Mesa 25.2.8 freedreno, QtWebEngine under
PySide6), not inferred and not measured on a desktop. Where a number came from
a desktop it says so.

Target: **stable 60 fps with a minimum of 60 across the whole of every
animation.** Currently ~10–24% dropped frames.

---

## 1. The conclusion

**Our rendering is not the bottleneck.** The page's own JavaScript costs
0.1–2.9 ms per frame against a 16.67 ms budget. The browser spends 27–41 ms
per frame outside our code, and blames itself every sample.

There is **one real bug left on our side** (§4) and **two blockers on the
browser side** (§5) that no amount of renderer work can reach.

---

## 2. What the device actually reports

Four samples, both heads, `#dev` HUD:

| | js/frame | browser/frame | avg fps | drops |
|---|---|---|---|---|
| head0 | 0.90 ms | 27.30 ms | 48 | 24.2% |
| head1 | 0.20 ms | 27.00 ms | 47 | 21.3% |
| head0 | 2.90 ms | 33.80 ms | 50 | 18.3% |
| head0 | 0.10 ms | **41.20 ms** | 51 | 16.3% |

That 41 ms frame was a near-black screen with giant flat glyphs — see §4.

**Empty rAF loop, nothing drawn at all**, three runs of the same config:

    drops   0.8%  →  1.3%  →  10.5%
    p99    16.8ms →  33.2ms →  33.4ms

A 33 ms p99 with no workload cannot be the renderer. The run-to-run spread is
also larger than any effect measured all session — **single samples here are
worthless**, which invalidated two earlier conclusions (§6).

---

## 3. The cost ladder — what this silicon charges for

`?event=lad-calls | lad-fill | lad-state | lad-text`, `?load=1..40`.
One request from the panel runs the whole table:

    LINK.measure(1,"sweep",{layout:"pair",loads:[1,4,12,28]},120000)

Result at load 28, 1920x1080, pair:

| axis | layers | p50 | p95 | **p99** | max |
|---|---|---|---|---|---|
| calls | 1685 | 0.8 | 4.8 | 6.8 | 6.8 |
| fill | 89 | 0.2 | 0.4 | **0.5** | 0.5 |
| state | 1125 | 3.5 | 7.9 | 8.4 | 8.4 |
| **text** | 341 | 3.4 | 4.1 | **26.6** | 26.6 |

- **Fill is free.** 89 full-canvas translucent layers cost 0.5 ms. Overdraw is
  not a problem on this tiler. This also kills `?scale=` as a fix.
- **Text is the outlier, and it is a TAIL, not a mean.** p95 4.1 → p99 26.6 is
  a 6x cliff. 341 text layers cost more at p99 than 1685 rectangles.
- **State changes** are the highest steady cost but never catastrophic.

---

## 4. The one open bug on our side

**Glyph cache misses.** The `word` path caches by an exact key, but `fit` and
`sc` produce continuously varying sizes, so nearly every request is a new key
and pays full rasterisation.

This is the *same shape* as the glow-cache bug fixed in v1.0047, which was
costing 18.2 ms p95 on the train: `glowFor()` keyed on the exact colour string
while cues fade glows through a continuous ramp, so every puff of every frame
missed, allocated a 256x256 canvas and filled a radial gradient. Quantising the
key to 16 levels per channel took draw p95 **18.2 → 2.2 ms**. No animation
changed.

**Proposed fix:** quantise the glyph cache's *size bucket* (round to ~1/16 of
canvas height). Alpha and position stay exact; only the cache key coarsens.

**How to verify:** `?event=lad-text&load=28`. Success is p99 collapsing toward
p95 — 26.6 → ~5 ms.

**Expected benefit:** removes the spike on lockup frames with big type. It will
*not* take drops to zero; the floor in §5 is browser-side.

---

## 5. The browser-side blockers — neither reachable from the page

1. **`--in-process-gpu` cannot be removed.** QtWebEngine appends it after any
   user flags, so `QTWEBENGINE_CHROMIUM_FLAGS` cannot override it. GPU work runs
   in the browser process, so a GPU stall blocks the renderer.
2. **Direct Rendering Display Compositor: Disabled.** An extra composite pass
   every frame at 1080p, on two heads.

Confirmed working and worth keeping: Vulkan enabled, **Skia GaneshVulkan**
(init 212 → 129 ms), Canvas/Compositing/Rasterization/WebGL all hardware
accelerated. Nothing is falling back to software.

**If these two cannot change, a hard min-60 is not achievable on this stack.**
The only in-page route around a broken rAF delivery is compositor-driven CSS
(§7).

---

## 6. Ruled out — do not re-investigate

- **Refresh mismatch between heads.** `weston.ini` pins 1920x1080@60 on both;
  the compositor reports exactly 60.000 Hz on each. The "51 Hz vs 61 Hz" that
  suggested otherwise was **our own cadence estimator failing** — it infers Hz
  from the gap histogram and degrades when frames are irregular. Trust
  `modetest` / the compositor, not that number.
- **CSS paint cost (blur, backdrop-filter, box-shadow, border-radius).** Those
  are control-room styles. A `?tv=N` page is one `<canvas>` and nothing else.
- **Porting to WebGL/three.js.** Measured on the device: canvas2d is **2.23x
  faster** than our WebGL backend on the same display list. `makeGLRenderer` is
  bench-only, called from `glbench()`, never a production path.
- **Overdraw / `?scale=`.** See §3 — fill is free.
- **`--in-process-gpu` removal improving things.** Two "after" runs disagreed
  with each other more than with "before". The flag had never actually been
  removed (§5.1); the apparent improvement was run-to-run variance.

---

## 7. If the browser stack cannot change

Compositor-driven CSS. Chromium runs `transform` and `opacity` keyframes on the
compositor thread, off the main thread and independent of `requestAnimationFrame`
delivery. Our sync model maps onto it exactly:

    animation: cue 8s linear infinite;
    animation-delay: -3421ms;   /* negative delay = phase-locked to the wall clock */

Set once per cue, no per-frame JS, nothing to drift. Constraint: only transform
and opacity are compositor-cheap — colour, size and text changes fall back to
the main thread.

This is **not** the retained-mode DOM painter removed early in the project. That
restyled ~131 elements from JS every frame. This declares once and touches
nothing per frame.

**Test before committing to it:** build one cue both ways, run them side by side
on the two heads, same wall clock. If the CSS one is smooth while canvas
stutters, rAF delivery is the ceiling and this is the way out. If both stutter,
the problem is below both and renderers stop mattering.

---

## 8. The test harness

Everything runs on the device over MQTT; no console needed there.

    room u3tmgx54az   ·   broker.hivemq.com   ·   ROTATE THIS, it is the only secret

From the control panel console:

    LINK.deviceReport(1, 45000)                    // GPU, live fps, browser floor, GL, verdict
    LINK.measure(1,"sweep",{loads:[1,4,12,28]})    // the whole cost ladder, one reply
    LINK.measure(1,"soak",{seconds:30})            // presented frames over time
    LINK.measure(1,"frame",{cue:"train"})          // build vs draw, split
    LINK.cmd("hard",0)                             // cache-busting reload of every output

**Loop:** push to GitHub → wait for Pages → `cmd("hard",0)` → reload the panel
too → measure.

### Harness rules learned the hard way

- **Check panel build == output build before every run.** Version skew between
  the panel and the TVs silently broke three runs.
- **Gate the syntax check as its own step before `git commit`.** v1.0046 shipped
  unparseable because the check printed FAIL and the chained commit ran anyway.
- **Never put JS regex literals through a shell heredoc.** Backslashes are
  stripped; that is what broke v1.0046. Write patch scripts to a file.
- **Never put backticks in a `git commit -m` message.** Bash runs them as
  command substitution and silently deletes the word. v1.0056 shipped with
  three words missing from its message before being amended. Same class as the
  heredoc bug: write the message to a file and use `-F`.
- **`#dev` forces BENCH**, which adds the `#tvbench` overlay. It perturbs what
  it measures — keep it on both sides of any A/B.
- **Take five samples, not one.** See §2.
- **head1/DP-1 renders `tv=1`, head0/HDMI-A-1 renders `tv=2`** — crossed versus
  the physical arrangement. Timing-neutral, but fix before reasoning about
  left/right.

---

## 9. Fixes already landed that should not be regressed

| | |
|---|---|
| v1.0047 | glow sprite cache quantised — train draw p95 **18.2 → 2.2 ms** |
| v1.0044 | rotated bands use one composed matrix instead of `save`/`restore` |
| v1.0043 | consecutive full-canvas fills folded into one pass; rolling 3 s drop counter in `#dev` |
| v1.0027 | clock discipline — outputs agree to **±1 ms** over a 268 ms broker hop |

None of these changed an animation.
