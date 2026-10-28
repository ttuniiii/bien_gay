// Agenda del Equipo Directivo - servidor local sin dependencias (Node.js >= 12)
// Uso: node server.js   (puerto por defecto 8080, o PORT=xxxx)
var http = require('http');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var PORT = process.env.PORT || 8080;
var PUBLIC = path.join(__dirname, 'public');
var DATA = path.join(__dirname, 'data.json');

var ROLES = ['director', 'vice', 'secretario', 'jefe_area', 'jefe_preceptores'];
var UNICOS = ['director', 'vice']; // solo puede haber uno

function hash(pass, salt) {
  return crypto.pbkdf2Sync(String(pass), salt, 100000, 32, 'sha256').toString('hex');
}
function uid() { return crypto.randomBytes(8).toString('hex'); }

// ---------- Persistencia ----------
var db;
function load() {
  if (fs.existsSync(DATA)) {
    db = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  } else {
    var salt = uid();
    db = {
      config: { nombre: 'E.E.S.T. N° 1', cue: '', distrito: '', logo: '' },
      users: [{ id: uid(), username: 'director', name: 'Director/a', role: 'director',
        salt: salt, hash: hash('director123', salt), active: true }],
      tasks: [],
      sessions: {}
    };
    save();
    console.log('Usuario inicial -> director / director123  (cambiar la contraseña al ingresar)');
  }
  if (!db.sessions) db.sessions = {};
  if (!db.chat) db.chat = [];
}
var saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    var tmp = DATA + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DATA);
  }, 200);
}
load();

