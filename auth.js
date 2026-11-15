import { createClient } from '@supabase/supabase-js';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = !!(URL_ && KEY && !URL_.includes('YOUR-PROJECT'));
export const REDIRECT = 'com.halo.mobile://auth';

export const sb = configured
  ? createClient(URL_, KEY, { auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true } })
  : null;

// Provider: 'google' | 'discord' | 'apple'
export async function signIn(provider) {
  const { data, error } = await sb.auth.signInWithOAuth({
    provider,
    options: { redirectTo: REDIRECT, skipBrowserRedirect: true }
  });
  if (error) throw error;
  await Browser.open({ url: data.url });
}

// Finish the OAuth round trip when Android re-opens the app via com.halo.mobile://auth?code=...
export function listenForOAuthReturn(onDone, onError) {
  App.addListener('appUrlOpen', async ({ url }) => {
    if (!url || !url.startsWith(REDIRECT)) return;
    try {
      const u = new URL(url);
      const err = u.searchParams.get('error_description');
      if (err) throw new Error(err);
      const code = u.searchParams.get('code');
      if (code) {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (error) throw error;
      }
      await Browser.close().catch(() => {});
      onDone();
    } catch (e) { await Browser.close().catch(() => {}); onError(e); }
  });
}

export const getUser = async () => (await sb.auth.getUser()).data.user;
export const displayName = (u) => u?.user_metadata?.display_name || '';
export const suggestName = (u) => u?.user_metadata?.full_name || u?.user_metadata?.name || u?.user_metadata?.custom_claims?.global_name || '';
export const saveName = (name) => sb.auth.updateUser({ data: { display_name: name } });
export const signOut = () => sb.auth.signOut();
