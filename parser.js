/**
 * Spreadsheet Parser
 * シフトデータのパース処理
 *
 * 対象スプレッドシートの構造:
 *   Row 0: サマリー行（無視）
 *   Row 1: ["月", 月番号, シリアル日付1, シリアル日付2, ...]
 *   Row 2: ["", "", "日", "月", "火", ...]（曜日はC列=index2から）
 *   Row 3: 空行 or メモ行
 *   Row 4+: データ行
 *     院ヘッダー: [番号, "院名", "", "", ...]（A列に番号、B列に院名、日付列は空）
 *     スタッフ行: ["",   "氏名", "〇", "×", ...]（A列空、B列に氏名、C列以降にシフト記号）
 */

class ShiftParser {
  constructor() {
    this.clinics = [];
    this.receptionStaffMap = new Map(); // 院名 → Set(名前) のマップ（カウント除外用）
    this.nameCol = 1;      // 名前の列（デフォルト: B列 = index 1）
    this.dateStartCol = 2; // 日付データ開始列（デフォルト: C列 = index 2）
  }

  setClinics(clinics) {
    this.clinics = clinics;
  }

  setReceptionStaff(staffList) {
    this.receptionStaffMap = new Map();
    for (const entry of (staffList || [])) {
      const clinic = (entry.clinic || '').trim();
      const name = (entry.name || '').trim();
      if (!clinic || !name) continue;
      if (!this.receptionStaffMap.has(clinic)) {
        this.receptionStaffMap.set(clinic, new Set());
      }
      this.receptionStaffMap.get(clinic).add(name);
    }
    const total = [...this.receptionStaffMap.values()].reduce((s, set) => s + set.size, 0);
    console.log(`[ShiftParser] 受付スタッフ除外リスト: ${total}名`, Object.fromEntries([...this.receptionStaffMap.entries()].map(([k, v]) => [k, [...v]])));
  }

  /**
   * 指定院の受付スタッフかどうかを判定する
   */
  isReceptionStaffForClinic(clinicName, staffName) {
    const set = this.receptionStaffMap.get(clinicName);
    return set ? set.has(staffName) : false;
  }

  /**
   * シフト記号の文字コード違いを正規化する
   * 〇(U+3007)、○(U+25CB)、◯(U+25EF) 等を統一
   */
  normalizeSymbol(value) {
    if (value === null || value === undefined) return '';
    const s = String(value).trim();
    if (['○', '◯', '〇', 'Ｏ', '⚪', '⭕'].includes(s)) return '○';
    if (['×', '✕', 'Ｘ', 'ｘ', '✗'].includes(s)) return '×';
    return s;
  }

  /**
   * メインのパース処理
   */
  parse(data, formats = null) {
    const { values } = data;
    if (!values || values.length === 0) throw new Error('シートデータが空です');

    // Step 1: ヘッダー構造を自動検出
    const headerInfo = this.detectHeaderRows(values);
    this.nameCol = headerInfo.nameCol;
    this.dateStartCol = headerInfo.dateStartCol;

    // Step 2: 日付情報を抽出
    const dates = this.extractDates(values, headerInfo);
    console.log(`[ShiftParser] 日付: ${dates.length}日検出 (${dates.slice(0, 5).map(d => d.day + d.dayOfWeek).join(' ')}...)`);

    // Step 3: 院グループを検出（A列の番号を区切りに使用）
    const clinicGroups = this.findClinicGroups(values, headerInfo);
    console.log(`[ShiftParser] 全院グループ: ${clinicGroups.length}件 [${clinicGroups.map(g => g.name).join(', ')}]`);

    // Step 4: 出勤データを計算（設定済みの担当院のみ）
    const attendance = this.calculateAttendance(clinicGroups, dates, values, formats);
    console.log(`[ShiftParser] 担当院マッチ: ${Object.keys(attendance).length}件 [${Object.keys(attendance).join(', ')}]`);

    return { dates, attendance, clinicGroups };
  }

