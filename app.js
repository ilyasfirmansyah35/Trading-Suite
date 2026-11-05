// ═══════════════════════════════════════════════════════
//  Trading Suite — GitHub Pages PWA app.js
//  Communicates with Google Apps Script backend via fetch()
// ═══════════════════════════════════════════════════════

// ── CONFIG: paste your GAS Web App URL here ──
const GAS_URL = 'https://script.google.com/macros/s/AKfycbw_lOHkkAFyr5Dqe3ByxjkUUcumzDQLG8BrYU1MESCVgC_pf_IxMrsPKMewdCUWabvG2g/exec';

// ═══ API MODULE ═══
const API = {
    async call(action, data = {}) {
        const url = new URL(GAS_URL);
        url.searchParams.set('action', action);
        if (Object.keys(data).length) url.searchParams.set('data', JSON.stringify(data));
        const res = await fetch(url.toString(), { redirect: 'follow' });
        const text = await res.text();
        try { return JSON.parse(text); } catch { return { error: text }; }
    },
    getAccounts() { return this.call('getAccounts'); },
    addAccount(d) { return this.call('addAccount', d); },
    updateAccount(id, d) { return this.call('updateAccount', { id, data: d }); },
    deleteAccount(id) { return this.call('deleteAccount', { id }); },
    getTrades(accId, f) { return this.call('getTrades', { accountId: accId, filters: f || {} }); },
    addTrade(d) { return this.call('addTrade', d); },
    updateTrade(id, d) { return this.call('updateTrade', { id, data: d }); },
    deleteTrade(id) { return this.call('deleteTrade', { id }); },
    getSettings() { return this.call('getSettings'); },
    updateSettings(d) { return this.call('updateSettings', d); },
    getStats(accId, f) { return this.call('getStats', { accountId: accId, filters: f || {} }); },
    calculateLot(p) { return this.call('calculateLot', p); },
    getLiveRate() { return this.call('getLiveRate'); },
    saveCalc(d) { return this.call('saveCalc', d); },
    getCalcHistory(limit) { return this.call('getCalcHistory', { limit: limit || 15 }); },
};

// ═══ APP MODULE ═══
const App = {
    state: { currentAccountId: null, currentAccount: null, accounts: [], settings: {} },

    fmt(v, cur) {
        const n = parseFloat(v) || 0;
        const abs = Math.abs(n);
        const str = abs % 1 === 0 ? abs.toLocaleString('id-ID') : abs.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        if (cur === 'Cent') return (n < 0 ? '-' : '') + str + ' Cent';
        if (cur === 'USD') return (n < 0 ? '-$' : '$') + str;
        return (n < 0 ? '-' : '') + 'Rp ' + str;
    },

    fmtDate(str) {
        if (!str) return '';
        const d = new Date(str + 'T00:00');
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    today() {
        return new Date().toISOString().slice(0, 10);
    },

    toast(msg) {
        const el = document.getElementById('toastMsg');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(App._toastTimer);
        App._toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
    },

    openSheet(id) {
        document.getElementById(id)?.classList.add('open');
    },

    closeSheet(id) {
        document.getElementById(id)?.classList.remove('open');
    },

    confirmDelete(cb) {
        const btn = document.getElementById('confirmDeleteBtn');
        btn.onclick = async () => { this.closeSheet('deleteSheet'); await cb(); };
        this.openSheet('deleteSheet');
    },

    go(page) {
        ['dashboard', 'calculator', 'trades', 'settings'].forEach(p => {
            document.getElementById('page-' + p).classList.toggle('d-none', p !== page);
            document.getElementById('nav-' + p)?.classList.toggle('active', p === page);
        });
        if (page === 'dashboard') Dashboard.render();
        else if (page === 'trades') Trades.render();
        else if (page === 'calculator') Calculator.render();
        else if (page === 'settings') Settings.render();
    },

    setAccount(id) {
        this.state.currentAccountId = id;
        this.state.currentAccount = this.state.accounts.find(a => a.AccountID === id) || null;
        const acc = this.state.currentAccount;
        document.getElementById('topbarSub').textContent = acc ? acc.Name + ' · ' + acc.Currency : 'Pilih Akun';
        document.getElementById('btnAccPicker').title = acc ? acc.Name : 'Pilih Akun';
    },

    openAccountPicker() {
        const list = document.getElementById('accPickerList');
        if (!list) return;
        list.innerHTML = this.state.accounts.map(a => {
            const iconStr = (a.Icon && typeof a.Icon === 'string') ? a.Icon.trim() : 'bi-wallet2';
            const iconHtml = (iconStr.startsWith('data:') || iconStr.startsWith('http'))
                ? `<img src="${iconStr}" style="width:28px;height:28px;border-radius:7px;object-fit:cover"/>`
                : `<i class="bi ${iconStr}"></i>`;
            return `<div class="acc-pick-item ${a.AccountID === this.state.currentAccountId ? 'active' : ''}"
        onclick="App.selectAccount('${a.AccountID}')">
        <div class="acc-icon-box" style="width:36px;height:36px">${iconHtml}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px">${a.Name}</div>
          <div style="font-size:11px;color:var(--text2)">${a.Currency} · ${a.Status}</div>
        </div>
        ${a.AccountID === this.state.currentAccountId ? '<i class="bi bi-check-circle-fill t-gold"></i>' : ''}
      </div>`;
        }).join('');
        this.openSheet('accPickerSheet');
    },

    selectAccount(id) {
        this.setAccount(id);
        this.closeSheet('accPickerSheet');
        Dashboard.render();
        if (!document.getElementById('page-trades').classList.contains('d-none')) Trades.render();
    },

    async init() {
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { });

        try {
            const [accounts, settings] = await Promise.all([API.getAccounts(), API.getSettings()]);
            this.state.accounts = accounts || [];
            this.state.settings = settings || {};

            if (this.state.accounts.length > 0) {
                this.setAccount(this.state.accounts[0].AccountID);
            } else {
                document.getElementById('topbarSub').textContent = 'Buat akun di Pengaturan';
            }

            Calculator.fetchRate();
            Dashboard.render();

            // bind save buttons
            document.getElementById('saveTradeBtn').onclick = () => Trades.saveTrade();
            document.getElementById('tradePL').addEventListener('input', e => Trades.updatePreview(e.target.value));
            document.getElementById('tradeAccount').addEventListener('change', () => Trades.updateCurrencyLabel());

        } catch (e) {
            document.getElementById('topbarSub').textContent = 'Error: ' + e.message;
        }

        // Hide loading screen
        const ls = document.getElementById('loadingScreen');
        if (ls) ls.style.display = 'none';
    }
};

