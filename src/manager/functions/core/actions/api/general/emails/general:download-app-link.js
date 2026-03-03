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
      template: 'main/misc/app-download-link',
      group: 'marketing',
      copy: false,
      data: {},
    }
  }
}
