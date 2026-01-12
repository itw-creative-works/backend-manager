const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const path = require('path');
const { mergeLineBasedFiles, hasSectionMarkers, DEFAULT_SECTION_MARKER } = require('./helpers/merge-line-files');

// Old BEM marker regex
const OLD_BEM_MARKER_REGEX = /# BEM>>>([\s\S]*?)# <<<BEM\n?/g;

class GitignoreTest extends BaseTest {
  getName() {
    return 'has correct .gitignore';
  }

  async run() {
    const gitignorePath = `${this.self.firebaseProjectPath}/functions/.gitignore`;
    const existingContent = jetpack.read(gitignorePath);

    if (!existingContent) {
      return false;
    }

    // Check for old BEM markers that need to be removed
    if (OLD_BEM_MARKER_REGEX.test(existingContent)) {
      return false;
    }

    // Check if file has proper section markers
    if (!hasSectionMarkers(existingContent)) {
      return false;
    }

    // Get the template
    const templatePath = path.resolve(__dirname, '../../../../templates/_.gitignore');
    const templateContent = jetpack.read(templatePath);

    if (!templateContent) {
      throw new Error('Could not read .gitignore template file');
    }

    // Extract default sections and compare
    const existingDefaults = this.extractDefaultSection(existingContent);
    const templateDefaults = this.extractDefaultSection(templateContent);

    // Check if all template defaults are present in existing defaults
    const templateLines = templateDefaults
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));

    const existingLines = existingDefaults
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));

    for (const line of templateLines) {
      if (!existingLines.includes(line)) {
        return false;
      }
    }

    return true;
  }

  extractDefaultSection(content) {
    const lines = content.split('\n');
    const defaultLines = [];
    let inDefaultSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === DEFAULT_SECTION_MARKER) {
        inDefaultSection = true;
        continue;
      }
      if (trimmed === '# ========== Custom Values ==========') {
        break;
      }

      if (inDefaultSection) {
        defaultLines.push(line);
      }
    }

    return defaultLines.join('\n');
  }

  async fix() {
    const gitignorePath = `${this.self.firebaseProjectPath}/functions/.gitignore`;
    const templatePath = path.resolve(__dirname, '../../../../templates/_.gitignore');

    const templateContent = jetpack.read(templatePath);
    if (!templateContent) {
      throw new Error('Could not read .gitignore template file');
    }

    let existingContent = jetpack.read(gitignorePath) || '';

    // Remove old BEM markers if present
    existingContent = existingContent.replace(OLD_BEM_MARKER_REGEX, '');

    // Clean up any extra blank lines left behind
    existingContent = existingContent.replace(/\n{3,}/g, '\n\n');

    // If file doesn't have section markers, treat existing content as custom values
    if (!hasSectionMarkers(existingContent)) {
      const customValues = existingContent.trim();
      existingContent = templateContent.replace(
        '# ...',
        customValues ? customValues + '\n# ...' : '# ...'
      );
    } else {
      // Smart merge
      existingContent = mergeLineBasedFiles(existingContent, templateContent, '.gitignore');
    }

    jetpack.write(gitignorePath, existingContent);
  }
}

module.exports = GitignoreTest;