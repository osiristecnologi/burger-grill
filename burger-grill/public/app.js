// Butral Lanches - frontend
// Sends only product IDs + quantities; backend computes prices.
const $ = id => document.getElementById(id);
const fmt = n => 'R$ ' + n.toFixed(2).replace('.', ',');
const HIST_KEY = 'brutallanches:history';

const cart = new Map();
let PRODUCTS = [];
let CONFIG = { pixKey: '', receiver: '', whatsapp: '' };
let activeCategory = 'todos';

// ---------- Boot ----------
async function boot() {
  const [products, config] = await Promise.all([
    fetch('/api/products').then(r => r.json()),
    fetch('/api/config').then(r => r.json()),
  ]);
  PRODUCTS = products;
  CONFIG = config;

  const wa = CONFIG.whatsapp ? `https://wa.me/${CONFIG.whatsapp}` : '#';
  $('wa-banner').href = wa;
  $('wa-float').href = wa;
  $('wa-display').textContent = formatPhone(CONFIG.whatsapp);

  renderTabs();
  renderMenu();
  renderHistory();
}

function formatPhone(d) {
  if (!d) return 'WhatsApp';
  const m = d.replace(/\D/g, '');
  if (m.length >= 12) {
    const cc = m.slice(0, 2);
    const ddd = m.slice(2, 4);
    const rest = m.slice(4);
    const a = rest.slice(0, rest.length - 4);
    const b = rest.slice(-4);
    return `+${cc} (${ddd}) ${a}-${b}`;
  }
  return m;
}

// ---------- Menu ----------
function renderTabs() {
  const cats = ['todos', ...new Set(PRODUCTS.map(p => p.categoria))];
  const wrap = $('cat-tabs');
  wrap.innerHTML = '';
  for (const c of cats) {
    const b = document.createElement('button');
    b.textContent = c === 'todos' ? 'Todos' : c;
    b.className = c === activeCategory ? 'active' : '';
    b.addEventListener('click', () => { activeCategory = c; renderTabs(); renderMenu(); });
    wrap.appendChild(b);
  }
}

function renderMenu() {
  const grid = $('menu-grid');
  grid.innerHTML = '';

  const list = PRODUCTS.filter(p => activeCategory === 'todos' || p.categoria === activeCategory);

  for (const p of list) {
    const qty = cart.get(p.id) || 0;
    const card = document.createElement('article');
    card.className = 'item';
    card.innerHTML = `
      <div class="img" data-emoji="${emojiFor(p.categoria)}">
        <img alt="${p.nome}" loading="lazy" />
      </div>
      <div class="body">
        <span class="cat">${p.categoria}</span>
        <h3>${p.nome}</h3>
        <p class="desc">${p.descricao || ''}</p>
        <div class="price">${fmt(p.preco)}</div>
        <div class="add">
          <button data-act="dec" data-id="${p.id}" aria-label="Diminuir">−</button>
          <span class="qty">${qty}</span>
          <button data-act="inc" data-id="${p.id}" aria-label="Adicionar">+</button>
        </div>
      </div>`;

    // Tratamento de imagens
    const imgEl = card.querySelector('img');
    const fotos = p.imagens || (p.imagem? [p.imagem] : []);
    const primeiraFoto = fotos[0] || '';

    if (primeiraFoto) {
      imgEl.src = primeiraFoto;
      imgEl.addEventListener('error', () => {
        imgEl.remove();
        card.querySelector('.img').textContent = emojiFor(p.categoria);
      });

      if (fotos.length > 1) {
        let idx = 0;
        imgEl.style.cursor = 'pointer';
        imgEl.title = 'Clique para ver mais fotos';
        imgEl.addEventListener('click', (e) => {
          e.stopPropagation();
          idx = (idx + 1) % fotos.length;
          imgEl.src = fotos[idx];
        });
      }
    } else {
      imgEl.remove();
      card.querySelector('.img').textContent = emojiFor(p.categoria);
    }

    grid.appendChild(card);
  }

  // Handler de clique dos botões + / −
  grid.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const id = b.dataset.id;
    const cur = cart.get(id) || 0;

    if (b.dataset.act === 'inc') {
      cart.set(id, Math.min(50, cur + 1));
    } else if (cur > 1) {
      cart.set(id, cur - 1);
    } else {
      cart.delete(id);
    }

    renderMenu();
    renderCart();
  };
}

function emojiFor(c) {
  return { hamburguer:'🍔', combo:'🍔', porcao:'🍟', bebida:'🥤', sobremesa:'🍨' }[c] || '🍽️';
}

// ---------- Cart ----------
function renderCart() {
  const el = $('cart');
  const btn = $('goto-checkout');
  if (cart.size === 0) {
    el.innerHTML = '<p class="empty">Toque em <strong>+</strong> nos itens para montar seu pedido.</p>';
    btn.disabled = true;
    return;
  }
  let html = '';
  let total = 0;
  for (const [id, qty] of cart) {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) continue;
    const sub = p.preco * qty;
    total += sub;
    html += `<div class="row"><span>${qty}× ${p.nome}</span><span>${fmt(sub)}</span></div>`;
  }
  html += `<div class="total"><span>Subtotal</span><span>${fmt(total)} <span class="pending">(servidor confirma)</span></span></div>`;
  el.innerHTML = html;
  btn.disabled = false;
}

// ---------- Checkout ----------
let activeType = null;

document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeType = btn.dataset.type;
    document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b === btn));
    $('tipo-input').value = activeType;
    $('checkout-form').classList.remove('hidden');
    document.querySelectorAll('.form-block').forEach(f => {
      f.classList.toggle('hidden', f.dataset.form !== activeType);
    });
    updateCheckoutSummary();
  });
});

