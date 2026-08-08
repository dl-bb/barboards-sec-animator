# Renderer context — BarBoards

Every factual claim below is traceable to a file in this repo. Paths are
repo-relative; line numbers are 1-indexed against the working tree at the time of
writing and will drift as the file changes — search for the quoted code, not the
number. The primary file is `sec-push-animator.html`, a single HTML file with one
inline `<script>` (~10,000 lines). Sentences that are inference rather than
something read directly begin with `INFERRED:`.

---

## 1. What this project does

BarBoards drives a wall of televisions in a bar with animated cues — touchdowns,
chants, house bits — themed to sixteen college football schools. Every screen
derives its own frame from the wall clock rather than from a sync protocol, so
screens never talk to each other and cannot drift (`sec-push-animator.html:515`).
Animation logic lives in functions called *grammars*, each turning a normalised
time `u = 0..1` into a flat display list of primitives. A *renderer* consumes
that list and produces pixels. This document specifies the renderer boundary so
several renderers can be written independently and swapped.

---

## 2. The interface contract

This is the part that cannot drift. Everything in this section is copied verbatim
from source.

### 2.1 The factory — REQUIRED

`sec-push-animator.html:2474`

```js
function makeRenderer(cv){
```

One argument: an `HTMLCanvasElement`. The reference implementation acquires its
context immediately (`sec-push-animator.html:2479`):

```js
  var ctx=cv.getContext("2d",{alpha:false, desynchronized:DESYNC});
```

The factory returns an object literal — this is the whole public surface
(`sec-push-animator.html:2963`):

```js
  return {resize:resize, viewports:viewports, draw:draw, geo:geo, prewarm:prewarm,
          ctx:function(){ return ctx; }};
```

A variant must return an object with these six keys. All are REQUIRED except as
noted per-method below.

Production call sites, all of which pass a freshly created `<canvas>`:
`sec-push-animator.html:3203`, `:8319`, `:8735`, `:8997`, `:9713`, `:9752`,
`:9763`, `:9957`.

INFERRED: returning `null` is a permitted failure signal — the bench harness at
`sec-push-animator.html:3252` guards with `try{ R2=mk(cv); }catch(e){}` followed
by `if(!R2){ ... return {backend:label,unavailable:true}; }`, and
`makeGLRenderer` returns `null` on context or link failure
(`sec-push-animator.html:3422`, `:3432`). No production call site checks for
`null`.

### 2.2 `resize(screenW, screenH, c, dpr)` — REQUIRED

`sec-push-animator.html:2511`

```js
  function resize(screenW, screenH, c, dpr){
    return viewports([{ox:0,oy:0,w:screenW,h:screenH,cell:c}], screenW, screenH, dpr);
  }
```

`c` is a cell rect `{x,y,w,h}` in canvas fractions, produced by `geoOf(L).rect(cell)`
(`sec-push-animator.html:2371`). Returns whatever `viewports` returns.

### 2.3 `viewports(list, canvasW, canvasH, dpr)` — REQUIRED

`sec-push-animator.html:2515`

```js
  function viewports(list, canvasW, canvasH, dpr){
    DPR=Math.min(dpr||1,2)*RSCALE;
    CW=canvasW; CH=canvasH;
    cv.width=Math.round(CW*DPR); cv.height=Math.round(CH*DPR);
    cv.style.width=CW+"px"; cv.style.height=CH+"px";
    VPS=list.map(function(v){
      var w=v.w/v.cell.w, h=v.h/v.cell.h;      /* the whole wall, in CSS px */
      return {ox:v.ox, oy:v.oy, sw:v.w, sh:v.h, cell:v.cell,
              W:w, H:h, vx0:v.cell.x*w, vy0:v.cell.y*h,
              vx1:v.cell.x*w+v.w, vy1:v.cell.y*h+v.h};
    });
    /* the first viewport is what geo() reports, for the single-screen case */
    var f0=VPS[0]||{W:0,H:0,sw:0,sh:0,cell:c};
    W=f0.W; H=f0.H; SW=f0.sw; SH=f0.sh; cell=f0.cell;
    vx0=f0.vx0; vy0=f0.vy0; vx1=f0.vx1; vy1=f0.vy1;
    lastKey=""; vigA=-1; scanA=-1; lgrads={}; invalidate();
    return {W:W,H:H,SW:SW,SH:SH};
  }
```

Input element shape: `{ox, oy, w, h, cell}` where `cell` is `{x,y,w,h}`.
Return: `{W,H,SW,SH}` — `W`/`H` are the whole wall in CSS pixels, `SW`/`SH` this
screen's own size. `RSCALE` is a global from `?scale=`
(`sec-push-animator.html:583`). `DPR` is clamped to a maximum of 2 before scaling.

### 2.4 `geo()` — REQUIRED

