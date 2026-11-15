import { registerPlugin } from '@capacitor/core';
import { getStream, Rec, saveClip, listClips, shareClip, deleteClip } from './recorder.js';

const ScreenRecorder = registerPlugin('ScreenRecorder');
let screenStoppedHandler = null;
try { ScreenRecorder.addListener('stopped', () => screenStoppedHandler && screenStoppedHandler()); } catch {}

const app = document.getElementById('app');
const $ = (s) => app.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const store = {
  get: () => { try { return localStorage.getItem('halo_name') || ''; } catch { return ''; } },
  set: (v) => { try { localStorage.setItem('halo_name', v); } catch {} }
};

function renderName() {
  app.innerHTML = `<div class="center">
    <img class="logo" src="/logo.png" alt="Halo logo"><h1>Welcome to Halo</h1>
    <p class="sub">Choose a name to get started.</p>
    <input type="text" id="nm" maxlength="32" placeholder="Your name" value="${esc(store.get())}" autocomplete="nickname">
    <div class="err" id="err"></div>
    <button class="btn p" id="go">Continue</button></div>`;
  $('#go').onclick = () => {
    const v = $('#nm').value.trim();
    if (v.length < 2) { $('#err').textContent = 'Please enter at least 2 characters.'; return; }
    store.set(v); route();
  };
}

function renderHome(userName) {
  let screenActive = false;
  let mode = 'camera', facing = 'user', stream = null, rec = null, tick = null, t0 = 0, paused = false;
  app.innerHTML = `
  <div class="top"><img src="/logo.png" alt=""><b>Halo</b><button class="who" id="who">${esc(userName)}</button></div>
  <div class="stage"><video id="pv" muted playsinline autoplay></video><div class="idle" id="idle">Tap the red button to start</div><div class="pill" id="pill">Ready</div></div>
  <div class="seg"><button data-m="camera" class="on">Camera</button><button data-m="screen">Screen</button></div>
  <div class="err" id="err"></div>
  <div class="ctrl"><button class="round" id="flip" aria-label="Flip camera">⟲</button>
    <div style="text-align:center"><button class="rbtn" id="rb" aria-label="Record"><span></span></button><div class="timer" id="tm">00:00</div></div>
    <button class="round" id="ps" aria-label="Pause" disabled>❚❚</button></div>
  <h2>Library</h2><div id="lib"></div>`;

  const err = (m) => $('#err').textContent = m || '';
  const pv = $('#pv');
  const fmt = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

  async function open() {
    close(); err();
    try {
      stream = await getStream(mode, facing);
      pv.srcObject = stream; $('#idle').style.display = 'none';
      stream.getVideoTracks()[0].onended = () => { if (rec) stop(); close(); };
    } catch (e) { err(e.message || 'Could not start capture'); $('#idle').style.display = ''; }
  }
  function close() { stream?.getTracks().forEach(t => t.stop()); stream = null; pv.srcObject = null; }

  function uiOn() {
    $('#rb').classList.add('on');
    $('#pill').textContent = '● REC'; $('#pill').classList.add('rec');
    t0 = Date.now();
    tick = setInterval(() => { if (!paused) $('#tm').textContent = fmt(Math.floor((Date.now() - t0) / 1000)); }, 500);
  }
  function uiOff(text) {
    clearInterval(tick);
    $('#rb').classList.remove('on'); $('#ps').disabled = true;
    $('#pill').classList.remove('rec'); $('#pill').textContent = text || 'Ready';
    $('#tm').textContent = '00:00';
  }
  screenStoppedHandler = () => { if (!screenActive) return; screenActive = false; uiOff('Saved'); err(); refresh(); };

  async function startScreen() {
    err();
    try {
      await ScreenRecorder.start();
      screenActive = true; paused = false; $('#ps').disabled = true; uiOn();
      err('Recording your screen. Open any app. To stop, pull down the notification and tap Stop, or come back to Halo.');
    } catch (e) { err(e.message || 'Screen recording failed'); }
  }
  async function stopScreen() {
    screenActive = false; uiOff('Saving…');
    try { await ScreenRecorder.stop(); $('#pill').textContent = 'Saved'; }
    catch (e) { err(e.message || 'Could not stop recording'); $('#pill').textContent = 'Ready'; }
    refresh();
  }

  async function start() {
    if (mode === 'screen') return startScreen();
    if (!stream) await open();
    if (!stream) return;
    rec = new Rec(stream); rec.start(); paused = false; t0 = Date.now();
    $('#rb').classList.add('on'); $('#ps').disabled = false;
    $('#pill').textContent = '● REC'; $('#pill').classList.add('rec');
    tick = setInterval(() => { if (!paused) $('#tm').textContent = fmt(Math.floor((Date.now() - t0) / 1000)); }, 500);
  }
  async function stop() {
    clearInterval(tick);
    const blob = await rec.stop(); rec = null;
    $('#rb').classList.remove('on'); $('#ps').disabled = true;
    $('#pill').textContent = 'Saving…'; $('#pill').classList.remove('rec');
    try { await saveClip(blob); $('#pill').textContent = 'Saved'; } catch (e) { err('Could not save: ' + e.message); $('#pill').textContent = 'Ready'; }
    $('#tm').textContent = '00:00'; close(); $('#idle').style.display = ''; refresh();
  }

  $('#rb').onclick = () => screenActive ? stopScreen() : (rec ? stop() : start());
  $('#ps').onclick = () => {
    if (!rec) return;
    paused = !paused; paused ? rec.pause() : rec.resume();
    $('#ps').textContent = paused ? '▶' : '❚❚'; $('#pill').textContent = paused ? 'Paused' : '● REC';
  };
  $('#flip').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; if (!rec && mode === 'camera') open(); };
  app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    if (rec || screenActive) return;
    mode = b.dataset.m;
    app.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === b));
    if (mode === 'camera') { $('#idle').textContent = 'Tap the red button to start'; open(); }
    else { close(); err(); $('#idle').textContent = 'Screen mode records everything on your screen. Tap the red button, then open any app.'; $('#idle').style.display = ''; }
  });
  $('#who').onclick = () => { close(); renderName(); };

  async function refresh() {
    const files = await listClips();
    $('#lib').innerHTML = files.length ? files.map(f => `<div class="item"><div>${esc(f.name)}</div><button data-s="${esc(f.name)}">Share</button><button data-d="${esc(f.name)}">Delete</button></div>`).join('')
      : '<div class="empty">Recordings show up here. Use Share to send or save them.</div>';
    $('#lib').querySelectorAll('[data-s]').forEach(b => b.onclick = () => shareClip(b.dataset.s).catch(e => err(e.message)));
    $('#lib').querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { if (confirm('Delete this clip?')) { await deleteClip(b.dataset.d); refresh(); } });
  }
  refresh(); open();
}

function route() {
  const n = store.get();
  if (!n) return renderName();
  renderHome(n);
}

route();
