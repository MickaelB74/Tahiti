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

/* Tags OSM pour chaque catégorie (Overpass API) */
var CAT_TAGS = {
  beach:      [['natural','beach']],
  restaurant: [['amenity','restaurant'],['amenity','bar'],['amenity','cafe'],['amenity','fast_food'],['amenity','pub']],
  hike:       [['highway','path'],['natural','peak'],['route','hiking']],
  culture:    [['tourism','museum'],['amenity','place_of_worship'],['historic','archaeological_site'],['historic','memorial'],['historic','ruins']],
  snorkel:    [['sport','scuba_diving'],['sport','snorkeling'],['leisure','dive_centre']],
  viewpoint:  [['tourism','viewpoint']],
  waterfall:  [['waterfall','yes'],['natural','waterfall']],
  shop:       [['shop','supermarket'],['shop','convenience'],['shop','gift'],['amenity','marketplace']],
  other:      [['tourism','attraction'],['tourism','hotel'],['tourism','guest_house'],['tourism','camp_site'],['tourism','picnic_site']]
};

function gc(id) {
  return CATS.find(function (c) { return c.id === id; }) || CATS[CATS.length - 1];
}

var KEY = 'tahiti-v5';

/* Bounding boxes par île */
var ISLANDS = {
  all:    { center: [-17.6, -149.5],  zoom: 11, latMin: -18.0,  latMax: -17.3, lngMin: -150.2, lngMax: -149.0 },
  tahiti: { center: [-17.65, -149.45], zoom: 12, latMin: -17.88, latMax: -17.44, lngMin: -149.65, lngMax: -149.09 },
  moorea: { center: [-17.53, -149.84], zoom: 13, latMin: -17.62, latMax: -17.44, lngMin: -150.0,  lngMax: -149.73 }
};

var places = [];
var history = [];
var map, markersLayer, searchLayer;
var curView = 'map';
var mapMode = 'mine';        // 'mine' | 'explore'
var islandFilter = 'all';    // 'all' | 'tahiti' | 'moorea'
var catFilter = 'all';
var listF = 'all';
var sTimer = null;
var sData = [];
var pending = null;
var searching = false;
var HKEY = 'tahiti-history-v1';

/* ── Storage ── */

function load() {
  try {
    var d = localStorage.getItem(KEY);
    if (d) places = JSON.parse(d);
  } catch (e) { }
  places.forEach(function (p) {
    if (p.inDay === undefined) p.inDay = false;
  });
  try {
    var h = localStorage.getItem(HKEY);
    if (h) history = JSON.parse(h);
  } catch (e) { }
  refreshAll();
}

function saveHistory() {
  try { localStorage.setItem(HKEY, JSON.stringify(history)); } catch (e) { }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(places)); } catch (e) { }
}

/* ── Map init ── */

function initMap() {
  map = L.map('map', { zoomControl: false, attributionControl: false }).setView(ISLANDS.all.center, ISLANDS.all.zoom);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(map);
  L.control.attribution({ position: 'bottomleft', prefix: false })
    .addAttribution('© <a href="https://www.openstreetmap.org/copyright">OSM</a> · <a href="https://carto.com/">CARTO</a>')
    .addTo(map);
  markersLayer = L.layerGroup().addTo(map);
  searchLayer = L.layerGroup().addTo(map);
}

/* ── Map mode switching ── */

function setMapMode(mode) {
  mapMode = mode;

  /* Toggle buttons */
  document.querySelectorAll('.mode-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-mode') === mode);
  });

  /* Show / hide elements */
  document.getElementById('map-search').classList.toggle('visible', mode === 'explore');
  document.getElementById('map-counter').style.display = mode === 'mine' ? '' : 'none';
  document.getElementById('map-results').classList.toggle('visible', mode === 'explore');

  /* Reset category filter */
  catFilter = 'all';
  document.querySelectorAll('.mfc').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-cat') === 'all');
  });

  refreshMap();

  if (mode === 'explore') {
    setTimeout(function () { document.getElementById('sinput').focus(); }, 200);
  }
}

/* ── Refresh map markers ── */

function refreshMap() {
  markersLayer.clearLayers();
  searchLayer.clearLayers();

  if (mapMode === 'mine') {
    renderMineMarkers();
    updateCounter();
  } else {
    renderSearchMarkers();
    renderResultsPanel();
  }
}

