// Burger Grill backend
// - No login, no admin, no DB.
// - File persistence: products.json, orders.json, config.json.
// - All pricing/validation is server-side.
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PRODUCTS_FILE = path.join(ROOT, 'products.json');
const ORDERS_FILE   = path.join(ROOT, 'orders.json');
const CONFIG_FILE   = path.join(ROOT, 'config.json');
const PORT = process.env.PORT || 3000;

// ---------- File helpers ----------
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function writeJSON(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

const config = readJSON(CONFIG_FILE, { pixKey: '', receiver: '', whatsapp: '' });

// ---------- App ----------
const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "img-src": ["'self'", "data:"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "script-src": ["'self'"],
      "connect-src": ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: corsOrigins.length ? corsOrigins : true,
  methods: ['GET', 'POST'],
}));

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));

// ---------- Validation ----------
function s(v, max = 120) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}
function digits(v, max = 20) {
  return s(v, max).replace(/\D/g, '').slice(0, max);
}
function isValidType(t) { return t === 'mesa' || t === 'entrega' || t === 'retirada'; }

function validateOrderInput(body) {
  const errors = [];
  const tipo = s(body && body.tipo, 20).toLowerCase();
  if (!isValidType(tipo)) errors.push('tipo inválido');

  // items
  const items = Array.isArray(body && body.itens) ? body.itens : [];
  if (items.length === 0) errors.push('carrinho vazio');
  if (items.length > 50) errors.push('carrinho excede 50 linhas');

  const cleanItems = [];
  for (const it of items) {
    const id = s(it && it.id, 60);
    const qty = parseInt(it && it.quantidade, 10);
    if (!id || !Number.isFinite(qty) || qty < 1 || qty > 50) continue;
    cleanItems.push({ id, quantidade: qty });
  }
  if (cleanItems.length === 0) errors.push('itens inválidos');

  const out = { tipo, itens: cleanItems };

  if (tipo === 'mesa') {
    out.cliente = s(body.cliente, 80) || 'Cliente';
    out.mesa = s(body.mesa, 10);
    if (!out.mesa) errors.push('número da mesa é obrigatório');
  } else if (tipo === 'entrega') {
    out.cliente = s(body.cliente, 80);
    out.telefone = digits(body.telefone, 15);
    const end = body.endereco || {};
    out.endereco = {
      rua:     s(end.rua, 120),
      numero:  s(end.numero, 20),
      bairro:  s(end.bairro, 80),
      complemento: s(end.complemento, 120),
      referencia:  s(end.referencia, 120),
    };
    if (!out.cliente) errors.push('nome é obrigatório');
    if (out.telefone.length < 10) errors.push('telefone inválido');
    if (!out.endereco.rua)    errors.push('rua é obrigatória');
    if (!out.endereco.numero) errors.push('número é obrigatório');
    if (!out.endereco.bairro) errors.push('bairro é obrigatório');
  } else if (tipo === 'retirada') {
    out.cliente = s(body.cliente, 80);
    out.telefone = digits(body.telefone, 15);
    if (!out.cliente) errors.push('nome é obrigatório');
    if (out.telefone.length < 10) errors.push('telefone inválido');
  }

  out.observacao = s(body && body.observacao, 240);
  return { errors, order: out };
}

