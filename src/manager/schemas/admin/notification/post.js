/**
 * Schema for POST /admin/notification
 */
module.exports = function (assistant, settings, options) {
  return {
    notification: {
      types: ['object'],
      default: {
        title: 'Notification',
        body: 'Check this out',
      },
    },
    filters: {
      types: ['object'],
      default: {
        tags: false,
        owner: null,
        token: null,
        limit: null,
      },
    },
  };
};
