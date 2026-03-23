/**
 * Main Application Logic
 */

// Global state
let currentData = null;
let selectedClinics = new Set();
let allClinics = [];
let receptionStaffList = [];  // 受付スタッフ除外リスト
let expandedClinics = new Set(); // 展開中の院（出勤者名表示）
let tokenClient = null;       // OAuth2トークンクライアント
let selectedDateIndex = null; // 詳細パネルで選択中の日付インデックス

// DOM Elements
const authRequired = document.getElementById('auth-required');
const dashboard = document.getElementById('dashboard');
const settingsBtn = document.getElementById('settings-btn');
const signoutBtn = document.getElementById('signout-btn');
const sheetSelector = document.getElementById('sheet-selector');
const refreshBtn = document.getElementById('refresh-btn');
const clinicFilter = document.getElementById('clinic-filter');
const selectAllBtn = document.getElementById('select-all-btn');
const deselectAllBtn = document.getElementById('deselect-all-btn');
const summaryBar = document.getElementById('summary-bar');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('error-message');
const shiftTable = document.getElementById('shift-table');
const shiftTableWrapper = document.getElementById('shift-table-wrapper');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const saveSettingsBtn = document.getElementById('save-settings');
const cancelSettingsBtn = document.getElementById('cancel-settings');
const spreadsheetIdInput = document.getElementById('spreadsheet-id');
const apiKeyInput = document.getElementById('api-key');
const clinicList = document.getElementById('clinic-list');
const newClinicName = document.getElementById('new-clinic-name');
const newClinicBaseline = document.getElementById('new-clinic-baseline');
const addClinicBtn = document.getElementById('add-clinic-btn');
const baselineSettings = document.getElementById('baseline-settings');

/**
 * Initialize the application
 */
async function init() {
  // .envファイルを読み込む
  await envConfig.load();

  // .envの値をsheetsAPIに反映（未設定の場合のみ）
  const envApiKey = envConfig.getGoogleApiKey();
  if (envApiKey && !getStoredApiKey()) {
    sheetsAPI.setApiKey(envApiKey);
  }
  const envSpreadsheetId = envConfig.getSpreadsheetId();
  if (envSpreadsheetId && !getStoredSpreadsheetId()) {
    sheetsAPI.setSpreadsheetId(envSpreadsheetId);
  }

  // 担当院リストを読み込む
  allClinics = getStoredClinics();
  selectedClinics = new Set(allClinics.map(c => c.name));

  // 受付スタッフ除外リストを読み込む
  receptionStaffList = getStoredReceptionStaff();

  // Sheets APIとパーサーを初期化
  const isAuthenticated = sheetsAPI.init();
  shiftParser.setClinics(allClinics);
  shiftParser.setReceptionStaff(receptionStaffList);

  // イベントリスナーをセットアップ
  setupEventListeners();

  // tokenClientはログインボタン押下時に初期化する（GISスクリプト読み込み完了を保証するため）

  // 認証状態に応じてUIを切り替え
  if (isAuthenticated) {
    showDashboard();
    loadSheetList();
  } else {
    showAuthRequired();
  }

  renderClinicFilter();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  settingsBtn.addEventListener('click', openSettings);
  signoutBtn.addEventListener('click', handleSignOut);

  // ログインボタン
  const signinBtn = document.getElementById('signin-btn');
  if (signinBtn) {
    signinBtn.addEventListener('click', handleSignIn);
  }
  closeSettingsBtn.addEventListener('click', closeSettings);
  cancelSettingsBtn.addEventListener('click', closeSettings);
  saveSettingsBtn.addEventListener('click', saveSettings);
  refreshBtn.addEventListener('click', loadSelectedSheet);
  
  sheetSelector.addEventListener('change', () => {
    if (sheetSelector.value) {
      loadSelectedSheet();
    }
  });
  
  selectAllBtn.addEventListener('click', () => {
    allClinics.forEach(c => selectedClinics.add(c.name));
    renderClinicFilter();
    renderTable();
  });
  
  deselectAllBtn.addEventListener('click', () => {
    selectedClinics.clear();
    renderClinicFilter();
    renderTable();
  });
  
  addClinicBtn.addEventListener('click', addNewClinic);

  // 受付スタッフ追加ボタン
  const addReceptionBtn = document.getElementById('add-reception-staff-btn');
  if (addReceptionBtn) {
    addReceptionBtn.addEventListener('click', addNewReceptionStaff);
  }
}

