// --SERVICES MODULE INITIALIZATION--
let allServices = [];
window._currentCatalogCategory = 'All';

// --FETCH ALL SERVICES FROM SUPABASE--
async function fetchServices() {
  const client = window.__8ST?.getClient?.();

  if (client) {
    try {
      const { data, error } = await client
        .from('services')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        allServices = data;
        window.allServices = data;
        window.cacheData('services', data);
        return data;
      }
      if (error) {
        console.warn('[8ST] Supabase fetchServices error:', error.message);
      }
    } catch (err) {
      console.warn('[8ST] fetchServices exception:', err);
    }
  }

  // Fallback to local cache if client unavailable or offline
  const cached = window.loadCache('services');
  if (cached && Array.isArray(cached) && cached.length > 0) {
    allServices = cached;
    window.allServices = cached;
    return cached;
  }

  allServices = [];
  window.allServices = [];
  return [];
}

// --ATTACH SERVICE CARD CLICK LISTENERS--
function handleContainerCardClick(e) {
  const card = e.target.closest('.service-card');
  if (!card) return;
  const id = card.dataset.id;
  const list = window.allServices || allServices || [];
  const service = list.find(s => String(s.id) === String(id));
  if (service) {
    openCustomizeModal(service);
  }
}

function attachCardClickListeners(container) {
  if (!container) return;
  container.removeEventListener('click', handleContainerCardClick);
  container.addEventListener('click', handleContainerCardClick);
}

// --RENDER CATALOG SWIPE (HOMEPAGE)--
async function renderCatalogSwipe(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `<div class="spinner"></div>`;
  const services = await fetchServices();

  if (!services || !services.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding:24px 16px;text-align:center;width:100%;">
        <div class="empty-state-icon"><i class='bx bx-info-circle'></i></div>
        <p class="empty-state-title">No services currently available.</p>
      </div>`;
    return;
  }

  container.innerHTML = services.map(s => serviceCardHTML(s, false)).join('');
  attachCardClickListeners(container);
}

// --RENDER CATALOG FULL (CATALOG PAGE)--
async function renderCatalogFull(containerId, filter = 'All') {
  const container = document.getElementById(containerId);
  if (!container) return;

  window._currentCatalogCategory = filter;
  container.innerHTML = `<div class="spinner"></div>`;
  const services = await fetchServices();

  if (!services || !services.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;width:100%;text-align:center;padding:40px 16px;">
        <div class="empty-state-icon"><i class='bx bx-info-circle'></i></div>
        <p class="empty-state-title">No services currently available.</p>
      </div>`;
    return;
  }

  const filtered = filter === 'All' ? services : services.filter(s => s.category === filter);

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;width:100%;text-align:center;padding:40px 16px;">
        <div class="empty-state-icon"><i class='bx bx-search-alt'></i></div>
        <p class="empty-state-title">No services in this category</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(s => serviceCardHTML(s, true)).join('');
  attachCardClickListeners(container);
}

// --SERVICE CARD HTML TEMPLATE--
function serviceCardHTML(s, fullWidth) {
  const imgSrc = s.image_url || '/assets/images/service_suit.png';
  return `
  <div class="service-card fade-up" data-id="${s.id}">
    <img class="service-card-img" src="${imgSrc}" alt="${s.name}" loading="lazy"
      onerror="this.src='/assets/images/hero.png'">
    <div class="service-card-body">
      <div class="service-card-badge">${s.category || 'Custom'}</div>
      <div class="service-card-name">${s.name}</div>
      <div class="service-card-price">From ${window.formatPHP(s.base_price)}</div>
      <button type="button" class="btn btn-sm btn-outline customize-card-btn" data-id="${s.id}" style="margin-top:8px;width:100%;font-size:0.75rem;padding:6px 10px;border-radius:var(--radius-full);">Customize Now</button>
    </div>
  </div>`;
}