`sec-push-animator.html:2533`

```js
  function geo(){ return {W:W,H:H,SW:SW,SH:SH,DPR:DPR,cell:cell}; }
```

Consumed by the smoothness report (`sec-push-animator.html:8617`) as
`R.geo().DPR`.

### 2.5 `prewarm(walk, key)` — REQUIRED to exist

`sec-push-animator.html:2547`

```js
  function prewarm(walk, key){
    if(!W||!H) return 0;
    var sig=(key||"")+"|"+Math.round(W)+"x"+Math.round(H);
    if(warmed[sig]) return 0;                 /* never warm the same thing twice */
    warmed[sig]=1;
    var seen={}, n=0;
    ctx.setTransform(DPR,0,0,DPR,0,0);
    ctx.globalAlpha=0.004; ctx.fillStyle="#000";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    walk(function(fr){
      var ls=fr&&fr.layers; if(!ls) return;
      for(var j=0;j<ls.length;j++){
        var l=ls[j]; if(l.k!=="word"||!l.t) continue;
        var bk=bucketOf(l), k=l.t+"|"+bk+"|"+(l.track||0);
        if(seen[k]) continue;
        seen[k]=1; n++;
        setLS((l.track&&HAS_LS)?((l.track*bk)+"px"):"0px");
        setFont("400 "+bk+"px Anton,'Arial Narrow',sans-serif");
        ctx.fillText(l.t, SW/2, SH/2);
      }
    });
    ctx.globalAlpha=1; invalidate(); lastKey="";
    return n;
  }
```

`walk` is a function taking a callback that receives one frame at a time. The
only production call (`sec-push-animator.html:8341`) is wrapped in `try/catch`
and ignores the return value:

```js
  try{ R.prewarm(function(cb){ eachCueFrame(ev,L,FX,cb); }, ev.id+"|"+L.id+"|"+FX); }catch(e){}
```

The method must exist and must not throw destructively. A no-op returning `0` is
conformant — the work it does is an optimisation, not a behaviour.

### 2.6 `ctx()` — REQUIRED

`sec-push-animator.html:2964`. Returns the underlying 2D context. Used by the
build-time render assertion to read pixels back
(`sec-push-animator.html:9967`): `var d=R.ctx().getImageData(0,0,64,36).data;`

INFERRED: a variant not backed by a canvas 2D context has no way to satisfy this
truthfully; the conformance check in §6 depends on it.

### 2.7 `draw(f, screenSpec)` — REQUIRED

`sec-push-animator.html:2652`. Signature and return contract:

```js
  function draw(f, screenSpec){
    var layers=f.layers||[], sh=f.shake, i, l, n=layers.length, drawn=0;
```

Two return shapes. The still-frame skip (`sec-push-animator.html:2709`):

```js
    var key=f.rest ? ("rest|"+(f.C&&f.C.ev?f.C.ev.id:"")+"|"+SW+"x"+SH+"|"+vig) : "";
    if(key && key===lastKey && !screenSpec) return {layers:n,drawn:0,skipped:true};
```

The normal return (`sec-push-animator.html:2756`):

```js
    return {layers:n, drawn:drawn, screens:VPS.length};
```

`drawn` counts layers actually rasterised. The build-time assertion fails a
renderer whose `drawn` is falsy for a visible layer
(`sec-push-animator.html:9966`): `if(!st.drawn) fails.push("render: "+p.name+" drew nothing");`

`screenSpec` may be an array indexed per viewport, or a single object
(`sec-push-animator.html:2750`):

```js
      var spec = screenSpec && (screenSpec.length!==undefined ? screenSpec[v] : screenSpec);
      if(spec) drawScreen(spec, vp);
```

### 2.8 The frame object — the input to `draw()`

Produced by `frameAt(ev,L,ms,fx)` at `sec-push-animator.html:8165`:

```js
function frameAt(ev,L,ms,fx){
  var C=makeCtx(ev,L);
  /* the rest lockup is deliberately undecorated — the gap between loops is a
     rest, and a rest that sparkles is not a rest */
  if(ms>=ev.d) return Object.assign(restFrame(C),{u:1,rest:true,C:C});
  var u=cl(ms/ev.d,0,1);
  if(ev.ramp) u=rampU(u,ev.ramp[0],ev.ramp[1],ev.ramp[2]);
  var f=(G[ev.cue]||G.runacross)(u,C);
  f.u=u; f.rest=false; f.C=C;
  return fxDecorate(f, ev, C, fx===undefined?FX:fx);
}
```

Fields a renderer reads:

| field | source | required of renderer |
|---|---|---|
| `f.layers` | grammar return, `sec-push-animator.html:3785` | REQUIRED — the display list |
| `f.rest` | `:8169`, `:8178` | REQUIRED — enables the still-frame skip |
| `f.C` | `:8169`, `:8178` | OPTIONAL — used only to build the skip cache key at `:2709` |
| `f.shake` | `fxDecorate`, `:7545` | REQUIRED — see §3 rule 7 |
| `f.screens` | grammar return, e.g. `:5470` | OPTIONAL — the caller indexes it, not the renderer |
| `f.u`, `f.phase`, `f.beat`, `f.fxOff` | `:8178`, `:5470`, `:7489` | not read by the renderer |

The grammar contract is stated at `sec-push-animator.html:3785`:

```
   Each returns {layers:[], screens:[], phase:"name"} from u alone.
```

`f.shake` shape (`sec-push-animator.html:7545`):

```js
    f.shake={x:Math.sin(imp*47)*sh, y:Math.cos(imp*63)*sh};
```

Applied by the renderer as a translation in wall units
(`sec-push-animator.html:2728`):

```js
      ox=vp.ox-vx0+(sh?sh.x*W:0); oy=vp.oy-vy0+(sh?sh.y*H:0);
```

### 2.9 The layer display list — REQUIRED

Authoritative source is `drawLayer` at `sec-push-animator.html:2762`. Every layer
is a plain object with a `k` discriminator. Universal alpha handling
(`sec-push-animator.html:2763`):

```js
    var a=(l.a===undefined?1:l.a);
    if(a<=0.004) return false;
```

`drawLayer` returns `true` if anything was rasterised, `false` if culled
(`sec-push-animator.html:2759`).

**All eleven drawn kinds, with their exact case lines:**

| `k` | line | fields read |
|---|---|---|
| `qr` | `:2772` | `l.t`, `l.x`, `l.y`, `l.h` |
| `fill` | `:2791` | `l.col` |
| `flash` | `:2792` | *(none — colour forced to `#ffffff`)* |
| `band` | `:2799` | `l.x`, `l.y`, `l.w`, `l.h`, `l.col`, `l.rot`, `l.skew`, `l.sc` |
| `cell` | `:2800` | identical to `band` — shares the case body |
| `dot` | `:2841` | `l.x`, `l.y`, `l.r`, `l.col` |
| `ring` | `:2851` | `l.x`, `l.y`, `l.r`, `l.col`, `l.w` |
| `lgrad` | `:2858` | `l.x`, `l.y`, `l.w`, `l.h`, `l.c0`, `l.c1`, `l.dir` |
| `glow` | `:2868` | `l.x`, `l.y`, `l.r`, `l.col` |
| `tri` | `:2876` | `l.x`, `l.y`, `l.w`, `l.h`, `l.col`, `l.dir` |
| `word` | `:2886` | `l.t`, `l.x`, `l.y`, `l.h`, `l.col`, `l.fit`, `l.track`, `l.sc`, `l.rot` |

**Two kinds are NOT drawn on the canvas.** `vig` and `scan` are skipped in the
layer loop (`sec-push-animator.html:2740`):

```js
        if(l.k==="vig"||l.k==="scan") continue;
```

They are collected in a pre-pass (`sec-push-animator.html:2663`):

```js
    for(i=0;i<n;i++){
      l=layers[i];
      if(l.k==="vig") vig=Math.max(vig,l.a===undefined?1:l.a);
      else if(l.k==="scan") scan=Math.max(scan,l.a===undefined?1:l.a);
      else if((l.k==="fill"||l.k==="flash")&&(l.a===undefined||l.a>=0.999)) start=i;
    }
```

and applied as opacity on two DOM siblings of the canvas
(`sec-push-animator.html:2491`):

```js
  function overlayEls(){
    if(vigEl||!cv.parentNode) return;
    vigEl=document.createElement("div"); vigEl.className="fxvig";
    scanEl=document.createElement("div"); scanEl.className="fxscan";
    cv.parentNode.insertBefore(vigEl, cv.nextSibling);
    cv.parentNode.insertBefore(scanEl, vigEl.nextSibling);
  }
```

The CSS for those classes is at `sec-push-animator.html:123`–`:126`.

**Exact geometry, copied from the case bodies.** Note which axis each fraction
multiplies:

`band`/`cell` (`sec-push-animator.html:2801`):
```js
        x=l.x*W; y=l.y*H; w=l.w*W; h=l.h*H;
```

`dot` (`:2842`), `ring` (`:2852`), `glow` (`:2869`) — **radius scales on `W`, not `H`**:
```js
        r=l.r*W; x=l.x*W; y=l.y*H;
```

`ring` line width is in **pixels**, not fractions (`:2852`):
```js
        r=l.r*W; x=l.x*W; y=l.y*H; w=(l.w||3);
```
```js
        s=splitCol(l.col); ctx.globalAlpha=a*s.a; ctx.strokeStyle=s.c; ctx.lineWidth=w;
```