/**
 * Googleログインボタンのクリックハンドラ
 * OAuth2アクセストークンをリクエストする（GISスクリプト読み込み後に初期化）
 */
function handleSignIn() {
  // GISライブラリの読み込み確認
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    showError('Googleライブラリが読み込まれていません。ページを再読み込みしてください。');
    return;
  }

  const clientId = envConfig.getGoogleClientId();
  if (!clientId) {
    showError('Google Client IDが設定されていません。設定画面で確認してください。');
    openSettings();
    return;
  }

  console.log('OAuth2初期化: client_id =', clientId);

  // OAuth2トークンクライアントを初期化（押下時に行うことでGIS読み込みを保証）
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    prompt: 'select_account',
    callback: handleOAuthCallback
  });

  tokenClient.requestAccessToken();
}

/**
 * OAuth2コールバック
 */
function handleOAuthCallback(response) {
  if (response.error) {
    showError('認証エラー: ' + response.error);
    return;
  }
  sheetsAPI.setAccessToken(response.access_token);
  showDashboard();
  loadSheetList();
}

/**
 * Show auth required screen
 */
function showAuthRequired() {
  authRequired.style.display = 'flex';
  dashboard.style.display = 'none';
  signoutBtn.style.display = 'none';
}

/**
 * Show dashboard
 */
function showDashboard() {
  authRequired.style.display = 'none';
  dashboard.style.display = 'block';
  signoutBtn.style.display = 'inline-block';
}

/**
 * Handle sign out
 */
function handleSignOut() {
  sheetsAPI.signOut();
  showAuthRequired();
  currentData = null;
  sheetSelector.innerHTML = '<option value="">選択してください</option>';
  shiftTable.innerHTML = '';
  summaryBar.innerHTML = '<span class="summary-item">データを選択してください</span>';
}

/**
 * Load list of available sheets
 */
async function loadSheetList() {
  if (!sheetsAPI.spreadsheetId) {
    // No spreadsheet configured, show settings
    openSettings();
    return;
  }
  
  showLoading(true);
  hideError();
  
  try {
    const sheets = await sheetsAPI.getSheets();

    // セレクタを更新
    sheetSelector.innerHTML = '<option value="">選択してください</option>';

    // 新しい月順（降順）にソート
    const sortedSheets = sheets.sort((a, b) => {
      const monthA = parseMonthFromSheetName(a.properties.title);
      const monthB = parseMonthFromSheetName(b.properties.title);
      if (monthA && monthB) {
        if (monthA.year !== monthB.year) return monthB.year - monthA.year;
        return monthB.month - monthA.month;
      }
      return b.properties.title.localeCompare(a.properties.title);
    });

    for (const sheet of sortedSheets) {
      const title = sheet.properties.title;
      const option = document.createElement('option');
      option.value = title;
      option.textContent = title;
      sheetSelector.appendChild(option);
    }
  } catch (error) {
    // 401: トークン期限切れ → 再ログインを促す
    if (error.message.includes('再ログイン') || error.message.includes('401')) {
      sheetsAPI.signOut();
      showAuthRequired();
      showError('セッションが切れました。再ログインしてください。');
    } else {
      showError(`シート一覧の取得に失敗しました: ${error.message}`);
    }
  } finally {
    showLoading(false);
  }
}

/**
 * Load data for selected sheet
 */