function placeMatchesIsland(p) {
  if (islandFilter === 'all') return true;
  var bb = ISLANDS[islandFilter];
  return p.lat >= bb.latMin && p.lat <= bb.latMax &&
         p.lng >= bb.lngMin && p.lng <= bb.lngMax;
}

function renderMineMarkers() {
  places.forEach(function (p) {
    if (!placeMatchesIsland(p)) return;
    if (catFilter !== 'all' && p.category !== catFilter) return;
    var c = gc(p.category);
    var ic = L.divIcon({
      className: '',
      html: '<div class="cmark ' + (p.visited ? 'visited' : '') + '" style="background:' + c.color + '"><span>' + c.icon + '</span></div>',
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -36]
    });
    var m = L.marker([p.lat, p.lng], { icon: ic }).addTo(markersLayer);
    m.on('click', function () { openDetail(p.id); });
  });
}

function renderSearchMarkers() {
  sData.forEach(function (r, i) {
    var cat = guessCat(r);
    if (catFilter !== 'all' && cat !== catFilter) return;

    var c = gc(cat);
    var lat = parseFloat(r.lat), lng = parseFloat(r.lon);
    var added = isAlreadyAdded(lat, lng);

    var ic = L.divIcon({
      className: '',
      html: '<div class="cmark' + (added ? ' added' : '') + '" style="background:' + c.color + '"><span>' + c.icon + '</span></div>',
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -36]
    });

    var m = L.marker([lat, lng], { icon: ic }).addTo(searchLayer);
    var name = r.display_name.split(',')[0];

    m.bindPopup(
      '<div class="mp"><h3>' + name + '</h3>' +
      '<p class="sub">' + c.icon + ' ' + c.label + ' · ' + getIsland(r) + '</p>' +
      '<div class="acts"><button class="btn btn-p" id="pop-add-' + i + '">' +
      (added ? '✓ Ajouté' : '+ Ajouter') + '</button></div></div>'
    );

    m.on('popupopen', function () {
      var b = document.getElementById('pop-add-' + i);
      if (b && !added) {
        b.addEventListener('click', function () { map.closePopup(); addResult(i); });
      }
    });
  });

  /* Cadrer la carte sur les résultats filtrés */
  var filtered = getFilteredResults();
  if (filtered.length) {
    var bounds = L.latLngBounds(filtered.map(function (r) {
      return [parseFloat(r.lat), parseFloat(r.lon)];
    }));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
  }
}

function isAlreadyAdded(lat, lng) {
  return places.some(function (p) {
    return Math.abs(p.lat - lat) < 0.0005 && Math.abs(p.lng - lng) < 0.0005;
  });
}

function getFilteredResults() {
  if (catFilter === 'all') return sData;
  return sData.filter(function (r) {
    return r._forceCat === catFilter || guessCat(r) === catFilter;
  });
}

/* ── Recenter ── */

function recenter() {
  if (mapMode === 'mine') {
    var visible = places.filter(function (p) {
      if (!placeMatchesIsland(p)) return false;
      if (catFilter !== 'all' && p.category !== catFilter) return false;
      return true;
    });
    if (visible.length) {
      map.fitBounds(
        L.latLngBounds(visible.map(function (p) { return [p.lat, p.lng]; })),
        { padding: [50, 50], maxZoom: 14 }
      );
    } else {
      map.setView(ISLANDS[islandFilter].center, ISLANDS[islandFilter].zoom);
    }
  } else {
    var filtered = getFilteredResults();
    if (filtered.length) {
      map.fitBounds(
        L.latLngBounds(filtered.map(function (r) { return [parseFloat(r.lat), parseFloat(r.lon)]; })),
        { padding: [50, 50], maxZoom: 14 }
      );
    } else {
      map.setView(ISLANDS[islandFilter].center, ISLANDS[islandFilter].zoom);
    }
  }
}

/* ── Counter (mode Mes lieux) ── */

function updateCounter() {
  var filtered = places.filter(function (p) { return placeMatchesIsland(p); });
  var v = filtered.filter(function (p) { return p.visited; }).length;
  document.getElementById('map-counter').textContent =
    v + '/' + filtered.length + ' visité' + (v > 1 ? 's' : '');
}

/* ── Island filter ── */

