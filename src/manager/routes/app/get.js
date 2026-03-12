/**
 * GET /app - Public app configuration
 * Returns a safe subset of the project's config (no secrets)
 */
module.exports = async ({ assistant, Manager }) => {
  const config = Manager.config;

  return assistant.respond(buildPublicConfig(config));
};

/**
 * Build a public-safe config object from Manager.config
 * Excludes sensitive fields: sentry, analytics, ghostii, etc.
 */
function buildPublicConfig(config) {
  return {
    brand: config.brand || {},
    github: config.github || {},
    oauth2: config.oauth2 || {},
    payment: config.payment || {},
    firebaseConfig: config.firebaseConfig || {},
    reviews: config.reviews || {},
  };
}

module.exports.buildPublicConfig = buildPublicConfig;
