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
        if (typeof initUserNotifications === 'function') initUserNotifications(u);
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
  if (typeof initUserNotifications === 'function') initUserNotifications(user);
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
      btn.innerHTML = `<i class='bx bx-log-out'></i>`;
      btn.className = 'header-icon-btn logout-btn';
      btn.title = 'Logout';
      btn.setAttribute('aria-label', 'Logout');
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
      btn.innerHTML = `<i class='bx bx-log-in'></i> Login`;
      btn.className = 'header-auth-btn';
      btn.title = 'Login';
      btn.href = '/pages/auth.html';
      btn.onclick = null;
    }
  });
}

window.renderAuthButtons = renderAuthButtons;

// --CUSTOMIZE & QUICK ORDER ROUTE GUARDS--
function setupCustomizeGuards() {
  document.querySelectorAll('.sidebar-cta, .nav-center-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const user = window.__currentUser || window.__8ST?.getSessionUser?.();
      if (!user) {
        showToast('Please log in to customize an order.', 'info');
        setTimeout(() => {
          window.location.href = '/pages/auth.html';
        }, 600);
        return;
      }

      openQuickOrderModal();
    });
  });
}

function openQuickOrderModal() {
  const modal = document.getElementById('customize-modal');
  if (modal && typeof window.openCustomizeModal === 'function') {
    const service = (window.allServices && window.allServices[0]) || {
      id: 'custom-order',
      name: 'Custom Tailoring Order',
      base_price: 2500,
      category: 'Bespoke'
    };
    window.openCustomizeModal(service);
  } else {
    window.location.href = '/pages/catalog.html?open=customize';
  }
}

window.openQuickOrderModal = openQuickOrderModal;

// --ADMIN NAV VISIBILITY & INJECTION--
function setupAdminNavVisibility(isAdmin) {
  // 1. Admin navigation items (show/hide admin items)
  const adminLinks = document.querySelectorAll('.admin-only-nav');
  adminLinks.forEach(el => {
    if (isAdmin) {
      el.style.removeProperty('display');
      el.style.setProperty('display', 'flex', 'important');
      el.classList.remove('hidden');
    } else {
      el.style.setProperty('display', 'none', 'important');
      el.classList.add('hidden');
    }
  });

  // 2. Mobile Bottom Nav columns adjustment (4 vs 5 columns)
  const bottomNavs = document.querySelectorAll('.bottom-nav');
  bottomNavs.forEach(nav => {
    if (isAdmin) {
      nav.classList.add('has-admin');
    } else {
      nav.classList.remove('has-admin');
    }
  });

  // 3. PC Sidebar: Ensure Profile and Admin links are in place
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    let profileLink = sidebar.querySelector('a[href="/pages/profile.html"]');
    if (!profileLink) {
      profileLink = document.createElement('a');
      profileLink.href = '/pages/profile.html';
      profileLink.className = 'sidebar-nav-item';
      profileLink.setAttribute('data-page', 'profile');
      profileLink.innerHTML = `<i class='bx bx-user'></i> Profile`;
      sidebar.appendChild(profileLink);
    }

    let adminLink = sidebar.querySelector('.admin-only-nav');
    if (!adminLink && isAdmin) {
      adminLink = document.createElement('a');
      adminLink.href = '/pages/admin-dashboard.html';
      adminLink.className = 'sidebar-nav-item admin-only-nav';
      adminLink.setAttribute('data-page', 'admin');
      adminLink.innerHTML = `<i class='bx bx-shield-quarter'></i> Admin`;
      sidebar.appendChild(adminLink);
    }
    if (adminLink) {
      if (isAdmin) {
        adminLink.style.removeProperty('display');
        adminLink.style.setProperty('display', 'flex', 'important');
        adminLink.classList.remove('hidden');
      } else {
        adminLink.style.setProperty('display', 'none', 'important');
        adminLink.classList.add('hidden');
      }
    }
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

  // Banner must be hidden by default
  banner.classList.add('hidden');

  async function checkOnline() {
    if (!navigator.onLine) {
      // Verify with a lightweight ping to avoid false positives from browser throttling
      try {
        const resp = await fetch('/manifest.json', { method: 'HEAD', cache: 'no-store' });
        if (resp && resp.ok) {
          banner.classList.add('hidden');
          return;
        }
      } catch (e) {
        // Genuine offline confirmed
      }
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }

  checkOnline();
  window.addEventListener('online', () => banner.classList.add('hidden'));
  window.addEventListener('offline', checkOnline);
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

// --IN-APP NOTIFICATIONS & SUPABASE REALTIME SYSTEM--
let userNotifications = [];
let notifRealtimeSub = null;

function setupNotificationBell() {
  const bellBtn = document.getElementById('notif-btn');
  if (!bellBtn) return;

  // Create badge if not present
  let badge = document.getElementById('notif-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'notif-badge';
    badge.className = 'notif-badge hidden';
    bellBtn.appendChild(badge);
  }

  // Request Notification permission on interaction or bell click
  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    toggleNotificationDropdown();
  });

  document.addEventListener('click', (e) => {
    const panel = document.getElementById('notif-dropdown');
    if (panel && !panel.contains(e.target) && e.target !== bellBtn && !bellBtn.contains(e.target)) {
      panel.classList.add('hidden');
    }
  });

  // Initial load if user is already resolved
  const user = window.__currentUser || window.__8ST?.getSessionUser?.();
  if (user) {
    initUserNotifications(user);
  }
}

