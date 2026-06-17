/**
 * BEM HTTP Client
 *
 * Makes authenticated HTTP calls to a running BEM server (local or production).
 * Supports admin key auth (backendManagerKey) and user token auth (API key from OAuth flow).
 */
const fetch = require('wonderful-fetch');

class BEMClient {
  constructor(options) {
    options = options || {};

    this.baseUrl = (options.baseUrl || '').replace(/\/+$/, '');
    this.backendManagerKey = options.backendManagerKey || '';
    this.userToken = options.userToken || '';
  }

  /**
   * Call a BEM route
   * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
   * @param {string} path - Route path (e.g. "admin/firestore")
   * @param {object} params - Request parameters
   * @returns {object} - Parsed response
   */
  async call(method, path, params) {
    params = params || {};
    method = method.toUpperCase();

    const url = new URL(`${this.baseUrl}/backend-manager/${path}`);

    const fetchOptions = {
      method: method,
      response: 'json',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    };

    if (this.backendManagerKey) {
      // Admin key auth — key in query/body (existing behavior)
      if (method === 'GET') {
        url.searchParams.set('backendManagerKey', this.backendManagerKey);

        for (const [key, value] of Object.entries(params)) {
          if (value === undefined || value === null) {
            continue;
          }

          url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : value);
        }
      } else {
        fetchOptions.body = JSON.stringify({
          backendManagerKey: this.backendManagerKey,
          ...params,
        });
      }
    } else if (this.userToken) {
      // User token auth — Bearer header + authenticationToken param
      fetchOptions.headers['Authorization'] = `Bearer ${this.userToken}`;

      if (method === 'GET') {
        url.searchParams.set('authenticationToken', this.userToken);

        for (const [key, value] of Object.entries(params)) {
          if (value === undefined || value === null) {
            continue;
          }

          url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : value);
        }
      } else {
        fetchOptions.body = JSON.stringify({
          authenticationToken: this.userToken,
          ...params,
        });
      }
    } else {
      // Unauthenticated
      if (method === 'GET') {
        for (const [key, value] of Object.entries(params)) {
          if (value === undefined || value === null) {
            continue;
          }

          url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : value);
        }
      } else {
        fetchOptions.body = JSON.stringify(params);
      }
    }

    const response = await fetch(url.toString(), fetchOptions);

    return response;
  }
}

module.exports = BEMClient;
