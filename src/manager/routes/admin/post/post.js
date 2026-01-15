/**
 * POST /admin/post - Create blog post
 * Admin/blogger endpoint to create blog posts via GitHub
 */
const moment = require('moment');
const jetpack = require('fs-jetpack');
const powertools = require('node-powertools');
const uuidv4 = require('uuid').v4;
const path = require('path');
const { Octokit } = require('@octokit/rest');
const { get, set } = require('lodash');

const POST_TEMPLATE = jetpack.read(`${__dirname}/templates/post.html`);
const IMAGE_PATH_SRC = `src/assets/images/blog/post-{id}/`;
const IMAGE_REGEX = /(?:!\[(.*?)\]\((.*?)\))/img;

module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const user = assistant.usage.user;
  const settings = assistant.settings;
  const fetch = Manager.require('wonderful-fetch');

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Require admin or blogger
  if (!user.roles.admin && !user.roles.blogger) {
    return assistant.respond('Admin required.', { code: 403 });
  }

  // Check for GitHub configuration
  if (!process.env.GITHUB_TOKEN) {
    return assistant.respond('GitHub API key not configured.', { code: 500 });
  }

  if (!Manager.config?.github?.repo_website) {
    return assistant.respond('GitHub repo_website not configured.', { code: 500 });
  }

  assistant.log('main(): settings', settings);

  const now = assistant.meta.startTime.timestamp;
  const bemRepo = assistant.parseRepo(Manager.config.github.repo_website);

  // Setup Octokit
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  // Check for required values
  if (!settings.title) {
    return assistant.respond('Missing required parameter: title', { code: 400 });
  }
  if (!settings.url) {
    return assistant.respond('Missing required parameter: url', { code: 400 });
  }
  if (!settings.description) {
    return assistant.respond('Missing required parameter: description', { code: 400 });
  }
  if (!settings.headerImageURL) {
    return assistant.respond('Missing required parameter: headerImageURL', { code: 400 });
  }
  if (!settings.body) {
    return assistant.respond('Missing required parameter: body', { code: 400 });
  }

  // Fix URL
  settings.url = settings.url
    .replace(/blog\//ig, '')
    .replace(/^\/|\/$/g, '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  // Fix body
  settings.body = settings.body
    .replace(powertools.regexify(`/# ${settings.title}/i`), '')
    .replace(/\n\n\n+/g, '\n\n')
    .trim();

  // Fix other values
  settings.author = settings.author || powertools.random(['alex-raeburn', 'rare-ivy', 'christina-hill']);
  settings.affiliate = settings.affiliate || '';
  settings.tags = settings.tags || [];
  settings.categories = settings.categories || [];
  settings.layout = settings.layout || 'blueprint/blog/post';
  settings.date = moment(settings.date || now).subtract(1, 'days').format('YYYY-MM-DD');
  settings.id = settings.id || Math.round(new Date(now).getTime() / 1000);
  settings.path = `src/_posts/${moment(now).format('YYYY')}/${settings.postPath || 'guest'}`;
  settings.githubUser = settings.githubUser || bemRepo.user;
  settings.githubRepo = settings.githubRepo || bemRepo.name;

  assistant.log('main(): Creating post...', settings);

  // Extract all images
  const imageResult = await extractImages(Manager, assistant, octokit, settings).catch(e => e);
  if (imageResult instanceof Error) {
    return assistant.respond(imageResult.message, { code: 400 });
  }

  // Set defaults
  const formattedContent = powertools.template(
    POST_TEMPLATE,
    formatClone(settings),
  );

  // Upload post
  const uploadResult = await uploadPost(assistant, octokit, settings, formattedContent).catch(e => e);
  if (uploadResult instanceof Error) {
    return assistant.respond(uploadResult.message, { code: 500 });
  }

  assistant.log('main(): uploadPost', uploadResult);

  // Track analytics
  assistant.analytics.event('admin/post', { action: 'create' });

  return assistant.respond(settings);
};

// Helper: Extract and upload images
async function extractImages(Manager, assistant, octokit, settings) {
  const fetch = Manager.require('wonderful-fetch');

  const matches = settings.body.matchAll(IMAGE_REGEX);
  const images = Array.from(matches).map(match => ({
    src: match[2] || '',
    alt: match[1] || uuidv4(),
    header: false,
  }));

  // Add heading image to beginning
  images.unshift({
    src: settings.headerImageURL,
    alt: settings.url,
    header: true,
  });

  assistant.log('extractImages(): images', images);

  if (!images.length) {
    return;
  }

  for (let index = 0; index < images.length; index++) {
    const image = images[index];

    // Download image
    const download = await downloadImage(Manager, assistant, image.src, image.alt).catch(e => e);

    assistant.log('extractImages(): download', download);

    if (download instanceof Error) {
      if (image.header) {
        throw download;
      } else {
        assistant.warn('extractImages(): Skipping NON-HEADER image download due to error', download);
        continue;
      }
    }

    // Upload image
    const upload = await uploadImage(assistant, octokit, settings, download).catch(e => e);

    assistant.log('extractImages(): upload', upload);

    if (upload instanceof Error) {
      if (image.header) {
        throw upload;
      } else {
        assistant.warn('extractImages(): Skipping NON-HEADER image upload due to error', upload);
        continue;
      }
    }
  }
}

// Helper: Download image
async function downloadImage(Manager, assistant, src, alt) {
  const fetch = Manager.require('wonderful-fetch');
  const hyphenated = hyphenate(alt);

  assistant.log(`downloadImage(): src=${src}, alt=${alt}, hyphenated=${hyphenated}`);

  const result = await fetch(src, {
    method: 'get',
    download: `${assistant.tmpdir}/${hyphenated}`,
  });

  result.filename = path.basename(result.path);
  result.ext = path.extname(result.path);

  assistant.log('downloadImage(): Result', result.path);

  if (result.ext !== '.jpg') {
    throw new Error(`Images must be .jpg (not ${result.ext})`);
  }

  return result;
}

// Helper: Upload image to GitHub
async function uploadImage(assistant, octokit, settings, image) {
  const filepath = image.path;
  const filename = image.filename;
  const assetsPath = powertools.template(IMAGE_PATH_SRC, settings);
  const owner = settings.githubUser;
  const repo = settings.githubRepo;

  assistant.log('uploadImage(): image', image);
  assistant.log('uploadImage(): path', `${assetsPath}${filename}`);

  // Get existing image
  const existing = await octokit.rest.repos.getContent({
    owner: owner,
    repo: repo,
    path: `${assetsPath}${filename}`,
  }).catch(e => e);

  assistant.log('uploadImage(): Existing', existing);

  if (existing instanceof Error && existing?.status !== 404) {
    throw existing;
  }

  // Upload image
  const result = await octokit.rest.repos.createOrUpdateFileContents({
    owner: owner,
    repo: repo,
    path: `${assetsPath}${filename}`,
    sha: existing?.data?.sha || undefined,
    message: `📦 admin/post:upload-image ${filename}`,
    content: jetpack.read(filepath, 'buffer').toString('base64'),
  });

  assistant.log('uploadImage(): Result', result);

  return result;
}

// Helper: Upload post to GitHub
async function uploadPost(assistant, octokit, settings, content) {
  const filename = `${settings.path}/${settings.date}-${settings.url}.md`;
  const owner = settings.githubUser;
  const repo = settings.githubRepo;

  assistant.log('uploadPost(): filename', filename);

  // Get existing post
  const existing = await octokit.rest.repos.getContent({
    owner: owner,
    repo: repo,
    path: filename,
  }).catch(e => e);

  assistant.log('uploadPost(): Existing', existing);

  if (existing instanceof Error && existing?.status !== 404) {
    throw existing;
  }

  // Wait for GitHub to process images
  await powertools.wait(30000);

  // Upload post
  const result = await octokit.rest.repos.createOrUpdateFileContents({
    owner: owner,
    repo: repo,
    path: filename,
    sha: existing?.data?.sha || undefined,
    message: `📦 admin/post:upload-post ${filename}`,
    content: Buffer.from(content).toString('base64'),
  });

  assistant.log('uploadPost(): Result', result);

  return result;
}

// Helper: Format clone for templating
function formatClone(payload) {
  powertools.getKeys(payload).forEach((item) => {
    const value = get(payload, item);
    const isArray = Array.isArray(value);

    if (isArray) {
      set(payload, item, JSON.stringify(value));
    }
  });

  return payload;
}

// Helper: Hyphenate string
function hyphenate(s) {
  return s
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}