async function loadSelectedSheet() {
  const sheetName = sheetSelector.value;
  if (!sheetName) return;
  
  showLoading(true);
  hideError();
  shiftTableWrapper.style.display = 'none';
  
  try {
    const data = await sheetsAPI.getSheetData(sheetName);

    // === デバッグ: APIから返される生データを表示 ===
    console.log('=== シートデータ診断 ===');
    console.log('総行数:', (data.values || []).length);
    const vals = data.values || [];
    // 先頭10行を表示
    for (let i = 0; i < Math.min(10, vals.length); i++) {
      const row = vals[i] || [];
      console.log(`Row ${i}: [${row.slice(0, 8).map(v => JSON.stringify(v)).join(', ')}${row.length > 8 ? ', ...(計' + row.length + '列)' : ''}]`);
    }
    // 「出勤人数」を含む行を探す
    const attRows = [];
    vals.forEach((row, idx) => {
      if (row && row[0] && String(row[0]).includes('出勤人数')) attRows.push(idx);
    });
    console.log('出勤人数の行:', attRows.length ? attRows.join(', ') : 'なし');
    // 出勤人数の前後3行を表示
    if (attRows.length > 0) {
      const ar = attRows[0];
      for (let i = Math.max(0, ar - 3); i <= Math.min(vals.length - 1, ar + 3); i++) {
        const row = vals[i] || [];
        console.log(`Row ${i}: A="${row[0]}", B="${row[1]}", C="${row[2]}", D="${row[3]}"`);
      }
    }
    console.log('=== 診断終了 ===');

    currentData = shiftParser.parse(data, data.formats);
    renderTable();
  } catch (error) {
    // 401: トークン期限切れ → 再ログインを促す
    if (error.message.includes('再ログイン') || error.message.includes('401')) {
      sheetsAPI.signOut();
      showAuthRequired();
      showError('セッションが切れました。再ログインしてください。');
    } else {
      showError(`データの読み込みに失敗しました: ${error.message}`);
      console.error('Parse error:', error);
    }
  } finally {
    showLoading(false);
  }
}

/**
 * Render clinic filter checkboxes
 */
function renderClinicFilter() {
  clinicFilter.innerHTML = '';
  
  for (const clinic of allClinics) {
    const label = document.createElement('label');
    label.className = 'clinic-checkbox';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = clinic.name;
    checkbox.checked = selectedClinics.has(clinic.name);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedClinics.add(clinic.name);
      } else {
        selectedClinics.delete(clinic.name);
      }
      renderTable();
    });
    
    const span = document.createElement('span');
    span.textContent = clinic.name;
    
    label.appendChild(checkbox);
    label.appendChild(span);
    clinicFilter.appendChild(label);
  }
}

/**
 * Render main shift table
 */
