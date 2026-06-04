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

const deduplicateImageAlts = require('./deduplicate-image-alts');

const POST_TEMPLATE = jetpack.read(`${__dirname}/templates/post.html`);
const IMAGE_PATH_SRC = `src/assets/images/blog/post-{id}/`;
const IMAGE_REGEX = /(?:!\[(.*?)\]\((.*?)\))/img;

// Max dimension (px) for downloaded post images on the long edge, and JPEG
// re-encode quality. Sources above the max cause downstream Jekyll/imagemin
// pipelines to stall on huge decodes (e.g. a 16384×10576 source decodes to
// ~520MB raw), so resize at ingest time.
const IMAGE_MAX_DIMENSION = 2048;
const IMAGE_JPEG_QUALITY = 80;

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
  if (!process.env.GH_TOKEN) {
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
    auth: process.env.GH_TOKEN,
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

  // Fix URL — strip blog/ prefix then slugify (slugify handles slashes/special chars)
  settings.url = Manager.Utilities().slugify(settings.url.replace(/blog\//ig, ''));

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
  settings.directory = `src/_posts/${moment(now).format('YYYY')}/${settings.postPath}`;
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
  settings.path = `${settings.directory}/${settings.date}-${settings.url}.md`;
  const allFiles = [
    ...imageFiles.map(img => ({
      path: img.githubPath,
      content: img.base64,
      encoding: 'base64',
    })),
    {
      path: settings.path,
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

  // Deduplicate alt-text across different image URLs (mutates images in place,
  // returns rewritten body). See deduplicate-image-alts.js for full rationale.
  const dedup = deduplicateImageAlts(images, settings.body);
  settings.body = dedup.body;

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

// Apply CDN-side resize params so the server delivers a pre-scaled image.
// Unsplash (images.unsplash.com) supports Imgix-style params: w, q, fm.
// Other CDNs can be added here as needed.
function applyImageCDNParams(src) {
  try {
    const url = new URL(src);

    if (url.hostname === 'images.unsplash.com') {
      if (!url.searchParams.has('w')) {
        url.searchParams.set('w', String(IMAGE_MAX_DIMENSION));
      }
      if (!url.searchParams.has('q')) {
        url.searchParams.set('q', String(IMAGE_JPEG_QUALITY));
      }
    }

    return url.toString();
  } catch (e) {
    return src;
  }
}

// Helper: Download image
async function downloadImage(assistant, src, alt) {
  const fetch = assistant.Manager.require('wonderful-fetch');
  const hyphenated = assistant.Manager.Utilities().slugify(alt);

  // Request a server-side resize from supported CDNs so we never download
  // a massive original (e.g. 5184×3456 → ~71MB decoded). This keeps peak
  // memory well within Cloud Functions limits even at 256MB.
  const url = applyImageCDNParams(src);

  assistant.log(`downloadImage(): src=${src}, url=${url}, alt=${alt}, hyphenated=${hyphenated}`);

  const result = await fetch(url, {
    method: 'get',
    download: `${assistant.tmpdir}/${hyphenated}`,
  });

  result.filename = path.basename(result.path);
  result.ext = path.extname(result.path);

  assistant.log('downloadImage(): Result', result.path);

  if (result.ext !== '.jpg') {
    throw new Error(`Images must be .jpg (not ${result.ext})`);
  }

  // Resize in place if the long edge exceeds IMAGE_MAX_DIMENSION
  await resizeImage(assistant, result.path);

  return result;
}

// Helper: Resize image in place if the long edge exceeds IMAGE_MAX_DIMENSION.
// Re-encodes as progressive JPEG at IMAGE_JPEG_QUALITY. Short-circuits when the
// source is already within the limit.
//
// Disables sharp's pixel cache so decoded buffers are freed immediately —
// without this, processing several large images serially can OOM a 256MB
// Cloud Function even though only one image is "active" at a time.
async function resizeImage(assistant, filepath) {
  const sharp = assistant.Manager.require('sharp');
  sharp.cache(false);

  const meta = await sharp(filepath).metadata();
  const longEdge = Math.max(meta.width, meta.height);

  if (longEdge <= IMAGE_MAX_DIMENSION) {
    assistant.log(`resizeImage(): No resize needed (${meta.width}x${meta.height})`);
    return { resized: false, width: meta.width, height: meta.height };
  }

  // Resize to a buffer (cannot read+write the same path in one sharp pipeline)
  const buffer = await sharp(filepath)
    .resize({
      width: IMAGE_MAX_DIMENSION,
      height: IMAGE_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: IMAGE_JPEG_QUALITY, progressive: true })
    .toBuffer();

  // Overwrite the file on disk
  jetpack.write(filepath, buffer);

  // Read the resized dimensions back for the log
  const resizedMeta = await sharp(filepath).metadata();
  assistant.log(`resizeImage(): Resized ${meta.width}x${meta.height} -> ${resizedMeta.width}x${resizedMeta.height} (max ${IMAGE_MAX_DIMENSION}px, q${IMAGE_JPEG_QUALITY})`);

  return { resized: true, width: resizedMeta.width, height: resizedMeta.height };
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

// Expose helpers + constants for tests
module.exports.resizeImage = resizeImage;
module.exports.IMAGE_MAX_DIMENSION = IMAGE_MAX_DIMENSION;
module.exports.IMAGE_JPEG_QUALITY = IMAGE_JPEG_QUALITY;