function setIslandFilter(isl) {
  islandFilter = isl;
  document.querySelectorAll('.isl-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-isl') === isl);
  });
  /* Recentrer sur l'île */
  var cfg = ISLANDS[isl];
  map.setView(cfg.center, cfg.zoom);

  if (mapMode === 'explore' && catFilter !== 'all') {
    /* Relancer Overpass avec la nouvelle bbox */
    overpassSearch(catFilter);
  } else if (mapMode === 'explore' && catFilter === 'all') {
    var q = (document.getElementById('sinput').value || '').trim();
    if (q.length >= 2) { doSearch(q); } else { sData = []; refreshMap(); }
  } else {
    refreshMap();
  }
}

/* ── Category filter ── */

function setCatFilter(cat) {
  catFilter = cat;
  document.querySelectorAll('.mfc').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-cat') === cat);
  });

  if (mapMode === 'explore') {
    var q = (document.getElementById('sinput').value || '').trim();
    if (q.length >= 2) {
      if (cat !== 'all') {
        overpassSearch(cat);
      } else {
        doSearch(q);
      }
    } else {
      sData = [];
      refreshMap();
    }
  } else {
    refreshMap();
  }
}

/* ── Views ── */

function showView(v) {
  curView = v;
  document.querySelectorAll('.view').forEach(function (el) { el.classList.remove('active'); });
  document.getElementById('v-' + v).classList.add('active');
  document.querySelectorAll('.nb').forEach(function (b) { b.classList.remove('active'); });
  document.getElementById('nav-' + v).classList.add('active');
  if (v === 'map') setTimeout(function () { map.invalidateSize(); }, 50);
  if (v === 'list') renderList();
  if (v === 'day') renderDay();
  if (v === 'history') renderHistory();
}

/* ══════════════════════════════════════
   Search (Nominatim / OpenStreetMap)
   ══════════════════════════════════════ */

function onSInput() {
  var q = document.getElementById('sinput').value.trim();
  document.getElementById('btn-sclear').style.display = q ? 'block' : 'none';
  clearTimeout(sTimer);

  if (catFilter !== 'all' && mapMode === 'explore') {
    /* Une catégorie est active → re-fetch Overpass puis filtrer par texte */
    sTimer = setTimeout(function () { overpassSearch(catFilter); }, 400);
    return;
  }

  if (q.length < 2) {
    sData = [];
    searching = false;
    refreshMap();
    return;
  }

  searching = true;
  renderResultsPanel();
  sTimer = setTimeout(function () { doSearch(q); }, 500);
}

function inBbox(r) {
  var bb = ISLANDS[islandFilter];
  var lat = parseFloat(r.lat), lng = parseFloat(r.lon);
  return lat >= bb.latMin && lat <= bb.latMax &&
         lng >= bb.lngMin && lng <= bb.lngMax;
}

/* ══════════════════════════════════════
   Overpass API (recherche par catégorie)
   ══════════════════════════════════════ */

function buildOverpassQuery(catId, bboxObj) {
  var bb = bboxObj;
  var bboxStr = bb.latMin + ',' + bb.lngMin + ',' + bb.latMax + ',' + bb.lngMax;
  var tags = CAT_TAGS[catId] || [];
  var parts = [];
  tags.forEach(function (tag) {
    var filter = tag.length === 1
      ? '["' + tag[0] + '"]'
      : '["' + tag[0] + '"="' + tag[1] + '"]';
    parts.push('node' + filter + '(' + bboxStr + ');');
    parts.push('way' + filter + '(' + bboxStr + ');');
  });
  return '[out:json][timeout:30];(' + parts.join('') + ');out center;';
}

function normalizeOverpassResult(el, forceCat) {
  var lat = el.lat || (el.center && el.center.lat);
  var lon = el.lon || (el.center && el.center.lon);
  if (!lat || !lon) return null;
  var tags = el.tags || {};
  var name = tags.name || tags['name:fr'] || tags['name:en'] || '';

  /* Nom générique pour les POI sans nom */
  if (!name) {
    var c = gc(forceCat || 'other');
    name = c.label + ' (sans nom)';
  }

  /* Détection de l'île depuis les coordonnées */
  var isl = 'Polynésie';
  var mbb = ISLANDS.moorea;
  var tbb = ISLANDS.tahiti;
  if (lat >= mbb.latMin && lat <= mbb.latMax && lon >= mbb.lngMin && lon <= mbb.lngMax) isl = 'Moorea';
  else if (lat >= tbb.latMin && lat <= tbb.latMax && lon >= tbb.lngMin && lon <= tbb.lngMax) isl = 'Tahiti';

  return {
    place_id: el.type + '_' + el.id,
    lat: String(lat),
    lon: String(lon),
    display_name: name + ', ' + isl,
    type: tags.natural || tags.amenity || tags.tourism || tags.shop || tags.sport || tags.highway || tags.historic || tags.leisure || '',
    'class': tags.amenity ? 'amenity' : tags.tourism ? 'tourism' : tags.shop ? 'shop' : tags.natural ? 'natural' : 'other',
    _overpass: true,
    _forceCat: forceCat
  };
}

