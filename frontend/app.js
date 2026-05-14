const API = (window.ENV_API_URL || 'https://expense-tracker-api-b0vx.onrender.com');

const DEMO_MODE = false; // 改為 false 後連接真實後端

const DEMO_DATA = (() => {
  const y = new Date().getFullYear();
  const m = String(new Date().getMonth() + 1).padStart(2, '0');
  const d = (n) => `${y}-${m}-${String(n).padStart(2, '0')}`;
  return [
    { id: '1', date: d(1),  person: '群', category: '餐飲',   description: '麥當勞早餐',   amount: 89,   source: 'line' },
    { id: '2', date: d(1),  person: '萱', category: '日用品', description: '全聯採購',     amount: 420,  source: 'invoice' },
    { id: '3', date: d(2),  person: '群', category: '交通',   description: '捷運儲值',     amount: 500,  source: 'manual' },
    { id: '4', date: d(3),  person: '萱', category: '餐飲',   description: '路易莎咖啡',   amount: 140,  source: 'line' },
    { id: '5', date: d(3),  person: '群', category: '餐飲',   description: '三商巧福午餐', amount: 115,  source: 'line' },
    { id: '6', date: d(5),  person: '萱', category: '購物',   description: 'Uniqlo',       amount: 1290, source: 'invoice' },
    { id: '7', date: d(5),  person: '群', category: '娛樂',   description: '電影票x2',     amount: 520,  source: 'manual' },
    { id: '8', date: d(7),  person: '萱', category: '醫療',   description: '康是美藥妝',   amount: 380,  source: 'invoice' },
    { id: '9', date: d(8),  person: '群', category: '餐飲',   description: '火鍋晚餐',     amount: 680,  source: 'manual' },
    { id: '10',date: d(9),  person: '萱', category: '日用品', description: '洗髮精/沐浴乳', amount: 260, source: 'line' },
    { id: '11',date: d(10), person: '群', category: '交通',   description: 'Uber',         amount: 220,  source: 'invoice' },
    { id: '12',date: d(11), person: '萱', category: '餐飲',   description: '早餐店',       amount: 75,   source: 'line' },
    { id: '13',date: d(12), person: '群', category: '購物',   description: '蝦皮購物',     amount: 890,  source: 'invoice' },
    { id: '14',date: d(13), person: '萱', category: '餐飲',   description: '便當',         amount: 95,   source: 'line' },
    { id: '15',date: d(14), person: '群', category: '日用品', description: '家樂福',       amount: 1150, source: 'invoice' },
  ];
})();

const CATEGORY_ICON = {
  餐飲: '🍜', 交通: '🚌', 購物: '🛍️',
  日用品: '🧴', 娛樂: '🎬', 醫療: '💊',
  店務: '🏪', 教育費: '📚', 貸款: '🏦', 其他: '📌'
};

const CATEGORY_COLORS = [
  '#5b6af0','#f06b9a','#2cc98a','#fbbf24','#a78bfa','#34d399','#94a3b8'
];

