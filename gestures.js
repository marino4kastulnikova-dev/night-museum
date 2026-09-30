// Night Museum — gesture engine (v2, tuned after the first real-camera test).
// Pure logic: feed it one frame of MediaPipe results at a time, get discrete events back.
// No DOM, no MediaPipe imports, so it can be unit-tested with synthetic landmarks.
//
// Frame:  { t: ms, hands: [{ landmarks: [{x,y,z}×21], gesture: 'Open_Palm'|..., score }], pose?: [...33] | null }
// Coordinates are MediaPipe image coordinates (0..1, un-mirrored); the preview is mirrored like a selfie.
//
// Events:
//   { type: 'next' | 'prev' }               swipe, one step per deliberate movement
//   { type: 'palm-progress', value 0..1 }   open palm being held still
//   { type: 'pause' }                       open palm held still long enough (toggle)
//   { type: 'pinch-progress', value 0..1 }  pinch being held
//   { type: 'select' }                      pinch confirmed
//   { type: 'close', via }                  two open hands held (or crossed arms, experimental)
//   { type: 'hand', present }               hand appeared / lost for > HAND_LOST_MS
//
// v2 changes: stillness and drift are measured on the palm centre relative to hand size
// (the wrist point jitters near the frame edge), "open hand" also uses finger geometry
// (the classifier's Open_Palm score is often ~0.5–0.7 live), a pinch is allowed even when the
// classifier says Open_Palm (the "OK" pose), and gestures stay quiet longer after closing.
(function (root) {
  const CFG = {
    SWIPE_WINDOW_MS: 450,
    SWIPE_MIN_DX: 0.18,          // frame widths
    SWIPE_MAX_DY_RATIO: 0.7,
    SWIPE_COOLDOWN_MS: 700,
    SWIPE_OPPOSITE_BLOCK_MS: 1100,
    PALM_MIN_SCORE: 0.5,         // classifier score that alone counts as open
    PALM_HOLD_MS: 450,
    PALM_STILL: 0.45,            // max palm-centre wobble during the hold, in palm sizes
    PALM_COOLDOWN_MS: 1200,
    PINCH_ENTER: 0.35,           // thumb–index distance / palm size
    PINCH_EXIT: 0.5,
    PINCH_HOLD_MS: 180,
    PINCH_STILL: 0.7,            // palm sizes of drift allowed while pinching
    PINCH_COOLDOWN_MS: 900,
    CLOSE_HOLD_MS: 500,
    AFTER_CLOSE_QUIET_MS: 1500,
    HAND_LOST_MS: 3000,
  };

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const palmSize = (lm) => Math.max(dist(lm[0], lm[9]), dist(lm[5], lm[17]) * 1.2, 1e-6);
  const centre = (lm) => { const ids = [0, 5, 9, 13, 17]; let x = 0, y = 0; ids.forEach(i => { x += lm[i].x; y += lm[i].y; }); return { x: x / 5, y: y / 5 }; };
  // four fingers straight: tip farther from the wrist than the middle joint
  const fingersOut = (lm) => [[8, 6], [12, 10], [16, 14], [20, 18]].filter(([tip, pip]) => dist(lm[tip], lm[0]) > dist(lm[pip], lm[0]) * 1.12).length;

  class GestureEngine {
    constructor(opts = {}) { this.cfg = Object.assign({}, CFG, opts); this.mode = 'gallery'; this.reset(); }
    reset() {
      this.track = []; this.lastSwipeT = -1e9; this.lastSwipeDir = 0;
      this.palmBuf = []; this.palmLatched = false; this.lastPalmT = -1e9; this.palmShown = 0;
      this.pinchStart = null; this.pinchAnchor = null; this.pinching = false; this.pinchFired = false; this.lastPinchT = -1e9;
      this.closeStart = null; this.closeVia = null; this.lastCloseT = -1e9;
      this.handPresent = false; this.lastHandT = -1e9; this.debug = {};
    }
    setMode(mode, t) {
      if (mode === this.mode) return;
      this.mode = mode;
      this.track = []; this.palmBuf = []; this.pinching = false; this.pinchStart = null; this.closeStart = null;
      if (mode === 'gallery' && t != null) this.lastCloseT = t;
    }
    isOpen(h, ratio) {
      const lm = h.landmarks;
      return ratio > this.cfg.PINCH_EXIT && ((h.gesture === 'Open_Palm' && h.score >= this.cfg.PALM_MIN_SCORE) || fingersOut(lm) >= 4);
    }

    update(frame) {
      const c = this.cfg, t = frame.t, out = [];
      const hands = (frame.hands || []).filter(h => h && h.landmarks && h.landmarks.length === 21);

      if (hands.length) { this.lastHandT = t; if (!this.handPresent) { this.handPresent = true; out.push({ type: 'hand', present: true }); } }
      else if (this.handPresent && t - this.lastHandT > c.HAND_LOST_MS) { this.handPresent = false; out.push({ type: 'hand', present: false }); }
      if (this.mode === 'off') return out;

      // ---------- expanded: only close ----------
      if (this.mode === 'expanded') {
        const open = hands.filter(h => this.isOpen(h, dist(h.landmarks[4], h.landmarks[8]) / palmSize(h.landmarks)));
        let via = open.length >= 2 ? 'palms' : null;
        if (!via && frame.pose && this.armsCrossed(frame.pose)) via = 'arms';
        this.debug = { mode: 'expanded', openHands: open.length };
        if (via) {
          if (!this.closeStart) { this.closeStart = t; this.closeVia = via; }
          if (t - this.closeStart >= c.CLOSE_HOLD_MS) { out.push({ type: 'close', via: this.closeVia }); this.closeStart = null; this.lastCloseT = t; }
        } else this.closeStart = null;
        return out;
      }

      // ---------- gallery ----------
      if (t - this.lastCloseT < c.AFTER_CLOSE_QUIET_MS) { this.track = []; this.palmBuf = []; return out; }
      if (!hands.length) { this.track = []; this.clearPalm(out); this.palmLatched = false; this.endPinch(out); return out; }

      const h = hands.slice().sort((a, b) => Math.abs(centre(a.landmarks).x - 0.5) - Math.abs(centre(b.landmarks).x - 0.5))[0];
      const lm = h.landmarks, ps = palmSize(lm), cRaw = centre(lm);
      const cs = { x: 1 - cRaw.x, y: cRaw.y }; // screen space (mirrored)
      const ratio = dist(lm[4], lm[8]) / ps;
      const open = this.isOpen(h, ratio);
      this.debug = { gesture: h.gesture, score: +(h.score || 0).toFixed(2), pinch: +ratio.toFixed(2), fingers: fingersOut(lm), open, size: +ps.toFixed(3) };

      this.track.push({ t, x: cs.x, y: cs.y });
      while (this.track.length && t - this.track[0].t > c.SWIPE_WINDOW_MS) this.track.shift();

      // ---- pinch (before swipe; a pinch never reads as a swipe) ----
      if (!this.pinching && ratio < c.PINCH_ENTER) { this.pinching = true; this.pinchStart = t; this.pinchAnchor = cs; this.pinchFired = false; }
      else if (this.pinching && ratio > c.PINCH_EXIT) this.endPinch(out);
      if (this.pinching) {
        this.clearPalm(out);
        if (dist(cs, this.pinchAnchor) > c.PINCH_STILL * ps) { this.pinchStart = t; this.pinchAnchor = cs; out.push({ type: 'pinch-progress', value: 0 }); }
        else if (!this.pinchFired && t - this.lastPinchT > c.PINCH_COOLDOWN_MS) {
          const p = Math.min(1, (t - this.pinchStart) / c.PINCH_HOLD_MS);
          out.push({ type: 'pinch-progress', value: p });
          if (p >= 1) { out.push({ type: 'select' }); this.pinchFired = true; this.lastPinchT = t; }
        }
        this.track = [];
        return out;
      }

      // ---- swipe ----
      if (this.track.length >= 3 && t - this.lastSwipeT > c.SWIPE_COOLDOWN_MS) {
        const a = this.track[0], b = this.track[this.track.length - 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        this.debug.dx = +dx.toFixed(3);
        if (Math.abs(dx) >= c.SWIPE_MIN_DX && Math.abs(dy) < c.SWIPE_MAX_DY_RATIO * Math.abs(dx)) {
          const dir = dx < 0 ? -1 : 1;
          const isReturn = dir === -this.lastSwipeDir && t - this.lastSwipeT < c.SWIPE_OPPOSITE_BLOCK_MS;
          if (!isReturn) { out.push({ type: dir < 0 ? 'next' : 'prev' }); this.lastSwipeT = t; this.lastSwipeDir = dir; }
          this.track = []; this.clearPalm(out);
          return out;
        }
      }

      // ---- open palm held still → pause (toggle) ----
      if (open && !this.palmLatched && t - this.lastPalmT > c.PALM_COOLDOWN_MS) {
        this.palmBuf.push({ t, x: cs.x, y: cs.y });
        // keep only the recent stretch in which the palm stayed within PALM_STILL of where it is now
        const lim = c.PALM_STILL * ps;
        while (this.palmBuf.length && (t - this.palmBuf[0].t > c.PALM_HOLD_MS + 150 || dist(this.palmBuf[0], cs) > lim)) this.palmBuf.shift();
        const held = t - this.palmBuf[0].t;
        const p = Math.min(1, held / c.PALM_HOLD_MS);
        if (p > 0.15 || this.palmShown) { out.push({ type: 'palm-progress', value: p }); this.palmShown = p; }
        if (p >= 1) { out.push({ type: 'pause' }); this.lastPalmT = t; this.palmLatched = true; this.palmBuf = []; this.palmShown = 0; }
      } else if (!open) {
        this.clearPalm(out); this.palmLatched = false; // palm must drop before it can toggle again
      }
      return out;
    }

    clearPalm(out) { this.palmBuf = []; if (this.palmShown) { out.push({ type: 'palm-progress', value: 0 }); this.palmShown = 0; } }
    endPinch(out) {
      if (this.pinching && !this.pinchFired) out.push({ type: 'pinch-progress', value: 0 });
      this.pinching = false; this.pinchStart = null; this.pinchFired = false;
    }

    // Experimental: wrists crossed in front of the chest (Pose Landmarker, 33 points).
    armsCrossed(p) {
      const LS = p[11], RS = p[12], LW = p[15], RW = p[16], LH = p[23], RH = p[24];
      if (!LS || !RS || !LW || !RW) return false;
      if ((LW.visibility ?? 1) < 0.5 || (RW.visibility ?? 1) < 0.5) return false;
      const shoulderW = Math.abs(LS.x - RS.x) || 1e-6;
      const crossed = (RW.x - LW.x) > 0.15 * shoulderW; // un-mirrored: person's left is image right
      const top = Math.min(LS.y, RS.y) - 0.1;
      const bottom = LH && RH ? Math.max(LH.y, RH.y) : Math.max(LS.y, RS.y) + 0.5;
      return crossed && [LW, RW].every(w => w.y > top && w.y < bottom);
    }
  }

  root.NMGestureEngine = GestureEngine;
  root.NM_GESTURE_CONFIG = CFG;
  if (typeof module !== 'undefined') module.exports = { GestureEngine, CFG, fingersOut, palmSize };
})(typeof window !== 'undefined' ? window : globalThis);
