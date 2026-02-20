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
 * Excludes sensitive fields: sentry, google_analytics, ghostii, etc.
 */
function buildPublicConfig(config) {
  return {
    id: config.app?.id,
    name: config.brand?.name,
    description: config.brand?.description,
    url: config.brand?.url,
    email: config.brand?.contact?.email,
    images: config.brand?.images || {},
    github: {
      user: config.github?.user,
      repo: (config.github?.repo_website || '').split('/').pop(),
    },
    reviews: config.reviews || {},
    firebaseConfig: config.firebaseConfig || {},
    payment: {
      processors: config.payment?.processors || {},
      products: (config.payment?.products || []).map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        limits: p.limits || {},
        trial: p.trial || {},
        prices: p.prices || {},
      })),
    },
  };
}

module.exports.buildPublicConfig = buildPublicConfig;
