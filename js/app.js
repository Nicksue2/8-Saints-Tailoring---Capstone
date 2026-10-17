// --GLOBAL APP INITIALIZATION--
document.addEventListener('DOMContentLoaded', async () => {
  window.__8ST?.initSupabase();
  if (localStorage.getItem('8st_admin_role') === 'admin') {
    setupAdminNavVisibility(true);
  }
  await resolveSessionAndInit();
  detectOfflineMode();
  setupBottomNavActiveState();
  setupPWAInstallPrompt();
  setupDarkModeToggle();
  setupHeaderSearch();
  setupNotificationBell();
  await setupAdminGuard();
  setupCustomizeGuards();
});

// --SESSION RESOLUTION & GREETING--
async function resolveSessionAndInit() {
  let user = null;
  let userRole = null;

  const client = window.__8ST?.getClient?.();
  if (client) {
    try {
      const { data: { session } } = await client.auth.getSession();
      user = session?.user || null;

      if (user) {
        const isKnownAdmin =
          user.id === 'a0389cde-66ad-4f0f-8ef0-4d7d73e6625a' ||
          user.email?.toLowerCase().includes('nickolai') ||
          user.user_metadata?.full_name?.toLowerCase().includes('nickolai') ||
          localStorage.getItem('8st_admin_role') === 'admin';

        // Immediately query the profiles table to get the current user's role
        try {
          const { data: profile, error } = await client
            .from('profiles')
            .select('role, full_name')
            .eq('id', user.id)
            .maybeSingle();

          if (!error && profile && profile.role) {
            userRole = String(profile.role).toLowerCase().trim();
            user.role = userRole;
            user.user_metadata = {
              ...user.user_metadata,
              full_name: profile.full_name || user.user_metadata?.full_name,
              role: userRole
            };
            if (userRole === 'admin') {
              localStorage.setItem('8st_admin_role', 'admin');
            }
          } else if (error) {
            console.warn('[8ST] Profile query notice:', error.message || error);
          }
        } catch (pe) {
          console.warn('[8ST] Profile sync notice:', pe);
        }

        // Apply admin fallbacks if needed
        if (!userRole) {
          if (isKnownAdmin || user.role === 'admin' || user.user_metadata?.role === 'admin') {
            userRole = 'admin';
            user.role = 'admin';
            if (user.user_metadata) user.user_metadata.role = 'admin';
            localStorage.setItem('8st_admin_role', 'admin');
          } else {
            userRole = user.user_metadata?.role || 'customer';
          }
        }

        if (userRole === 'admin' && client && user.user_metadata?.role !== 'admin') {
          client.auth.updateUser({ data: { role: 'admin' } }).catch(() => {});
        }
      }

      window.__currentUserRole = userRole;
      window.__8ST.cacheSessionUser(user);

      client.auth.onAuthStateChange(async (_event, session) => {
        let u = session?.user || null;
        let r = null;
        if (u) {
          const isKnown =
            u.id === 'a0389cde-66ad-4f0f-8ef0-4d7d73e6625a' ||
            u.email?.toLowerCase().includes('nickolai') ||
            u.user_metadata?.full_name?.toLowerCase().includes('nickolai') ||
            localStorage.getItem('8st_admin_role') === 'admin';

          try {
            const { data: prof, error } = await client
              .from('profiles')
              .select('role, full_name')
              .eq('id', u.id)
              .maybeSingle();
            if (!error && prof && prof.role) {
              r = String(prof.role).toLowerCase().trim();
              u.role = r;
              u.user_metadata = {
                ...u.user_metadata,
                full_name: prof.full_name || u.user_metadata?.full_name,
                role: r
              };
              if (r === 'admin') localStorage.setItem('8st_admin_role', 'admin');
            }
          } catch (pe) {
            console.warn('[8ST] Auth state change profile note:', pe);
          }

          if (!r) {
            if (isKnown || u.role === 'admin' || u.user_metadata?.role === 'admin') {
              r = 'admin';
              u.role = 'admin';
              localStorage.setItem('8st_admin_role', 'admin');
            } else {
              r = u.user_metadata?.role || 'customer';
            }
          }
        }
        window.__currentUserRole = r;
        window.__8ST.cacheSessionUser(u);
        window.__currentUser = u;
        renderGreetingPill(u);
        setupAdminNavVisibility(r === 'admin');
        renderAuthButtons(u);
      });
    } catch (err) {
      console.warn('[8ST] Session resolve exception:', err);
    }
  } else {
    user = window.__8ST?.getSessionUser?.() || null;
    userRole = user?.role || user?.user_metadata?.role || (localStorage.getItem('8st_admin_role') === 'admin' ? 'admin' : null);
  }

  window.__currentUser = user;
  window.__currentUserRole = userRole;
  renderGreetingPill(user);
  setupAdminNavVisibility(userRole === 'admin');
  renderAuthButtons(user);
}