function renderTable() {
  if (!currentData) return;
  
  const { dates, attendance } = currentData;
  const filteredClinics = allClinics.filter(c => selectedClinics.has(c.name));
  
  if (filteredClinics.length === 0) {
    shiftTable.innerHTML = '<tr><td>院を選択してください</td></tr>';
    shiftTableWrapper.style.display = 'block';
    return;
  }
  
  // テーブルヘッダー構築
  let tableHTML = '<thead><tr>';
  tableHTML += '<th class="clinic-header">院名<br><small>（基本人数）</small></th>';

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const dayClass = date.isSaturday ? 'day-saturday' : date.isSunday ? 'day-sunday' : '';
    const selectedClass = selectedDateIndex === i ? ' selected' : '';
    tableHTML += `<th class="date-header ${dayClass}${selectedClass}" data-date-index="${i}" onclick="renderDayDetail(${i})" title="${date.day}日の出勤者を確認">${date.day}<br><small>${date.dayOfWeek}</small></th>`;
  }
  
  tableHTML += '</tr></thead>';
  
  // Build table body
  tableHTML += '<tbody>';
  
  // Calculate today's summary (use first day if no current date)
  const today = new Date().getDate();
  let summary = { shortage: [], surplus: [] };
  
  for (const clinic of filteredClinics) {
    const clinicData = attendance[clinic.name];
    if (!clinicData) continue;

    const isExpanded = expandedClinics.has(clinic.name);
    const expandIcon = isExpanded ? '▼' : '▶';
    
    // 全スタッフの固定順序を取得（除外対象を末尾に並べる）
    const firstDay = clinicData.daily[0];
    const fixedStaffOrder = [...(firstDay ? firstDay.allStaffNames || [] : [])].sort((a, b) => {
      const aExcluded = isExcludedFromCount(clinic.name, a);
      const bExcluded = isExcludedFromCount(clinic.name, b);
      if (aExcluded && !bExcluded) return 1;
      if (!aExcluded && bExcluded) return -1;
      return 0;
    });

    // 全スタッフ表示行（固定順: 出勤はそのまま、不在は斜線で表示）
    tableHTML += `<tr class="staff-expand-row">`;
    tableHTML += `<td class="clinic-cell staff-expand-label" onclick="toggleClinicExpand('${clinic.name}')" style="cursor:pointer">${expandIcon} スタッフ</td>`;
    for (const dayData of clinicData.daily) {
      const attending = (dayData.attendingStaff || []);
      const attendingBaseNames = attending.map(n => n.includes('|') ? n.split('|')[0] : n);
      // ヘルプスタッフの注記マップ
      const helpNotesMap = {};
      attending.forEach(n => {
        if (n.includes('|')) {
          helpNotesMap[n.split('|')[0]] = n.split('|')[1];
        }
      });

      let cellContent = '';
      // 固定順でスタッフを表示
      for (const name of fixedStaffOrder) {
        const isAttending = attendingBaseNames.includes(name);
        const isExcluded = isExcludedFromCount(clinic.name, name);
        const notes = helpNotesMap[name] || '';

        if (isAttending) {
          const displayName = notes ? `${name}（${notes}）` : name;
          const cls = isExcluded ? 'staff-name-item reception-staff' : 'staff-name-item';
          cellContent += `<div class="${cls}">${displayName}</div>`;
        } else if (isExpanded) {
          const cls = isExcluded ? 'staff-name-item staff-absent reception-staff' : 'staff-name-item staff-absent';
          cellContent += `<div class="${cls}">${name}</div>`;
        }
      }
      // ヘルプスタッフ（固定リストにない外部からの応援）
      for (const n of attending) {
        const baseName = n.includes('|') ? n.split('|')[0] : n;
        if (!fixedStaffOrder.includes(baseName)) {
          const notesVal = n.includes('|') ? n.split('|')[1] : '';
          const displayName = notesVal ? `${baseName}（${notesVal}）` : baseName;
          cellContent += `<div class="staff-name-item help-staff">${displayName}</div>`;
        }
      }
      if (!cellContent) cellContent = '<div class="staff-name-item no-data">-</div>';
      tableHTML += `<td class="staff-expand-cell">${cellContent}</td>`;
    }
    tableHTML += '</tr>';

    // 人数行
    tableHTML += '<tr>';
    tableHTML += `<td class="clinic-cell clinic-cell-toggle" onclick="toggleClinicExpand('${clinic.name}')" title="クリックで不在スタッフを展開/折りたたみ"><span class="expand-icon">${expandIcon}</span> ${clinic.name}<br><span class="baseline">（基本: ${clinic.baseline}名）</span></td>`;
    
    for (const dayData of clinicData.daily) {
      const statusClass = `status-${dayData.status}`;
      const staffNames = (dayData.attendingStaff || []).map(n => n.includes('|') ? n.split('|')[0] : n).join('、');
      const tooltipText = dayData.isDataMissing ? 
        'データなし' : 
        `出勤: ${dayData.count}名 / 基本: ${dayData.baseline}名${dayData.diff > 0 ? ' +' + dayData.diff : dayData.diff < 0 ? ' ' + dayData.diff : ''}${staffNames ? '\n' + staffNames : ''}`;
      
      tableHTML += `<td class="data-cell ${statusClass}">${dayData.isDataMissing ? '-' : dayData.count}<div class="cell-tooltip">${tooltipText}</div></td>`;
      
      // Add to summary for today
      if (dayData.date === today && !dayData.isDataMissing) {
        if (dayData.diff < 0) {
          summary.shortage.push({ name: clinic.name, diff: dayData.diff });
        } else if (dayData.diff > 0) {
          summary.surplus.push({ name: clinic.name, diff: dayData.diff });
        }
      }
    }
    
    tableHTML += '</tr>';
  }
  
  tableHTML += '</tbody>';
  
  shiftTable.innerHTML = tableHTML;
  shiftTableWrapper.style.display = 'block';

  // サマリーバー更新
  updateSummaryBar(summary);

  // 選択中の日があれば詳細パネルを再描画
  if (selectedDateIndex !== null) {
    renderDayDetail(selectedDateIndex);
  }
}

