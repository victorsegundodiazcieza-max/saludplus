/* ── SaludPlus · app.js ── */

'use strict';

// ── CONFIG ─────────────────────────────────────────────────────────────────────
const API_URL = 'http://localhost:8000'; // ← cambiar a URL de Render en producción

// ── STATE ──────────────────────────────────────────────────────────────────────
let chatHistorial = [];
let clinicaData   = {};
let serviciosData = [];

// ── INIT ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  initParticles();
  initNavbar();
  initMobileMenu();
  initScrollReveal();
  initChat();
  initContactForm();
  initFaqDelegation();

  await Promise.all([
    loadClinica(),
    loadServicios(),
    loadDoctores(),
    loadFaqs(),
  ]);
});

// ── NAVBAR ─────────────────────────────────────────────────────────────────────
function initNavbar() {
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });
}

function initMobileMenu() {
  const btn   = document.getElementById('mobile-menu-btn');
  const menu  = document.getElementById('mobile-menu');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => menu.classList.toggle('hidden'));
  menu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => menu.classList.add('hidden'));
  });
}

// ── SCROLL REVEAL ──────────────────────────────────────────────────────────────
function initScrollReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 80);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ── PARTICLE CANVAS ────────────────────────────────────────────────────────────
function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let particles = [];
  const PARTICLE_COUNT = 60;

  const resize = () => {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  };
  resize();
  window.addEventListener('resize', resize, { passive: true });

  class Particle {
    constructor() { this.reset(true); }
    reset(init = false) {
      this.x  = Math.random() * canvas.width;
      this.y  = init ? Math.random() * canvas.height : canvas.height + 10;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = -(Math.random() * 0.4 + 0.1);
      this.alpha = Math.random() * 0.5 + 0.1;
      this.size  = Math.random() * 2 + 0.5;
      this.color = Math.random() > 0.5 ? '0,212,255' : '0,229,160';
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.alpha -= 0.0008;
      if (this.y < -10 || this.alpha <= 0) this.reset();
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle   = `rgba(${this.color}, 1)`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new Particle());

  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });

    // Draw faint connecting lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 100) {
          ctx.save();
          ctx.globalAlpha = (1 - dist / 100) * 0.06;
          ctx.strokeStyle = '#00d4ff';
          ctx.lineWidth   = 0.5;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    requestAnimationFrame(animate);
  };
  animate();
}

// ── FETCH HELPERS ──────────────────────────────────────────────────────────────
async function apiFetch(path) {
  try {
    const res = await fetch(`${API_URL}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[SaludPlus] Error fetching ${path}:`, err.message);
    return null;
  }
}

// ── LOAD: CLINICA ──────────────────────────────────────────────────────────────
async function loadClinica() {
  const data = await apiFetch('/api/clinica');
  if (!data) return;
  clinicaData = data;

  // Hero slogan
  if (data.slogan) {
    const el = document.getElementById('hero-slogan');
    if (el) el.textContent = data.slogan;
  }

  // Stats row
  renderHeroStats(data);

  // Contact info
  renderContactInfo(data);

  // Footer
  renderFooter(data);
}

