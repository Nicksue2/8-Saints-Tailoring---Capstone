// --AUTH PAGE INITIALIZATION--
document.addEventListener('DOMContentLoaded', () => {
  window.__8ST?.initSupabase();
  setupAuthToggle();
  setupSignInForm();
  setupSignUpForm();
  loadTurnstileScript();
  setupPasswordToggles();
});

// --AUTH FORM TOGGLE--
let currentAuthMode = 'signin';

function setupAuthToggle() {
  const signInBtn = document.getElementById('toggle-signin');
  const signUpBtn = document.getElementById('toggle-signup');
  const signInPanel = document.getElementById('panel-signin');
  const signUpPanel = document.getElementById('panel-signup');

  if (!signInBtn || !signUpBtn) return;

  function switchTo(mode) {
    currentAuthMode = mode;
    const isSignIn = mode === 'signin';

    signInBtn.classList.toggle('active', isSignIn);
    signUpBtn.classList.toggle('active', !isSignIn);
    signInPanel.classList.toggle('hidden', !isSignIn);
    signUpPanel.classList.toggle('hidden', isSignIn);

    document.getElementById('auth-title').textContent = isSignIn ? 'Welcome Back' : 'Create Account';
    document.getElementById('auth-subtitle').textContent = isSignIn
      ? 'Sign in to your account'
      : 'Join 8 Saints Tailoring';
  }

  signInBtn.addEventListener('click', () => switchTo('signin'));
  signUpBtn.addEventListener('click', () => switchTo('signup'));
}

// --SIGN IN FORM HANDLER--
function setupSignInForm() {
  const form = document.getElementById('form-signin');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value;
    const btn = document.getElementById('signin-submit-btn');

    if (!email || !password) {
      showAuthError('signin', 'Please fill in all fields.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      const client = window.__8ST?.getClient?.();
      if (!client) {
        throw new Error('Supabase client is not connected. Please verify credentials.');
      }

      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const user = data?.user;
      if (user) {
        try {
          const { data: profile } = await client.from('profiles').select('*').eq('id', user.id).single();
          if (profile) {
            user.user_metadata = { ...user.user_metadata, full_name: profile.full_name, role: profile.role };
          }
        } catch (pe) {
          console.warn('[8ST] Profile fetch info:', pe);
        }
        window.__8ST.cacheSessionUser(user);
        window.__currentUser = user;
      }

      showAuthSuccess('signin', 'Signed in! Redirecting…');
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 800);
    } catch (err) {
      showAuthError('signin', err.message || 'Sign in failed.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });
}

// --SIGN UP FORM HANDLER--
function setupSignUpForm() {
  const form = document.getElementById('form-signup');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;
    const btn = document.getElementById('signup-submit-btn');

    if (!fullName || !email || !password || !confirm) {
      showAuthError('signup', 'Please fill in all fields.');
      return;
    }

    if (password !== confirm) {
      showAuthError('signup', 'Passwords do not match.');
      return;
    }

    // --STRICT PASSWORD REGEX VALIDATION--
    const strictPasswordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]).{8,}$/;
    if (!strictPasswordRegex.test(password)) {
      const missing = [];
      if (password.length < 8) missing.push('at least 8 characters');
      if (!/[A-Z]/.test(password)) missing.push('at least 1 uppercase letter');
      if (!/[0-9]/.test(password)) missing.push('at least 1 number');
      if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) missing.push('at least 1 special character (e.g. !@#$%^&*)');

      const errorMsg = 'Password requirements not met: ' + missing.join(', ') + '.';
      showAuthError('signup', errorMsg);
      if (window.showToast) {
        window.showToast(errorMsg, 'error', 4500);
      }
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating account…';

    try {
      const client = window.__8ST?.getClient?.();
      if (!client) {
        throw new Error('Supabase client is not connected. Please verify credentials.');
      }

      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role: 'customer' }
        }
      });
      if (error) throw error;

      const user = data?.user;
      if (user) {
        // Write to profiles table as strictly required
        try {
          const { error: profileError } = await client.from('profiles').insert([
            {
              id: user.id,
              full_name: fullName,
              role: 'customer'
            }
          ]);
          if (profileError) {
            console.warn('[8ST] Profile insert note:', profileError.message);
          }
        } catch (pe) {
          console.warn('[8ST] Profile insert notice:', pe);
        }

        window.__8ST.cacheSessionUser(user);
        window.__currentUser = user;
      }

      showAuthSuccess('signup', 'Account created! Redirecting to home…');
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 900);
    } catch (err) {
      showAuthError('signup', err.message || 'Sign up failed.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  });
}

// --AUTH FEEDBACK MESSAGES--
function showAuthError(panel, message) {
  const el = document.getElementById(`${panel}-error`);
  const successEl = document.getElementById(`${panel}-success`);
  if (el) { el.textContent = message; el.classList.remove('hidden'); }
  if (successEl) successEl.classList.add('hidden');
}

function showAuthSuccess(panel, message) {
  const el = document.getElementById(`${panel}-success`);
  const errorEl = document.getElementById(`${panel}-error`);
  if (el) { el.textContent = message; el.classList.remove('hidden'); }
  if (errorEl) errorEl.classList.add('hidden');
}

// --CLOUDFLARE TURNSTILE LOADER--
function loadTurnstileScript() {
  const siteKey = window.__8ST?.CLOUDFLARE_SITE_KEY;
  if (!siteKey || siteKey === '') return;

  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

// --PASSWORD TOGGLE VISIBILITY--
function setupPasswordToggles() {
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      btn.innerHTML = isText
        ? `<i class='bx bx-show'></i>`
        : `<i class='bx bx-hide'></i>`;
    });
  });
}