/**
 * Update summary bar
 */
function updateSummaryBar(summary) {
  let html = '';
  
  if (summary.shortage.length > 0) {
    html += '<div class="summary-section"><span class="summary-label">不足:</span>';
    html += summary.shortage.map(s => `<span class="summary-shortage">${s.name} ${s.diff}名</span>`).join('、');
    html += '</div>';
  }
  
  if (summary.surplus.length > 0) {
    html += '<div class="summary-section"><span class="summary-label">余剰:</span>';
    html += summary.surplus.map(s => `<span class="summary-surplus">${s.name} +${s.diff}名</span>`).join('、');
    html += '</div>';
  }
  
  if (html === '') {
    html = '<span class="summary-item">本日は全院適正人数です</span>';
  }
  
  summaryBar.innerHTML = html;
}

/**
 * 選択した日付の出勤者詳細パネルを表示する
 */
function renderDayDetail(dateIndex) {
  if (!currentData) return;

  selectedDateIndex = dateIndex;

  // 日付ヘッダーの選択状態を更新
  document.querySelectorAll('.date-header').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.dateIndex) === dateIndex);
  });

  const { dates, attendance } = currentData;
  const dateObj = dates[dateIndex];
  if (!dateObj) return;

  const filteredClinics = allClinics.filter(c => selectedClinics.has(c.name));
  const dayDetailEl = document.getElementById('day-detail');

  let html = `
    <div class="day-detail-header">
      <span>${dateObj.day}日（${dateObj.dayOfWeek}）の出勤者一覧</span>
      <button class="btn-close" onclick="closeDayDetail()">&times;</button>
    </div>
    <div class="day-detail-grid">
  `;

  for (const clinic of filteredClinics) {
    const clinicData = attendance[clinic.name];
    if (!clinicData) continue;

    const dayData = clinicData.daily.find(d => d.date === dateObj.day);
    if (!dayData) continue;

    const staffList = dayData.attendingStaff || [];
    const absentList = dayData.absentStaff || [];
    // ソート: 除外対象(オレンジ)を最後に
    const sortedStaffList = [...staffList].sort((a, b) => {
      const aBase = a.includes('|') ? a.split('|')[0] : a.replace('(H)', '');
      const bBase = b.includes('|') ? b.split('|')[0] : b.replace('(H)', '');
      const aExcluded = isExcludedFromCount(clinic.name, aBase);
      const bExcluded = isExcludedFromCount(clinic.name, bBase);
      if (aExcluded && !bExcluded) return 1;
      if (!aExcluded && bExcluded) return -1;
      return 0;
    });
    const countLabel = dayData.isDataMissing
      ? 'データなし'
      : `${dayData.count}名 / 基本${clinic.baseline}名`;

    // 出勤スタッフHTML
    let staffHTML = sortedStaffList.map(n => {
      const baseName = n.includes('|') ? n.split('|')[0] : n.replace('(H)', '');
      const notes = n.includes('|') ? n.split('|')[1] : '';
      const isHelp = n.includes('|');
      const isExcluded = isExcludedFromCount(clinic.name, baseName);
      const displayName = notes ? `${baseName}（${notes}）` : baseName;
      const cls = isExcluded ? 'clinic-day-staff-name reception-staff' : isHelp ? 'clinic-day-staff-name help-staff' : 'clinic-day-staff-name';
      return `<div class="${cls}">● ${displayName}</div>`;
    }).join('');
    // 不在スタッフHTML
    staffHTML += absentList.map(name => {
      const isExcluded = isExcludedFromCount(clinic.name, name);
      const cls = isExcluded ? 'clinic-day-staff-name staff-absent reception-staff' : 'clinic-day-staff-name staff-absent';
      return `<div class="${cls}">― ${name}</div>`;
    }).join('');
    if (!staffHTML) staffHTML = '<div class="clinic-day-staff-name no-data">（個別データなし）</div>';

    html += `
      <div class="clinic-day-card">
        <div class="clinic-day-header status-${dayData.status}">
          <span class="clinic-day-name">${clinic.name}</span>
          <span class="clinic-day-count">${countLabel}</span>
        </div>
        <div class="clinic-day-staff">${staffHTML}</div>
      </div>
    `;
  }

  html += '</div>';

  dayDetailEl.innerHTML = html;
  dayDetailEl.style.display = 'block';
  dayDetailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * 詳細パネルを閉じる
 */
