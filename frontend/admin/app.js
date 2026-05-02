/* ── SaludPlus Admin · app.js ── */

'use strict';

// ── CONFIG ─────────────────────────────────────────────────────────────────────
const API_URL = 'http://localhost:8000'; // ← cambiar a URL de Render en producción

// ── STATE ──────────────────────────────────────────────────────────────────────
let JWT          = null;
let serviciosMap = {}; // id → nombre, para el selector de FAQs

// ── BOOT ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  JWT = sessionStorage.getItem('sp_admin_token');
  if (JWT) {
    showPanel();
  } else {
    showLogin();
  }
});

// ── SCREENS ────────────────────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('screen-login').classList.remove('hidden');
  document.getElementById('screen-panel').classList.add('hidden');
  initLoginForm();
}

function showPanel() {
  document.getElementById('screen-login').classList.add('hidden');
  document.getElementById('screen-panel').classList.remove('hidden');

  // Mostrar email del admin en topbar
  try {
    const payload = JSON.parse(atob(JWT.split('.')[1]));
    const emailEl = document.getElementById('admin-email-label');
    if (emailEl) emailEl.textContent = payload.sub || '';
  } catch (_) {}

  initTabs();
  initLogout();
  initServicioForm();
  initFaqForm();
  initDeleteModal();
  loadStats();
  loadServicios();
  loadFaqs();
}

// ── LOGIN ───────────────────────────────────────────────────────────────────────
function initLoginForm() {
  const form   = document.getElementById('login-form');
  const pwBtn  = document.getElementById('toggle-pw');
  const pwInput = document.getElementById('login-password');

  // Toggle password visibility
  pwBtn?.addEventListener('click', () => {
    const isText = pwInput.type === 'text';
    pwInput.type = isText ? 'password' : 'text';
    pwBtn.innerHTML = isText
      ? '<i data-lucide="eye" class="w-4 h-4"></i>'
      : '<i data-lucide="eye-off" class="w-4 h-4"></i>';
    lucide.createIcons();
  });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = document.getElementById('login-btn');
    const errBox   = document.getElementById('login-error');
    const errMsg   = document.getElementById('login-error-msg');

    errBox.classList.add('hidden');
    setLoading(btn, true, 'Ingresando...');

    try {
      const res = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        errMsg.textContent = data.detail || 'Credenciales incorrectas.';
        errBox.classList.remove('hidden');
        lucide.createIcons();
        return;
      }

      JWT = data.access_token;
      sessionStorage.setItem('sp_admin_token', JWT);
      showPanel();

    } catch (err) {
      errMsg.textContent = 'No se pudo conectar con el servidor.';
      errBox.classList.remove('hidden');
      lucide.createIcons();
    } finally {
      setLoading(btn, false, '<i data-lucide="log-in" class="w-4 h-4"></i><span>Ingresar</span>');
      lucide.createIcons();
    }
  });
}

// ── LOGOUT ─────────────────────────────────────────────────────────────────────
function initLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    JWT = null;
    sessionStorage.removeItem('sp_admin_token');
    showLogin();
  });
}

// ── TABS ───────────────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      document.getElementById(`tab-${tab}`)?.classList.remove('hidden');
    });
  });
}

// ── API HELPER ─────────────────────────────────────────────────────────────────
async function adminFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${JWT}`,
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_URL}/api/admin${path}`, { ...options, headers });

  if (res.status === 401) {
    // Token expirado o inválido
    JWT = null;
    sessionStorage.removeItem('sp_admin_token');
    showToast('Sesión expirada. Vuelve a iniciar sesión.', 'error');
    setTimeout(showLogin, 1500);
    throw new Error('Unauthorized');
  }

  return res;
}

// ── STATS ──────────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const res  = await adminFetch('/stats');
    const data = await res.json();
    document.getElementById('stat-servicios').textContent = data.servicios_activos ?? '—';
    document.getElementById('stat-doctores').textContent  = data.doctores_activos  ?? '—';
    document.getElementById('stat-faqs').textContent      = data.faqs_activas      ?? '—';
  } catch (_) {}
}

// ══════════════════════════════════════════════════════════════════════════════
// SERVICIOS
// ══════════════════════════════════════════════════════════════════════════════

