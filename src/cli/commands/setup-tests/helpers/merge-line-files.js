/**
 * SSOT shim for line-based file merging (.env / .gitignore / CLAUDE.md).
 *
 * The real merge logic lives in `src/utils/merge-line-files.js` — a key-based
 * merge that keeps each KEY under its template header and promotes/migrates keys
 * between the Default/Custom sections correctly. This file used to contain a
 * SECOND, positional implementation that zipped comment lines and value lines by
 * index; an off-by-one there is what historically scrambled consumers' `.env`
 * files. That duplicate is gone — this module now just re-exports the canonical
 * impl and adds the marker-name aliases + `hasSectionMarkers()` the setup tests
 * (`env-file.js`, `gitignore.js`) consume.
 */

const {
  mergeLineBasedFiles,
  DEFAULT_MARKER,
  CUSTOM_MARKER,
} = require('../../../../utils/merge-line-files.js');

/**
 * Check if a file already has the Default/Custom section markers.
 * @param {string} content
 * @returns {boolean}
 */
function hasSectionMarkers(content) {
  return content.includes(DEFAULT_MARKER) && content.includes(CUSTOM_MARKER);
}

module.exports = {
  mergeLineBasedFiles,
  hasSectionMarkers,
  // Names the setup tests import (aliases of the canonical markers).
  DEFAULT_SECTION_MARKER: DEFAULT_MARKER,
  CUSTOM_SECTION_MARKER: CUSTOM_MARKER,
};