// ---------- Helpers ----------
function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role, active: u.active !== false, avatar: u.avatar || '' };
}
function state() {
  return {
    config: db.config,
    users: db.users.map(publicUser),
    tasks: db.tasks,
    serverTime: Date.now()
  };
}
function send(res, code, obj) {
  var body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req, cb) {
  var chunks = [], size = 0;
  req.on('data', function (c) { size += c.length; if (size > 5e6) req.destroy(); else chunks.push(c); });
  req.on('end', function () {
    try { cb(null, JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
    catch (e) { cb(e); }
  });
}
function auth(req) {
  var t = (req.headers['authorization'] || '').replace('Bearer ', '');
  var s = db.sessions[t];
  if (!s) return null;
  var u = db.users.filter(function (x) { return x.id === s && x.active !== false; })[0];
  return u || null;
}

// ---------- Aplicar cambios (con control de permisos) ----------
function applyOp(user, op) {
  var isDir = user.role === 'director';
  if (op.type === 'task') {
    var t = op.data;
    if (!t || !t.id) return 'tarea inválida';
    var cur = db.tasks.filter(function (x) { return x.id === t.id; })[0];
    // Solo el dueño puede crear/editar/borrar sus tareas
    if (cur && cur.owner !== user.id) return 'sin permiso';
    if (!cur && t.owner !== user.id) return 'sin permiso';
    t.owner = user.id;
    if (cur) {
      if ((t.modificado || 0) >= (cur.modificado || 0)) {
        for (var k in t) cur[k] = t[k];
      }
    } else {
      db.tasks.push(t);
    }
    return null;
  }
  if (op.type === 'config') {
    if (!isDir) return 'sin permiso';
    var c = op.data || {};
    ['nombre', 'cue', 'distrito', 'localidad', 'direccion', 'telefono', 'whatsapp', 'email', 'logo'].forEach(function (k) { if (k in c) db.config[k] = String(c[k] || ''); });
    return null;
  }
  if (op.type === 'chat') {
    var m = op.data || {};
    var txt = String(m.text || '').trim().slice(0, 2000);
    if (!txt || !m.id) return 'mensaje vacío';
    if (db.chat.some(function (x) { return x.id === m.id; })) return null; // ya recibido
    db.chat.push({ id: String(m.id), from: user.id, to: String(m.to || ''), text: txt, ts: Date.now() });
    if (db.chat.length > 3000) db.chat = db.chat.slice(-3000);
    return null;
  }
  if (op.type === 'password') {
    var target = db.users.filter(function (x) { return x.id === (op.data.userId || user.id); })[0];
    if (!target) return 'usuario inexistente';
    if (target.id !== user.id && !isDir) return 'sin permiso';
    if (target.id === user.id && hash(op.data.old || '', target.salt) !== target.hash) return 'contraseña actual incorrecta';
    if (!op.data.pass || String(op.data.pass).length < 4) return 'contraseña muy corta';
    target.salt = uid(); target.hash = hash(op.data.pass, target.salt);
    return null;
  }
  if (op.type === 'user') {
    if (!isDir) return 'sin permiso';
    var d = op.data || {};
    if (ROLES.indexOf(d.role) < 0) return 'rol inválido';
    var ex = db.users.filter(function (x) { return x.id === d.id; })[0];
    if (UNICOS.indexOf(d.role) >= 0) {
      var otro = db.users.filter(function (x) { return x.role === d.role && x.id !== d.id && x.active !== false; })[0];
      if (otro && d.active !== false) return 'ya existe un usuario con el cargo ' + d.role;
    }
    var dup = db.users.filter(function (x) { return x.username === d.username && x.id !== d.id; })[0];
    if (dup) return 'el nombre de usuario ya existe';
    if (ex) {
      if (ex.id === user.id && (d.role !== 'director' || d.active === false)) return 'no podés quitarte el rol de director';
      ex.username = d.username; ex.name = d.name; ex.role = d.role; ex.active = d.active !== false;
      if (d.pass) { ex.salt = uid(); ex.hash = hash(d.pass, ex.salt); }
    } else {
      if (!d.username || !d.pass) return 'faltan datos';
      var s = uid();
      db.users.push({ id: d.id || uid(), username: d.username, name: d.name || d.username, role: d.role,
        salt: s, hash: hash(d.pass, s), active: true });
    }
    return null;
  }
  if (op.type === 'avatar') {
    // Cada uno cambia su foto; el director puede cambiar la de cualquiera
    var who = db.users.filter(function (x) { return x.id === (op.data.userId || user.id); })[0];
    if (!who) return 'usuario inexistente';
    if (who.id !== user.id && !isDir) return 'sin permiso';
    var img = String(op.data.avatar || '');
    if (img && img.indexOf('data:image/') !== 0) return 'imagen inválida';
    if (img.length > 300000) return 'imagen muy pesada';
    who.avatar = img;
    return null;
  }
  if (op.type === 'deleteUser') {
    if (!isDir) return 'sin permiso';
    if (op.data.id === user.id) return 'no podés borrarte';
    db.users = db.users.filter(function (x) { return x.id !== op.data.id; });
    for (var tk in db.sessions) if (db.sessions[tk] === op.data.id) delete db.sessions[tk];
    return null;
  }
  return 'operación desconocida';
}

// ---------- Servidor ----------
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

http.createServer(function (req, res) {
  var url = req.url.split('?')[0];

  if (url === '/api/login' && req.method === 'POST') {
    return readBody(req, function (e, b) {
      if (e) return send(res, 400, { error: 'datos inválidos' });
      var u = db.users.filter(function (x) { return x.username === String(b.username || '').trim().toLowerCase() && x.active !== false; })[0];
      if (!u || hash(b.password || '', u.salt) !== u.hash) return send(res, 401, { error: 'Usuario o contraseña incorrectos' });
      var token = crypto.randomBytes(24).toString('hex');
      db.sessions[token] = u.id; save();
      send(res, 200, { token: token, user: publicUser(u), state: state() });
    });
  }
  if (url === '/api/logout' && req.method === 'POST') {
    var t = (req.headers['authorization'] || '').replace('Bearer ', '');
    delete db.sessions[t]; save();
    return send(res, 200, { ok: true });
  }
  if (url === '/api/chat') {
    var uc = auth(req);
    if (!uc) return send(res, 401, { error: 'sesión vencida' });
    var since = +((req.url.split('since=')[1] || '0').split('&')[0]) || 0;
    var msgs = db.chat.filter(function (m) {
      return m.ts > since && (!m.to || m.to === uc.id || m.from === uc.id);
    });
    if (!since) msgs = msgs.slice(-500);
    return send(res, 200, { messages: msgs, serverTime: Date.now() });
  }
  if (url === '/api/state') {
    var u1 = auth(req);
    if (!u1) return send(res, 401, { error: 'sesión vencida' });
    return send(res, 200, { user: publicUser(u1), state: state() });
  }
  if (url === '/api/sync' && req.method === 'POST') {
    var u2 = auth(req);
    if (!u2) return send(res, 401, { error: 'sesión vencida' });
    return readBody(req, function (e, b) {
      if (e) return send(res, 400, { error: 'datos inválidos' });
      var results = (b.ops || []).map(function (op) {
        if (op.data && op.data.username) op.data.username = String(op.data.username).trim().toLowerCase();
        return { id: op.id, error: applyOp(u2, op) };
      });
      save();
      send(res, 200, { results: results, user: publicUser(u2), state: state() });
    });
  }

  // Archivos estáticos
  var file = path.normalize(path.join(PUBLIC, url === '/' ? 'index.html' : url));
  if (file.indexOf(PUBLIC) !== 0) { res.writeHead(403); return res.end(); }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, function () {
  var ips = [];
  var ifs = require('os').networkInterfaces();
  for (var n in ifs) ifs[n].forEach(function (i) { if (i.family === 'IPv4' && !i.internal) ips.push(i.address); });
  console.log('Agenda Directiva funcionando:');
  console.log('  En esta PC:      http://localhost:' + PORT);
  ips.forEach(function (ip) { console.log('  En la red local: http://' + ip + ':' + PORT); });
});
