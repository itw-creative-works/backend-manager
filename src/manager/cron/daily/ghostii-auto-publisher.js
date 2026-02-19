const fetch = require('wonderful-fetch');
const powertools = require('node-powertools');
const moment = require('moment');
const JSON5 = require('json5');

const PROMPT = `
  Company: {app.name}: {app.brand.description}
  Date: {date}
  Instructions: {prompt}

  Use the following information to find a topic for our company blog (it can be about our company OR any topic that would be relevant to our website and business BUT not about a competitor):
  {suggestion}
`;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// State
let postId;

/**
 * Ghostii Auto Publisher cron job
 *
 * Automatically generates and publishes blog posts using Ghostii AI.
 */
module.exports = async ({ Manager, assistant, context, libraries }) => {
  // Log
  assistant.log('Starting...');

  // Set post ID
  postId = moment().unix();

  // Build app object from local config
  const appObject = buildAppObject(Manager.config);

  // Log
  assistant.log('App object', appObject);

  // Get settings
  const settingsArray = powertools.arrayify(Manager.config.ghostii);

  // Loop through each item
  for (const settings of settingsArray) {
    // Fix settings
    settings.articles = settings.articles || 0;
    settings.sources = randomize(settings.sources || []);
    settings.links = randomize(settings.links || []);
    settings.prompt = settings.prompt || '';
    settings.chance = settings.chance || 1.0;
    settings.author = settings.author || undefined;

    // Resolve app data for this ghostii item
    if (settings.app && settings.appUrl) {
      // Cross-app: fetch from the other project's /app endpoint
      settings.app = await fetchRemoteApp(settings.appUrl).catch((e) => e);

      if (settings.app instanceof Error) {
        assistant.error('Error fetching remote app data', settings.app);
        continue;
      }
    } else {
      // Same-app: use local config
      settings.app = appObject;
    }

    // Log
    assistant.log(`Settings (app=${settings.app.id})`, settings);

    // Quit if articles are disabled
    if (!settings.articles || !settings.sources.length) {
      assistant.log('Quitting because articles are disabled');
      continue;
    }

    // Quit if the chance is not met
    const chance = Math.random();
    if (chance > settings.chance) {
      assistant.log(`Quitting because the chance is not met (${chance} <= ${settings.chance})`);
      continue;
    }

    // Harvest articles
    const result = await harvest(assistant, settings).catch((e) => e);
    if (result instanceof Error) {
      throw result;
    }

    // Log
    assistant.log('Finished!', result);
  }
};

/**
 * Build app object from Manager.config (same shape as getApp response)
 */
function buildAppObject(config) {
  return {
    id: config.app?.id,
    name: config.brand?.name,
    brand: {
      description: config.brand?.description || '',
    },
    url: config.brand?.url,
    github: {
      user: config.github?.user,
      repo: (config.github?.repo_website || '').split('/').pop(),
    },
  };
}

/**
 * Fetch app data from a remote BEM project's /app endpoint
 */
function fetchRemoteApp(appUrl) {
  return fetch(`${appUrl}/backend-manager/app`, {
    timeout: 30000,
    tries: 3,
    response: 'json',
  });
}

async function harvest(assistant, settings) {
  const date = moment().format('MMMM YYYY');

  // Log
  assistant.log(`harvest(): Starting ${settings.app.id}...`);

  // Process the number of sources in the settings
  for (let index = 0; index < settings.articles; index++) {
    const source = powertools.random(settings.sources);
    const sourceIsURL = isURL(source);
    let suggestion = null;

    // Log
    assistant.log(`harvest(): Processing ${index + 1}/${settings.articles} sources isURL=${sourceIsURL}`, source);

    // Get suggestion
    if (source === '$app') {
      suggestion = 'Write an article about any topic that would be relevant to our website and business (it does not have to be about our company, but it can be)';
    } else if (sourceIsURL) {
      suggestion = await getURLContent(source).catch((e) => e);
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
    const article = await requestGhostii(settings, final).catch((e) => e);
    if (article instanceof Error) {
      assistant.error('harvest(): Error requesting Ghostii', article);
      break;
    }

    // Log
    assistant.log('harvest(): Article', article);

    // Upload post to blog
    const uploadedPost = await uploadPost(assistant, settings, article).catch((e) => e);
    if (uploadedPost instanceof Error) {
      assistant.error('harvest(): Error uploading post to blog', uploadedPost);
      break;
    }

    // Log
    assistant.log('harvest(): Uploaded post', uploadedPost);
  }
}

function getURLContent(url) {
  return fetch(url, {
    timeout: 30000,
    tries: 3,
    response: 'raw',
    headers: {
      'User-Agent': USER_AGENT,
    },
  })
  .then(async (res) => {
    const contentType = res.headers.get('content-type');
    const text = await res.text();

    return extractBodyContent(text, contentType, url);
  });
}

function isURL(url) {
  try {
    return !!new URL(url);
  } catch (e) {
    return false;
  }
}

function requestGhostii(settings, content) {
  return fetch('https://api.ghostii.ai/write/article', {
    method: 'post',
    timeout: 90000,
    tries: 1,
    response: 'json',
    body: {
      backendManagerKey: process.env.BACKEND_MANAGER_KEY,
      keywords: [''],
      description: content,
      insertLinks: true,
      headerImageUrl: 'unsplash',
      url: settings.app.url,
      sectionQuantity: powertools.random(3, 6, { mode: 'gaussian' }),
      feedUrl: `${settings.app.url}/feeds/posts.json`,
      links: settings.links,
    },
  });
}

function uploadPost(assistant, settings, article) {
  const apiUrl = `https://api.${(settings.app.url || '').replace(/^https?:\/\//, '')}`;
  return fetch(`${apiUrl}/backend-manager/admin/post`, {
    method: 'POST',
    timeout: 90000,
    tries: 1,
    response: 'json',
    body: {
      backendManagerKey: process.env.BACKEND_MANAGER_KEY,
      title: article.title,
      url: article.title, // This is formatted on the bm_api endpoint
      description: article.description,
      headerImageURL: article.headerImageUrl,
      body: article.body,
      id: postId++,
      author: settings.author,
      categories: article.categories,
      tags: article.keywords,
      path: 'ghostii',
      githubUser: settings.app.github.user,
      githubRepo: settings.app.github.repo,
    },
  });
}

function extractBodyContent(text, contentType, url) {
  const parsed = tryParse(text);

  // Try JSON
  if (parsed) {
    // If it's from rss.app, extract the content
    if (parsed.items) {
      return parsed.items.map((i) => `${i.title}: ${i.content_text}`).join('\n');
    }

    // If we can't recognize the JSON, return the original text
    return text;
  }

  // Extract the content within the body tag
  const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) {
    return '';
  }

  let bodyContent = bodyMatch[1];

  // Remove script and meta tags
  bodyContent = bodyContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  bodyContent = bodyContent.replace(/<meta[^>]*>/gi, '');

  // Remove remaining HTML tags
  return bodyContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tryParse(json) {
  try {
    return JSON5.parse(json);
  } catch (e) {
    return null;
  }
}

function randomize(array) {
  return array.sort(() => Math.random() - 0.5);
}
