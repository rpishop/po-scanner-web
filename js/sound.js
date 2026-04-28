/* ═══════════════════════════════════════════
   Sound & Vibration Feedback
   ═══════════════════════════════════════════ */

const Sound = {
  _ctx: null,

  _getContext() {
    if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this._ctx;
  },

  _beep(freq, duration, type = 'sine') {
    try {
      const ctx = this._getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = 0.3;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
      osc.stop(ctx.currentTime + duration / 1000);
    } catch (e) { /* ignore */ }
  },

  success() {
    this._beep(1200, 150);
    this.vibrateSuccess();
  },

  error() {
    this._beep(300, 300, 'square');
    this.vibrateError();
  },

  maxReached() {
    this._beep(800, 100);
    setTimeout(() => this._beep(600, 100), 120);
    this.vibrateError();
  },

  vibrateSuccess() {
    if (navigator.vibrate) navigator.vibrate(100);
  },

  vibrateError() {
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  }
};