// --BACKEND SEARCH INTEGRATION--
async function searchServices(searchTerm, containerId = 'catalog-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const term = (searchTerm || '').trim();
  if (!term) {
    renderCatalogFull(containerId, window._currentCatalogCategory || 'All');
    return;
  }

  container.innerHTML = `<div class="spinner"></div>`;

  const client = window.__8ST?.getClient?.();
  let results = [];

  if (client) {
    try {
      let query = client.from('services').select('*').ilike('name', `%${term}%`);
      if (window._currentCatalogCategory && window._currentCatalogCategory !== 'All') {
        query = query.eq('category', window._currentCatalogCategory);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        results = data;
      }
    } catch (err) {
      console.warn('[8ST] Search query failed, falling back to local array:', err);
    }
  }

  // Fallback: search within cached/in-memory array
  if (results.length === 0 && allServices.length > 0) {
    const q = term.toLowerCase();
    results = allServices.filter(s => {
      const matchCat = !window._currentCatalogCategory || window._currentCatalogCategory === 'All' || s.category === window._currentCatalogCategory;
      const matchName = (s.name || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q);
      return matchCat && matchName;
    });
  }

  if (!results.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;width:100%;text-align:center;padding:40px 16px;">
        <div class="empty-state-icon"><i class='bx bx-search'></i></div>
        <p class="empty-state-title">No services found matching "${term}"</p>
      </div>`;
    return;
  }

  container.innerHTML = results.map(s => serviceCardHTML(s, true)).join('');
  attachCardClickListeners(container);
}

// --OPEN CUSTOMIZE MODAL (WITH AUTH GUARD)--
function openCustomizeModal(service) {
  const user = window.__currentUser || window.__8ST?.getSessionUser?.();
  if (!user) {
    if (window.showToast) window.showToast('Please log in to customize an order.', 'info');
    setTimeout(() => {
      window.location.href = '/pages/auth.html';
    }, 700);
    return;
  }

  const modal = document.getElementById('customize-modal');
  if (!modal) {
    window.location.href = `/pages/catalog.html?customize=${encodeURIComponent(service.id)}`;
    return;
  }

  const nameEl = document.getElementById('modal-service-name');
  const catEl = document.getElementById('modal-service-category');
  const priceEl = document.getElementById('modal-service-price');
  const descEl = document.getElementById('modal-service-desc');
  const imgEl = document.getElementById('modal-service-img');
  const idEl = document.getElementById('customize-service-id');

  if (nameEl) nameEl.textContent = service.name;
  if (catEl) catEl.textContent = service.category;
  if (priceEl) priceEl.textContent = `From ${window.formatPHP(service.base_price)}`;
  if (descEl) descEl.textContent = service.description || '';
  if (imgEl) imgEl.src = service.image_url || '/assets/images/hero.png';
  if (idEl) idEl.value = service.id;

  resetSizeSelection();
  window.openModal('customize-modal');
}

// --SIZE CHIP SELECTION & MEASUREMENTS AUTO-FILL--
function resetSizeSelection() {
  document.querySelectorAll('.size-chip').forEach(c => c.classList.remove('selected'));
  const firstChip = document.querySelector('.size-chip[data-size="S"]') || document.querySelector('.size-chip');
  if (firstChip) firstChip.classList.add('selected');

  const stdSection = document.getElementById('std-size-section');
  const customSection = document.getElementById('custom-measurements-section');
  if (stdSection) stdSection.classList.remove('hidden');
  if (customSection) customSection.classList.add('hidden');

  // Pre-fill saved measurements from local storage or profile
  try {
    const raw = localStorage.getItem('8st_saved_measurements');
    if (raw) {
      const m = JSON.parse(raw);
      const fields = ['chest', 'waist', 'shoulder', 'sleeve', 'length', 'hip', 'inseam'];
      fields.forEach(f => {
        const el = document.getElementById(`m-${f}`);
        if (el && m[f] !== undefined) el.value = m[f];
      });
      if (m.notes && document.getElementById('order-design-notes')) {
        document.getElementById('order-design-notes').value = m.notes;
      }
    }
  } catch (e) {}
}

// --DOM INITIALIZATION--
document.addEventListener('DOMContentLoaded', () => {
  // Size chips
  document.querySelectorAll('.size-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.size-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');

      const customSection = document.getElementById('custom-measurements-section');
      if (chip.dataset.size === 'CUSTOM' && customSection) {
        customSection.classList.remove('hidden');
      } else if (customSection) {
        customSection.classList.add('hidden');
      }
    });
  });

  // Search input with debounce
  const searchInput = document.getElementById('searchInput') || document.getElementById('catalog-search');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        searchServices(e.target.value, 'catalog-grid');
      }, 300);
    });
  }

  // Filter pills
  const filterPills = document.querySelectorAll('.filter-pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const filter = pill.dataset.filter || 'All';
      renderCatalogFull('catalog-grid', filter);
    });
  });

  // Poster toggle inputs
  const fileInput = document.getElementById('service-form-imgfile');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        window._serviceUploadedImg = e.target.result;
        updateServiceImagePreview(e.target.result);
      };
      reader.readAsDataURL(file);
    });
  }

  const urlInput = document.getElementById('service-form-imgurl');
  if (urlInput) {
    urlInput.addEventListener('input', () => {
      window._serviceUploadedImg = '';
      updateServiceImagePreview(urlInput.value.trim());
    });
  }
});

// --ADMIN SERVICES TABLE RENDER--
async function renderAdminServicesTable(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `<div class="spinner"></div>`;
  const services = await fetchServices();

  if (!services.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class='bx bx-cut'></i></div>
        <p class="empty-state-title">No services found</p>
        <p class="empty-state-sub">Add your first service using the button above.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
  <div class="crud-table-wrap">
    <table class="crud-table">
      <thead>
        <tr>
          <th>Image</th><th>Name</th><th>Category</th><th>Base Price</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${services.map(s => `
        <tr>
          <td data-label="Image"><img src="${s.image_url || '/assets/images/service_suit.png'}" style="width:48px;height:48px;border-radius:8px;object-fit:cover;" alt="${s.name}" onerror="this.src='/assets/images/hero.png'"></td>
          <td data-label="Name"><strong>${s.name}</strong><br><small style="color:var(--clr-text-muted)">${(s.description || '').slice(0, 50)}…</small></td>
          <td data-label="Category"><span class="service-card-badge">${s.category}</span></td>
          <td data-label="Base Price">${window.formatPHP(s.base_price)}</td>
          <td data-label="Actions">
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="btn btn-sm btn-outline" onclick="openServiceForm('${s.id}')">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deleteService('${s.id}')">Delete</button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

// --OPEN SERVICE FORM (CREATE / EDIT)--
function openServiceForm(serviceId = null) {
  const service = serviceId ? allServices.find(s => String(s.id) === String(serviceId)) : null;
  const title = service ? 'Edit Service' : 'Add New Service';

  document.getElementById('service-form-title').textContent = title;
  document.getElementById('service-form-id').value = service?.id || '';
  document.getElementById('service-form-name').value = service?.name || '';
  document.getElementById('service-form-category').value = service?.category || '';
  document.getElementById('service-form-price').value = service?.base_price || '';
  document.getElementById('service-form-imgurl').value = service?.image_url || '';
  document.getElementById('service-form-desc').value = service?.description || '';

  // Reset poster section
  const preview = document.getElementById('service-img-preview');
  if (preview) {
    preview.src = service?.image_url || '';
    preview.style.display = service?.image_url ? 'block' : 'none';
  }
  const previewPlaceholder = document.getElementById('service-img-placeholder');
  if (previewPlaceholder) previewPlaceholder.style.display = service?.image_url ? 'none' : 'flex';

  switchPosterMode('url');
  window.openModal('service-modal');
}

// --SUBMIT SERVICE FORM (CREATE / UPDATE)--
async function submitServiceForm() {
  const id = document.getElementById('service-form-id').value;

  let imageUrl = document.getElementById('service-form-imgurl')?.value.trim() || '';
  const uploadedDataUrl = window._serviceUploadedImg || '';
  if (uploadedDataUrl) imageUrl = uploadedDataUrl;

  const payload = {
    name: document.getElementById('service-form-name').value.trim(),
    category: document.getElementById('service-form-category').value.trim(),
    base_price: parseFloat(document.getElementById('service-form-price').value),
    image_url: imageUrl,
    description: document.getElementById('service-form-desc').value.trim(),
  };

  if (!payload.name || !payload.category || isNaN(payload.base_price)) {
    window.showToast('Please fill in all required fields.', 'error');
    return;
  }

  const client = window.__8ST?.getClient?.();
  let success = false;

  if (client) {
    try {
      if (id) {
        const { error } = await client.from('services').update(payload).eq('id', id);
        success = !error;
        if (error) window.showToast(error.message, 'error');
      } else {
        const { error } = await client.from('services').insert([payload]);
        success = !error;
        if (error) window.showToast(error.message, 'error');
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  } else {
    if (id) {
      const idx = allServices.findIndex(s => String(s.id) === String(id));
      if (idx > -1) allServices[idx] = { ...allServices[idx], ...payload };
    } else {
      allServices.unshift({ id: 'srv-' + Date.now(), ...payload, created_at: new Date().toISOString() });
    }
    window.cacheData('services', allServices);
    success = true;
  }

  if (success) {
    window.showToast(id ? 'Service updated!' : 'Service created!', 'success');
    window.closeModal('service-modal');
    renderAdminServicesTable('admin-services-container');
  }
}

// --DELETE SERVICE--
async function deleteService(serviceId) {
  if (!confirm('Delete this service? This action cannot be undone.')) return;

  const client = window.__8ST?.getClient?.();
  let success = false;

  if (client) {
    try {
      const { error } = await client.from('services').delete().eq('id', serviceId);
      success = !error;
      if (error) window.showToast(error.message, 'error');
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  } else {
    allServices = allServices.filter(s => String(s.id) !== String(serviceId));
    window.cacheData('services', allServices);
    success = true;
  }

  if (success) {
    window.showToast('Service deleted.', 'warning');
    renderAdminServicesTable('admin-services-container');
  }
}

// --POSTER TOGGLE MODE--
function switchPosterMode(mode) {
  const urlWrap = document.getElementById('poster-url-wrap');
  const uploadWrap = document.getElementById('poster-upload-wrap');
  const btnUrl = document.getElementById('poster-btn-url');
  const btnUpload = document.getElementById('poster-btn-upload');

  if (!urlWrap) return;

  if (mode === 'url') {
    urlWrap.classList.remove('hidden');
    uploadWrap?.classList.add('hidden');
    btnUrl?.classList.add('poster-btn-active');
    btnUpload?.classList.remove('poster-btn-active');
    window._serviceUploadedImg = '';
  } else {
    urlWrap.classList.add('hidden');
    uploadWrap?.classList.remove('hidden');
    btnUrl?.classList.remove('poster-btn-active');
    btnUpload?.classList.add('poster-btn-active');
  }
}

function updateServiceImagePreview(src) {
  const preview = document.getElementById('service-img-preview');
  const placeholder = document.getElementById('service-img-placeholder');
  if (!preview) return;

  if (src) {
    preview.src = src;
    preview.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
  } else {
    preview.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
  }
}

// --EXPORTS--
window.fetchServices = fetchServices;
window.renderCatalogSwipe = renderCatalogSwipe;
window.renderCatalogFull = renderCatalogFull;
window.searchServices = searchServices;
window.renderAdminServicesTable = renderAdminServicesTable;
window.openCustomizeModal = openCustomizeModal;
window.openServiceForm = openServiceForm;
window.submitServiceForm = submitServiceForm;
window.deleteService = deleteService;
window.switchPosterMode = switchPosterMode;