  /**
   * ヘッダー行（日付行・曜日行・名前列・日付開始列）を自動検出する
   */
  detectHeaderRows(values) {
    const dayNamesSet = new Set(['日', '月', '火', '水', '木', '金', '土']);

    // 曜日行を検出: 先頭10行で曜日名が5個以上ある行
    let dayRowIdx = -1;
    for (let ri = 0; ri < Math.min(10, values.length); ri++) {
      const row = values[ri] || [];
      let count = 0;
      for (let ci = 0; ci < Math.min(row.length, 40); ci++) {
        if (dayNamesSet.has(String(row[ci] || '').trim())) count++;
      }
      if (count >= 5) { dayRowIdx = ri; break; }
    }
    if (dayRowIdx < 0) dayRowIdx = 2;

    // 日付データの開始列を検出（曜日行で最初の曜日名が出る列）
    let dateStartCol = 2;
    const dayRow = values[dayRowIdx] || [];
    for (let ci = 0; ci < dayRow.length; ci++) {
      if (dayNamesSet.has(String(dayRow[ci] || '').trim())) {
        dateStartCol = ci;
        break;
      }
    }

    // 名前列は日付開始列の1つ手前
    const nameCol = dateStartCol > 0 ? dateStartCol - 1 : 0;

    // 日付行は曜日行の1つ上
    const dateRowIdx = dayRowIdx > 0 ? dayRowIdx - 1 : 0;

    // データ開始行: 曜日行より後で最初にB列(名前列)にデータがある行
    let dataStartRow = dayRowIdx + 1;
    for (let ri = dataStartRow; ri < Math.min(dataStartRow + 10, values.length); ri++) {
      const row = values[ri] || [];
      const nameVal = String(row[nameCol] || '').trim();
      if (nameVal) { dataStartRow = ri; break; }
    }

    console.log(`[ShiftParser] 構造検出: dateRow=${dateRowIdx}, dayRow=${dayRowIdx}, nameCol=${nameCol}(${String.fromCharCode(65 + nameCol)}列), dateStartCol=${dateStartCol}(${String.fromCharCode(65 + dateStartCol)}列), dataStart=row${dataStartRow}`);
    return { dateRowIdx, dayRowIdx, nameCol, dateStartCol, dataStartRow };
  }

  /**
   * 日付情報を抽出する（シリアル日付を日に変換）
   */
  extractDates(values, headerInfo) {
    const dates = [];
    const dayNamesSet = new Set(['日', '月', '火', '水', '木', '金', '土']);
    const dateRow = values[headerInfo.dateRowIdx] || [];
    const dayRow  = values[headerInfo.dayRowIdx]  || [];
    const maxCol  = Math.max(dateRow.length, dayRow.length);

    for (let col = headerInfo.dateStartCol; col < maxCol; col++) {
      const rawVal = col < dateRow.length ? dateRow[col] : undefined;
      const dayVal = String(col < dayRow.length ? (dayRow[col] || '') : '').trim();

      if (!dayNamesSet.has(dayVal)) continue;
      if (rawVal === null || rawVal === undefined || rawVal === '') continue;

      let dayNum;
      const numVal = typeof rawVal === 'number' ? rawVal : parseFloat(rawVal);

      if (!isNaN(numVal)) {
        if (numVal > 31) {
          // Google Sheets / Excel シリアル日付 → 日に変換
          const d = new Date(Math.round((numVal - 25569) * 86400 * 1000));
          dayNum = d.getUTCDate();
        } else if (numVal >= 1) {
          dayNum = Math.round(numVal);
        }
      } else {
        dayNum = parseInt(String(rawVal), 10);
      }

      if (!dayNum || dayNum < 1 || dayNum > 31) continue;

      dates.push({
        day: dayNum,
        dayOfWeek: dayVal,
        isSaturday: dayVal === '土',
        isSunday: dayVal === '日',
        columnIndex: col
      });
    }

    return dates;
  }

  /**
   * 院グループを検出する
   * A列に数字がある行 = 院ヘッダー（番号行）
   * 次の院ヘッダーまでの行 = その院のスタッフ行
   */
  findClinicGroups(values, headerInfo) {
    const groups = [];
    const headerRows = [];

    // Step 1: A列に数字がある行を全て検出（院ヘッダー候補）
    for (let ri = headerInfo.dataStartRow; ri < values.length; ri++) {
      const row = values[ri] || [];
      if (row.length === 0) continue;

      const colA = String(row[0] || '').trim();
      const colName = String(row[headerInfo.nameCol] || '').trim();

      // A列が数字で、名前列に値がある = 院ヘッダー
      if (/^\d+$/.test(colA) && colName !== '') {
        headerRows.push({ rowIdx: ri, number: parseInt(colA, 10), name: colName });
      }
    }

    // Step 2: 連続する院ヘッダー間をグループ化
    for (let i = 0; i < headerRows.length; i++) {
      const current = headerRows[i];
      const next = headerRows[i + 1];

      // 開始行：ヘッダーの次の行
      const startRow = current.rowIdx + 1;
      // 終了行：次のヘッダーの前まで、またはファイル末尾
      const endRow = next ? next.rowIdx - 1 : values.length - 1;

      // 院名が設定済みの担当院リストに含まれる場合のみ追加
      const matchedClinicName = this.matchClinicName(current.name);
      if (matchedClinicName) {
        groups.push({
          name: current.name,
          startRow: startRow,
          endRow: endRow,
          headerRow: current.rowIdx,
          number: current.number
        });
        console.log(`[ShiftParser] 院グループ検出: ${current.name} (row${startRow}-${endRow})`);
      }
    }

    return groups;
  }

