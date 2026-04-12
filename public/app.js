/* ═══════════════════════════════════════════
   Tahiti & Moorea — Travel Planner
   Application logic
   ═══════════════════════════════════════════ */

var CATS = [
  { id: 'beach',      label: 'Plage',               icon: '🏖️', color: '#00B4D8' },
  { id: 'restaurant', label: 'Bar / Restaurant',     icon: '🍹', color: '#FF6B6B' },
  { id: 'hike',       label: 'Randonnée',            icon: '🥾', color: '#2D6A4F' },
  { id: 'culture',    label: 'Culture / Temple',     icon: '🏛️', color: '#9B5DE5' },
  { id: 'snorkel',    label: 'Snorkeling / Plongée', icon: '🤿', color: '#0077B6' },
  { id: 'viewpoint',  label: 'Point de vue',         icon: '📸', color: '#F77F00' },
  { id: 'waterfall',  label: 'Cascade',              icon: '💧', color: '#48CAE4' },
  { id: 'shop',       label: 'Marché / Boutique',    icon: '🛍️', color: '#E56B6F' },
  { id: 'other',      label: 'Autre',                icon: '📍', color: '#6C757D' }
];

function gc(id) {
  return CATS.find(function (c) { return c.id === id; }) || CATS[CATS.length - 1];
}

var CENTER = [-17.5516, -149.5584];
var KEY = 'tahiti-v5';

var places = [];
var map, markers;
var curView = 'map';
var listF = 'all';
var sTimer = null;
var sData = [];
var pending = null;
var tempMarkers = [];

/* ── Storage ── */

function load() {
  try {
    var d = localStorage.getItem(KEY);
    if (d) places = JSON.parse(d);
  } catch (e) { }
  refreshAll();
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(places)); } catch (e) { }
}

/* ── Map ── */

function initMap() {
  map = L.map('map', { zoomControl: false, attributionControl: false }).setView(CENTER, 11);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(map);
  L.control.attribution({ position: 'bottomleft', prefix: false })
    .addAttribution('© <a href="https://www.openstreetmap.org/copyright">OSM</a> · <a href="https://carto.com/">CARTO</a>')
    .addTo(map);
  markers = L.layerGroup().addTo(map);
}

function refreshMarkers() {
  markers.clearLayers();
  places.forEach(function (p) {
    var c = gc(p.category);
    var ic = L.divIcon({
      className: '',
      html: '<div class="cmark ' + (p.visited ? 'visited' : '') + '" style="background:' + c.color + '"><span>' + c.icon + '</span></div>',
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -36]
    });
    var m = L.marker([p.lat, p.lng], { icon: ic }).addTo(markers);
    m.on('click', function () { openDetail(p.id); });
  });
}

function recenter() {
  if (places.length) {
    map.fitBounds(
      L.latLngBounds(places.map(function (p) { return [p.lat, p.lng]; })),
      { padding: [50, 50], maxZoom: 14 }
    );
  } else {
    map.setView(CENTER, 11);
  }
}

function updateCounter() {
  var v = places.filter(function (p) { return p.visited; }).length;
  document.getElementById('map-counter').textContent =
    v + '/' + places.length + ' visité' + (v > 1 ? 's' : '');
}

/* ── Views ── */

function showView(v) {
  curView = v;
  document.querySelectorAll('.view').forEach(function (el) { el.classList.remove('active'); });
  document.getElementById('v-' + v).classList.add('active');
  document.querySelectorAll('.nb').forEach(function (b) { b.classList.remove('active'); });
  document.getElementById('nav-' + v).classList.add('active');
  if (v === 'map') setTimeout(function () { map.invalidateSize(); }, 50);
  if (v === 'search') setTimeout(function () { document.getElementById('sinput').focus(); }, 150);
  if (v === 'list') renderList();
}

/* ── Search (Nominatim / OpenStreetMap) ── */

function onSInput() {
  var q = document.getElementById('sinput').value.trim();
  document.getElementById('btn-sclear').style.display = q ? 'block' : 'none';
  clearTimeout(sTimer);
  if (q.length < 2) { renderSHint(); return; }
  document.getElementById('sresults').innerHTML = '<div class="sloading">Recherche en cours…</div>';
  sTimer = setTimeout(function () { doSearch(q); }, 500);
}

