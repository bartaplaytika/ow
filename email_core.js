/* email_core.js — the status/email logic shared by the Tracker page (browser) and build_email.js (node).
   Pure functions over the dash_data.json document `D` and an options object {win, q, fs, fw}.
   THE BROWSER RESOLVES TIME: everything here derives Added/Remains/Removed/Not Found against the chosen window.
   statusOf() mirrors status_of() in build_dashboard_data.py — change both together. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.EC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = v => '$' + Math.round(+v || 0).toLocaleString('en-US');           // whole dollars everywhere
  const longDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const pubName = (D, p) => (D.publisher_display && D.publisher_display[p]) || p;
  const C = D => D.colors;

  function statusOf(now, before, hasPrev) { if (!hasPrev) return now ? 'Added' : 'Not Found'; if (now) return before ? 'Remains' : 'Added'; return before ? 'Removed' : 'Not Found'; }
  function earliestDate(D) { return D.sites.map(s => D.dates[s][0]).filter(Boolean).sort()[0]; }
  function chosenDate(D, win) { const d = new Date(D.check_date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (+win)); const iso = d.toISOString().slice(0, 10); const e = earliestDate(D); return { date: iso < e ? e : iso, clamped: iso < e }; }
  function baselineDate(D, site, chosen) { const ds = D.dates[site] || []; const latest = ds[ds.length - 1]; let b = null; for (const d of ds) { if (d <= chosen && d < latest) b = d; } return b; }
  function pres(D, site, date, keys) { const day = date && D.presence[site] && D.presence[site][date]; if (!day) return null; let best = null; for (const k of keys) { const r = day[k]; if (r && (!best || r[0] > best[0])) best = r; } return best; }
  function cellOf(D, o, site, keys) {
    const latest = D.latest[site]; const { date: chosen } = chosenDate(D, o.win); const base = baselineDate(D, site, chosen);
    const now = pres(D, site, latest, keys), before = base ? pres(D, site, base, keys) : null;
    const c = { st: statusOf(!!now, !!before, !!base), now, before, base, dReward: null, dTasks: null };
    if (now && before) { if (Math.abs(now[0] - before[0]) >= 0.01) c.dReward = now[0] - before[0]; if (now[1] !== before[1]) c.dTasks = now[1] - before[1]; }
    return c;
  }
  const link = (D, o, params) => { const base = o.baseUrl || ''; const q = Object.entries(params).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&'); return base + 'index.html?' + q; };
  function cellHtml(D, o, site, keys, clickable) {
    const c = cellOf(D, o, site, keys), [bg, fg] = C(D)[c.st]; const forEmail = !clickable;
    let inner = '&nbsp;';
    if (c.now) {
      inner = `<b>${fmt(c.now[0])}</b> ${c.now[1] ? `(${c.now[1]} milestones)` : '<span style="color:#888">(milestones not captured)</span>'}`;
      const mv = [];
      if (c.dReward != null) mv.push(`<span style="color:${c.dReward > 0 ? C(D).up : C(D).down}">${c.dReward > 0 ? '▲' : '▼'} ${fmt(Math.abs(c.dReward))}</span>`);
      if (c.dTasks != null) mv.push(`<span style="color:${c.dTasks > 0 ? C(D).up : C(D).down}">${c.dTasks > 0 ? '▲' : '▼'} ${Math.abs(c.dTasks)} milestones</span>`);
      if (mv.length) inner += forEmail ? `<br><span style="font-size:12px">${mv.join(' · ')}</span>` : `<span class="mv" style="display:block;font-size:12px;margin-top:2px">${mv.join(' · ')}</span>`;
      if (forEmail && o.baseUrl) inner = `<a href="${link(D, o, { wall: site, game: keys[0], win: o.win })}" style="color:${fg};text-decoration:none">${inner}</a>`;
    }
    return `<td class="st" style="background:${bg};color:${fg};text-align:center" data-st="${c.st}" ${clickable ? `data-wall="${site}" data-keys="${esc(keys.join('||'))}"` : ''}>${inner}</td>`;
  }
  function legendHtml(D) { return Object.entries(C(D)).filter(([k]) => !['up', 'down'].includes(k)).map(([k, [bg]]) => `<span><i style="background:${bg}"></i>${k}</span>`).join('') + `<span style="margin-left:6px">▲ / ▼ change vs last check</span>`; }

  function rowMatches(D, o, row) {
    const txt = (row.genre + ' ' + row.game + ' ' + row.publisher).toLowerCase();
    if (o.q && !txt.includes(o.q.toLowerCase())) return false;
    if (o.fs || o.fw) { const walls = o.fw ? [o.fw] : D.sites; const sts = walls.map(w => cellOf(D, o, w, row.keys).st); if (o.fs && !sts.includes(o.fs)) return false; if (!o.fs && o.fw && !['Added', 'Remains', 'Removed'].includes(sts[0])) return false; }
    return true;
  }
  function matrixRows(D, o, rows, forEmail) {
    let html = '', i = 0;
    while (i < rows.length) {
      let j = i; while (j < rows.length && rows[j].genre === rows[i].genre) j++;
      for (let k = i; k < j; k++) {
        const r = rows[k];
        const name = forEmail ? (r.keys.length && o.baseUrl ? `<a href="${link(D, o, { game: r.keys[0], win: o.win })}" style="color:#1f4e79;font-weight:bold;text-decoration:none">${esc(r.game)}</a>` : `<b>${esc(r.game)}</b>`)
          : `<span class="gname" data-keys="${esc(r.keys.join('||'))}">${esc(r.game)}</span>${r.loose ? ` <span class="loose" title="Matched as ${esc(D.games[r.keys[0]]?.name || '')}">≈</span>` : ''}`;
        const pub = r.publisher ? (forEmail && o.baseUrl ? `<a href="${link(D, o, { tab: 'pub', q: r.publisher, win: o.win })}" style="color:#1f1f1f;text-decoration:none">${esc(pubName(D, r.publisher))}</a>` : esc(pubName(D, r.publisher))) : '<span style="color:#999">unattributed</span>';
        html += `<tr>${k === i ? `<td class="genre" rowspan="${j - i}"${forEmail ? ' style="background:#fafbfc;color:#555;vertical-align:top"' : ''}>${esc(r.genre)}</td>` : ''}<td>${name}</td><td>${pub}</td>${D.sites.map(s => cellHtml(D, o, s, r.keys, !forEmail)).join('')}</tr>`;
      }
      i = j;
    }
    return html;
  }
  function focusTable(D, o, forEmail) {
    const b1 = D.block1.filter(r => rowMatches(D, o, r)), b2 = D.block2.filter(r => rowMatches(D, o, r));
    const head = `<thead><tr><th>Genre</th><th>Game</th><th>Publisher</th>${D.sites.map(s => `<th style="text-align:center">${D.site_label[s]}</th>`).join('')}</tr></thead>`;
    const sep = b2.length ? `<tr class="sep"><td colspan="${3 + D.sites.length}"${forEmail ? ' style="background:#e9edf2;font-style:italic;font-weight:600"' : ''}>Other titles from publishers we track</td></tr>` : '';
    return head + '<tbody>' + matrixRows(D, o, b1, forEmail) + sep + matrixRows(D, o, b2, forEmail) + '</tbody>';
  }

  function pubStats(D, o) {
    const { date: chosen } = chosenDate(D, o.win); const byPub = {};
    const gamesOf = (site, date) => (date && D.presence[site] && D.presence[site][date]) || {};
    for (const site of D.sites) {
      const now = gamesOf(site, D.latest[site]); const base = baselineDate(D, site, chosen); const before = base ? gamesOf(site, base) : null;
      for (const [gk, row] of Object.entries(now)) {
        const g = D.games[gk]; if (!g || !g.publisher) continue;
        const p = byPub[g.publisher] || (byPub[g.publisher] = { pub: g.publisher, sites: {}, titles: new Set(), total: 0, best: null });
        const ps = p.sites[site] || (p.sites[site] = { n: 0, sum: 0, dn: null }); ps.n++; ps.sum += row[0]; p.titles.add(gk); p.total += row[0];
        if (!p.best || row[0] > p.best.usd) p.best = { name: g.name, usd: row[0], site };
      }
      if (before) {
        const cnt = {}; for (const gk of Object.keys(before)) { const g = D.games[gk]; if (g && g.publisher) cnt[g.publisher] = (cnt[g.publisher] || 0) + 1; }
        for (const p of Object.values(byPub)) { const ps = p.sites[site]; const b = cnt[p.pub] || 0; if (ps) ps.dn = ps.n - b; else if (b) p.sites[site] = { n: 0, sum: 0, dn: -b }; }
        for (const [pub, b] of Object.entries(cnt)) if (!byPub[pub]) byPub[pub] = { pub, sites: { [site]: { n: 0, sum: 0, dn: -b } }, titles: new Set(), total: 0, best: null };
      }
    }
    return byPub;
  }
  function pubTable(D, o, forEmail) {
    const stats = pubStats(D, o); const order = new Map(D.publishers.map((p, i) => [p.publisher, i])); const focus = new Set(D.publishers.filter(p => p.focus).map(p => p.publisher));
    const rows = Object.values(stats).filter(p => p.titles.size || Object.values(p.sites).some(s => s.dn));
    const f = rows.filter(p => focus.has(p.pub)).sort((a, b) => order.get(a.pub) - order.get(b.pub));
    const oth = rows.filter(p => !focus.has(p.pub)).sort((a, b) => (b.titles.size - a.titles.size) || (b.total - a.total) || a.pub.localeCompare(b.pub));
    const cell = ps => { if (!ps || (!ps.n && !ps.dn)) return `<td style="text-align:center;color:#999">—</td>`; let h = `<b>${ps.n}</b> ${ps.n === 1 ? 'title' : 'titles'}<br><span style="color:#555">${fmt(ps.sum)}</span>`; if (ps.dn) h += `<br><span style="color:${ps.dn > 0 ? C(D).up : C(D).down};font-size:12px">${ps.dn > 0 ? '▲' : '▼'} ${Math.abs(ps.dn)} since last check</span>`; return `<td style="text-align:center">${h}</td>`; };
    const row = p => `<tr><td><b>${forEmail && o.baseUrl ? `<a href="${link(D, o, { tab: 'pub', q: p.pub, win: o.win })}" style="color:#1f4e79;text-decoration:none">${esc(pubName(D, p.pub))}</a>` : esc(pubName(D, p.pub))}</b></td><td class="num" style="text-align:right">${p.titles.size}</td>${D.sites.map(s => cell(p.sites[s])).join('')}<td class="num" style="text-align:right">${fmt(p.total)}</td><td>${p.best ? `${esc(p.best.name)} <span style="color:#777">(${fmt(p.best.usd)} · ${D.site_label[p.best.site]})</span>` : '—'}</td></tr>`;
    const head = `<thead><tr><th>Publisher</th><th style="text-align:right">Titles</th>${D.sites.map(s => `<th style="text-align:center">${D.site_label[s]}</th>`).join('')}<th style="text-align:right">Total reward</th><th>Highest-paying title</th></tr></thead>`;
    const sep = oth.length ? `<tr class="sep"><td colspan="${5 + D.sites.length}"${forEmail ? ' style="background:#e9edf2;font-style:italic;font-weight:600"' : ''}>Other publishers on these walls</td></tr>` : '';
    return head + '<tbody>' + f.map(row).join('') + sep + oth.map(row).join('') + '</tbody>';
  }

  const ADDED = `<span style="color:#137333;font-weight:600">added</span>`, REMOVED = `<span style="color:#c5221f;font-weight:600">removed</span>`;
  const bigMove = (D, c) => c.dReward != null && c.before && c.before[0] > 0 && Math.abs(c.dReward) / c.before[0] > (D.reward_move_pct ?? 0.10);
  const gameLink = (D, o, r) => (o.baseUrl && r.keys && r.keys.length) ? `<a href="${link(D, o, { game: r.keys[0], win: o.win })}" style="color:#1f4e79;text-decoration:none">${esc(r.game)}</a>` : esc(r.game);
  function findings(D, o) {
    const out = []; const focusPubs = D.publishers.filter(p => p.focus).map(p => p.publisher);
    const rows = [...D.block1, ...D.block2.map(b => ({ ...b, block2: true }))];
    for (const pub of focusPubs) {
      const items = []; const pn = esc(pubName(D, pub));
      for (const r of rows) {
        if ((r.publisher || '') !== pub) continue; const cells = D.sites.map(s => ({ s, c: cellOf(D, o, s, r.keys) }));
        const added = cells.filter(x => x.c.st === 'Added').map(x => D.site_label[x.s]); const listed = cells.some(x => x.c.now);
        if (added.length) items.push({ o: 0, t: `${gameLink(D, o, r)} (${pn}) — newly ${ADDED} on ${added.join(', ')}` });
        else if (r.block2 && listed) items.push({ o: 1, t: `${gameLink(D, o, r)} (${pn})` });
        for (const x of cells) if (x.c.st === 'Remains' && (bigMove(D, x.c) || x.c.dTasks != null)) {
          const parts = [];
          if (bigMove(D, x.c)) parts.push(`reward ${fmt(x.c.before[0])} → ${fmt(x.c.now[0])} (${x.c.dReward > 0 ? '+' : '−'}${Math.round(Math.abs(x.c.dReward) / x.c.before[0] * 100)}%)`);
          if (x.c.dTasks != null) parts.push(`milestones ${x.c.before[1]} → ${x.c.now[1]}`);
          items.push({ o: 2, t: `${gameLink(D, o, r)} (${pn}) on ${D.site_label[x.s]} — ${parts.join(', ')}` });
        }
      }
      items.sort((a, b) => a.o - b.o); out.push(...items.map(i => i.t));
    }
    return out;
  }
  function buildEmail(D, o) {
    const { date: chosen } = chosenDate(D, o.win); const F = 'font-family:Calibri,Arial,sans-serif;font-size:14px;color:#1f1f1f';
    const own = Object.entries(D.games).filter(([, g]) => g.playtika).map(([gk, g]) => { const walls = D.sites.filter(s => pres(D, s, D.latest[s], [gk])).map(s => D.site_label[s]); return walls.length ? `${g.name} (${walls.join(', ')})` : null; }).filter(Boolean);
    const changes = [];
    for (const r of [...D.block1, ...D.block2]) {
      const a = [], rm = [];
      for (const s of D.sites) { const st = cellOf(D, o, s, r.keys).st; if (st === 'Added') a.push(D.site_label[s]); if (st === 'Removed') rm.push(D.site_label[s]); }
      if (a.length || rm.length) changes.push(`${gameLink(D, o, r)} — ${[a.length ? `${ADDED} on ${a.join(', ')}` : '', rm.length ? `${REMOVED} from ${rm.join(', ')}` : ''].filter(Boolean).join('; ')}`);
    }
    const nf = findings(D, o);
    const tbl = t => t.replace(/<table>/g, '<table border="0" cellspacing="0" cellpadding="0" width="100%" style="border-collapse:collapse;font-size:13px">').replace(/<th/g, '<th style="border:1px solid #cfcfcf;padding:5px 8px;background:#f0f3f6;text-align:left"').replace(/<td(?![^>]*style=)/g, '<td style="border:1px solid #cfcfcf;padding:5px 8px"').replace(/<td style="/g, '<td style="border:1px solid #cfcfcf;padding:5px 8px;');
    const legend = `<p style="${F};font-size:12px;margin:6px 0">${Object.entries(C(D)).filter(([k]) => !['up', 'down'].includes(k)).map(([k, [bg]]) => `<span style="color:${bg};font-size:16px;line-height:12px">&#9632;</span> ${k}&nbsp;&nbsp;&nbsp;`).join('')} ▲ / ▼ change vs last check</p>`;
    const ul = a => a.length ? `<ul style="margin:4px 0 10px 20px;padding:0">${a.map(x => `<li style="margin:2px 0">${x}</li>`).join('')}</ul>` : `<p style="margin:4px 0 10px 20px;color:#666">none</p>`;
    const base = o.baseUrl || '';
    // "bulletproof" button: a table cell with a background colour and a padded link renders in every Outlook
    const button = (label, href) => `<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;display:inline-table;margin:4px 8px 4px 0"><tr><td bgcolor="#1f4e79" style="border-radius:4px;padding:8px 16px"><a href="${href}" style="${F};color:#ffffff;text-decoration:none;font-weight:bold;display:inline-block">${label}</a></td></tr></table>`;
    const buttons = base ? `<p style="margin:12px 0">${button('Open the dashboard', base + 'index.html?win=' + o.win)}${button('By publisher', base + 'index.html?tab=pub&win=' + o.win)}${button('Full catalog', base + 'index.html?tab=cat')}${button('Harvest status', base + 'status.html')}</p>` : '';
    const hint = base ? `<p style="font-size:12px;color:#666">Tip: every game name and every coloured cell below is a link — click a cell for that wall's milestone ladder, or a game for all walls side by side.</p>` : '';
    const body = `<table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="border-collapse:collapse"><tr><td style="${F};padding:0">
<p>Hello everyone,</p><p>Please find below the latest check regarding Playtika competitors in the offerwalls ${D.sites.map(s => D.site_label[s]).join(', ')}. This check covers what changed since ${chosen}.</p>
${buttons}<p><b>Notable Findings:</b></p>${ul(nf)}<p>Our own titles currently listed: ${own.length ? esc(own.join('; ')) : 'none'}</p><p>Changes since ${chosen}:</p>${ul(changes)}
<p><b>Direct Top Competitors Status:</b></p>${legend}${hint}<table>${focusTable(D, { ...o, q: '', fs: '', fw: '' }, true)}</table>
<p style="margin-top:14px"><b>Where Each Competitor Stands:</b></p><table>${pubTable(D, o, true)}</table>
${base ? `<p style="font-size:12px;color:#666">Live dashboard: <a href="${base}index.html" style="color:#1f4e79">${base}index.html</a> · this email was generated automatically from the ${D.check_date} check.</p>` : ''}<p>Thanks,</p></td></tr></table>`;
    return { subject: `Competitors Status in Popular Offerwalls (${longDate(D.check_date)})`, html: tbl(body), since: chosen, check_date: D.check_date, findings: nf.length, changes: changes.length };
  }
  function emailText(html) { return html.replace(/<\/(tr|p|li|div)>/g, '\n').replace(/<\/(td|th)>/g, '\t').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\n{3,}/g, '\n\n').trim(); }

  return { esc, fmt, longDate, pubName, statusOf, chosenDate, baselineDate, pres, cellOf, cellHtml, legendHtml, rowMatches, focusTable, pubStats, pubTable, findings, buildEmail, emailText };
});