// ---------- ID generator ----------
function nextOrderId(existing) {
  let max = 0;
  for (const o of existing) {
    const m = /^ORD-(\d+)$/.exec(o.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'ORD-' + String(max + 1).padStart(4, '0');
}

// ---------- WhatsApp message ----------
const fmt = n => 'R$ ' + n.toFixed(2).replace('.', ',');
function buildWhatsAppMessage(order) {
  const lines = [];
  lines.push('🍔 *BURGER GRILL*');
  lines.push('');
  lines.push(`*Pedido:* ${order.id}`);
  lines.push(`*Tipo:* ${order.tipo.toUpperCase()}`);
  lines.push('');

  if (order.tipo === 'mesa') {
    lines.push(`*Mesa:* ${order.mesa}`);
    if (order.cliente && order.cliente !== 'Cliente') lines.push(`*Cliente:* ${order.cliente}`);
  } else {
    lines.push(`*Cliente:*\n${order.cliente}`);
    lines.push('');
    lines.push(`*Telefone:*\n${order.telefone}`);
    if (order.tipo === 'entrega') {
      const e = order.endereco;
      const linhas = [`${e.rua}, ${e.numero}`];
      if (e.complemento) linhas.push(e.complemento);
      linhas.push(e.bairro);
      if (e.referencia) linhas.push(`Ref: ${e.referencia}`);
      lines.push('');
      lines.push(`*Endereço:*\n${linhas.join('\n')}`);
    } else {
      lines.push('');
      lines.push('Retirarei o pedido no balcão.');
    }
  }

  lines.push('');
  lines.push('*Itens:*');
  for (const it of order.itens) lines.push(`${it.quantidade}x ${it.produto}`);

  lines.push('');
  lines.push(`*Total:* ${fmt(order.total)}`);
  lines.push('');
  lines.push('Pagamento via Pix.');
  lines.push('Enviarei o comprovante nesta conversa.');

  return lines.join('\n');
}

// ---------- API ----------
app.get('/api/config', (req, res) => {
  res.json({ pixKey: config.pixKey, receiver: config.receiver, whatsapp: config.whatsapp });
});

app.get('/api/products', (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  res.json(products);
});

app.get('/api/pix-qr', async (req, res) => {
  try {
    const png = await QRCode.toBuffer(config.pixKey || '', {
      width: 360, margin: 2, color: { dark: '#0b0b0b', light: '#ffffff' },
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(png);
  } catch {
    res.status(500).json({ error: 'qr_failed' });
  }
});

app.post('/api/order', (req, res) => {
  const { errors, order } = validateOrderInput(req.body || {});
  if (errors.length) return res.status(400).json({ error: 'invalid_input', details: errors });

  const products = readJSON(PRODUCTS_FILE, []);
  let total = 0;
  const itens = [];
  for (const it of order.itens) {
    const p = products.find(x => x.id === it.id);
    if (!p) return res.status(400).json({ error: 'invalid_product', id: it.id });
    const preco = Number(p.preco);
    if (!Number.isFinite(preco) || preco < 0) {
      return res.status(500).json({ error: 'bad_catalog' });
    }
    const sub = +(preco * it.quantidade).toFixed(2);
    total = +(total + sub).toFixed(2);
    itens.push({
      id: p.id,
      produto: p.nome,
      quantidade: it.quantidade,
      preco,
      subtotal: sub,
    });
  }

  const existing = readJSON(ORDERS_FILE, []);
  const id = nextOrderId(existing);

  const record = {
    id,
    tipo: order.tipo,
    cliente: order.cliente || null,
    ...(order.tipo === 'mesa'    ? { mesa: order.mesa } : {}),
    ...(order.tipo !== 'mesa'    ? { telefone: order.telefone } : {}),
    ...(order.tipo === 'entrega' ? { endereco: order.endereco } : {}),
    ...(order.observacao         ? { observacao: order.observacao } : {}),
    itens,
    total,
    status: 'aguardando_comprovante',
    data: new Date().toISOString(),
  };

  existing.push(record);
  writeJSON(ORDERS_FILE, existing);

  const message = buildWhatsAppMessage(record);
  const wa = config.whatsapp ? `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(message)}` : null;

  res.json({ order: record, whatsappUrl: wa });
});

app.get('/api/order/:id', (req, res) => {
  const id = s(req.params.id, 20);
  const orders = readJSON(ORDERS_FILE, []);
  const o = orders.find(x => x.id === id);
  if (!o) return res.status(404).json({ error: 'not_found' });
  res.json(o);
});

// ---------- Boot ----------
app.listen(PORT, () => {
  console.log(`Burger Grill running on http://localhost:${PORT}`);
});

