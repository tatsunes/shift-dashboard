/**
 * Google Sheets API integration
 * Handles authentication and data fetching
 */

class SheetsAPI {
  constructor() {
    this.accessToken = null;
    this.spreadsheetId = '';
    this.apiKey = '';
    this.discoveryDocs = ['https://sheets.googleapis.com/$discovery/rest?version=v4'];
    this.scopes = 'https://www.googleapis.com/auth/spreadsheets.readonly';
    this.user = null;
  }

  /**
   * Initialize with stored credentials
   */
  init() {
    this.spreadsheetId = getStoredSpreadsheetId();
    this.apiKey = getStoredApiKey();
    
    // Try to restore access token from storage
    try {
      const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      const user = localStorage.getItem(STORAGE_KEYS.USER);
      if (token) {
        this.accessToken = token;
        this.user = user ? JSON.parse(user) : null;
        return true;
      }
    } catch (e) {
      console.error('Error restoring token:', e);
    }
    return false;
  }

  /**
   * Set access token from Google Sign-In
   */
  setAccessToken(token, user = null) {
    this.accessToken = token;
    this.user = user;
    try {
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
      if (user) {
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      }
    } catch (e) {
      console.error('Error saving token:', e);
    }
  }

  /**
   * Clear authentication
   */
  signOut() {
    this.accessToken = null;
    this.user = null;
    try {
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
    } catch (e) {
      console.error('Error clearing token:', e);
    }
  }

  /**
   * Check if authenticated
   */
  isAuthenticated() {
    return !!this.accessToken;
  }

  /**
   * Set spreadsheet ID
   */
  setSpreadsheetId(id) {
    this.spreadsheetId = id;
    saveSpreadsheetId(id);
  }

  /**
   * Set API key
   */
  setApiKey(key) {
    this.apiKey = key;
    saveApiKey(key);
  }

  /**
   * Get authorization headers
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    return headers;
  }

  /**
   * Get list of sheets in spreadsheet
   */
  async getSheets() {
    if (!this.spreadsheetId) {
      throw new Error('スプレッドシートIDが設定されていません');
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}` +
                (this.apiKey ? `?key=${this.apiKey}` : '');
    
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      const error = await response.json();
      if (response.status === 401) {
        throw new Error('認証が切れました。再ログインしてください。');
      }
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.sheets || [];
  }

  /**
   * Get data from a specific sheet with formatting
   */
  async getSheetData(sheetName) {
    if (!this.spreadsheetId) {
      throw new Error('スプレッドシートIDが設定されていません');
    }

    // First, get the values
    const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(sheetName)}` +
                      `?valueRenderOption=UNFORMATTED_VALUE` +
                      (this.apiKey ? `&key=${this.apiKey}` : '');
    
    const valuesResponse = await fetch(valuesUrl, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!valuesResponse.ok) {
      const error = await valuesResponse.json();
      if (valuesResponse.status === 401) {
        throw new Error('認証が切れました。再ログインしてください。');
      }
      throw new Error(error.error?.message || `HTTP ${valuesResponse.status}`);
    }

    const valuesData = await valuesResponse.json();
    
    // Then, get formatting information (including background colors)
    const formatUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}` +
                      `?includeGridData=true` +
                      `&ranges=${encodeURIComponent(sheetName)}` +
                      (this.apiKey ? `&key=${this.apiKey}` : '');
    
    let formatData = null;
    try {
      const formatResponse = await fetch(formatUrl, {
        method: 'GET',
        headers: this.getHeaders()
      });
      
      if (formatResponse.ok) {
        formatData = await formatResponse.json();
      }
    } catch (e) {
      console.warn('Could not fetch formatting data:', e);
    }

    return {
      values: valuesData.values || [],
      formats: formatData
    };
  }

  /**
   * Test connection to spreadsheet
   */
  async testConnection() {
    try {
      await this.getSheets();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Create global instance
const sheetsAPI = new SheetsAPI();