async function loadServicios() {
  const container = document.getElementById('servicios-list');
  if (!container) return;

  container.innerHTML = skeletons(3);

  try {
    const res  = await adminFetch('/servicios');
    const data = await res.json();

    // Populate serviciosMap for the FAQ selector
    serviciosMap = {};
    data.forEach(s => { serviciosMap[s.id] = s.nombre; });
    populateFaqServicioSelect(data);

    if (!data.length) {
      container.innerHTML = emptyState('No hay servicios registrados.');
      return;
    }

    container.innerHTML = data.map(s => `
      <div class="list-row fade-in">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
             style="background: ${s.color_hex ? s.color_hex + '22' : 'rgba(0,212,255,0.1)'}; border: 1px solid ${s.color_hex ? s.color_hex + '44' : 'rgba(0,212,255,0.2)'}">
          <i data-lucide="${s.icono || 'activity'}" class="w-3.5 h-3.5" style="color: ${s.color_hex || '#00d4ff'}"></i>
        </div>
        <div class="list-row-main">
          <div class="list-row-title">${escHtml(s.nombre)}</div>
          <div class="list-row-sub">/especialidades/${escHtml(s.slug)} · ${escHtml(s.descripcion || '—')}</div>
        </div>
        <span class="badge ${s.activo ? 'badge-active' : 'badge-inactive'}">${s.activo ? 'Activo' : 'Inactivo'}</span>
        <div class="list-row-actions">
          <button class="btn-icon edit" onclick="editServicio('${s.id}')" title="Editar">
            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
          </button>
          <button class="btn-icon delete" onclick="confirmDelete('servicio','${s.id}','${escHtml(s.nombre)}')" title="Eliminar">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `).join('');

    lucide.createIcons();
  } catch (err) {
    if (err.message !== 'Unauthorized') {
      container.innerHTML = emptyState('Error al cargar servicios.');
    }
  }
}

function initServicioForm() {
  const form     = document.getElementById('form-servicio');
  const cancelEl = document.getElementById('sv-cancel-edit');

  cancelEl?.addEventListener('click', resetServicioForm);

  // Auto-generate slug from nombre
  document.getElementById('sv-nombre')?.addEventListener('input', e => {
    const editingId = document.getElementById('sv-editing-id').value;
    if (editingId) return; // don't override slug while editing
    document.getElementById('sv-slug').value = slugify(e.target.value);
  });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const editingId = document.getElementById('sv-editing-id').value;

    const body = {
      nombre:          document.getElementById('sv-nombre').value.trim(),
      slug:            document.getElementById('sv-slug').value.trim(),
      descripcion:     document.getElementById('sv-desc').value.trim()       || null,
      descripcion_larga: document.getElementById('sv-desc-larga').value.trim() || null,
      icono:           document.getElementById('sv-icono').value.trim()      || null,
      color_hex:       document.getElementById('sv-color').value.trim()      || null,
    };

    if (!body.nombre || !body.slug) {
      showToast('Nombre y slug son obligatorios.', 'error');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true, editingId ? 'Guardando...' : 'Creando...');

    try {
      const res = await adminFetch(
        editingId ? `/servicios/${editingId}` : '/servicios',
        { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(body) }
      );

      if (!res.ok) {
        const err = await res.json();
        showToast(err.detail || 'Error al guardar.', 'error');
        return;
      }

      showToast(editingId ? 'Servicio actualizado.' : 'Servicio creado.');
      resetServicioForm();
      loadServicios();
      loadStats();

    } catch (err) {
      if (err.message !== 'Unauthorized') showToast('Error de conexión.', 'error');
    } finally {
      setLoading(btn, false, '<i data-lucide="save" class="w-4 h-4"></i><span id="sv-submit-label">Crear servicio</span>');
      lucide.createIcons();
    }
  });
}

