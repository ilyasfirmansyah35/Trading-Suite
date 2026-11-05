// ═══ Trading Suite — Pure localStorage PWA ═══
// No GAS URL. All data saved locally on device.

// ═══ DATABASE (localStorage) ═══
const DB = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },

  getAccounts() { return this.get('ts_accounts'); },
  savAccounts(a) { this.set('ts_accounts', a); },
  getTrades() { return this.get('ts_trades'); },
  savTrades(t) { this.set('ts_trades', t); },
  getSettings() { try { return JSON.parse(localStorage.getItem('ts_settings')) || {}; } catch { return {}; } },
  savSettings(s) { this.set('ts_settings', s); },
};

// ═══ API (same interface — backed by localStorage) ═══
const API = {
  // Accounts
  getAccounts() { return Promise.resolve(DB.getAccounts()); },
  addAccount(d) {
    const accs = DB.getAccounts();
    const a = { ...d, AccountID: DB.uid() };
    accs.push(a); DB.savAccounts(accs);
    return Promise.resolve({ success: true, id: a.AccountID });
  },
  updateAccount(id, d) {
    const accs = DB.getAccounts().map(a => a.AccountID === id ? { ...a, ...d } : a);
    DB.savAccounts(accs);
    return Promise.resolve({ success: true });
  },
  deleteAccount(id) {
    DB.savAccounts(DB.getAccounts().filter(a => a.AccountID !== id));
    DB.savTrades(DB.getTrades().filter(t => t.AccountID !== id));
    return Promise.resolve({ success: true });
  },

  // Trades
  getTrades(accId, filters = {}) {
    let trades = DB.getTrades().filter(t => t.AccountID === accId);
    if (filters.month) trades = trades.filter(t => (t.Date || '').slice(5, 7) === filters.month);
    trades.sort((a, b) => b.Date.localeCompare(a.Date));
    return Promise.resolve(trades);
  },
  addTrade(d) {
    const trades = DB.getTrades();
    const pl = parseFloat(d.ProfitLoss) || 0;
    const t = { ...d, TradeID: DB.uid(), Result: pl > 0 ? 'Win' : pl < 0 ? 'Loss' : 'BE' };
    trades.push(t); DB.savTrades(trades);
    return Promise.resolve({ success: true });
  },
  updateTrade(id, d) {
    const pl = parseFloat(d.ProfitLoss) || 0;
    const trades = DB.getTrades().map(t => t.TradeID === id ? { ...t, ...d, Result: pl > 0 ? 'Win' : pl < 0 ? 'Loss' : 'BE' } : t);
    DB.savTrades(trades);
    return Promise.resolve({ success: true });
  },
  deleteTrade(id) {
    DB.savTrades(DB.getTrades().filter(t => t.TradeID !== id));
    return Promise.resolve({ success: true });
  },

  // Settings
  getSettings() { return Promise.resolve(DB.getSettings()); },
  updateSettings(d) { DB.savSettings({ ...DB.getSettings(), ...d }); return Promise.resolve({ success: true }); },

  // Stats — calculated locally
  getStats(accId) {
    const acc = DB.getAccounts().find(a => a.AccountID === accId) || {};
    const all = DB.getTrades().filter(t => t.AccountID === accId);
    const today = new Date().toISOString().slice(0, 10);

    // Summary
    const wins = all.filter(t => t.Result === 'Win');
    const losses = all.filter(t => t.Result === 'Loss');
    const totalProfit = wins.reduce((s, t) => s + (parseFloat(t.ProfitLoss) || 0), 0);
    const totalLoss = Math.abs(losses.reduce((s, t) => s + (parseFloat(t.ProfitLoss) || 0), 0));
    const netProfit = all.reduce((s, t) => s + (parseFloat(t.ProfitLoss) || 0), 0);
    const init = parseFloat(acc.InitialBalance) || 0;
    const pls = all.map(t => parseFloat(t.ProfitLoss) || 0);
    const bestTrade = pls.length ? Math.max(...pls) : 0;
    const worstTrade = pls.length ? Math.min(...pls) : 0;
    const pf = totalLoss > 0 ? (totalProfit / totalLoss).toFixed(2) : totalProfit > 0 ? '∞' : '0';

    // Drawdown
    let peak = init, maxDD = 0, bal = init;
    all.slice().sort((a, b) => a.Date.localeCompare(b.Date)).forEach(t => {
      bal += parseFloat(t.ProfitLoss) || 0;
      if (bal > peak) peak = bal;
      const dd = peak - bal;
      if (dd > maxDD) maxDD = dd;
    });

    // Daily
    const todayTrades = all.filter(t => t.Date === today);
    const todayProfit = todayTrades.reduce((s, t) => s + (parseFloat(t.ProfitLoss) || 0), 0);
    const todayWins = todayTrades.filter(t => t.Result === 'Win').length;
    const todayLosses = todayTrades.filter(t => t.Result === 'Loss').length;
    const todayLossTotal = Math.abs(todayTrades.filter(t => t.Result === 'Loss').reduce((s, t) => s + (parseFloat(t.ProfitLoss) || 0), 0));

    let dailyTarget = parseFloat(acc.DailyTarget) || 0;
    const pct = parseFloat(acc.DailyTargetPct) || 0;
    if (pct > 0) dailyTarget = (init + netProfit - todayProfit) * pct / 100;
    const dailyLossLimit = parseFloat(acc.DailyLossLimit) || 0;
    const targetProgress = dailyTarget > 0 ? Math.min((todayProfit / dailyTarget) * 100, 100) : 0;
    const targetReached = dailyTarget > 0 && todayProfit >= dailyTarget;
    const lossLimitReached = dailyLossLimit > 0 && todayLossTotal >= dailyLossLimit;
    let tradingStatus = 'Trading Berjalan';
    if (lossLimitReached) tradingStatus = '⛔ Loss Limit Tercapai';
    else if (targetReached) tradingStatus = '🎯 Target Tercapai!';

    // Charts — equity
    const sorted = all.slice().sort((a, b) => a.Date.localeCompare(b.Date));
    const eqMap = {};
    let running = init;
    sorted.forEach(t => {
      running += parseFloat(t.ProfitLoss) || 0;
      eqMap[t.Date] = running - init;
    });
    const eqLabels = Object.keys(eqMap);
    const eqData = Object.values(eqMap);

    // Monthly
    const mnMap = {};
    sorted.forEach(t => {
      const key = (t.Date || '').slice(0, 7);
      if (key) mnMap[key] = (mnMap[key] || 0) + (parseFloat(t.ProfitLoss) || 0);
    });

    return Promise.resolve({
      summary: {
        winRate: all.length > 0 ? ((wins.length / all.length) * 100).toFixed(1) : 0,
        totalTrade: all.length, totalProfit, totalLoss: -totalLoss,
        netProfit, currentBalance: init + netProfit, initialBalance: init,
        bestTrade, worstTrade, profitFactor: pf, drawdown: -maxDD
      },
      daily: {
        todayProfit, todayWins, todayLosses, totalTrade: todayTrades.length,
        dailyTarget, dailyLossLimit, targetProgress, targetReached, lossLimitReached,
        todayLossTotal, tradingStatus
      },
      charts: {
        equity: { labels: eqLabels, data: eqData },
        monthly: { labels: Object.keys(mnMap), data: Object.values(mnMap) },
        winLoss: { win: wins.length, loss: losses.length, be: all.filter(t => t.Result === 'BE').length }
      }
    });
  },

  // Exchange rate — free public API, no GAS
  async getLiveRate() {
    try {
      const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const d = await r.json();
      return { rate: d.rates?.IDR || 15800 };
    } catch {
      try {
        const r2 = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR');
        const d2 = await r2.json();
        return { rate: d2.rates?.IDR || 15800 };
      } catch { return { rate: 15800 }; }
    }
  },

  calculateLot(p) {
    const { balance, riskMode, risk, sl, currency, rate } = p;
    const r = parseFloat(rate) || 15800;
    let riskUSD = riskMode === 'percent'
      ? (parseFloat(balance) * parseFloat(risk) / 100) / (currency === 'IDR' ? r : 1)
      : parseFloat(risk) / (currency === 'IDR' ? r : 1);
    const lot = Math.max(0.01, Math.floor((riskUSD / (parseFloat(sl) * 10)) * 100) / 100);
    return Promise.resolve({ success: true, lot, riskUSD, pipValue: lot * 10 });
  },
};

