/* mzo_ui.js — small helpers for pages built on the MZO UI kit (<html class="ui">).
 * No dependencies. Uses window.mzoDataHub and window.MzoScope when present.
 *
 *   UI.csv(text)                     → array of row objects (header row = keys)
 *   UI.n(x) / UI.inr(x) / UI.pct(a,b) / UI.date(s) / UI.fmtDate(d)
 *   UI.office(code)                  → { region, division, ccc } (canonical names)
 *   UI.load(key, render)             → paint cached data now, repaint when the hub has newer data
 *   UI.fill(select, values, allLabel)/ UI.lockScope()
 *   UI.table(el, { columns, rows, sort, limit, onRow, foot, empty })
 *   UI.hist(el, rows, { onClick, active })
 *   UI.exportCsv(name, columns, rows) / UI.toast(msg) / UI.icon(name) / UI.esc(s)
 */
(function (w) {
  'use strict';

  /* ---------- formatting ---------- */
  var nf = new Intl.NumberFormat('en-IN');
  function n(x) { var v = Number(x); return isFinite(v) ? nf.format(v) : '—'; }
  function inr(x) {
    var v = Number(x) || 0, a = Math.abs(v);
    if (a >= 1e7) return '₹' + (v / 1e7).toFixed(a >= 1e9 ? 0 : 2) + ' Cr';
    if (a >= 1e5) return '₹' + (v / 1e5).toFixed(2) + ' L';
    if (a >= 1e3) return '₹' + (v / 1e3).toFixed(1) + 'K';
    return '₹' + nf.format(Math.round(v));
  }
  function pct(a, b, digits) { if (!b) return '—'; if (!a) return '0%'; var p = (a / b) * 100; return (p > 0 && p < 0.1 ? '<0.1' : p.toFixed(digits == null ? (p < 10 ? 1 : 0) : digits)) + '%'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function blank(v) { var s = String(v == null ? '' : v).trim(); return !s || /^\(?null\)?$/i.test(s) || s === '-' || /^n\/?a$/i.test(s); }

  // dd-mm-yyyy[ hh:mm], dd.mm.yyyy, dd/mm/yyyy, yyyy-mm-dd[ hh:mm:ss]
  function date(s, order) {
    if (s instanceof Date) return s;
    s = String(s == null ? '' : s).trim();
    if (blank(s)) return null;
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) { var y = +m[3]; if (y < 100) y += 2000; var dd = order === 'mdy' ? +m[2] : +m[1], mm = order === 'mdy' ? +m[1] : +m[2]; return new Date(y, mm - 1, dd, +(m[4] || 0), +(m[5] || 0)); }
    var d = new Date(s);
    return isNaN(d) ? null : d;
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(d) { d = date(d); return d ? d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() : '—'; }
  function days(d) { d = date(d); return d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 864e5)) : null; }
  function age(daysN) {
    if (daysN == null) return '—';
    if (daysN < 31) return daysN + 'd';
    if (daysN < 365) return Math.floor(daysN / 30.4) + 'mo';
    var y = Math.floor(daysN / 365), mo = Math.floor((daysN - y * 365) / 30.4);
    return y + 'y' + (mo ? ' ' + mo + 'mo' : '');
  }
  function title(s) {
    return String(s || '').toLowerCase().replace(/\b([a-z])/g, function (c) { return c.toUpperCase(); })
      .replace(/\b(Ii|Iii|Iv|Vi|Vii|Viii|Ix|Xi|Xii)\b/g, function (r) { return r.toUpperCase(); });
  }

  /* ---------- CSV (RFC 4180) ---------- */
  function csv(text) {
    if (Array.isArray(text)) return text;
    text = String(text || '');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    var rows = [], row = [], f = '', q = false, i = 0, c, len = text.length;
    for (; i < len; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); f = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return h.trim(); }), out = new Array(rows.length - 1);
    for (var r = 1; r < rows.length; r++) {
      var o = {}, cells = rows[r];
      for (var k = 0; k < head.length; k++) o[head[k]] = cells[k] != null ? cells[k] : '';
      out[r - 1] = o;
    }
    return out;
  }

  /* ---------- offices ---------- */
  var REGION_ALIAS = { 'malda': 'Malda', 'malda region': 'Malda', 'uttar dinajpur': 'Raiganj', 'uttar dinajpur region': 'Raiganj', 'raiganj': 'Raiganj', 'dakshin dinajpur': 'Balurghat', 'dakshin dinajpur region': 'Balurghat', 'dakhsin dinajpur': 'Balurghat', 'dakhsin dinajpur region': 'Balurghat', 'd/dinajpur region': 'Balurghat', 'u/dinajpur region': 'Raiganj', 'balurghat': 'Balurghat' };
  var officeCache = {};
  function office(code, name) {
    var key = String(code == null ? '' : code).replace(/\D/g, '');
    if (key.length > 7) key = key.slice(-7);
    var ck = key + '|' + (name || '');
    if (officeCache[ck]) return officeCache[ck];
    var S = w.MzoScope, o = null;
    if (S) {
      o = (key && S.parentOfCcc(key)) || (name && S.parentOfCcc(String(name).replace(/\s*CCC.*$/i, '').trim())) || null;
      if (!o && key.length >= 4) {
        var div = S.divisionNameOf && S.divisionNameOf(key.slice(0, 4));
        if (div) {
          var reg = '';
          Object.keys(S.HIERARCHY || {}).forEach(function (r) { if (S.HIERARCHY[r].divisions && S.HIERARCHY[r].divisions[div]) reg = r; });
          o = { region: reg, division: div, ccc: '' };
        }
      }
      if (!o && key.length >= 3) {
        var r3 = { '661': 'Malda', '662': 'Raiganj', '663': 'Balurghat' }[key.slice(0, 3)];
        if (r3) o = { region: r3, division: '', ccc: '' };
      }
    }
    o = o ? { region: o.region || '', division: o.division || '', ccc: o.ccc || '' } : { region: '', division: '', ccc: '' };
    return (officeCache[ck] = o);
  }
  function regionName(s) { return REGION_ALIAS[String(s || '').trim().toLowerCase()] || title(s); }

  /* ---------- data hub ---------- */
  // Paint from IndexedDB at once; re-render if the hub downloads a newer body.
  function load(key, render, opts) {
    var hub = w.mzoDataHub;
    if (!hub) { render(null, { error: true }); return Promise.resolve(); }
    var first;
    return Promise.resolve(hub._peek(key)).catch(function () { return null; }).then(function (c) {
      first = c;
      if (c) render(c, { cached: true });
      return Promise.resolve(hub.waitForDataset(key, opts)).catch(function () {});
    }).then(function () { return hub._peek(key); }).then(function (fresh) {
      if (fresh && fresh !== first) render(fresh, { cached: false });
      else if (!first) render(fresh || null, { error: !fresh });
    }).catch(function () { if (!first) render(null, { error: true }); });
  }

  /* ---------- selects / scope ---------- */
  function fill(sel, values, allLabel, keep) {
    if (typeof sel === 'string') sel = document.getElementById(sel);
    if (!sel || sel.disabled) return;
    var cur = keep !== false ? sel.value : '';
    var h = '<option value="">' + esc(allLabel) + '</option>';
    values.forEach(function (v) { var val = typeof v === 'object' ? v.value : v, lab = typeof v === 'object' ? v.label : v; h += '<option value="' + esc(val) + '">' + esc(lab) + '</option>'; });
    sel.innerHTML = h;
    if (cur && values.some(function (v) { return (typeof v === 'object' ? v.value : v) === cur; })) sel.value = cur;
    mark(sel);
  }
  function mark(sel) { if (sel) sel.classList.toggle('on', !!sel.value && !sel.disabled); }
  // Login scope: pin and disable office selects (#regionFilter, #divisionFilter, #cccFilter).
  function lockScope() {
    var S = w.MzoScope;
    if (!S || S.isUnscoped()) return null;
    var sc = S.getScope() || {};
    var pin = function (id, val) {
      var el = document.getElementById(id);
      if (!el || !val) return;
      if (![].some.call(el.options, function (o) { return o.value === val; })) el.insertAdjacentHTML('beforeend', '<option value="' + esc(val) + '">' + esc(val) + '</option>');
      el.value = val; el.disabled = true; el.classList.remove('on');
    };
    var one = function (set) { return set && set.size === 1 ? Array.from(set)[0] : ''; };
    pin('regionFilter', sc.region || one(sc.regions));
    pin('divisionFilter', sc.division || one(sc.divisions));
    pin('cccFilter', sc.ccc || (sc.level === 'ccc' ? one(sc.cccs) : ''));
    return sc;
  }

  /* ---------- table ---------- */
  // columns: [{ key, label, num, fmt(v,row) → html, sortVal(row), cls, hideSm }]
  function table(el, cfg) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (cfg.reset) el.__ui = null; // new column set (e.g. tab switch): forget sort/paging
    var st = el.__ui || (el.__ui = { sort: cfg.sort || null, limit: cfg.limit || 0, shown: cfg.limit || 0 });
    if (cfg.forceSort && cfg.sort) st.sort = cfg.sort; // caller decides the order this time (e.g. a stat changed the metric)
    if (cfg.resetPage) st.shown = st.limit;
    var cols = cfg.columns, rows = cfg.rows.slice();
    if (st.sort) {
      var c = cols.filter(function (x) { return x.key === st.sort.key; })[0];
      if (c) {
        var dir = st.sort.dir === 'asc' ? 1 : -1;
        var val = c.sortVal || function (r) { return r[c.key]; };
        rows.sort(function (a, b) {
          var x = val(a), y = val(b);
          if (typeof x === 'number' || typeof y === 'number') return ((x || 0) - (y || 0)) * dir;
          return String(x || '').localeCompare(String(y || ''), 'en', { numeric: true }) * dir;
        });
      }
    }
    var total = rows.length, view = st.shown ? rows.slice(0, st.shown) : rows;
    var h = '<div class="ui-table-wrap"><table class="ui-table"><thead><tr>';
    cols.forEach(function (c) {
      var s = st.sort && st.sort.key === c.key ? (st.sort.dir === 'asc' ? 'ascending' : 'descending') : '';
      h += '<th data-sort="' + c.key + '" class="' + (c.num ? 'num ' : '') + (c.hideSm ? 'hide-sm' : '') + '"' + (s ? ' aria-sort="' + s + '"' : '') + (c.width ? ' style="width:' + c.width + '"' : '') + '>' + esc(c.label) + '</th>';
    });
    if (cfg.onRow) h += '<th class="chev" aria-hidden="true"></th>';
    h += '</tr></thead><tbody>';
    if (!view.length) h += '<tr><td colspan="' + (cols.length + (cfg.onRow ? 1 : 0)) + '"><div class="ui-empty">' + esc(cfg.empty || 'Nothing to show.') + '</div></td></tr>';
    view.forEach(function (r, i) {
      h += '<tr' + (cfg.onRow ? ' class="click' + (cfg.selected && cfg.selected(r) ? ' sel' : '') + '" data-i="' + i + '"' : '') + '>';
      cols.forEach(function (c) {
        var v = r[c.key];
        h += '<td class="' + (c.num ? 'num ' : '') + (c.cls || '') + (c.hideSm ? ' hide-sm' : '') + '">' + (c.fmt ? c.fmt(v, r) : esc(v == null || v === '' ? '—' : v)) + '</td>';
      });
      if (cfg.onRow) h += '<td class="chev"><svg class="ui-i"><use href="#ui-chev"/></svg></td>';
      h += '</tr>';
    });
    h += '</tbody>';
    if (cfg.foot && view.length) {
      h += '<tfoot><tr>';
      cols.forEach(function (c, i) { var v = cfg.foot[c.key]; h += '<td class="' + (c.num ? 'num ' : '') + (c.hideSm ? 'hide-sm' : '') + '">' + (i === 0 && v == null ? 'Total' : v == null ? '' : (c.fmt ? c.fmt(v, cfg.foot) : esc(v))) + '</td>'; });
      if (cfg.onRow) h += '<td></td>';
      h += '</tr></tfoot>';
    }
    h += '</table></div>';
    if (st.shown && total > st.shown) h += '<div class="ui-panel-f"><span>Showing ' + n(st.shown) + ' of ' + n(total) + '</span><button type="button" class="ui-btn sm" data-more>Show more</button></div>';
    else if (cfg.count !== false && total > 12) h += '<div class="ui-panel-f"><span>' + n(total) + ' rows</span></div>';
    el.innerHTML = h;
    el.onclick = function (e) {
      var th = e.target.closest('th[data-sort]');
      if (th) {
        var k = th.getAttribute('data-sort'), col = cols.filter(function (x) { return x.key === k; })[0];
        st.sort = st.sort && st.sort.key === k ? { key: k, dir: st.sort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: col && col.num ? 'desc' : 'asc' };
        table(el, cfg); return;
      }
      if (e.target.closest('[data-more]')) { st.shown += st.limit; table(el, cfg); return; }
      var tr = e.target.closest('tr[data-i]');
      if (tr && cfg.onRow) cfg.onRow(view[+tr.getAttribute('data-i')], e);
    };
    return rows;
  }

  function bar(v, max, label) {
    var w2 = max > 0 ? Math.max(v > 0 ? 2 : 0, Math.round((v / max) * 100)) : 0;
    return '<div class="ui-bar"><i><b style="width:' + w2 + '%"></b></i>' + (label != null ? '<span>' + esc(label) + '</span>' : '') + '</div>';
  }

  // rows: [{ label, value, key }]
  function hist(el, rows, opts) {
    if (typeof el === 'string') el = document.getElementById(el);
    opts = opts || {};
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([0]));
    el.className = 'ui-hist';
    if (opts.labelWidth) el.style.setProperty('--ui-hist-label', opts.labelWidth);
    el.innerHTML = rows.map(function (r, i) {
      var on = opts.active != null && opts.active === r.key;
      return '<div class="row' + (opts.onClick ? ' click' : '') + (on ? ' on' : '') + '" data-i="' + i + '"><span title="' + esc(r.label) + '">' + esc(r.label) + '</span><i><b style="width:' + (max ? Math.max(r.value ? 1.5 : 0, (r.value / max) * 100) : 0) + '%"></b></i><span>' + esc(opts.fmt ? opts.fmt(r.value, r) : n(r.value)) + '</span></div>';
    }).join('');
    el.onclick = opts.onClick ? function (e) { var row = e.target.closest('.row'); if (row) opts.onClick(rows[+row.getAttribute('data-i')]); } : null;
  }

  /* ---------- line chart (inline SVG, no library) ----------
   * series: [{ label, values: [number|null], strong: bool }]  labels: x labels
   * fmt(v) formats tooltip/axis values. The strongest series draws in text colour. */
  function line(el, cfg) {
    if (typeof el === 'string') el = document.getElementById(el);
    // Draw at the element's real pixel width so text stays 11px; redraw on resize.
    el.__lineCfg = cfg;
    if (!el.__lineRO && w.ResizeObserver) {
      var lastW = 0;
      el.__lineRO = new ResizeObserver(function () { var cw = el.clientWidth; if (cw && Math.abs(cw - lastW) > 8) { lastW = cw; line(el, el.__lineCfg); } });
      el.__lineRO.observe(el);
    }
    var W = Math.max(300, el.clientWidth || 640), H = cfg.height || 240, P = { t: 12, r: 12, b: 26, l: 44 };
    var labels = cfg.labels, series = cfg.series, fmt = cfg.fmt || n;
    var vals = [];
    series.forEach(function (s) { s.values.forEach(function (v) { if (v != null && isFinite(v)) vals.push(v); }); });
    if (!vals.length) { el.innerHTML = '<div class="ui-empty">No data for this selection.</div>'; return; }
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (cfg.zero !== false && lo > 0 && lo / (hi || 1) < 0.35) lo = 0;
    var span = hi - lo || Math.abs(hi) || 1, step = Math.pow(10, Math.floor(Math.log10(span / 4)));
    [1, 2, 2.5, 5, 10].some(function (m) { if (span / (step * m) <= 5) { step *= m; return true; } return false; });
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step; if (hi === lo) hi = lo + step;
    // Left gutter fits the widest axis label (≈6.4px per character at 11px).
    var widest = 0;
    for (var gg = lo; gg <= hi + step / 2; gg += step) widest = Math.max(widest, String(cfg.axis ? cfg.axis(gg) : fmt(gg)).length);
    P.l = Math.max(36, Math.ceil(widest * 6.4) + 14);
    var x = function (i) { return P.l + (labels.length < 2 ? 0 : i * (W - P.l - P.r) / (labels.length - 1)); };
    var y = function (v) { return P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" class="ui-chart" role="img" aria-label="' + esc(cfg.title || 'Trend') + '">';
    for (var g = lo; g <= hi + step / 2; g += step) {
      s += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y(g) + '" y2="' + y(g) + '" class="gl"/><text x="' + (P.l - 8) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + esc(cfg.axis ? cfg.axis(g) : fmt(g)) + '</text>';
    }
    // Thin crowded x labels: keep roughly one per 56px, always the last.
    var every = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor((W - P.l - P.r) / 56))));
    labels.forEach(function (l, i) { if (i % every === 0 || i === labels.length - 1) s += '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(l) + '</text>'; });
    series.forEach(function (se, si) {
      var d = '', pen = false;
      se.values.forEach(function (v, i) { if (v == null || !isFinite(v)) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); pen = true; });
      var op = se.strong ? 1 : Math.max(0.28, 0.75 - (series.length - 1 - si) * 0.18);
      s += '<path d="' + d + '" class="ln' + (se.strong ? ' strong' : '') + '" style="opacity:' + op + '"/>';
      if (se.strong) se.values.forEach(function (v, i) { if (v != null && isFinite(v)) s += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="2.6" class="pt"/>'; });
    });
    s += '<line class="guide" visibility="hidden" y1="' + P.t + '" y2="' + (H - P.b) + '" x1="0" x2="0"/>';
    labels.forEach(function (_, i) { var half = (W - P.l - P.r) / Math.max(1, labels.length - 1) / 2; s += '<rect class="hit" data-i="' + i + '" x="' + (x(i) - half) + '" y="0" width="' + half * 2 + '" height="' + H + '"/>'; });
    s += '</svg>';
    var legend = '<div class="ui-legend">' + series.map(function (se, si) { var op = se.strong ? 1 : Math.max(0.28, 0.75 - (series.length - 1 - si) * 0.18); return '<span><i style="opacity:' + op + '" class="' + (se.strong ? 'strong' : '') + '"></i>' + esc(se.label) + '</span>'; }).join('') + '</div>';
    el.innerHTML = '<div class="ui-chart-wrap">' + s + '<div class="ui-tip" hidden></div></div>' + legend;
    var svg = el.querySelector('svg'), tip = el.querySelector('.ui-tip'), guide = el.querySelector('.guide');
    svg.addEventListener('pointermove', function (e) {
      var r = e.target.closest && e.target.closest('rect.hit');
      if (!r) return;
      var i = +r.getAttribute('data-i');
      guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.setAttribute('visibility', 'visible');
      tip.innerHTML = '<b>' + esc(cfg.tipLabels ? cfg.tipLabels[i] : labels[i]) + '</b>' + series.slice().reverse().map(function (se) { var v = se.values[i]; return '<div><span>' + esc(se.label) + '</span><span>' + (v == null ? '—' : esc(fmt(v))) + '</span></div>'; }).join('');
      tip.hidden = false;
      var box = svg.getBoundingClientRect(), px = (x(i) / W) * box.width;
      tip.style.left = Math.min(box.width - tip.offsetWidth - 4, Math.max(4, px + 12)) + 'px';
    });
    svg.addEventListener('pointerleave', function () { tip.hidden = true; guide.setAttribute('visibility', 'hidden'); });
  }

  /* ---------- misc ---------- */
  function exportCsv(name, cols, rows) {
    var q = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var out = [cols.map(function (c) { return q(c.label); }).join(',')];
    rows.forEach(function (r) { out.push(cols.map(function (c) { return q(c.csv ? c.csv(r) : r[c.key]); }).join(',')); });
    var blob = new Blob(['﻿' + out.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  var toastT;
  function toast(msg) {
    var t = document.getElementById('ui-toast');
    if (!t) { t = document.createElement('div'); t.id = 'ui-toast'; t.className = 'ui-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function debounce(fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms || 150); }; }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove();
    return Promise.resolve();
  }
  function drawer(titleText, sub, pairs) {
    var d = document.getElementById('ui-drawer');
    if (!d) {
      d = document.createElement('div'); d.id = 'ui-drawer'; d.className = 'ui-drawer'; d.hidden = true;
      d.innerHTML = '<section role="dialog" aria-modal="true"><header><div><h3></h3><p></p></div><button type="button" class="ui-btn icon ghost" data-x aria-label="Close">' + icon('x') + '</button></header><dl class="ui-dl"></dl></section>';
      document.body.appendChild(d);
      d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-x]')) d.hidden = true; });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') d.hidden = true; });
    }
    var act = d.querySelector('.ui-drawer-act');
    if (!act) { act = document.createElement('div'); act.className = 'ui-drawer-act'; d.querySelector('header').insertBefore(act, d.querySelector('[data-x]')); }
    act.innerHTML = typeof arguments[4] === 'string' ? arguments[4] : '';
    d.querySelector('h3').textContent = titleText;
    d.querySelector('p').textContent = sub || '';
    var dl = d.querySelector('dl'), extra = d.querySelector('.ui-drawer-x');
    if (!extra) { extra = document.createElement('div'); extra.className = 'ui-drawer-x'; dl.parentNode.appendChild(extra); }
    dl.innerHTML = (pairs || []).filter(function (p) { return !blank(p[1]); }).map(function (p) { return '<dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd>'; }).join('');
    extra.innerHTML = typeof arguments[3] === 'string' ? arguments[3] : '';
    d.hidden = false;
    return d;
  }

  /* ---------- icons (one sprite per page, injected once) ---------- */
  var ICONS = {
    refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1L20.5 8.5"/><path d="M20.5 3.5v5h-5"/>',
    download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    upload: '<path d="M12 20V9"/><path d="m7 14 5-5 5 5"/><path d="M5 4h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
    sync: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15"/><path d="M4 20v-5h5"/>',
    arrow: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/>'
  };
  function icon(name) { return '<svg class="ui-i" aria-hidden="true"><use href="#ui-' + name + '"/></svg>'; }
  function sprite() {
    if (document.getElementById('ui-sprite')) return;
    var s = '<svg id="ui-sprite" width="0" height="0" style="position:absolute" aria-hidden="true">';
    Object.keys(ICONS).forEach(function (k) { s += '<symbol id="ui-' + k + '" viewBox="0 0 24 24">' + ICONS[k] + '</symbol>'; });
    document.body.insertAdjacentHTML('afterbegin', s + '</svg>');
  }
  if (document.body) sprite(); else document.addEventListener('DOMContentLoaded', sprite);

  // Login gate when a page is opened on its own (inside app.html the shell checks the session).
  (function gate() {
    var inShell = false;
    try { inShell = w.self !== w.top && !!w.top.__MZO_SHELL__; } catch (e) {}
    if (inShell || w.__mzoAuthScript || document.querySelector('script[src*="auth.js"]')) return;
    w.__mzoAuthScript = true;
    var sc = document.createElement('script'); sc.src = '/auth.js'; sc.defer = true;
    (document.head || document.documentElement).appendChild(sc);
  })();

  w.UI = {
    n: n, inr: inr, pct: pct, esc: esc, blank: blank, date: date, fmtDate: fmtDate, days: days, age: age, title: title,
    csv: csv, office: office, regionName: regionName, load: load,
    fill: fill, mark: mark, lockScope: lockScope,
    table: table, bar: bar, hist: hist, line: line,
    exportCsv: exportCsv, toast: toast, debounce: debounce, copy: copy, drawer: drawer, icon: icon
  };
})(window);
