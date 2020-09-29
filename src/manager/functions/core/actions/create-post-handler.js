let Poster;
let pathApi;
let os;
// let JSON5;
const fetch = require('node-fetch');
const Mailchimp = require('mailchimp-api-v3');
const { get, merge } = require('lodash');

let Module = {
  init: async function (Manager, data) {
    const self = this;
    self.Manager = Manager;
    self.libraries = Manager.libraries;
    self.assistant = Manager.Assistant({req: data.req, res: data.res});
    self.req = data.req;
    self.res = data.res;

    return self;
  },
  main: async function() {
    let self = this;
    let libraries = self.libraries;
    let assistant = self.assistant;
    let req = self.req;
    let res = self.res;
    let mailchimp;

    let response = {
      status: 200,
    };

    // authenticate admin!
    let user = await assistant.authenticate();

    // Analytics
    let analytics = self.Manager.Analytics({
      uuid: user.auth.uid,
    })
    .event({
      category: 'admin',
      action: 'post-created',
      // label: '',
    });

    assistant.log('Creating campagin with data', assistant.request.data)

    return libraries.cors(req, res, async () => {

      if (!user.roles.admin) {
        response.status = 401;
        response.error = new Error('Unauthenticated, admin required.');
        assistant.error(response.error, {environment: 'production'})
      } else {
        mailchimp = new Mailchimp(get(self.Manager.config, 'mailchimp.key', ''));
        await fetch(`https://us-central1-${self.Manager.project.projectId}.cloudfunctions.net/bm_sendNotification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(merge({}, {
              payload: {
                title: 'New blog post!',
                click_action: assistant.request.data.url,
                body: `"${assistant.request.data.title}" was just published on our blog. It's a great read and we think you'll enjoy the content!`,
                icon: assistant.request.data.imageUrl,
              }
            },
            assistant.request.data
          )),
        })
        .then(res => {
          if (res.status >= 200 && res.status < 300) {
            res.json()
            .then(function (data) {
              assistant.log('Push notification response', data)
            })
          } else {
            return res.text()
            .then(function (data) {
              throw new Error(data || res.statusTest || 'Unknown error.')
            })
          }
        })
        .catch(e => {
          assistant.error('Failed to send push notification', e);
        })
        return res.send('DONE');
        await mailchimp.post(`/campaigns`, {
          "type": "regular",
        	"recipients": {
        		"list_id": get(self.Manager.config, 'mailchimp.list_id', ''),
        	},
        	"settings": {
        		"subject_line": `${assistant.request.data.title}`,
        		// "preview_text": "",
        		"title": `Blog post: "${assistant.request.data.title}"`,
        		"from_name": get(self.Manager.config, 'brand.name'),
        		"reply_to": get(self.Manager.config, 'brand.email'),
        		"use_conversation": false,
        		"to_name": "*|FNAME|*",
        		// "folder_id": "",
        		"authenticate": false,
        	},
        })
        .then(async (campaign) => {
          assistant.log('Created campaign', campaign);
          await fetch(`https://email.itwcreativeworks.com/general/mailchimp-blog-syndication/?cb=${Math.random()}`)
          .then(async (fetchResponse) => {
            if (fetchResponse.status >= 200 && fetchResponse.status < 300) {
              let html = await fetchResponse.text();
              html = html
                .replace(/{ENTRY_TITLE}/g, assistant.request.data.title)
                .replace(/{ENTRY_URL}/g, assistant.request.data.url)
                .replace(/{ENTRY_IMAGE_URL}/g, assistant.request.data.imageUrl)
                .replace(/{ENTRY_CONTENT}/g, (assistant.request.data.content || '').split('\n')[0])
                .replace(/{ENTRY_PUBLISHED}/g, assistant.request.data.published)
                .replace(/{ENTRY_AUTHOR}/g, assistant.request.data.author)
                .replace(/{ENTRY_TAGS}/g, assistant.request.data.tags)
                .replace(/{BRAND_NAME}/g, get(self.Manager.config, 'brand.name'))
                .replace(/{BRAND_LOGO_COMBOMARK}/g, get(self.Manager.config, 'brand.combomark'))
                .replace(/{BRAND_LOGO_WORDMARK}/g, get(self.Manager.config, 'brand.wordmark'))
              // assistant.log('Resolved email', html);
              await mailchimp.put(`/campaigns/${campaign.id}/content`, {
                "content": 'regular',
              	"html": html,
              })
              .then(async (content) => {
                await mailchimp.post(`/campaigns/${campaign.id}/actions/send`)
                assistant.log('Mailchimp campaign created and sent', campaign, {environment: 'production'});
              })
            } else {
              throw new Error('Failed to fetch.');
            }
          })
        })
        .catch(e => {
          // assistant.error('Failed to send Mailchimp campaign', e);
          assistant.error('Failed to send Mailchimp campaign');
        })
      }

      if (response.status === 200) {
        return res.status(response.status).json(response.data);
      } else {
        return res.status(response.status).send(response.error.message);
      }
    });
  }
}

module.exports = Module;

// HELPERS //
// function callMailChimp(options) {
//
// }
//
// function addToMCList(key, listId, email) {
//   return new Promise((resolve, reject) => {
//     let datacenter = key.split('-')[1];
//     fetch = require('node-fetch');
//     fetch(`https://${datacenter}.api.mailchimp.com/3.0/lists/${listId}/members`, {
//         method: 'post',
//         body: JSON.stringify({
//           email_address: email,
//           status: 'subscribed',
//         }),
//         timeout: 10000,
//         headers: {
//           'Content-Type': 'application/json',
//           'Authorization': `Basic ${key}`,
//         },
//       })
//       .then(res => res.json())
//       .then(json => {
//         if (json.status !== 'subscribed') {
//           return reject(new Error(json.status));
//         }
//         return resolve(json);
//       })
//       .catch(e => {
//         return reject(e);
//       })
//
//   });
// }