function renderHeroStats(d) {
  const container = document.getElementById('hero-stats');
  if (!container) return;

  const stats = [];
  if (serviciosData.length) stats.push({ icon: 'stethoscope', value: `${serviciosData.length}+`, label: 'Especialidades' });
  else stats.push({ icon: 'stethoscope', value: '5+', label: 'Especialidades' });

  stats.push({ icon: 'clock', value: '15+', label: 'Años de experiencia' });

  if (d.seguros_aceptados?.length) {
    stats.push({ icon: 'shield-check', value: `${d.seguros_aceptados.length}`, label: 'Seguros aceptados' });
  }

  container.innerHTML = stats.map(s => `
    <div class="stat-chip">
      <div class="logo-mark w-9 h-9 rounded-xl flex items-center justify-center">
        <i data-lucide="${s.icon}" class="w-4 h-4 text-electric"></i>
      </div>
      <div>
        <div class="text-xl font-display font-bold text-white">${s.value}</div>
        <div class="text-xs text-white/40">${s.label}</div>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

function renderContactInfo(d) {
  const container = document.getElementById('contacto-info');
  if (!container) return;

  const horario = d.horario_atencion;
  let horarioStr = '';
  if (typeof horario === 'object' && horario !== null) {
    horarioStr = Object.entries(horario).map(([k, v]) => `${k}: ${v}`).join(' · ');
  } else if (typeof horario === 'string') {
    horarioStr = horario;
  }

  const items = [
    { icon: 'map-pin',   label: 'Dirección', value: `${d.direccion || ''}, ${d.distrito || ''}, ${d.ciudad || 'Chiclayo'}` },
    { icon: 'phone',     label: 'Teléfono',  value: [d.telefono_1, d.telefono_2].filter(Boolean).join(' / ') || '—' },
    { icon: 'message-circle', label: 'WhatsApp', value: d.whatsapp || '—', link: d.whatsapp ? `https://wa.me/${d.whatsapp.replace(/\D/g,'')}` : null },
    { icon: 'clock',     label: 'Horario',   value: horarioStr || 'Consultar' },
  ].filter(i => i.value && i.value !== '—' && i.value !== ', , ');

  container.innerHTML = items.map(item => `
    <div class="contact-info-item">
      <div class="contact-icon-wrap">
        <i data-lucide="${item.icon}" class="w-4 h-4 text-electric"></i>
      </div>
      <div>
        <p class="text-xs text-white/40 mb-0.5">${item.label}</p>
        ${item.link
          ? `<a href="${item.link}" target="_blank" class="text-sm text-white hover:text-electric transition-colors">${item.value}</a>`
          : `<p class="text-sm text-white/80">${item.value}</p>`
        }
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

function renderFooter(d) {
  const footerText = document.getElementById('footer-text');
  if (footerText) {
    footerText.textContent = `© ${new Date().getFullYear()} ${d.nombre || 'SaludPlus'} · Todos los derechos reservados`;
  }

  const redes = document.getElementById('footer-redes');
  if (redes && d.redes_sociales) {
    const iconMap = { facebook: 'facebook', instagram: 'instagram', twitter: 'twitter', youtube: 'youtube', linkedin: 'linkedin', tiktok: 'music' };
    redes.innerHTML = Object.entries(d.redes_sociales).map(([red, url]) => `
      <a href="${url}" target="_blank" rel="noopener noreferrer"
         class="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:border-electric/40 hover:text-electric transition-all">
        <i data-lucide="${iconMap[red] || 'link'}" class="w-3.5 h-3.5"></i>
      </a>
    `).join('');
    lucide.createIcons();
  }
}

// ── LOAD: SERVICIOS ────────────────────────────────────────────────────────────
async function loadServicios() {
  const data = await apiFetch('/api/servicios');
  const grid  = document.getElementById('servicios-grid');
  const select = document.getElementById('cf-especialidad');
  if (!grid) return;

  if (!data || !data.length) {
    grid.innerHTML = '<p class="text-white/40 col-span-3 text-center py-8">No hay especialidades disponibles.</p>';
    return;
  }

  serviciosData = data;

  // Render cards
  grid.innerHTML = data.map((s, i) => `
    <div class="service-card rounded-2xl p-6 reveal" style="transition-delay: ${i * 60}ms">
      <div class="w-12 h-12 rounded-xl logo-mark flex items-center justify-center mb-5 text-xl" style="background: linear-gradient(135deg, ${s.color_hex || '#00d4ff'}22, ${s.color_hex || '#00e5a0'}11); border-color: ${s.color_hex || '#00d4ff'}44;">
        ${s.icono ? `<i data-lucide="${s.icono}" class="w-5 h-5" style="color: ${s.color_hex || '#00d4ff'}"></i>` : svgCross(s.color_hex || '#00d4ff')}
      </div>
      <h3 class="font-display font-bold text-lg mb-2 text-white">${escHtml(s.nombre)}</h3>
      <p class="text-white/50 text-sm leading-relaxed">${escHtml(s.descripcion || '')}</p>
    </div>
  `).join('');

  // Fill contact select
  if (select) {
    data.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.slug;
      opt.textContent = s.nombre;
      select.appendChild(opt);
    });
  }

  lucide.createIcons();
  // re-observe newly added reveal elements
  reinitReveal(grid.querySelectorAll('.reveal'));
}

// ── LOAD: DOCTORES ─────────────────────────────────────────────────────────────
async function loadDoctores() {
  const data = await apiFetch('/api/doctores');
  const grid = document.getElementById('doctores-grid');
  if (!grid) return;

  if (!data || !data.length) {
    grid.innerHTML = '<p class="text-white/40 col-span-4 text-center py-8">No hay médicos disponibles.</p>';
    return;
  }

  grid.innerHTML = data.map((d, i) => {
    const nombre    = `${d.nombres} ${d.apellidos}`;
    const initials  = `${d.nombres?.[0] || ''}${d.apellidos?.[0] || ''}`.toUpperCase();
    const especial  = d.servicios?.nombre || '';
    const precio    = d.precio_consulta ? `Desde S/ ${Math.round(d.precio_consulta)}` : '';
    const online    = d.atencion_online;

    return `
      <div class="doctor-card rounded-2xl p-6 flex flex-col gap-4 reveal" style="transition-delay: ${i * 60}ms">
        <div class="flex items-center gap-4">
          ${d.foto_url
            ? `<img src="${escHtml(d.foto_url)}" alt="${escHtml(nombre)}" class="doctor-avatar" loading="lazy" />`
            : `<div class="doctor-avatar-placeholder">${initials}</div>`
          }
          <div>
            <p class="text-xs text-white/40 mb-0.5">${escHtml(d.titulo || 'Médico Especialista')}</p>
            <h3 class="font-display font-bold text-base leading-tight">${escHtml(nombre)}</h3>
          </div>
        </div>

        <div class="flex flex-wrap gap-1.5">
          ${especial ? `<span class="badge badge-electric">${escHtml(especial)}</span>` : ''}
          ${online   ? `<span class="badge badge-emerald">Online</span>` : ''}
        </div>

        ${d.bio ? `<p class="text-xs text-white/40 leading-relaxed line-clamp-2">${escHtml(d.bio)}</p>` : ''}

        <div class="mt-auto flex items-center justify-between">
          ${precio ? `<span class="text-electric text-sm font-semibold">${precio}</span>` : '<span></span>'}
          <a href="#contacto" class="text-xs text-white/50 hover:text-electric transition-colors flex items-center gap-1">
            Agendar <i data-lucide="arrow-right" class="w-3 h-3"></i>
          </a>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
  reinitReveal(grid.querySelectorAll('.reveal'));
}

// ── LOAD: FAQS ─────────────────────────────────────────────────────────────────
async function loadFaqs() {
  const data = await apiFetch('/api/faqs');
  const list = document.getElementById('faqs-list');
  if (!list) return;

  if (!data || !data.length) {
    list.innerHTML = '<p class="text-white/40 text-center py-8">No hay preguntas frecuentes.</p>';
    return;
  }

  list.innerHTML = data.map((f, i) => `
    <div class="faq-item">
      <button class="faq-question" data-index="${i}" aria-expanded="false">
        <span>${escHtml(f.pregunta)}</span>
        <i data-lucide="plus" class="faq-icon"></i>
      </button>
      <div class="faq-answer" role="region">
        <div class="faq-answer-inner">${escHtml(f.respuesta)}</div>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

function initFaqDelegation() {
  document.getElementById('faqs-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.faq-question');
    if (!btn) return;
    const item = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');

    // Close all
    document.querySelectorAll('.faq-item.open').forEach(el => el.classList.remove('open'));

    // Toggle clicked
    if (!isOpen) item.classList.add('open');
  });
}

// ── CONTACT FORM ───────────────────────────────────────────────────────────────
function initContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const name  = document.getElementById('cf-name')?.value.trim();
    const phone = document.getElementById('cf-phone')?.value.trim();
    const espec = document.getElementById('cf-especialidad')?.value;

    if (!name) {
      showToast('Por favor ingresa tu nombre.', true);
      return;
    }

    // Compose WhatsApp message if available
    if (clinicaData.whatsapp) {
      const wa = clinicaData.whatsapp.replace(/\D/g, '');
      const especNombre = serviciosData.find(s => s.slug === espec)?.nombre || espec;
      const msg = encodeURIComponent(
        `Hola, soy ${name}. Deseo agendar una cita${especNombre ? ` de ${especNombre}` : ''}.${phone ? ` Mi teléfono es ${phone}.` : ''}`
      );
      window.open(`https://wa.me/${wa}?text=${msg}`, '_blank');
    }

    showToast('¡Solicitud enviada! Te contactaremos pronto.');
    form.reset();
  });
}