let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let allExpenses  = [];
let categoryChart, personChart, dailyChart;

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  setDateDefault();
  renderMonthLabel();
  loadExpenses();

  document.getElementById('prevMonth').onclick    = () => shiftMonth(-1);
  document.getElementById('nextMonth').onclick    = () => shiftMonth(1);
  document.getElementById('filterPerson').onchange   = renderList;
  document.getElementById('filterCategory').onchange = renderList;
  document.getElementById('openModalBtn').onclick    = () => openModal();
  document.getElementById('cancelModalBtn').onclick  = closeModal;
  document.getElementById('modalOverlay').onclick    = e => { if (e.target === e.currentTarget) closeModal(); };
  document.getElementById('expenseForm').onsubmit    = handleSubmit;

  document.getElementById('syncInvoiceBtn').onclick = openSyncModal;
  document.getElementById('cancelSyncBtn').onclick  = closeSyncModal;
  document.getElementById('doSyncBtn').onclick      = importCSV;
  document.getElementById('syncModalOverlay').onclick = e => {
    if (e.target === e.currentTarget) closeSyncModal();
  };
  document.getElementById('csvFileInput').onchange = e => handleCSVFile(e.target.files[0]);
  document.getElementById('csvDropLabel').onclick  = () => document.getElementById('csvFileInput').click();
  document.getElementById('csvResetBtn').onclick   = resetCSVUpload;

  const dropZone = document.getElementById('csvDropZone');
  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    handleCSVFile(e.dataTransfer.files[0]);
  });

  document.getElementById('openCarrierBtn').onclick = openCarrierModal;
  document.getElementById('cancelCarrierBtn').onclick = () =>
    document.getElementById('carrierModalOverlay').classList.remove('active');
  document.getElementById('carrierModalOverlay').onclick = e => {
    if (e.target === e.currentTarget)
      document.getElementById('carrierModalOverlay').classList.remove('active');
  };
});

function openCarrierModal() {
  document.getElementById('carrierModalOverlay').classList.add('active');
  JsBarcode('#carrierBarcode', '/I+OBSTR', {
    format: 'CODE128',
    width: 2.5,
    height: 80,
    displayValue: false,
    background: '#ffffff',
    lineColor: '#000000',
    margin: 8
  });
}

function setDateDefault() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('fDate').value = today;
}

function renderMonthLabel() {
  document.getElementById('monthLabel').textContent =
    `${currentYear} 年 ${currentMonth} 月`;
}

function shiftMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 12) { currentMonth = 1;  currentYear++; }
  if (currentMonth < 1)  { currentMonth = 12; currentYear--; }
  renderMonthLabel();
  loadExpenses();
}

/* ── Data ── */
async function loadExpenses() {
  if (DEMO_MODE) {
    allExpenses = DEMO_DATA;
    renderAll();
    return;
  }
  try {
    const res = await fetch(`${API}/api/expenses?year=${currentYear}&month=${currentMonth}`);
    allExpenses = await res.json();
    renderAll();
  } catch (e) {
    showToast('⚠️ 無法連接後端，請確認服務已啟動');
    renderAll();
  }
}

function renderAll() {
  renderCards();
  renderCharts();
  renderList();
}

/* ── Cards ── */
function renderCards() {
  const total = allExpenses.reduce((s, e) => s + e.amount, 0);
  const qun   = allExpenses.filter(e => e.person === '群').reduce((s, e) => s + e.amount, 0);
  const xuan  = allExpenses.filter(e => e.person === '萱').reduce((s, e) => s + e.amount, 0);

  document.getElementById('totalAmount').textContent = `$${total.toLocaleString()}`;
  document.getElementById('qunAmount').textContent   = `$${qun.toLocaleString()}`;
  document.getElementById('xuanAmount').textContent  = `$${xuan.toLocaleString()}`;
}

/* ── Charts ── */
function renderCharts() {
  renderCategoryChart();
  renderPersonChart();
  renderDailyChart();
}

function renderCategoryChart() {
  const cats = ['餐飲','交通','購物','日用品','娛樂','醫療','其他'];
  const data  = cats.map(c => allExpenses.filter(e => e.category === c).reduce((s, e) => s + e.amount, 0));
  const filtered = cats.filter((_, i) => data[i] > 0);
  const fData    = data.filter(v => v > 0);

  if (categoryChart) categoryChart.destroy();
  categoryChart = new Chart(document.getElementById('categoryChart'), {
    type: 'doughnut',
    data: {
      labels: filtered,
      datasets: [{ data: fData, backgroundColor: CATEGORY_COLORS, borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 8 } },
        tooltip: { callbacks: { label: ctx => ` $${ctx.parsed.toLocaleString()}` } }
      }
    }
  });
}

