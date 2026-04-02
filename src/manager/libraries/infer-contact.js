/**
 * Shared contact inference library
 *
 * Infers first/last name and company from an email address using AI.
 * Requires BACKEND_MANAGER_OPENAI_API_KEY to be set.
 *
 * Usage:
 *   const { inferContact } = require('./libraries/infer-contact.js');
 *   const result = await inferContact(email, assistant);
 *   // { firstName, lastName, company, confidence, method }
 */
const path = require('path');

const PROMPT_PATH = path.join(__dirname, 'prompts', 'infer-contact.md');

/**
 * Infer contact info from email address using AI
 *
 * @param {string} email - Email address
 * @param {object} assistant - Assistant instance (for AI access)
 * @returns {{ firstName: string, lastName: string, company: string, confidence: number, method: string }}
 */
async function inferContact(email, assistant) {
  if (process.env.BACKEND_MANAGER_OPENAI_API_KEY) {
    const aiResult = await inferContactWithAI(email, assistant);
    if (aiResult) {
      return aiResult;
    }
  }

  return { firstName: '', lastName: '', company: '', confidence: 0, method: 'none' };
}

/**
 * Use AI to infer contact info from email
 *
 * @param {string} email - Email address
 * @param {object} assistant - Assistant instance
 * @returns {object|null} Inferred contact or null on failure
 */
async function inferContactWithAI(email, assistant) {
  try {
    const ai = assistant.Manager.AI(assistant, process.env.BACKEND_MANAGER_OPENAI_API_KEY);
    const result = await ai.request({
      model: 'gpt-5-mini',
      timeout: 30000,
      maxTokens: 1024,
      moderate: false,
      response: 'json',
      prompt: {
        path: PROMPT_PATH,
      },
      message: {
        content: `Email: ${email}`,
      },
    });

    const parsed = result?.content;
    if (parsed?.firstName !== undefined) {
      return {
        firstName: capitalize(parsed.firstName || ''),
        lastName: capitalize(parsed.lastName || ''),
        company: capitalize(parsed.company || ''),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        method: 'ai',
      };
    }
  } catch (e) {
    if (assistant) {
      assistant.error('inferContactWithAI: Failed:', e);
    }
  }

  return null;
}

/**
 * Capitalize first letter of each word
 *
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalize(str) {
  if (!str) {
    return '';
  }
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

module.exports = { inferContact, capitalize };