// ── CHAT ───────────────────────────────────────────────────────────────────────
function initChat() {
  const toggle    = document.getElementById('chat-toggle');
  const panel     = document.getElementById('chat-panel');
  const input     = document.getElementById('chat-input');
  const sendBtn   = document.getElementById('chat-send');
  const iconOpen  = document.getElementById('chat-icon-open');
  const iconClose = document.getElementById('chat-icon-close');

  if (!toggle || !panel) return;

  let isOpen = false;

  const openChat = () => {
    isOpen = true;
    panel.classList.remove('hidden');
    panel.classList.add('flex');
    iconOpen.classList.add('hidden');
    iconClose.classList.remove('hidden');
    if (!chatHistorial.length) injectGreeting();
    setTimeout(() => input?.focus(), 300);
  };

  const closeChat = () => {
    isOpen = false;
    panel.classList.add('hidden');
    panel.classList.remove('flex');
    iconOpen.classList.remove('hidden');
    iconClose.classList.add('hidden');
  };

  toggle.addEventListener('click', () => isOpen ? closeChat() : openChat());

  sendBtn?.addEventListener('click', sendChatMessage);
  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });
}

function injectGreeting() {
  const clinicaNombre = clinicaData.nombre || 'SaludPlus';
  appendChatMsg('assistant',
    `¡Hola! 👋 Soy el asistente virtual de **${clinicaNombre}**. Puedo ayudarte a conocer nuestras especialidades, médicos, horarios y a agendar tu cita. ¿En qué te puedo ayudar?`
  );
}