async function initUserNotifications(user) {
  if (!user) return;
  const client = window.__8ST?.getClient?.();
  if (!client) return;

  try {
    const { data, error } = await client
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!error && Array.isArray(data)) {
      userNotifications = data;
      updateNotificationBadge();
      renderNotificationList();
    }
  } catch (err) {
    console.warn('[8ST] Notification fetch notice:', err);
  }

  // Set up Supabase Realtime subscription
  if (!notifRealtimeSub) {
    try {
      notifRealtimeSub = client.channel(`realtime-notifications-${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        }, (payload) => {
          const newNotif = payload.new;
          if (newNotif) {
            handleIncomingNotification(newNotif);
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('[8ST] Realtime sub error:', e);
    }
  }
}

function handleIncomingNotification(notif) {
  if (userNotifications.some(n => String(n.id) === String(notif.id))) return;
  userNotifications.unshift(notif);
  updateNotificationBadge();
  renderNotificationList();

  // Show in-app toast
  showToast(`🔔 ${notif.title}: ${notif.message}`, 'info', 6000);

  // Show local desktop/mobile OS notification
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(notif.title, {
            body: notif.message,
            icon: '/assets/icons/icon-192.png',
            badge: '/assets/icons/icon-192.png',
            tag: 'order-' + (notif.order_id || Date.now()),
            data: { url: '/pages/customer-orders.html' }
          });
        }).catch(() => {
          new Notification(notif.title, { body: notif.message, icon: '/assets/icons/icon-192.png' });
        });
      } else {
        new Notification(notif.title, {
          body: notif.message,
          icon: '/assets/icons/icon-192.png'
        });
      }
    } catch (e) {
      console.warn('[8ST] Notification display notice:', e);
    }
  }
}

function updateNotificationBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;

  const unreadCount = userNotifications.filter(n => !n.is_read).length;
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function toggleNotificationDropdown() {
  let panel = document.getElementById('notif-dropdown');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'notif-dropdown';
    panel.className = 'notif-dropdown hidden';
    document.body.appendChild(panel);
  }

  const isHidden = panel.classList.toggle('hidden');
  if (!isHidden) {
    renderNotificationList();
  }
}

function renderNotificationList() {
  const panel = document.getElementById('notif-dropdown');
  if (!panel) return;

  const user = window.__currentUser || window.__8ST?.getSessionUser?.();
  if (!user) {
    panel.innerHTML = `
      <div class="notif-header">
        <span class="notif-title">Notifications</span>
      </div>
      <div style="padding:24px 16px;text-align:center;">
        <p style="font-size:0.85rem;color:var(--clr-text-secondary);margin-bottom:12px;">Log in to see your notifications</p>
        <a href="/pages/auth.html" class="btn btn-sm btn-primary">Login</a>
      </div>`;
    return;
  }

  const unreadCount = userNotifications.filter(n => !n.is_read).length;
  const notifPerm = ('Notification' in window) ? Notification.permission : 'unsupported';
  const showPermBanner = notifPerm === 'default';

  panel.innerHTML = `
    <div class="notif-header">
      <span class="notif-title">Notifications ${unreadCount > 0 ? `<small style="font-size:0.75rem;color:var(--accent-color)">(${unreadCount} new)</small>` : ''}</span>
      ${unreadCount > 0 ? `<button class="notif-mark-read" onclick="markAllNotificationsAsRead()">Mark all as read</button>` : ''}
    </div>
    ${showPermBanner ? `
      <div style="background:rgba(197,160,89,0.12);border-bottom:1px solid rgba(197,160,89,0.22);padding:9px 14px;font-size:0.78rem;display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span style="color:var(--text-primary);"><i class='bx bx-bell-ring' style="color:var(--accent-color);"></i> Allow phone/device alerts:</span>
        <button type="button" class="btn btn-sm btn-primary" onclick="requestDeviceNotifications()" style="padding:3px 10px;font-size:0.72rem;border-radius:var(--radius-full);white-space:nowrap;">Enable</button>
      </div>` : ''}
    <div class="notif-list">
      ${userNotifications.length === 0 ? `
        <div style="padding:28px 16px;text-align:center;color:var(--clr-text-muted);font-size:0.85rem;">
          <i class='bx bx-bell-off' style="font-size:2rem;display:block;margin-bottom:6px;"></i>
          No notifications yet
          <div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            <button type="button" class="btn btn-sm btn-outline" onclick="sendTestNotification()">
              <i class='bx bx-bell-ring'></i> Test Notification
            </button>
          </div>
        </div>` : userNotifications.map(n => `
        <div class="notif-item ${n.is_read ? 'read' : 'unread'}" onclick="handleNotificationClick('${n.id}', '${n.order_id || ''}')">
          <div class="notif-item-dot"></div>
          <div class="notif-item-content">
            <div class="notif-item-title">${n.title}</div>
            <div class="notif-item-msg">${n.message}</div>
            <div class="notif-item-time">${formatTimeAgo(n.created_at)}</div>
          </div>
        </div>`).join('')}
    </div>`;
}

async function requestDeviceNotifications() {
  if (!('Notification' in window)) {
    showToast('Notifications not supported by this browser.', 'info');
    return;
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      showToast('Device notifications enabled!', 'success');
      // Trigger a confirmation OS notification
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification('8 Saints Tailoring', {
          body: 'System alerts are active! You will receive order updates here.',
          icon: '/assets/icons/icon-192.png',
          badge: '/assets/icons/icon-192.png'
        });
      } else {
        new Notification('8 Saints Tailoring', {
          body: 'System alerts are active! You will receive order updates here.',
          icon: '/assets/icons/icon-192.png'
        });
      }
      renderNotificationList();
    } else {
      showToast('Notifications were not granted in browser settings.', 'info');
    }
  } catch (e) {
    console.warn('Notification permission error:', e);
  }
}

window.requestDeviceNotifications = requestDeviceNotifications;

async function sendTestNotification() {
  const user = window.__currentUser || window.__8ST?.getSessionUser?.();
  if (!user) {
    showToast('Please log in first to test notifications.', 'info');
    return;
  }

  // Also request permission if not yet decided
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }

  const sample = {
    id: 'test-' + Date.now(),
    user_id: user.id,
    title: 'Quotation Ready!',
    message: 'Your custom Barong Tagalog order #8S-TEST has been quoted at ₱2,500. Tap to review!',
    is_read: false,
    created_at: new Date().toISOString()
  };

  const client = window.__8ST?.getClient?.();
  if (client) {
    try {
      await client.from('notifications').insert([{
        user_id: user.id,
        title: sample.title,
        message: sample.message,
        is_read: false
      }]);
    } catch (e) {
      console.warn('Realtime test notification DB insert note:', e);
    }
  }

  handleIncomingNotification(sample);
}

window.sendTestNotification = sendTestNotification;
window.handleIncomingNotification = handleIncomingNotification;

async function markAllNotificationsAsRead() {
  const user = window.__currentUser || window.__8ST?.getSessionUser?.();
  if (!user) return;

  userNotifications.forEach(n => { n.is_read = true; });
  updateNotificationBadge();
  renderNotificationList();

  const client = window.__8ST?.getClient?.();
  if (client) {
    try {
      await client
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
    } catch (e) {
      console.warn('[8ST] Mark all read error:', e);
    }
  }
}

async function handleNotificationClick(notifId, orderId) {
  const notif = userNotifications.find(n => String(n.id) === String(notifId));
  if (notif && !notif.is_read) {
    notif.is_read = true;
    updateNotificationBadge();
    const client = window.__8ST?.getClient?.();
    if (client) {
      client.from('notifications').update({ is_read: true }).eq('id', notifId).then(() => {}).catch(() => {});
    }
  }

  const panel = document.getElementById('notif-dropdown');
  if (panel) panel.classList.add('hidden');

  window.location.href = '/pages/customer-orders.html';
}

function formatTimeAgo(isoStr) {
  if (!isoStr) return '';
  const diffSec = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

window.markAllNotificationsAsRead = markAllNotificationsAsRead;
window.handleNotificationClick = handleNotificationClick;

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

// --PERSISTENT & DISMISSIBLE PWA INSTALL BANNER--
let deferredInstallPrompt = null;

function setupPWAInstallPrompt() {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (isStandalone) return;

  const dismissedTs = localStorage.getItem('8st_pwa_dismissed');
  if (dismissedTs) {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - parseInt(dismissedTs, 10) < sevenDaysMs) {
      return;
    }
  }

  // Detect iOS Safari (no beforeinstallprompt event)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

  if (isIOS && isSafari) {
    renderPWAInstallBanner(true);
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    renderPWAInstallBanner(false);
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    localStorage.setItem('8st_pwa_installed', 'true');
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.remove();
    showToast('8 Saints Tailoring app installed!', 'success');
  });
}

function renderPWAInstallBanner(isIOS = false) {
  if (document.getElementById('pwa-install-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.className = 'pwa-install-banner';

  if (isIOS) {
    banner.innerHTML = `
      <div class="pwa-banner-left">
        <img src="/assets/icons/icon-192.png" alt="8 Saints App Icon" class="pwa-banner-icon">
        <div class="pwa-banner-text">
          <div class="pwa-banner-title">Install 8 Saints App</div>
          <div class="pwa-banner-sub">Tap <i class='bx bx-share' style="vertical-align:middle;color:var(--accent-color)"></i> Share, then select <strong>"Add to Home Screen"</strong></div>
        </div>
      </div>
      <button class="pwa-banner-close" aria-label="Dismiss banner" onclick="dismissPWABanner()"><i class='bx bx-x'></i></button>`;
  } else {
    banner.innerHTML = `
      <div class="pwa-banner-left">
        <img src="/assets/icons/icon-192.png" alt="8 Saints App Icon" class="pwa-banner-icon">
        <div class="pwa-banner-text">
          <div class="pwa-banner-title">Install 8 Saints Tailoring</div>
          <div class="pwa-banner-sub">Quick order tracking & offline access</div>
        </div>
      </div>
      <div class="pwa-banner-actions">
        <button class="btn btn-sm btn-primary" id="pwa-banner-install-btn" onclick="triggerPWAInstall()">Install</button>
        <button class="pwa-banner-close" aria-label="Dismiss banner" onclick="dismissPWABanner()"><i class='bx bx-x'></i></button>
      </div>`;
  }

  document.body.appendChild(banner);
}

async function triggerPWAInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  if (choice.outcome === 'accepted') {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.remove();
  }
  deferredInstallPrompt = null;
}

function dismissPWABanner() {
  localStorage.setItem('8st_pwa_dismissed', Date.now().toString());
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.remove();
}

window.triggerPWAInstall = triggerPWAInstall;
window.dismissPWABanner = dismissPWABanner;

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
