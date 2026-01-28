/**
 * BemRouter
 * Routes incoming requests to either the legacy command-based API
 * or the new RESTful middleware system.
 *
 * Detection rules:
 * - Legacy: command with ':' AND no meaningful route path
 *   - Direct function call: /us-central1/bm_api (no path after prefix)
 *   - Hosting rewrite: /backend-manager (no path after prefix)
 * - New: URL path like /backend-manager/user/sign-up (has path after prefix)
 */

function BemRouter(Manager, req, res) {
  const self = this;

  self.Manager = Manager;
  self.req = req;
  self.res = res;
}

BemRouter.prototype.resolve = function () {
  const self = this;
  const req = self.req;

  // Extract command from body/query (legacy format)
  const body = req.body || {};
  const query = req.query || {};
  const command = body.command || query.command || '';

  // Extract URL path
  const urlPath = req.path || '';

  // Strip prefix: /backend-manager/ or /bm_api/ or leading slash
  const routePath = urlPath
    .replace(/^\/(backend-manager|bm_api)\/?/, '')
    .replace(/^\//, '');

  // Legacy if: command contains ':' AND routePath is empty
  // (called via direct function URL or hosting rewrite without a sub-path)
  const isLegacy = command.includes(':') && !routePath;

  return {
    type: isLegacy ? 'legacy' : 'middleware',
    command: command,
    routePath: routePath,
    isLegacy: isLegacy,
    isNewStyle: !isLegacy,
  };
};

module.exports = BemRouter;
