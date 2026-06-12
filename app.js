/* =========================================================================
   RhythmIQ Megacode Simulator
   - Shared state synced via Firebase Realtime Database (free, anonymous)
   - Falls back to localStorage + BroadcastChannel for same-device testing
   ========================================================================= */

// ---- FIREBASE CONFIG ----------------------------------------------------
// This is a public, free Firebase Realtime Database used only to relay
// small JSON state packets between the monitor and controller. No personal
// data is stored. If this project is taken down, replace FIREBASE_CONFIG
// with your own free Firebase project's config (Realtime Database enabled).
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDE8vR8JE48sqrlYctF92oQzmWuuxmaUZ0",
  authDomain: "rhythmiq-sim.firebaseapp.com",
  databaseURL: "https://rhythmiq-sim-default-rtdb.firebaseio.com",
  projectId: "rhythmiq-sim",
  storageBucket: "rhythmiq-sim.firebasestorage.app",
  messagingSenderId: "764301941712",
  appId: "1:764301941712:web:df52ce477af0a6a590f7d5"
};

let fbReady = false;
let fbDb = null;
try {
  if (typeof firebase !== 'undefined' && FIREBASE_CONFIG.databaseURL.indexOf('xxxx') === -1) {
    firebase.initializeApp(FIREBASE_CONFIG);
    fbDb = firebase.database();
    fbReady = true;
  }
} catch(e) { console.warn('Firebase init failed, using local fallback', e); }

// Local fallback channel (works across tabs on the SAME device/browser)
const localChannel = ('BroadcastChannel' in window) ? new BroadcastChannel('rhythmiq-sim') : null;

// ---- DEFAULT STATE --------------------------------------------------------
const DEFAULT_STATE = {
  rhythm: 'sinus',
  hr: 80,
  pr: 80,
  sys: 120,
  dia: 80,
  spo2: 98,
  rr: 16,
  co2: 35,
  temp: 37.0,
  arrest: false,
  ts: Date.now()
};

let state = Object.assign({}, DEFAULT_STATE);
let role = null; // 'monitor' | 'controller'
let roomCode = null;

// ---- ROUTING ---------------------------------------------------------------
function showRoomEntry(r){
  role = r;
  document.getElementById('roomEntryTitle').textContent =
    r === 'monitor' ? 'Enter the room code shown by your instructor (or generate one to start):'
                     : 'Enter the room code to connect the controller:';
  document.getElementById('roomEntry').style.display = 'flex';
}

function randomRoom(){
  const code = Math.random().toString(36).substring(2,6).toUpperCase();
  document.getElementById('roomCodeInput').value = code;
}

function enterRoom(){
  let code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if(!code){ randomRoom(); code = document.getElementById('roomCodeInput').value; }
  roomCode = code;
  localStorage.setItem('rhythmiq_room', roomCode);
  localStorage.setItem('rhythmiq_role', role);

  // URL params so it can be opened directly / shared
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomCode);
  url.searchParams.set('role', role);
  history.replaceState(null, '', url.toString());

  startApp();
}

function startApp(){
  document.getElementById('landing').style.display = 'none';
  if(role === 'monitor'){
    document.getElementById('monitor').style.display = 'flex';
    document.getElementById('roomTagM').textContent = 'ROOM ' + roomCode;
    initMonitor();
  } else {
    document.getElementById('controller').style.display = 'block';
    document.getElementById('roomTagC').textContent = roomCode;
    initController();
  }
  initSync();
  startClock();
}

function openMonitorWindow(){
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomCode);
  url.searchParams.set('role', 'monitor');
  window.open(url.toString(), '_blank');
}

// Auto-resume from URL / localStorage
(function autoStart(){
  const params = new URLSearchParams(window.location.search);
  const r = params.get('room');
  const ro = params.get('role');
  if(r && (ro === 'monitor' || ro === 'controller')){
    roomCode = r; role = ro;
    startApp();
  }
})();

// ---- SYNC LAYER -------------------------------------------------------------
let lastWriteTs = 0;

