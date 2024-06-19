const fetch = require('wonderful-fetch');
const moment = require('moment');
const jetpack = require('fs-jetpack');
const powertools = require('node-powertools');
const uuidv4 = require('uuid').v4;
const { get, set } = require('lodash');
const path = require('path');
const { Octokit } = require('@octokit/rest');

const POST_TEMPLATE = jetpack.read(`${__dirname}/templates/post.html`);
const IMAGE_TAG = `{%- include /master/helpers/blog-image.html name="{name}" alt="{alt}" -%}`;
const IMAGE_PATH_SRC = `assets/_src/images/blog/posts/post-{id}/`;
// const IMAGE_PATH_REG = `/assets/images/blog/posts/post-{id}/`;
const AD_TAG = `{% include /master/modules/adunits/adsense-in-article.html index="{index}" %}`;

const IMAGE_REGEX = /(?:!\[(.*?)\]\((.*?)\))/img;
const LINK_REGEX = /(?:\[(.*?)\]\((.*?)\))/img;

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    try {
      // Perform checks
      if (!payload.user.roles.admin && !payload.user.roles.blogger) {
        return reject(assistant.errorify(`Admin required.`, {code: 401}));
      }

      // Log payload
      assistant.log(`main(): payload.data`, payload.data);

      // Set now
      const now = assistant.meta.startTime.timestamp;
      const bemRepo = assistant.parseRepo(Manager?.config?.github?.repo_website);

      // Setup Octokit
      self.octokit = new Octokit({
        auth: Manager?.config?.github?.key,
      });

      // Check for required values
      if (!payload.data.payload.title) {
        return reject(assistant.errorify(`Missing required parameter: title`, {code: 400}));
      } else if (!payload.data.payload.url) {
        return reject(assistant.errorify(`Missing required parameter: url`, {code: 400}));
      } else if (!payload.data.payload.excerpt) {
        return reject(assistant.errorify(`Missing required parameter: excerpt`, {code: 400}));
      } else if (!payload.data.payload.headerImageURL) {
        return reject(assistant.errorify(`Missing required parameter: headerImageURL`, {code: 400}));
      } else if (!payload.data.payload.body) {
        return reject(assistant.errorify(`Missing required parameter: body`, {code: 400}));
      }

      // Fix required values
      payload.data.payload.url = payload.data.payload.url
        // Replace blog/
        .replace(/blog\//ig, '')
        // Remove leading and trailing slashes
        .replace(/^\/|\/$/g, '')
        // Replace anything that's not a letter or number with a hyphen
        .replace(/[^a-zA-Z0-9]/g, '-')
        // Remove multiple hyphens
        .replace(/-+/g, '-')
        // Lowercase
        .toLowerCase();

      // Fix body
      payload.data.payload.body = payload.data.payload.body
        // Replace heading text (# + payload.data.payload.title) (just the first instance in case it is repeated)
        .replace(powertools.regexify(`/# ${payload.data.payload.title}/i`), '')
        // Remove extra newlines
        .replace(/\n\n\n+/g, '\n\n')
        // Trim
        .trim();

      // Fix other values
      payload.data.payload.author = payload.data.payload.author || 'alex';
      payload.data.payload.affiliate = payload.data.payload.affiliate || '';
      payload.data.payload.tags = payload.data.payload.tags || [];
      payload.data.payload.categories = payload.data.payload.categories || [];

      // Fix even more values
      payload.data.payload.layout = payload.data.payload.layout || 'app/blog/post';
      payload.data.payload.date = moment(payload.data.payload.date || now).subtract(1, 'days').format('YYYY-MM-DD');
      payload.data.payload.id = payload.data.payload.id || Math.round(new Date(now).getTime() / 1000);
      payload.data.payload.path = `_posts/${moment(now).format('YYYY')}/${payload.data.payload.path || 'guest'}`;
      payload.data.payload.githubUser = payload.data.payload.githubUser || bemRepo.user;
      payload.data.payload.githubRepo = payload.data.payload.githubRepo || bemRepo.name;

      // Log
      assistant.log(`main(): Creating post...`, payload.data.payload);

      // Extract all images
      await self.extractImages();

      // Set defaults
      const formattedContent = powertools.template(
        POST_TEMPLATE,
        formatClone(payload.data.payload),
      );

      // Insert ads
      const articleWithAds = insertAds(formattedContent, 6, 4000);

      // Log
      assistant.log(`main(): articleWithAds`, articleWithAds);

      // Upload post
      const uploadPost = await self.uploadPost(articleWithAds);

      // Log
      assistant.log(`main(): uploadPost`, uploadPost);

      // Resolve
      return resolve({data: payload.data.payload});
    } catch (e) {
      return reject(e);
    }
  });
};

