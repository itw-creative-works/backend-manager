module.exports = function (payload, config) {
  const brandName = config.brand.name || '';
  const brandUrl = config.brand.url || '';
  const downloadUrl = `${brandUrl}/download`;
  const name = payload.name || '';

  return {
    // spamFilter: {
    //   ip: 3,
    //   email: 3,
    // },
    // delay: 30000,
    payload: {
      to: {
        email: payload.email,
        name: name,
      },
      sender: 'marketing',
      categories: ['download'],
      subject: `${name || 'Hey'}, your ${brandName} download link is ready!`,
      template: 'card',
      copy: false,
      data: {
        email: {
          preview: `Your ${brandName} download link is inside`,
        },
        content: {
          title: 'Your download link is ready!',
          message: `Thanks for your interest in **${brandName}**! Click the button below to head to the download page and get started.`,
          button: {
            url: downloadUrl,
            text: 'Download Now',
          },
        },
      },
    }
  }
}
