/**
 * Shared contact inference library
 *
 * Infers first/last name and company from an email address.
 * Tries AI first (if OPENAI_API_KEY is set), falls back to regex parsing.
 *
 * Usage:
 *   const { inferContact } = require('./libraries/infer-contact.js');
 *   const result = await inferContact(email, assistant);
 *   // { firstName, lastName, company, confidence, method }
 */
const path = require('path');

const PROMPT_PATH = path.join(__dirname, 'prompts', 'infer-contact.md');

// Common email providers (don't infer company from these domains)
const GENERIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'proton.me', 'zoho.com',
  'yandex.com', 'gmx.com', 'live.com', 'msn.com', 'me.com',
]);

/**
 * Infer contact info from email address
 * Tries AI first (if OPENAI_API_KEY is set), falls back to regex
 *
 * @param {string} email - Email address
 * @param {object} assistant - Assistant instance (for AI access)
 * @returns {{ firstName: string, lastName: string, company: string, confidence: number, method: string }}
 */
async function inferContact(email, assistant) {
  if (process.env.BACKEND_MANAGER_OPENAI_API_KEY) {
    const aiResult = await inferContactWithAI(email, assistant);
    if (aiResult && (aiResult.firstName || aiResult.lastName)) {
      return aiResult;
    }
  }

  return inferContactFromEmail(email);
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
    const ai = assistant.Manager.AI(assistant);
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

    if (result?.firstName !== undefined) {
      return {
        firstName: capitalize(result.firstName || ''),
        lastName: capitalize(result.lastName || ''),
        company: capitalize(result.company || ''),
        confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
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
 * Regex-based contact inference from email
 * Extracts name from local part and company from domain
 *
 * @param {string} email - Email address
 * @returns {{ firstName: string, lastName: string, company: string, confidence: number, method: string }}
 */
function inferContactFromEmail(email) {
  const [local, domain] = email.split('@');

  // Infer company from domain (skip generic providers)
  let company = '';
  if (domain && !GENERIC_DOMAINS.has(domain.toLowerCase())) {
    const domainName = domain.split('.')[0];
    company = capitalize(domainName.replace(/[-_]/g, ' '));
  }

  // Infer name from local part
  const cleaned = local.replace(/[0-9]+$/, '');
  const parts = cleaned.split(/[._-]/);

  if (parts.length >= 2) {
    return {
      firstName: capitalize(parts[0]),
      lastName: capitalize(parts.slice(1).join(' ')),
      company,
      confidence: 0.5,
      method: 'regex',
    };
  }

  return {
    firstName: capitalize(cleaned),
    lastName: '',
    company,
    confidence: 0.25,
    method: 'regex',
  };
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

module.exports = { inferContact, inferContactFromEmail, capitalize };