function doSearch(q) {
  var u1 = 'https://nominatim.openstreetmap.org/search?format=json&q=' +
    encodeURIComponent(q) +
    '&viewbox=-150.3,-17.95,-149.0,-17.2&bounded=1&limit=12&addressdetails=1';
  var u2 = 'https://nominatim.openstreetmap.org/search?format=json&q=' +
    encodeURIComponent(q + ' Tahiti Moorea') +
    '&limit=8&addressdetails=1';

  Promise.all([
    fetch(u1).then(function (r) { return r.json(); }),
    fetch(u2).then(function (r) { return r.json(); })
  ]).then(function (arr) {
    var seen = {}, res = [];
    arr[0].concat(arr[1]).forEach(function (r) {
      if (!seen[r.place_id]) { seen[r.place_id] = true; res.push(r); }
    });
    sData = res;
    renderResults(res);
  }).catch(function () {
    document.getElementById('sresults').innerHTML =
      '<div class="sloading">Erreur réseau. Vérifiez votre connexion.</div>';
  });
}

function renderSHint() {
  document.getElementById('sresults').innerHTML =
    '<div class="shint">' +
    '<div class="si">🌺</div>' +
    '<div class="st">Explorer Tahiti & Moorea</div>' +
    '<div class="ss">Tapez un nom de lieu, plage, restaurant…<br><br>' +
    '💡 <em>Temae, Roulottes Papeete, Faarumai, Belvedere…</em></div></div>';
}

function guessCat(r) {
  var t = (r.type || '').toLowerCase();
  var c = (r['class'] || '').toLowerCase();
  var n = (r.display_name || '').toLowerCase();
  if (t.indexOf('beach') >= 0 || n.indexOf('plage') >= 0) return 'beach';
  if (c === 'amenity' && /restaurant|bar|cafe|fast_food/.test(t)) return 'restaurant';
  if (/peak|mountain/.test(t) || /randonn|sentier/.test(n)) return 'hike';
  if (t.indexOf('waterfall') >= 0 || /cascade|chute/.test(n)) return 'waterfall';
  if (c === 'tourism' && (/viewpoint/.test(t) || /belv/.test(n))) return 'viewpoint';
  if (c === 'tourism' || /museum|temple|church/.test(t) || n.indexOf('marae') >= 0) return 'culture';
  if (c === 'shop' || /march|boutique/.test(n)) return 'shop';
  if (/snorkel|diving|plong/.test(n)) return 'snorkel';
  return 'other';
}

function getIsland(r) {
  var d = (r.display_name || '').toLowerCase();
  if (d.indexOf('moorea') >= 0) return 'Moorea';
  if (/tahiti|papeete|punaauia|pirae|faa|mahina|paea|taravao|tiarei|papara|arue/.test(d)) return 'Tahiti';
  return 'Polynésie';
}

function renderResults(results) {
  var el = document.getElementById('sresults');
  if (!results.length) {
    el.innerHTML =
      '<div class="shint"><div class="si">🔍</div>' +
      '<div class="st">Aucun résultat</div>' +
      '<div class="ss">Essayez d\'autres mots-clés.</div></div>';
    return;
  }
  var html = '';
  results.forEach(function (r, i) {
    var c = gc(guessCat(r));
    var added = places.some(function (p) {
      return Math.abs(p.lat - parseFloat(r.lat)) < 0.0005 &&
             Math.abs(p.lng - parseFloat(r.lon)) < 0.0005;
    });
    var name = r.display_name.split(',')[0];
    var addr = r.display_name.split(',').slice(1, 3).join(',').trim();
    var isl = getIsland(r);
    html += '<div class="src" data-idx="' + i + '">' +
      '<div class="src-i" style="background:' + c.color + '18">' + c.icon + '</div>' +
      '<div class="src-info">' +
      '<div class="src-n">' + name + '</div>' +
      '<div class="src-a">' + (addr || isl) + '</div>' +
      '<div class="src-t">📍 ' + isl + ' · ' + c.label + '</div>' +
      '</div>' +
      '<button class="src-add' + (added ? ' added' : '') + '" data-idx="' + i + '">' +
      (added ? '✓' : '+') + '</button></div>';
  });
  el.innerHTML = html;

  // Bind events via delegation
  el.querySelectorAll('.src').forEach(function (card) {
    card.addEventListener('click', function (e) {
      if (e.target.closest('.src-add')) return;
      tapResult(parseInt(this.getAttribute('data-idx')));
    });
  });
  el.querySelectorAll('.src-add').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      addResult(parseInt(this.getAttribute('data-idx')));
    });
  });
}

function tapResult(idx) {
  var r = sData[idx];
  if (!r) return;
  showView('map');
  var lat = parseFloat(r.lat), lng = parseFloat(r.lon);
  map.setView([lat, lng], 16);
  var c = gc(guessCat(r));
  var ic = L.divIcon({
    className: '',
    html: '<div class="cmark" style="background:' + c.color + '"><span>' + c.icon + '</span></div>',
    iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -36]
  });
  var m = L.marker([lat, lng], { icon: ic }).addTo(map);
  tempMarkers.push(m);
  var name = r.display_name.split(',')[0];
  m.bindPopup(
    '<div class="mp"><h3>' + name + '</h3>' +
    '<p class="sub">' + c.icon + ' ' + c.label + ' · ' + getIsland(r) + '</p>' +
    '<div class="acts"><button class="btn btn-p" id="pop-add-' + idx + '">+ Ajouter</button></div></div>'
  ).openPopup();
  m.on('popupopen', function () {
    var b = document.getElementById('pop-add-' + idx);
    if (b) b.addEventListener('click', function () { map.closePopup(); addResult(idx); });
  });
  setTimeout(function () { try { map.removeLayer(m); } catch (e) { } }, 30000);
}