async function sendChatMessage() {
  const input   = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  if (!input) return;

  const mensaje = input.value.trim();
  if (!mensaje) return;

  // Lock UI while waiting
  input.value    = '';
  input.disabled = true;
  if (sendBtn) sendBtn.disabled = true;

  appendChatMsg('user', mensaje);
  showTyping(true);

  // Cap historial a los últimos 10 mensajes (5 turnos) antes de enviar
  const historialRecortado = chatHistorial.slice(-10);

  try {
    const res = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensaje, historial: historialRecortado }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    showTyping(false);
    appendChatMsg('assistant', data.respuesta);
    // El backend ya devuelve el historial completo con ambos turnos añadidos
    chatHistorial = data.historial || [];

  } catch (err) {
    showTyping(false);
    appendChatMsg(
      'assistant',
      'Lo siento, tuve un problema al conectarme. 😞 Por favor intenta de nuevo o contáctanos directamente por WhatsApp.'
    );
    console.warn('[Chat] Error:', err.message);

  } finally {
    // Siempre desbloquear — incluso si el request falló
    input.disabled  = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

function appendChatMsg(role, text) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  // Simple bold/line-break parsing
  div.innerHTML = formatChatText(text);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function formatChatText(text) {
  return escHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

function showTyping(show) {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) indicator.classList.toggle('hidden', !show);
  const container = document.getElementById('chat-messages');
  if (container) container.scrollTop = container.scrollHeight;
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

function svgCross(color = '#00d4ff') {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M10 2v16M2 10h16" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;
}

function reinitReveal(elements) {
  const obs = new IntersectionObserver(entries => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 60);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  elements.forEach(el => obs.observe(el));
}

let toastTimer = null;
function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  if (!toast || !msgEl) return;
  msgEl.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}
