// Runtime configuration helper
// Loads config from window.APP_CONFIG (set in /public/config.js at container startup)

interface AppConfig {
  SETTING_SERVICE_API_URL: string;
  SETTING_SERVICE_TIMEOUT: number;
}

declare global {
  interface Window {
    APP_CONFIG?: AppConfig;
  }
}

export const getConfig = (): AppConfig => {
  if (window.APP_CONFIG) {
    return window.APP_CONFIG;
  }
  
  // Fallback values
  return {
    SETTING_SERVICE_API_URL: 'http://localhost:8080',
    SETTING_SERVICE_TIMEOUT: 5000,
  };
};

export const config = getConfig();
