/**
 * GET /user - Resolve user account info
 * Returns the full resolved user object for authenticated users
 */
module.exports = async ({ assistant, user }) => {

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Return full resolved user object
  return assistant.respond({ user });
};