function initSync(){
  setConnStatus(true); // local fallback is always "live"

  if(fbReady){
    const ref = fbDb.ref('rooms/' + roomCode);
    ref.on('value', (snap) => {
      const data = snap.val();
      if(!data) return;
      if(data.ts && data.ts === lastWriteTs) return; // ignore own echo timing collisions ok
      Object.assign(state, data);
      onStateUpdated();
      setConnStatus(true);
    }, (err) => {
      console.warn('Firebase sync error, using local fallback', err);
      setConnStatus(true, true);
    });
  }

  if(localChannel){
    localChannel.onmessage = (e) => {
      if(e.data && e.data.room === roomCode){
        Object.assign(state, e.data.state);
        onStateUpdated();
      }
    };
  }

  // Also poll localStorage as a final fallback (cross-tab same browser)
  setInterval(() => {
    try{
      const raw = localStorage.getItem('rhythmiq_state_' + roomCode);
      if(raw){
        const data = JSON.parse(raw);
        if(data.ts > state.ts){
          Object.assign(state, data);
          onStateUpdated();
        }
      }
    }catch(e){}
  }, 500);

  // If controller, push initial state so monitor has something
  if(role === 'controller'){
    pushState();
  }
}

function pushState(){
  state.ts = Date.now();
  lastWriteTs = state.ts;
  try{ localStorage.setItem('rhythmiq_state_' + roomCode, JSON.stringify(state)); }catch(e){}
  if(localChannel) localChannel.postMessage({room: roomCode, state: state});
  if(fbReady){
    fbDb.ref('rooms/' + roomCode).set(state).catch(e=>{
      setConnStatus(true, true);
    });
  }
}

function setConnStatus(ok, localOnly){
  const dotM = document.getElementById('connDotM');
  const txtM = document.getElementById('connTxtM');
  const dotC = document.getElementById('connDotC');
  const txtC = document.getElementById('connTxtC');
  const label = localOnly ? 'local sync only' : (ok ? 'connected' : 'offline');
  [dotM,dotC].forEach(d=>{ if(d){ d.className = 'dot ' + (ok?'live':'off'); }});
  if(txtM) txtM.textContent = label;
  if(txtC) txtC.textContent = label;
}

// ---- STATE -> UI ---------------------------------------------------------
function onStateUpdated(){
  if(role === 'monitor'){
    renderMonitorNumbers();
    updateRhythmLabel();
    updateClinicalFlags();
    syncEngineToState();
  } else {
    syncControllerUI();
  }
}

// ====================== MONITOR RENDERING =================================
function renderMonitorNumbers(){
  const arrest = state.arrest;
  setText('hrVal', fmtInt(state.hr));
  setText('sysVal', fmtInt(state.sys));
  setText('diaVal', fmtInt(state.dia));
  const map = state.sys && state.dia ? Math.round((state.sys + 2*state.dia)/3) : 0;
  setText('mapVal', state.sys ? `MAP ${map}` : 'MAP --');
  setText('spo2Val', state.spo2 > 0 ? fmtInt(state.spo2) : '--');
  setText('prVal', `PR ${state.pr > 0 ? fmtInt(state.pr) : '--'} bpm`);
  setText('rrVal', fmtInt(state.rr));
  setText('co2Val', fmtInt(state.co2));
  setText('tempVal', state.temp.toFixed(1));

  // Alarm condition: arrest, or critical thresholds
  const alarm = arrest || state.hr === 0 || state.hr > 150 || state.hr < 40 ||
                state.spo2 < 90 || state.sys < 80 || (state.sys>0 && state.dia===0 && state.sys===0);
  document.getElementById('alarmBanner').classList.toggle('show', alarm);

  // dim numerics that are flatlined
  document.getElementById('hrVal').style.color = state.hr === 0 ? '#ff5050' : '';
}

function updateRhythmLabel(){
  document.getElementById('rhythmLabel').textContent = RHYTHM_META[state.rhythm]?.label || state.rhythm;
}

function updateClinicalFlags(){
  const flag = document.getElementById('clinicalFlag');
  let msg = '';
  if(state.arrest) msg = 'CARDIAC ARREST — CPR IN PROGRESS';
  else if(state.pr === 0 && state.hr > 0 && state.sys === 0) msg = 'PULSELESS — CHECK PATIENT (PEA)';
  flag.textContent = msg;
  flag.classList.toggle('show', !!msg);
}

function fmtInt(v){ return (v===null||v===undefined||isNaN(v)) ? '--' : Math.round(v).toString(); }
function setText(id, txt){ const el = document.getElementById(id); if(el) el.textContent = txt; }

// ====================== CONTROLLER UI =====================================
function initController(){
  // wire slider initial values from state
  syncControllerUI();
}

