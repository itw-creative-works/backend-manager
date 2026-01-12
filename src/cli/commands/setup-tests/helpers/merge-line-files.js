/**
 * Smart merge for line-based files (.gitignore, .env)
 * Preserves custom values while updating defaults
 */

const DEFAULT_SECTION_MARKER = '# ========== Default Values ==========';
const CUSTOM_SECTION_MARKER = '# ========== Custom Values ==========';

/**
 * Merge line-based files with smart Default/Custom section handling
 * @param {string} existingContent - Current file content
 * @param {string} newContent - New template content
 * @param {string} fileName - File name (.env or .gitignore)
 * @returns {string} Merged content
 */
function mergeLineBasedFiles(existingContent, newContent, fileName) {
  const existingLines = existingContent.split('\n');
  const newLines = newContent.split('\n');

  const isEnvFile = fileName === '.env';

  // Parse existing file into default section and custom section
  let defaultSection = [];
  let customSection = [];
  let inCustomSection = false;
  let inDefaultSection = false;

  const existingDefaultKeys = new Set();
  const existingCustomKeys = new Set();

  for (const line of existingLines) {
    const trimmed = line.trim();

    if (trimmed === DEFAULT_SECTION_MARKER) {
      inDefaultSection = true;
      inCustomSection = false;
      continue;
    }
    if (trimmed === CUSTOM_SECTION_MARKER) {
      inCustomSection = true;
      inDefaultSection = false;
      continue;
    }

    if (inCustomSection) {
      customSection.push(line);
      if (isEnvFile && trimmed && !trimmed.startsWith('#')) {
        const key = trimmed.split('=')[0].trim();
        if (key) {
          existingCustomKeys.add(key);
        }
      }
    } else if (inDefaultSection) {
      defaultSection.push(line);
      if (isEnvFile && trimmed && !trimmed.startsWith('#')) {
        const key = trimmed.split('=')[0].trim();
        if (key) {
          existingDefaultKeys.add(key);
        }
      }
    }
  }

  // Parse new content to build complete default section
  const newDefaultSection = [];
  const newDefaultKeys = new Set();

  let inNewDefaultSection = false;
  let inNewCustomSection = false;

  for (const line of newLines) {
    const trimmed = line.trim();

    if (trimmed === DEFAULT_SECTION_MARKER) {
      inNewDefaultSection = true;
      inNewCustomSection = false;
      continue;
    }
    if (trimmed === CUSTOM_SECTION_MARKER) {
      inNewCustomSection = true;
      inNewDefaultSection = false;
      continue;
    }

    if (inNewDefaultSection) {
      if (isEnvFile && trimmed && !trimmed.startsWith('#')) {
        const key = trimmed.split('=')[0].trim();
        if (key) {
          newDefaultKeys.add(key);
          if (!existingDefaultKeys.has(key) && !existingCustomKeys.has(key)) {
            newDefaultSection.push(line);
          } else {
            newDefaultSection.push(null); // Placeholder
          }
        } else {
          newDefaultSection.push(line);
        }
      } else {
        newDefaultSection.push(line);
      }
    }
  }

  // Merge user's existing default values in the correct order
  const mergedDefaultSection = [];
  let defaultSectionIndex = 0;

  for (const line of newDefaultSection) {
    if (line === null) {
      while (defaultSectionIndex < defaultSection.length) {
        const userLine = defaultSection[defaultSectionIndex++];
        const trimmed = userLine.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          mergedDefaultSection.push(userLine);
          break;
        }
      }
    } else {
      mergedDefaultSection.push(line);
    }
  }

  // Find user-added lines in default section that aren't in new defaults
  const userAddedToDefaults = [];

  for (const line of defaultSection) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (isEnvFile) {
      const key = trimmed.split('=')[0].trim();
      if (key && !newDefaultKeys.has(key) && !existingCustomKeys.has(key)) {
        userAddedToDefaults.push(line);
      }
    } else {
      const lineExistsInNewDefaults = newLines.some(newLine => {
        return newLine.trim() === trimmed;
      });

      if (!lineExistsInNewDefaults) {
        userAddedToDefaults.push(line);
      }
    }
  }

  // Build final result
  const result = [];

  result.push(DEFAULT_SECTION_MARKER);
  result.push(...mergedDefaultSection);

  result.push('');
  result.push(CUSTOM_SECTION_MARKER);

  if (userAddedToDefaults.length > 0) {
    result.push(...userAddedToDefaults);
  }

  result.push(...customSection);

  return result.join('\n');
}

/**
 * Check if file has proper section markers
 * @param {string} content - File content
 * @returns {boolean}
 */
function hasSectionMarkers(content) {
  return content.includes(DEFAULT_SECTION_MARKER) && content.includes(CUSTOM_SECTION_MARKER);
}

module.exports = {
  mergeLineBasedFiles,
  hasSectionMarkers,
  DEFAULT_SECTION_MARKER,
  CUSTOM_SECTION_MARKER,
};