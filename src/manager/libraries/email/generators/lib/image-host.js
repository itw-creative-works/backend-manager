/**
 * Asset host — uploads newsletter assets (per-section PNGs + the final
 * rendered `newsletter.html`) to the public `itw-creative-works/newsletter-assets`
 * GitHub repo as a single atomic commit.
 *
 * Each brand pushes to its own branch (branch name = brandId). This
 * eliminates race conditions — 30+ brands can upload concurrently with
 * zero contention. The `main` branch hosts only the viewer page
 * (index.html on GitHub Pages) for browser-renderable previews.
 *
 * Returns publicly resolvable URLs:
 *   - Image URLs (`raw.githubusercontent.com/{owner}/{repo}/{brandId}/...`):
 *     embedded in the HTML via <img src=...>
 *   - HTML URL (`raw.githubusercontent.com`): download link for manual paste
 *   - Preview URL (`*.github.io/?path=...`): viewer page that fetches and
 *     renders the newsletter HTML in-browser
 *
 * Public-safety guarantees baked in:
 *   - Only accepts PNG buffers for images — verified by magic-byte check
 *   - HTML must be a non-empty string (no buffers, no other types)
 *   - Path validated against a strict allowlist regex per file kind
 *   - Repo owner hardcoded (no env override) so a misconfigured caller
 *     can't redirect uploads elsewhere
 *   - One atomic commit per newsletter (Git Trees API)
 *
 * Pattern lifted from src/manager/routes/admin/post/post.js#commitAll —
 * keep them in sync if the GitHub upload conventions change.
 */
const { Octokit } = require('@octokit/rest');

const REPO_OWNER = 'itw-creative-works';
const REPO_NAME  = 'newsletter-assets';

// When true, asset URLs use the parent CDN (cdn.{parentDomain}/newsletters/...)
// instead of raw.githubusercontent.com. Requires a Cloudflare redirect rule
// on the CDN domain that maps /newsletters/* to raw.githubusercontent.com.
// Set to false to revert to direct GitHub URLs.
const USE_CDN_URLS = true;

const PAGES_BASE = `https://${REPO_OWNER}.github.io/${REPO_NAME}`;