function syncControllerUI(){
  setSliderVal('hr', state.hr);
  setSliderVal('pr', state.pr);
  setSliderVal('sys', state.sys);
  setSliderVal('dia', state.dia);
  setSliderVal('spo2', state.spo2);
  setSliderVal('rr', state.rr);
  setSliderVal('co2', state.co2);

  const tempSlider = document.getElementById('tempSlider');
  if(tempSlider) tempSlider.value = Math.round(state.temp*10);
  setText('tempCtrlVal', state.temp.toFixed(1));

  // rhythm buttons
  document.querySelectorAll('.rhythm-grid button').forEach(b=>{
    b.classList.toggle('active', b.dataset.rhythm === state.rhythm);
  });

  // arrest button
  const ab = document.getElementById('arrestBtn');
  if(state.arrest){
    ab.textContent = 'END CARDIAC ARREST / ROSC';
    ab.className = 'arrest-toggle stop';
  } else {
    ab.textContent = 'START CARDIAC ARREST';
    ab.className = 'arrest-toggle start';
  }
}

function setSliderVal(key, val){
  const slider = document.getElementById(key+'Slider');
  if(slider) slider.value = val;
  setText(key+'CtrlVal', Math.round(val));
}

function setParam(key, val){
  val = parseFloat(val);
  state[key] = val;
  setText(key+'CtrlVal', key==='temp' ? val.toFixed(1) : Math.round(val));
  pushState();
}

const STEP_SIZE = { hr:1, pr:1, sys:2, dia:2, spo2:1, rr:1, co2:1, temp:0.1 };
const STEP_MAX  = { hr:250, pr:250, sys:300, dia:200, spo2:100, rr:60, co2:99, temp:42.0 };
const STEP_MIN  = { hr:0, pr:0, sys:0, dia:0, spo2:0, rr:0, co2:0, temp:30.0 };

function step(key, dir){
  const s = STEP_SIZE[key] * (dir<0?-1:1);
  let v = state[key] + s;
  v = Math.max(STEP_MIN[key], Math.min(STEP_MAX[key], v));
  state[key] = (key==='temp') ? Math.round(v*10)/10 : Math.round(v);
  syncControllerUI();
  pushState();
}

function setRhythm(r){
  state.rhythm = r;
  // adjust HR to a typical default for that rhythm if instructor hasn't set one
  const meta = RHYTHM_META[r];
  if(meta && meta.suggestHR){
    state.hr = meta.suggestHR;
  }
  syncControllerUI();
  pushState();
}

function toggleArrest(){
  state.arrest = !state.arrest;
  if(state.arrest){
    // typical arrest defaults
    state.pr = 0; state.sys = 0; state.dia = 0; state.spo2 = 0; state.co2 = 12;
    if(['sinus','sinusTachy','sinusBrady','svt','afib','aflutter','avb1','avb2m1','avb2m2','avb3'].includes(state.rhythm)){
      // leave rhythm as-is unless asystole/VF selected by instructor
    }
  }
  syncControllerUI();
  pushState();
}

function applyScenario(name){
  if(name === 'pea'){
    state.rhythm = 'sinus';
    state.hr = 80; state.pr = 0; state.sys = 0; state.dia = 0; state.spo2 = 0;
    state.rr = 10; state.co2 = 8; state.arrest = true;
  } else if(name === 'rosc'){
    state.rhythm = 'sinus';
    state.hr = 90; state.pr = 90; state.sys = 120; state.dia = 80; state.spo2 = 98;
    state.rr = 16; state.co2 = 40; state.arrest = false;
  } else if(name === 'shock'){
    state.rhythm = 'sinusTachy';
    state.hr = 140; state.pr = 140; state.sys = 70; state.dia = 40; state.spo2 = 88;
    state.rr = 24; state.co2 = 30; state.arrest = false;
  } else if(name === 'stable'){
    Object.assign(state, DEFAULT_STATE, {ts: Date.now()});
  }
  syncControllerUI();
  pushState();
}

function resetAll(){
  Object.assign(state, DEFAULT_STATE, {ts: Date.now()});
  syncControllerUI();
  pushState();
}

// ====================== CLOCK =============================================
function startClock(){
  const el = document.getElementById('clock');
  if(!el) return;
  setInterval(()=>{
    const d = new Date();
    el.textContent = d.toLocaleTimeString();
  }, 1000);
}

