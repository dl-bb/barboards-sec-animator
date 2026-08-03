/* ══════════════════════════════════════════════════════════════════════════
   BarBoards link — the command channel
   ══════════════════════════════════════════════════════════════════════════

   This carries ONE thing: which cue the wall should be showing. It does not
   carry timing, and it must never try to. Every output derives its frame from
   Date.now(), so a screen that hears about a cue late still renders the exact
   same frame as the others — it joins the cue already in progress, with no
   drift and nothing to catch up.

   Transport latency therefore cannot desync the wall. What it CAN do is make a
   transition ragged: if one screen switches 400 ms before another, the wall
   briefly shows two different cues. That is solved by `at` — a wall-clock
   instant to switch ON, sent with every command. Every output that has the
   command before `at` flips on the same tick, whatever the channel did.

   So the channel is allowed to be slow. It is not allowed to be wrong.
   WebSocket is offered because an operator's click should feel immediate; the
   1 Hz poll underneath it is the thing that actually guarantees delivery.

   A Durable Object rather than KV because a control panel needs read-your-
   writes. KV is eventually consistent (up to ~60 s globally), which would let
   an operator press a button, see nothing, and press it again.
   ══════════════════════════════════════════════════════════════════════════ */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-bb-key",
  "access-control-max-age": "86400"
};
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS
    }
  });

const FIELDS = ["type", "team", "opp", "layout", "gap", "rest", "epoch", "at"];
const DEFAULT_STATE = {
  seq: 0, type: "td", team: "TEX", opp: "OU",
  layout: "row4", gap: 0, rest: 2500, epoch: 1735689600000, at: 0, t: 0
};

export class Board {
  constructor(ctx) {
    this.ctx = ctx;
    this.state = null;
  }

  async load() {
    if (!this.state) this.state = (await this.ctx.storage.get("state")) || { ...DEFAULT_STATE };
    return this.state;
  }

  /* Outputs are tracked from their live sockets and from poll pings, so the
     control panel can show which screens are actually up without the operator
     walking the room. */
  async seenMap() {
    return (await this.ctx.storage.get("seen")) || {};
  }
  async note(tv) {
    if (tv === null || tv === undefined || tv === "") return;
    const seen = await this.seenMap();
    seen[String(tv)] = Date.now();
    await this.ctx.storage.put("seen", seen);
  }
  async liveOutputs() {
    const seen = await this.seenMap(), now = Date.now();
    const fromSockets = this.ctx.getWebSockets()
      .map(ws => { try { return (ws.deserializeAttachment() || {}).tv; } catch { return null; } })
      .filter(v => v !== null && v !== undefined);
    const fromPolls = Object.keys(seen).filter(k => now - seen[k] < 20000).map(Number);
    return [...new Set([...fromSockets.map(Number), ...fromPolls])]
      .filter(n => !isNaN(n)).sort((a, b) => a - b);
  }

  broadcast(payload) {
    const msg = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch { /* a dead socket is closed for us */ }
    }
  }

  async fetch(req) {
    const url = new URL(req.url);
    const s = await this.load();

    /* ── websocket: push, so a click feels immediate ── */
    if (req.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      /* hibernation API — the DO can be evicted between cues without dropping
         sockets, which is what keeps an idle wall on the free plan */
      this.ctx.acceptWebSocket(pair[1]);
      const tv = url.searchParams.get("hello");
      pair[1].serializeAttachment({ tv: tv === null ? null : Number(tv) });
      await this.note(tv);
      pair[1].send(JSON.stringify({ ...s, outputs: await this.liveOutputs(), now: Date.now() }));
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      for (const k of FIELDS) if (body[k] !== undefined) s[k] = body[k];
      /* seq must move on every accepted write, including one that sets identical
         values — otherwise a deliberate re-fire is indistinguishable from no
         change, and the replay button silently does nothing. */
      s.seq = (s.seq || 0) + 1;
      s.t = Date.now();
      this.state = s;
      await this.ctx.storage.put("state", s);
      const out = { ...s, outputs: await this.liveOutputs(), now: s.t };
      this.broadcast(out);
      return json(out);
    }

    await this.note(url.searchParams.get("hello"));
    return json({ ...s, outputs: await this.liveOutputs(), now: Date.now() });
  }

  /* Outputs send nothing but keepalives; the attachment already identifies them. */
  async webSocketMessage(ws, msg) {
    if (msg === "ping") { try { ws.send("pong"); } catch {} return; }
    try {
      const m = JSON.parse(msg);
      if (m && m.hello !== undefined) {
        ws.serializeAttachment({ tv: Number(m.hello) });
        await this.note(m.hello);
      }
    } catch { /* ignore anything that is not ours */ }
  }
  async webSocketClose(ws, code, reason, wasClean) {
    try { ws.close(code, reason); } catch {}
  }
  async webSocketError() {}
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);

    if (url.pathname === "/state" || url.pathname === "/ws") {
      /* A write key is optional. Without one, anybody who knows the URL can drive
         the wall; with one, the operator pastes it into the control panel once.
         Reads stay open so an output needs no secret baked into its URL. */
      if (req.method === "POST" && env.BB_KEY) {
        const k = req.headers.get("x-bb-key") || url.searchParams.get("key");
        if (k !== env.BB_KEY) return json({ error: "forbidden" }, 403);
      }
      const id = env.BOARD.idFromName(url.searchParams.get("room") || "default");
      return env.BOARD.get(id).fetch(req);
    }

    if (url.pathname === "/") {
      return new Response(
        "BarBoards link OK\n\n" +
        "GET  /state?room=default&hello=1  → current cue, live outputs\n" +
        "GET  /ws?room=default&hello=1     → same, pushed (websocket)\n" +
        "POST /state?room=default          → {type,team,opp,layout,gap,at}\n\n" +
        "`at` is a wall-clock ms timestamp. Outputs switch ON it, not on arrival,\n" +
        "so transport lag cannot make a transition ragged.\n",
        { headers: { "content-type": "text/plain; charset=utf-8", ...CORS } }
      );
    }
    return json({ error: "not found" }, 404);
  }
};
