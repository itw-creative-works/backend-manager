module.exports = function (payload, config) {
  const subject = `Free ${config.brand.name} download link for ${payload.name || 'you'}!`;
  const templateId = 'd-1d730ac8cc544b7cbccc8fa4a4b3f9ce';
  const groupId = 16223;

  return {
    // spamFilter: {
    //   ip: 3,
    //   email: 3,
    // },
    // delay: 1,
    body: {
      personalizations: [
        {
          to: [
            {
              name: payload.name,
              email: payload.email,
            },
          ],
          dynamic_template_data: {
            subject: subject,
            app: {
              url: config.brand.url,
              name: config.brand.name,
              wordmark: config.brand.wordmark,
              brandmark: config.brand.brandmark,
              combomark: config.brand.combomark,
            },
            footer: {
              name: 'ITW Creative Works',
              address: '4001 Inglewood Ave 101-385',
              city: 'Redondo Beach',
              state: 'CA',
              zip: '90278',
              'unsubscribe-link': `https://itwcreativeworks.com/email-preferences/?email=${encodeURIComponent(payload.email)}&asmId=${encodeURIComponent(groupId)}&templateId=${encodeURIComponent(templateId)}&appName=${encodeURIComponent(config.brand.name)}`,
            },
          },                    
        }
      ],
      from: {
        name: config.brand.name,
        email: config.brand.email,
      },        
      reply_to: {
        name: config.brand.name,
        email: config.brand.email,
      },
      subject: subject,
      template_id: templateId,
      asm: {
        group_id: groupId,
      },
      categories: ['transactional', 'download', config.app.id],
    }
  }
}
