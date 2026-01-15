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
      categories: ['download'],
      subject: `Free ${config.brand.name} download link for ${payload.name || 'you'}!`,
      template: 'd-1d730ac8cc544b7cbccc8fa4a4b3f9ce',
      group: 25927,
      copy: false,
      data: {},
    }
  }
}
