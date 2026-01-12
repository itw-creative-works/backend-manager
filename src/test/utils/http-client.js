const fetch = require('wonderful-fetch');

/**
 * HTTP Client wrapper for making API calls during tests
 * Supports default auth via setAuth() and per-request auth via as()
 */
class HttpClient {
  constructor(options) {
    options = options || {};

    this.baseUrl = options.functionsUrl || '';
    this.defaultHeaders = {};
    this.defaultBody = {};
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
        // Use Authorization header with privateKey as Bearer token
        this.defaultHeaders['Authorization'] = `Bearer ${credentials.privateKey}`;
        this.defaultBody = {};
        break;
      case 'backendManagerKey':
        // Pass backendManagerKey in body
        delete this.defaultHeaders['Authorization'];
        this.defaultBody = { backendManagerKey: credentials.key };
        break;
      case 'bearer':
        // Use standard Bearer token (JWT)
        this.defaultHeaders['Authorization'] = `Bearer ${credentials.token}`;
        this.defaultBody = {};
        break;
      case 'none':
      default:
        delete this.defaultHeaders['Authorization'];
        this.defaultBody = {};
        break;
    }
  }

  /**
   * Get auth config for a specific account type
   * @param {string} accountType - 'admin', 'basic', 'premium', 'expired', 'none'
   * @returns {object} - { headers, body } for the request
   */
  _getAuthConfig(accountType) {
    if (accountType === 'none') {
      return { headers: {}, body: {} };
    }

    if (accountType === 'admin') {
      return {
        headers: {},
        body: { backendManagerKey: this.backendManagerKey },
      };
    }

    // User accounts - use privateKey
    const account = this.accounts?.[accountType];
    if (account?.privateKey) {
      return {
        headers: { 'Authorization': `Bearer ${account.privateKey}` },
        body: {},
      };
    }

    // Fallback to no auth if account not found
    return { headers: {}, body: {} };
  }

  /**
   * Create a request helper bound to a specific auth context
   * Usage: await ctx.http.as('admin').command('admin:write', data)
   * @param {string} accountType - 'admin', 'basic', 'premium', 'expired', 'none'
   * @returns {object} - Object with command(), post(), get() methods
   */
  as(accountType) {
    const authConfig = this._getAuthConfig(accountType);

    return {
      command: (command, payload, options) => {
        return this._commandWithAuth(command, payload, authConfig, options);
      },
      post: (endpoint, body, options) => {
        return this._postWithAuth(endpoint, body, authConfig, options);
      },
      get: (endpoint, params, options) => {
        return this._getWithAuth(endpoint, params, authConfig, options);
      },
    };
  }

  /**
   * Create a request helper with a specific private key
   * Useful when testing with dynamically generated keys
   * Usage: await ctx.http.withPrivateKey(newKey).command('user:action', data)
   * @param {string} privateKey - The private key to use for authentication
   * @returns {object} - Object with command(), post(), get() methods
   */
  withPrivateKey(privateKey) {
    const authConfig = {
      headers: { 'Authorization': `Bearer ${privateKey}` },
      body: {},
    };

    return {
      command: (command, payload, options) => {
        return this._commandWithAuth(command, payload, authConfig, options);
      },
      post: (endpoint, body, options) => {
        return this._postWithAuth(endpoint, body, authConfig, options);
      },
      get: (endpoint, params, options) => {
        return this._getWithAuth(endpoint, params, authConfig, options);
      },
    };
  }

  /**
   * Internal: Make command with specific auth
   */
  async _commandWithAuth(command, payload, authConfig, options) {
    options = options || {};

    return this._postWithAuth('/bm_api', {
      command: command,
      payload: payload || {},
      options: options.commandOptions || {},
    }, authConfig, options);
  }

  /**
   * Internal: Make POST with specific auth
   */
  async _postWithAuth(endpoint, body, authConfig, options) {
    options = options || {};

    const url = `${this.baseUrl}${endpoint}`;
    const requestBody = { ...authConfig.body, ...body };
    const headers = { ...authConfig.headers, ...options.headers };

    try {
      const response = await fetch(url, {
        method: 'post',
        response: 'json',
        timeout: options.timeout || this.timeout,
        headers: headers,
        body: requestBody,
      });

      return {
        success: true,
        status: response.status || 200,
        data: response,
        error: null,
      };
    } catch (error) {
      return {
        success: false,
        status: error.status || error.code || 500,
        data: null,
        error: error.message || error,
      };
    }
  }

  /**
   * Internal: Make GET with specific auth
   */
  async _getWithAuth(endpoint, params, authConfig, options) {
    options = options || {};
    params = params || {};

    const queryString = Object.keys(params)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    const url = queryString
      ? `${this.baseUrl}${endpoint}?${queryString}`
      : `${this.baseUrl}${endpoint}`;

    const headers = { ...authConfig.headers, ...options.headers };

    try {
      const response = await fetch(url, {
        method: 'get',
        response: 'json',
        timeout: options.timeout || this.timeout,
        headers: headers,
      });

      return {
        success: true,
        status: response.status || 200,
        data: response,
        error: null,
      };
    } catch (error) {
      return {
        success: false,
        status: error.status || error.code || 500,
        data: null,
        error: error.message || error,
      };
    }
  }

  /**
   * Make a POST request (uses default auth from setAuth)
   * @param {string} endpoint - API endpoint (e.g., '/bm_api')
   * @param {object} body - Request body
   * @param {object} options - Additional options
   * @returns {Promise<object>} Response data
   */
  async post(endpoint, body, options) {
    const authConfig = {
      headers: { ...this.defaultHeaders },
      body: { ...this.defaultBody },
    };
    return this._postWithAuth(endpoint, body, authConfig, options);
  }

  /**
   * Make a GET request (uses default auth from setAuth)
   * @param {string} endpoint - API endpoint
   * @param {object} params - Query parameters
   * @param {object} options - Additional options
   * @returns {Promise<object>} Response data
   */
  async get(endpoint, params, options) {
    const authConfig = {
      headers: { ...this.defaultHeaders },
      body: {},
    };
    return this._getWithAuth(endpoint, params, authConfig, options);
  }

  /**
   * Call a bm_api command (uses default auth from setAuth)
   * @param {string} command - Command name (e.g., 'general:generate-uuid')
   * @param {object} payload - Command payload
   * @param {object} options - Additional options
   * @returns {Promise<object>} Response data
   */
  async command(command, payload, options) {
    const authConfig = {
      headers: { ...this.defaultHeaders },
      body: { ...this.defaultBody },
    };
    return this._commandWithAuth(command, payload, authConfig, options);
  }
}

module.exports = HttpClient;
