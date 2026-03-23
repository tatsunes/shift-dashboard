/**
 * Environment configuration loader
 * Fetches .env file and parses key-value pairs
 */

class EnvConfig {
  constructor() {
    this.config = {};
  }

  /**
   * Load .env file
   */
  async load() {
    try {
      const response = await fetch('.env');
      if (!response.ok) {
        console.warn('.env file not found, using defaults');
        return false;
      }
      
      const text = await response.text();
      this.parse(text);
      return true;
    } catch (e) {
      console.warn('Error loading .env:', e);
      return false;
    }
  }

  /**
   * Parse env file content
   */
  parse(content) {
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      
      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1).trim();
      
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      this.config[key] = value;
    }
  }

  /**
   * Get config value
   */
  get(key, defaultValue = '') {
    return this.config[key] || defaultValue;
  }

  /**
   * Get Google Client ID
   */
  getGoogleClientId() {
    return this.get('VITE_GOOGLE_CLIENT_ID');
  }

  /**
   * Get Google API Key
   */
  getGoogleApiKey() {
    return this.get('VITE_GOOGLE_API_KEY');
  }

  /**
   * Get default spreadsheet ID
   */
  getSpreadsheetId() {
    return this.get('VITE_DEFAULT_SPREADSHEET_ID');
  }
}

// Create global instance
const envConfig = new EnvConfig();