function overpassSearch(catId) {
  /* Quand "Tout" (les 2 îles) → 2 requêtes parallèles sur des bbox serrées */
  var boxes = islandFilter === 'all'
    ? [ISLANDS.tahiti, ISLANDS.moorea]
    : [ISLANDS[islandFilter]];

  var urls = boxes.map(function (bb) {
    var query = buildOverpassQuery(catId, bb);
    return 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
  });

  searching = true;
  renderResultsPanel();

  Promise.all(
    urls.map(function (u) {
      return fetch(u).then(function (r) { return r.json(); }).catch(function () { return { elements: [] }; });
    })
  ).then(function (results) {
    var allElements = [];
    results.forEach(function (data) {
      allElements = allElements.concat(data.elements || []);
    });
    var seen = {};
    sData = [];
    allElements.forEach(function (el) {
      var key = el.type + '_' + el.id;
      if (seen[key]) return;
      seen[key] = true;
      var norm = normalizeOverpassResult(el, catId);
      if (norm) sData.push(norm);
    });

    /* Filtre texte si l'utilisateur a tapé quelque chose */
    var q = (document.getElementById('sinput').value || '').trim().toLowerCase();
    if (q.length >= 2) {
      sData = sData.filter(function (r) {
        return r.display_name.toLowerCase().indexOf(q) >= 0;
      });
    }

    searching = false;
    refreshMap();
  }).catch(function () {
    searching = false;
    document.getElementById('map-results').innerHTML =
      '<div class="sloading">Erreur réseau. Vérifiez votre connexion.</div>';
  });
}

/* ══════════════════════════════════════
   Nominatim (recherche texte libre)
   ══════════════════════════════════════ */

function doSearch(q) {
  var base = 'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&accept-language=fr&limit=30';
  var bb = ISLANDS[islandFilter];
  /* Nominatim viewbox : west,north,east,south */
  var vb = '&viewbox=' + bb.lngMin + ',' + bb.latMax + ',' + bb.lngMax + ',' + bb.latMin;

  var urls = [
    /* 1. Recherche géographique stricte dans la bbox */
    base + vb + '&bounded=1&q=' + encodeURIComponent(q)
  ];
  /* 2. Fallback avec nom d'île (pour les lieux mal géocodés) */
  if (islandFilter === 'all' || islandFilter === 'tahiti') {
    urls.push(base + '&q=' + encodeURIComponent(q + ' Tahiti'));
  }
  if (islandFilter === 'all' || islandFilter === 'moorea') {
    urls.push(base + '&q=' + encodeURIComponent(q + ' Moorea'));
  }

  searching = true;

  Promise.all(
    urls.map(function (u) {
      return fetch(u).then(function (r) { return r.json(); }).catch(function () { return []; });
    })
  ).then(function (arrays) {
    var all = [].concat.apply([], arrays);
    var seen = {}, res = [];
    all.forEach(function (r) {
      if (r && r.place_id && !seen[r.place_id] && inBbox(r)) {
        seen[r.place_id] = true;
        res.push(r);
      }
    });
    sData = res;
    searching = false;
    refreshMap();
  }).catch(function () {
    searching = false;
    document.getElementById('map-results').innerHTML =
      '<div class="sloading">Erreur réseau. Vérifiez votre connexion.</div>';
  });
}

/* ── Guess category from Nominatim data ── */

