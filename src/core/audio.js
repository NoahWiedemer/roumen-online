// Tiny WebAudio synth for sound effects and a gentle procedural background tune
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxVol = 0.5;
    this.musicVol = 0.22;
    this.musicOn = true;
    this._musicTimer = null;
  }
  // must be called from a user gesture
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master);
    this.music = this.ctx.createGain(); this.music.gain.value = this.musicVol; this.music.connect(this.master);
    // shared noise buffer
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.musicOn) this.startMusic();
  }
  setSfx(v) { this.sfxVol = v; if (this.sfx) this.sfx.gain.value = v; }
  setMusic(v) { this.musicVol = v; if (this.music) this.music.gain.value = v; }

  tone(freq, dur, { type = 'sine', vol = 0.3, attack = 0.005, slide = 0, delay = 0, dest = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noiseBurst(dur, { vol = 0.3, freq = 1200, q = 1, type = 'bandpass', slide = 1, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide !== 1) f.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'swing': this.noiseBurst(0.18, { vol: 0.25, freq: 900, q: 0.8, slide: 3 }); break;
      case 'swingBig': this.noiseBurst(0.35, { vol: 0.35, freq: 500, q: 0.7, slide: 4 }); break;
      case 'hit': this.noiseBurst(0.12, { vol: 0.45, freq: 500, q: 1.2, type: 'lowpass' }); this.tone(140, 0.12, { type: 'triangle', vol: 0.35, slide: 0.5 }); break;
      case 'crit': this.noiseBurst(0.2, { vol: 0.5, freq: 700, q: 1, type: 'lowpass' }); this.tone(220, 0.25, { type: 'square', vol: 0.12, slide: 0.4 }); this.tone(880, 0.15, { type: 'triangle', vol: 0.1, delay: 0.02 }); break;
      case 'miss': this.noiseBurst(0.14, { vol: 0.12, freq: 2400, q: 2, slide: 0.6 }); break;
      case 'hurt': this.tone(200, 0.15, { type: 'sawtooth', vol: 0.08, slide: 0.6 }); this.noiseBurst(0.1, { vol: 0.2, freq: 300, type: 'lowpass' }); break;
      case 'slime': this.tone(420, 0.18, { type: 'sine', vol: 0.18, slide: 0.5 }); break;
      case 'die': this.tone(500, 0.35, { type: 'triangle', vol: 0.18, slide: 0.3 }); this.noiseBurst(0.3, { vol: 0.12, freq: 800, slide: 0.3 }); break;
      case 'stomp': this.tone(70, 0.4, { type: 'sine', vol: 0.6, slide: 0.5 }); this.noiseBurst(0.35, { vol: 0.4, freq: 250, type: 'lowpass' }); break;
      case 'coin': this.tone(1318, 0.08, { type: 'square', vol: 0.06 }); this.tone(1760, 0.18, { type: 'square', vol: 0.06, delay: 0.07 }); break;
      case 'pickup': this.tone(660, 0.08, { type: 'triangle', vol: 0.15 }); this.tone(990, 0.12, { type: 'triangle', vol: 0.15, delay: 0.06 }); break;
      case 'potion': this.tone(500, 0.25, { type: 'sine', vol: 0.15, slide: 2 }); this.noiseBurst(0.2, { vol: 0.05, freq: 3000, q: 3 }); break;
      case 'buff': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.1, delay: i * 0.06 })); break;
      case 'shout': this.tone(160, 0.5, { type: 'sawtooth', vol: 0.12, slide: 1.4 }); this.noiseBurst(0.5, { vol: 0.15, freq: 600, q: 0.8 }); break;
      case 'levelup': [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.6, { type: 'triangle', vol: 0.12, delay: i * 0.09 })); this.tone(262, 1.2, { type: 'sine', vol: 0.15, delay: 0.1 }); break;
      case 'quest': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.3, { type: 'square', vol: 0.05, delay: i * 0.1 })); break;
      case 'click': this.tone(1200, 0.04, { type: 'triangle', vol: 0.08 }); break;
      case 'open': this.tone(700, 0.06, { type: 'triangle', vol: 0.07 }); this.tone(1050, 0.08, { type: 'triangle', vol: 0.07, delay: 0.04 }); break;
      case 'close': this.tone(900, 0.05, { type: 'triangle', vol: 0.07 }); this.tone(600, 0.07, { type: 'triangle', vol: 0.07, delay: 0.04 }); break;
      case 'error': this.tone(180, 0.18, { type: 'square', vol: 0.06 }); break;
      case 'jump': this.tone(300, 0.15, { type: 'sine', vol: 0.12, slide: 1.8 }); break;
      case 'buzz': this.tone(180 + Math.random() * 40, 0.3, { type: 'sawtooth', vol: 0.03 }); break;
      case 'teleport': this.tone(300, 0.8, { type: 'sine', vol: 0.15, slide: 4 }); this.noiseBurst(0.8, { vol: 0.08, freq: 2000, q: 2, slide: 3 }); break;
      // title intro
      case 'roar': this.tone(95, 1.1, { type: 'sawtooth', vol: 0.22, attack: 0.08, slide: 0.55 }); this.tone(140, 0.9, { type: 'square', vol: 0.08, attack: 0.1, slide: 0.6 }); this.noiseBurst(1.1, { vol: 0.3, freq: 420, q: 0.7, slide: 0.5 }); break;
      case 'fire': this.noiseBurst(1.3, { vol: 0.35, freq: 900, q: 0.5, type: 'lowpass', slide: 0.4 }); this.noiseBurst(1.0, { vol: 0.15, freq: 2600, q: 1.2, slide: 0.5, delay: 0.1 }); break;
      case 'meow': this.tone(620, 0.35, { type: 'triangle', vol: 0.1, slide: 1.4 }); this.tone(860, 0.25, { type: 'triangle', vol: 0.08, slide: 0.7, delay: 0.18 }); break;
      case 'poof': this.noiseBurst(0.5, { vol: 0.3, freq: 1400, q: 0.6, slide: 0.3 }); this.tone(240, 0.25, { type: 'sine', vol: 0.12, slide: 0.5 }); break;
      case 'glint': [1760, 2637, 3520].forEach((f, i) => this.tone(f, 0.25, { type: 'sine', vol: 0.06, delay: i * 0.05 })); break;
      // Cumbot 9000
      case 'hoho': for (let i = 0; i < 3; i++) { this.tone(150 - i * 8, 0.3, { type: 'sawtooth', vol: 0.13, attack: 0.03, slide: 0.75, delay: i * 0.34 }); this.noiseBurst(0.25, { vol: 0.08, freq: 420, q: 2, delay: i * 0.34 }); }
        this.bells(0.95); break;
      case 'jingle': this.bells(0); break;
      case 'thud': this.tone(58, 0.28, { type: 'sine', vol: 0.35, slide: 0.6 }); this.noiseBurst(0.2, { vol: 0.22, freq: 180, type: 'lowpass' }); break;
      case 'quake': this.tone(42, 1.0, { type: 'sine', vol: 0.7, slide: 0.6 }); this.noiseBurst(0.9, { vol: 0.5, freq: 220, type: 'lowpass', slide: 0.5 }); this.tone(90, 0.5, { type: 'square', vol: 0.05, slide: 0.4 }); break;
      case 'mortar': this.tone(95, 0.3, { type: 'sine', vol: 0.45, slide: 0.5 }); this.noiseBurst(0.5, { vol: 0.2, freq: 500, q: 0.8, slide: 3 }); this.tone(300, 0.5, { type: 'sine', vol: 0.05, slide: 2.5, delay: 0.05 }); break;
      case 'splat': this.noiseBurst(0.35, { vol: 0.4, freq: 600, type: 'lowpass', slide: 0.4 }); this.tone(170, 0.25, { type: 'sine', vol: 0.18, slide: 0.35 }); break;
      case 'charge': this.tone(160, 1.8, { type: 'sawtooth', vol: 0.05, attack: 0.4, slide: 6 }); this.tone(320, 1.8, { type: 'sine', vol: 0.06, attack: 0.4, slide: 6 }); break;
      case 'beam': this.noiseBurst(1.5, { vol: 0.16, freq: 1600, q: 3, slide: 0.7 }); this.tone(620, 1.5, { type: 'square', vol: 0.035, slide: 0.85 }); this.tone(930, 1.5, { type: 'sine', vol: 0.05, slide: 1.2 }); break;
      case 'hypno': for (let i = 0; i < 5; i++) this.tone(440 * (i % 2 ? 1.26 : 1), 0.5, { type: 'sine', vol: 0.06, delay: i * 0.22, slide: 1.1 }); break;
      case 'powerdown': this.tone(700, 2.2, { type: 'sawtooth', vol: 0.09, slide: 0.06 }); this.tone(350, 2.2, { type: 'square', vol: 0.04, slide: 0.08 }); this.noiseBurst(1.2, { vol: 0.12, freq: 900, slide: 0.3 }); break;
      case 'zap': this.noiseBurst(0.08, { vol: 0.12, freq: 3200, q: 4 }); this.tone(1800 + Math.random() * 900, 0.06, { type: 'square', vol: 0.03 }); break;
    }
  }

  // sleigh bells
  bells(delay) {
    for (let i = 0; i < 9; i++) this.tone([2093, 2637, 3136, 2349][i % 4], 0.22, { type: 'triangle', vol: 0.045, delay: delay + i * 0.07 + Math.random() * 0.03 });
  }

  // gentle looping tune: pentatonic melody over a I–vi–IV–V progression
  startMusic() {
    if (!this.ctx || this._musicTimer) return;
    const bpm = 96, beat = 60 / bpm;
    const chords = [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]];
    const scale = [523.3, 587.3, 659.3, 784.0, 880.0, 1046.5];
    let bar = 0;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const melody = [];
    for (let b = 0; b < 8; b++) {
      const line = [];
      for (let i = 0; i < 8; i++) line.push(rnd() < 0.72 ? scale[Math.floor(rnd() * scale.length)] : 0);
      melody.push(line);
    }
    const schedule = () => {
      if (!this.ctx) return;
      const ch = chords[bar % 4];
      const t0 = 0.05;
      ch.forEach((f, i) => this.tone(f / 2, beat * 4, { type: 'triangle', vol: 0.05, attack: 0.2, delay: t0 + i * 0.02, dest: this.music }));
      for (let i = 0; i < 4; i++) this.tone(ch[i % 3], beat * 0.9, { type: 'sine', vol: 0.035, delay: t0 + i * beat, dest: this.music });
      const line = melody[bar % 8];
      line.forEach((f, i) => { if (f) this.tone(f, beat * 0.6, { type: 'triangle', vol: 0.045, attack: 0.01, delay: t0 + i * beat * 0.5, dest: this.music }); });
      bar++;
    };
    schedule();
    this._musicTimer = setInterval(schedule, beat * 4 * 1000);
  }
  stopMusic() { clearInterval(this._musicTimer); this._musicTimer = null; }
}
