module.exports = function (payload, config) {
  const subject = `Free ${config.brand.name} download link for ${payload.name || 'you'}!`;
  const templateId = 'd-1d730ac8cc544b7cbccc8fa4a4b3f9ce';
  const groupId = 16223;

  return {
    url: 'https://us-central1-itw-creative-works.cloudfunctions.net/wrapper',
    method: 'post',
    headers: { 'Content-Type': 'application/json' },
    body: {
      backendManagerKey: 'api_25eeec01-9099-4078-92e1-034ac49bcc96',
      service: 'sendgrid',
      command: 'v3/mail/send',
      method: 'post',
      delay: 1,
      body: {
        personalizations: [
          {
            to: [
              {
                name: payload.name || 'Valued member',
                email: payload.email,
              },
            ],
            dynamic_template_data: {
              subject: subject,
              app: {
                url: config.brand.url,
                name: config.brand.name,
                wordmark: config.brand.wordmark,
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
        template_id: 'd-1d730ac8cc544b7cbccc8fa4a4b3f9ce',
        asm: {
          group_id: 16223,
        },
        categories: ['transactional', 'download', config.app.id],
      }
    }
  }
}
