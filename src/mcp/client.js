/**
 * BEM HTTP Client
 *
 * Makes authenticated HTTP calls to a running BEM server (local or production).
 */
const fetch = require('wonderful-fetch');

class BEMClient {
  constructor(options) {
    options = options || {};

    this.baseUrl = (options.baseUrl || '').replace(/\/+$/, '');
    this.backendManagerKey = options.backendManagerKey || '';
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

    if (method === 'GET') {
      // GET: auth + params go in query string
      url.searchParams.set('backendManagerKey', this.backendManagerKey);

      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) {
          continue;
        }

        // Serialize objects/arrays as JSON strings for query params
        url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : value);
      }
    } else {
      // POST/PUT/DELETE: auth + params go in body
      fetchOptions.body = JSON.stringify({
        backendManagerKey: this.backendManagerKey,
        ...params,
      });
    }

    const response = await fetch(url.toString(), fetchOptions);

    return response;
  }
}

module.exports = BEMClient;
