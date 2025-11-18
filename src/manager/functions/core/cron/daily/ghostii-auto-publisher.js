// Libraries
const fetch = require('wonderful-fetch');
const powertools = require('node-powertools');
const moment = require('moment');
const JSON5 = require('json5');

// const PROMPT = `
//   Company: {app.name}: {app.brand.description}
//   Date: {date}
//   Instructions: {prompt}

//   Use the following information to find a topic related to our company:
//   {suggestion}
// `
const PROMPT = `
  Company: {app.name}: {app.brand.description}
  Date: {date}
  Instructions: {prompt}

  Use the following information to find a topic for our company blog (it can be about our company OR any topic that would be relevant to our website and business BUT not about a competitor):
  {suggestion}
`

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function Module() {

}

Module.prototype.main = function (assistant, context) {
  const self = this;

  // Shortcuts
  const Manager = assistant.Manager;
  const libraries = Manager.libraries;

  return new Promise(async function(resolve, reject) {
    // Log
    assistant.log(`Starting...`);

    // Set post ID
    self.postId = moment().unix();

    // Get app content
    self.appObject = await self.getAppData(Manager.config.app.id).catch((e) => e);
    if (self.appObject instanceof Error) {
      return reject(self.appObject);
    }

    // Log
    assistant.log(`App object`, self.appObject);

    // Get settings
    let settingsArray = powertools.arrayify(Manager.config.ghostii);

    // Loop through each item
    for (const settings of settingsArray) {
      const appId = settings.app || self.appObject.id;

      // Fix settings
      settings.articles = settings.articles || 0;
      settings.sources = randomize(settings.sources || []);
      settings.links = randomize(settings.links || []);
      settings.prompt = settings.prompt || '';
      settings.chance = settings.chance || 1.0;
      settings.author = settings.author || 'alex';
      settings.app = await self.getAppData(appId).catch((e) => e);

      // Check for errors
      if (settings.app instanceof Error) {
        assistant.error(`Error fetching app data`, settings.app);
        continue;
      }

      // Log
      assistant.log(`Settings (app=${appId})`, settings);

      // Quit if articles are disabled
      if (!settings.articles || !settings.sources.length) {
        assistant.log(`Quitting because articles are disabled`);
        continue;
      }

      // Quit if the chance is not met
      const chance = Math.random();
      if (chance > settings.chance) {
        assistant.log(`Quitting because the chance is not met (${chance} <= ${settings.chance})`);
        continue;
      }

      // Harvest articles
      const result = await self.harvest(settings).catch((e) => e);
      if (result instanceof Error) {
        return reject(result);
      }

      // Log
      assistant.log(`Finished!`, result);
    }

    // Resolve
    return resolve();
  });
}

Module.prototype.harvest = function (settings) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    const date = moment().format('MMMM YYYY');

    // Log
    assistant.log(`harvest(): Starting ${settings.app.id}...`);

    // Process the number of sources in the settings
    for (let index = 0; index < settings.articles; index++) {
      const source = powertools.random(settings.sources);
      const isURL = self.isURL(source);
      let suggestion = null;

      // Log
      assistant.log(`harvest(): Processing ${index + 1}/${settings.articles} sources isURL=${isURL}`, source);

      // Get suggestion
      if (source === '$app') {
        suggestion = 'Write an article about any topic that would be relevant to our website and business (it does not have to be about our company, but it can be)';
      } else if (isURL) {
        suggestion = await self.getURLContent(source).catch((e) => e);
      } else {
        suggestion = source;
      }

      // Check for errors
      if (suggestion instanceof Error) {
        assistant.error(`harvest(): Error fetching ${source} suggestion`, suggestion);

        break;
      }

      // Set suggestion
      const final = powertools.template(PROMPT, {
        ...settings,
        prompt: settings.prompt,
        date: date,
        suggestion: suggestion,
      });

      // Log
      assistant.log('harvest(): Get final content', final);

      // Request to Ghostii
      const article = await self.requestGhostii(settings, final).catch((e) => e);
      if (article instanceof Error) {
        assistant.error(`harvest(): Error requesting Ghostii`, article);

        break;
      }

      // Log
      assistant.log(`harvest(): Article`, article);

      // Upload post to blog
      const uploadedPost = await self.uploadPost(settings, article).catch((e) => e);
      if (uploadedPost instanceof Error) {
        assistant.error(`harvest(): Error uploading post to blog`, uploadedPost);

        break;
      }

      // Log
      assistant.log(`harvest(): Uploaded post`, uploadedPost);
    }

    // Log
    return resolve();
  });
}

