# Halo Mobile (Android)

Capacitor wrapper + new mobile UI for Halo, with sign-up / log-in via **Google, Discord and Apple**, a "set your name" step, and the Halo logo/icon.

## 1. Set up sign-in (Supabase, free tier is fine)
1. Create a project at https://supabase.com.
2. **Authentication → Providers**: enable Google, Discord, Apple and paste each provider's client ID/secret
   (Google Cloud Console, Discord Developer Portal, Apple Developer account — Apple requires a paid account).
   Each provider's redirect/callback URL is shown in Supabase: `https://<project>.supabase.co/auth/v1/callback`.
3. **Authentication → URL Configuration → Redirect URLs**: add `com.halo.mobile://auth`.
4. **Project Settings → API**: copy the Project URL and anon public key.
5. Copy `.env.example` to `.env` and fill both values.

## 2. Build the APK
**Option A – no setup on your PC:** push this folder to GitHub, add repo secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`,
then Actions → *Build Halo APK* → run. Download `Halo-APK` (app-debug.apk) and install it on your phone.

**Option B – on your PC** (Node 20 + JDK 17 + Android Studio/SDK):
```
npm install
npm run android:setup
npm run android:open     # Android Studio: Build > Build APK(s)
```
After editing the UI later, run `npm run sync`.

## What works / what doesn't yet
- Log in / sign up (Google, Discord, Apple), display name, log out: yes.
- Camera recording with mic, flip camera, pause, save to Documents/Halo, share, delete: yes.
- **Screen recording:** Android's WebView has no screen capture. The Screen button shows a message until a native
  MediaProjection plugin is added. **Live streaming (RTMP)** also needs a native library — the desktop version used a bundled ffmpeg.
- Recordings are saved through base64, so very long clips use a lot of memory.
- The debug APK is unsigned for Play Store; create a release keystore to publish.