function updateCheckoutSummary() {
  const el = $('checkout-summary');
  let html = '';
  let total = 0;
  for (const [id, qty] of cart) {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) continue;
    const sub = p.preco * qty;
    total += sub;
    html += `<div class="row" style="display:flex;justify-content:space-between"><span>${qty}× ${p.nome}</span><span>${fmt(sub)}</span></div>`;
  }
  html += `<div class="total"><span>Total</span><span>${fmt(total)}</span></div>`;
  el.innerHTML = html;
}

$('goto-checkout').addEventListener('click', () => {
  $('checkout').classList.remove('hidden');
  $('confirm').classList.add('hidden');
  updateCheckoutSummary();
  $('checkout').scrollIntoView({ behavior: 'smooth' });
});

$('back-to-cart').addEventListener('click', () => {
  $('checkout').classList.add('hidden');
  $('carrinho').scrollIntoView({ behavior: 'smooth' });
});

$('checkout-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('form-err').textContent = '';
  if (!activeType) { $('form-err').textContent = 'Selecione o tipo do pedido.'; return; }

  const fd = new FormData(e.target);
  const tipo = activeType;
  const payload = {
    tipo,
    cliente: (fd.get('cliente') || '').toString().trim(),
    observacao: (fd.get('observacao') || '').toString().trim(),
    itens: [...cart.entries()].map(([id, quantidade]) => ({ id, quantidade })),
  };
  if (tipo === 'mesa') {
    payload.mesa = (fd.get('mesa') || '').toString().trim();
  } else if (tipo === 'entrega') {
    payload.telefone = (fd.get('telefone') || '').toString();
    payload.endereco = {
      rua: (fd.get('rua') || '').toString().trim(),
      numero: (fd.get('numero') || '').toString().trim(),
      bairro: (fd.get('bairro') || '').toString().trim(),
      complemento: (fd.get('complemento') || '').toString().trim(),
      referencia: (fd.get('referencia') || '').toString().trim(),
    };
  } else if (tipo === 'retirada') {
    payload.telefone = (fd.get('telefone') || '').toString();
  }

  const submitBtn = e.target.querySelector('button[type=submit]');
  submitBtn.disabled = true;

  try {
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      $('form-err').textContent = (data.details && data.details.join(' • ')) || 'Erro ao enviar pedido.';
      return;
    }
    saveToHistory(data.order, data.whatsappUrl);
    showConfirm(data.order, data.whatsappUrl);
  } catch (err) {
    $('form-err').textContent = 'Falha de conexão. Tente novamente.';
  } finally {
    submitBtn.disabled = false;
  }
});

function showConfirm(order, waUrl) {
  cart.clear();
  renderMenu();
  renderCart();
  $('checkout').classList.add('hidden');
  $('confirm').classList.remove('hidden');
  $('confirm-id').textContent = order.id;
  $('confirm-wa').href = waUrl || '#';
  $('pix-key').textContent = CONFIG.pixKey || '—';
  $('pix-receiver').textContent = CONFIG.receiver || '—';
  if (waUrl) window.open(waUrl, '_blank', 'noopener');
  $('confirm').scrollIntoView({ behavior: 'smooth' });
  renderHistory();
}

$('new-order').addEventListener('click', () => {
  $('confirm').classList.add('hidden');
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  $('checkout-form').classList.add('hidden');
  activeType = null;
  $('cardapio').scrollIntoView({ behavior: 'smooth' });
});

$('copy-key').addEventListener('click', async (e) => {
  try {
    await navigator.clipboard.writeText(CONFIG.pixKey);
    e.currentTarget.textContent = 'Copiado!';
    e.currentTarget.classList.add('ok');
    setTimeout(() => {
      e.currentTarget.textContent = 'Copiar chave';
      e.currentTarget.classList.remove('ok');
    }, 1800);
  } catch {
    alert('Chave Pix: ' + CONFIG.pixKey);
  }
});

// ---------- History ----------
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); }
  catch { return []; }
}
function saveHistory(list) {
  localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, 30)));
}
function saveToHistory(order, waUrl) {
  const list = loadHistory();
  list.unshift({
    id: order.id,
    tipo: order.tipo,
    total: order.total,
    data: order.data,
    itens: order.itens.map(i => ({ q: i.quantidade, n: i.produto })),
    wa: waUrl,
  });
  saveHistory(list);
}

function renderHistory() {
  const list = loadHistory();
  const wrap = $('history-list');
  if (list.length === 0) {
    wrap.innerHTML = '<p class="empty">Você ainda não fez pedidos.</p>';
    return;
  }
  wrap.innerHTML = '';
  for (const o of list) {
    const card = document.createElement('div');
    card.className = 'h-card';
    const d = new Date(o.data);
    const dataStr = d.toLocaleString('pt-BR');
    const items = o.itens.map(i => `${i.q}× ${i.n}`).join(' · ');
    card.innerHTML = `
      <div>
        <div class="id">${o.id}</div>
        <div class="meta">${o.tipo.toUpperCase()} • ${dataStr}</div>
        <span class="status">aguardando comprovante</span>
      </div>
      <div class="total">${fmt(o.total)}</div>
      <div class="items">${items}</div>
      <div class="actions">
        ${o.wa ? `<a class="resend" target="_blank" rel="noopener" href="${o.wa}">Reabrir no WhatsApp</a>` : ''}
        <button class="remove" data-id="${o.id}">Remover</button>
      </div>`;
    card.querySelector('.remove').addEventListener('click', () => {
      const filtered = loadHistory().filter(x => x.id !== o.id);
      saveHistory(filtered);
      renderHistory();
    });
    wrap.appendChild(card);
  }
}

boot();