/* =========================================================================
   WAVEFORM ENGINE
   Mathematically generated ECG, Pleth, Resp, CO2 waveforms.
   ========================================================================= */

const RHYTHM_META = {
  sinus:      { label:'Sinus Rhythm', suggestHR:80 },
  sinusTachy: { label:'Sinus Tachycardia', suggestHR:130 },
  sinusBrady: { label:'Sinus Bradycardia', suggestHR:45 },
  svt:        { label:'Supraventricular Tachycardia', suggestHR:180 },
  afib:       { label:'Atrial Fibrillation', suggestHR:110 },
  aflutter:   { label:'Atrial Flutter', suggestHR:130 },
  avb1:       { label:'1st Degree AV Block', suggestHR:70 },
  avb2m1:     { label:'2° AV Block – Mobitz I', suggestHR:60 },
  avb2m2:     { label:'2° AV Block – Mobitz II', suggestHR:50 },
  avb3:       { label:'3° AV Block (Complete)', suggestHR:40 },
  vtMono:     { label:'Monomorphic VT', suggestHR:170 },
  vtPoly:     { label:'Polymorphic VT', suggestHR:200 },
  torsades:   { label:'Torsades de Pointes', suggestHR:220 },
  vfCoarse:   { label:'Ventricular Fibrillation (Coarse)', suggestHR:0 },
  vfFine:     { label:'Ventricular Fibrillation (Fine)', suggestHR:0 },
  asystole:   { label:'Asystole', suggestHR:0 },
};

let engine = null;

function initMonitor(){
  engine = new WaveEngine();
  engine.start();
  renderMonitorNumbers();
  updateRhythmLabel();
  updateClinicalFlags();
}

function syncEngineToState(){
  if(engine) engine.setState(state);
}

class WaveEngine{
  constructor(){
    this.canvases = {
      ecg: document.getElementById('ecgCanvas'),
      pleth: document.getElementById('plethCanvas'),
      resp: document.getElementById('respCanvas'),
      co2: document.getElementById('co2Canvas'),
    };
    this.ctx = {};
    Object.keys(this.canvases).forEach(k=>{
      this.ctx[k] = this.canvases[k].getContext('2d');
    });
    this.resize();
    window.addEventListener('resize', ()=>this.resize());

    // sweep buffers: store value history for redraw as scrolling trace
    this.sweepSpeed = { ecg: 200, pleth: 120, resp: 40, co2: 40 }; // px/sec equivalent (logical units)
    this.t = 0; // global time accumulator (seconds)
    this.lastFrame = performance.now();

    // For ECG cycle tracking (Wenckebach etc.)
    this.beatIndex = 0;
    this.cycleTimer = 0;
    this.nextBeatTime = 0;

    // VF random walk seed
    this.vfPhase = 0;

    this.setState(state);
  }

