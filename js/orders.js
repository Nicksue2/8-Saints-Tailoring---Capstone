// --ORDERS MODULE INITIALIZATION--
let allOrders = [];

// --FETCH ORDERS FROM SUPABASE--
async function fetchOrders(customerOnly = false) {
  const client = window.__8ST?.getClient?.();
  const user = window.__currentUser || window.__8ST?.getSessionUser?.();

  if (customerOnly && !user) {
    return [];
  }

  if (client) {
    try {
      let query = client.from('orders').select('*').order('created_at', { ascending: false });
      if (customerOnly && user) {
        query = query.eq('user_id', user.id);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        allOrders = data;
        window.cacheData(customerOnly ? 'my_orders' : 'all_orders', allOrders);
        return allOrders;
      }
      if (error) {
        console.warn('[8ST] Supabase fetchOrders error:', error.message);
      }
    } catch (err) {
      console.warn('[8ST] fetchOrders exception:', err);
    }
  }

  const cacheKey = customerOnly ? 'my_orders' : 'all_orders';
  const cached = window.loadCache(cacheKey);
  if (cached && Array.isArray(cached)) {
    allOrders = cached;
    return cached;
  }

  return [];
}

// --SUBMIT NEW ORDER (WITH STRICT AUTH GUARD)--
async function submitOrder(e) {
  e && e.preventDefault();

  const user = window.__currentUser || window.__8ST?.getSessionUser?.();
  if (!user) {
    window.showToast('Please log in to submit your order.', 'error');
    setTimeout(() => {
      window.location.href = '/pages/auth.html';
    }, 700);
    return;
  }

  const serviceId = document.getElementById('customize-service-id')?.value;
  const selectedSizeChip = document.querySelector('.size-chip.selected');
  const standardSize = selectedSizeChip?.dataset.size || 'M';
  const designNotes = document.getElementById('order-design-notes')?.value?.trim() || '';

  const measurements = {};
  const measureFields = ['chest', 'waist', 'shoulder', 'sleeve', 'length', 'hip', 'inseam'];
  measureFields.forEach(field => {
    const el = document.getElementById(`m-${field}`);
    if (el && el.value) measurements[field] = parseFloat(el.value);
  });

  if (!serviceId) {
    window.showToast('No service selected.', 'error');
    return;
  }

  const service = window.allServices?.find?.(s => String(s.id) === String(serviceId)) || { name: 'Custom Tailoring Service', base_price: 0 };

  // Match Supabase orders table schema (user_id, service_id, size_type, etc.)
  const orderPayload = {
    user_id: user.id,
    customer_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Customer',
    service_id: service.id || null,
    service_name: service.name,
    size_type: standardSize === 'CUSTOM' ? 'Custom' : 'Standard',
    standard_size: standardSize,
    measurements: measurements,
    design_notes: designNotes,
    quotation_price: null,
    status: 'Pending Quote'
  };

  const client = window.__8ST?.getClient?.();
  let success = false;

  if (client) {
    try {
      const { error } = await client.from('orders').insert([orderPayload]);
      success = !error;
      if (error) window.showToast(error.message, 'error');
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  } else {
    const demoOrder = { id: 'ord-' + Date.now(), ...orderPayload, created_at: new Date().toISOString() };
    allOrders.unshift(demoOrder);
    const cached = window.loadCache('my_orders') || [];
    cached.unshift(demoOrder);
    window.cacheData('my_orders', cached);
    success = true;
  }

  if (success) {
    window.showToast('Order placed successfully! We will send a quote soon.', 'success');
    window.closeModal('customize-modal');
    if (typeof renderCustomerOrders === 'function') renderCustomerOrders('orders-list');
  }
}

window.submitOrder = submitOrder;

// --RENDER CUSTOMER ORDERS (WITH GUEST PROMPT)--
async function renderCustomerOrders(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const user = window.__currentUser || window.__8ST?.getSessionUser?.();
  if (!user) {
    container.innerHTML = `
    <div class="empty-state" style="padding:40px 16px;text-align:center;">
      <div class="empty-state-icon"><i class='bx bx-lock-alt'></i></div>
      <p class="empty-state-title" style="font-size:1.15rem;font-weight:700;margin-bottom:8px;">Please log in to view your orders</p>
      <p class="empty-state-sub" style="margin-bottom:18px;">Log in to track your custom tailoring orders, view quotations, and manage measurements.</p>
      <a href="/pages/auth.html" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:10px 24px;">
        <i class='bx bx-log-in'></i> Login
      </a>
    </div>`;
    return;
  }

  container.innerHTML = `<div class="spinner"></div>`;
  const orders = await fetchOrders(true);

  if (!orders.length) {
    container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon"><i class='bx bx-package'></i></div>
      <p class="empty-state-title">No orders yet</p>
      <p class="empty-state-sub">Browse our catalog and place your first custom order!</p>
      <a href="/pages/catalog.html" class="btn btn-primary" style="margin-top:16px;display:inline-flex;">Browse Catalog</a>
    </div>`;
    return;
  }

  container.innerHTML = orders.map(order => customerOrderCardHTML(order)).join('');
}

window.renderCustomerOrders = renderCustomerOrders;

// --CUSTOMER ORDER CARD HTML--
function customerOrderCardHTML(order) {
  const steps = ['Pending Quote', 'Quoted', 'In Production', 'Completed'];
  const currentStep = steps.indexOf(order.status);

  const progressHTML = steps.map((step, i) => {
    const cls = i < currentStep ? 'done' : i === currentStep ? 'current' : '';
    const lineClass = i < currentStep ? 'done' : '';
    return `
    <div class="progress-step ${cls}">
      <div class="progress-step-dot">${i < currentStep ? '<i class=\'bx bx-check\'></i>' : i + 1}</div>
      <div class="progress-step-label">${step.replace(' ', '\n')}</div>
    </div>
    ${i < steps.length - 1 ? `<div class="progress-line ${lineClass}"></div>` : ''}`;
  }).join('');

  const quoteSection = order.quotation_price
    ? `<div class="quote-price"><span class="currency">₱</span><span class="amount">${Number(order.quotation_price).toLocaleString('en-PH', {minimumFractionDigits: 2})}</span><span class="per">quoted price</span></div>`
    : `<p style="font-size:0.82rem;color:var(--clr-text-muted);margin:8px 0;">Awaiting quotation from our team…</p>`;

  const approveBtn = order.status === 'Quoted'
    ? `<button class="btn btn-primary btn-sm" onclick="approveQuote('${order.id}')"><i class='bx bx-check'></i> Approve Quote</button>`
    : '';

  return `
  <div class="order-card fade-up" id="order-${order.id}">
    <div class="order-card-header">
      <div>
        <div class="order-card-name">${order.service_name || 'Custom Garment'}</div>
        <div class="order-card-id">Order #${String(order.id).slice(0, 8)} · ${window.formatDate(order.created_at)}</div>
      </div>
      ${window.statusBadgeHTML(order.status)}
    </div>
    <div class="progress-track">${progressHTML}</div>
    <hr class="divider">
    <div class="order-card-meta">
      <span><i class='bx bx-ruler'></i> Size: <strong>${order.standard_size || 'Custom'}</strong></span>
      ${order.design_notes ? `<span><i class='bx bx-note'></i> ${order.design_notes.slice(0, 60)}…</span>` : ''}
    </div>
    ${quoteSection}
    <div class="order-card-actions">${approveBtn}</div>
  </div>`;
}

// --APPROVE QUOTE (CUSTOMER)--
async function approveQuote(orderId) {
  if (!confirm('Approve this quotation and proceed with the order?')) return;

  const client = window.__8ST?.getClient?.();
  let success = false;

  if (client) {
    try {
      const { error } = await client.from('orders').update({ status: 'In Production' }).eq('id', orderId);
      success = !error;
      if (error) window.showToast(error.message, 'error');
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  } else {
    const idx = allOrders.findIndex(o => String(o.id) === String(orderId));
    if (idx > -1) allOrders[idx].status = 'In Production';
    const cached = window.loadCache('my_orders') || [];
    const cidx = cached.findIndex(o => String(o.id) === String(orderId));
    if (cidx > -1) cached[cidx].status = 'In Production';
    window.cacheData('my_orders', cached);
    success = true;
  }

  if (success) {
    window.showToast('Quote approved! Your order is now in production.', 'success');
    renderCustomerOrders('orders-list');
  }
}

window.approveQuote = approveQuote;

// --RENDER SAVED MEASUREMENTS (BENTO WIDGET)--
async function renderSizeSummary(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const user = window.__currentUser || window.__8ST?.getSessionUser?.();
  if (!user) {
    container.innerHTML = `<p class="empty-state-sub" style="font-size:0.8rem;padding:4px 0;">Please log in to view saved measurements.</p>`;
    return;
  }

  let measurements = null;
  let preferredFit = '';

  // 1. Check local storage cache (saved from profile page)
  try {
    const raw = localStorage.getItem('8st_saved_measurements');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        measurements = parsed;
      }
    }
    preferredFit = localStorage.getItem('8st_preferred_fit') || '';
  } catch (e) {}

  // 2. Fetch from profiles table (Supabase)
  const client = window.__8ST?.getClient?.();
  if (client) {
    try {
      const { data: prof } = await client
        .from('profiles')
        .select('measurements, preferred_fit')
        .eq('id', user.id)
        .maybeSingle();

      if (prof) {
        if (prof.preferred_fit) preferredFit = prof.preferred_fit;
        if (prof.measurements && typeof prof.measurements === 'object' && Object.keys(prof.measurements).length > 0) {
          measurements = prof.measurements;
        }
      }
    } catch (e) {}
  }

  // 3. Fallback: check recent orders with measurements
  if (!measurements || Object.keys(measurements).length === 0) {
    try {
      const orders = await fetchOrders(true);
      const withMeasurements = orders.find(o => o.measurements && Object.keys(o.measurements).length > 0);
      if (withMeasurements) {
        measurements = withMeasurements.measurements;
      }
    } catch (e) {}
  }

  // If still empty, display actionable prompt
  if (!measurements || Object.keys(measurements).length === 0) {
    container.innerHTML = `
      <div style="font-size:0.82rem;color:var(--clr-text-secondary);padding:4px 0;">
        No measurements saved yet.
      </div>
      <a href="/pages/profile.html" style="display:inline-flex;align-items:center;gap:4px;margin-top:6px;font-size:0.75rem;font-weight:700;color:var(--accent-color);">
        <i class='bx bx-plus-circle'></i> Add Measurements →
      </a>`;
    return;
  }

  // Format and render measurements
  const displayFields = ['chest', 'waist', 'shoulder', 'sleeve', 'length', 'hip', 'inseam'];
  const items = [];

  if (preferredFit) {
    items.push(`
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.78rem;padding:3px 0;border-bottom:1px solid var(--clr-border-light);">
        <span style="color:var(--clr-text-secondary);">Fit Style</span>
        <span style="font-weight:700;color:var(--accent-color);">${preferredFit}</span>
      </div>
    `);
  }

  displayFields.forEach(f => {
    if (measurements[f] !== undefined && measurements[f] !== '') {
      items.push(`
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.78rem;padding:3px 0;border-bottom:1px solid var(--clr-border-light);">
          <span style="color:var(--clr-text-secondary);text-transform:capitalize;">${f}</span>
          <span style="font-weight:600;color:var(--text-primary);">${measurements[f]}"</span>
        </div>
      `);
    }
  });

  if (items.length === 0 || (items.length === 1 && preferredFit)) {
    Object.entries(measurements).forEach(([k, v]) => {
      if (k !== 'notes' && typeof v !== 'object') {
        items.push(`
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.78rem;padding:3px 0;border-bottom:1px solid var(--clr-border-light);">
            <span style="color:var(--clr-text-secondary);text-transform:capitalize;">${k}</span>
            <span style="font-weight:600;color:var(--text-primary);">${v}"</span>
          </div>
        `);
      }
    });
  }

  const preview = items.slice(0, 4).join('');
  const remaining = items.length > 4 ? `<div style="font-size:0.72rem;color:var(--accent-color);text-align:right;margin-top:4px;">+${items.length - 4} more</div>` : '';

  container.innerHTML = preview + remaining;
}

window.renderSizeSummary = renderSizeSummary;

// --RENDER ADMIN ORDERS TABLE--
async function renderAdminOrders(containerId, filterStatus = 'All') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `<div class="spinner"></div>`;
  const orders = await fetchOrders(false);

  const filtered = filterStatus === 'All' ? orders : orders.filter(o => o.status === filterStatus);

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><i class='bx bx-clipboard'></i></div><p class="empty-state-title">No orders found</p></div>`;
    return;
  }

  container.innerHTML = `
  <div class="crud-table-wrap">
    <table class="crud-table">
      <thead>
        <tr>
          <th>Order ID</th><th>Customer</th><th>Service</th><th>Size</th><th>Measurements</th><th>Status</th><th>Quotation</th><th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(o => `
        <tr>
          <td data-label="Order ID"><strong>#${String(o.id).slice(0, 8)}</strong><br><small style="color:var(--clr-text-muted)">${window.formatDate(o.created_at)}</small></td>
          <td data-label="Customer">${o.customer_name || 'Customer'}</td>
          <td data-label="Service">${o.service_name || 'Custom'}</td>
          <td data-label="Size">${o.standard_size || 'Custom'}</td>
          <td data-label="Measurements">
            <button class="btn btn-sm btn-outline" onclick="viewMeasurements('${o.id}')">View</button>
          </td>
          <td data-label="Status">${window.statusBadgeHTML(o.status)}</td>
          <td data-label="Quotation">${o.quotation_price ? window.formatPHP(o.quotation_price) : '<em style="color:var(--clr-text-muted)">—</em>'}</td>
          <td data-label="Action">
            <button class="btn btn-sm btn-primary" onclick="openQuoteModal('${o.id}')">Update</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

window.renderAdminOrders = renderAdminOrders;

// --VIEW MEASUREMENTS MODAL--
function viewMeasurements(orderId) {
  const order = allOrders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  const m = order.measurements || {};
  const content = Object.keys(m).length
    ? `<div class="measurements-grid">${Object.entries(m).map(([k, v]) =>
        `<div class="section-card" style="padding:10px 14px;margin:0;">
          <div class="bento-widget-title">${k}</div>
          <div style="font-size:1.1rem;font-weight:700;">${v}"</div>
        </div>`).join('')}</div>`
    : `<p style="color:var(--clr-text-muted)">No custom measurements recorded.</p>`;

  document.getElementById('measurements-modal-order').textContent = `Order #${String(order.id).slice(0, 8)} — ${order.service_name || 'Custom'}`;
  document.getElementById('measurements-modal-content').innerHTML = content;
  document.getElementById('measurements-modal-notes').textContent = order.design_notes || 'No design notes.';

  window.openModal('measurements-modal');
}

window.viewMeasurements = viewMeasurements;

// --OPEN QUOTATION/STATUS MODAL (ADMIN)--
function openQuoteModal(orderId) {
  const order = allOrders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  document.getElementById('quote-order-id').value = order.id;
  document.getElementById('quote-order-label').textContent = `Order #${String(order.id).slice(0, 8)} — ${order.service_name || 'Custom'}`;
  document.getElementById('quote-price-input').value = order.quotation_price || '';
  document.getElementById('quote-status-select').value = order.status;

  const notesEl = document.getElementById('quote-admin-notes');
  if (notesEl) notesEl.value = order.design_notes || '';

  window.openModal('quote-modal');
}

window.openQuoteModal = openQuoteModal;

// --SUBMIT QUOTATION UPDATE (ADMIN)--
async function submitQuoteUpdate() {
  const orderId  = document.getElementById('quote-order-id')?.value?.trim();
  const priceVal = document.getElementById('quote-price-input')?.value;
  const status   = document.getElementById('quote-status-select')?.value;
  const notes    = document.getElementById('quote-admin-notes')?.value?.trim() || '';
  const btn      = document.querySelector('#quote-modal .btn-primary');

  if (!orderId || !status) {
    window.showToast('Missing order details.', 'error');
    return;
  }

  const payload = { status };
  const price = parseFloat(priceVal);
  if (!isNaN(price) && priceVal !== '') payload.quotation_price = price;
  if (notes) payload.design_notes = notes;

  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const client = window.__8ST?.getClient?.();

  if (client) {
    try {
      const { data, error } = await client
        .from('orders')
        .update(payload)
        .eq('id', orderId)
        .select();

      if (error) {
        console.error('[8ST] Order update error:', error);
        window.showToast('Save failed: ' + (error.message || 'Unknown error'), 'error');
        return;
      }

      if (!data || data.length === 0) {
        console.error('[8ST] Order update returned no rows — check RLS policy for admin role.');
        window.showToast('Save failed: No rows updated. Check admin permissions.', 'error');
        return;
      }

      // Update local cache
      const idx = allOrders.findIndex(o => String(o.id) === String(orderId));
      if (idx > -1) allOrders[idx] = { ...allOrders[idx], ...payload };
      window.cacheData('all_orders', allOrders);

      window.showToast('Order updated successfully!', 'success');
      window.closeModal('quote-modal');

      // Refresh admin UI
      const currentFilter = document.querySelector('.order-filter-row .filter-pill.active')?.textContent || 'All';
      await renderAdminOrders('admin-orders-container', currentFilter);
      await renderAdminAnalytics();

      // Dispatch in-app notification for order owner (guarantee alongside DB trigger)
      try {
        const order = allOrders.find(o => String(o.id) === String(orderId));
        if (order && order.user_id) {
          const statusTitles = {
            'Quoted': 'Quotation Ready!',
            'In Production': 'Order In Production',
            'Completed': 'Order Completed!'
          };
          const title = statusTitles[status] || 'Order Status Updated';
          const msg = `Your order #${String(order.id).slice(0, 8)} status changed to: ${status}.`;
          
          client.from('notifications').insert([{
            user_id: order.user_id,
            order_id: order.id,
            title: title,
            message: msg,
            is_read: false
          }]).catch(e => console.warn('[8ST] Notification insert fallback note:', e));

          const currentUserId = window.__currentUser?.id || window.__8ST?.getSessionUser?.()?.id;
          if (currentUserId && String(currentUserId) === String(order.user_id)) {
            window.handleIncomingNotification?.({
              id: 'local-' + Date.now(),
              title: title,
              message: msg,
              order_id: order.id,
              is_read: false,
              created_at: new Date().toISOString()
            });
          }
        }
      } catch (ne) {
        console.warn('[8ST] Notification dispatch note:', ne);
      }

      // Optionally send EmailJS email for Quoted / Completed
      if ((status === 'Quoted' || status === 'Completed') && window.__8ST?.EMAILJS_SERVICE_ID) {
        try {
          const order = allOrders.find(o => String(o.id) === String(orderId));
          if (order && window.emailjs) {
            await window.emailjs.send(
              window.__8ST.EMAILJS_SERVICE_ID,
              window.__8ST.EMAILJS_TEMPLATE_ID,
              {
                to_name:    order.customer_name || 'Valued Customer',
                order_id:   String(order.id).slice(0, 8),
                status:     status,
                price:      payload.quotation_price ? window.formatPHP(payload.quotation_price) : '—',
                service:    order.service_name || 'Custom Garment',
                reply_to:   order.customer_email || ''
              }
            );
          }
        } catch (emailErr) {
          console.warn('[8ST] EmailJS send failed (non-critical):', emailErr);
        }
      }

    } catch (err) {
      console.error('[8ST] submitQuoteUpdate exception:', err);
      window.showToast('Unexpected error: ' + (err.message || err), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
    }
  } else {
    // Offline fallback
    const idx = allOrders.findIndex(o => String(o.id) === String(orderId));
    if (idx > -1) allOrders[idx] = { ...allOrders[idx], ...payload };
    window.cacheData('all_orders', allOrders);
    window.showToast('Order updated (offline mode).', 'info');
    window.closeModal('quote-modal');
    renderAdminOrders('admin-orders-container', 'All');
    renderAdminAnalytics();
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  }
}

window.submitQuoteUpdate = submitQuoteUpdate;

// --RENDER ADMIN ANALYTICS SUMMARY--
async function renderAdminAnalytics() {
  const orders = await fetchOrders(false);

  const total = orders.length;
  const pending = orders.filter(o => o.status === 'Pending Quote').length;
  const production = orders.filter(o => o.status === 'In Production').length;
  const completed = orders.filter(o => o.status === 'Completed').length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('stat-total', total);
  set('stat-pending', pending);
  set('stat-production', production);
  set('stat-completed', completed);
}

window.renderAdminAnalytics = renderAdminAnalytics;

// --ACTIVE ORDER COUNT FOR HOME BENTO--
async function renderActiveOrderCount(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const user = window.__currentUser || window.__8ST?.getSessionUser?.();
  if (!user) {
    container.textContent = '0';
    return;
  }
  const orders = await fetchOrders(true);
  const active = orders.filter(o => o.status !== 'Completed');
  container.textContent = active.length;
}

window.renderActiveOrderCount = renderActiveOrderCount;