`tri` (`:2877`, `:2881`) — `l.x` is the **centre**, `dir:"down"` inverts:
```js
        w=l.w*W; h=l.h*H; x=l.x*W; y=l.y*H;
```
```js
        if(l.dir==="down"){ ctx.moveTo(x-w/2,y); ctx.lineTo(x+w/2,y); ctx.lineTo(x,y+h); }
        else { ctx.moveTo(x-w/2,y+h); ctx.lineTo(x+w/2,y+h); ctx.lineTo(x,y); }
```

`lgrad` direction (`:2861`, `:2581`):
```js
        var LG=lgradFor(l.c0,l.c1,l.dir||"v",w,h);
```
```js
    g = dir==="h" ? ctx.createLinearGradient(0,0,wb,0)
                  : ctx.createLinearGradient(0,0,0,hb);
```

`word` sizing (`:2887`) — font size comes from `H`, `fit` clamps against `W`:
```js
        fs=l.h*H;
        tw=natW(l.t,l.track||0)*fs/100;
        if(l.fit && tw>l.fit*W){ fs=fs*(l.fit*W)/tw; tw=l.fit*W; }
        sc=(l.sc===undefined?1:l.sc);
```

`word` is drawn centred on `(x,y)` with `textBaseline="middle"`
(`:2904`, `:2909`, `:2926`). `l.track` is in **em**, converted at `:2908`:
```js
          setLS((l.track*bk)+"px");
```

`fill`/`flash` fill only the visible window, never the whole wall (`:2793`):
```js
        s=splitCol(l.k==="flash"?"#ffffff":l.col);
        ctx.globalAlpha=a*s.a; ctx.fillStyle=s.c;
        /* only the visible window, never the whole wall */
        ctx.fillRect(vx0,vy0,SW,SH);
```

**Alpha on `word` works exactly as it does on any other kind**, and there is a
correction in the source warning you off the opposite belief
(`sec-push-animator.html:4166`):

```
   An earlier note here said `word` has no `a` field and that alpha on type has
   to go through hexA() on the colour. That is not right, and it is worth being
   exact about because believing it costs you an afternoon: drawLayer reads
   `var a=(l.a===undefined?1:l.a)` before its switch and the `word` case applies
   it as `ctx.globalAlpha=a*s.a`, so `a` works on type exactly as it does on a
   band.
```

`a` is captured once at `sec-push-animator.html:2763` and multiplied into
`globalAlpha` in the `word` case at `:2894`. `hexA()`
(`sec-push-animator.html:3768`) also works and composes with `a`; both routes are
live in the cue set. Verified independently on this build: a white `word` over
black at `a` = 1.0 / 0.5 / 0.0 renders at mean channel value 44.3 / 22.3 / 0.

**Ordering hazard, stated in source** (`sec-push-animator.html:2768`):

```js
      /* `fill` shares its body with `flash` below and MUST NOT be separated from
         it. Inserting `qr` between them once made every fill in the app fall
         through into the QR branch, call qrSprite(undefined), and bail — which
         silently blanked the ground colour of every cue. */
```

### 2.10 The screen spec — the second argument to `draw()` — OPTIONAL

Authoritative source is `drawScreen` at `sec-push-animator.html:2936`:

```js
  function drawScreen(sp, vp){
    var X=vp?vp.ox:0, Y=vp?vp.oy:0, SWv=vp?vp.sw:SW, SHv=vp?vp.sh:SH;
    ctx.setTransform(DPR,0,0,DPR,X*DPR,Y*DPR);
    var s;
    if(sp.bg){ s=splitCol(sp.bg); ctx.globalAlpha=(sp.a===undefined?1:sp.a)*s.a;
               ctx.fillStyle=s.c; ctx.fillRect(0,0,SWv,SHv); }
    if(sp.dim){ ctx.globalAlpha=sp.dim; ctx.fillStyle=sp.tint||"#000"; ctx.fillRect(0,0,SWv,SHv); }
    if(sp.hair!==undefined&&sp.hair!==null){
      var inset=sp.hair*0.5*SWv;
      ctx.globalAlpha=(sp.hairA===undefined?1:sp.hairA);
      ctx.fillStyle="#EFE7DA";
      ctx.fillRect(inset,0,1,SHv); ctx.fillRect(SWv-inset-1,0,1,SHv);
    }
    if(sp.txt){
      var fs=SHv*(sp.txtH||0.3), bk=bucketFor(fs), k=fs/bk;
      ctx.globalAlpha=(sp.txtA===undefined?1:sp.txtA);
      ctx.fillStyle=sp.txtCol||"#fff";
      ctx.save(); ctx.translate(SWv/2,SHv/2); ctx.scale(k,k);
      ctx.font="400 "+bk+"px Anton, 'Arial Narrow', sans-serif";
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText(sp.txt,0,0); ctx.restore(); invalidate();
    }
    if(sp.flash){ ctx.globalAlpha=sp.flash; ctx.fillStyle=sp.flashCol||"#fff";
                  ctx.fillRect(0,0,SWv,SHv); }
    ctx.globalAlpha=1;
  }
```