function renderPersonChart() {
  const qun  = allExpenses.filter(e => e.person === '群').reduce((s, e) => s + e.amount, 0);
  const xuan = allExpenses.filter(e => e.person === '萱').reduce((s, e) => s + e.amount, 0);

  if (personChart) personChart.destroy();
  personChart = new Chart(document.getElementById('personChart'), {
    type: 'doughnut',
    data: {
      labels: ['群', '萱'],
      datasets: [{ data: [qun, xuan], backgroundColor: ['#5b6af0','#f06b9a'], borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 8 } },
        tooltip: { callbacks: { label: ctx => ` $${ctx.parsed.toLocaleString()}` } }
      }
    }
  });
}

function renderDailyChart() {
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);
  const qunData  = Array(daysInMonth).fill(0);
  const xuanData = Array(daysInMonth).fill(0);

  allExpenses.forEach(e => {
    const day = parseInt(e.date.split('-')[2]) - 1;
    if (e.person === '群') qunData[day]  += e.amount;
    else                    xuanData[day] += e.amount;
  });

  if (dailyChart) dailyChart.destroy();
  dailyChart = new Chart(document.getElementById('dailyChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: '群', data: qunData,  backgroundColor: '#5b6af0aa', borderRadius: 4 },
        { label: '萱', data: xuanData, backgroundColor: '#f06b9aaa', borderRadius: 4 }
      ]
    },
    options: {
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { stacked: true, grid: { color: '#f0f0f0' }, ticks: { font: { size: 10 } } }
      },
      plugins: { legend: { labels: { font: { size: 11 } } } },
      maintainAspectRatio: true
    }
  });
}

/* ── List ── */
function renderList() {
  const person   = document.getElementById('filterPerson').value;
  const category = document.getElementById('filterCategory').value;

  let filtered = allExpenses.filter(e =>
    (!person   || e.person   === person) &&
    (!category || e.category === category)
  );

  const container = document.getElementById('expenseRows');
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">📭 這個月還沒有花費紀錄</div>';
    return;
  }

  // Group by date
  const groups = {};
  filtered.forEach(e => {
    if (!groups[e.date]) groups[e.date] = [];
    groups[e.date].push(e);
  });

  container.innerHTML = Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(date => {
    const dayTotal = groups[date].reduce((s, e) => s + e.amount, 0);
    const rows = groups[date].map(expenseRow).join('');
    const [y, m, d] = date.split('-');
    const dayStr = new Date(date + 'T12:00:00').toLocaleDateString('zh-TW', { weekday: 'short' });
    return `
      <div class="day-group">
        <div class="day-header">
          <span>${m}/${d} (${dayStr})</span>
          <span>合計 $${dayTotal.toLocaleString()}</span>
        </div>
        ${rows}
      </div>`;
  }).join('');
}

function expenseRow(e) {
  const icon = CATEGORY_ICON[e.category] || '📌';
  const sourceClass = e.source === 'invoice' ? 'source-invoice' : e.source === 'line' ? 'source-line' : '';
  const sourceLabel = e.source === 'invoice' ? '發票' : e.source === 'line' ? 'LINE' : '手動';
  return `
    <div class="expense-row">
      <span class="badge badge-${e.person}">${e.person}</span>
      <span class="cat-icon">${icon}</span>
      <div class="row-info">
        <div class="row-desc">${e.description || e.category}</div>
        <div class="row-meta">${e.category}</div>
      </div>
      <span class="source-tag ${sourceClass}">${sourceLabel}</span>
      <span class="row-amount">$${e.amount.toLocaleString()}</span>
      <div class="row-actions">
        <button class="icon-btn" onclick="openModal('${e.id}')" title="編輯">✏️</button>
        <button class="icon-btn" onclick="deleteExpense('${e.id}')" title="刪除">🗑️</button>
      </div>
    </div>`;
}