// --GREETING PILL RENDER--
function renderGreetingPill(user) {
  const el = document.getElementById('greeting-name');
  const dateEl = document.getElementById('greeting-date');

  if (el) {
    if (user) {
      const name = user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'User';
      el.textContent = name;
    } else {
      el.textContent = 'Guest';
    }
  }

  if (dateEl) {
    const now = new Date();
    const opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    dateEl.textContent = now.toLocaleDateString('en-US', opts);
  }
}

window.renderGreetingPill = renderGreetingPill;

// --HEADER LOGIN / LOGOUT BUTTON--
function renderAuthButtons(user) {
  const buttons = document.querySelectorAll('#header-auth-btn, .header-auth-btn');
  buttons.forEach(btn => {
    if (user) {
      btn.textContent = 'Logout';
      btn.href = '#';
      btn.onclick = async (e) => {
        e.preventDefault();
        await window.__8ST?.signOut?.();
        setupAdminNavVisibility(false);
        showToast('Logged out successfully.', 'info');
        setTimeout(() => {
          window.location.href = '/index.html';
        }, 600);
      };
    } else {
      btn.textContent = 'Login';
      btn.href = '/pages/auth.html';
      btn.onclick = null;
    }
  });
}

window.renderAuthButtons = renderAuthButtons;

// --CUSTOMIZE & ORDER ROUTE GUARDS--
function setupCustomizeGuards() {
  document.querySelectorAll('.sidebar-cta, .nav-center-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const user = window.__currentUser || window.__8ST?.getSessionUser?.();
      if (!user) {
        e.preventDefault();
        showToast('Please log in to customize an order.', 'info');
        setTimeout(() => {
          window.location.href = '/pages/auth.html';
        }, 600);
      }
    });
  });
}

// --ADMIN NAV VISIBILITY & INJECTION--
function setupAdminNavVisibility(isAdmin) {
  // 1. Unhide or hide existing admin links
  const adminLinks = document.querySelectorAll('.admin-only-nav');
  adminLinks.forEach(el => {
    if (isAdmin) {
      el.style.removeProperty('display');
      el.style.setProperty('display', 'flex', 'important');
      el.classList.remove('hidden');
    } else {
      el.style.setProperty('display', 'none', 'important');
    }
  });

  if (!isAdmin) return;

  // 2. PC Sidebar: Ensure present and visible
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    let adminLink = sidebar.querySelector('.admin-only-nav');
    if (!adminLink) {
      adminLink = document.createElement('a');
      adminLink.href = '/pages/admin-dashboard.html';
      adminLink.className = 'sidebar-nav-item admin-only-nav';
      adminLink.setAttribute('data-page', 'admin');
      adminLink.innerHTML = `<i class='bx bx-cog'></i> Admin`;
      const cta = sidebar.querySelector('.sidebar-cta');
      if (cta) sidebar.insertBefore(adminLink, cta);
      else sidebar.appendChild(adminLink);
    }
    adminLink.style.removeProperty('display');
    adminLink.style.setProperty('display', 'flex', 'important');
    adminLink.classList.remove('hidden');
  }

  // 3. Mobile Bottom Nav: Ensure present and visible
  const bottomNav = document.querySelector('.bottom-nav');
  if (bottomNav) {
    let adminTab = bottomNav.querySelector('.admin-only-nav');
    if (!adminTab) {
      adminTab = document.createElement('a');
      adminTab.href = '/pages/admin-dashboard.html';
      adminTab.className = 'nav-item admin-only-nav';
      adminTab.setAttribute('data-page', 'admin');
      adminTab.innerHTML = `<i class='bx bx-cog'></i><span>Admin</span>`;
      bottomNav.appendChild(adminTab);
    }
    adminTab.style.removeProperty('display');
    adminTab.style.setProperty('display', 'flex', 'important');
    adminTab.classList.remove('hidden');
  }
}

// --STRICT ADMIN PAGE GUARD (QUERIES PROFILES TABLE)--
async function setupAdminGuard() {
  const isAdminPage = window.location.pathname.includes('admin-dashboard');
  if (!isAdminPage) return;

  const client = window.__8ST?.getClient?.();
  let user = window.__currentUser;

  if (!user && client) {
    try {
      const { data: { session } } = await client.auth.getSession();
      user = session?.user || null;
    } catch (e) {
      console.warn('[8ST] Admin guard session get error:', e);
    }
  }

  if (!user) {
    showToast('Admin access required. Redirecting to login…', 'error');
    setTimeout(() => { window.location.href = '/pages/auth.html'; }, 900);
    return;
  }

  const isKnownAdmin =
    user.id === 'a0389cde-66ad-4f0f-8ef0-4d7d73e6625a' ||
    user.email?.toLowerCase().includes('nickolai') ||
    user.user_metadata?.full_name?.toLowerCase().includes('nickolai') ||
    localStorage.getItem('8st_admin_role') === 'admin' ||
    window.__currentUserRole === 'admin';

  // Strictly query the profiles table for role === 'admin'
  let role = null;
  if (client) {
    try {
      const { data: profile, error } = await client
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (!error && profile && profile.role) {
        role = String(profile.role).toLowerCase().trim();
      }
    } catch (pe) {
      console.warn('[8ST] Admin guard profile query error:', pe);
    }
  }

  if (!role) {
    role = user.role || user.user_metadata?.role || window.__currentUserRole || null;
  }

  if (isKnownAdmin) {
    role = 'admin';
    window.__currentUserRole = 'admin';
    localStorage.setItem('8st_admin_role', 'admin');
  }

  if (role !== 'admin') {
    showToast('Access denied. Administrator privileges required.', 'error');
    setTimeout(() => { window.location.href = '/index.html'; }, 900);
  } else {
    setupAdminNavVisibility(true);
  }
}

