/**
 * POST /admin/post - Create blog post
 * Admin/blogger endpoint to create blog posts via GitHub
 * Uses Git Trees API to commit all files (images + post) in a single commit
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

module.exports = async ({ assistant, Manager, user, settings, analytics }) => {

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
  settings.affiliate = settings.affiliate;
  settings.tags = settings.tags;
  settings.categories = settings.categories;
  settings.layout = settings.layout;
  settings.date = moment(settings.date || now).subtract(1, 'days').format('YYYY-MM-DD');
  settings.id = settings.id || Math.round(new Date(now).getTime() / 1000);
  settings.path = `src/_posts/${moment(now).format('YYYY')}/${settings.postPath}`;
  settings.githubUser = settings.githubUser || bemRepo.user;
  settings.githubRepo = settings.githubRepo || bemRepo.name;

  assistant.log('main(): Creating post...', settings);

  // Download all images and collect file data
  const imageFiles = await downloadImages(assistant, settings).catch(e => e);
  if (imageFiles instanceof Error) {
    return assistant.respond(imageFiles.message, { code: 400 });
  }

  // Rewrite body to use @post/ prefix for extracted images
  for (const file of imageFiles) {
    if (file.originalUrl) {
      settings.body = settings.body.split(file.originalUrl).join(`@post/${file.filename}`);
    }
  }

  // Generate post content from template
  const formattedContent = powertools.template(
    POST_TEMPLATE,
    formatClone(settings),
  );

  // Build post file entry
  const postFilename = `${settings.path}/${settings.date}-${settings.url}.md`;
  const allFiles = [
    ...imageFiles.map(img => ({
      path: img.githubPath,
      content: img.base64,
      encoding: 'base64',
    })),
    {
      path: postFilename,
      content: Buffer.from(formattedContent).toString('base64'),
      encoding: 'base64',
    },
  ];

  // Commit all files in a single commit
  const commitResult = await commitAll(assistant, octokit, settings, allFiles).catch(e => e);
  if (commitResult instanceof Error) {
    return assistant.respond(commitResult.message, { code: 500 });
  }

  assistant.log('main(): commitAll', commitResult);

  // Track analytics
  analytics.event('admin/post', { action: 'create' });

  return assistant.respond(settings);
};

// Helper: Download all images and return file data (no GitHub uploads)
async function downloadImages(assistant, settings) {
  const files = [];
  const assetsPath = powertools.template(IMAGE_PATH_SRC, settings);

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

  assistant.log('downloadImages(): images', images);

  if (!images.length) {
    return files;
  }

  for (let index = 0; index < images.length; index++) {
    const image = images[index];

    // Download image
    const download = await downloadImage(assistant, image.src, image.alt).catch(e => e);

    assistant.log('downloadImages(): download', download);

    if (download instanceof Error) {
      if (image.header) {
        throw download;
      } else {
        assistant.warn('downloadImages(): Skipping NON-HEADER image download due to error', download);
        continue;
      }
    }

    // Read file content as base64
    const base64 = jetpack.read(download.path, 'buffer').toString('base64');

    files.push({
      githubPath: `${assetsPath}${download.filename}`,
      filename: download.filename,
      base64: base64,
      originalUrl: image.header ? null : image.src,
    });
  }

  return files;
}

// Helper: Download image
async function downloadImage(assistant, src, alt) {
  const fetch = assistant.Manager.require('wonderful-fetch');
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

// Helper: Commit all files (images + post) in a single commit using Git Trees API
async function commitAll(assistant, octokit, settings, files) {
  const owner = settings.githubUser;
  const repo = settings.githubRepo;

  assistant.log('commitAll(): Committing', files.length, 'files');

  // Get the latest commit SHA on the default branch
  const refResult = await octokit.rest.git.getRef({
    owner: owner,
    repo: repo,
    ref: 'heads/master',
  }).catch(() => {
    // Try 'main' if 'master' fails
    return octokit.rest.git.getRef({
      owner: owner,
      repo: repo,
      ref: 'heads/main',
    });
  });

  const latestCommitSha = refResult.data.object.sha;
  const branch = refResult.data.ref;

  assistant.log('commitAll(): Latest commit', latestCommitSha, 'on', branch);

  // Get the tree SHA of the latest commit
  const commitResult = await octokit.rest.git.getCommit({
    owner: owner,
    repo: repo,
    commit_sha: latestCommitSha,
  });

  const baseTreeSha = commitResult.data.tree.sha;

  // Create blobs for each file
  const treeItems = [];

  for (const file of files) {
    const blob = await octokit.rest.git.createBlob({
      owner: owner,
      repo: repo,
      content: file.content,
      encoding: file.encoding,
    });

    assistant.log('commitAll(): Created blob for', file.path, blob.data.sha);

    treeItems.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blob.data.sha,
    });
  }

  // Create a new tree with all files
  const newTree = await octokit.rest.git.createTree({
    owner: owner,
    repo: repo,
    base_tree: baseTreeSha,
    tree: treeItems,
  });

  assistant.log('commitAll(): Created tree', newTree.data.sha);

  // Create the commit
  const postPath = files[files.length - 1].path;
  const newCommit = await octokit.rest.git.createCommit({
    owner: owner,
    repo: repo,
    message: `📦 admin/post:create ${postPath}`,
    tree: newTree.data.sha,
    parents: [latestCommitSha],
  });

  assistant.log('commitAll(): Created commit', newCommit.data.sha);

  // Update the branch ref to point to the new commit
  const updateResult = await octokit.rest.git.updateRef({
    owner: owner,
    repo: repo,
    ref: branch.replace('refs/', ''),
    sha: newCommit.data.sha,
  });

  assistant.log('commitAll(): Updated ref', updateResult.data.object.sha);

  return updateResult;
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