  /**
   * 各院の出勤人数・出勤者名を計算する
   */
  calculateAttendance(clinicGroups, dates, values, formats) {
    const attendance = {};

    for (const group of clinicGroups) {
      const clinicName = this.matchClinicName(group.name);
      if (!clinicName) continue;

      const clinic = this.clinics.find(c => c.name === clinicName);
      if (!clinic) continue;

      attendance[clinicName] = { baseline: clinic.baseline, daily: [] };

      // 「グロース」行を事前検出
      let growthRowIdx = -1;
      for (let rowIdx = group.startRow; rowIdx <= group.endRow; rowIdx++) {
        if (rowIdx >= values.length) break;
        const row = values[rowIdx] || [];
        const name = String(row[this.nameCol] || '').trim();
        if (name === 'グロース' || name.includes('グロース')) {
          growthRowIdx = rowIdx;
          console.log(`[ShiftParser] ${group.name}: グロース検出 row${rowIdx}`);
          break;
        }
      }

      // 全スタッフ名を事前収集（日付に依存しない）
      const allStaffNames = [];
      for (let rowIdx = group.startRow; rowIdx <= group.endRow; rowIdx++) {
        if (rowIdx >= values.length) break;
        if (rowIdx === growthRowIdx) continue;
        const row = values[rowIdx];
        if (!row) continue;
        const colA = String(row[0] || '').trim();
        if (colA !== '' && this.nameCol > 0) continue;
        const staffName = String(row[this.nameCol] || '').trim();
        if (!staffName) continue;
        if (staffName.includes('出勤人数') || staffName.includes('合計')) continue;
        allStaffNames.push(staffName);
      }

      for (const date of dates) {
        const colIdx = date.columnIndex;
        let attendingStaff = [];

        for (let rowIdx = group.startRow; rowIdx <= group.endRow; rowIdx++) {
          if (rowIdx >= values.length) break;

          // グロース行自体はスキップ（スタッフ名ではなくヘルプ入力行）
          if (rowIdx === growthRowIdx) continue;

          const row = values[rowIdx];
          if (!row) continue;

          // A列に値がある行はサブヘッダー等 → スキップ
          const colA = String(row[0] || '').trim();
          if (colA !== '' && this.nameCol > 0) continue;

          const staffName = String(row[this.nameCol] || '').trim();
          if (!staffName) continue;

          
          // 出勤人数・合計行はスキップ
          if (staffName.includes('出勤人数') || staffName.includes('合計')) continue;

          const rawCell = colIdx < row.length ? row[colIdx] : undefined;
          if (rawCell === null || rawCell === undefined || rawCell === '') continue;

          const normalized = this.normalizeSymbol(rawCell);

          // 出勤記号（○、A等）のみカウント
          // セルに院名（新津・見附等）が入っている場合は「他院への派遣」なのでカウントしない
          if (this.isAttendanceSymbol(normalized)) {
            attendingStaff.push(staffName);
          }
        }

        // グロース行のスタッフ名を出勤者（ヘルプ）として追加
        let growthStaff = [];
        if (growthRowIdx >= 0 && growthRowIdx < values.length) {
          const growthRow = values[growthRowIdx] || [];
          const rawCell = colIdx < growthRow.length ? growthRow[colIdx] : undefined;
          if (rawCell !== null && rawCell !== undefined && rawCell !== '') {
            const cellStr = String(rawCell).trim();
            if (cellStr) {
              // セル内を改行で分割し、名前と注記をマージ
              const lines = cellStr.split(/[\n\r]+/).map(n => n.trim()).filter(Boolean);
              const merged = this.mergeGrowthLines(lines);
              for (const parsed of merged) {
                growthStaff.push(parsed);
                attendingStaff.push(parsed.name + '|' + (parsed.notes || ''));
              }
            }
          }
        }

        // 人数カウント時は受付スタッフを除外（院名で判定）
        const count = attendingStaff.filter(n => {
          const baseName = n.includes('|') ? n.split('|')[0] : n.replace('(H)', '');
          return !this.isReceptionStaffForClinic(clinicName, baseName);
        }).length;
        const isDataMissing = count === 0 && attendingStaff.length === 0;
        // 4段階ステータス: shortage / ok / surplus-minor(余力あり) / surplus(余剰)
        let status;
        if (isDataMissing) {
          status = 'no-data';
        } else if (count < clinic.baseline) {
          status = 'shortage';
        } else if (count === clinic.baseline) {
          status = 'ok';
        } else if (count === clinic.baseline + 1) {
          status = 'surplus-minor';
        } else {
          status = 'surplus';
        }
        const diff = isDataMissing ? null : count - clinic.baseline;

        // 不在スタッフ = 全スタッフ - 出勤スタッフ
        const attendingBaseNames = attendingStaff.map(n => n.includes('|') ? n.split('|')[0] : n);
        const absentStaff = allStaffNames.filter(name => !attendingBaseNames.includes(name));

        attendance[clinicName].daily.push({
          date: date.day,
          dayOfWeek: date.dayOfWeek,
          count,
          baseline: clinic.baseline,
          diff,
          status,
          helpFrom: [],
          attendingStaff,
          absentStaff,
          allStaffNames,
          isDataMissing
        });
      }
    }

    return attendance;
  }

