import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const DIR = 'Halo';

export async function getStream(mode, facing) {
  if (mode === 'screen') {
    if (!navigator.mediaDevices?.getDisplayMedia)
      throw new Error('Screen capture is not available in the Android WebView yet. It needs the native screen-capture plugin (see README, "Screen recording").');
    return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  }
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: true
  });
}

export function pickMime() {
  const c = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return c.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
}

export class Rec {
  constructor(stream) {
    this.chunks = [];
    this.mime = pickMime();
    this.mr = new MediaRecorder(stream, this.mime ? { mimeType: this.mime, videoBitsPerSecond: 6_000_000 } : undefined);
    this.mr.ondataavailable = e => e.data.size && this.chunks.push(e.data);
  }
  start() { this.mr.start(1000); }
  pause() { this.mr.pause(); }
  resume() { this.mr.resume(); }
  stop() {
    return new Promise(res => {
      this.mr.onstop = () => res(new Blob(this.chunks, { type: this.mime || 'video/webm' }));
      this.mr.stop();
    });
  }
}

const toB64 = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

export async function saveClip(blob) {
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const name = `Halo-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
  await Filesystem.writeFile({ path: `${DIR}/${name}`, data: await toB64(blob), directory: Directory.Documents, recursive: true });
  return name;
}

export async function listClips() {
  try {
    const { files } = await Filesystem.readdir({ path: DIR, directory: Directory.Documents });
    return files.filter(f => /\.(mp4|webm)$/i.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
  } catch { return []; }
}

export async function shareClip(name) {
  const { uri } = await Filesystem.getUri({ path: `${DIR}/${name}`, directory: Directory.Documents });
  await Share.share({ title: name, url: uri });
}

export const deleteClip = name => Filesystem.deleteFile({ path: `${DIR}/${name}`, directory: Directory.Documents });