// Called from inline onclick
function editServicio(id) {
  // Find the data from the rendered list isn't reliable; re-fetch
  adminFetch(`/servicios`)
    .then(r => r.json())
    .then(data => {
      const s = data.find(x => x.id === id);
      if (!s) return;

      document.getElementById('sv-editing-id').value  = s.id;
      document.getElementById('sv-nombre').value       = s.nombre       || '';
      document.getElementById('sv-slug').value         = s.slug         || '';
      document.getElementById('sv-desc').value         = s.descripcion  || '';
      document.getElementById('sv-desc-larga').value   = s.descripcion_larga || '';
      document.getElementById('sv-icono').value        = s.icono        || '';
      document.getElementById('sv-color').value        = s.color_hex    || '';

      document.getElementById('sv-submit-label').textContent = 'Guardar cambios';
      document.getElementById('sv-cancel-edit').classList.remove('hidden');

      // Scroll to form
      document.getElementById('tab-servicios')?.querySelector('.panel-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

function resetServicioForm() {
  document.getElementById('form-servicio')?.reset();
  document.getElementById('sv-editing-id').value = '';
  const lbl = document.getElementById('sv-submit-label');
  if (lbl) lbl.textContent = 'Crear servicio';
  document.getElementById('sv-cancel-edit')?.classList.add('hidden');
}

// ══════════════════════════════════════════════════════════════════════════════
// FAQS
// ══════════════════════════════════════════════════════════════════════════════

async function loadFaqs() {
  const container = document.getElementById('faqs-list');
  if (!container) return;

  container.innerHTML = skeletons(3);

  try {
    const res  = await adminFetch('/faqs');
    const data = await res.json();

    if (!data.length) {
      container.innerHTML = emptyState('No hay FAQs registradas.');
      return;
    }

    container.innerHTML = data.map(f => {
      const especNombre = f.servicios?.nombre || (f.servicio_id ? serviciosMap[f.servicio_id] : null) || '';
      return `
        <div class="list-row fade-in">
          <div class="list-row-main">
            <div class="list-row-title">${escHtml(f.pregunta)}</div>
            <div class="list-row-sub">${especNombre ? escHtml(especNombre) + ' · ' : ''}${escHtml(f.respuesta.substring(0, 80))}${f.respuesta.length > 80 ? '…' : ''}</div>
          </div>
          <span class="badge ${f.activo ? 'badge-active' : 'badge-inactive'}">${f.activo ? 'Activa' : 'Inactiva'}</span>
          <div class="list-row-actions">
            <button class="btn-icon edit" onclick="editFaq('${f.id}')" title="Editar">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn-icon delete" onclick="confirmDelete('faq','${f.id}','FAQ #${f.orden ?? ''}')" title="Eliminar">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    lucide.createIcons();
  } catch (err) {
    if (err.message !== 'Unauthorized') {
      container.innerHTML = emptyState('Error al cargar FAQs.');
    }
  }
}

function populateFaqServicioSelect(servicios) {
  const sel = document.getElementById('fq-servicio');
  if (!sel) return;
  // Keep first option
  sel.innerHTML = '<option value="">— Sin especialidad —</option>';
  servicios.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.nombre;
    sel.appendChild(opt);
  });
}

function initFaqForm() {
  const form     = document.getElementById('form-faq');
  const cancelEl = document.getElementById('fq-cancel-edit');

  cancelEl?.addEventListener('click', resetFaqForm);

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const editingId = document.getElementById('fq-editing-id').value;

    const body = {
      pregunta:    document.getElementById('fq-pregunta').value.trim(),
      respuesta:   document.getElementById('fq-respuesta').value.trim(),
      categoria:   document.getElementById('fq-categoria').value.trim() || null,
      servicio_id: document.getElementById('fq-servicio').value        || null,
    };

    if (!body.pregunta || !body.respuesta) {
      showToast('Pregunta y respuesta son obligatorias.', 'error');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true, editingId ? 'Guardando...' : 'Creando...');

    try {
      const res = await adminFetch(
        editingId ? `/faqs/${editingId}` : '/faqs',
        { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(body) }
      );

      if (!res.ok) {
        const err = await res.json();
        showToast(err.detail || 'Error al guardar.', 'error');
        return;
      }

      showToast(editingId ? 'FAQ actualizada.' : 'FAQ creada.');
      resetFaqForm();
      loadFaqs();
      loadStats();

    } catch (err) {
      if (err.message !== 'Unauthorized') showToast('Error de conexión.', 'error');
    } finally {
      setLoading(btn, false, '<i data-lucide="save" class="w-4 h-4"></i><span id="fq-submit-label">Crear FAQ</span>');
      lucide.createIcons();
    }
  });
}

function editFaq(id) {
  adminFetch('/faqs')
    .then(r => r.json())
    .then(data => {
      const f = data.find(x => x.id === id);
      if (!f) return;

      document.getElementById('fq-editing-id').value  = f.id;
      document.getElementById('fq-pregunta').value    = f.pregunta   || '';
      document.getElementById('fq-respuesta').value   = f.respuesta  || '';
      document.getElementById('fq-categoria').value   = f.categoria  || '';
      document.getElementById('fq-servicio').value    = f.servicio_id || '';

      document.getElementById('fq-submit-label').textContent = 'Guardar cambios';
      document.getElementById('fq-cancel-edit').classList.remove('hidden');

      // Switch to FAQs tab and scroll to form
      document.querySelector('.tab-btn[data-tab="faqs"]')?.click();
      document.getElementById('tab-faqs')?.querySelector('.panel-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

function resetFaqForm() {
  document.getElementById('form-faq')?.reset();
  document.getElementById('fq-editing-id').value = '';
  const lbl = document.getElementById('fq-submit-label');
  if (lbl) lbl.textContent = 'Crear FAQ';
  document.getElementById('fq-cancel-edit')?.classList.add('hidden');
}

// ── DELETE MODAL ───────────────────────────────────────────────────────────────
let _pendingDelete = null; // { type: 'servicio'|'faq', id }

function initDeleteModal() {
  const modal    = document.getElementById('modal-delete');
  const backdrop = document.getElementById('modal-backdrop');
  const cancelBtn = document.getElementById('modal-cancel');
  const confirmBtn = document.getElementById('modal-confirm');

  const closeModal = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    _pendingDelete = null;
  };

  backdrop?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);

  confirmBtn?.addEventListener('click', async () => {
    if (!_pendingDelete) return;

    const { type, id } = _pendingDelete;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Eliminando...';

    try {
      const path = type === 'servicio' ? `/servicios/${id}` : `/faqs/${id}`;
      const res  = await adminFetch(path, { method: 'DELETE' });

      if (res.status === 204 || res.ok) {
        showToast(type === 'servicio' ? 'Servicio eliminado.' : 'FAQ eliminada.');
        closeModal();
        if (type === 'servicio') loadServicios();
        else loadFaqs();
        loadStats();
      } else {
        const err = await res.json();
        showToast(err.detail || 'No se pudo eliminar.', 'error');
        closeModal();
      }
    } catch (err) {
      if (err.message !== 'Unauthorized') showToast('Error de conexión.', 'error');
      closeModal();
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Eliminar';
    }
  });
}

// Called from inline onclick
function confirmDelete(type, id, label) {
  _pendingDelete = { type, id };
  const modal = document.getElementById('modal-delete');
  const msg   = document.getElementById('modal-delete-msg');
  if (msg) msg.textContent = `¿Seguro que deseas eliminar "${label}"? Esta acción no se puede deshacer.`;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

// ── UTILS ──────────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function skeletons(n) {
  return Array.from({ length: n }, () =>
    '<div class="list-skeleton h-14 m-4 rounded-xl"></div>'
  ).join('');
}

function emptyState(msg) {
  return `<div class="empty-state">
    <i data-lucide="inbox" class="w-8 h-8 opacity-30"></i>
    <span>${msg}</span>
  </div>`;
}

function setLoading(btn, loading, restoreHtml) {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.innerHTML = `<span class="opacity-70">${restoreHtml}</span>`;
  } else {
    btn.innerHTML = restoreHtml;
  }
}

let _toastTimer = null;
function showToast(msg, type = 'success') {
  const toast  = document.getElementById('toast');
  const msgEl  = document.getElementById('toast-msg');
  const iconEl = document.getElementById('toast-icon');
  if (!toast || !msgEl) return;

  msgEl.textContent = msg;

  if (iconEl) {
    iconEl.setAttribute('data-lucide', type === 'error' ? 'x-circle' : 'check-circle');
    iconEl.style.color = type === 'error' ? '#ff4d6d' : '#00e5a0';
  }

  toast.classList.add('show');
  lucide.createIcons();

  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}