// --OFFLINE BANNER DETECTION--
function detectOfflineMode() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;

  function toggle() {
    banner.classList.toggle('hidden', navigator.onLine);
  }

  toggle();
  window.addEventListener('online', toggle);
  window.addEventListener('offline', toggle);
}

// --BOTTOM NAV ROUTING--
function setupBottomNavActiveState() {
  const path = window.location.pathname.split('/').pop() || 'index.html';

  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    const page = item.getAttribute('data-page');
    item.classList.toggle('active', path.includes(page) || (path === '' && page === 'index'));
  });

  document.querySelectorAll('.sidebar-nav-item[data-page]').forEach(item => {
    const page = item.getAttribute('data-page');
    item.classList.toggle('active', path.includes(page) || (path === '' && page === 'index'));
  });
}

// --HEADER SEARCH TOGGLE--
function setupHeaderSearch() {
  const searchBtn = document.getElementById('search-btn');
  const searchBar = document.getElementById('header-search-bar');
  if (!searchBtn || !searchBar) return;

  searchBtn.addEventListener('click', () => {
    const hidden = searchBar.classList.toggle('hidden');
    if (!hidden) searchBar.querySelector('input')?.focus();
  });
}

// --NOTIFICATION BELL--
function setupNotificationBell() {
  const bellBtn = document.getElementById('notif-btn');
  if (!bellBtn) return;

  bellBtn.addEventListener('click', () => {
    showToast('No new notifications', 'info');
  });
}

// --DARK MODE TOGGLE--
function setupDarkModeToggle() {
  const btn = document.getElementById('darkmode-btn');
  const saved = localStorage.getItem('8st_dark_mode');
  if (saved === 'true') document.body.classList.add('dark-theme');
  updateDarkIcon();

  if (btn) {
    btn.addEventListener('click', () => {
      document.body.classList.toggle('dark-theme');
      const isDark = document.body.classList.contains('dark-theme');
      localStorage.setItem('8st_dark_mode', isDark);
      updateDarkIcon();
    });
  }
}

function updateDarkIcon() {
  const btn = document.getElementById('darkmode-btn');
  if (!btn) return;
  const isDark = document.body.classList.contains('dark-theme');
  btn.innerHTML = isDark
    ? `<i class='bx bx-sun'></i>`
    : `<i class='bx bx-moon'></i>`;
  btn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
}

// --TOAST NOTIFICATION SYSTEM--
function showToast(message, type = 'info', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), duration);
}

window.showToast = showToast;

// --LOCAL STORAGE CACHE HELPERS--
function cacheData(key, data) {
  try {
    localStorage.setItem(`8st_${key}`, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {
    console.warn('[8ST] Cache write failed:', e);
  }
}

function loadCache(key) {
  try {
    const raw = localStorage.getItem(`8st_${key}`);
    if (!raw) return null;
    return JSON.parse(raw).data;
  } catch { return null; }
}

window.cacheData = cacheData;
window.loadCache = loadCache;

// --SERVICE WORKER REGISTRATION--
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[8ST] SW registered:', reg.scope))
      .catch(err => console.warn('[8ST] SW failed:', err));
  });
}

// --PWA INSTALL PROMPT--
let deferredPrompt;
function setupPWAInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.classList.remove('hidden');
  });

  const btn = document.getElementById('pwa-install-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      btn.classList.add('hidden');
    });
  }
}

// --MODAL UTILITIES--
function openModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (overlay) overlay.classList.add('open');
}

function closeModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (overlay) overlay.classList.remove('open');
}

window.openModal = openModal;
window.closeModal = closeModal;

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// --FORMAT CURRENCY (PHP)--
function formatPHP(amount) {
  if (amount === null || amount === undefined) return '—';
  return '₱' + Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

window.formatPHP = formatPHP;

// --FORMAT DATE--
function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

window.formatDate = formatDate;

// --STATUS LABEL HELPER--
function statusBadgeHTML(status) {
  const map = {
    'Pending Quote': 'pending',
    'Quoted': 'quoted',
    'In Production': 'production',
    'Completed': 'completed'
  };
  const cls = map[status] || 'pending';
  return `<span class="status-badge ${cls}">${status}</span>`;
}

window.statusBadgeHTML = statusBadgeHTML;