function closeDayDetail() {
  document.getElementById('day-detail').style.display = 'none';
  selectedDateIndex = null;
  document.querySelectorAll('.date-header.selected').forEach(el => el.classList.remove('selected'));
}

/**
 * Show/hide loading spinner
 */
function showLoading(show) {
  loading.style.display = show ? 'flex' : 'none';
}

/**
 * Show error message
 */
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
}

/**
 * Hide error message
 */
function hideError() {
  errorMessage.style.display = 'none';
}

/**
 * Open settings modal
 */
function openSettings() {
  spreadsheetIdInput.value = sheetsAPI.spreadsheetId || getStoredSpreadsheetId() || '';
  apiKeyInput.value = sheetsAPI.apiKey || getStoredApiKey() || '';
  
  renderClinicList();
  renderBaselineSettings();
  renderReceptionStaffList();
  
  settingsModal.style.display = 'flex';
}

/**
 * Close settings modal
 */
function closeSettings() {
  settingsModal.style.display = 'none';
}

/**
 * Save settings
 */
function saveSettings() {
  const spreadsheetInput = spreadsheetIdInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  
  if (spreadsheetInput) {
    const extractedId = extractSpreadsheetId(spreadsheetInput);
    sheetsAPI.setSpreadsheetId(extractedId);
  }
  
  if (apiKey) {
    sheetsAPI.setApiKey(apiKey);
  }
  
  // Save clinics
  saveClinics(allClinics);
  shiftParser.setClinics(allClinics);

  // Save exclusion list for count calculation
  saveReceptionStaff(receptionStaffList);
  shiftParser.setReceptionStaff(receptionStaffList);
  
  closeSettings();
  
  // Reload sheet list if we have a spreadsheet ID
  if (sheetsAPI.spreadsheetId) {
    loadSheetList();
  }
}

/**
 * 設定モーダル内の院リストを描画する（ドラッグアンドドロップ対応）
 */
function renderClinicList() {
  clinicList.innerHTML = '';

  for (let i = 0; i < allClinics.length; i++) {
    const clinic = allClinics[i];
    const item = document.createElement('div');
    item.className = 'clinic-list-item';
    item.draggable = true;
    item.dataset.index = i;

    item.innerHTML = `
      <span class="clinic-name" style="flex:1">${clinic.name}</span>
      <input type="number" class="clinic-baseline" value="${clinic.baseline}" min="1" data-index="${i}" style="width:50px;margin-right:8px">
      <button type="button" class="btn-delete-clinic" data-index="${i}">&times;</button>
    `;

    // ドラッグイベント
    item.addEventListener('dragstart', (e) => {
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', i);
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      document.querySelectorAll('.clinic-list-item').forEach(el => {
        el.classList.remove('drag-over');
      });
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      item.classList.add('drag-over');
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toIndex = i;
      
      if (fromIndex !== toIndex && !isNaN(fromIndex)) {
        // 配列を並び替え
        const [moved] = allClinics.splice(fromIndex, 1);
        allClinics.splice(toIndex, 0, moved);
        
        // Setも更新
        const clinicNames = allClinics.map(c => c.name);
        selectedClinics = new Set(clinicNames.filter(n => selectedClinics.has(n)));
        
        renderClinicList();
        renderBaselineSettings();
        renderClinicFilter();
      }
    });

    // 基本人数の変更
    const baselineInput = item.querySelector('.clinic-baseline');
    baselineInput.addEventListener('change', () => {
      allClinics[i].baseline = parseInt(baselineInput.value, 10) || 3;
    });

    // 削除ボタン
    const deleteBtn = item.querySelector('.btn-delete-clinic');
    deleteBtn.addEventListener('click', () => {
      allClinics.splice(i, 1);
      renderClinicList();
      renderBaselineSettings();
      renderClinicFilter();
    });

    clinicList.appendChild(item);
  }
}