Module.prototype.getAppData = function (id) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    // Fetch app details
    fetch('https://us-central1-itw-creative-works.cloudfunctions.net/getApp', {
      method: 'post',
      timeout: 30000,
      tries: 3,
      response: 'json',
      body: {
        id: id,
      },
    })
    .then((r) => resolve(r))
    .catch((e) => reject(e));
  });
}

Module.prototype.getURLContent = function (url) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    // Fetch URL
    fetch(url, {
      timeout: 30000,
      tries: 3,
      response: 'raw',
      headers: {
        'User-Agent': USER_AGENT,
      }
    })
    .then(async (r) => {
      const contentType = res.headers.get('content-type');
      const text = await res.text();

      return resolve(extractBodyContent(text, contentType, url));
    })
    .catch((e) => reject(e));
  });
}

Module.prototype.isURL = function (url) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const context = self.context;

  try {
    return !!new URL(url);
  } catch (e) {
    return false;
  }
}

// Request to Ghostii
Module.prototype.requestGhostii = function (settings, content) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    // Fetch URL
    fetch('https://api.ghostii.ai/write/article', {
      method: 'post',
      timeout: 90000,
      tries: 1,
      response: 'json',
      body: {
        backendManagerKey: Manager.config.backend_manager.key,
        keywords: [''],
        description: content,
        insertLinks: true,
        headerImageUrl: 'unsplash',
        url: settings.app.url,
        sectionQuantity: powertools.random(3, 6, {mode: 'gaussian'}),
        feedUrl: `${settings.app.url}/feeds/posts.json`,
        links: settings.links,
      },
    })
    .then((r) => resolve(r))
    .catch((e) => reject(e));
  });
}

Module.prototype.uploadPost = function (settings, article) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    // if (assistant.isDevelopment()) {
    //   assistant.log('uploadPost(): Skipping because we are in development mode');

    //   return resolve();
    // }

    // Fetch URL
    fetch(`${settings.app.server}/bm_api`, {
      method: 'post',
      timeout: 90000,
      tries: 1,
      response: 'json',
      body: {
        backendManagerKey: Manager.config.backend_manager.key,
        command: 'admin:create-post',
        payload: {
          title: article.title,
          url: article.title, // This is formatted on the bm_api endpoint
          description: article.description,
          headerImageURL: article.headerImageUrl,
          body: article.body,
          id: self.postId++,
          author: settings.author,
          categories: article.categories,
          tags: article.keywords,
          path: 'ghostii',
          githubUser: settings.app.github.user,
          githubRepo: settings.app.github.repo,
        },
      },
    })
    .then((r) => resolve(r))
    .catch((e) => reject(e));
  });
}

const extractBodyContent = (text, contentType, url) => {
  const parsed = tryParse(text);

  // Try JSON
  if (parsed) {
    // If it's from rss.app, extract the content
    if (parsed.items) {
      return parsed.items.map((i) => `${i.title}: ${i.content_text}`).join('\n');
    }

    // If we cant recognize the JSON, return the original text
    return text;
  }

  // Extract the content within the body tag
  const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return '';

  let bodyContent = bodyMatch[1];

  // Remove script and meta tags
  bodyContent = bodyContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  bodyContent = bodyContent.replace(/<meta[^>]*>/gi, '');

  // Remove remaining HTML tags
  return bodyContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

function tryParse(json) {
  try {
    return JSON5.parse(json);
  } catch (e) {
    return null;
  }
};

// Randomize array
function randomize(array) {
  return array.sort(() => Math.random() - 0.5);
}

module.exports = Module;
