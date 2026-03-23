/**
 * Configuration and default settings for Shift Dashboard
 * 
 * SECURITY NOTICE: Never commit API keys to public repositories.
 * Configure API credentials through the Settings UI or localStorage.
 */

// Google OAuth Configuration
// CLIENT_ID is public by design (embedded in web pages)
// API_KEY should be set via Settings UI (not hardcoded in public repos)
const GOOGLE_CONFIG = {
  CLIENT_ID: '1069776502413-qbraeog9e2g9lv2jicod0rqr1ms6adon.apps.googleusercontent.com',
  API_KEY: '',
  DEFAULT_SPREADSHEET_ID: '1a1phHyWAKss0EG-9BrhHOHKGhD9GY7p-lydfy3R5lIA'
};

// Default clinic list with baseline numbers
const DEFAULT_CLINICS = [
  { name: '新潟', baseline: 4 },
  { name: '三条', baseline: 5 },
  { name: '藤見', baseline: 6 },
  { name: '長岡', baseline: 9 },
  { name: '万代', baseline: 3 },
  { name: '上所', baseline: 4 },
  { name: '寺尾台', baseline: 4 },
  { name: '新発田', baseline: 6 },
  { name: '新津', baseline: 4 },
  { name: '県央', baseline: 5 },
  { name: '亀田', baseline: 4 },
  { name: '関屋', baseline: 4 },
  { name: '見附', baseline: 4 }
];

// Shift symbols that count as attendance
const ATTENDANCE_SYMBOLS = ['○', 'A', '出勤'];

// Symbols that indicate help from other clinics
const HELP_INDICATORS = ['新潟', '三条', '藤見', '長岡', '万代', '上所', '寺尾台', '新発田', '新津', '県央', '亀田', '関屋', '見附'];

// Configuration storage keys
const STORAGE_KEYS = {
  CLINICS: 'shift_dashboard_clinics',
  SPREADSHEET_ID: 'shift_dashboard_spreadsheet_id',
  API_KEY: 'shift_dashboard_api_key',
  ACCESS_TOKEN: 'shift_dashboard_access_token',
  USER: 'shift_dashboard_user',
  RECEPTION_STAFF: 'shift_dashboard_reception_staff'
};

/**
 * Get stored clinics or return defaults
 */
function getStoredClinics() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.CLINICS);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error reading clinics from storage:', e);
  }
  return [...DEFAULT_CLINICS];
}

/**
 * Save clinics to storage
 */
function saveClinics(clinics) {
  try {
    localStorage.setItem(STORAGE_KEYS.CLINICS, JSON.stringify(clinics));
    return true;
  } catch (e) {
    console.error('Error saving clinics to storage:', e);
    return false;
  }
}

/**
 * Get spreadsheet ID from storage
 */
function getStoredSpreadsheetId() {
  try {
    return localStorage.getItem(STORAGE_KEYS.SPREADSHEET_ID) || '';
  } catch (e) {
    return '';
  }
}

/**
 * Save spreadsheet ID to storage
 */
function saveSpreadsheetId(id) {
  try {
    localStorage.setItem(STORAGE_KEYS.SPREADSHEET_ID, id);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get API key from storage
 */
function getStoredApiKey() {
  try {
    return localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
  } catch (e) {
    return '';
  }
}

/**
 * Save API key to storage
 */
function saveApiKey(key) {
  try {
    localStorage.setItem(STORAGE_KEYS.API_KEY, key);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Extract spreadsheet ID from URL or return as-is if already an ID
 */
function extractSpreadsheetId(input) {
  if (!input) return '';
  
  // Check if it's already an ID (no slashes, typical length)
  if (!input.includes('/') && input.length > 20) {
    return input;
  }
  
  // Try to extract from URL
  const patterns = [
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    /\/([a-zA-Z0-9_-]{40,})/,
    /([a-zA-Z0-9_-]{44})/
  ];
  
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return input;
}

/**
 * Get stored reception staff list or return empty
 */
function getStoredReceptionStaff() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.RECEPTION_STAFF);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 旧フォーマット（文字列配列）からの移行: [{clinic:'', name:'旧名'}] に変換
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
        console.warn('[config] 受付スタッフ旧フォーマット検出 → クリアします。設定画面で再登録してください。');
        localStorage.removeItem(STORAGE_KEYS.RECEPTION_STAFF);
        return [];
      }
      return parsed;
    }
  } catch (e) {
    console.error('Error reading reception staff from storage:', e);
  }
  return [];
}

/**
 * Save reception staff list to storage
 */
function saveReceptionStaff(staffList) {
  try {
    localStorage.setItem(STORAGE_KEYS.RECEPTION_STAFF, JSON.stringify(staffList));
    return true;
  } catch (e) {
    console.error('Error saving reception staff to storage:', e);
    return false;
  }
}

/**
 * Parse month from sheet name
 */
function parseMonthFromSheetName(sheetName) {
  // Match patterns like "2026.3", "2026-3", "R8.3", etc.
  const patterns = [
    /(\d{4})[.-](\d{1,2})/,
    /R?(\d+)[.-](\d{1,2})/
  ];
  
  for (const pattern of patterns) {
    const match = sheetName.match(pattern);
    if (match) {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]);
      // Adjust for Japanese era if needed (R = Reiwa, starting 2019)
      let fullYear = year;
      if (sheetName.includes('R') && year < 100) {
        fullYear = 2018 + year; // Reiwa started in 2019
      }
      return { year: fullYear, month };
    }
  }
  
  return null;
}

/**
 * Get Google Client ID from configuration
 */
function getGoogleClientId() {
  return GOOGLE_CONFIG.CLIENT_ID || '';
}

/**
 * Get Google API Key from configuration
 */
function getGoogleApiKey() {
  return GOOGLE_CONFIG.API_KEY || '';
}

/**
 * Get default spreadsheet ID from configuration
 */
function getDefaultSpreadsheetId() {
  return GOOGLE_CONFIG.DEFAULT_SPREADSHEET_ID || '';
}