  resize(){
    Object.keys(this.canvases).forEach(k=>{
      const c = this.canvases[k];
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.floor(rect.width * dpr));
      c.height = Math.max(1, Math.floor(rect.height * dpr));
      this.ctx[k].setTransform(dpr,0,0,dpr,0,0);
    });
  }

  setState(s){
    this.hr = s.hr;
    this.rhythm = s.rhythm;
    this.spo2 = s.spo2;
    this.pr = s.pr;
    this.rr = s.rr;
    this.co2level = s.co2;
    this.arrest = s.arrest;
  }

  start(){
    const loop = (now)=>{
      const dt = Math.min(0.05, (now - this.lastFrame)/1000);
      this.lastFrame = now;
      this.t += dt;
      this.draw(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  draw(dt){
    this.drawECG(dt);
    this.drawPleth(dt);
    this.drawResp(dt);
    this.drawCO2(dt);
  }

  // ---------------- ECG ----------------
  // Generates a continuous time-domain ECG signal y(t) based on selected rhythm,
  // then renders a scrolling window of the last N seconds.
  ecgValue(t){
    const hr = this.hr;
    const rhythm = this.rhythm;

    if(rhythm === 'asystole' || hr === 0 && rhythm!=='vfCoarse' && rhythm!=='vfFine'){
      if(rhythm === 'asystole') return this.flatline(t);
    }

    switch(rhythm){
      case 'sinus': case 'sinusTachy': case 'sinusBrady':
        return this.sinusBeat(t, hr, {pWave:true, qrsWidth:0.08});
      case 'svt':
        return this.sinusBeat(t, hr, {pWave:false, qrsWidth:0.07, narrow:true});
      case 'afib':
        return this.afib(t, hr);
      case 'aflutter':
        return this.aflutter(t, hr);
      case 'avb1':
        return this.sinusBeat(t, hr, {pWave:true, qrsWidth:0.09, prLong:true});
      case 'avb2m1':
        return this.mobitzI(t, hr);
      case 'avb2m2':
        return this.mobitzII(t, hr);
      case 'avb3':
        return this.completeBlock(t, hr);
      case 'vtMono':
        return this.vt(t, hr, false);
      case 'vtPoly':
        return this.vt(t, hr, true);
      case 'torsades':
        return this.torsades(t, hr);
      case 'vfCoarse':
        return this.vfib(t, 1.0);
      case 'vfFine':
        return this.vfib(t, 0.3);
      case 'asystole':
        return this.flatline(t);
      default:
        return this.sinusBeat(t, hr, {pWave:true, qrsWidth:0.08});
    }
  }

  flatline(t){
    return 0.02*Math.sin(t*0.5); // tiny baseline drift
  }

  // Core PQRST generator centered at beat phase 0..1 within RR interval
  pqrst(phase, opts){
    opts = opts || {};
    const pWave = opts.pWave !== false;
    const qrsWidth = opts.qrsWidth || 0.08; // fraction of RR
    const narrow = opts.narrow || false;
    const prLong = opts.prLong || false;

    let y = 0;
    // P wave
    if(pWave){
      const pCenter = prLong ? 0.18 : 0.12;
      const pWidth = 0.05;
      y += 0.15 * gauss(phase, pCenter, pWidth);
    }
    // QRS complex
    const qrsCenter = prLong ? 0.30 : 0.22;
    const qw = narrow ? qrsWidth*0.8 : qrsWidth;
    // Q dip
    y -= 0.1 * gauss(phase, qrsCenter - qw*0.6, qw*0.25);
    // R spike
    y += 1.0 * gauss(phase, qrsCenter, qw*0.3);
    // S dip
    y -= 0.25 * gauss(phase, qrsCenter + qw*0.6, qw*0.3);
    // T wave
    const tCenter = qrsCenter + 0.18;
    y += 0.3 * gauss(phase, tCenter, 0.06);

    return y;
  }

  sinusBeat(t, hr, opts){
    const rr = 60/hr;
    const phase = (t % rr) / rr;
    return this.pqrst(phase, opts);
  }

  afib(t, hr){
    // irregularly irregular RR, fibrillatory baseline, no P waves
    if(!this._afibBeats || this._afibBeatsHR !== hr){
      this._afibBeats = []; this._afibBeatsHR = hr;
      let tt = 0;
      for(let i=0;i<400;i++){
        const rr = (60/hr) * (0.6 + Math.random()*0.8);
        tt += rr;
        this._afibBeats.push(tt);
      }
    }
    const beats = this._afibBeats;
    let y = 0.06*Math.sin(t*2*Math.PI*7) + 0.04*Math.sin(t*2*Math.PI*11.3);
    for(const bt of beats){
      const d = t - bt;
      if(d > -0.05 && d < 0.35){
        const phase = (d+0.1)/0.35;
        y += this.pqrst(phase, {pWave:false, qrsWidth:0.07});
      }
    }
    return y;
  }

  aflutter(t, hr){
    // sawtooth flutter waves at ~300/min, QRS at hr
    const flutterFreq = 300/60;
    let y = 0.18 * sawtoothWave(t*flutterFreq);
    const rr = 60/hr;
    const phase = (t % rr)/rr;
    y += this.pqrst(phase, {pWave:false, qrsWidth:0.07});
    return y;
  }

  mobitzI(t, hr){
    // Wenckebach: progressively lengthening PR, then dropped QRS, cycle of 4
    const baseRR = 60/hr;
    if(!this._mobI || this._mobIHR!==hr){
      this._mobIHR = hr;
      // build beat schedule: 4 P waves, 3 QRS (drop the 4th)
      const beats = []; let tt=0;
      for(let cyc=0; cyc<100; cyc++){
        const prDelays = [0.14,0.18,0.24,0.32];
        for(let i=0;i<4;i++){
          beats.push({ t: tt, pr: prDelays[i], drop: i===3 });
          tt += baseRR;
        }
      }
      this._mobI = beats;
    }
    let y = 0;
    for(const b of this._mobI){
      const d = t - b.t;
      if(d > -0.1 && d < baseRR){
        // P wave always present
        y += 0.15 * gauss(d, 0.0, 0.04);
        if(!b.drop){
          const qrsT = b.pr;
          const local = d - 0;
          if(local > -0.05 && local < 0.4){
            const phase = local/0.4;
            y += this.pqrst(phase, {pWave:false, qrsWidth:0.08, prLong:true});
          }
        }
      }
    }
    return y;
  }

  mobitzII(t, hr){
    // Fixed PR, intermittent dropped QRS (every 3rd beat dropped)
    const baseRR = 60/hr;
    const cycleLen = baseRR*3;
    const phaseInCycle = (t % cycleLen)/baseRR; // 0..3
    const beatNum = Math.floor(phaseInCycle);
    const localPhase = phaseInCycle - beatNum;
    let y = 0.15*gauss(localPhase,0.12,0.04); // P wave each beat
    if(beatNum !== 2){ // drop every 3rd
      y += this.pqrst(localPhase, {pWave:false, qrsWidth:0.08, prLong:false});
    }
    return y;
  }

  completeBlock(t, hr){
    // atrial rate ~90, ventricular escape at hr, fully dissociated
    const atrialRR = 60/90;
    const pPhase = (t % atrialRR)/atrialRR;
    let y = 0.13*gauss(pPhase, 0.12, 0.04);
    const vRR = 60/Math.max(hr,1);
    const vPhase = (t % vRR)/vRR;
    y += this.pqrst(vPhase, {pWave:false, qrsWidth:0.11});
    return y;
  }

  vt(t, hr, polymorphic){
    const rr = 60/Math.max(hr,1);
    const phase = (t % rr)/rr;
    let amp = 1.4;
    if(polymorphic){
      amp = 1.0 + 0.6*Math.sin(t*2*Math.PI*0.7);
    }
    // wide bizarre QRS - broad gaussian with no distinct P/T
    let y = amp * gauss(phase, 0.3, 0.18) * Math.sign(Math.sin(phase*2*Math.PI*1.5+ (polymorphic? t*2:0)));
    y += 0.3*amp*gauss(phase, 0.65, 0.12)*-1;
    return y;
  }

  torsades(t, hr){
    // VT with twisting amplitude envelope
    const rr = 60/Math.max(hr,1);
    const phase = (t % rr)/rr;
    const envelope = Math.sin(t*2*Math.PI*0.5); // slow twisting
    const amp = 0.6 + 1.0*Math.abs(envelope);
    const sign = envelope >= 0 ? 1 : -1;
    return amp * sign * gauss(phase, 0.3, 0.18);
  }

  vfib(t, amplitude){
    // chaotic irregular oscillation - sum of randomish sines
    let y = 0;
    y += Math.sin(t*2*Math.PI*4.3 + Math.sin(t*1.7)*2) * 0.5;
    y += Math.sin(t*2*Math.PI*6.7 + Math.sin(t*0.9)*3) * 0.35;
    y += Math.sin(t*2*Math.PI*2.1 + Math.sin(t*3.3)) * 0.4;
    y += (Math.random()-0.5)*0.15;
    return y * amplitude;
  }

  drawECG(dt){
    const c = this.canvases.ecg, ctx = this.ctx.ecg;
    const w = c.clientWidth, h = c.clientHeight;
    ctx.clearRect(0,0,w,h);
    this.drawGrid(ctx, w, h);

    const windowSec = 4.5; // seconds visible
    const samples = Math.floor(w);
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ecg').trim();
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 4;

    const midY = h*0.55;
    const scaleY = h*0.38;

    for(let i=0;i<samples;i++){
      const tt = this.t - windowSec + (i/samples)*windowSec;
      const val = this.ecgValue(Math.max(0,tt));
      const x = (i/samples)*w;
      const y = midY - val*scaleY;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  drawGrid(ctx, w, h){
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const step = 25;
    for(let x=0;x<w;x+=step){
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
    }
    for(let y=0;y<h;y+=step){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
    }
  }

  // ---------------- Pleth (SpO2 waveform) ----------------
  drawPleth(dt){
    const c = this.canvases.pleth, ctx = this.ctx.pleth;
    const w = c.clientWidth, h = c.clientHeight;
    ctx.clearRect(0,0,w,h);
    this.drawGrid(ctx, w, h);

    if(this.pr === 0 || this.spo2 === 0){
      // flat line if no pulse / probe off
      ctx.beginPath();
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--pleth').trim();
      ctx.lineWidth = 2;
      ctx.moveTo(0,h*0.6); ctx.lineTo(w,h*0.6); ctx.stroke();
      return;
    }

    const windowSec = 4.5;
    const samples = Math.floor(w);
    const hrEff = this.pr || this.hr || 80;
    const rr = 60/Math.max(hrEff,1);

    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--pleth').trim();
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 4;

    const midY = h*0.7, scaleY = h*0.55;

    // For chaotic rhythms, pleth becomes irregular/dampened
    const chaotic = ['vfCoarse','vfFine','vtPoly','torsades','afib'].includes(this.rhythm);

    for(let i=0;i<samples;i++){
      const tt = Math.max(0, this.t - windowSec + (i/samples)*windowSec);
      const phase = (tt % rr)/rr;
      let val;
      if(chaotic){
        val = 0.3*Math.sin(tt*2*Math.PI*(hrEff/60)*1.3) + 0.15*Math.sin(tt*9.7);
      } else {
        // smooth pleth pulse: fast upstroke, slower decay (dicrotic notch)
        val = plethShape(phase);
      }
      const x = (i/samples)*w;
      const y = midY - val*scaleY;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ---------------- Respiration ----------------
  drawResp(dt){
    const c = this.canvases.resp, ctx = this.ctx.resp;
    const w = c.clientWidth, h = c.clientHeight;
    ctx.clearRect(0,0,w,h);
    this.drawGrid(ctx, w, h);

    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--resp').trim();
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 3;

    const windowSec = 8;
    const samples = Math.floor(w);
    const midY = h*0.5, scaleY = h*0.4;

    if(this.rr === 0 || this.arrest){
      ctx.moveTo(0,midY); ctx.lineTo(w,midY); ctx.stroke();
      ctx.shadowBlur=0;
      return;
    }

    const period = 60/Math.max(this.rr,1);
    for(let i=0;i<samples;i++){
      const tt = Math.max(0,this.t - windowSec + (i/samples)*windowSec);
      const val = Math.sin(2*Math.PI*tt/period);
      const x = (i/samples)*w;
      const y = midY - val*scaleY;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ---------------- CO2 capnograph ----------------
  drawCO2(dt){
    const c = this.canvases.co2, ctx = this.ctx.co2;
    const w = c.clientWidth, h = c.clientHeight;
    ctx.clearRect(0,0,w,h);
    this.drawGrid(ctx, w, h);

    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--co2').trim();
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 3;

    const windowSec = 8;
    const samples = Math.floor(w);
    const baseline = h*0.85;
    const plateauHeight = h*0.55 * Math.min(1, this.co2level/50);

    if(this.co2level === 0 || this.arrest){
      ctx.moveTo(0,baseline); ctx.lineTo(w,baseline); ctx.stroke();
      ctx.shadowBlur=0;
      return;
    }

    const period = 60/Math.max(this.rr || 12,1);
    for(let i=0;i<samples;i++){
      const tt = Math.max(0,this.t - windowSec + (i/samples)*windowSec);
      const phase = (tt % period)/period;
      let val;
      if(phase < 0.35){
        val = 0; // inspiration: baseline
      } else if(phase < 0.45){
        // rapid upstroke
        val = (phase-0.35)/0.10;
      } else if(phase < 0.85){
        val = 1; // alveolar plateau
      } else {
        // downstroke
        val = 1 - (phase-0.85)/0.15;
      }
      const x = (i/samples)*w;
      const y = baseline - val*plateauHeight;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

// ---- helper functions ----
function gauss(x, mu, sigma){
  const d = (x-mu)/sigma;
  return Math.exp(-0.5*d*d);
}
function sawtoothWave(x){
  return 2*(x - Math.floor(x+0.5));
}
function plethShape(phase){
  // systolic upstroke fast, dicrotic notch, diastolic decay
  if(phase < 0.15){
    return easeOut(phase/0.15);
  } else if(phase < 0.25){
    return 1 - 0.25*easeOut((phase-0.15)/0.10);
  } else if(phase < 0.35){
    return 0.75 + 0.1*easeOut((phase-0.25)/0.10);
  } else {
    const d = (phase-0.35)/0.65;
    return 0.85 * Math.exp(-3*d);
  }
}
function easeOut(x){ return 1 - Math.pow(1-x,3); }