// ═══ DASHBOARD MODULE ═══
const Dashboard = {
    loadChartJS() {
        return new Promise(resolve => {
            if (typeof Chart !== 'undefined') { resolve(); return; }
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
            s.onload = resolve; s.onerror = resolve;
            document.head.appendChild(s);
        });
    },

    fmtMonth(str) {
        const m = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
        const [y, mo] = (str || '').split('-');
        return mo ? m[parseInt(mo) - 1] + " '" + (y || '').slice(2) : str;
    },

    fmtDay(str) {
        if (!str) return '';
        const d = new Date(str + 'T00:00');
        const m = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
        return d.getDate() + ' ' + m[d.getMonth()];
    },

    async render() {
        const el = document.getElementById('page-dashboard');
        el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:40px;gap:12px;color:var(--text3)">
      <div class="loader-gold"></div><span>Memuat dashboard…</span></div>`;

        if (!App.state.currentAccountId) {
            el.innerHTML = `<div class="empty-state fade-up">
        <div class="empty-state-icon"><i class="bi bi-person-slash"></i></div>
        <h3>Belum ada akun</h3>
        <p>Buat akun terlebih dahulu di menu <strong>Pengaturan</strong>.</p>
        <button class="gold-btn" style="width:auto;padding:12px 24px;margin:16px auto 0" onclick="App.go('settings')">
          <i class="bi bi-sliders me-1"></i> Buka Pengaturan</button></div>`;
            return;
        }
        try {
            const [stats] = await Promise.all([API.getStats(App.state.currentAccountId, {}), this.loadChartJS()]);
            this.build(stats, el);
        } catch (e) {
            el.innerHTML = `<div class="empty-state fade-up">
        <div class="empty-state-icon"><i class="bi bi-wifi-off"></i></div>
        <h3>Gagal memuat</h3><p><small style="color:var(--loss)">${e.message || e}</small></p>
        <button class="ghost-btn" style="margin:16px auto 0;width:auto;padding:10px 20px" onclick="Dashboard.render()">
          <i class="bi bi-arrow-clockwise me-1"></i> Coba Lagi</button></div>`;
        }
    },

    build(stats, el) {
        const s = stats.summary, d = stats.daily, c = stats.charts;
        const acc = App.state.currentAccount;
        const cur = acc ? acc.Currency : 'IDR';
        const fmt = v => App.fmt(v, cur);
        const np = s.netProfit;

        const dailySec = (d.dailyTarget > 0 || d.dailyLossLimit > 0) ? `
      <div class="daily-card ${d.targetReached ? 'target-glow' : ''} ${d.lossLimitReached ? 'loss-glow' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3)">Progres Hari Ini</div>
          <div style="font-family:var(--font-num);font-size:22px;font-weight:900" class="${d.todayProfit >= 0 ? 't-win' : 't-loss'}">${fmt(d.todayProfit)}</div>
        </div>
        ${d.dailyTarget > 0 ? `<div style="font-size:11px;color:var(--text3);margin-bottom:4px">Target: ${fmt(d.dailyTarget)} (${Math.round(d.targetProgress)}%)</div>
          <div class="progress-bar-wrap"><div class="progress-bar-fill win" style="width:${Math.min(d.targetProgress, 100)}%"></div></div>` : ''}
        ${d.dailyLossLimit > 0 ? `<div style="font-size:11px;color:var(--text3);margin-top:8px;margin-bottom:4px">Loss Limit: ${fmt(d.todayLossTotal)} / ${fmt(d.dailyLossLimit)}</div>
          <div class="progress-bar-wrap"><div class="progress-bar-fill loss" style="width:${Math.min((d.todayLossTotal / d.dailyLossLimit) * 100, 100)}%"></div></div>` : ''}
        <div style="display:flex;gap:14px;margin-top:10px;font-size:12px">
          <span class="t-win"><i class="bi bi-check-circle-fill me-1"></i>${d.todayWins} Win</span>
          <span class="t-loss"><i class="bi bi-x-circle-fill me-1"></i>${d.todayLosses} Loss</span>
        </div>
      </div>` : '';

        const hasChart = typeof Chart !== 'undefined';

        el.innerHTML = `<div class="fade-up">
      <div class="hero-card">
        <div class="hero-label">Saldo Saat Ini · ${acc ? acc.Name : ''}</div>
        <div class="hero-val ${np >= 0 ? 't-win' : 't-loss'}">${fmt(s.currentBalance)}</div>
        <div class="hero-sub">${np >= 0 ? '▲' : '▼'} ${fmt(Math.abs(np))} net P/L dari ${fmt(s.initialBalance)}</div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <span class="status-badge ${d.lossLimitReached ? 'loss-bg' : d.targetReached ? 'win-bg' : 'ok'}">
            <i class="bi bi-circle-fill" style="font-size:7px"></i> ${d.tradingStatus}</span>
          <span class="status-badge ok"><i class="bi bi-calendar3"></i> ${d.totalTrade} trade hari ini</span>
        </div>
      </div>
      ${dailySec}
      <div class="stat-grid">
        <div class="stat-item"><div class="stat-item-label">Win Rate</div><div class="stat-item-val t-win">${s.winRate}%<i class="bi bi-graph-up-arrow icon"></i></div></div>
        <div class="stat-item"><div class="stat-item-label">Total Trade</div><div class="stat-item-val">${s.totalTrade}<i class="bi bi-journal-bookmark icon"></i></div></div>
        <div class="stat-item"><div class="stat-item-label">Total Profit</div><div class="stat-item-val t-win">${fmt(s.totalProfit)}</div></div>
        <div class="stat-item"><div class="stat-item-label">Total Loss</div><div class="stat-item-val t-loss">${fmt(s.totalLoss)}</div></div>
        <div class="stat-item"><div class="stat-item-label">Best Trade</div><div class="stat-item-val t-win">${fmt(s.bestTrade)}</div></div>
        <div class="stat-item"><div class="stat-item-label">Worst Trade</div><div class="stat-item-val t-loss">${fmt(s.worstTrade)}</div></div>
        ${cur !== 'Cent' ? `
        <div class="stat-item"><div class="stat-item-label">Profit Factor</div><div class="stat-item-val t-gold">${s.profitFactor}x</div></div>
        <div class="stat-item"><div class="stat-item-label">Max Drawdown</div><div class="stat-item-val t-be">${fmt(s.drawdown)}</div></div>` : ''}
      </div>
      ${cur === 'Cent' ? (() => {
                const ratio = (App.state.settings.conversionRatio || '100000:555').split(':').map(Number);
                const rate = (ratio.length === 2 && ratio[1] > 0) ? ratio[0] / ratio[1] : 180;
                const netIDR = Math.round(s.netProfit * rate);
                const profIDR = Math.round(s.totalProfit * rate);
                const lossIDR = Math.round(s.totalLoss * rate);
                const sign = netIDR >= 0 ? '+' : '';
                return `<div class="idr-card">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--gold-d);margin-bottom:6px">
            <i class="bi bi-currency-exchange me-1"></i> Total Pendapatan dalam Rupiah</div>
          <div style="font-family:var(--font-num);font-size:30px;font-weight:900;letter-spacing:-1px;margin-bottom:4px" class="${netIDR >= 0 ? 't-win' : 't-loss'}">
            ${sign}Rp ${Math.abs(netIDR).toLocaleString('id-ID')}</div>
          <div style="font-size:11px;color:var(--text3);margin-bottom:14px">
            Konversi: ${s.netProfit >= 0 ? '+' : ''}${s.netProfit} Cent × Rp ${Math.round(rate).toLocaleString('id-ID')}/Cent</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.15);border-radius:10px;padding:10px 12px">
              <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:4px">Profit IDR</div>
              <div style="font-family:var(--font-num);font-size:15px;font-weight:800;color:var(--win)">Rp ${profIDR.toLocaleString('id-ID')}</div></div>
            <div style="background:rgba(244,63,94,.07);border:1px solid rgba(244,63,94,.15);border-radius:10px;padding:10px 12px">
              <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:4px">Loss IDR</div>
              <div style="font-family:var(--font-num);font-size:15px;font-weight:800;color:var(--loss)">Rp ${Math.abs(lossIDR).toLocaleString('id-ID')}</div></div>
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:10px;text-align:right">Rasio: ${App.state.settings.conversionRatio || '100000:555'}</div>
        </div>`;
            })() : ''}
      ${hasChart ? `
      <div class="chart-card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
          <div style="width:8px;height:8px;border-radius:50%;background:var(--gold);box-shadow:0 0 6px var(--gold)"></div>
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text3)">Equity Curve</span>
        </div>
        <canvas id="eqChart" height="130"></canvas>
      </div>
      <div class="chart-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:8px;height:8px;border-radius:50%;background:var(--gold);box-shadow:0 0 6px var(--gold)"></div>
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text3)">P/L per Bulan</span>
          </div>
          <span style="font-size:10px;color:var(--text3)">${c.monthly.labels.length} bulan</span>
        </div>
        <canvas id="mnChart" height="130"></canvas>
      </div>
      <div class="chart-card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
          <div style="width:8px;height:8px;border-radius:50%;background:var(--win);box-shadow:0 0 6px var(--win)"></div>
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text3)">Distribusi Hasil</span>
        </div>
        <div style="display:flex;align-items:center;gap:16px">
          <div style="flex:1"><canvas id="wlChart" width="150" height="150"></canvas></div>
          <div style="display:flex;flex-direction:column;gap:10px;min-width:100px">
            <div class="wl-legend-item" style="color:var(--win)"><div class="wl-dot" style="background:var(--win)"></div><span class="wl-label">Win</span><span class="wl-cnt">${c.winLoss.win}</span></div>
            <div class="wl-legend-item" style="color:var(--loss)"><div class="wl-dot" style="background:var(--loss)"></div><span class="wl-label">Loss</span><span class="wl-cnt">${c.winLoss.loss}</span></div>
            <div class="wl-legend-item" style="color:var(--be)"><div class="wl-dot" style="background:var(--be)"></div><span class="wl-label">BE</span><span class="wl-cnt">${c.winLoss.be}</span></div>
          </div>
        </div>
      </div>`: `<div class="card" style="text-align:center;padding:20px;color:var(--text3)">
        <i class="bi bi-bar-chart-line" style="font-size:28px;opacity:.3;display:block;margin-bottom:8px"></i>
        <div style="font-size:12px">Chart tidak tersedia</div></div>`}
    </div>`;

        if (hasChart) setTimeout(() => this.drawCharts(c), 150);
    },

    drawCharts(c) {
        ['eqChart', 'mnChart', 'wlChart'].forEach(id => { const i = Chart.getChart(id); if (i) i.destroy(); });
        const gr = 'rgba(255,255,255,.04)', tk = '#475569';
        const baseOpts = {
            responsive: true, maintainAspectRatio: true,
            plugins: {
                legend: { display: false }, tooltip: {
                    backgroundColor: 'rgba(14,20,34,.95)', borderColor: 'rgba(245,200,66,.2)', borderWidth: 1,
                    titleColor: '#94a3b8', bodyColor: '#f1f5f9', bodyFont: { family: "'Outfit',sans-serif", weight: '700', size: 14 }, padding: 12, cornerRadius: 10
                }
            },
            scales: {
                x: { grid: { color: gr, drawBorder: false }, ticks: { color: tk, font: { size: 10 }, maxTicksLimit: 7 } },
                y: { grid: { color: gr, drawBorder: false }, ticks: { color: tk, font: { size: 10 }, maxTicksLimit: 5 } }
            }
        };
        const eqLast = c.equity.data.length > 0 ? c.equity.data[c.equity.data.length - 1] : 0;
        const eqColor = eqLast >= 0 ? '#F5C842' : '#f43f5e', eqBg = eqLast >= 0 ? 'rgba(245,200,66,.06)' : 'rgba(244,63,94,.06)';
        new Chart(document.getElementById('eqChart'), {
            type: 'line', data: {
                labels: c.equity.labels.map(l => this.fmtDay(l)),
                datasets: [{
                    data: c.equity.data, fill: true, tension: 0.45, borderColor: eqColor, backgroundColor: eqBg,
                    borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: eqColor
                }]
            }, options: baseOpts
        });
        new Chart(document.getElementById('mnChart'), {
            type: 'bar', data: {
                labels: c.monthly.labels.map(l => this.fmtMonth(l)),
                datasets: [{
                    data: c.monthly.data,
                    backgroundColor: c.monthly.data.map(v => v >= 0 ? 'rgba(245,200,66,.65)' : 'rgba(244,63,94,.65)'),
                    borderColor: c.monthly.data.map(v => v >= 0 ? '#F5C842' : '#f43f5e'),
                    borderWidth: 1.5, borderRadius: 7, borderSkipped: false
                }]
            },
            options: { ...baseOpts, scales: { ...baseOpts.scales, x: { ...baseOpts.scales.x, ticks: { color: tk, font: { size: 11 } } } } }
        });
        const total = c.winLoss.win + c.winLoss.loss + c.winLoss.be;
        new Chart(document.getElementById('wlChart'), {
            type: 'doughnut', data: {
                labels: ['Win', 'Loss', 'BE'],
                datasets: [{
                    data: total > 0 ? [c.winLoss.win, c.winLoss.loss, c.winLoss.be] : [1, 0, 0],
                    backgroundColor: ['rgba(16,185,129,.8)', 'rgba(244,63,94,.8)', 'rgba(245,158,11,.8)'],
                    borderColor: ['#10b981', '#f43f5e', '#f59e0b'], borderWidth: 2, hoverOffset: 8, spacing: 2
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: true, cutout: '68%',
                plugins: {
                    legend: { display: false }, tooltip: {
                        backgroundColor: 'rgba(14,20,34,.95)', borderColor: 'rgba(245,200,66,.2)',
                        borderWidth: 1, titleColor: '#94a3b8', bodyColor: '#f1f5f9',
                        bodyFont: { family: "'Outfit',sans-serif", weight: '700', size: 14 }, padding: 12, cornerRadius: 10
                    }
                }
            }
        });
    }
};

// ═══ TRADES MODULE ═══
const Trades = {
    _trades: [],
    _filterMonth: '',
    _months: [
        { v: '', t: 'Semua Bulan' }, { v: '01', t: 'Januari' }, { v: '02', t: 'Februari' }, { v: '03', t: 'Maret' },
        { v: '04', t: 'April' }, { v: '05', t: 'Mei' }, { v: '06', t: 'Juni' }, { v: '07', t: 'Juli' },
        { v: '08', t: 'Agustus' }, { v: '09', t: 'September' }, { v: '10', t: 'Oktober' },
        { v: '11', t: 'November' }, { v: '12', t: 'Desember' }
    ],

    async render() {
        const el = document.getElementById('page-trades');
        el.innerHTML = `<div class="empty-state"><div class="loader-gold" style="margin:0 auto 14px"></div><p>Memuat riwayat...</p></div>`;
        if (!App.state.currentAccountId) {
            el.innerHTML = `<div class="empty-state fade-up"><div class="empty-state-icon"><i class="bi bi-person-slash"></i></div><h3>Belum ada akun</h3><p>Buat akun di Pengaturan.</p></div>`;
            return;
        }
        const trades = await API.getTrades(App.state.currentAccountId, { month: this._filterMonth });
        this._trades = trades;
        this.buildList(trades, el);
    },

    buildList(trades, el) {
        const acc = App.state.currentAccount;
        const cur = acc ? acc.Currency : 'IDR';
        const fmt = v => App.fmt(v, cur);
        const selLabel = this._months.find(m => m.v === this._filterMonth)?.t || 'Semua Bulan';
        el.innerHTML = `<div class="fade-up">
      <div class="section-title">Riwayat Trading</div>
      <div class="section-sub">Total <strong>${trades.length}</strong> trade${this._filterMonth ? ' · ' + selLabel : ''}</div>
      <button class="month-picker-btn ${this._filterMonth ? 'active' : ''}" onclick="Trades.openMonthPicker()">
        <i class="bi bi-calendar3 me-2" style="font-size:16px"></i>
        <span>${selLabel}</span>
        <i class="bi bi-chevron-down" style="margin-left:auto;font-size:14px;opacity:.6"></i>
      </button>
      ${trades.length === 0 ? `<div class="empty-state">
        <div class="empty-state-icon"><i class="bi bi-journal-x"></i></div>
        <h3>Belum ada trade</h3><p>Klik <strong>+</strong> di bawah untuk mencatat trade pertama.</p></div>`
                : trades.map(t => {
                    const cls = t.Result === 'Win' ? 'win' : t.Result === 'Loss' ? 'loss' : 'be';
                    return `<div class="trade-item">
          <div class="trade-pip ${cls}"></div>
          <div class="trade-info">
            <div class="trade-date">${App.fmtDate(t.Date)}</div>
            <div class="trade-method">${t.Entry || '—'}</div>
            ${t.PsychologyNotes ? `<div class="trade-note">${t.PsychologyNotes}</div>` : ''}
          </div>
          <div>
            <div class="trade-pl ${cls === 'win' ? 't-win' : cls === 'loss' ? 't-loss' : 't-be'}">${t.ProfitLoss > 0 ? '+' : ''}${fmt(t.ProfitLoss)}</div>
            <div style="display:flex;justify-content:flex-end;gap:5px;margin-top:6px">
              <button class="icon-micro" onclick="Trades.openEditModal('${t.TradeID}')"><i class="bi bi-pencil"></i></button>
              <button class="icon-micro" onclick="Trades.confirmDelete('${t.TradeID}')"><i class="bi bi-trash3"></i></button>
            </div>
          </div>
        </div>`;
                }).join('')}
    </div>`;
    },

    openMonthPicker() {
        const grid = document.getElementById('monthPickerGrid');
        if (!grid) return;
        grid.innerHTML = this._months.map(m => `
      <button class="month-grid-btn ${this._filterMonth === m.v ? 'active' : ''}" onclick="Trades.selectMonth('${m.v}')">
        ${m.t}</button>`).join('');
        App.openSheet('monthPickerSheet');
    },

    selectMonth(m) {
        this._filterMonth = m;
        App.closeSheet('monthPickerSheet');
        this.render();
    },

    openAddModal() {
        document.getElementById('tradeId').value = '';
        document.getElementById('tradeSheetTitle').innerHTML = '<i class="bi bi-journal-plus me-2"></i>Tambah Trade';
        document.getElementById('tradeForm').reset();
        document.getElementById('tradeDate').value = App.today();
        document.getElementById('tradeAccount').innerHTML = App.state.accounts.map(a =>
            `<option value="${a.AccountID}" ${a.AccountID === App.state.currentAccountId ? 'selected' : ''}>${a.Name} (${a.Currency})</option>`).join('');
        this.updateMethods();
        this.updateCurrencyLabel();
        document.getElementById('tradePreview').textContent = 'Masukkan nilai P/L';
        document.getElementById('tradePreview').className = 'trade-preview';
        App.openSheet('tradeSheet');
    },

    openEditModal(id) {
        const t = this._trades.find(t => t.TradeID === id); if (!t) return;
        document.getElementById('tradeId').value = id;
        document.getElementById('tradeSheetTitle').innerHTML = '<i class="bi bi-pencil me-2"></i>Edit Trade';
        document.getElementById('tradeDate').value = t.Date || App.today();
        document.getElementById('tradeAccount').innerHTML = App.state.accounts.map(a =>
            `<option value="${a.AccountID}" ${a.AccountID === t.AccountID ? 'selected' : ''}>${a.Name} (${a.Currency})</option>`).join('');
        this.updateMethods();
        document.getElementById('tradeEntry').value = t.Entry || '';
        document.getElementById('tradePL').value = t.ProfitLoss || '';
        document.getElementById('tradePsych').value = t.PsychologyNotes || '';
        this.updateCurrencyLabel();
        this.updatePreview(t.ProfitLoss);
        App.openSheet('tradeSheet');
    },

    updateMethods() {
        const methods = (App.state.settings.tradingMethods || 'Scalping,Swing,SMC,ICT,Price Action').split(',');
        document.getElementById('tradeEntry').innerHTML = '<option value="">-- Pilih Metode --</option>' +
            methods.map(m => `<option value="${m.trim()}">${m.trim()}</option>`).join('');
    },

    updateCurrencyLabel() {
        const accId = document.getElementById('tradeAccount')?.value;
        const acc = App.state.accounts.find(a => a.AccountID === accId);
        const lbl = document.getElementById('plSuffix');
        if (lbl) lbl.textContent = acc ? acc.Currency : 'IDR';
    },

    updatePreview(val) {
        const v = parseFloat(val), el = document.getElementById('tradePreview');
        if (!el) return;
        if (isNaN(v)) { el.textContent = 'Masukkan nilai P/L'; el.className = 'trade-preview'; return; }
        const r = v > 0 ? 'Win' : v < 0 ? 'Loss' : 'Break Even';
        el.textContent = `${r} — ${v > 0 ? '+' : ''}${v}`;
        el.className = `trade-preview ${v > 0 ? 'win' : v < 0 ? 'loss' : ''}`;
    },

    async saveTrade() {
        const btn = document.getElementById('saveTradeBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="loader-gold" style="display:inline-block;width:18px;height:18px;border-width:2px"></span>';
        const id = document.getElementById('tradeId').value;
        const pl = parseFloat(document.getElementById('tradePL').value);
        if (isNaN(pl)) { App.toast('Masukkan nilai P/L'); btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg me-2"></i>Simpan Trade'; return; }
        const data = {
            Date: document.getElementById('tradeDate').value,
            AccountID: document.getElementById('tradeAccount').value,
            Entry: document.getElementById('tradeEntry').value,
            ProfitLoss: pl,
            PsychologyNotes: document.getElementById('tradePsych').value
        };
        try {
            const res = id ? await API.updateTrade(id, data) : await API.addTrade(data);
            if (res.success) {
                App.closeSheet('tradeSheet');
                App.toast(id ? '✅ Trade diperbarui!' : (pl > 0 ? '✅ Trade WIN ditambahkan!' : '✅ Trade LOSS ditambahkan!'));
                await new Promise(r => setTimeout(r, 400));
                await Promise.all([this.render(), Dashboard.render()]);
            } else { App.toast('❌ ' + (res.error || 'Gagal menyimpan')); }
        } catch (e) { App.toast('❌ Error: ' + e.message); }
        btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg me-2"></i>Simpan Trade';
    },

    confirmDelete(id) {
        App.confirmDelete(async () => {
            const res = await API.deleteTrade(id);
            if (res.success) {
                App.toast('🗑️ Trade dihapus');
                await new Promise(r => setTimeout(r, 400));
                await Promise.all([this.render(), Dashboard.render()]);
            } else { App.toast('❌ ' + res.error); }
        });
    }
};

// ═══ CALCULATOR MODULE ═══
const Calculator = {
    _rate: 15800,
    _cur: 'IDR',
    _rMode: 'percent',

    async fetchRate() {
        const el = document.getElementById('ratePillText');
        if (el) el.textContent = 'Memuat...';
        try {
            const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
            if (!r.ok) throw new Error();
            const d = await r.json();
            this._rate = d.rates?.IDR || 15800;
        } catch {
            try {
                const r2 = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR');
                const d2 = await r2.json();
                this._rate = d2.rates?.IDR || 15800;
            } catch { this._rate = 15800; }
        }
        if (el) el.textContent = 'USD/IDR ' + Math.round(this._rate).toLocaleString('id-ID');
        const dot = document.querySelector('.rate-dot');
        if (dot) dot.style.background = 'var(--win)';
    },

    render() {
        const el = document.getElementById('page-calculator');
        el.innerHTML = `<div class="fade-up">
      <div class="section-title">Kalkulator Lot</div>
      <div class="section-sub">XAUUSD · Hitung ukuran lot optimal</div>

      <div class="card">
        <div class="card-title">Mata Uang Akun</div>
        <div class="currency-wrap">
          <button class="cur-btn ${this._cur === 'IDR' ? 'active' : ''}" onclick="Calculator.setCur('IDR')">🇮🇩 IDR</button>
          <button class="cur-btn ${this._cur === 'USD' ? 'active' : ''}" onclick="Calculator.setCur('USD')">🇺🇸 USD</button>
        </div>
        <div class="card-title" style="margin-top:4px">Mode Risiko</div>
        <div class="rmode-wrap">
          <button class="rmode-btn ${this._rMode === 'percent' ? 'active' : ''}" onclick="Calculator.setRMode('percent')">% Saldo</button>
          <button class="rmode-btn ${this._rMode === 'nominal' ? 'active' : ''}" onclick="Calculator.setRMode('nominal')">Nominal</button>
        </div>
        <div class="field-group" style="margin-bottom:12px">
          <label>Saldo Akun (${this._cur})</label>
          <input type="number" id="calBalance" class="field" placeholder="10000000" value=""/>
        </div>
        <div class="form-row-2">
          <div class="field-group">
            <label>${this._rMode === 'percent' ? 'Risiko (%)' : 'Risiko (' + this._cur + ')'}</label>
            <input type="number" id="calRisk" class="field" placeholder="${this._rMode === 'percent' ? '1' : '100000'}" step="0.01"/>
          </div>
          <div class="field-group">
            <label>Stop Loss (pips)</label>
            <input type="number" id="calSL" class="field" placeholder="50" step="1"/>
          </div>
        </div>
        <div class="quick-chips" id="quickChips">
          ${['0.5', '1', '1.5', '2', '3'].map(v => `<button class="quick-chip" onclick="Calculator.setQuick(${v})">${v}%</button>`).join('')}
        </div>
        <button class="gold-btn w-100 mt-3" onclick="Calculator.calculate()">
          <i class="bi bi-lightning-charge-fill me-2"></i>Hitung Lot
        </button>
      </div>

      <div id="calResult" style="display:none">
        <div class="lot-hero">
          <div class="lot-hero-label">Ukuran Lot Ideal</div>
          <div class="lot-big" id="calLotVal">0.01</div>
          <div class="lot-unit">LOT</div>
          <div class="lot-stats-row">
            <div class="lot-stat"><div class="lot-stat-label">Risk $</div><div class="lot-stat-val t-loss" id="calRiskUSD">$0</div></div>
            <div class="lot-stat"><div class="lot-stat-label">Risk ${this._cur}</div><div class="lot-stat-val t-loss" id="calRiskLocal">0</div></div>
            <div class="lot-stat"><div class="lot-stat-label">Pip Value</div><div class="lot-stat-val" id="calPipVal">$0</div></div>
            <div class="lot-stat"><div class="lot-stat-label">Kurs USD/IDR</div><div class="lot-stat-val t-gold" id="calRate">0</div></div>
          </div>
          <div class="risk-meter-wrap">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3)"><span>Risk Meter</span><span id="calRiskPct">0%</span></div>
            <div class="risk-meter-track"><div class="risk-meter-fill" id="calMeterFill" style="width:0%"></div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">R:R Simulasi</div>
          <div class="rr-grid" id="calRRGrid"></div>
        </div>
      </div>
    </div>`;
    },

    setCur(c) { this._cur = c; this.render(); },
    setRMode(m) { this._rMode = m; this.render(); },

    setQuick(v) {
        document.getElementById('calRisk').value = v;
        if (this._rMode !== 'percent') this.setRMode('percent');
        document.querySelectorAll('.quick-chip').forEach(el => el.classList.toggle('active', parseFloat(el.textContent) === v));
    },

    async calculate() {
        const balance = parseFloat(document.getElementById('calBalance').value);
        const risk = parseFloat(document.getElementById('calRisk').value);
        const sl = parseFloat(document.getElementById('calSL').value);
        if (!balance || !risk || !sl) { App.toast('Isi semua field terlebih dahulu'); return; }

        let riskUSD;
        if (this._rMode === 'percent') {
            const riskLocal = balance * (risk / 100);
            riskUSD = this._cur === 'IDR' ? riskLocal / this._rate : riskLocal;
        } else {
            riskUSD = this._cur === 'IDR' ? risk / this._rate : risk;
        }

        const pipValuePerLot = 10; // $10 per pip per standard lot for XAUUSD
        const lot = Math.floor((riskUSD / (sl * pipValuePerLot)) * 100) / 100;
        const lotFinal = Math.max(0.01, lot);
        const riskLocal = this._cur === 'IDR' ? riskUSD * this._rate : riskUSD;
        const riskPct = this._rMode === 'percent' ? risk : (riskLocal / balance * 100);

        document.getElementById('calResult').style.display = 'block';
        document.getElementById('calLotVal').textContent = lotFinal.toFixed(2);
        document.getElementById('calRiskUSD').textContent = '$' + riskUSD.toFixed(2);
        document.getElementById('calRiskLocal').textContent = this._cur === 'IDR'
            ? 'Rp ' + Math.round(riskLocal).toLocaleString('id-ID')
            : '$' + riskUSD.toFixed(2);
        document.getElementById('calPipVal').textContent = '$' + (lotFinal * pipValuePerLot).toFixed(2);
        document.getElementById('calRate').textContent = Math.round(this._rate).toLocaleString('id-ID');
        document.getElementById('calRiskPct').textContent = riskPct.toFixed(1) + '%';
        document.getElementById('calMeterFill').style.width = Math.min(riskPct / 5 * 100, 100) + '%';

        const rrGrid = document.getElementById('calRRGrid');
        rrGrid.innerHTML = [1, 1.5, 2, 2.5, 3, 4].map(rr => {
            const tpPips = sl * rr;
            const tpUSD = lotFinal * pipValuePerLot * tpPips / sl * sl;
            const tpLocal = this._cur === 'IDR' ? tpUSD * this._rate : tpUSD;
            return `<div class="rr-item">
        <div class="rr-ratio">1:${rr}</div>
        <div class="rr-val">${this._cur === 'IDR' ? 'Rp ' + Math.round(lotFinal * pipValuePerLot * tpPips).toLocaleString('id-ID') : '$' + (lotFinal * pipValuePerLot * tpPips).toFixed(2)}</div>
      </div>`;
        }).join('');
    }
};

// ═══ SETTINGS MODULE ═══
const Settings = {
    iconPresets: ['bi-wallet2', 'bi-briefcase-fill', 'bi-bank2', 'bi-cash-coin', 'bi-coin',
        'bi-currency-dollar', 'bi-graph-up-arrow', 'bi-bar-chart-line-fill', 'bi-star-fill',
        'bi-fire', 'bi-gem', 'bi-award-fill', 'bi-person-circle'],

    async render() {
        const el = document.getElementById('page-settings');
        el.innerHTML = `<div class="empty-state"><div class="loader-gold" style="margin:0 auto 14px"></div><p>Memuat pengaturan...</p></div>`;
        const [accounts, settings] = await Promise.all([API.getAccounts(), API.getSettings()]);
        App.state.accounts = accounts || [];
        App.state.settings = settings || {};
        this.build(el, accounts, settings);
    },

    build(el, accounts, settings) {
        const methods = settings.tradingMethods || 'Scalping,Swing,SMC,ICT,Price Action';
        el.innerHTML = `<div class="fade-up">
      <div class="section-title">Pengaturan</div>
      <div class="section-sub">Kelola akun, metode, dan preferensi aplikasi</div>
      <div class="card-title" style="margin-bottom:10px">Daftar Akun</div>
      ${accounts.length ? accounts.map(a => this.accCard(a)).join('') : `<div class="empty-state" style="padding:20px"><div class="empty-state-icon" style="font-size:32px"><i class="bi bi-people"></i></div><p>Belum ada akun</p></div>`}
      <button class="ghost-btn w-100" style="margin-bottom:20px" onclick="Settings.openAddAccount()"><i class="bi bi-plus-lg"></i> Tambah Akun Baru</button>
      <div class="divider"></div>
      <div class="settings-item">
        <div class="settings-label"><i class="bi bi-list-check me-2 t-gold"></i>Metode Trading</div>
        <div class="field-group"><label>Daftar Metode (pisahkan dengan koma)</label>
          <textarea id="tradingMethods" class="field" rows="3">${methods}</textarea></div>
        <button class="gold-btn" style="margin-top:12px" onclick="Settings.saveMethods()"><i class="bi bi-check-lg"></i> Simpan</button>
      </div>
      <div class="settings-item">
        <div class="settings-label"><i class="bi bi-arrow-left-right me-2 t-gold"></i>Konversi Cent → IDR</div>
        <div class="field-group"><label>Format IDR:Cent</label>
          <input type="text" id="convRatio" class="field" value="${settings.conversionRatio || '100000:555'}" placeholder="100000:555"/></div>
        <button class="gold-btn" style="margin-top:12px" onclick="Settings.saveConv()"><i class="bi bi-check-lg"></i> Simpan</button>
      </div>
      <div style="text-align:center;padding:20px 0 8px;font-size:11px;color:var(--text3)">
        Trading Suite v2.0 · Gold Edition<br/>⚠️ Trading emas mengandung risiko tinggi</div>
    </div>`;
    },

    accCard(a) {
        const iconStr = (a.Icon && typeof a.Icon === 'string') ? a.Icon.trim() : 'bi-wallet2';
        const iconHtml = (iconStr.startsWith('data:') || iconStr.startsWith('http'))
            ? `<img src="${iconStr}" style="width:28px;height:28px;border-radius:7px;object-fit:cover"/>`
            : `<i class="bi ${iconStr}"></i>`;
        return `<div class="acc-card">
      <div class="acc-icon-box">${iconHtml}</div>
      <div style="flex:1;min-width:0">
        <div class="acc-name">${a.Name}</div>
        <div class="acc-cur">${a.Currency} · ${a.Status}${a.DailyTargetPct > 0 ? ` · Target ${a.DailyTargetPct}%` : a.DailyTarget > 0 ? ` · Target ${App.fmt(a.DailyTarget, a.Currency)}` : ''}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="icon-micro" onclick="Settings.openEditAccount('${a.AccountID}')"><i class="bi bi-pencil"></i></button>
        <button class="icon-micro" style="color:var(--loss)" onclick="Settings.deleteAcc('${a.AccountID}')"><i class="bi bi-trash3"></i></button>
      </div>
    </div>`;
    },

    openAddAccount() {
        document.getElementById('accountId').value = '';
        document.getElementById('accSheetTitle').innerHTML = '<i class="bi bi-person-plus me-2"></i>Tambah Akun';
        document.getElementById('accountForm').reset();
        document.getElementById('accountIcon').value = 'bi-wallet2';
        document.getElementById('accIconPreviewBox').innerHTML = '<i class="bi bi-wallet2"></i>';
        this.renderPresets('');
        document.getElementById('saveAccountBtn').onclick = () => this.saveAccount();
        App.openSheet('accountSheet');
    },

    openEditAccount(id) {
        const a = App.state.accounts.find(a => a.AccountID === id); if (!a) return;
        document.getElementById('accountId').value = id;
        document.getElementById('accSheetTitle').innerHTML = '<i class="bi bi-pencil me-2"></i>Edit Akun';
        document.getElementById('accountName').value = a.Name;
        document.getElementById('accountCurrency').value = a.Currency;
        document.getElementById('accountStatus').value = a.Status;
        document.getElementById('accountTarget').value = a.DailyTarget;
        document.getElementById('accountTargetPct').value = a.DailyTargetPct || 0;
        document.getElementById('accountLossLimit').value = a.DailyLossLimit;
        document.getElementById('accountBalance').value = a.InitialBalance;
        const iv = (a.Icon && typeof a.Icon === 'string') ? a.Icon.trim() : 'bi-wallet2';
        document.getElementById('accountIcon').value = iv;
        this.updatePreview(iv);
        this.renderPresets(iv);
        document.getElementById('saveAccountBtn').onclick = () => this.saveAccount();
        App.openSheet('accountSheet');
    },

    renderPresets(current) {
        document.getElementById('iconPresets').innerHTML = this.iconPresets.map(ic =>
            `<button type="button" class="icon-preset-btn ${current === ic ? 'active' : ''}" onclick="Settings.setPreset('${ic}')">
        <i class="bi ${ic}"></i></button>`).join('');
    },

    setPreset(icon) {
        document.getElementById('accountIconFile').value = '';
        document.getElementById('accountIcon').value = icon;
        this.updatePreview(icon);
        this.renderPresets(icon);
    },

    updatePreview(str) {
        const p = document.getElementById('accIconPreviewBox');
        if (!str || !str.trim()) { p.innerHTML = '<i class="bi bi-wallet2"></i>'; return; }
        if (str.startsWith('data:') || str.startsWith('http')) p.innerHTML = `<img src="${str}" style="width:38px;height:38px;border-radius:9px;object-fit:cover"/>`;
        else p.innerHTML = `<i class="bi ${str.trim()}" style="font-size:22px"></i>`;
    },

    handleIconUpload(event) {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = e => { document.getElementById('accountIcon').value = e.target.result; this.updatePreview(e.target.result); };
        reader.readAsDataURL(file);
    },

    async saveAccount() {
        const btn = document.getElementById('saveAccountBtn');
        btn.disabled = true; btn.innerHTML = '<span class="loader-gold" style="width:18px;height:18px;border-width:2px"></span>';
        const id = document.getElementById('accountId').value;
        const data = {
            Name: document.getElementById('accountName').value,
            Currency: document.getElementById('accountCurrency').value,
            Status: document.getElementById('accountStatus').value,
            DailyTarget: parseFloat(document.getElementById('accountTarget').value) || 0,
            DailyTargetPct: parseFloat(document.getElementById('accountTargetPct').value) || 0,
            DailyLossLimit: parseFloat(document.getElementById('accountLossLimit').value) || 0,
            InitialBalance: parseFloat(document.getElementById('accountBalance').value) || 0,
            Icon: document.getElementById('accountIcon').value || 'bi-wallet2'
        };
        if (!data.Name) { App.toast('Nama akun wajib diisi'); btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg me-2"></i>Simpan Akun'; return; }
        try {
            const res = id ? await API.updateAccount(id, data) : await API.addAccount(data);
            if (res.success) {
                App.toast(id ? '✅ Akun diperbarui!' : '✅ Akun ditambahkan!');
                App.closeSheet('accountSheet');
                const accs = await API.getAccounts();
                App.state.accounts = accs;
                if (!App.state.currentAccountId && accs.length > 0) App.setAccount(accs[0].AccountID);
                await this.render();
            } else App.toast('❌ ' + (res.error || 'Gagal'));
        } catch (e) { App.toast('❌ Error'); }
        btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg me-2"></i>Simpan Akun';
    },

    deleteAcc(id) {
        App.confirmDelete(async () => {
            const res = await API.deleteAccount(id);
            if (res.success) { App.toast('🗑️ Akun dihapus'); App.state.accounts = await API.getAccounts(); await this.render(); }
            else App.toast('❌ ' + res.error);
        });
    },

    async saveMethods() {
        await API.updateSettings({ tradingMethods: document.getElementById('tradingMethods').value.trim() });
        App.state.settings.tradingMethods = document.getElementById('tradingMethods').value.trim();
        App.toast('✅ Metode disimpan!');
    },

    async saveConv() {
        await API.updateSettings({ conversionRatio: document.getElementById('convRatio').value.trim() });
        App.state.settings.conversionRatio = document.getElementById('convRatio').value.trim();
        App.toast('✅ Pengaturan disimpan!');
    }
};

// ── INIT ──
window.addEventListener('DOMContentLoaded', () => App.init());