Full field list: `bg`, `a`, `dim`, `tint`, `hair`, `hairA`, `txt`, `txtH`,
`txtA`, `txtCol`, `flash`, `flashCol`. It is drawn in **screen space, after the
wall** (`sec-push-animator.html:2935`). Live producers:
`sec-push-animator.html:5445`, `:5524`, `:5529`.

### 2.11 Colour space — REQUIRED

Two accepted forms. `splitCol` (`sec-push-animator.html:2427`) separates alpha
out of `rgba()` so caches stay small:

```js
function splitCol(c){
  if(COLC[c]) return COLC[c];
  var o={c:c,a:1}, m=/^rgba\(([^)]+)\)$/.exec(c);
  if(m){
    var p=m[1].split(",");
    o.a=parseFloat(p[3]); o.c="rgb("+p[0]+","+p[1]+","+p[2]+")";
  }
  COLC[c]=o; return o;
}
```

`rgbOf` (`sec-push-animator.html:1493`) parses **only** `#RRGGBB`:

```js
function rgbOf(h){ var n=parseInt(h.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; }
```

Helpers grammars use to build colours: `hexA(h,a)` at `sec-push-animator.html:3768`
and `mixHex(a,b,t)` at `:3774`. Effective alpha is always the product of the
layer's `a` and the colour's own alpha — e.g. `:2837`:
`ctx.globalAlpha=a*s.a;`

### 2.12 Layout and cell geometry — the inputs to `resize`

`sec-push-animator.html:2339`:

```js
function outsOf(L){ return L.outputs || L.cells.length; }
function cellOf(L,i){ return L.cells[L.mirror ? 0 : i]; }
```

`geoOf(L)` at `sec-push-animator.html:2342` returns
`{AW, AH, UW, UH, g, abs, rect}`. Two cell forms, both handled by `rect`
(`:2371`):

```js
    rect:function(c){
      return (c.uw!==undefined)
        ? {x:c.ux/maxX, y:c.uy/maxY, w:c.uw/maxX, h:c.uh/maxY}
        : {x:c.cx*(UW+g)/maxX, y:c.cy*(UH+g)/maxY, w:UW/maxX, h:UH/maxY};
    }
```

The layout table is `LAYOUTS` at `sec-push-animator.html:2224`; order is
`LAYORDER` at `:2330`. INFERRED: a renderer never reads a layout directly — it
receives only the `{x,y,w,h}` rect — so layout changes cannot break a variant.

### 2.13 The second existing implementation — a narrower surface

`makeGLRenderer(cv)` at `sec-push-animator.html:3418` implements only part of the
interface and is **not a production path** (`sec-push-animator.html:3397`):

```
   Opt in with ?gl=1. It is NOT the production path and is not trying to be —
```

INFERRED: the `?gl=1` flag described in that comment does not exist in the code;
`grep` finds no `Q.get("gl")`. The only callers of `makeGLRenderer` are the
comparison harnesses at `sec-push-animator.html:3267` and `:9657`.

Its surface: `api.isGL` (`:3486`), `api.gl()` (`:3487`), `api.resize(w,h,r,dpr)`
(`:3488`), `api.stats()` (`:3494`), `api.draw(fr)` (`:3495`), returning at `:3583`.
It has **no** `viewports`, `geo`, `prewarm` or `ctx`. It implements `fill`,
`flash`, `band`, `cell`, `lgrad`, `dot`, `glow`, `ring`, `tri`, `vig`
(`:3501`–`:3558`) and explicitly not the rest (`:3572`):

```js
        /* word, qr and scan are not implemented — see the note above */
        default: break;
```

Its `draw` returns a different shape (`sec-push-animator.html:3581`):

```js
    return {drawn:n>0,calls:1,verts:n};
```

`api.stats()` (`:3494`) is OPTIONAL and read defensively by the harness
(`:3262`): `if(R2.stats) o.drawCalls=R2.stats().calls;`

### 2.14 The swap point

The bench harness at `sec-push-animator.html:3247` is the only place in the repo
that treats a renderer as a substitutable factory, and it is the template for
swapping a variant in:

```js
  function run(mk,label){
    var cv=document.createElement("canvas");
    cv.style.cssText="position:fixed;left:-99999px;top:0";
    document.body.appendChild(cv);
    var R2=null;
    try{ R2=mk(cv); }catch(e){}
    if(!R2){ document.body.removeChild(cv); return {backend:label,unavailable:true}; }
```

used at `sec-push-animator.html:3267`:

```js
  var c2=run(makeRenderer,"canvas2d"), gl=run(makeGLRenderer,"webgl");
```

INFERRED: there is no registry, no config key and no URL parameter that selects a
renderer in production. The eight production call sites in §2.1 name
`makeRenderer` directly, so swapping a variant means substituting that binding.

---

## 3. Invariants

1. **A frame is a pure function of the clock.** `u` derives from `Date.now()`
   via `loopPos` (`sec-push-animator.html:721`) and `nowMs` (`:720`). Never
   accumulate state across frames that affects output, and never seed from
   page-load time. *Breaking it desyncs the room, invisibly on any one screen.*

2. **`draw()` must be callable at any `u` in any order.** The control room seeks
   and scrubs (`sec-push-animator.html:8571`). *Breaking it makes the preview
   disagree with the wall.*

3. **Call order is `factory → resize`/`viewports` → (`prewarm`) → `draw`\*.**
   `resize` precedes the first paint (`sec-push-animator.html:8334`) and repeats
   on every resize event (`:8339`, `:8340`); `prewarm` runs once after sizing
   (`:8341`). *`draw` before a size leaves `W`/`H` at 0 and renders nothing.*

4. **Single-threaded, synchronous.** `draw` runs inside `requestAnimationFrame`
   with its cost measured around the call (`sec-push-animator.html:8586`).
   *Returning before drawing completes reports a false frame time and breaks
   every benchmark in the file.*

5. **Coordinates are fractions of the whole wall, not of the screen.** `x`/`w`
   multiply by `W`, `y`/`h` by `H`, and `W`/`H` are the whole wall in CSS px
   (`sec-push-animator.html:2521`). *Using screen dimensions makes a cue that
   runs across six panels restart on each one.*

6. **Radius scales on `W`; `ring` line width is pixels.** `sec-push-animator.html:2842`,
   `:2852`. *Getting this wrong makes circles elliptical on a non-16:9 wall.*

7. **`f.shake` is a wall-unit translation applied to the whole viewport**, not a
   per-layer offset (`sec-push-animator.html:2728`). *Applying it per-layer tears
   the picture apart on impact frames.*

8. **`vig` and `scan` must not be rasterised into the canvas.** They are DOM
   overlay opacity (`sec-push-animator.html:2740`, `:2491`). *Drawing them costs
   a full-screen pass per frame on a tiler; the reference build deliberately
   moved them off the canvas.*

9. **Alpha is the product of `l.a` and the colour's own alpha**, and layers at
   `a<=0.004` are dropped entirely (`sec-push-animator.html:2763`). *Diverging
   makes every fade look different from the reference.*

10. **`drawn` must be truthful.** The build-time assertion fails on `!st.drawn`
    (`sec-push-animator.html:9966`). *A renderer that always reports success
    passes the assertion while drawing nothing — that bug shipped once and
    blanked every cue.*

11. **Budget: 16.67 ms per frame at 60 Hz on a QCS6490 / Adreno 643.** The
    reference renderer's measured JS cost is 0.1–2.9 ms (`PERF-HANDOFF.md:16`).
    *Overrunning drops frames — judder, highly visible on a wall of screens all
    showing the same motion.*

12. **Errors must be contained.** `prewarm`'s only production call is wrapped in
    `try/catch` (`sec-push-animator.html:8341`); `draw` is not. *An exception
    from `draw` kills the rAF loop and freezes the screen until someone reloads
    it — on hardware nobody can physically reach.*

---

## 4. Reference implementation

**The interface — study these:**

- `sec-push-animator.html:2474`–`:2965` — `makeRenderer`, the whole canvas2d
  renderer. This is the working example.
- `sec-push-animator.html:2762`–`:2933` — `drawLayer`. The authoritative layer
  schema; every field a variant must honour is read here.
- `sec-push-animator.html:2936`–`:2961` — `drawScreen`. The authoritative screen-spec
  schema.
- `sec-push-animator.html:2652`–`:2757` — `draw`. Viewport loop, clip, cull,
  return contract.
- `sec-push-animator.html:8165`–`:8180` — `frameAt`. Produces every frame a
  renderer will ever see.
- `sec-push-animator.html:2342`–`:2376` — `geoOf`. Produces the cell rect passed
  to `resize`.
- `sec-push-animator.html:9950`–`:9975` — the render assertion. The conformance
  gate; see §6.
- `sec-push-animator.html:3418`–`:3584` — `makeGLRenderer`. A worked example of a
  *partial* implementation against the same display list.
- `sec-push-animator.html:3247`–`:3268` — `run`/`glCompare`. The factory-swap
  template and the A/B measurement harness.

**Incidental to the canvas2d implementation — a variant need not reproduce any of it:**

