/* Agenda del Equipo Directivo - cliente
   - Sin frameworks (rápido en PC viejas)
   - Offline: guarda todo en localStorage y sincroniza al volver la conexión */
(function () {
  'use strict';

  var ROLES = {
    director: 'Director/a', vice: 'Vicedirector/a', secretario: 'Secretario/a',
    jefe_area: 'Jefe/a de Área', jefe_preceptores: 'Jefe/a de Preceptores'
  };
  var PRIORIDADES = ['Urgente', 'Importante', 'Con tiempo'];
  var ESTADOS = ['Pendiente', 'En proceso', 'Realizado', 'Suspendido'];
  // Pares [fondo pastel, barra lateral] estilo agenda moderna
  var COLORES = [['#c5f29b', '#22c07a'], ['#8fd6fb', '#1e9be0'], ['#f8bdf6', '#c94fc4'], ['#f2c75c', '#c7901a'], ['#cfc8ff', '#7b6cf6'], ['#ffcaa8', '#f07b3f'], ['#a6ebe0', '#139e8a'], ['#ffbccb', '#e0465f'], ['#dfe59a', '#9aa31a'], ['#c8d6ff', '#3d62e0']];
  var ACENTOS = { lavanda: '#7b6cf6', naranja: '#f08c00', rojo: '#d6363c', bordo: '#8c2335', azul: '#2563eb', celeste: '#0ea5e9', verde: '#16a34a', gris: '#475569' };
  var DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // ---------- Estado local ----------
  var LS = window.localStorage;
  function lsGet(k, d) { try { var v = LS.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { LS.setItem(k, JSON.stringify(v)); } catch (e) { toast('Sin espacio local: ' + e.message); } }

  var S = {
    token: lsGet('ag_token', null),
    me: lsGet('ag_me', null),
    data: lsGet('ag_state', { config: {}, users: [], tasks: [] }),
    queue: lsGet('ag_queue', []),
    online: navigator.onLine,
    view: 'inicio',
    weekStart: mondayOf(new Date()),
    filtroResp: '', filtroEstado: '', verUser: ''
  };

  // ---------- Utilidades ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmt(s) { if (!s) return ''; var p = s.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function fmtTs(t) { if (!t) return ''; var d = new Date(t); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function mondayOf(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); var w = x.getDay() || 7; x.setDate(x.getDate() - w + 1); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function userById(id) { return S.data.users.filter(function (u) { return u.id === id; })[0]; }
  function userName(id) { var u = userById(id); return u ? u.name : '(usuario eliminado)'; }
  function userIdx(id) { var i = S.data.users.map(function (u) { return u.id; }).indexOf(id); return (i < 0 ? 0 : i) % COLORES.length; }
  function userColor(id) { return COLORES[userIdx(id)][1]; }
  function userBg(id) { return COLORES[userIdx(id)][0]; }
  function evStyle(id) { return 'background:' + userBg(id) + ';--bar:' + userColor(id); }
  function initials(n) { return String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join(''); }
  function avatar(u, cls) {
    cls = 'av' + (cls ? ' ' + cls : '');
    if (!u) return '<span class="' + cls + '" style="background:#999">?</span>';
    if (u.avatar) return '<img class="' + cls + '" src="' + u.avatar + '" alt="">';
    return '<span class="' + cls + '" style="background:' + userColor(u.id) + '">' + esc(initials(u.name)) + '</span>';
  }
  function person(id) { var u = userById(id); return '<span class="person">' + avatar(u, 'sm') + esc(u ? u.name : '(eliminado)') + '</span>'; }
  function isDir() { return S.me && S.me.role === 'director'; }
  function tasks() { return S.data.tasks.filter(function (t) { return !t.deleted; }); }
  function vencida(t) { return t.fechaLimite && t.estado !== 'Realizado' && t.estado !== 'Suspendido' && t.fechaLimite < iso(new Date()); }
  function pillP(p) { return p ? '<span class="pill p-' + esc(p.split(' ')[0]) + '">' + esc(p) + '</span>' : ''; }
  function pillE(e) { return e ? '<span class="pill e-' + esc(e.split(' ')[0]) + '">' + esc(e) + '</span>' : ''; }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.add('hidden'); }, 3200); }
  function opts(list, sel) { return list.map(function (o) { var v = typeof o === 'string' ? o : o[0], l = typeof o === 'string' ? o : o[1]; return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join(''); }

  // ---------- Tema (por usuario y por PC) ----------
  function themeKey() { return 'ag_theme_' + (S.me ? S.me.id : 'anon'); }
  function applyTheme() {
    var th = lsGet(themeKey(), lsGet('ag_theme_anon', { mode: 'light', acc: 'lavanda' }));
    if (!ACENTOS[th.acc]) th.acc = 'lavanda';
    document.documentElement.setAttribute('data-mode', th.mode);
    document.documentElement.setAttribute('data-acc', th.acc);
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = ACENTOS[th.acc] || '#f39200';
    document.documentElement.className = th.lite ? 'lite' : '';
    var wall = lsGet('ag_wall_' + (S.me ? S.me.id : 'anon'), lsGet('ag_wall_anon', ''));
    if (wall) { document.body.style.setProperty('--wall-img', 'url(' + wall + ')'); document.body.classList.add('has-wall'); }
    else document.body.classList.remove('has-wall');
    return th;
  }
  function setTheme(patch) { var th = applyTheme(); for (var k in patch) th[k] = patch[k]; lsSet(themeKey(), th); lsSet('ag_theme_anon', th); applyTheme(); render(); }

  // ---------- Red / sincronización ----------
  function api(path, body) {
    return fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (S.token || '') },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Error'); e.status = r.status; throw e; } return j; });
    });
  }
  function saveLocal() { lsSet('ag_state', S.data); lsSet('ag_queue', S.queue); lsSet('ag_me', S.me); }

  // Aplica un cambio localmente (optimista) y lo encola para el servidor
  function commit(op) {
    op.id = uid();
    applyLocal(op);
    S.queue.push(op);
    saveLocal();
    render();
    sync();
  }
  function applyLocal(op) {
    var d = op.data;
    if (op.type === 'task') {
      var cur = S.data.tasks.filter(function (t) { return t.id === d.id; })[0];
      if (cur) { for (var k in d) cur[k] = d[k]; } else S.data.tasks.push(JSON.parse(JSON.stringify(d)));
    } else if (op.type === 'config') {
      for (var c in d) S.data.config[c] = d[c];
    } else if (op.type === 'user') {
      var u = userById(d.id);
      var pub = { id: d.id, username: d.username, name: d.name, role: d.role, active: d.active !== false };
      if (u) { for (var j in pub) u[j] = pub[j]; } else S.data.users.push(pub);
    } else if (op.type === 'chat') {
      mergeChat([{ id: d.id, from: S.me.id, to: d.to, text: d.text, ts: Date.now(), pending: true }]);
    } else if (op.type === 'avatar') {
      var ua = userById(d.userId || S.me.id); if (ua) ua.avatar = d.avatar;
    } else if (op.type === 'deleteUser') {
      S.data.users = S.data.users.filter(function (x) { return x.id !== d.id; });
    }
  }

  var syncing = false;
  function sync() {
    if (syncing || !S.token) return;
    syncing = true;
    var sent = S.queue.slice(), before = JSON.stringify(S.data);
    api('/api/sync', { ops: sent }).then(function (r) {
      S.online = true;
      var errs = r.results.filter(function (x) { return x.error; });
      errs.forEach(function (e) { toast('No se guardó un cambio: ' + e.error); });
      // quitar de la cola lo enviado y reaplicar lo que se agregó mientras tanto
      var sentIds = sent.map(function (o) { return o.id; });
      S.queue = S.queue.filter(function (o) { return sentIds.indexOf(o.id) < 0; });
      S.data = r.state; S.me = r.user;
      S.queue.forEach(applyLocal);
      saveLocal();
      if (sent.length && !errs.length) lastSaved = Date.now();
      if (sent.some(function (o) { return o.type === 'chat'; })) pollChat();
    }).catch(function (e) {
      if (e.status === 401) { logout(true); return; }
      S.online = false;
    }).then(function () {
      syncing = false; updateNet();
      // solo redibujar si cambió algo (para no borrar lo que se está escribiendo)
      if (!modalOpen() && S.view !== 'chat' && JSON.stringify(S.data) !== before) render();
      if (S.queue.length && S.online) setTimeout(sync, 300);
    });
  }
  var lastSaved = 0;
  function updateNet() {
    var n = $('net'); if (!n) return;
    if (!S.online) { n.className = 'net off'; n.textContent = '● Sin conexión' + (S.queue.length ? ' · ' + S.queue.length + ' cambios sin subir' : ''); }
    else if (S.queue.length) { n.className = 'net busy'; n.textContent = '⟳ Guardando…'; }
    else { n.className = 'net'; n.textContent = '✓ Guardado'; }
  }
  window.addEventListener('online', function () { S.online = true; sync(); });
  window.addEventListener('offline', function () { S.online = false; updateNet(); });
  setInterval(function () { if (S.token) sync(); }, 15000);

  // ---------- Chat interno (por la red de la escuela) ----------
  S.chat = lsGet('ag_chat', []);
  S.chatTo = '';                       // '' = sala general, o id de usuario (privado)
  S.chatRead = lsGet('ag_chatread', {}); // último ts leído por conversación
  function convKey(m) { return !m.to ? '' : (m.from === S.me.id ? m.to : m.from); }
  function mergeChat(msgs) {
    var ids = {}; S.chat.forEach(function (m, i) { ids[m.id] = i; });
    var nuevos = [];
    msgs.forEach(function (m) {
      if (ids[m.id] != null) S.chat[ids[m.id]] = m;
      else { S.chat.push(m); nuevos.push(m); }
    });
    S.chat.sort(function (a, b) { return a.ts - b.ts; });
    if (S.chat.length > 1500) S.chat = S.chat.slice(-1500);
    lsSet('ag_chat', S.chat);
    return nuevos;
  }
  function unread(key) {
    var r = S.chatRead[key] || 0;
    return S.chat.filter(function (m) { return !m.pending && m.from !== S.me.id && convKey(m) === key && m.ts > r; }).length;
  }
  function totalUnread() {
    var keys = {}; S.chat.forEach(function (m) { keys[convKey(m)] = 1; });
    return Object.keys(keys).reduce(function (s, k) { return s + unread(k); }, 0);
  }
  function markRead() {
    var last = S.chat.filter(function (m) { return convKey(m) === S.chatTo && !m.pending; }).pop();
    if (last) { S.chatRead[S.chatTo] = last.ts; lsSet('ag_chatread', S.chatRead); }
  }
  var polling = false, chatInit = false;
  function pollChat() {
    if (polling || !S.token || !S.me) return;
    polling = true;
    var since = 0; S.chat.forEach(function (m) { if (!m.pending && m.ts > since) since = m.ts; });
    api('/api/chat?since=' + since).then(function (r) {
      S.online = true;
      var nuevos = mergeChat(r.messages).filter(function (m) { return m.from !== S.me.id; });
      if (nuevos.length && chatInit) {
        var m = nuevos[nuevos.length - 1];
        var visible = S.view === 'chat' && convKey(m) === S.chatTo && !document.hidden;
        if (!visible) { beep(660, 0.15); notify('💬 ' + userName(m.from) + (m.to ? ' (privado)' : ' (general)'), m.text); }
      }
      chatInit = true;
      if (nuevos.length || r.messages.length) { if (S.view === 'chat') renderChatMsgs(); updateBadge(); }
    }).catch(function () { }).then(function () { polling = false; });
  }
  setInterval(pollChat, 3000);
  function updateBadge() {
    var n = totalUnread(), b = $('chatBadge');
    if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; }
  }

  // ---------- Alarmas de recordatorio ----------
  var audioCtx = null;
  function beep(freq, dur, times) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      for (var i = 0; i < (times || 1); i++) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t0 = audioCtx.currentTime + i * (dur + 0.12);
        o.frequency.value = freq; o.type = 'sine';
        g.gain.setValueAtTime(0.25, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        o.connect(g); g.connect(audioCtx.destination); o.start(t0); o.stop(t0 + dur);
      }
    } catch (e) { }
  }
  function notify(title, body) {
    try {
      if (window.Notification && Notification.permission === 'granted') {
        var n = new Notification(title, { body: body, icon: 'icon.svg' });
        n.onclick = function () { window.focus(); n.close(); };
      }
    } catch (e) { }
  }
  function askNotif() { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); }
  var fired = lsGet('ag_fired', {});
  function checkAlarms() {
    if (!S.token || !S.me) return;
    var now = Date.now();
    tasks().forEach(function (t) {
      if (t.owner !== S.me.id || t.recordatorio == null || t.recordatorio === '' || !t.fecha) return;
      if (t.estado === 'Realizado' || t.estado === 'Suspendido') return;
      var p = t.fecha.split('-'), hm = (t.hora || '08:00').split(':');
      var when = new Date(+p[0], +p[1] - 1, +p[2], +hm[0], +hm[1]).getTime() - (+t.recordatorio) * 60000;
      var key = t.id + '|' + t.fecha + '|' + t.hora + '|' + t.recordatorio;
      // suena si llegó la hora (y no pasó más de 12 h)
      if (now >= when && now - when < 12 * 3600000 && !fired[key]) {
        fired[key] = now; lsSet('ag_fired', fired);
        alarm(t);
      }
    });
  }
  function alarm(t) {
    beep(880, 0.25, 4);
    notify('⏰ Recordatorio: ' + t.titulo, (t.hora ? 'A las ' + t.hora + ' · ' : '') + (t.descripcion || ''));
    if (modalOpen()) { toast('⏰ ' + t.titulo + (t.hora ? ' · ' + t.hora : '')); return; }
    openModal('<div style="text-align:center"><div style="font-size:54px">⏰</div><h2>' + esc(t.titulo) + '</h2>' +
      '<p class="muted">' + fmt(t.fecha) + (t.hora ? ' · ' + esc(rango(t)) : '') + '</p>' + (t.descripcion ? '<p>' + esc(t.descripcion) + '</p>' : '') +
      '<div class="modal-actions" style="justify-content:center"><button class="btn" id="aSnooze">Posponer 10 min</button><button class="btn" id="aOpen">Ver actividad</button><button class="btn primary" id="aOk">Entendido</button></div></div>');
    on('aOk', 'click', closeModal);
    on('aOpen', 'click', function () { taskModal(t.id); });
    on('aSnooze', 'click', function () { closeModal(); setTimeout(function () { alarm(t); }, 600000); });
  }
  setInterval(checkAlarms, 20000);

  // ---------- Login ----------
  function showLogin() {
    $('app').classList.add('hidden'); $('login').classList.remove('hidden');
    var c = S.data.config || {};
    $('loginNombre').textContent = c.nombre || 'Gestión institucional';
    $('loginCue').textContent = c.cue ? 'CUE ' + c.cue : '';
    $('loginCue').style.display = c.cue ? '' : 'none';
    if (c.logo) { $('loginLogo').src = c.logo; $('loginLogo').classList.remove('hidden'); } else $('loginLogo').classList.add('hidden');
  }
  $('loginForm').onsubmit = function (e) {
    e.preventDefault();
    $('loginErr').textContent = '';
    fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('lu').value, password: $('lp').value }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error); return j; }); })
      .then(function (j) {
        // si había cambios offline de otra persona, se descartan
        if (S.me && S.me.id !== j.user.id) { S.queue = []; S.chat = []; S.chatRead = {}; lsSet('ag_chat', []); lsSet('ag_chatread', {}); }
        S.token = j.token; S.me = j.user; S.data = j.state; S.online = true;
        lsSet('ag_token', S.token); saveLocal();
        $('lp').value = '';
        start();
        sync();
      })
      .catch(function (err) { $('loginErr').textContent = err.message === 'Failed to fetch' ? 'No hay conexión con el servidor de la escuela.' : err.message; });
  };
  function logout(expired) {
    if (S.queue.length && !expired && !confirm('Hay ' + S.queue.length + ' cambios sin subir (sin conexión). Si salís se perderán. ¿Salir igual?')) return;
    if (!expired) api('/api/logout', {}).catch(function () {});
    S.token = null; S.queue = []; LS.removeItem('ag_token'); lsSet('ag_queue', []);
    if (expired) toast('La sesión venció, ingresá nuevamente.');
    applyTheme(); showLogin();
  }
  $('logoutBtn').onclick = function () { logout(false); };

  // ---------- Reloj ----------
  function tick() {
    var d = new Date();
    $('clkTime').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    var h = d.getHours(), turno = h < 13 ? 'Turno mañana' : h < 18 ? 'Turno tarde' : 'Turno vespertino';
    $('clkDate').textContent = DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear() + ' · ' + turno;
  }
  setInterval(tick, 1000);

  // ---------- Navegación ----------
  document.addEventListener('click', function (e) {
    var g = e.target.closest ? e.target.closest('[data-go]') : null;
    if (g) { S.view = g.getAttribute('data-go'); render(); }
  });
  function start() {
    applyTheme();
    $('login').classList.add('hidden'); $('app').classList.remove('hidden');
    tick(); render(); pollChat(); checkAlarms();
    // pedir permiso de notificaciones con el primer clic (los navegadores lo exigen)
    document.addEventListener('click', function once() { askNotif(); document.removeEventListener('click', once); });
  }

  // ---------- Render principal ----------
  function render() {
    if (!S.token) return;
    var c = S.data.config || {};
    $('hNombre').textContent = c.nombre || 'Gestión institucional';
    $('hCue').textContent = c.cue ? 'CUE ' + c.cue : 'CUE sin cargar';
    $('hDist').textContent = [c.localidad, c.distrito].filter(Boolean).join(' · ');
    if (c.logo) { $('logo').src = c.logo; $('logo').classList.remove('hidden'); $('logoPh').classList.add('hidden'); }
    else { $('logo').classList.add('hidden'); $('logoPh').classList.remove('hidden'); $('logoPh').textContent = initials(c.nombre || 'A').slice(0, 1); }
    var me = userById(S.me.id) || S.me;
    $('meAv').innerHTML = avatar(me);
    $('whoName').textContent = me.name; $('whoRole').textContent = ROLES[me.role];
    document.title = 'Agenda · ' + (c.nombre || '');
    var as = document.querySelectorAll('.tabs a');
    for (var i = 0; i < as.length; i++) as[i].className = as[i].getAttribute('data-go') === S.view ? 'on' : '';
    updateNet();
    var v = { inicio: vInicio, general: vGeneral, mia: vMia, equipo: vEquipo, panel: vPanel, chat: vChat, config: vConfig }[S.view] || vInicio;
    $('view').innerHTML = v();
    bind();
    if (S.view === 'chat') { renderChatMsgs(); var ci = $('chatIn'); if (ci) ci.focus(); }
    updateBadge();
  }

  // ---------- Vistas ----------
  function vInicio() {
    var hoy = iso(new Date()), c = S.data.config || {};
    var me = userById(S.me.id) || S.me;
    var mias = tasks().filter(function (t) { return t.owner === S.me.id && t.estado !== 'Realizado' && t.estado !== 'Suspendido'; });
    var deHoy = tasks().filter(function (t) { return t.fecha === hoy; }).sort(byFechaHora);
    var venc = mias.filter(vencida);
    var h = new Date().getHours(), saludo = h < 12 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
    return '<div class="welcome">' + avatar(me, 'lg') + '<div class="grow"><h1>' + saludo + ', ' + esc(me.name.split(' ')[0]) + '</h1>' +
      '<p>' + ROLES[me.role] + ' · ' + esc(c.nombre || '') + (c.cue ? ' · CUE ' + esc(c.cue) : '') + '</p>' +
      '<p>Hoy tenés ' + deHoy.filter(function (t) { return t.owner === S.me.id; }).length + ' actividades y ' + venc.length + ' vencidas.</p></div>' +
      (c.logo ? '<img class="logo-w" src="' + c.logo + '" alt="">' : '') + '</div>' +
      '<div class="tiles">' +
      '<div class="tile" data-go="general"><div class="ic ic1">📅</div><div><b>Agenda General</b><span>Todo el equipo</span></div></div>' +
      '<div class="tile" id="tNueva"><div class="ic ic2">➕</div><div><b>Nueva Actividad</b><span>Cargar tarea o reunión</span></div></div>' +
      '<div class="tile" data-go="panel"><div class="ic ic3">📊</div><div><b>Panel de Control</b><span>Indicadores</span></div></div>' +
      '<div class="tile" data-go="mia"><div class="ic ic4">👤</div><div><b>Mi agenda</b><span>' + mias.length + ' pendientes</span></div></div></div>' +
      '<div class="grid3">' +
      '<div class="card"><h3>📌 Hoy en la escuela</h3>' + miniList(deHoy, 'No hay actividades cargadas para hoy.') + '</div>' +
      '<div class="card"><h3>📝 Mis pendientes</h3>' + miniList(mias.sort(byFechaHora).slice(0, 8), 'Sin pendientes 🎉') + '</div>' +
      '<div class="card"><h3 style="color:var(--c-urg)">⚠ Vencidas</h3>' + miniList(venc, 'Nada vencido.') + '</div></div>' + instCard();
  }
  function rango(t) { return (t.hora || '') + (t.horaFin ? ' - ' + t.horaFin : ''); }
  function miniList(list, empty) {
    if (!list.length) return '<p class="muted">' + empty + '</p>';
    return list.map(function (t) {
      return '<div class="ev" data-task="' + t.id + '" style="' + evStyle(t.owner) + '"><b>' + esc(t.titulo) + '</b>' +
        '<small>' + (t.fecha !== iso(new Date()) ? fmt(t.fecha).slice(0, 5) + ' ' : '') + esc(rango(t)) + ' · ' + esc(userName(t.owner)) + '</small></div>';
    }).join('');
  }
  function byFechaHora(a, b) { return ((a.fecha || '') + (a.hora || '')).localeCompare((b.fecha || '') + (b.hora || '')); }
  function mins(h) { if (!h) return null; var p = h.split(':'); return +p[0] * 60 + +p[1]; }

  var H0 = 7, H1 = 21, PX = 60; // horario visible y px por hora
  function vGeneral() {
    S.modo = S.modo || 'mes';
    var html = '<div class="card"><div class="toolbar"><div class="seg"><button class="btn' + (S.modo === 'mes' ? ' on' : '') + '" id="mMes">Mes</button>' +
      '<button class="btn' + (S.modo === 'semana' ? ' on' : '') + '" id="mSem">Semana</button>' +
      '<button class="btn' + (S.modo === 'dia' ? ' on' : '') + '" id="mDia">Día por persona</button></div>' +
      '<button class="btn" id="wPrev">◀</button><button class="btn" id="wHoy">Hoy</button><button class="btn" id="wNext">▶</button>';
    var filtro = '<select id="fResp"><option value="">👥 Todo el equipo</option>' + opts(S.data.users.map(function (u) { return [u.id, u.name]; }), S.filtroResp) + '</select>';
    if (S.modo === 'mes') {
      S.mes = S.mes || new Date();
      html += '<b style="font-size:19px;text-transform:capitalize">' + MESES[S.mes.getMonth()] + ' ' + S.mes.getFullYear() + '</b><span class="grow"></span>' + filtro +
        '<button class="btn primary" id="bNueva">+ Nueva actividad</button></div>';
      return html + vMes() + '</div>';
    }
    if (S.modo === 'dia') {
      S.dia = S.dia || new Date();
      var dd = S.dia;
      html += '<b style="font-size:17px">' + DIAS[dd.getDay()] + ' ' + dd.getDate() + ' de ' + MESES[dd.getMonth()] + '</b><span class="grow"></span>' +
        '<button class="btn primary" id="bNueva">+ Nueva actividad</button><button class="btn" onclick="window.print()">Imprimir</button></div>';
      return html + vDia(iso(dd)) + '</div>';
    }
    var ws = S.weekStart, dias = [];
    for (var i = 0; i < 6; i++) dias.push(addDays(ws, i));
    html += '<b style="font-size:17px">' + dias[0].getDate() + ' – ' + dias[5].getDate() + ' de ' + MESES[dias[5].getMonth()] + '</b><span class="grow"></span>' +
      '<select id="fResp"><option value="">Todo el equipo</option>' + opts(S.data.users.map(function (u) { return [u.id, u.name]; }), S.filtroResp) + '</select>' +
      '<button class="btn primary" id="bNueva">+ Nueva actividad</button></div>';
    return html + vSemana(dias) + '</div>';
  }

  function vDia(f) {
    var users = S.data.users.filter(function (u) { return u.active; });
    // yo primero
    users.sort(function (a, b) { return (b.id === S.me.id) - (a.id === S.me.id); });
    var list = tasks().filter(function (t) { return t.fecha === f; });
    var alto = (H1 - H0) * PX, now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
    var esHoy = f === iso(now) && nowM >= H0 * 60 && nowM <= H1 * 60;
    var html = '<div class="day-wrap"><div class="day"><div class="tcol"><div class="clock-h"><span>🕒</span></div><div class="allday-l">Día</div><div>';
    for (var h = H0; h < H1; h++) html += '<div class="hlabel">' + pad(h) + ':00</div>';
    html += '</div></div>';
    users.forEach(function (u) {
      var mine = u.id === S.me.id;
      var del = list.filter(function (t) { return t.owner === u.id; });
      html += '<div class="pcol"><div class="phead' + (mine ? ' me-col' : '') + '">' + avatar(u, 'lg') + '<div>' + esc(u.name.split(' ')[0]) + (mine ? ' (yo)' : '') + '<br><small>' + ROLES[u.role] + '</small></div></div>';
      html += '<div class="allday">' + del.filter(function (t) { return !t.hora; }).map(function (t) { return evHtml(t, ''); }).join('') + '</div>';
      html += '<div class="body' + (mine ? ' mine" data-daynew="' + f : '') + '" style="height:' + alto + 'px">';
      for (var h2 = H0; h2 < H1; h2++) html += '<div class="hl"></div>';
      del.filter(function (t) { return t.hora; }).forEach(function (t) {
        var a = Math.max(mins(t.hora), H0 * 60), b = mins(t.horaFin) || a + 60;
        if (b <= a) b = a + 30;
        var top = (a - H0 * 60) * PX / 60, hh = Math.max((b - a) * PX / 60 - 3, 26);
        html += evHtml(t, 'evp', 'top:' + top + 'px;height:' + hh + 'px;');
      });
      if (esHoy) html += '<div class="nowline" style="top:' + ((nowM - H0 * 60) * PX / 60) + 'px"></div>';
      html += '</div></div>';
    });
    html += '</div></div><p class="muted">Hacé clic en tu columna para agendar en ese horario. Las columnas del resto del equipo son de solo lectura 🔒.</p>';
    return html;
  }
  // Vista mensual: cada actividad muestra la foto y el nombre de quien la escribió
  function vMes() {
    var m = S.mes, first = new Date(m.getFullYear(), m.getMonth(), 1), start = mondayOf(first), hoy = iso(new Date());
    var list = tasks().filter(function (t) { return !S.filtroResp || t.owner === S.filtroResp; });
    var html = '<div class="legend">' + S.data.users.map(function (u) { return '<span>' + avatar(u, 'sm') + esc(u.name) + '</span>'; }).join('') + '</div>';
    html += '<div class="tbl-wrap"><div class="month">';
    ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].forEach(function (d) { html += '<div class="mh">' + d + '</div>'; });
    for (var i = 0; i < 42; i++) {
      var d = addDays(start, i), f = iso(d);
      if (i === 35 && d.getMonth() !== m.getMonth()) break;
      var del = list.filter(function (t) { return t.fecha === f; }).sort(byFechaHora);
      html += '<div class="mcell' + (d.getMonth() !== m.getMonth() ? ' out' : '') + (f === hoy ? ' today' : '') + (d.getDay() === 0 || d.getDay() === 6 ? ' we' : '') + '" data-mday="' + f + '">' +
        '<div class="mnum"><span>' + d.getDate() + '</span>' + (del.length > 3 ? '<small>' + del.length + '</small>' : '') + '</div>' +
        del.slice(0, 3).map(function (t) {
          var u = userById(t.owner);
          return '<div class="mev' + (t.estado === 'Realizado' ? ' done' : '') + '" data-task="' + t.id + '" style="' + evStyle(t.owner) + '" title="' + esc(t.titulo + ' — escrito por ' + userName(t.owner)) + '">' +
            avatar(u, 'xs') + '<span class="mt">' + (t.prioridad === 'Urgente' ? '🔴 ' : '') + (t.hora ? '<i>' + t.hora + '</i> ' : '') + esc(t.titulo) + '</span></div>';
        }).join('') + (del.length > 3 ? '<div class="more">+' + (del.length - 3) + ' más</div>' : '') + '</div>';
    }
    return html + '</div></div><p class="muted">Cada actividad muestra la foto de quien la escribió. Clic en un día para verlo por persona.</p>';
  }
  function autor(t) {
    var u = userById(t.owner);
    return '<div class="by">' + avatar(u, 'xs') + '<span>' + esc(u ? u.name : '?') + '</span></div>';
  }
  function evHtml(t, cls, style) {
    return '<div class="ev ' + (cls || '') + (t.estado === 'Realizado' ? ' done' : '') + '" data-task="' + t.id + '" style="' + (style || '') + evStyle(t.owner) + '">' +
      (t.prioridad === 'Urgente' ? '<span class="pri">🔴</span>' : '') +
      '<b>' + esc(t.titulo) + '</b>' + (t.descripcion ? '<div>' + esc(t.descripcion.slice(0, 60)) + '</div>' : '') +
      (t.hora ? '<small>' + esc(rango(t)) + (t.recordatorio !== undefined && t.recordatorio !== '' ? ' ⏰' : '') + '</small>' : '') + '</div>';
  }

  function vSemana(dias) {
    var list = tasks().filter(function (t) { return !S.filtroResp || t.owner === S.filtroResp; });
    var hoy = iso(new Date()), html = '';
    html += '<div class="legend">' + S.data.users.map(function (u) { return '<span>' + avatar(u, 'sm') + esc(u.name) + '</span>'; }).join('') + '</div>';
    html += '<div class="tbl-wrap"><div class="week"><div class="wh"></div>';
    dias.forEach(function (d) { html += '<div class="wh' + (iso(d) === hoy ? ' today' : '') + '">' + DIAS[d.getDay()].slice(0, 3) + '<b>' + d.getDate() + '</b></div>'; });
    html += '<div class="hr">Día</div>';
    dias.forEach(function (d) { html += cell(iso(d), '', list.filter(function (t) { return t.fecha === iso(d) && !t.hora; })); });
    for (var h = H0; h < H1; h++) {
      html += '<div class="hr">' + pad(h) + ':00</div>';
      dias.forEach(function (d) {
        var f = iso(d);
        html += cell(f, pad(h) + ':00', list.filter(function (t) { return t.fecha === f && t.hora && parseInt(t.hora, 10) === h; }));
      });
    }
    return html + '</div></div>';
  }
  function cell(f, hora, list) {
    return '<div class="cell" data-new="' + f + '|' + hora + '">' + list.sort(byFechaHora).map(function (t) {
      return '<div class="ev' + (t.estado === 'Realizado' ? ' done' : '') + '" data-task="' + t.id + '" title="' + esc(t.titulo + ' — ' + userName(t.owner)) + '" style="' + evStyle(t.owner) + '">' +
        '<b>' + (t.prioridad === 'Urgente' ? '🔴 ' : '') + esc(t.titulo) + '</b>' + autor(t) + '</div>';
    }).join('') + '</div>';
  }

  function tablaTareas(list, editable) {
    if (!list.length) return '<p class="muted">No hay actividades.</p>';
    return '<div class="tbl-wrap"><table><tr><th>Fecha</th><th>Hora</th><th>Título</th><th>Descripción</th><th>Prioridad</th><th>Fecha límite</th><th>Estado</th><th>Responsable</th><th>Modif.</th></tr>' +
      list.map(function (t) {
        return '<tr class="click' + (vencida(t) ? ' vencida' : '') + '" data-task="' + t.id + '"><td>' + fmt(t.fecha) + '</td><td>' + esc(rango(t)) + '</td><td><b>' + esc(t.titulo) + '</b></td><td>' + esc(t.descripcion) +
          (t.observaciones ? '<br><i class="muted">' + esc(t.observaciones) + '</i>' : '') + '</td><td>' + pillP(t.prioridad) + '</td><td>' + fmt(t.fechaLimite) + (vencida(t) ? ' <b style="color:var(--c-urg)">vencida</b>' : '') +
          '</td><td>' + pillE(t.estado) + '</td><td>' + person(t.owner) + (editable ? '' : ' <span class="lock">🔒</span>') + '</td><td class="muted">' + fmtTs(t.modificado) + '</td></tr>';
      }).join('') + '</table></div>';
  }
  function filtroEstadoBar() {
    return '<select id="fEstado"><option value="">Todos los estados</option>' + opts(ESTADOS, S.filtroEstado) + '</select>' +
      '<input id="fBuscar" placeholder="🔍 Buscar…" value="' + esc(S.buscar || '') + '">';
  }
  function filtrar(list) {
    var q = (S.buscar || '').toLowerCase();
    return list.filter(function (t) {
      return (!S.filtroEstado || t.estado === S.filtroEstado) &&
        (!q || ((t.titulo || '') + ' ' + (t.descripcion || '') + ' ' + (t.observaciones || '')).toLowerCase().indexOf(q) >= 0);
    }).sort(byFechaHora);
  }

  function vMia() {
    var me = userById(S.me.id) || S.me;
    var list = filtrar(tasks().filter(function (t) { return t.owner === S.me.id; }));
    return '<div class="card"><div class="toolbar">' + avatar(me) + '<h2 class="grow" style="margin:0">Mi agenda</h2>' + filtroEstadoBar() +
      '<button class="btn primary" id="bNueva">+ Nueva actividad</button><button class="btn" onclick="window.print()">Imprimir</button></div>' + tablaTareas(list, true) + '</div>';
  }

  function vEquipo() {
    var otros = S.data.users.filter(function (u) { return u.id !== S.me.id; });
    if (!S.verUser && otros.length) S.verUser = otros[0].id;
    var html = '<div class="card"><h2>Agendas del equipo <span class="lock">(solo lectura 🔒)</span></h2>';
    if (!otros.length) return html + '<p class="muted">Todavía no hay otros usuarios cargados.</p></div>';
    html += '<div class="legend">' + otros.map(function (u) {
      return '<span class="btn small' + (u.id === S.verUser ? ' primary' : '') + '" data-ver="' + u.id + '" style="padding:3px 12px 3px 3px;border-radius:20px">' + avatar(u, 'sm') + ' ' + esc(u.name) + '</span>';
    }).join('') + '</div><div class="toolbar"><span class="grow"></span>' + filtroEstadoBar() + '</div>';
    return html + tablaTareas(filtrar(tasks().filter(function (t) { return t.owner === S.verUser; })), false) + '</div>';
  }

  function vPanel() {
    var all = tasks();
    var cnt = function (f) { return all.filter(f).length; };
    var total = all.length, pend = cnt(function (t) { return t.estado === 'Pendiente'; }), proc = cnt(function (t) { return t.estado === 'En proceso'; }), venc = cnt(vencida);
    var real = cnt(function (t) { return t.estado === 'Realizado'; });
    var pct = total ? Math.round(real * 100 / total) : 0;
    function bars(items) {
      var max = Math.max.apply(null, items.map(function (i) { return i[1]; }).concat([1]));
      return items.map(function (i) { return '<div class="brow">' + i[0] + '<span class="grow"></span><b>' + i[1] + '</b></div><div class="bar"><i style="width:' + (i[1] * 100 / max) + '%;' + (i[2] ? 'background:' + i[2] : '') + '"></i></div>'; }).join('');
    }
    function kpi(cls, ic, n, l) { return '<div class="kpi ' + cls + '"><div class="ki">' + ic + '</div><div><b>' + n + '</b><span>' + l + '</span></div></div>'; }
    return '<div class="kpis">' + kpi('k1', '📅', total, 'Total de tareas') + kpi('k2', '⏳', pend, 'Pendientes') + kpi('k3', '⚙️', proc, 'En proceso') + kpi('k4', '⚠️', venc, 'Vencidas') + '</div>' +
      '<div class="grid3">' +
      '<div class="card"><h3>Por prioridad</h3>' + bars([['🔴 Urgente', cnt(function (t) { return t.prioridad === 'Urgente'; }), 'var(--c-urg)'], ['🟠 Importante', cnt(function (t) { return t.prioridad === 'Importante'; }), 'var(--c-imp)'], ['🟢 Con tiempo', cnt(function (t) { return t.prioridad === 'Con tiempo'; }), 'var(--c-ct)']]) +
      '<h3 style="margin-top:18px">Por estado</h3>' + bars(ESTADOS.map(function (e) { return [e, cnt(function (t) { return t.estado === e; })]; })) + '</div>' +
      '<div class="card"><h3>Por responsable</h3>' + bars(S.data.users.map(function (u) { return [person(u.id), cnt(function (t) { return t.owner === u.id; }), userColor(u.id)]; })) + '</div>' +
      '<div class="card" style="text-align:center"><h3>Tareas realizadas</h3><div class="ring" style="background:conic-gradient(var(--acc) ' + (pct * 3.6) + 'deg, var(--line) 0)"><div>' + pct + '%</div></div>' +
      '<p class="muted">' + real + ' de ' + total + ' tareas</p></div></div>';
  }

  // ---------- Datos de la institución (copiables) ----------
  var CAMPOS = [['nombre', '🏫', 'Institución'], ['cue', '🔢', 'CUE'], ['direccion', '📍', 'Dirección'], ['localidad', '🏘️', 'Localidad'], ['distrito', '🗺️', 'Distrito'],
    ['telefono', '☎️', 'Teléfono fijo'], ['whatsapp', '💬', 'WhatsApp'], ['email', '✉️', 'Mail institucional']];
  function instTexto() {
    var c = S.data.config || {};
    return CAMPOS.filter(function (f) { return c[f[0]]; }).map(function (f) { return f[2] + ': ' + c[f[0]]; }).join('\n');
  }
  function instCard() {
    var c = S.data.config || {};
    var filas = CAMPOS.filter(function (f) { return f[0] !== 'nombre'; }).map(function (f) {
      var v = c[f[0]] || '', link = '';
      if (v && f[0] === 'telefono') link = 'tel:' + v.replace(/[^\d+]/g, '');
      if (v && f[0] === 'whatsapp') link = 'https://wa.me/' + v.replace(/\D/g, '');
      if (v && f[0] === 'email') link = 'mailto:' + v;
      return '<div class="irow"><span class="iic">' + f[1] + '</span><div class="grow"><small>' + f[2] + '</small><div>' +
        (v ? (link ? '<a href="' + esc(link) + '" target="_blank">' + esc(v) + '</a>' : esc(v)) : '<span class="muted">Sin cargar</span>') + '</div></div>' +
        (v ? '<button class="btn small ghost" data-copy="' + esc(v) + '" title="Copiar">📋</button>' : '') + '</div>';
    }).join('');
    return '<div class="card"><div class="toolbar"><h3 class="grow" style="margin:0">🏫 Datos de la institución</h3>' +
      '<button class="btn small" id="copyAll">📋 Copiar todo</button>' + (isDir() ? '<button class="btn small" data-go="config">Editar</button>' : '') + '</div>' +
      '<div class="igrid">' + filas + '</div></div>';
  }
  function copiar(txt) {
    function ok() { toast('Copiado al portapapeles ✔'); }
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(txt).then(ok, function () { copiarViejo(txt); ok(); });
    copiarViejo(txt); ok();
  }
  function copiarViejo(txt) { // funciona en navegadores viejos y en http de la red local
    var ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { } document.body.removeChild(ta);
  }

  // ---------- Chat ----------
  function vChat() {
    var otros = S.data.users.filter(function (u) { return u.id !== S.me.id && u.active; });
    var lastOf = function (k) { return S.chat.filter(function (m) { return convKey(m) === k; }).pop(); };
    var item = function (k, av, nombre, sub) {
      var u = unread(k), l = lastOf(k);
      return '<div class="citem' + (S.chatTo === k ? ' on' : '') + '" data-chat="' + k + '">' + av + '<div class="grow"><b>' + nombre + '</b><small>' +
        (l ? esc((l.from === S.me.id ? 'Vos: ' : '') + l.text).slice(0, 38) : esc(sub)) + '</small></div>' + (u ? '<span class="badge">' + u + '</span>' : '') + '</div>';
    };
    var tit = S.chatTo ? userById(S.chatTo) : null;
    var c = S.data.config || {};
    
    // Panel lateral derecho de perfil / detalles
    var rightPane = '';
    if (tit) {
      rightPane = '<div class="cprofile">' +
        '<div class="cp-head">' + avatar(tit, 'xl') + '<h3>' + esc(tit.name) + '</h3><span class="muted">' + ROLES[tit.role] + '</span><div class="cp-status"><span>●</span> En línea</div></div>' +
        '<div class="cp-info">' +
          '<div class="cp-row"><small>Usuario</small><b>@' + esc(tit.username) + '</b></div>' +
          '<div class="cp-row"><small>Institución</small><b>' + esc(c.nombre || 'Escuela') + '</b></div>' +
          '<div class="cp-row"><small>Rol institucional</small><b>' + ROLES[tit.role] + '</b></div>' +
        '</div>' +
      '</div>';
    } else {
      rightPane = '<div class="cprofile">' +
        '<div class="cp-head"><div class="av xl" style="background:var(--acc);font-size:36px">👥</div><h3>Sala General</h3><span class="muted">Equipo Directivo</span><div class="cp-status"><span>●</span> ' + S.data.users.filter(function(u){return u.active;}).length + ' miembros</div></div>' +
        '<div class="cp-info">' +
          '<div class="cp-row"><small>Descripción</small><b>Canal institucional para avisos y coordinación en tiempo real.</b></div>' +
          '<div class="cp-row"><small>CUE</small><b>' + esc(c.cue || 'Sin cargar') + '</b></div>' +
          (c.telefono ? '<div class="cp-row"><small>Teléfono</small><b>' + esc(c.telefono) + '</b></div>' : '') +
        '</div>' +
      '</div>';
    }

    var chatClass = 'chat card' + (S.chatMobileView === 'msgs' ? ' mobile-in-chat' : '');

    return '<div class="' + chatClass + '" style="padding:0">' +
      '<div class="clist"><div class="chead">💬 Conversaciones</div>' +
      item('', '<span class="av" style="background:var(--acc)">👥</span>', 'Sala general', 'Todo el equipo') +
      otros.map(function (u) { return item(u.id, avatar(u), esc(u.name), ROLES[u.role]); }).join('') + '</div>' +
      '<div class="cmain">' +
      '<div class="chead">' +
        '<button class="btn small chat-back-btn" id="chatBackBtn">◀ Volver</button>' +
        (tit ? avatar(tit, 'sm') + ' ' + esc(tit.name) + ' <span class="muted">· privado</span>' : '👥 Sala general <span class="muted">· lo ve todo el equipo</span>') +
      '</div>' +
      '<div class="cmsgs" id="cmsgs"></div>' +
      '<form class="cform" id="chatForm"><input id="chatIn" autocomplete="off" placeholder="Escribí un mensaje…" maxlength="2000"><button class="btn primary">Enviar</button></form></div>' +
      rightPane +
      '</div>';
  }
  function renderChatMsgs() {
    var box = $('cmsgs'); if (!box) return;
    var list = S.chat.filter(function (m) { return convKey(m) === S.chatTo; });
    var atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    var lastDay = '', html = '';
    list.forEach(function (m, i) {
      var d = new Date(m.ts), day = iso(d);
      if (day !== lastDay) { html += '<div class="cday">' + (day === iso(new Date()) ? 'Hoy' : DIAS[d.getDay()] + ' ' + fmt(day)) + '</div>'; lastDay = day; }
      var mine = m.from === S.me.id, prev = list[i - 1], cont = prev && prev.from === m.from && m.ts - prev.ts < 300000 && iso(new Date(prev.ts)) === day;
      html += '<div class="msg' + (mine ? ' mine' : '') + (cont ? ' cont' : '') + '">' + (!mine ? (cont ? '<span class="av sm" style="visibility:hidden"></span>' : avatar(userById(m.from), 'sm')) : '') +
        '<div class="bub">' + (!mine && !cont && !S.chatTo ? '<b style="color:' + userColor(m.from) + '">' + esc(userName(m.from)) + '</b>' : '') +
        esc(m.text).replace(/\n/g, '<br>') + '<small>' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + (mine ? (m.pending ? ' 🕓' : ' ✓') : '') + '</small></div></div>';
    });
    box.innerHTML = html || '<p class="muted" style="text-align:center;margin-top:40px">Todavía no hay mensajes. ¡Escribí el primero!</p>';
    if (atBottom || !box.dataset.init) box.scrollTop = box.scrollHeight;
    box.dataset.init = 1;
    markRead(); updateBadge();
    // actualizar contadores de la lista sin redibujar todo
    var items = document.querySelectorAll('.citem');
    for (var i = 0; i < items.length; i++) {
      var k = items[i].getAttribute('data-chat'), b = items[i].querySelector('.badge'), n = unread(k);
      if (b && !n) b.parentNode.removeChild(b);
    }
  }

  function vConfig() {
    var th = applyTheme(), c = S.data.config || {}, me = userById(S.me.id) || S.me;
    var html = '<div class="grid3" style="grid-template-columns:1fr 1fr">';
    html += '<div class="card"><h2>Mi perfil</h2><div class="photo-edit">' + avatar(me, 'xl') + '<div><b style="font-size:17px">' + esc(me.name) + '</b><br><span class="muted">' + ROLES[me.role] + ' · @' + esc(me.username) + '</span><br><br>' +
      '<span class="btn file-btn">📷 Cambiar foto<input type="file" id="pFoto" accept="image/*"></span> ' + (me.avatar ? '<button class="btn ghost" id="pFotoDel">Quitar</button>' : '') + '</div></div>' +
      '<h3 style="margin-top:20px">Contraseña</h3><div class="row"><label>Actual<input type="password" id="pOld"></label><label>Nueva<input type="password" id="pNew"></label></div>' +
      '<button class="btn primary" id="bPass">Cambiar contraseña</button></div>';
    html += '<div class="card"><h2>Apariencia</h2><p class="muted">Se guarda para tu usuario en esta PC.</p>' +
      '<div class="seg"><button class="btn' + (th.mode === 'light' ? ' on' : '') + '" data-mode="light">☀ Claro</button><button class="btn' + (th.mode === 'dark' ? ' on' : '') + '" data-mode="dark">🌙 Oscuro</button></div>' +
      '<div class="swatches">' + Object.keys(ACENTOS).map(function (k) { return '<div class="sw' + (th.acc === k ? ' on' : '') + '" data-acc="' + k + '" title="' + k + '" style="background:' + ACENTOS[k] + '"></div>'; }).join('') + '</div>' +
      '<h3 style="margin-top:18px">Fondo de pantalla</h3><div class="photo-edit"><div class="wall-prev" style="' + (lsGet('ag_wall_' + S.me.id, '') ? 'background-image:url(' + lsGet('ag_wall_' + S.me.id, '') + ')' : '') + '"></div>' +
      '<div><span class="btn file-btn">🖼️ Elegir imagen<input type="file" id="wFile" accept="image/*"></span> <button class="btn ghost" id="wDel">Fondo original</button>' +
      '<p class="muted" style="margin:6px 0 0;font-size:12px">Ej.: una foto de la escuela. Queda difuminada detrás de los paneles.</p></div></div>' +
      '<label style="display:flex;align-items:center;gap:8px;margin-top:16px;color:var(--tx)"><input type="checkbox" id="liteChk" style="width:auto"' + (th.lite ? ' checked' : '') + '> Modo liviano (sin efecto vidrio, para PC viejas)</label></div></div>';

    if (!isDir()) return html + '<div class="card"><p class="muted">Los datos de la institución (nombre, CUE, logo) y los usuarios los administra el Director/a.</p></div>';

    html += '<div class="card"><h2>Institución</h2><div class="photo-edit">' +
      (c.logo ? '<img class="logo-prev" src="' + c.logo + '">' : '<div class="logo-ph" style="width:96px;height:96px;font-size:40px;border-radius:20px">' + esc(initials(c.nombre || 'A').slice(0, 1)) + '</div>') +
      '<div><span class="btn file-btn">🏫 Subir logo de la escuela<input type="file" id="cLogo" accept="image/*"></span> ' + (c.logo ? '<button class="btn ghost" id="cLogoDel">Quitar</button>' : '') +
      '<p class="muted" style="margin:6px 0 0">PNG o JPG. Aparece en el encabezado, en el inicio y en el login.</p></div></div>' +
      '<div class="row"><label>Nombre de la escuela<input id="cNombre" value="' + esc(c.nombre) + '"></label>' +
      '<label>CUE (9 dígitos)<input id="cCue" maxlength="9" inputmode="numeric" placeholder="Ej: 060123400" value="' + esc(c.cue) + '"></label></div>' +
      '<div class="row"><label>Dirección<input id="cDir" placeholder="Calle y número" value="' + esc(c.direccion) + '"></label>' +
      '<label>Localidad<input id="cLoc" value="' + esc(c.localidad) + '"></label>' +
      '<label>Distrito<input id="cDist" value="' + esc(c.distrito) + '"></label></div>' +
      '<div class="row"><label>Teléfono fijo<input id="cTel" inputmode="tel" placeholder="Ej: (0236) 442-1234" value="' + esc(c.telefono) + '"></label>' +
      '<label>WhatsApp de la escuela<input id="cWsp" inputmode="tel" placeholder="Ej: +54 9 236 412-3456" value="' + esc(c.whatsapp) + '"></label>' +
      '<label>Mail institucional<input id="cMail" type="email" placeholder="escuela@abc.gob.ar" value="' + esc(c.email) + '"></label></div>' +
      '<button class="btn primary" id="bConf">Guardar institución</button></div>';

    html += '<div class="card"><div class="toolbar"><h2 class="grow" style="margin:0">Usuarios del equipo</h2><button class="btn primary" id="bUser">+ Agregar usuario</button></div>' +
      '<p class="muted">Director/a y Vicedirector/a: uno solo. Secretarios/as, Jefes/as de Área y Jefes/as de Preceptores: los que hagan falta.</p>' +
      '<div class="tbl-wrap"><table><tr><th>Nombre</th><th>Usuario</th><th>Cargo</th><th>Estado</th><th></th></tr>' +
      S.data.users.slice().sort(function (a, b) { return Object.keys(ROLES).indexOf(a.role) - Object.keys(ROLES).indexOf(b.role); }).map(function (u) {
        return '<tr><td>' + person(u.id) + '</td><td>@' + esc(u.username) + '</td><td>' + ROLES[u.role] + '</td><td>' + (u.active ? '<span class="pill e-Realizado">Activo</span>' : '<span class="pill e-Suspendido">Inactivo</span>') + '</td>' +
          '<td style="text-align:right"><button class="btn small" data-edituser="' + u.id + '">Editar</button> ' + (u.id !== S.me.id ? '<button class="btn small danger" data-deluser="' + u.id + '">Quitar</button>' : '') + '</td></tr>';
      }).join('') + '</table></div></div>';

    html += '<div class="card"><h2>Respaldo</h2><button class="btn" id="bExport">⬇ Descargar copia (JSON)</button> <span class="muted">Guarda las actividades e institución.</span></div>';
    return html;
  }

  // ---------- Eventos de cada vista ----------
  function on(id, ev, fn) { var el = $(id); if (el) el['on' + ev] = fn; }
  function bind() {
    on('tNueva', 'click', function () { taskModal(null); });
    on('bNueva', 'click', function () { taskModal(null); });
    function mover(n) {
      if (S.modo === 'dia') S.dia = addDays(S.dia, n);
      else if (S.modo === 'mes') S.mes = new Date(S.mes.getFullYear(), S.mes.getMonth() + n, 1);
      else S.weekStart = addDays(S.weekStart, 7 * n);
      render();
    }
    on('wPrev', 'click', function () { mover(-1); });
    on('wNext', 'click', function () { mover(1); });
    on('wHoy', 'click', function () { S.dia = new Date(); S.mes = new Date(); S.weekStart = mondayOf(new Date()); render(); });
    on('mDia', 'click', function () { S.modo = 'dia'; render(); });
    on('mMes', 'click', function () { S.modo = 'mes'; render(); });
    on('chatBackBtn', 'click', function () { S.chatMobileView = 'list'; render(); });
    on('copyAll', 'click', function () { var t = instTexto(); if (!t) return toast('No hay datos cargados.'); copiar(t); });
    on('chatForm', 'submit', function (e) {
      e.preventDefault();
      var inp = $('chatIn'), txt = inp.value.trim(); if (!txt) return;
      inp.value = '';
      commit({ type: 'chat', data: { id: uid(), to: S.chatTo, text: txt } });
      inp.focus();
    });
    on('mSem', 'click', function () { S.modo = 'semana'; render(); });
    on('pFoto', 'change', function () {
      var f = this.files[0]; if (!f) return;
      resizeImage(f, 160, function (data) { commit({ type: 'avatar', data: { avatar: data } }); toast('Foto de perfil actualizada ✔'); }, true);
    });
    on('pFotoDel', 'click', function () { commit({ type: 'avatar', data: { avatar: '' } }); });
    on('liteChk', 'change', function () { setTheme({ lite: this.checked }); });
    on('wFile', 'change', function () {
      var f = this.files[0]; if (!f) return;
      resizeImage(f, 1600, function (data) {
        lsSet('ag_wall_' + S.me.id, data); lsSet('ag_wall_anon', data); applyTheme(); render(); toast('Fondo actualizado ✔');
      }, false, 'image/jpeg');
    });
    on('wDel', 'click', function () { LS.removeItem('ag_wall_' + S.me.id); LS.removeItem('ag_wall_anon'); applyTheme(); render(); });
    on('fResp', 'change', function () { S.filtroResp = this.value; render(); });
    on('fEstado', 'change', function () { S.filtroEstado = this.value; render(); });
    on('fVer', 'change', function () { S.verUser = this.value; render(); });
    on('fBuscar', 'change', function () { S.buscar = this.value; render(); });

    var view = $('view');
    view.onclick = function (e) {
      var t = e.target;
      var tk = t.closest('[data-task]'); if (tk) { e.stopPropagation(); return taskModal(tk.getAttribute('data-task')); }
      var nw = t.closest('[data-new]'); if (nw) { var p = nw.getAttribute('data-new').split('|'); return taskModal(null, p[0], p[1]); }
      var dn = t.closest('[data-daynew]');
      if (dn) {
        var y = e.clientY - dn.getBoundingClientRect().top;
        var m = H0 * 60 + Math.floor(y / PX * 2) * 30; // redondeo a media hora
        return taskModal(null, dn.getAttribute('data-daynew'), pad(Math.floor(m / 60)) + ':' + pad(m % 60));
      }
      var vr = t.closest('[data-ver]'); if (vr) { S.verUser = vr.getAttribute('data-ver'); return render(); }
      var cp = t.closest('[data-copy]'); if (cp) return copiar(cp.getAttribute('data-copy'));
      var ch = t.closest('[data-chat]'); if (ch) { S.chatTo = ch.getAttribute('data-chat'); S.chatMobileView = 'msgs'; return render(); }
      var md = t.closest('[data-mday]'); if (md && !t.closest('[data-task]')) { S.dia = new Date(md.getAttribute('data-mday') + 'T12:00'); S.modo = 'dia'; return render(); }
      if (t.getAttribute('data-mode')) return setTheme({ mode: t.getAttribute('data-mode') });
      if (t.getAttribute('data-acc')) return setTheme({ acc: t.getAttribute('data-acc') });
      if (t.getAttribute('data-edituser')) return userModal(t.getAttribute('data-edituser'));
      if (t.getAttribute('data-deluser')) {
        var u = userById(t.getAttribute('data-deluser'));
        if (confirm('¿Quitar a ' + u.name + '? Sus actividades quedarán visibles en el historial.')) commit({ type: 'deleteUser', data: { id: u.id } });
      }
    };

    on('bPass', 'click', function () {
      if (!S.online) return toast('Necesitás conexión para cambiar la contraseña.');
      api('/api/sync', { ops: [{ id: uid(), type: 'password', data: { old: $('pOld').value, pass: $('pNew').value } }] }).then(function (r) {
        var e = r.results[0].error; toast(e ? e : 'Contraseña actualizada ✔'); if (!e) { $('pOld').value = ''; $('pNew').value = ''; }
      }).catch(function (e) { toast(e.message); });
    });
    on('bConf', 'click', function () {
      var cue = $('cCue').value.trim();
      if (cue && !/^\d{9}$/.test(cue)) return toast('El CUE debe tener 9 dígitos numéricos.');
      var mail = $('cMail').value.trim();
      if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return toast('El mail no parece válido.');
      commit({ type: 'config', data: { nombre: $('cNombre').value.trim(), cue: cue, distrito: $('cDist').value.trim(), localidad: $('cLoc').value.trim(),
        direccion: $('cDir').value.trim(), telefono: $('cTel').value.trim(), whatsapp: $('cWsp').value.trim(), email: mail } });
      toast('Institución guardada ✔');
    });
    on('cLogo', 'change', function () {
      var f = this.files[0]; if (!f) return;
      resizeImage(f, 200, function (data) { commit({ type: 'config', data: { logo: data } }); toast('Logo actualizado ✔'); });
    });
    on('cLogoDel', 'click', function () { commit({ type: 'config', data: { logo: '' } }); });
    on('bUser', 'click', function () { userModal(null); });
    on('bExport', 'click', function () {
      var blob = new Blob([JSON.stringify({ config: S.data.config, users: S.data.users, tasks: S.data.tasks }, null, 1)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'agenda-respaldo-' + iso(new Date()) + '.json'; a.click();
    });
  }

  function resizeImage(file, max, cb, square, type) {
    var r = new FileReader();
    r.onload = function () {
      var img = new Image();
      img.onload = function () {
        var cv = document.createElement('canvas'), ctx = cv.getContext('2d');
        if (square) { // recorte cuadrado centrado para foto de perfil
          var side = Math.min(img.width, img.height);
          cv.width = cv.height = max;
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, max, max);
          return cb(cv.toDataURL('image/jpeg', 0.85));
        }
        var s = Math.min(1, max / Math.max(img.width, img.height));
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        cb(type ? cv.toDataURL(type, 0.72) : cv.toDataURL('image/png'));
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  }

  // ---------- Modales ----------
  function modalOpen() { return !$('modal').classList.contains('hidden'); }
  function openModal(html) { $('modalBox').innerHTML = html; $('modal').classList.remove('hidden'); }
  function closeModal() { $('modal').classList.add('hidden'); render(); }
  $('modal').onclick = function (e) { if (e.target === this) closeModal(); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modalOpen()) closeModal(); });

  function taskModal(id, fecha, hora) {
    var t = id ? S.data.tasks.filter(function (x) { return x.id === id; })[0] : null;
    var mine = !t || t.owner === S.me.id;
    var d = t || { fecha: fecha || iso(new Date()), hora: hora || '', prioridad: 'Importante', estado: 'Pendiente' };
    var dis = mine ? '' : ' disabled';
    openModal(
      '<div class="modal-head">' + avatar(t ? userById(t.owner) : (userById(S.me.id) || S.me)) + '<h2>' + (t ? (mine ? 'Editar actividad' : 'Actividad de ' + esc(userName(t.owner)) + ' 🔒') : 'Nueva actividad') + '</h2></div>' +
      (!mine ? '<p class="lock">Solo lectura: únicamente ' + esc(userName(t.owner)) + ' puede modificarla.</p>' : '') +
      '<label>Título<input id="mTit" value="' + esc(d.titulo) + '"' + dis + '></label>' +
      '<div class="row"><label>Fecha<input type="date" id="mFecha" value="' + esc(d.fecha) + '"' + dis + '></label>' +
      '<label>Desde<input type="time" id="mHora" value="' + esc(d.hora) + '"' + dis + '></label>' +
      '<label>Hasta<input type="time" id="mHoraFin" value="' + esc(d.horaFin) + '"' + dis + '></label>' +
      '<label>Fecha límite<input type="date" id="mLim" value="' + esc(d.fechaLimite) + '"' + dis + '></label></div>' +
      '<label>Descripción<textarea id="mDesc"' + dis + '>' + esc(d.descripcion) + '</textarea></label>' +
      '<div class="row"><label>Prioridad<select id="mPri"' + dis + '>' + opts(PRIORIDADES, d.prioridad) + '</select></label>' +
      '<label>Estado<select id="mEst"' + dis + '>' + opts(ESTADOS, d.estado) + '</select></label></div>' +
      '<label>Observaciones<textarea id="mObs"' + dis + '>' + esc(d.observaciones) + '</textarea></label>' +
      (mine ? '<label>⏰ Alarma de recordatorio<select id="mRec">' + opts([['', 'Sin alarma'], ['0', 'A la hora de la actividad'], ['5', '5 minutos antes'], ['15', '15 minutos antes'],
        ['30', '30 minutos antes'], ['60', '1 hora antes'], ['120', '2 horas antes'], ['1440', '1 día antes'], ['2880', '2 días antes']], d.recordatorio == null ? '' : String(d.recordatorio)) +
        '</select></label><p class="muted" style="margin-top:-4px;font-size:12px">Suena en las PCs donde tengas la agenda abierta. Si no ponés hora, se toma 08:00.</p>' : '') +
      (t ? '<div class="by" style="margin-top:10px">' + avatar(userById(t.owner), 'sm') + '<span>Escrito por <b>' + esc(userName(t.owner)) + '</b> · cargada ' + fmtTs(t.creado) + ' · modificada ' + fmtTs(t.modificado) + '</span></div>' : '') +
      '<div class="modal-actions">' + (t && mine ? '<button class="btn danger" id="mDel">Eliminar</button><span style="flex:1"></span>' : '') +
      '<button class="btn" id="mCancel">' + (mine ? 'Cancelar' : 'Cerrar') + '</button>' + (mine ? '<button class="btn primary" id="mOk">Guardar</button>' : '') + '</div>');
    on('mCancel', 'click', closeModal);
    on('mOk', 'click', function () {
      var tit = $('mTit').value.trim(); if (!tit) return toast('Poné un título.');
      var now = Date.now();
      var data = { id: t ? t.id : uid(), owner: S.me.id, titulo: tit, fecha: $('mFecha').value, hora: $('mHora').value, horaFin: $('mHoraFin').value, fechaLimite: $('mLim').value,
        descripcion: $('mDesc').value, prioridad: $('mPri').value, estado: $('mEst').value, observaciones: $('mObs').value, recordatorio: $('mRec').value,
        creado: t ? t.creado : now, modificado: now, deleted: false };
      $('modal').classList.add('hidden');
      commit({ type: 'task', data: data });
      toast(S.online ? 'Guardado ✔' : 'Guardado en esta PC. Se subirá al volver la conexión.');
    });
    on('mDel', 'click', function () {
      if (!confirm('¿Eliminar esta actividad?')) return;
      $('modal').classList.add('hidden');
      commit({ type: 'task', data: { id: t.id, owner: S.me.id, deleted: true, modificado: Date.now() } });
    });
    if (mine) setTimeout(function () { $('mTit').focus(); }, 50);
  }

  function userModal(id) {
    var u = id ? userById(id) : null;
    var d = u || { role: 'secretario', active: true };
    var roles = Object.keys(ROLES).map(function (k) { return [k, ROLES[k]]; });
    openModal('<h2>' + (u ? 'Editar usuario' : 'Nuevo usuario') + '</h2>' +
      '<label>Nombre y apellido<input id="uName" value="' + esc(d.name) + '"></label>' +
      '<div class="row"><label>Usuario (para ingresar)<input id="uUser" value="' + esc(d.username) + '"></label>' +
      '<label>' + (u ? 'Nueva contraseña (dejar vacío = no cambiar)' : 'Contraseña') + '<input id="uPass" type="password"></label></div>' +
      '<div class="row"><label>Cargo<select id="uRole">' + opts(roles, d.role) + '</select></label>' +
      '<label>Estado<select id="uAct">' + opts([['1', 'Activo'], ['0', 'Inactivo']], d.active ? '1' : '0') + '</select></label></div>' +
      '<div class="modal-actions"><button class="btn" id="uCancel">Cancelar</button><button class="btn primary" id="uOk">Guardar</button></div>');
    on('uCancel', 'click', closeModal);
    on('uOk', 'click', function () {
      var data = { id: u ? u.id : uid(), name: $('uName').value.trim(), username: $('uUser').value.trim().toLowerCase(), pass: $('uPass').value, role: $('uRole').value, active: $('uAct').value === '1' };
      if (!data.name || !data.username) return toast('Completá nombre y usuario.');
      if (!u && data.pass.length < 4) return toast('La contraseña debe tener al menos 4 caracteres.');
      if ((data.role === 'director' || data.role === 'vice') && data.active) {
        var otro = S.data.users.filter(function (x) { return x.role === data.role && x.id !== data.id && x.active; })[0];
        if (otro) return toast('Ya existe ' + ROLES[data.role] + ': ' + otro.name + '. Solo puede haber uno.');
      }
      if (!S.online) return toast('Necesitás conexión para administrar usuarios.');
      $('modal').classList.add('hidden');
      commit({ type: 'user', data: data });
    });
  }

  // ---------- Inicio ----------
  applyTheme();
  if (S.token && S.me) {
    start();          // entra aunque no haya conexión (usa los datos guardados)
    sync();
  } else {
    showLogin();
    fetch('/api/state').catch(function () {});
  }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
