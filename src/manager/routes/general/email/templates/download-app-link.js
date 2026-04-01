/**
 * Email template: download-app-link
 * Sends a download link for the app
 */
module.exports = function (payload, config) {
  return {
    // spamFilter: {
    //   ip: 3,
    //   email: 3,
    // },
    // delay: 30000,
    payload: {
      to: {
        email: payload.email,
        name: payload.name,
      },
      sender: 'marketing',
      categories: ['download'],
      subject: `Free ${config.brand.name} download link for ${payload.name || 'you'}!`,
      template: 'core/misc/app-download-link',
      copy: false,
      data: {},
    }
  }
}
