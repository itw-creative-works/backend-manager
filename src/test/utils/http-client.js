const fetch = require('wonderful-fetch');

/**
 * HTTP Client wrapper for making API calls during tests
 * Supports:
 *   - Legacy commands: http.command('general:generate-uuid', payload)
 *   - New RESTful API: http.post('general/uuid', body), http.get(...), http.delete(...)
 *   - Auth contexts: http.as('admin').post(...), http.as('basic').get(...)
 */
class HttpClient {
  constructor(options) {
    options = options || {};

    // Use hosting URL (port 5002) for all requests, not functions URL (port 5001)
    // All requests go through /backend-manager which rewrites to bm_api function
    this.baseUrl = options.hostingUrl || '';
    this.defaultHeaders = {};
    this.defaultAuthParams = {};
    this.timeout = options.timeout || 30000;

    // Store accounts reference for as() method
    this.accounts = options.accounts || null;
    this.backendManagerKey = options.backendManagerKey || '';
  }

  /**
   * Set authentication for subsequent requests
   * @param {string} type - 'none', 'privateKey', 'backendManagerKey', 'bearer'
   * @param {object} credentials - Credentials object
   */
  setAuth(type, credentials) {
    credentials = credentials || {};

    switch (type) {
      case 'privateKey':
        this.defaultHeaders['Authorization'] = `Bearer ${credentials.privateKey}`;
        this.defaultAuthParams = {};
        break;
      case 'backendManagerKey':
        delete this.defaultHeaders['Authorization'];
        this.defaultAuthParams = { backendManagerKey: credentials.key };
        break;
      case 'bearer':
        this.defaultHeaders['Authorization'] = `Bearer ${credentials.token}`;
        this.defaultAuthParams = {};
        break;
      case 'none':
      default:
        delete this.defaultHeaders['Authorization'];
        this.defaultAuthParams = {};
        break;
    }
  }

  /**
   * Get auth config for a specific account type
   * @param {string} accountType - 'admin', 'basic', 'premium', 'expired', 'none'
   * @returns {object} - { headers, authParams } for the request
   */
  _getAuthConfig(accountType) {
    if (accountType === 'none') {
      return { headers: {}, authParams: {} };
    }

    if (accountType === 'admin') {
      return {
        headers: {},
        authParams: { backendManagerKey: this.backendManagerKey },
      };
    }

    // User accounts - use privateKey
    const account = this.accounts?.[accountType];
    if (account?.privateKey) {
      return {
        headers: { 'Authorization': `Bearer ${account.privateKey}` },
        authParams: {},
      };
    }

    // Fallback to no auth if account not found
    return { headers: {}, authParams: {} };
  }

  /**
   * Build default auth config from instance defaults
   */
  _getDefaultAuthConfig() {
    return {
      headers: { ...this.defaultHeaders },
      authParams: { ...this.defaultAuthParams },
    };
  }

  /**
   * Format response consistently for success/error cases
   */
  _formatResponse(response, error) {
    if (error) {
      return {
        success: false,
        status: error.status || error.code || 500,
        data: null,
        error: error.message || error,
      };
    }

    return {
      success: true,
      status: response.status || 200,
      data: response,
      error: null,
    };
  }

  /**
   * Create a request helper bound to a specific auth context
   * Usage:
   *   - Legacy: http.as('admin').command('admin:write', data)
   *   - New RESTful: http.as('admin').post('marketing/contact', data)
   *   - New RESTful: http.as('none').get('general/uuid', {version: '4'})
   * @param {string} accountType - 'admin', 'basic', 'premium', 'expired', 'none'
   * @returns {object} - Object with command(), get(), post(), put(), delete() methods
   */
  as(accountType) {
    const authConfig = this._getAuthConfig(accountType);

    return {
      command: (command, payload, options) => this._commandWithAuth(command, payload, authConfig, options),
      get: (route, params, options) => this._fetch('get', route, params, authConfig, options),
      post: (route, body, options) => this._fetch('post', route, body, authConfig, options),
      put: (route, body, options) => this._fetch('put', route, body, authConfig, options),
      delete: (route, body, options) => this._fetch('delete', route, body, authConfig, options),
    };
  }

  /**
   * Create a request helper with a specific private key
   * Useful when testing with dynamically generated keys
   * Usage:
   *   - Legacy: http.withPrivateKey(key).command('user:action', data)
   *   - New RESTful: http.withPrivateKey(key).post('user/profile', data)
   * @param {string} privateKey - The private key to use for authentication
   * @returns {object} - Object with command(), get(), post(), put(), delete() methods
   */
  withPrivateKey(privateKey) {
    const authConfig = {
      headers: { 'Authorization': `Bearer ${privateKey}` },
      authParams: {},
    };

    return {
      command: (command, payload, options) => this._commandWithAuth(command, payload, authConfig, options),
      get: (route, params, options) => this._fetch('get', route, params, authConfig, options),
      post: (route, body, options) => this._fetch('post', route, body, authConfig, options),
      put: (route, body, options) => this._fetch('put', route, body, authConfig, options),
      delete: (route, body, options) => this._fetch('delete', route, body, authConfig, options),
    };
  }

  /**
   * Internal: Make legacy command with specific auth
   * Legacy commands use POST with command in body: {command: 'general:generate-uuid', payload: {...}}
   */
  async _commandWithAuth(command, payload, authConfig, options) {
    options = options || {};

    return this._fetch('post', '/backend-manager/', {
      command: command,
      payload: payload || {},
      options: options.commandOptions || {},
    }, authConfig, options, true);
  }

  /**
   * Internal: Make HTTP request with specific auth
   * - GET: auth params merged into query string
   * - POST/PUT/DELETE: auth params merged into body
   */
  async _fetch(method, route, data, authConfig, options, isFullEndpoint) {
    options = options || {};
    data = data || {};

    const isGet = method === 'get';
    const endpoint = isFullEndpoint ? route : `/backend-manager/${route}`;
    const url = `${this.baseUrl}${endpoint}`;
    const headers = { ...authConfig.headers, ...options.headers };

    const fetchOptions = {
      method: method,
      response: 'json',
      timeout: options.timeout || this.timeout,
      headers: headers,
    };

    // GET: auth params go into query string
    // POST/PUT/DELETE: auth params go into body
    if (isGet) {
      fetchOptions.query = { ...authConfig.authParams, ...data };
    } else {
      fetchOptions.body = { ...authConfig.authParams, ...data };
    }

    try {
      const response = await fetch(url, fetchOptions);
      return this._formatResponse(response);
    } catch (error) {
      return this._formatResponse(null, error);
    }
  }

  // ==================== Public API ====================
  // These use the default auth set via setAuth()

  /**
   * Make a RESTful POST request (uses default auth)
   */
  async post(route, body, options) {
    return this._fetch('post', route, body, this._getDefaultAuthConfig(), options);
  }

  /**
   * Make a RESTful GET request (uses default auth)
   */
  async get(route, params, options) {
    return this._fetch('get', route, params, this._getDefaultAuthConfig(), options);
  }

  /**
   * Make a RESTful PUT request (uses default auth)
   */
  async put(route, body, options) {
    return this._fetch('put', route, body, this._getDefaultAuthConfig(), options);
  }

  /**
   * Make a RESTful DELETE request (uses default auth)
   */
  async delete(route, body, options) {
    return this._fetch('delete', route, body, this._getDefaultAuthConfig(), options);
  }

  /**
   * Call a bm_api command (uses default auth from setAuth)
   */
  async command(command, payload, options) {
    return this._commandWithAuth(command, payload, this._getDefaultAuthConfig(), options);
  }
}

module.exports = HttpClient;