function addResult(idx) {
  var r = sData[idx];
  if (!r) return;
  var lat = parseFloat(r.lat), lng = parseFloat(r.lon);
  if (places.some(function (p) {
    return Math.abs(p.lat - lat) < 0.0005 && Math.abs(p.lng - lng) < 0.0005;
  })) {
    showToast('Déjà dans votre liste !');
    return;
  }
  pending = {
    name: r.display_name.split(',')[0],
    lat: lat,
    lng: lng,
    address: r.display_name.split(',').slice(1, 3).join(',').trim(),
    island: getIsland(r),
    guessCat: guessCat(r)
  };
  openCatModal();
}

/* ── Category modal ── */

function openCatModal() {
  document.getElementById('cat-sub').textContent = 'Pour « ' + pending.name + ' »';
  var g = document.getElementById('cat-grid');
  var sug = pending.guessCat || 'other';
  var html = '';
  CATS.forEach(function (c) {
    html += '<button class="citem" data-cid="' + c.id + '" style="' +
      (c.id === sug ? 'border-color:' + c.color + ';background:' + c.color + '10' : '') +
      '"><span class="cic">' + c.icon + '</span><span class="cil">' + c.label + '</span></button>';
  });
  g.innerHTML = html;
  g.querySelectorAll('.citem').forEach(function (btn) {
    btn.addEventListener('click', function () { confirmAdd(this.getAttribute('data-cid')); });
  });
  document.getElementById('cat-ov').classList.add('open');
  document.getElementById('cat-sh').classList.add('open');
}

function closeCatModal() {
  document.getElementById('cat-ov').classList.remove('open');
  document.getElementById('cat-sh').classList.remove('open');
  pending = null;
}

function confirmAdd(catId) {
  if (!pending) return;
  places.unshift({
    id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name: pending.name,
    lat: pending.lat,
    lng: pending.lng,
    address: pending.address || '',
    island: pending.island || 'Polynésie',
    category: catId,
    visited: false,
    addedAt: Date.now()
  });
  save();
  closeCatModal();
  refreshAll();
  showToast('✓ Ajouté à votre voyage !');
}

/* ── Detail sheet ── */

function openDetail(id) {
  var p = null;
  for (var i = 0; i < places.length; i++) {
    if (places[i].id === id) { p = places[i]; break; }
  }
  if (!p) return;
  var c = gc(p.category);
  document.getElementById('det-body').innerHTML =
    '<div class="dhero" style="background:linear-gradient(135deg,' + c.color + '30,' + c.color + '10)">' +
    '<span style="font-size:56px">' + c.icon + '</span>' +
    '<button class="dclose" id="btn-dclose">✕</button>' +
    '<div class="dcat" style="background:' + c.color + '">' + c.icon + ' ' + c.label + '</div></div>' +
    '<div class="dbody">' +
    '<div class="dname">' + p.name + '</div>' +
    '<div class="daddr">📍 ' + (p.address || p.island) + '</div>' +
    '<div class="dtags">' +
    '<span class="dtag" style="background:' + c.color + '18;color:' + c.color + '">' + c.label + '</span>' +
    '<span class="dtag" style="background:#e0f7fa;color:#00B4D8">🏝️ ' + p.island + '</span>' +
    (p.visited
      ? '<span class="dtag" style="background:#d1fae5;color:#065f46">✓ Visité</span>'
      : '<span class="dtag" style="background:#fef3c7;color:#92400e">⏳ À faire</span>') +
    '</div>' +
    '<div class="dsec"><div class="dsec-t">📍 Coordonnées GPS</div>' +
    '<div class="drow">🌐 ' + p.lat.toFixed(5) + ', ' + p.lng.toFixed(5) + '</div>' +
    '<div class="drow">🏝️ Île : <strong style="margin-left:4px">' + p.island + '</strong></div></div>' +
    '<div class="dsec"><div class="dsec-t">🧭 Navigation</div>' +
    '<a href="https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lng + '" ' +
    'target="_blank" rel="noopener" ' +
    'style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#e8f4fd;border-radius:12px;text-decoration:none;color:#0077B6;font-weight:600;font-size:13px">' +
    '🗺️ Ouvrir dans Google Maps</a></div>' +
    '<div class="dacts">' +
    '<button class="dbtn ' + (p.visited ? 'dbtn-p' : 'dbtn-s') + '" id="btn-dtoggle">' +
    (p.visited ? '↩ Non visité' : '✓ Marquer visité') + '</button>' +
    '<button class="dbtn dbtn-d" id="btn-dremove">🗑️</button></div></div>';

  document.getElementById('det-ov').classList.add('open');
  document.getElementById('det-sh').classList.add('open');

  document.getElementById('btn-dclose').addEventListener('click', closeDetail);
  document.getElementById('btn-dtoggle').addEventListener('click', function () {
    p.visited = !p.visited;
    save();
    refreshAll();
    openDetail(id);
  });
  document.getElementById('btn-dremove').addEventListener('click', function () {
    places = places.filter(function (x) { return x.id !== id; });
    save();
    closeDetail();
    refreshAll();
    showToast('Lieu supprimé');
  });
}