function guessCat(r) {
  /* Résultat Overpass → catégorie déjà connue */
  if (r._forceCat) return r._forceCat;
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

/* ── Results panel (explore mode) ── */

function renderResultsPanel() {
  var el = document.getElementById('map-results');

  /* Loading indicator */
  if (searching) {
    el.innerHTML =
      '<div class="sloading"><div class="spinner"></div>Recherche en cours…</div>';
    return;
  }

  if (!sData.length) {
    var q = (document.getElementById('sinput').value || '').trim();
    if (q.length >= 2) {
      el.innerHTML =
        '<div class="shint"><div class="si">🔍</div>' +
        '<div class="st">Aucun résultat</div>' +
        '<div class="ss">Aucun lieu trouvé sur Tahiti ou Moorea.<br>Essayez d\'autres mots-clés.</div></div>';
    } else {
      /* Input vide → bouton "Afficher tout" par catégorie */
      var html = '<div class="shint"><div class="si">🌺</div>' +
        '<div class="st">Explorer Tahiti & Moorea</div>' +
        '<div class="ss">Tapez un nom ou chargez une catégorie</div></div>' +
        '<div class="show-all-grid">';
      CATS.forEach(function (c) {
        if (c.id === 'other') return;
        html += '<button class="show-all-btn" data-cat="' + c.id + '" style="border-color:' + c.color + ';color:' + c.color + '">' +
          c.icon + ' ' + c.label + '</button>';
      });
      html += '</div>';
      el.innerHTML = html;
      el.querySelectorAll('.show-all-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var cat = this.getAttribute('data-cat');
          catFilter = cat;
          document.querySelectorAll('.mfc').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-cat') === cat);
          });
          overpassSearch(cat);
        });
      });
    }
    return;
  }

  var filtered = getFilteredResults();

  if (!filtered.length) {
    el.innerHTML =
      '<div class="shint"><div class="si">🔍</div>' +
      '<div class="st">Aucun résultat dans cette catégorie</div>' +
      '<div class="ss">Essayez un autre filtre.</div></div>';
    return;
  }

  var html = '<div class="results-count">' +
    filtered.length + ' résultat' + (filtered.length > 1 ? 's' : '') +
    '</div>';

  filtered.forEach(function (r) {
    var idx = sData.indexOf(r);
    var c = gc(guessCat(r));
    var lat = parseFloat(r.lat), lng = parseFloat(r.lon);
    var added = isAlreadyAdded(lat, lng);
    var name = r.display_name.split(',')[0];
    var addr = r.display_name.split(',').slice(1, 3).join(',').trim();
    var isl = getIsland(r);

    html += '<div class="src" data-idx="' + idx + '">' +
      '<div class="src-i" style="background:' + c.color + '18">' + c.icon + '</div>' +
      '<div class="src-info">' +
      '<div class="src-n">' + name + '</div>' +
      '<div class="src-a">' + (addr || isl) + '</div>' +
      '<div class="src-t">📍 ' + isl + ' · ' + c.label + '</div>' +
      '</div>' +
      '<button class="src-add' + (added ? ' added' : '') + '" data-idx="' + idx + '">' +
      (added ? '✓' : '+') + '</button></div>';
  });

  el.innerHTML = html;

  /* Events */
  el.querySelectorAll('.src').forEach(function (card) {
    card.addEventListener('click', function (e) {
      if (e.target.closest('.src-add')) return;
      var idx = parseInt(this.getAttribute('data-idx'));
      var r = sData[idx];
      if (!r) return;
      var lat = parseFloat(r.lat), lng = parseFloat(r.lon);
      map.setView([lat, lng], 16);
      /* Ouvrir le popup du marqueur correspondant */
      searchLayer.eachLayer(function (layer) {
        var ll = layer.getLatLng();
        if (Math.abs(ll.lat - lat) < 0.0001 && Math.abs(ll.lng - lng) < 0.0001) {
          layer.openPopup();
        }
      });
    });
  });

  el.querySelectorAll('.src-add').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      addResult(parseInt(this.getAttribute('data-idx')));
    });
  });
}

/* ── Add a search result ── */