/* ── Modal ── */
function openModal(id) {
  document.getElementById('editId').value = '';
  document.getElementById('expenseForm').reset();
  setDateDefault();
  document.getElementById('modalTitle').textContent = '新增花費';

  if (id) {
    const e = allExpenses.find(x => x.id === id);
    if (!e) return;
    document.getElementById('modalTitle').textContent = '編輯花費';
    document.getElementById('editId').value      = e.id;
    document.getElementById('fPerson').value     = e.person;
    document.getElementById('fDate').value       = e.date;
    document.getElementById('fCategory').value   = e.category;
    document.getElementById('fAmount').value     = e.amount;
    document.getElementById('fDescription').value = e.description;
  }
  document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

async function handleSubmit(ev) {
  ev.preventDefault();
  const id = document.getElementById('editId').value;
  const body = {
    person:      document.getElementById('fPerson').value,
    date:        document.getElementById('fDate').value,
    category:    document.getElementById('fCategory').value,
    amount:      parseFloat(document.getElementById('fAmount').value),
    description: document.getElementById('fDescription').value
  };

  try {
    const url    = id ? `${API}/api/expenses/${id}` : `${API}/api/expenses`;
    const method = id ? 'PUT' : 'POST';
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json()).error);
    showToast(id ? '✅ 已更新' : '✅ 已新增');
    closeModal();
    loadExpenses();
  } catch (e) {
    showToast(`❌ ${e.message}`);
  }
}

async function deleteExpense(id) {
  if (!confirm('確定刪除這筆紀錄？')) return;
  try {
    await fetch(`${API}/api/expenses/${id}`, { method: 'DELETE' });
    showToast('🗑️ 已刪除');
    loadExpenses();
  } catch { showToast('❌ 刪除失敗'); }
}

/* ── CSV Invoice Import ── */
let csvParsedInvoices = [];

const SELLER_CATEGORY = {
  餐飲: ['超商','便利','統一','全家','萊爾富','ok超','麥當勞','肯德基','摩斯','漢堡','pizza','必勝客','咖啡','路易莎','星巴克','火鍋','餐廳','餐館','燒烤','壽司','早餐','豆漿','飲食','食品','烘焙','麵包','點心','小吃','便當'],
  交通: ['中油','台灣中油','加油','cpc','油品','捷運','公車','台鐵','高鐵','uber','taxi','計程','停車','客運','航空'],
  購物: ['蝦皮','momo','pchome','購物','百貨','商行','服飾','衣','鞋','箱包','運動','3c','電子'],
  日用品: ['全聯','家樂福','大潤發','好市多','costco','藥局','藥妝','康是美','屈臣氏','寶雅','生活'],
  娛樂: ['電影','ktv','遊樂','展覽','票券','演唱'],
  醫療: ['醫院','診所','藥局','藥妝','醫療','健康'],
};

function guessSellerCategory(sellerName) {
  const s = sellerName.toLowerCase();
  for (const [cat, keys] of Object.entries(SELLER_CATEGORY)) {
    if (keys.some(k => s.includes(k))) return cat;
  }
  return '其他';
}

function shortSeller(name) {
  return name.replace(/股份有限公司|有限公司|股份|分公司|第.+分公司|桃園.*分公司|台北.*分公司|新北.*分公司/g, '').trim().substring(0, 20);
}