/**
 * Render baseline settings
 */
function renderBaselineSettings() {
  baselineSettings.innerHTML = '';
  
  for (const clinic of allClinics) {
    const item = document.createElement('div');
    item.className = 'baseline-item';
    
    item.innerHTML = `
      <label>${clinic.name}</label>
      <input type="number" value="${clinic.baseline}" min="1" data-clinic="${clinic.name}">
    `;
    
    const input = item.querySelector('input');
    input.addEventListener('change', () => {
      const found = allClinics.find(c => c.name === clinic.name);
      if (found) {
        found.baseline = parseInt(input.value, 10) || 3;
      }
    });
    
    baselineSettings.appendChild(item);
  }
}

/**
 * Add new clinic
 */
function addNewClinic() {
  const name = newClinicName.value.trim();
  const baseline = parseInt(newClinicBaseline.value, 10) || 3;
  
  if (!name) {
    alert('院名を入力してください');
    return;
  }
  
  if (allClinics.find(c => c.name === name)) {
    alert('同じ院名が既に存在します');
    return;
  }
  
  allClinics.push({ name, baseline });
  selectedClinics.add(name);
  
  newClinicName.value = '';
  newClinicBaseline.value = '3';
  
  renderClinicList();
  renderBaselineSettings();
  renderClinicFilter();
}

/**
 * 人数計算除外リストを設定モーダル内に描画する
 */
function renderReceptionStaffList() {
  const listEl = document.getElementById('reception-staff-list');
  if (!listEl) return;

  // 院セレクタを更新
  const clinicSelect = document.getElementById('new-reception-clinic');
  if (clinicSelect) {
    clinicSelect.innerHTML = '<option value="">院を選択</option>';
    for (const c of allClinics) {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      clinicSelect.appendChild(opt);
    }
  }

  listEl.innerHTML = '';

  if (receptionStaffList.length === 0) {
    listEl.innerHTML = '<div class="clinic-list-item" style="color:#6c757d;justify-content:center;">（未登録）</div>';
    return;
  }

  for (let i = 0; i < receptionStaffList.length; i++) {
    const entry = receptionStaffList[i];
    const item = document.createElement('div');
    item.className = 'clinic-list-item';

    item.innerHTML = `
      <span class="clinic-name"><strong>${entry.clinic}</strong> — ${entry.name}</span>
      <button type="button" class="btn-delete-clinic" data-index="${i}">&times;</button>
    `;

    const deleteBtn = item.querySelector('.btn-delete-clinic');
    deleteBtn.addEventListener('click', () => {
      receptionStaffList.splice(i, 1);
      renderReceptionStaffList();
    });

    listEl.appendChild(item);
  }
}

/**
 * 人数計算除外スタッフを追加する（院名＋名前ペア）
 */
function addNewReceptionStaff() {
  const clinicSelect = document.getElementById('new-reception-clinic');
  const nameInput = document.getElementById('new-reception-staff');
  if (!clinicSelect || !nameInput) return;

  const clinic = clinicSelect.value.trim();
  const name = nameInput.value.trim();

  if (!clinic) {
    alert('院名を選択してください');
    return;
  }
  if (!name) {
    alert('スタッフ名を入力してください');
    return;
  }

  if (receptionStaffList.some(e => e.clinic === clinic && e.name === name)) {
    alert('同じ院名・名前の組み合わせが既に登録されています');
    return;
  }

  receptionStaffList.push({ clinic, name });
  nameInput.value = '';
  renderReceptionStaffList();
}

/**
 * 指定の院名でスタッフが人数計算対象外かどうかを判定する
 */
function isExcludedFromCount(clinicName, staffName) {
  return receptionStaffList.some(e => e.clinic === clinicName && e.name === staffName);
}

/**
 * 院の展開/折りたたみを切り替える
 */
function toggleClinicExpand(clinicName) {
  if (expandedClinics.has(clinicName)) {
    expandedClinics.delete(clinicName);
  } else {
    expandedClinics.add(clinicName);
  }
  renderTable();
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', init);