function addResult(idx) {
  var r = sData[idx];
  if (!r) return;
  var lat = parseFloat(r.lat), lng = parseFloat(r.lon);
  if (isAlreadyAdded(lat, lng)) {
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
    inDay: false,
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
    (p.inDay
      ? '<span class="dtag" style="background:#fff8e1;color:#F77F00">☀️ Dans la journée</span>'
      : '') +
    '</div>' +
    '<div class="dsec"><div class="dsec-t">📍 Coordonnées GPS</div>' +
    '<div class="drow">🌐 ' + p.lat.toFixed(5) + ', ' + p.lng.toFixed(5) + '</div>' +
    '<div class="drow">🏝️ Île : <strong style="margin-left:4px">' + p.island + '</strong></div></div>' +
    '<div class="dsec"><div class="dsec-t">🧭 Navigation</div>' +
    '<a href="https://www.google.com/maps/search/?api=1&query=' + p.lat + ',' + p.lng + '" ' +
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

/* ── List view ── */

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
    var inDay = !!p.inDay;
    html += '<div class="lpc' + (p.visited ? ' vis' : '') + '" data-id="' + p.id + '">' +
      '<div class="lpc-i" style="background:' + c.color + '15">' + c.icon +
      (p.visited ? '<div class="lpc-b">✓</div>' : '') + '</div>' +
      '<div class="lpc-info"><div class="lpc-n">' + p.name + '</div>' +
      '<div class="lpc-c">' + c.label + '</div>' +
      '<div class="lpc-is">📍 ' + p.island + '</div></div>' +
      '<button class="lpc-day' + (inDay ? ' in-day' : '') + '" data-id="' + p.id + '">' +
      (inDay ? '☀️' : '+ Journée') + '</button></div>';
  });
  el.innerHTML = html;

  el.querySelectorAll('.lpc').forEach(function (card) {
    card.addEventListener('click', function (e) {
      if (e.target.closest('.lpc-day')) return;
      openDetail(this.getAttribute('data-id'));
    });
  });
  el.querySelectorAll('.lpc-day').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var id = this.getAttribute('data-id');
      var p = null;
      for (var i = 0; i < places.length; i++) {
        if (places[i].id === id) { p = places[i]; p.inDay = !p.inDay; break; }
      }
      save();
      refreshAll();
      showToast(p && p.inDay ? '☀️ Ajouté à la journée !' : 'Retiré de la journée');
    });
  });
}

/* ── Day view ── */

function renderDay() {
  var dayPlaces = places.filter(function (p) { return p.inDay; });
  var done = dayPlaces.filter(function (p) { return p.visited; }).length;

  document.getElementById('dsub').textContent =
    done + '/' + dayPlaces.length + ' fait' + (done > 1 ? 's' : '');
  document.getElementById('dprog').style.width =
    dayPlaces.length ? (done / dayPlaces.length * 100) + '%' : '0%';

  var el = document.getElementById('dscroll');
  if (!dayPlaces.length) {
    el.innerHTML =
      '<div class="empty"><div class="ei">☀️</div>' +
      '<div class="et">Journée vide</div>' +
      '<div class="es">Dans <strong>Ma liste</strong>, appuyez sur<br><em>+ Journée</em> pour planifier un lieu.</div></div>';
    return;
  }

  var html = '';
  dayPlaces.forEach(function (p) {
    var c = gc(p.category);
    html += '<div class="lpc' + (p.visited ? ' vis' : '') + '" data-id="' + p.id + '">' +
      '<div class="lpc-i" style="background:' + c.color + '15">' + c.icon +
      (p.visited ? '<div class="lpc-b">✓</div>' : '') + '</div>' +
      '<div class="lpc-info"><div class="lpc-n">' + p.name + '</div>' +
      '<div class="lpc-c">' + c.label + '</div>' +
      '<div class="lpc-is">📍 ' + p.island + '</div></div>' +
      '<div class="day-acts">' +
      '<button class="lpc-ck' + (p.visited ? ' on' : '') + '" data-id="' + p.id + '" title="Marquer fait">✓</button>' +
      '<button class="day-rm" data-id="' + p.id + '" title="Retirer de la journée">✕</button>' +
      '</div></div>';
  });
  el.innerHTML = html;

  el.querySelectorAll('.lpc').forEach(function (card) {
    card.addEventListener('click', function (e) {
      if (e.target.closest('.lpc-ck') || e.target.closest('.day-rm')) return;
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

  el.querySelectorAll('.day-rm').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var id = this.getAttribute('data-id');
      for (var i = 0; i < places.length; i++) {
        if (places[i].id === id) { places[i].inDay = false; break; }
      }
      save();
      refreshAll();
      showToast('Retiré de la journée');
    });
  });

  /* Archive button */
  var archiveBtn = document.getElementById('btn-archive');
  if (archiveBtn) {
    var visitedInDay = dayPlaces.filter(function (p) { return p.visited; });
    archiveBtn.style.display = visitedInDay.length ? 'flex' : 'none';
    archiveBtn.onclick = function () {
      archiveDay();
    };
  }
}

/* ── Archive day → history ── */

