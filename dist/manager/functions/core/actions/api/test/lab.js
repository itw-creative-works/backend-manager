const fetch = require('node-fetch');
const _ = require('lodash')

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

    if (!payload.user.roles.admin) {
      self.assistant.log('User is not admin')
    }

    const url = 'https://itwcreativeworks.com';
    const title = 'https://itwcreativeworks.com';
    const icon = 'https://cdn.itwcreativeworks.com/assets/itw-creative-works/images/socials/itw-creative-works-brandmark-square-black-1024x1024.png?cb=1651834176';


    await Api.import('admin:send-notification', {
      title: 'New blog post!',
      click_action: url,
      body: `"${title}" was just published on our blog. It's a great read and we think you'll enjoy the content!`,
      icon: icon,
    })
    .then(library => {

      console.log('----');

      library.main()
      .then(result => {
        return resolve({data: {success: true}});
      })
      .catch(e => {
        console.error('Error', e);
      })

    })

    // if (error) {
    //
    // }

  });

};


module.exports = Module;
