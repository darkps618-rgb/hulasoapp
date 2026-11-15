import { configured, sb, signIn, listenForOAuthReturn, getUser, displayName, suggestName, saveName, signOut } from './auth.js';
import { getStream, Rec, saveClip, listClips, shareClip, deleteClip } from './recorder.js';

const app = document.getElementById('app');
const $ = (s) => app.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ICON = { google: '<b>G</b>', discord: '<b>D</b>', apple: '<b> </b>' };

function renderSetup() {
  app.innerHTML = `<div class="center"><img class="logo" src="/logo.png" alt="Halo"><h1>Halo</h1>
  <p class="sub">Sign-in isn't configured yet.</p>
  <p class="note">Copy <b>.env.example</b> to <b>.env</b>, add your Supabase URL and anon key, then rebuild. See the README.</p></div>`;
}

function renderLogin(msg = '') {
  app.innerHTML = `<div class="center">
    <img class="logo" src="/logo.png" alt="Halo logo"><h1>Welcome to Halo</h1>
    <p class="sub">Sign up or log in to start recording and streaming.</p>
    <button class="btn google" data-p="google">${ICON.google} Continue with Google</button>
    <button class="btn discord" data-p="discord">${ICON.discord} Continue with Discord</button>
    <button class="btn apple" data-p="apple">${ICON.apple} Continue with Apple</button>
    <div class="err" id="err">${esc(msg)}</div>
    <p class="note">New here? Choosing a provider creates your account automatically.</p></div>`;
  app.querySelectorAll('[data-p]').forEach(b => b.onclick = async () => {
    $('#err').textContent = '';
    try { await signIn(b.dataset.p); } catch (e) { $('#err').textContent = e.message; }
  });
}

function renderName(user) {
  app.innerHTML = `<div class="center">
    <img class="logo" src="/logo.png" alt="Halo logo"><h1>Set your name</h1>
    <p class="sub">This is how you'll appear in Halo.</p>
    <input type="text" id="nm" maxlength="32" placeholder="Display name" value="${esc(suggestName(user))}" autocomplete="nickname">
    <div class="err" id="err"></div>
    <button class="btn p" id="go">Continue</button></div>`;
  $('#go').onclick = async () => {
    const v = $('#nm').value.trim();
    if (v.length < 2) { $('#err').textContent = 'Please enter at least 2 characters.'; return; }
    const { error } = await saveName(v);
    if (error) { $('#err').textContent = error.message; return; }
    route();
  };
}

function renderHome(user) {
  let mode = 'camera', facing = 'user', stream = null, rec = null, tick = null, t0 = 0, paused = false;
  app.innerHTML = `
  <div class="top"><img src="/logo.png" alt=""><b>Halo</b><button class="who" id="who">${esc(displayName(user))}</button></div>
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

  async function start() {
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

  $('#rb').onclick = () => rec ? stop() : start();
  $('#ps').onclick = () => {
    if (!rec) return;
    paused = !paused; paused ? rec.pause() : rec.resume();
    $('#ps').textContent = paused ? '▶' : '❚❚'; $('#pill').textContent = paused ? 'Paused' : '● REC';
  };
  $('#flip').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; if (!rec && mode === 'camera') open(); };
  app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    if (rec) return;
    mode = b.dataset.m;
    app.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === b));
    mode === 'camera' ? open() : (close(), $('#idle').style.display = '');
  });
  $('#who').onclick = async () => { if (confirm('Log out?')) { close(); await signOut(); route(); } };

  async function refresh() {
    const files = await listClips();
    $('#lib').innerHTML = files.length ? files.map(f => `<div class="item"><div>${esc(f.name)}</div><button data-s="${esc(f.name)}">Share</button><button data-d="${esc(f.name)}">Delete</button></div>`).join('')
      : '<div class="empty">Recordings are saved to Documents/Halo and will show up here.</div>';
    $('#lib').querySelectorAll('[data-s]').forEach(b => b.onclick = () => shareClip(b.dataset.s).catch(e => err(e.message)));
    $('#lib').querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { if (confirm('Delete this clip?')) { await deleteClip(b.dataset.d); refresh(); } });
  }
  refresh(); open();
}

async function route(msg) {
  if (!configured) return renderSetup();
  const { data } = await sb.auth.getSession();
  if (!data.session) return renderLogin(msg);
  const user = await getUser();
  if (!displayName(user)) return renderName(user);
  renderHome(user);
}

if (configured) listenForOAuthReturn(() => route(), (e) => route(e.message));
route();