function archiveDay() {
  var dayPlaces = places.filter(function (p) { return p.inDay && p.visited; });
  if (!dayPlaces.length) {
    showToast('Aucun lieu visité à archiver');
    return;
  }
  var today = new Date().toISOString().slice(0, 10);
  dayPlaces.forEach(function (p) {
    history.unshift({
      id: p.id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      address: p.address,
      island: p.island,
      category: p.category,
      archivedAt: today
    });
    p.inDay = false;
    p.visited = false;
  });
  saveHistory();
  save();
  refreshAll();
  showToast('✓ ' + dayPlaces.length + ' lieu' + (dayPlaces.length > 1 ? 'x' : '') + ' archivé' + (dayPlaces.length > 1 ? 's' : ''));
}

/* ── History view ── */

function renderHistory() {
  var el = document.getElementById('hscroll');
  if (!history.length) {
    el.innerHTML =
      '<div class="empty"><div class="ei">📖</div>' +
      '<div class="et">Pas encore d\'historique</div>' +
      '<div class="es">Archivez votre journée pour<br>retrouver vos visites ici.</div></div>';
    return;
  }

  /* Group by date */
  var grouped = {};
  history.forEach(function (h) {
    var d = h.archivedAt || 'Inconnu';
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(h);
  });

  var dates = Object.keys(grouped).sort(function (a, b) { return b.localeCompare(a); });
  var html = '';
  dates.forEach(function (date) {
    var label = formatHistoryDate(date);
    html += '<div class="hday-label">' + label + ' <span class="hday-count">' + grouped[date].length + ' lieu' + (grouped[date].length > 1 ? 'x' : '') + '</span></div>';
    grouped[date].forEach(function (h) {
      var c = gc(h.category);
      html += '<div class="lpc vis">' +
        '<div class="lpc-i" style="background:' + c.color + '15">' + c.icon +
        '<div class="lpc-b">✓</div></div>' +
        '<div class="lpc-info"><div class="lpc-n">' + h.name + '</div>' +
        '<div class="lpc-c">' + c.label + '</div>' +
        '<div class="lpc-is">📍 ' + h.island + '</div></div></div>';
    });
  });

  el.innerHTML = html;
}

function formatHistoryDate(dateStr) {
  var today = new Date().toISOString().slice(0, 10);
  var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return "Aujourd'hui";
  if (dateStr === yesterday) return 'Hier';
  var parts = dateStr.split('-');
  var months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  return parseInt(parts[2]) + ' ' + months[parseInt(parts[1]) - 1] + ' ' + parts[0];
}

/* ── Toast ── */

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function () { t.classList.remove('show'); }, 2200);
}

/* ── Refresh all ── */

function refreshAll() {
  refreshMap();
  if (curView === 'list') renderList();
  if (curView === 'day') renderDay();
  if (curView === 'history') renderHistory();
}

/* ── Init ── */

document.addEventListener('DOMContentLoaded', function () {
  initMap();
  load();

  /* Navigation onglets */
  document.querySelectorAll('.nb').forEach(function (b) {
    b.addEventListener('click', function () { showView(this.getAttribute('data-v')); });
  });

  /* Mode toggle (Explorer / Mes lieux) */
  document.getElementById('mode-toggle').addEventListener('click', function (e) {
    var btn = e.target.closest('.mode-btn');
    if (!btn) return;
    setMapMode(btn.getAttribute('data-mode'));
  });

  /* Island toggle */
  document.getElementById('island-toggle').addEventListener('click', function (e) {
    var btn = e.target.closest('.isl-btn');
    if (!btn) return;
    setIslandFilter(btn.getAttribute('data-isl'));
  });

  /* Recenter */
  document.getElementById('btn-recenter').addEventListener('click', recenter);

  /* Category filter chips */
  document.getElementById('map-filters').addEventListener('click', function (e) {
    var btn = e.target.closest('.mfc');
    if (!btn) return;
    setCatFilter(btn.getAttribute('data-cat'));
  });

  /* Search input */
  document.getElementById('sinput').addEventListener('input', onSInput);
  document.getElementById('btn-sclear').addEventListener('click', function () {
    document.getElementById('sinput').value = '';
    this.style.display = 'none';
    sData = [];
    refreshMap();
  });

  /* List filters */
  document.getElementById('lfilters').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    listF = chip.getAttribute('data-f');
    this.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
    chip.classList.add('active');
    renderList();
  });

  /* Overlay closes */
  document.getElementById('det-ov').addEventListener('click', closeDetail);
  document.getElementById('cat-ov').addEventListener('click', closeCatModal);
});