// Extract images
Module.prototype.extractImages = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    // Extract images
    const matches = payload.data.payload.body.matchAll(IMAGE_REGEX);
    const images = Array.from(matches).map(match => ({
      full: match[0] || '',
      src: match[2] || '',
      alt: match[1] || uuidv4(),
      replace: true,
    }));

    // Add heading image to beginning of images
    images.unshift({
      full: '',
      src: payload.data.payload.headerImageURL,
      alt: payload.data.payload.url,
      replace: false,
    });

    // Log
    assistant.log(`extractImages(): images`, images);

    // Check if no images
    if (!images) {
      return resolve();
    }

    // Loop through images
    for (let index = 0; index < images.length; index++) {
      const image = images[index];

      // Download image
      const download = await self.downloadImage(image.src, image.alt).catch((e) => e);

      // Log
      assistant.log(`extractImages(): download`, download);

      // Check for error
      if (download instanceof Error) {
        return reject(download);
      }

      // Upload image
      const upload = await self.uploadImage(download).catch((e) => e);

      // Log
      assistant.log(`extractImages(): upload`, upload);

      // Check for error
      if (upload instanceof Error) {
        return reject(upload);
      }

      // Create new image tag
      const tag = powertools.template(IMAGE_TAG, {name: download.filename, alt: image.alt});

      // Replace image in body
      if (image.replace) {
        payload.data.payload.body = payload.data.payload.body
          .replace(image.full, tag);
      }

      // Log
      assistant.log(`extractImages(): tag`, tag);
    }

    // Resolve
    return resolve();
  });
};

// Downlaod image
Module.prototype.downloadImage = function (src, alt) {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    // Log
    const hyphenated = hyphenate(alt);

    // Log
    assistant.log(`downloadImage(): src=${src}, alt=${alt}, hyphenated=${hyphenated}`);

    // Get image
    await fetch(src, {
      method: 'get',
      download: `${assistant.tmpdir}/${hyphenated}`,
    })
    .then((r) => {
      r.filename = path.basename(r.path);
      r.ext = path.extname(r.path);

      // Log
      assistant.log(`downloadImage(): Result`, r.path);

      // If not .jpg, reject
      if (r.ext !== '.jpg') {
        return reject(assistant.errorify(`Images must be .jpg (not ${r.ext})`, {code: 400}));
      }

      // Save image
      return resolve(r);
    })
    .catch((e) => reject(e));
  });
};

// Upload image to GitHub
Module.prototype.uploadImage = function (image) {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    // Save variables
    const filepath = image.path;
    const filename = image.filename;
    const assetsPath = powertools.template(IMAGE_PATH_SRC, payload.data.payload);

    // Log
    assistant.log(`uploadImage(): image`, image);
    assistant.log(`uploadImage(): path`, `${assetsPath}${filename}`);

    // Upload image
    await self.octokit.rest.repos.createOrUpdateFileContents({
      owner: payload.data.payload.githubUser,
      repo: payload.data.payload.githubRepo,
      path: `${assetsPath}${filename}`,
      message: `📦 admin:create-post:upload-image ${filename}`,
      content: jetpack.read(filepath, 'buffer').toString('base64'),
    })
    .then((r) => {
      // Log
      assistant.log(`uploadImage(): Result`, r);

      // Resolve
      return resolve(r);
    })
    .catch((e) => reject(e));
  });
};

// Upload post to GitHub
Module.prototype.uploadPost = function (content) {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    // Save variables
    const filename = `${payload.data.payload.path}/${payload.data.payload.date}-${payload.data.payload.url}.md`;
    const owner = payload.data.payload.githubUser;
    const repo = payload.data.payload.githubRepo;

    // Log
    assistant.log(`uploadPost(): filename`, filename);

    // Get existing post
    const existing = await self.octokit.rest.repos.getContent({
      owner: owner,
      repo: repo,
      path: filename,
    })
    .catch(e => e);

    // Log
    assistant.log(`uploadPost(): Existing`, existing);

    // Quit if error and it's not a 404
    if (
      existing instanceof Error
      && existing?.status !== 404
    ) {
      return reject(existing);
    }

    // Upload post
    await self.octokit.rest.repos.createOrUpdateFileContents({
      owner: owner,
      repo: repo,
      path: filename,
      sha: existing?.data?.sha || undefined,
      message: `📦 admin:create-post:upload-post ${filename}`,
      content: Buffer.from(content).toString('base64'),
    })
    .then((r) => {
      // Log
      assistant.log(`uploadPost(): Result`, r);

      // Resolve
      return resolve(r);
    })
    .catch((e) => reject(e));
  });
};

function formatClone(payload) {
  powertools.getKeys(payload).forEach((item) => {
    const value = get(payload, item);
    const isArray = Array.isArray(value);

    // If it's an array, format as JSON so it appears in frontmatter as an array
    if (isArray) {
      set(payload, item, JSON.stringify(value));
    }
  });

  return payload;
}

function hyphenate(s) {
  return s
    // Remove everything that is not a letter or a number
    .replace(/[^a-zA-Z0-9]/g, '-')
    // Replace multiple hyphens with a single hyphen
    .replace(/-+/g, '-')
    // Remove leading and trailing hyphens
    .replace(/^-|-$/g, '')
    // Lowercase
    .toLowerCase();
}

function insertAds(article, paragraphsPerAd, minCharsBetweenAds) {
  const paragraphs = article.split('\n\n');
  const newParagraphs = [];
  let charCount = 0;
  let adCount = 0;

  for (let i = 0, total = paragraphs.length; i < total; i++) {
    const collection = paragraphs[i];

    charCount += collection.length;

    newParagraphs.push(collection);

    if (i >= paragraphsPerAd && charCount >= minCharsBetweenAds) {
      newParagraphs.push(powertools.template(AD_TAG, {index: adCount++}));
      charCount = 0;
    }
  }

  return newParagraphs.join('\n\n');
}

module.exports = Module;