function parseInvoiceCSV(text) {
  const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('捐贈') && !l.startsWith('注意'));
  const headers = lines[0].split(',');
  const rows = lines.slice(1).map(l => {
    const cols = l.split(',');
    return {
      date:     cols[1]?.trim(),
      invoiceNo: cols[2]?.trim(),
      amount:   parseFloat(cols[3]) || 0,
      status:   cols[4]?.trim(),
      sellerName: cols[7]?.trim() || '',
      itemAmount: parseFloat(cols[12]) || 0,
    };
  }).filter(r => r.date && r.invoiceNo && r.status === '開立已確認');

  // 按發票號碼 group，加總正數金額
  const invoiceMap = {};
  for (const row of rows) {
    if (!invoiceMap[row.invoiceNo]) {
      invoiceMap[row.invoiceNo] = { date: row.date, sellerName: row.sellerName, total: 0 };
    }
    if (row.itemAmount > 0) invoiceMap[row.invoiceNo].total += row.itemAmount;
  }

  return Object.entries(invoiceMap)
    .filter(([, v]) => v.total > 0)
    .map(([invoiceNo, v]) => ({
      invoiceNo,
      date: `${v.date.substring(0,4)}-${v.date.substring(4,6)}-${v.date.substring(6,8)}`,
      sellerName: v.sellerName,
      description: shortSeller(v.sellerName),
      category: guessSellerCategory(v.sellerName),
      amount: v.total,
      selected: true,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function openSyncModal() {
  resetCSVUpload();
  document.getElementById('syncModalOverlay').classList.add('active');
}

function closeSyncModal() {
  document.getElementById('syncModalOverlay').classList.remove('active');
}

function resetCSVUpload() {
  csvParsedInvoices = [];
  document.getElementById('csvUploadArea').style.display = '';
  document.getElementById('csvPreviewArea').style.display = 'none';
  document.getElementById('doSyncBtn').style.display = 'none';
  document.getElementById('csvFileInput').value = '';
}

function handleCSVFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    csvParsedInvoices = parseInvoiceCSV(text);
    renderCSVPreview();
  };
  reader.readAsText(file, 'UTF-8');
}

function renderCSVPreview() {
  document.getElementById('csvUploadArea').style.display = 'none';
  document.getElementById('csvPreviewArea').style.display = '';
  document.getElementById('doSyncBtn').style.display = '';
  document.getElementById('csvPreviewTitle').textContent = `共解析 ${csvParsedInvoices.length} 張發票`;

  const body = document.getElementById('csvPreviewBody');
  body.innerHTML = csvParsedInvoices.map((inv, i) => `
    <tr id="csv-row-${i}" class="${inv.selected ? '' : 'skip-row'}">
      <td>${inv.date.substring(5)}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${inv.sellerName}">${inv.description}</td>
      <td>
        <select style="background:transparent;border:none;color:var(--muted);font-size:.78rem;cursor:pointer" onchange="csvParsedInvoices[${i}].category=this.value">
          ${['餐飲','交通','購物','日用品','娛樂','醫療','其他'].map(c => `<option${c===inv.category?' selected':''}>${c}</option>`).join('')}
        </select>
      </td>
      <td style="text-align:right;font-weight:600">$${inv.amount.toLocaleString()}</td>
      <td style="text-align:center">
        <input type="checkbox" ${inv.selected?'checked':''} onchange="csvParsedInvoices[${i}].selected=this.checked; document.getElementById('csv-row-${i}').className=this.checked?'':'skip-row'" />
      </td>
    </tr>
  `).join('');
}

async function importCSV() {
  const person = document.getElementById('syncPerson').value;
  const toImport = csvParsedInvoices.filter(inv => inv.selected);
  if (!toImport.length) { showToast('⚠️ 沒有選取任何發票'); return; }

  document.getElementById('doSyncBtn').textContent = '匯入中...';
  document.getElementById('doSyncBtn').disabled = true;

  let success = 0, fail = 0;
  for (const inv of toImport) {
    const persons = person === '共同' ? ['群', '萱'] : [person];
    for (const p of persons) {
      const amount = person === '共同' ? Math.round(inv.amount / 2) : inv.amount;
      try {
        const res = await fetch(`${API}/api/expenses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ person: p, date: inv.date, category: inv.category, description: inv.description, amount, source: 'invoice', invoice_no: inv.invoiceNo })
        });
        if (res.ok) success++; else fail++;
      } catch { fail++; }
    }
  }

  document.getElementById('doSyncBtn').textContent = '匯入選取發票';
  document.getElementById('doSyncBtn').disabled = false;
  showToast(`✅ 成功匯入 ${success} 筆${fail ? `，${fail} 筆失敗` : ''}`);
  closeSyncModal();
  loadExpenses();
}

/* ── Toast ── */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