// ═══ APP ═══
const App = {
  state: { currentAccountId: null, currentAccount: null, accounts: [], settings: {} },

  fmt(v, cur) {
    const n = parseFloat(v) || 0, abs = Math.abs(n);
    const s = abs % 1 === 0 ? abs.toLocaleString('id-ID') : abs.toLocaleString('id-ID', { maximumFractionDigits: 2 });
    if (cur === 'Cent') return (n < 0 ? '-' : '') + s + ' Cent';
    if (cur === 'USD') return (n < 0 ? '-$' : '$') + s;
    return (n < 0 ? '-' : '') + 'Rp ' + s;
  },

  fmtDate(str) {
    if (!str) return '';
    return new Date(str + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  },

  today() { return new Date().toISOString().slice(0, 10); },

  toast(msg) {
    const el = document.getElementById('toastMsg');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(App._tt);
    App._tt = setTimeout(() => el.classList.remove('show'), 2800);
  },

  openSheet(id) { document.getElementById(id)?.classList.add('open'); },
  closeSheet(id) { document.getElementById(id)?.classList.remove('open'); },

  confirmDelete(cb) {
    document.getElementById('confirmDeleteBtn').onclick = async () => { this.closeSheet('deleteSheet'); await cb(); };
    this.openSheet('deleteSheet');
  },

  go(page) {
    ['dashboard', 'calculator', 'trades', 'settings'].forEach(p => {
      document.getElementById('page-' + p).classList.toggle('d-none', p !== page);
      document.getElementById('nav-' + p)?.classList.toggle('active', p === page);
    });
    if (page === 'dashboard') Dashboard.render();
    if (page === 'trades') Trades.render();
    if (page === 'calculator') Calculator.render();
    if (page === 'settings') Settings.render();
  },

  setAccount(id) {
    this.state.currentAccountId = id;
    this.state.currentAccount = this.state.accounts.find(a => a.AccountID === id) || null;
    const acc = this.state.currentAccount;
    document.getElementById('topbarSub').textContent = acc ? acc.Name + ' · ' + acc.Currency : 'Pilih Akun';
  },

  openAccountPicker() {
    document.getElementById('accPickerList').innerHTML = this.state.accounts.map(a => {
      const ic = (a.Icon && typeof a.Icon === 'string') ? a.Icon.trim() : 'bi-wallet2';
      const ih = ic.startsWith('data:') ? `<img src="${ic}" style="width:28px;height:28px;border-radius:7px;object-fit:cover"/>`
        : `<i class="bi ${ic}"></i>`;
      return `<div class="acc-pick-item ${a.AccountID === this.state.currentAccountId ? 'active' : ''}" onclick="App.selectAccount('${a.AccountID}')">
        <div class="acc-icon-box" style="width:36px;height:36px">${ih}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px">${a.Name}</div>
          <div style="font-size:11px;color:var(--text2)">${a.Currency} · ${a.Status}</div></div>
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
    this.state.accounts = DB.getAccounts();
    this.state.settings = DB.getSettings();
    if (this.state.accounts.length > 0) this.setAccount(this.state.accounts[0].AccountID);
    else document.getElementById('topbarSub').textContent = 'Buat akun di Pengaturan';
    document.getElementById('saveTradeBtn').onclick = () => Trades.saveTrade();
    document.getElementById('tradePL').addEventListener('input', e => Trades.updatePreview(e.target.value));
    document.getElementById('tradeAccount').addEventListener('change', () => Trades.updateCurrencyLabel());
    Calculator.fetchRate();
    Dashboard.render();
    document.getElementById('loadingScreen').style.display = 'none';
  }
};

// ═══ DASHBOARD ═══
const Dashboard = {
  loadChartJS() {
    return new Promise(resolve => {
      if (typeof Chart !== 'undefined') { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
      s.onload = resolve; s.onerror = resolve; document.head.appendChild(s);
    });
  },
  fmtMonth(str) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
    const [y, mo] = (str || '').split('-');
    return mo ? m[parseInt(mo) - 1] + " '" + (y || '').slice(2) : str;
  },
  fmtDay(str) {
    if (!str) return '';
    const d = new Date(str + 'T00:00'), m = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
    return d.getDate() + ' ' + m[d.getMonth()];
  },

  async render() {
    const el = document.getElementById('page-dashboard');
    el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:40px;gap:12px;color:var(--text3)"><div class="loader-gold"></div><span>Memuat...</span></div>`;
    if (!App.state.currentAccountId) {
      el.innerHTML = `<div class="empty-state fade-up"><div class="empty-state-icon"><i class="bi bi-person-slash"></i></div><h3>Belum ada akun</h3><p>Buat akun di <strong>Pengaturan</strong>.</p><button class="gold-btn" style="width:auto;padding:12px 24px;margin:16px auto 0" onclick="App.go('settings')"><i class="bi bi-sliders me-1"></i>Buka Pengaturan</button></div>`;
      return;
    }
    const [stats] = await Promise.all([API.getStats(App.state.currentAccountId), this.loadChartJS()]);
    this.build(stats, el);
  },

  build(stats, el) {
    const s = stats.summary, d = stats.daily, c = stats.charts;
    const acc = App.state.currentAccount, cur = acc ? acc.Currency : 'IDR';
    const fmt = v => App.fmt(v, cur);

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
      </div>`: '';

    const hasChart = typeof Chart !== 'undefined';

    el.innerHTML = `<div class="fade-up">
      <div class="hero-card">
        <div class="hero-label">Saldo Saat Ini · ${acc ? acc.Name : ''}</div>
        <div class="hero-val ${s.netProfit >= 0 ? 't-win' : 't-loss'}">${fmt(s.currentBalance)}</div>
        <div class="hero-sub">${s.netProfit >= 0 ? '▲' : '▼'} ${fmt(Math.abs(s.netProfit))} net P/L dari ${fmt(s.initialBalance)}</div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <span class="status-badge ${d.lossLimitReached ? 'loss-bg' : d.targetReached ? 'win-bg' : 'ok'}"><i class="bi bi-circle-fill" style="font-size:7px"></i> ${d.tradingStatus}</span>
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
        ${cur !== 'Cent' ? `<div class="stat-item"><div class="stat-item-label">Profit Factor</div><div class="stat-item-val t-gold">${s.profitFactor}x</div></div>
        <div class="stat-item"><div class="stat-item-label">Max Drawdown</div><div class="stat-item-val t-be">${fmt(s.drawdown)}</div></div>` : ''}
      </div>
      ${cur === 'Cent' ? (() => {
        const ratio = (App.state.settings.conversionRatio || '100000:555').split(':').map(Number);
        const rate = ratio[1] > 0 ? ratio[0] / ratio[1] : 180;
        const netIDR = Math.round(s.netProfit * rate), profIDR = Math.round(s.totalProfit * rate), lossIDR = Math.round(s.totalLoss * rate);
        return `<div class="idr-card">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--gold-d);margin-bottom:6px"><i class="bi bi-currency-exchange me-1"></i> Total Pendapatan dalam Rupiah</div>
          <div style="font-family:var(--font-num);font-size:30px;font-weight:900;letter-spacing:-1px;margin-bottom:4px" class="${netIDR >= 0 ? 't-win' : 't-loss'}">${netIDR >= 0 ? '+' : ''}Rp ${Math.abs(netIDR).toLocaleString('id-ID')}</div>
          <div style="font-size:11px;color:var(--text3);margin-bottom:14px">Konversi: ${s.netProfit >= 0 ? '+' : ''}${s.netProfit} Cent × Rp ${Math.round(rate).toLocaleString('id-ID')}/Cent</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.15);border-radius:10px;padding:10px 12px">
              <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:4px">Profit IDR</div>
              <div style="font-family:var(--font-num);font-size:15px;font-weight:800;color:var(--win)">Rp ${profIDR.toLocaleString('id-ID')}</div></div>
            <div style="background:rgba(244,63,94,.07);border:1px solid rgba(244,63,94,.15);border-radius:10px;padding:10px 12px">
              <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:4px">Loss IDR</div>
              <div style="font-family:var(--font-num);font-size:15px;font-weight:800;color:var(--loss)">Rp ${Math.abs(lossIDR).toLocaleString('id-ID')}</div></div>
          </div></div>`;
      })() : ''}
      ${hasChart ? `
      <div class="chart-card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:16px"><div style="width:8px;height:8px;border-radius:50%;background:var(--gold);box-shadow:0 0 6px var(--gold)"></div><span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text3)">Equity Curve</span></div><canvas id="eqChart" height="130"></canvas></div>
      <div class="chart-card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><div style="display:flex;align-items:center;gap:8px"><div style="width:8px;height:8px;border-radius:50%;background:var(--gold);box-shadow:0 0 6px var(--gold)"></div><span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text3)">P/L per Bulan</span></div><span style="font-size:10px;color:var(--text3)">${c.monthly.labels.length} bulan</span></div><canvas id="mnChart" height="130"></canvas></div>
      <div class="chart-card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:16px"><div style="width:8px;height:8px;border-radius:50%;background:var(--win);box-shadow:0 0 6px var(--win)"></div><span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text3)">Distribusi Hasil</span></div>
        <div style="display:flex;align-items:center;gap:16px"><div style="flex:1"><canvas id="wlChart" width="150" height="150"></canvas></div>
          <div style="display:flex;flex-direction:column;gap:10px;min-width:100px">
            <div class="wl-legend-item" style="color:var(--win)"><div class="wl-dot" style="background:var(--win)"></div><span class="wl-label">Win</span><span class="wl-cnt">${c.winLoss.win}</span></div>
            <div class="wl-legend-item" style="color:var(--loss)"><div class="wl-dot" style="background:var(--loss)"></div><span class="wl-label">Loss</span><span class="wl-cnt">${c.winLoss.loss}</span></div>
            <div class="wl-legend-item" style="color:var(--be)"><div class="wl-dot" style="background:var(--be)"></div><span class="wl-label">BE</span><span class="wl-cnt">${c.winLoss.be}</span></div>
          </div></div></div>`: `<div class="card" style="text-align:center;padding:20px;color:var(--text3)"><i class="bi bi-bar-chart-line" style="font-size:28px;opacity:.3;display:block;margin-bottom:8px"></i><div style="font-size:12px">Chart tidak tersedia</div></div>`}
    </div>`;
    if (hasChart) setTimeout(() => this.drawCharts(c), 150);
  },

  drawCharts(c) {
    ['eqChart', 'mnChart', 'wlChart'].forEach(id => { const i = Chart.getChart(id); if (i) i.destroy(); });
    const gr = 'rgba(255,255,255,.04)', tk = '#475569';
    const tt = { backgroundColor: 'rgba(14,20,34,.95)', borderColor: 'rgba(245,200,66,.2)', borderWidth: 1, titleColor: '#94a3b8', bodyColor: '#f1f5f9', bodyFont: { family: "'Outfit',sans-serif", weight: '700', size: 14 }, padding: 12, cornerRadius: 10 };
    const sc = { x: { grid: { color: gr, drawBorder: false }, ticks: { color: tk, font: { size: 10 }, maxTicksLimit: 7 } }, y: { grid: { color: gr, drawBorder: false }, ticks: { color: tk, font: { size: 10 }, maxTicksLimit: 5 } } };
    const eqLast = c.equity.data.length > 0 ? c.equity.data[c.equity.data.length - 1] : 0;
    const eqC = eqLast >= 0 ? '#F5C842' : '#f43f5e', eqB = eqLast >= 0 ? 'rgba(245,200,66,.06)' : 'rgba(244,63,94,.06)';
    new Chart(document.getElementById('eqChart'), { type: 'line', data: { labels: c.equity.labels.map(l => this.fmtDay(l)), datasets: [{ data: c.equity.data, fill: true, tension: 0.45, borderColor: eqC, backgroundColor: eqB, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: eqC }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, tooltip: tt }, scales: sc } });
    new Chart(document.getElementById('mnChart'), { type: 'bar', data: { labels: c.monthly.labels.map(l => this.fmtMonth(l)), datasets: [{ data: c.monthly.data, backgroundColor: c.monthly.data.map(v => v >= 0 ? 'rgba(245,200,66,.65)' : 'rgba(244,63,94,.65)'), borderColor: c.monthly.data.map(v => v >= 0 ? '#F5C842' : '#f43f5e'), borderWidth: 1.5, borderRadius: 7, borderSkipped: false }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, tooltip: tt }, scales: { x: { grid: { color: gr, drawBorder: false }, ticks: { color: tk, font: { size: 11 } } }, y: { grid: { color: gr, drawBorder: false }, ticks: { color: tk, font: { size: 10 }, maxTicksLimit: 5 } } } } });
    const tot = c.winLoss.win + c.winLoss.loss + c.winLoss.be;
    new Chart(document.getElementById('wlChart'), { type: 'doughnut', data: { labels: ['Win', 'Loss', 'BE'], datasets: [{ data: tot > 0 ? [c.winLoss.win, c.winLoss.loss, c.winLoss.be] : [1, 0, 0], backgroundColor: ['rgba(16,185,129,.8)', 'rgba(244,63,94,.8)', 'rgba(245,158,11,.8)'], borderColor: ['#10b981', '#f43f5e', '#f59e0b'], borderWidth: 2, hoverOffset: 8, spacing: 2 }] }, options: { responsive: true, maintainAspectRatio: true, cutout: '68%', plugins: { legend: { display: false }, tooltip: tt } } });
  }
};

// ═══ TRADES ═══
const Trades = {
  _trades: [], _filterMonth: '',
  _months: [{ v: '', t: 'Semua Bulan' }, { v: '01', t: 'Januari' }, { v: '02', t: 'Februari' }, { v: '03', t: 'Maret' }, { v: '04', t: 'April' }, { v: '05', t: 'Mei' }, { v: '06', t: 'Juni' }, { v: '07', t: 'Juli' }, { v: '08', t: 'Agustus' }, { v: '09', t: 'September' }, { v: '10', t: 'Oktober' }, { v: '11', t: 'November' }, { v: '12', t: 'Desember' }],

  async render() {
    const el = document.getElementById('page-trades');
    el.innerHTML = `<div class="empty-state"><div class="loader-gold" style="margin:0 auto 14px"></div><p>Memuat...</p></div>`;
    if (!App.state.currentAccountId) { el.innerHTML = `<div class="empty-state fade-up"><div class="empty-state-icon"><i class="bi bi-person-slash"></i></div><h3>Belum ada akun</h3></div>`; return; }
    this._trades = await API.getTrades(App.state.currentAccountId, { month: this._filterMonth });
    this.buildList(el);
  },

  buildList(el) {
    const acc = App.state.currentAccount, cur = acc ? acc.Currency : 'IDR', fmt = v => App.fmt(v, cur);
    const selLabel = this._months.find(m => m.v === this._filterMonth)?.t || 'Semua Bulan';
    el.innerHTML = `<div class="fade-up">
      <div class="section-title">Riwayat Trading</div>
      <div class="section-sub">Total <strong>${this._trades.length}</strong> trade${this._filterMonth ? ' · ' + selLabel : ''}</div>
      <button class="month-picker-btn ${this._filterMonth ? 'active' : ''}" onclick="Trades.openMonthPicker()">
        <i class="bi bi-calendar3 me-2" style="font-size:16px"></i><span>${selLabel}</span>
        <i class="bi bi-chevron-down" style="margin-left:auto;font-size:14px;opacity:.6"></i>
      </button>
      ${this._trades.length === 0 ? `<div class="empty-state"><div class="empty-state-icon"><i class="bi bi-journal-x"></i></div><h3>Belum ada trade</h3><p>Klik <strong>+</strong> untuk mencatat trade pertama.</p></div>` : this._trades.map(t => {
      const cls = t.Result === 'Win' ? 'win' : t.Result === 'Loss' ? 'loss' : 'be';
      return `<div class="trade-item"><div class="trade-pip ${cls}"></div>
          <div class="trade-info"><div class="trade-date">${App.fmtDate(t.Date)}</div>
            <div class="trade-method">${t.Entry || '—'}</div>
            ${t.PsychologyNotes ? `<div class="trade-note">${t.PsychologyNotes}</div>` : ''}
          </div>
          <div><div class="trade-pl ${cls === 'win' ? 't-win' : cls === 'loss' ? 't-loss' : 't-be'}">${t.ProfitLoss > 0 ? '+' : ''}${fmt(t.ProfitLoss)}</div>
            <div style="display:flex;justify-content:flex-end;gap:5px;margin-top:6px">
              <button class="icon-micro" onclick="Trades.openEditModal('${t.TradeID}')"><i class="bi bi-pencil"></i></button>
              <button class="icon-micro" onclick="Trades.confirmDelete('${t.TradeID}')"><i class="bi bi-trash3"></i></button>
            </div></div></div>`;
    }).join('')}
    </div>`;
  },

  openMonthPicker() {
    document.getElementById('monthPickerGrid').innerHTML = this._months.map(m => `<button class="month-grid-btn ${this._filterMonth === m.v ? 'active' : ''}" onclick="Trades.selectMonth('${m.v}')">${m.t}</button>`).join('');
    App.openSheet('monthPickerSheet');
  },
  selectMonth(m) { this._filterMonth = m; App.closeSheet('monthPickerSheet'); this.render(); },

  openAddModal() {
    document.getElementById('tradeId').value = '';
    document.getElementById('tradeSheetTitle').innerHTML = '<i class="bi bi-journal-plus me-2"></i>Tambah Trade';
    document.getElementById('tradeForm').reset();
    document.getElementById('tradeDate').value = App.today();
    document.getElementById('tradeAccount').innerHTML = App.state.accounts.map(a => `<option value="${a.AccountID}" ${a.AccountID === App.state.currentAccountId ? 'selected' : ''}>${a.Name} (${a.Currency})</option>`).join('');
    this.updateMethods(); this.updateCurrencyLabel();
    document.getElementById('tradePreview').textContent = 'Masukkan nilai P/L';
    document.getElementById('tradePreview').className = 'trade-preview';
    App.openSheet('tradeSheet');
  },

  openEditModal(id) {
    const t = this._trades.find(t => t.TradeID === id); if (!t) return;
    document.getElementById('tradeId').value = id;
    document.getElementById('tradeSheetTitle').innerHTML = '<i class="bi bi-pencil me-2"></i>Edit Trade';
    document.getElementById('tradeDate').value = t.Date || App.today();
    document.getElementById('tradeAccount').innerHTML = App.state.accounts.map(a => `<option value="${a.AccountID}" ${a.AccountID === t.AccountID ? 'selected' : ''}>${a.Name} (${a.Currency})</option>`).join('');
    this.updateMethods();
    document.getElementById('tradeEntry').value = t.Entry || '';
    document.getElementById('tradePL').value = t.ProfitLoss || '';
    document.getElementById('tradePsych').value = t.PsychologyNotes || '';
    this.updateCurrencyLabel(); this.updatePreview(t.ProfitLoss);
    App.openSheet('tradeSheet');
  },

  updateMethods() { const m = (App.state.settings.tradingMethods || 'Scalping,Swing,SMC,ICT,Price Action').split(','); document.getElementById('tradeEntry').innerHTML = '<option value="">-- Pilih Metode --</option>' + m.map(x => `<option value="${x.trim()}">${x.trim()}</option>`).join(''); },
  updateCurrencyLabel() { const id = document.getElementById('tradeAccount')?.value; const a = App.state.accounts.find(a => a.AccountID === id); const l = document.getElementById('plSuffix'); if (l) l.textContent = a ? a.Currency : 'IDR'; },
  updatePreview(val) { const v = parseFloat(val), el = document.getElementById('tradePreview'); if (!el) return; if (isNaN(v)) { el.textContent = 'Masukkan nilai P/L'; el.className = 'trade-preview'; return; } el.textContent = `${v > 0 ? 'Win' : v < 0 ? 'Loss' : 'BE'} — ${v > 0 ? '+' : ''}${v}`; el.className = `trade-preview ${v > 0 ? 'win' : v < 0 ? 'loss' : ''}`; },

  async saveTrade() {
    const btn = document.getElementById('saveTradeBtn');
    btn.disabled = true; btn.innerHTML = '<span class="loader-gold" style="display:inline-block;width:18px;height:18px;border-width:2px"></span>';
    const id = document.getElementById('tradeId').value;
    const pl = parseFloat(document.getElementById('tradePL').value);
    if (isNaN(pl)) { App.toast('Masukkan nilai P/L'); btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg me-2"></i>Simpan Trade'; return; }
    const data = { Date: document.getElementById('tradeDate').value, AccountID: document.getElementById('tradeAccount').value, Entry: document.getElementById('tradeEntry').value, ProfitLoss: pl, PsychologyNotes: document.getElementById('tradePsych').value };
    const res = id ? await API.updateTrade(id, data) : await API.addTrade(data);
    if (res.success) { App.closeSheet('tradeSheet'); App.toast(id ? '✅ Trade diperbarui!' : pl > 0 ? '✅ WIN ditambahkan!' : '✅ LOSS ditambahkan!'); await Promise.all([this.render(), Dashboard.render()]); }
    else App.toast('❌ ' + (res.error || 'Gagal'));
    btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg me-2"></i>Simpan Trade';
  },

  confirmDelete(id) { App.confirmDelete(async () => { await API.deleteTrade(id); App.toast('🗑️ Trade dihapus'); await Promise.all([this.render(), Dashboard.render()]); }); }
};

// ═══ CALCULATOR ═══
const Calculator = {
  _rate: 15800, _cur: 'IDR', _rMode: 'percent',

  async fetchRate() {
    const el = document.getElementById('ratePillText'); if (el) el.textContent = 'Memuat...';
    try { const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD'); const d = await r.json(); this._rate = d.rates?.IDR || 15800; }
    catch { try { const r2 = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR'); const d2 = await r2.json(); this._rate = d2.rates?.IDR || 15800; } catch { this._rate = 15800; } }
    if (el) el.textContent = 'USD/IDR ' + Math.round(this._rate).toLocaleString('id-ID');
  },

  render() {
    const el = document.getElementById('page-calculator');
    el.innerHTML = `<div class="fade-up">
      <div class="section-title">Kalkulator Lot</div>
      <div class="section-sub">XAUUSD · Hitung ukuran lot optimal</div>
      <div class="card"><div class="card-title">Mata Uang Akun</div>
        <div class="currency-wrap">
          <button class="cur-btn ${this._cur === 'IDR' ? 'active' : ''}" onclick="Calculator.setCur('IDR')">🇮🇩 IDR</button>
          <button class="cur-btn ${this._cur === 'USD' ? 'active' : ''}" onclick="Calculator.setCur('USD')">🇺🇸 USD</button>
        </div>
        <div class="card-title" style="margin-top:4px">Mode Risiko</div>
        <div class="rmode-wrap">
          <button class="rmode-btn ${this._rMode === 'percent' ? 'active' : ''}" onclick="Calculator.setRMode('percent')">% Saldo</button>
          <button class="rmode-btn ${this._rMode === 'nominal' ? 'active' : ''}" onclick="Calculator.setRMode('nominal')">Nominal</button>
        </div>
        <div class="field-group" style="margin-bottom:12px"><label>Saldo (${this._cur})</label><input type="number" id="calBalance" class="field" placeholder="${this._cur === 'IDR' ? '10000000' : '1000'}"/></div>
        <div class="form-row-2">
          <div class="field-group"><label>${this._rMode === 'percent' ? 'Risiko (%)' : 'Risiko (' + this._cur + ')'}</label><input type="number" id="calRisk" class="field" placeholder="${this._rMode === 'percent' ? '1' : '100000'}" step="0.01"/></div>
          <div class="field-group"><label>Stop Loss (pips)</label><input type="number" id="calSL" class="field" placeholder="50" step="1"/></div>
        </div>
        <div class="quick-chips">${['0.5', '1', '1.5', '2', '3'].map(v => `<button class="quick-chip" onclick="Calculator.setQuick(${v})">${v}%</button>`).join('')}</div>
        <button class="gold-btn w-100 mt-3" onclick="Calculator.calculate()"><i class="bi bi-lightning-charge-fill me-2"></i>Hitung Lot</button>
      </div>
      <div id="calResult" style="display:none">
        <div class="lot-hero"><div class="lot-hero-label">Ukuran Lot Ideal</div>
          <div class="lot-big" id="calLotVal">0.01</div><div class="lot-unit">LOT</div>
          <div class="lot-stats-row">
            <div class="lot-stat"><div class="lot-stat-label">Risk USD</div><div class="lot-stat-val t-loss" id="calRiskUSD">$0</div></div>
            <div class="lot-stat"><div class="lot-stat-label">Risk ${this._cur}</div><div class="lot-stat-val t-loss" id="calRiskLocal">0</div></div>
            <div class="lot-stat"><div class="lot-stat-label">Pip Value</div><div class="lot-stat-val" id="calPipVal">$0</div></div>
            <div class="lot-stat"><div class="lot-stat-label">USD/IDR</div><div class="lot-stat-val t-gold" id="calRateVal">0</div></div>
          </div>
          <div class="risk-meter-wrap"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3)"><span>Risk Meter</span><span id="calRiskPct">0%</span></div>
            <div class="risk-meter-track"><div class="risk-meter-fill" id="calMeterFill" style="width:0%"></div></div></div>
        </div>
        <div class="card"><div class="card-title">R:R Simulasi</div><div class="rr-grid" id="calRRGrid"></div></div>
      </div>
    </div>`;
  },

  setCur(c) { this._cur = c; this.render(); },
  setRMode(m) { this._rMode = m; this.render(); },
  setQuick(v) { document.getElementById('calRisk').value = v; if (this._rMode !== 'percent') this.setRMode('percent'); },

  calculate() {
    const bal = parseFloat(document.getElementById('calBalance').value);
    const risk = parseFloat(document.getElementById('calRisk').value);
    const sl = parseFloat(document.getElementById('calSL').value);
    if (!bal || !risk || !sl) { App.toast('Isi semua field'); return; }
    let rUSD = this._rMode === 'percent' ? (bal * (risk / 100)) / (this._cur === 'IDR' ? this._rate : 1) : risk / (this._cur === 'IDR' ? this._rate : 1);
    const lot = Math.max(0.01, Math.floor((rUSD / (sl * 10)) * 100) / 100);
    const rLocal = this._cur === 'IDR' ? rUSD * this._rate : rUSD;
    const rPct = this._rMode === 'percent' ? risk : (rLocal / bal * 100);
    document.getElementById('calResult').style.display = 'block';
    document.getElementById('calLotVal').textContent = lot.toFixed(2);
    document.getElementById('calRiskUSD').textContent = '$' + rUSD.toFixed(2);
    document.getElementById('calRiskLocal').textContent = this._cur === 'IDR' ? 'Rp ' + Math.round(rLocal).toLocaleString('id-ID') : '$' + rUSD.toFixed(2);
    document.getElementById('calPipVal').textContent = '$' + (lot * 10).toFixed(2);
    document.getElementById('calRateVal').textContent = Math.round(this._rate).toLocaleString('id-ID');
    document.getElementById('calRiskPct').textContent = rPct.toFixed(1) + '%';
    document.getElementById('calMeterFill').style.width = Math.min(rPct / 5 * 100, 100) + '%';
    document.getElementById('calRRGrid').innerHTML = [1, 1.5, 2, 2.5, 3, 4].map(rr => `<div class="rr-item"><div class="rr-ratio">1:${rr}</div><div class="rr-val">${this._cur === 'IDR' ? 'Rp ' + Math.round(lot * 10 * sl * rr).toLocaleString('id-ID') : '$' + (lot * 10 * sl * rr).toFixed(2)}</div></div>`).join('');
  }
};

// ═══ SETTINGS ═══
const Settings = {
  iconPresets: ['bi-wallet2', 'bi-briefcase-fill', 'bi-bank2', 'bi-cash-coin', 'bi-coin', 'bi-currency-dollar', 'bi-graph-up-arrow', 'bi-bar-chart-line-fill', 'bi-star-fill', 'bi-fire', 'bi-gem', 'bi-award-fill', 'bi-person-circle'],

  render() {
    const el = document.getElementById('page-settings');
    try {
      App.state.accounts = DB.getAccounts();
      App.state.settings = DB.getSettings();
      this.build(el, App.state.accounts, App.state.settings);
    } catch (e) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><i class="bi bi-exclamation-triangle"></i></div><h3>Error Pengaturan</h3><p style="color:var(--loss);font-size:11px">' + e.message + '</p><button class="ghost-btn" style="margin:16px auto 0;width:auto;padding:10px 20px" onclick="Settings.render()">Coba Lagi</button></div>';
    }
  },

  build(el, accounts, settings) {
    const methods = settings.tradingMethods || 'Scalping,Swing,SMC,ICT,Price Action';
    el.innerHTML = `<div class="fade-up"><div class="section-title">Pengaturan</div>
      <div class="section-sub">Kelola akun, metode, dan preferensi</div>
      <div class="card-title" style="margin-bottom:10px">Daftar Akun</div>
      ${accounts.length ? accounts.map(a => this.accCard(a)).join('') : `<div class="empty-state" style="padding:20px"><div class="empty-state-icon" style="font-size:32px"><i class="bi bi-people"></i></div><p>Belum ada akun</p></div>`}
      <button class="ghost-btn w-100" style="margin-bottom:20px" onclick="Settings.openAddAccount()"><i class="bi bi-plus-lg"></i> Tambah Akun</button>
      <div class="divider"></div>
      <div class="settings-item"><div class="settings-label"><i class="bi bi-list-check me-2 t-gold"></i>Metode Trading</div>
        <div class="field-group"><label>Pisahkan dengan koma</label><textarea id="tradingMethods" class="field" rows="3">${methods}</textarea></div>
        <button class="gold-btn" style="margin-top:12px" onclick="Settings.saveMethods()"><i class="bi bi-check-lg"></i> Simpan</button></div>
      <div class="settings-item"><div class="settings-label"><i class="bi bi-arrow-left-right me-2 t-gold"></i>Konversi Cent → IDR</div>
        <div class="field-group"><label>Format IDR:Cent</label><input type="text" id="convRatio" class="field" value="${settings.conversionRatio || '100000:555'}" placeholder="100000:555"/></div>
        <button class="gold-btn" style="margin-top:12px" onclick="Settings.saveConv()"><i class="bi bi-check-lg"></i> Simpan</button></div>
      <div style="text-align:center;padding:20px 0 8px;font-size:11px;color:var(--text3)">Trading Suite v2.0 · Gold Edition<br/>⚠️ Trading emas mengandung risiko tinggi</div>
    </div>`;
  },

  accCard(a) {
    const ic = (a.Icon && typeof a.Icon === 'string') ? a.Icon.trim() : 'bi-wallet2';
    const ih = ic.startsWith('data:') || ic.startsWith('http')
      ? '<img src="' + ic + '" style="width:28px;height:28px;border-radius:7px;object-fit:cover"/>'
      : '<i class="bi ' + ic + '"></i>';
    const tgt = a.DailyTargetPct > 0 ? ' · Target ' + a.DailyTargetPct + '%'
      : a.DailyTarget > 0 ? ' · Target ' + App.fmt(a.DailyTarget, a.Currency) : '';
    return '<div class="acc-card"><div class="acc-icon-box">' + ih + '</div>' +
      '<div style="flex:1;min-width:0"><div class="acc-name">' + a.Name + '</div>' +
      '<div class="acc-cur">' + a.Currency + ' · ' + a.Status + tgt + '</div></div>' +
      '<div style="display:flex;gap:6px">' +
      '<button class="icon-micro" onclick="Settings.openEditAccount(\'' + a.AccountID + '\')"><i class="bi bi-pencil"></i></button>' +
      '<button class="icon-micro" style="color:var(--loss)" onclick="Settings.deleteAcc(\'' + a.AccountID + '\')"><i class="bi bi-trash3"></i></button>' +
      '</div></div>';
  },

  openAddAccount() { document.getElementById('accountId').value = ''; document.getElementById('accSheetTitle').innerHTML = '<i class="bi bi-person-plus me-2"></i>Tambah Akun'; document.getElementById('accountForm').reset(); document.getElementById('accountIcon').value = 'bi-wallet2'; document.getElementById('accIconPreviewBox').innerHTML = '<i class="bi bi-wallet2"></i>'; this.renderPresets(''); document.getElementById('saveAccountBtn').onclick = () => this.saveAccount(); App.openSheet('accountSheet'); },

  openEditAccount(id) {
    const a = App.state.accounts.find(a => a.AccountID === id); if (!a) return;
    document.getElementById('accountId').value = id; document.getElementById('accSheetTitle').innerHTML = '<i class="bi bi-pencil me-2"></i>Edit Akun';
    document.getElementById('accountName').value = a.Name; document.getElementById('accountCurrency').value = a.Currency; document.getElementById('accountStatus').value = a.Status;
    document.getElementById('accountTarget').value = a.DailyTarget; document.getElementById('accountTargetPct').value = a.DailyTargetPct || 0;
    document.getElementById('accountLossLimit').value = a.DailyLossLimit; document.getElementById('accountBalance').value = a.InitialBalance;
    const iv = (a.Icon && typeof a.Icon === 'string') ? a.Icon.trim() : 'bi-wallet2'; document.getElementById('accountIcon').value = iv;
    this.updatePreview(iv); this.renderPresets(iv); document.getElementById('saveAccountBtn').onclick = () => this.saveAccount(); App.openSheet('accountSheet');
  },

  renderPresets(cur) { document.getElementById('iconPresets').innerHTML = this.iconPresets.map(ic => `<button type="button" class="icon-preset-btn ${cur === ic ? 'active' : ''}" onclick="Settings.setPreset('${ic}')"><i class="bi ${ic}"></i></button>`).join(''); },
  setPreset(ic) { document.getElementById('accountIconFile').value = ''; document.getElementById('accountIcon').value = ic; this.updatePreview(ic); this.renderPresets(ic); },
  updatePreview(s) { const p = document.getElementById('accIconPreviewBox'); if (!s || !s.trim()) { p.innerHTML = '<i class="bi bi-wallet2"></i>'; return; } if (s.startsWith('data:') || s.startsWith('http')) p.innerHTML = `<img src="${s}" style="width:38px;height:38px;border-radius:9px;object-fit:cover"/>`; else p.innerHTML = `<i class="bi ${s.trim()}" style="font-size:22px"></i>`; },
  handleIconUpload(e) { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { document.getElementById('accountIcon').value = ev.target.result; this.updatePreview(ev.target.result); }; r.readAsDataURL(f); },

  async saveAccount() {
    const btn = document.getElementById('saveAccountBtn'); btn.disabled = true; btn.innerHTML = '<span class="loader-gold" style="width:18px;height:18px;border-width:2px"></span>';
    const id = document.getElementById('accountId').value;
    const data = { Name: document.getElementById('accountName').value, Currency: document.getElementById('accountCurrency').value, Status: document.getElementById('accountStatus').value, DailyTarget: parseFloat(document.getElementById('accountTarget').value) || 0, DailyTargetPct: parseFloat(document.getElementById('accountTargetPct').value) || 0, DailyLossLimit: parseFloat(document.getElementById('accountLossLimit').value) || 0, InitialBalance: parseFloat(document.getElementById('accountBalance').value) || 0, Icon: document.getElementById('accountIcon').value || 'bi-wallet2' };
    if (!data.Name) { App.toast('Nama akun wajib diisi'); btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg me-2"></i>Simpan Akun'; return; }
    const res = id ? await API.updateAccount(id, data) : await API.addAccount(data);
    if (res.success) { App.toast(id ? '✅ Akun diperbarui!' : '✅ Akun ditambahkan!'); App.closeSheet('accountSheet'); App.state.accounts = DB.getAccounts(); if (!App.state.currentAccountId && App.state.accounts.length > 0) App.setAccount(App.state.accounts[0].AccountID); await this.render(); }
    else App.toast('❌ ' + (res.error || 'Gagal'));
    btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg me-2"></i>Simpan Akun';
  },

  deleteAcc(id) { App.confirmDelete(async () => { await API.deleteAccount(id); App.state.accounts = DB.getAccounts(); if (App.state.currentAccountId === id) { App.state.currentAccountId = null; App.state.currentAccount = null; document.getElementById('topbarSub').textContent = 'Pilih Akun'; } App.toast('🗑️ Akun dihapus'); await this.render(); }); },
  async saveMethods() { await API.updateSettings({ tradingMethods: document.getElementById('tradingMethods').value.trim() }); App.state.settings = DB.getSettings(); App.toast('✅ Metode disimpan!'); },
  async saveConv() { await API.updateSettings({ conversionRatio: document.getElementById('convRatio').value.trim() }); App.state.settings = DB.getSettings(); App.toast('✅ Pengaturan disimpan!'); }
};

window.addEventListener('DOMContentLoaded', () => App.init());
