// --SUPABASE INITIALIZATION--
const SUPABASE_URL = window.__env?.SUPABASE_URL || 'https://ncpaxxxrovnhwajqptlk.supabase.co';
const SUPABASE_ANON_KEY = window.__env?.SUPABASE_ANON_KEY || 'sb_publishable_Zf2sjt82vOlJySokD0aRNg_ySDMWbwU';
const CLOUDFLARE_SITE_KEY = window.__env?.CF_SITE_KEY || '0x4AAAAAAFZJ7QvRT5Uc5X-3';

let supabaseClient = null;

function initSupabase() {
  if (window.supabase && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseClient;
  }
  console.warn('[8ST] Supabase SDK not loaded.');
  return null;
}

// --AUTH HELPER PLACEHOLDERS--
async function getCurrentUser() {
  if (!supabaseClient) return null;
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

async function signIn(email, password) {
  if (!supabaseClient) throw new Error('Supabase not configured.');
  return supabaseClient.auth.signInWithPassword({ email, password });
}

async function signUp(email, password, metadata) {
  if (!supabaseClient) throw new Error('Supabase not configured.');
  return supabaseClient.auth.signUp({ email, password, options: { data: metadata } });
}

async function signOut() {
  cacheSessionUser(null);
  try { localStorage.removeItem('8st_admin_role'); } catch {}
  window.__currentUser = null;
  window.__currentUserRole = null;
  if (supabaseClient) {
    try {
      await supabaseClient.auth.signOut();
    } catch (e) {
      console.warn('[8ST] Sign out error:', e);
    }
  }
}

function isAdmin(user) {
  if (window.__currentUserRole === 'admin') return true;
  if (localStorage.getItem('8st_admin_role') === 'admin') return true;
  if (!user) return false;
  if (user?.id === 'a0389cde-66ad-4f0f-8ef0-4d7d73e6625a') return true;
  return user?.role === 'admin' || user?.user_metadata?.role === 'admin' || user?.app_metadata?.role === 'admin';
}

// --SESSION CACHE HELPERS--
function cacheSessionUser(user) {
  if (user) {
    try {
      localStorage.setItem('8st_session_user', JSON.stringify(user));
    } catch (e) {
      console.warn('Cache write failed:', e);
    }
  } else {
    localStorage.removeItem('8st_session_user');
  }
}

function getSessionUser() {
  try {
    const raw = localStorage.getItem('8st_session_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// --DB QUERY HELPERS--
async function dbFrom(table) {
  if (!supabaseClient) return null;
  return supabaseClient.from(table);
}

// --ENV EXPORT--
window.__8ST = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  CLOUDFLARE_SITE_KEY,
  initSupabase,
  getCurrentUser,
  signIn,
  signUp,
  signOut,
  isAdmin,
  cacheSessionUser,
  getSessionUser,
  getClient: () => supabaseClient,
};