- `sec-push-animator.html:2411`–`:2422` — `MEAS`/`natW`, hidden-DIV text
  measurement.
- `sec-push-animator.html:2438`–`:2442` — `BUCKETS`/`bucketFor`, glyph-atlas size
  quantisation.
- `sec-push-animator.html:2444`–`:2446` — `SINT`/`fsin`, sine lookup table.
- `sec-push-animator.html:2451` — `GADV`, per-glyph advance cache.
- `sec-push-animator.html:2471` — `HAS_LS`, `ctx.letterSpacing` feature probe.
- `sec-push-animator.html:2486`–`:2488` — `setFont`/`setLS`/`invalidate`, font
  memoisation.
- `sec-push-animator.html:2576`–`:2585` — `lgradFor`, gradient cache.
- `sec-push-animator.html:2602`–`:2625` — `glowFor`, quantised radial-glow sprite
  cache.
- `sec-push-animator.html:2637`–`:2650` — `drawDotRun`, batched particle path.
- `sec-push-animator.html:2683`–`:2705` — the consecutive-full-fill folding pass.
- `sec-push-animator.html:2454`–`:2467` — `qrSprite`, QR bitmap cache.

**Supporting files:**

- `PERF-HANDOFF.md` — measured device numbers, the cost ladder, and the
  browser-side blockers.
- `worker/src/index.js` — the command channel. Carries which cue to show, never
  timing. No renderer involvement.
- `index.html` — redirect shim to `sec-push-animator.html`.
- `README.md` — project-level documentation.
- `.claude/launch.json` — the dev-server definition used in §6.

---

## 5. Free to vary

Anything not named in §2 or §3. Specifically:

- **The drawing technology.** Canvas2D, WebGL, WebGPU, OffscreenCanvas, SVG or
  DOM are all admissible provided the six-key object in §2.1 is returned and the
  layer semantics in §2.9 are preserved.
- **Every cache and every optimisation** listed as incidental in §4. Glyph
  bucketing, glow sprites, gradient caching, dot batching and fill folding are
  implementation choices, not contract.
- **Culling strategy.** The reference rejects by bounding box against
  `vx0/vy0/vx1/vy1`. A variant may cull differently or not at all, so long as
  `drawn` stays truthful (§3 rule 10).
- **The still-frame skip.** `{skipped:true}` at `sec-push-animator.html:2710` is
  an optimisation. A variant may redraw every frame.
- **Internal precision, colour interpolation and antialiasing**, within the
  tolerance the conformance check allows — the assertion permits ±6 per channel
  on the mean (`sec-push-animator.html:9971`).
- **`prewarm`'s body.** A no-op returning `0` is conformant (§2.5).
- **`stats()` and any other extra methods.** Additive keys are read defensively
  where they are read at all (`sec-push-animator.html:3262`).

---

## 6. Build, run, verify

There is no build step, no package manager and no dependency install. The
deliverable is a single static HTML file.

**Serve the repo root:**

```bash
python -m http.server 8000
```

Documented at `README.md:823`. The same command is what `.claude/launch.json`
runs as the `barboards-static` configuration, via `py -m http.server 8000 --bind 0.0.0.0`.

**Open one output:**

```bash
open "http://localhost:8000/sec-push-animator.html?tv=1&event=td-tex&layout=row4"
```

That URL is from `README.md:826`. Omitting `?tv=` opens the control room instead
(`sec-push-animator.html:9990`).

**The conformance check.** `audit()` (`sec-push-animator.html:9809`) runs
automatically on load, but **only when the page is not an output**
(`sec-push-animator.html:9988`):

```js
if(!Q.has("tv") && !Q.has("patron")) audit();
```

So load the control room — `http://localhost:8000/sec-push-animator.html` — and
read the browser console. Pass looks like:

```
BarBoards audit — 61 types × 16 schools = 976 events, 38064 frames, 14 layouts, 51 grammars — pass
```

Failures print via `console.error` with a `✗` per failure
(`sec-push-animator.html:9979`).

**The part that tests a renderer** is the render assertion at
`sec-push-animator.html:9955`. It is the conformance gate for a variant:

```js
      var cv=document.createElement("canvas");
      var R=makeRenderer(cv);
      R.resize(64,36,{x:0,y:0,w:1,h:1},1);
      var probes=[
        {name:"opaque fill", layers:[{k:"fill",col:"#BF5700"}], want:[191,87,0]},
        {name:"flash",       layers:[{k:"flash"}],              want:[255,255,255]},
        {name:"full band",   layers:[{k:"band",x:0,y:0,w:1,h:1,col:"#12331B"}], want:[18,51,27]}
      ];
      probes.forEach(function(p){
        var st=R.draw({layers:p.layers,u:0},null);
        if(!st.drawn) fails.push("render: "+p.name+" drew nothing");
        var d=R.ctx().getImageData(0,0,64,36).data;
```