  /**
   * グロース行のセル内改行を解析し、名前と注記をマージする
   * 例: ["森佐子", "~18:00"] → [{ name: "森佐子", notes: "~18:00" }]
   * 例: ["北村"] → [{ name: "北村", notes: "" }]
   * 例: ["PM", "北村"] → [{ name: "北村", notes: "PM" }]
   * 例: ["PM", "北村", "中川"] → [{ name: "北村", notes: "PM" }, { name: "中川", notes: "" }]
   */
  mergeGrowthLines(lines) {
    if (!lines || lines.length === 0) return [];

    // 注記パターン（時間等）: ~18:00, 18:00~, PM, 午後, 18時
    const isNoteOnly = (s) => /^[~～]?\d{1,2}[:\uff1a]\d{2}[~～]?$/.test(s)
      || /^PM$/i.test(s) || /^午後$/.test(s) || /^\d{1,2}時/.test(s);

    const result = [];
    let pendingNote = '';  // 名前の前に来た注記を一時保持
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // まず同一行内で名前+注記が含まれるか試す
      const parsed = this.parseGrowthEntry(line);

      if (parsed.notes) {
        // 同一行に名前と注記がある（例: "森佐子 ~18:00"）
        if (pendingNote) { parsed.notes = pendingNote + ' ' + parsed.notes; pendingNote = ''; }
        result.push(parsed);
      } else if (isNoteOnly(line)) {
        if (result.length > 0 && !pendingNote) {
          // 注記のみの行 → 直前の名前にマージ（例: 前行"森佐子", 当行"~18:00"）
          result[result.length - 1].notes = line;
        } else {
          // 注記が先に来た場合 → 次の名前にマージするため保持
          pendingNote = line;
        }
      } else {
        // 名前のみの行
        if (pendingNote) {
          result.push({ name: line, notes: pendingNote });
          pendingNote = '';
        } else {
          result.push({ name: line, notes: '' });
        }
      }
    }
    // 残った注記がある場合（名前なしの注記のみ）
    if (pendingNote && result.length > 0) {
      result[result.length - 1].notes = pendingNote;
    } else if (pendingNote) {
      result.push({ name: pendingNote, notes: '' });
    }
    return result;
  }

  /**
   * グロース行のセル内容を名前と注記（時間等）に分離
   * 例: "森佐子 ~18:00" → { name: "森佐子", notes: "~18:00" }
   * 例: "PM" → { name: "PM", notes: "" }
   * 例: "北村" → { name: "北村", notes: "" }
   */
  parseGrowthEntry(entry) {
    if (!entry) return { name: '', notes: '' };
    
    // 時間パターン: ~18:00, 18:00~, PM, 午後等
    const timePatterns = [
      /(.+?)\s*(~\d{1,2}:\d{2})/,      // "名前 ~18:00"
      /(.+?)\s*(\d{1,2}:\d{2}~)/,      // "名前 18:00~"
      /(.+?)\s*(PM|午後)/,             // "名前 PM"
      /(.+?)\s*(\d{1,2}時)/,           // "名前 18時"
    ];
    
    for (const pattern of timePatterns) {
      const match = entry.match(pattern);
      if (match) {
        return {
          name: match[1].trim(),
          notes: match[2].trim()
        };
      }
    }
    
    // パターンにマッチしない場合は全体を名前として返す
    return { name: entry.trim(), notes: '' };
  }

  /**
   * グループ名から設定済み院名にマッチさせる
   */
  matchClinicName(groupName) {
    for (const clinic of this.clinics) {
      if (groupName.includes(clinic.name)) {
        return clinic.name;
      }
    }
    return null;
  }


  /**
   * 出勤記号かどうかを判定する
   */
  isAttendanceSymbol(value) {
    if (!value) return false;
    return ATTENDANCE_SYMBOLS.includes(value);
  }

  /**
   * 他院からのヘルプかどうかを判定する
   */
  isHelpFromOtherClinic(value) {
    if (!value) return false;
    for (const clinic of this.clinics) {
      if (value.includes(clinic.name)) return true;
    }
    return HELP_INDICATORS.some(name => value.includes(name));
  }
}

// グローバルインスタンス
const shiftParser = new ShiftParser();
