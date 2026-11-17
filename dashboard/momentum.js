// Momentum — the fastest risers on the radar.
//
// A second ranking view for Token Radar. The main board ranks pre-token
// protocols by implied value, which buries small protocols that are
// suddenly growing fast. This view ranks the same rows by momentum instead:
// how fast a protocol's TVL moved in the last 7 days, weighted by size, so
// a one-week spike on a tiny protocol cannot outrank a real mover.
//
// Everything here is computed in the page from window.RADAR, the snapshot
// data the entry already ships. No network, no extra data, no new model:
// the board, its ranks and its implied values are untouched.
//
// Momentum index = 7-day TVL change, capped to [-75%, +200%], times
// log10(TVL in dollars). The cap keeps a single freak week from deciding
// the ranking; the log term rewards growth that happens at real size.
(function () {
  'use strict';

  var TOP_N = 20;
  var CHANGE_CAP_HIGH = 200;
  var CHANGE_CAP_LOW = -75;
  var POLL_MS = 120;
  var POLL_TRIES = 40;

  var sortMode = 'index'; // 'index' | 'change' | 'tvl'
  var expandedSlug = null;
  var prepared = null;

  function clampChange(pct) {
    if (pct > CHANGE_CAP_HIGH) return CHANGE_CAP_HIGH;
    if (pct < CHANGE_CAP_LOW) return CHANGE_CAP_LOW;
    return pct;
  }

  function momentumIndex(row) {
    var capped = clampChange(row.change_7d);
    var size = Math.log10(Math.max(row.tvl_usd, 10));
    return capped * size;
  }

  function fmtUsd(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }

  function fmtPct(n) {
    if (n == null || isNaN(n)) return '—';
    var sign = n > 0 ? '+' : '';
    var digits = Math.abs(n) >= 100 ? 0 : 1;
    return sign + n.toFixed(digits) + '%';
  }

  function fmtIndex(n) {
    if (n == null || isNaN(n)) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1);
  }

  function fmtMult(n) {
    if (n == null || isNaN(n)) return '—';
    return '×' + n.toFixed(2);
  }

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function badgeFor(change) {
    if (change >= 25) return { label: 'Surging', cls: 'mm-badge-hot' };
    if (change > 10) return { label: 'Rising', cls: 'mm-badge-warm' };
    if (change > 0) return { label: 'Steady', cls: 'mm-badge-calm' };
    return { label: 'Cooling', cls: 'mm-badge-cold' };
  }

  function median(values) {
    if (!values.length) return null;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function prepare() {
    var radar = window.RADAR;
    if (!radar || !Array.isArray(radar.rows)) return null;
    var scored = [];
    var changes = [];
    var watchlist = radar.watchlist || [];
    var watchRisers = 0;
    var topGainer = null;
    var biggestLoser = null;
    radar.rows.forEach(function (row) {
      var change = row.change_7d;
      if (change == null || isNaN(change)) return;
      changes.push(change);
      if (watchlist.indexOf(row.slug) !== -1 && change > 10) watchRisers++;
      if (!topGainer || change > topGainer.change_7d) topGainer = row;
      if (!biggestLoser || change < biggestLoser.change_7d) biggestLoser = row;
      scored.push({
        row: row,
        index: momentumIndex(row),
        badge: badgeFor(change),
      });
    });
    scored.sort(function (a, b) {
      return b.index - a.index || b.row.change_7d - a.row.change_7d;
    });
    return {
      top: scored.slice(0, TOP_N),
      medianChange: median(changes),
      gainers10: changes.filter(function (c) { return c > 10; }).length,
      gainers25: changes.filter(function (c) { return c > 25; }).length,
      watchRisers: watchRisers,
      topGainer: topGainer,
      biggestLoser: biggestLoser,
      measured: changes.length,
    };
  }

  function sortedTop() {
    var list = prepared.top.slice();
    if (sortMode === 'change') {
      list.sort(function (a, b) {
        return b.row.change_7d - a.row.change_7d || b.index - a.index;
      });
    } else if (sortMode === 'tvl') {
      list.sort(function (a, b) {
        return b.row.tvl_usd - a.row.tvl_usd || b.index - a.index;
      });
    }
    return list;
  }

  function statCard(label, value, note) {
    return '<div class="mm-stat"><div class="mm-stat-label">' + esc(label) + '</div>' +
      '<div class="mm-stat-value">' + value + '</div>' +
      '<div class="mm-stat-note">' + esc(note) + '</div></div>';
  }

  function statsHtml() {
    var p = prepared;
    var cards = '';
    cards += statCard('Median 7-day change', fmtPct(p.medianChange),
      'across ' + p.measured + ' protocols with a 7-day figure');
    cards += statCard('Gainers over +10%', String(p.gainers10),
      p.gainers25 + ' of them over +25%');
    cards += statCard('Top gainer', esc(p.topGainer ? p.topGainer.name : '—'),
      p.topGainer ? fmtPct(p.topGainer.change_7d) + ' in 7 days' : '');
    cards += statCard('Biggest loser', esc(p.biggestLoser ? p.biggestLoser.name : '—'),
      p.biggestLoser ? fmtPct(p.biggestLoser.change_7d) + ' in 7 days' : '');
    cards += statCard('Watchlist risers', String(p.watchRisers),
      'watchlist protocols up over +10%');
    return '<div class="mm-stats" role="group" aria-label="Momentum summary">' + cards + '</div>';
  }

  function changeBar(change) {
    var width = Math.min(Math.abs(change), 100);
    var cls = change >= 0 ? 'mm-bar-up' : 'mm-bar-down';
    return '<span class="mm-bar"><span class="' + cls + '" style="width:' + width + '%"></span></span>';
  }

  function rowHtml(item, position) {
    var row = item.row;
    var badge = item.badge;
    var open = expandedSlug === row.slug;
    var html = '<tr class="mm-row" data-slug="' + esc(row.slug) + '">' +
      '<td class="mm-num">' + position + '</td>' +
      '<td><button class="mm-name" type="button" aria-expanded="' + open + '">' + esc(row.name) + '</button>' +
      '<div class="mm-sub">' + esc(row.category) + ' · ' + (row.chains.length === 1 ? '1 chain' : row.chains.length + ' chains') + '</div></td>' +
      '<td class="mm-num"><span class="mm-badge ' + badge.cls + '">' + badge.label + '</span></td>' +
      '<td class="mm-num">' + changeBar(row.change_7d) +
      '<span class="mm-change ' + (row.change_7d >= 0 ? 'mm-up' : 'mm-down') + '">' +
      fmtPct(row.change_7d) + '</span></td>' +
      '<td class="mm-num mm-index">' + fmtIndex(item.index) + '</td>' +
      '<td class="mm-num">' + fmtUsd(row.tvl_usd) + '</td>' +
      '<td class="mm-num">' + fmtUsd(row.implied_value_usd) + '</td>' +
      '<td class="mm-num">#' + row.rank + '</td></tr>';
    if (open) {
      html += '<tr class="mm-detail-row"><td colspan="8"><div class="mm-detail">' +
        '<div><span class="mm-detail-label">Chains</span> ' + esc(row.chains.join(', ')) + '</div>' +
        '<div><span class="mm-detail-label">Listed</span> ' + esc(row.listed_at || '—') +
        ' · ' + (row.age_days != null ? row.age_days + ' days old' : 'age unknown') + '</div>' +
        '<div><span class="mm-detail-label">Model</span> growth ' + fmtMult(row.growth_multiplier) +
        ' · maturity ' + fmtMult(row.maturity_multiplier) +
        ' · chains ' + fmtMult(row.chain_multiplier) +
        ' · category ' + fmtMult(row.category_multiplier) + '</div>' +
        '<div><span class="mm-detail-label">Main board</span> implied rank #' + row.rank +
        ' at ' + fmtUsd(row.implied_value_usd) + ' — momentum finds it before the value ranking does.</div>' +
        '</div></td></tr>';
    }
    return html;
  }

  function tableHtml() {
    var rows = sortedTop();
    var body = rows.map(function (item, i) { return rowHtml(item, i + 1); }).join('');
    var sortLabel = sortMode === 'change' ? '7-day change' : sortMode === 'tvl' ? 'TVL' : 'Momentum index';
    return '<table class="mm-table"><caption>Top ' + TOP_N + ' fastest risers, sorted by ' + esc(sortLabel) +
      '. Click a protocol name for its model breakdown.</caption>' +
      '<thead><tr><th scope="col">#</th><th scope="col">Protocol</th><th scope="col">Heat</th>' +
      '<th scope="col"><button class="mm-sort" type="button" data-sort="change">7-day change</button></th>' +
      '<th scope="col"><button class="mm-sort" type="button" data-sort="index">Momentum index</button></th>' +
      '<th scope="col"><button class="mm-sort" type="button" data-sort="tvl">TVL</button></th>' +
      '<th scope="col">Implied value</th><th scope="col">Implied rank</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table>';
  }

  function sectionHtml() {
    return '<h2>Momentum — fastest risers</h2>' +
      '<p class="mm-intro">The main board ranks by implied value. This view ranks the same ' +
      'protocols by momentum: 7-day TVL change, capped at +200% / −75% and weighted by ' +
      'log10(TVL), so growth at real size beats a spike on a tiny protocol. ' +
      'A high momentum rank with a low implied rank is an early signal — the farm ' +
      'before the crowd arrives.</p>' +
      statsHtml() + tableHtml();
  }

  var STYLES = [
    '#momentum{margin:2.5rem auto 3rem;max-width:1100px;padding:0 1rem}',
    '#momentum h2{font-size:1.5rem;letter-spacing:.02em;margin:0 0 .5rem}',
    '.mm-intro{color:#c7cdea;max-width:70ch;line-height:1.55;margin:0 0 1.25rem}',
    '.mm-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem;margin:0 0 1.25rem}',
    '.mm-stat{background:#12173a;border:1px solid #2a2f5e;border-radius:10px;padding:.7rem .85rem}',
    '.mm-stat-label{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:#9aa3d1}',
    '.mm-stat-value{font-size:1.15rem;font-weight:700;color:#fff;margin:.15rem 0}',
    '.mm-stat-note{font-size:.8rem;color:#c7cdea;line-height:1.4}',
    '.mm-table{width:100%;border-collapse:collapse;background:#0d1230;border:1px solid #2a2f5e;border-radius:10px;overflow:hidden}',
    '.mm-table caption{text-align:left;color:#9aa3d1;font-size:.85rem;padding:.5rem .25rem}',
    '.mm-table th,.mm-table td{padding:.55rem .6rem;border-bottom:1px solid #232850;text-align:left;vertical-align:middle}',
    '.mm-table thead th{font-size:.75rem;text-transform:uppercase;letter-spacing:.07em;color:#9aa3d1;background:#12173a}',
    '.mm-table tbody tr:hover{background:#151b45}',
    '.mm-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.mm-index{font-weight:700;color:#57c7ff}',
    '.mm-name{background:none;border:0;padding:0;color:#fff;font:inherit;font-weight:650;cursor:pointer;text-align:left}',
    '.mm-name:hover{color:#57c7ff;text-decoration:underline}',
    '.mm-sub{font-size:.78rem;color:#9aa3d1;margin-top:.1rem}',
    '.mm-badge{display:inline-block;padding:.1rem .5rem;border-radius:999px;font-size:.72rem;font-weight:700}',
    '.mm-badge-hot{background:#f2c14e;color:#231a02}',
    '.mm-badge-warm{background:#3ddc97;color:#032117}',
    '.mm-badge-calm{background:#2a2f5e;color:#c7cdea}',
    '.mm-badge-cold{background:#ff6b81;color:#2b0208}',
    '.mm-bar{display:inline-block;width:64px;height:8px;background:#232850;border-radius:99px;overflow:hidden;vertical-align:middle;margin-right:.45rem}',
    '.mm-bar-up{display:block;height:100%;background:#3ddc97}',
    '.mm-bar-down{display:block;height:100%;background:#ff6b81}',
    '.mm-up{color:#3ddc97}.mm-down{color:#ff6b81}',
    '.mm-sort{background:none;border:0;padding:0;color:inherit;font:inherit;cursor:pointer;text-decoration:underline dotted}',
    '.mm-sort:hover{color:#fff}',
    '.mm-detail{display:grid;gap:.35rem;padding:.35rem 0;font-size:.86rem;color:#c7cdea}',
    '.mm-detail-label{font-weight:700;color:#9aa3d1;margin-right:.35rem}',
    '.mm-detail-row td{background:#10163a}',
    '@media (max-width:760px){.mm-bar{display:none}.mm-table th:nth-child(3),.mm-table td:nth-child(3){display:none}}',
  ].join('\n');

  function injectStyles() {
    if (document.getElementById('mm-styles')) return;
    var style = document.createElement('style');
    style.id = 'mm-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function renderTable() {
    var section = document.getElementById('momentum');
    if (!section) return;
    var table = section.querySelector('.mm-table');
    if (table) table.outerHTML = tableHtml();
  }

  function onSectionClick(event) {
    var sortBtn = event.target.closest ? event.target.closest('.mm-sort') : null;
    if (sortBtn) {
      sortMode = sortBtn.getAttribute('data-sort') || 'index';
      renderTable();
      return;
    }
    var nameBtn = event.target.closest ? event.target.closest('.mm-name') : null;
    if (nameBtn) {
      var rowEl = nameBtn.closest('.mm-row');
      if (!rowEl) return;
      var slug = rowEl.getAttribute('data-slug');
      expandedSlug = expandedSlug === slug ? null : slug;
      renderTable();
    }
  }

  function mount() {
    if (document.getElementById('momentum')) return true;
    var board = document.getElementById('board');
    if (!board || !board.parentNode) return false;
    injectStyles();
    var section = document.createElement('section');
    section.id = 'momentum';
    section.setAttribute('aria-label', 'Momentum — fastest risers');
    section.innerHTML = sectionHtml();
    section.addEventListener('click', onSectionClick);
    board.parentNode.insertBefore(section, board.nextSibling);
    return true;
  }

  function waitForBoard(triesLeft) {
    var board = document.getElementById('board');
    if (board && board.children.length > 0) {
      mount();
      return;
    }
    if (triesLeft <= 0) {
      mount();
      return;
    }
    setTimeout(function () { waitForBoard(triesLeft - 1); }, POLL_MS);
  }

  function init() {
    prepared = prepare();
    if (!prepared) return;
    waitForBoard(POLL_TRIES);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