Point that block at a variant factory and it becomes the variant's conformance
test. Note it constructs the canvas **without appending it to the DOM**, so
`cv.parentNode` is `null` and the `vig`/`scan` overlay path at
`sec-push-animator.html:2492` returns early — this check does not exercise them.

**A/B measurement between two variants** — `glCompare` at
`sec-push-animator.html:3267` already runs two factories over an identical
display list and reports p50/p95/p99/max per backend. It is reachable from the
control-room console as `glbench(opts)` (`sec-push-animator.html:9614`). It
filters `word`, `qr` and `scan` out of both sides
(`sec-push-animator.html:3243`), so its numbers describe geometry only.

**Deploying the command channel** (not needed to build a renderer):
`wrangler deploy` from `worker/`, per `README.md:502`. The optional write key is
the `BB_KEY` environment variable, read at `worker/src/index.js:152`; there is no
credential in the repo.

---

## 7. Known dead ends

- **Retained-mode DOM painter.** Up to 131 positioned elements per screen,
  restyled every frame; the DOM was the entire cost (`sec-push-animator.html:2382`).
- **Rasterising the whole wall and cropping with `overflow:hidden`.** 4× the
  pixels on a row of four, 26.9× on the reference room (`sec-push-animator.html:2389`).
- **Batching rectangles into one path.** Tried and reverted — broke the picture
  and measured slower; the flyover knee fell from load 12 to 3 and p99 at load 4
  went 0.7 → 8.4 ms (`sec-push-animator.html:2630`).
- **Extending occlusion to bands covering a viewport.** Tried twice and reverted
  both times; the per-viewport rescan cost 9.7 ms a frame on the 3D flyover
  (`sec-push-animator.html:2655`).
- **Porting to WebGL/three.js.** Canvas2D measured 2.23× faster than the WebGL
  backend on the same display list on the target device (`PERF-HANDOFF.md:123`).
- **Reducing overdraw via `?scale=`.** 89 full-canvas translucent layers cost
  0.5 ms at p99; fill is free on this tiler (`PERF-HANDOFF.md:64`).
- **Removing `--in-process-gpu`.** Two "after" runs disagreed with each other
  more than with "before"; the flag had never actually been removed
  (`PERF-HANDOFF.md:127`).
- **Refresh-rate mismatch between heads.** Both report exactly 60.000 Hz; the
  "51 vs 61 Hz" reading was the project's own cadence estimator failing
  (`PERF-HANDOFF.md:116`).
- **Per-glyph `fillText` stepping for tracked text.** Kept only as a fallback:
  30.75 µs versus 1.25 µs for one call with `ctx.letterSpacing`, a 24.6× penalty
  (`sec-push-animator.html:2468`).

---

## 8. Open questions

Decide these deliberately; do not assume the reference is right.

1. **`PERF-HANDOFF.md:74` contradicts the code.** It says the `word` path
   "caches by an exact key … so nearly every request is a new key and pays full
   rasterisation," proposing bucketing as an unlanded fix. But
   `sec-push-animator.html:2897` already does `bk=bucketFor(fs)` and builds the
   font string from `bk`, and `prewarm` keys on `bucketOf(l)` (`:2560`). Decide
   which is current before optimising against the claim.

2. **`ring.w` is in pixels while every other dimension is a canvas fraction**
   (`sec-push-animator.html:2852`). Deliberate or oversight is stated nowhere.
   Existing cues were authored against the reference behaviour.

3. **`vig`/`scan` silently do nothing when the canvas has no parent**
   (`sec-push-animator.html:2492`). Rasterise them as a fallback, or match the
   reference and drop them? Undefined.

4. **`f.shake` has one producer** (`sec-push-animator.html:7545`, in
   `fxDecorate`) and no test. Its sign convention, and whether it should be
   clamped, are undocumented.

5. **No renderer selection mechanism exists.** §2.14 — swapping means rebinding
   `makeRenderer` at eight call sites. Registry, URL parameter or separate
   builds: agree this once across variants rather than per-variant.

6. **`draw` is not wrapped in `try/catch` at the call site**
   (`sec-push-animator.html:8586`). Catch internally and degrade, or propagate
   and freeze? §3 rule 12 gives the consequence, not the policy.

7. **The `{skipped:true}` return omits `screens`** (`sec-push-animator.html:2710`
   versus `:2756`). No consumer reads `screens`; INFERRED: harmless today, but do
   not rely on the field being present.

8. **The conformance check covers three layer kinds out of thirteen**
   (`sec-push-animator.html:9960`) — nothing for `word`, `qr`, `glow`, `lgrad`,
   `tri`, `ring`, `dot`, `cell`, `vig` or `scan`. Extending it is the obvious
   first task, and worth doing once for everyone rather than five times.