function closeDetail() {
  document.getElementById('det-ov').classList.remove('open');
  document.getElementById('det-sh').classList.remove('open');
}

/* ── List ── */

function renderList() {
  var v = places.filter(function (p) { return p.visited; }).length;
  document.getElementById('lsub').textContent =
    v + ' visité' + (v > 1 ? 's' : '') + ' sur ' + places.length;
  document.getElementById('lprog').style.width =
    places.length ? (v / places.length * 100) + '%' : '0%';

  var list = places;
  if (listF === 'todo') list = list.filter(function (p) { return !p.visited; });
  if (listF === 'done') list = list.filter(function (p) { return p.visited; });

  var el = document.getElementById('lscroll');
  if (!list.length) {
    el.innerHTML =
      '<div class="empty"><div class="ei">' + (places.length ? '🔍' : '📋') + '</div>' +
      '<div class="et">' + (places.length ? 'Aucun résultat' : 'Liste vide') + '</div>' +
      '<div class="es">' + (places.length ? 'Essayez un autre filtre' : 'Explorez et ajoutez des lieux !') + '</div></div>';
    return;
  }

  var html = '';
  list.forEach(function (p) {
    var c = gc(p.category);
    html += '<div class="lpc' + (p.visited ? ' vis' : '') + '" data-id="' + p.id + '">' +
      '<div class="lpc-i" style="background:' + c.color + '15">' + c.icon +
      (p.visited ? '<div class="lpc-b">✓</div>' : '') + '</div>' +
      '<div class="lpc-info"><div class="lpc-n">' + p.name + '</div>' +
      '<div class="lpc-c">' + c.label + '</div>' +
      '<div class="lpc-is">📍 ' + p.island + '</div></div>' +
      '<button class="lpc-ck' + (p.visited ? ' on' : '') + '" data-id="' + p.id + '">✓</button></div>';
  });
  el.innerHTML = html;

  el.querySelectorAll('.lpc').forEach(function (card) {
    card.addEventListener('click', function (e) {
      if (e.target.closest('.lpc-ck')) return;
      openDetail(this.getAttribute('data-id'));
    });
  });
  el.querySelectorAll('.lpc-ck').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var id = this.getAttribute('data-id');
      for (var i = 0; i < places.length; i++) {
        if (places[i].id === id) { places[i].visited = !places[i].visited; break; }
      }
      save();
      refreshAll();
    });
  });
}

/* ── Toast ── */

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function () { t.classList.remove('show'); }, 2200);
}

/* ── Refresh ── */

function refreshAll() {
  refreshMarkers();
  updateCounter();
  if (curView === 'list') renderList();
}

/* ── Init ── */

document.addEventListener('DOMContentLoaded', function () {
  initMap();
  load();

  // Navigation
  document.querySelectorAll('.nb').forEach(function (b) {
    b.addEventListener('click', function () { showView(this.getAttribute('data-v')); });
  });
  document.getElementById('btn-map-search').addEventListener('click', function () { showView('search'); });
  document.getElementById('btn-fab').addEventListener('click', function () { showView('search'); });
  document.getElementById('btn-recenter').addEventListener('click', recenter);
  document.getElementById('btn-sback').addEventListener('click', function () { showView('map'); });

  // Search input
  document.getElementById('sinput').addEventListener('input', onSInput);
  document.getElementById('btn-sclear').addEventListener('click', function () {
    document.getElementById('sinput').value = '';
    this.style.display = 'none';
    renderSHint();
  });

  // List filters
  document.getElementById('lfilters').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    listF = chip.getAttribute('data-f');
    this.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
    chip.classList.add('active');
    renderList();
  });

  // Overlay closes
  document.getElementById('det-ov').addEventListener('click', closeDetail);
  document.getElementById('cat-ov').addEventListener('click', closeCatModal);
});