// Fallback RAW_BASE for callers that don't have a brand context
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main`;

// `content/{campaignId}/section-N.png` — brand is the branch, not the path
const CONTENT_DIR = 'content';
const IMAGE_PATH_REGEX = /^content\/[A-Za-z0-9_-]+\/section-\d+\.png$/;
const HTML_PATH_REGEX  = /^content\/[A-Za-z0-9_-]+\/newsletter\.html$/;
const MARKDOWN_PATH_REGEX = /^content\/[A-Za-z0-9_-]+\/newsletter\.md$/;
const SUMMARY_PATH_REGEX  = /^content\/[A-Za-z0-9_-]+\/summary\.md$/;

// PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Upload newsletter assets (PNGs + optional HTML) as a single atomic commit.
 *
 * @param {object} args
 * @param {Array<{png: Buffer}>} [args.images] - section images (only `png` is used).
 *                                                Optional — pass an empty array or omit if
 *                                                you only want to upload the HTML (rare).
 * @param {string} [args.html] - The final rendered newsletter HTML. Uploaded as
 *                                `content/{campaignId}/newsletter.html`.
 * @param {string} [args.markdown] - Programmatic markdown view of the newsletter.
 *                                    Uploaded as `content/{campaignId}/newsletter.md`.
 * @param {string} [args.summary] - Short editorial recap (2-3 sentences). Uploaded
 *                                   as `content/{campaignId}/summary.md`.
 * @param {string} args.brandId - lowercase brand slug (e.g. 'somiibo')
 * @param {string} args.campaignId - Consumer-side `marketing-campaigns/{id}` Firestore doc ID.
 *                                   Folder names use this verbatim — stable forever.
 * @param {string} [args.subject] - Newsletter subject. Embedded in the commit message so
 *                                  `git log` reads as a human-browseable history.
 * @param {string} [args.commitMessage] - Full override of the default commit message
 * @param {string} [args.cdnBase] - CDN base URL (e.g. 'https://cdn.itwcreativeworks.com/newsletters').
 *                                  When provided and USE_CDN_URLS is true, asset URLs use this
 *                                  instead of raw.githubusercontent.com.
 * @param {string} [args.token] - GitHub token (defaults to process.env.GH_TOKEN)
 * @param {object} [args.assistant] - logger
 * @returns {Promise<{ urls: string[], paths: string[], htmlUrl?: string, htmlPath?: string, previewUrl?: string, folderUrl: string, commitSha: string }>}
 */
async function uploadAssets({ images, html, markdown, summary, brandId, campaignId, subject, commitMessage, cdnBase, token, assistant }) {
  const hasImages = Array.isArray(images) && images.length > 0;
  const hasHtml = typeof html === 'string' && html.length > 0;
  const hasMarkdown = typeof markdown === 'string' && markdown.length > 0;
  const hasSummary = typeof summary === 'string' && summary.length > 0;

  if (!hasImages && !hasHtml && !hasMarkdown && !hasSummary) {
    throw new Error('image-host: at least one of images[] / html / markdown / summary must be provided');
  }

  validateBrandId(brandId);
  validateCampaignId(campaignId);

  const githubToken = token || process.env.GH_TOKEN;

  if (!githubToken) {
    throw new Error('image-host: GH_TOKEN env var (or token arg) is required');
  }

  const log = (msg) => assistant?.log ? assistant.log(`[image-host] ${msg}`) : null;

  // Brand branch — each brand gets its own branch, zero cross-brand contention
  const branch = brandId;
  const gitRawBase = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${branch}`;

  // CDN URLs: cdn.{parentDomain}/newsletters/{brandId}/content/{campaignId}/...
  // The CDN redirect maps /newsletters/{brandId}/* → raw.githubusercontent.com/{brandId}/*
  const assetBase = (USE_CDN_URLS && cdnBase) ? `${cdnBase}/${brandId}` : gitRawBase;

  // 1. Build the list of files to commit. Validate each before we touch GitHub.
  const files = [];

  if (hasImages) {
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const path = `${CONTENT_DIR}/${campaignId}/section-${i + 1}.png`;

      if (!IMAGE_PATH_REGEX.test(path)) {
        throw new Error(`image-host: refusing to upload — invalid image path "${path}"`);
      }

      if (!Buffer.isBuffer(img.png)) {
        throw new Error(`image-host: section ${i + 1} png is not a Buffer (got ${typeof img.png})`);
      }

      if (!img.png.slice(0, 8).equals(PNG_MAGIC)) {
        throw new Error(`image-host: section ${i + 1} buffer is not a valid PNG (magic bytes mismatch)`);
      }

      files.push({
        path,
        contentBase64: img.png.toString('base64'),
        kind: 'image',
      });
    }
  }

  if (hasHtml) {
    const path = `${CONTENT_DIR}/${campaignId}/newsletter.html`;

    if (!HTML_PATH_REGEX.test(path)) {
      throw new Error(`image-host: refusing to upload — invalid html path "${path}"`);
    }

    files.push({
      path,
      contentBase64: Buffer.from(html, 'utf8').toString('base64'),
      kind: 'html',
    });
  }

  if (hasMarkdown) {
    const path = `${CONTENT_DIR}/${campaignId}/newsletter.md`;

    if (!MARKDOWN_PATH_REGEX.test(path)) {
      throw new Error(`image-host: refusing to upload — invalid markdown path "${path}"`);
    }

    files.push({
      path,
      contentBase64: Buffer.from(markdown, 'utf8').toString('base64'),
      kind: 'markdown',
    });
  }

  if (hasSummary) {
    const path = `${CONTENT_DIR}/${campaignId}/summary.md`;

    if (!SUMMARY_PATH_REGEX.test(path)) {
      throw new Error(`image-host: refusing to upload — invalid summary path "${path}"`);
    }

    files.push({
      path,
      contentBase64: Buffer.from(summary, 'utf8').toString('base64'),
      kind: 'summary',
    });
  }

  const imageCount = files.filter((f) => f.kind === 'image').length;
  const fileSummary = [
    imageCount ? `${imageCount} PNG${imageCount === 1 ? '' : 's'}` : null,
    hasHtml ? 'newsletter.html' : null,
    hasMarkdown ? 'newsletter.md' : null,
    hasSummary ? 'summary.md' : null,
  ].filter(Boolean).join(' + ');

  log(`uploading ${fileSummary} to ${REPO_OWNER}/${REPO_NAME}:${branch} → ${CONTENT_DIR}/${campaignId}/`);

  const octokit = new Octokit({ auth: githubToken });

  // 2. Ensure the brand branch exists. New branches start empty (orphan
  //    commit with an empty tree) — no files from main, no shared history.
  let branchSha;
  try {
    const { data } = await octokit.rest.git.getRef({ owner: REPO_OWNER, repo: REPO_NAME, ref: `heads/${branch}` });
    branchSha = data.object.sha;
  } catch (e) {
    if (e.status === 404) {
      // Create an empty tree → orphan commit → brand branch
      const { data: emptyTree } = await octokit.rest.git.createTree({
        owner: REPO_OWNER, repo: REPO_NAME, tree: [],
      });
      const { data: orphanCommit } = await octokit.rest.git.createCommit({
        owner: REPO_OWNER, repo: REPO_NAME,
        message: `Initialize ${branch} branch`,
        tree: emptyTree.sha,
        parents: [],
      });
      await octokit.rest.git.createRef({
        owner: REPO_OWNER, repo: REPO_NAME,
        ref: `refs/heads/${branch}`,
        sha: orphanCommit.sha,
      });
      branchSha = orphanCommit.sha;
      log(`created empty branch "${branch}"`);
    } else {
      throw e;
    }
  }

  // 3. Create blobs (content-addressed — safe to reuse if we ever add retries)
  const treeItems = [];

  for (const file of files) {
    const { data: blob } = await octokit.rest.git.createBlob({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      content: file.contentBase64,
      encoding: 'base64',
    });

    treeItems.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
  }

  // 4. Commit + push with retry. Per-brand branches make ref races effectively
  //    impossible (one writer per branch), but keep a defensive retry in case
  //    the same brand ever uploads concurrently or GitHub returns a stale ref.
  const defaultSubject = subject ? subject.trim() : `${files.length} newsletter asset${files.length === 1 ? '' : 's'}`;
  const message = commitMessage || `[${brandId}] ${campaignId} — ${defaultSubject}`;
  const MAX_RETRIES = 3;
  let newCommit;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { data: refData } = await octokit.rest.git.getRef({
      owner: REPO_OWNER, repo: REPO_NAME, ref: `heads/${branch}`,
    });
    const tipSha = refData.object.sha;

    const { data: baseCommit } = await octokit.rest.git.getCommit({
      owner: REPO_OWNER, repo: REPO_NAME, commit_sha: tipSha,
    });

    const { data: newTree } = await octokit.rest.git.createTree({
      owner: REPO_OWNER, repo: REPO_NAME,
      base_tree: baseCommit.tree.sha,
      tree: treeItems,
    });

    newCommit = (await octokit.rest.git.createCommit({
      owner: REPO_OWNER, repo: REPO_NAME,
      message,
      tree: newTree.sha,
      parents: [tipSha],
    })).data;

    try {
      await octokit.rest.git.updateRef({
        owner: REPO_OWNER, repo: REPO_NAME,
        ref: `heads/${branch}`,
        sha: newCommit.sha,
      });
      break;
    } catch (e) {
      if (attempt < MAX_RETRIES && /fast.forward/i.test(e.message)) {
        const jitter = 500 + Math.floor(Math.random() * 1500);
        log(`updateRef race (attempt ${attempt}/${MAX_RETRIES}), retrying in ${jitter}ms...`);
        await new Promise(r => setTimeout(r, jitter));
        continue;
      }
      throw e;
    }
  }

  // 7. Split the URL list by kind so callers can grab each independently.
  const imageFiles = files.filter((f) => f.kind === 'image');
  const htmlFile = files.find((f) => f.kind === 'html');
  const markdownFile = files.find((f) => f.kind === 'markdown');
  const summaryFile = files.find((f) => f.kind === 'summary');

  const result = {
    urls: imageFiles.map((f) => `${assetBase}/${f.path}`),
    paths: imageFiles.map((f) => f.path),
    folderUrl: `https://github.com/${REPO_OWNER}/${REPO_NAME}/tree/${branch}/${CONTENT_DIR}/${campaignId}`,
    commitSha: newCommit.sha,
  };

  if (htmlFile) {
    result.htmlUrl = `${assetBase}/${htmlFile.path}`;
    result.htmlPath = htmlFile.path;
    result.previewUrl = `${PAGES_BASE}/?path=${encodeURIComponent(htmlFile.path)}&branch=${encodeURIComponent(branch)}`;
  }

  if (markdownFile) {
    result.markdownUrl = `${assetBase}/${markdownFile.path}`;
    result.markdownPath = markdownFile.path;
  }

  if (summaryFile) {
    result.summaryUrl = `${assetBase}/${summaryFile.path}`;
    result.summaryPath = summaryFile.path;
  }

  log(`committed ${newCommit.sha.slice(0, 7)} to ${branch} — folder: ${result.folderUrl}`);

  return result;
}

function validateBrandId(brandId) {
  if (!brandId || !/^[a-z0-9-]+$/.test(brandId)) {
    throw new Error(`image-host: brandId must be lowercase alphanumeric+hyphens (got "${brandId}")`);
  }
}

function validateCampaignId(campaignId) {
  if (!campaignId || !/^[A-Za-z0-9_-]+$/.test(campaignId)) {
    throw new Error(`image-host: campaignId must be alphanumeric/_/- (got "${campaignId}")`);
  }
}

module.exports = {
  uploadAssets,
  USE_CDN_URLS,
  REPO_OWNER,
  REPO_NAME,
  RAW_BASE,
  PAGES_BASE,
};
