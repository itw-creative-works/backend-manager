/**
 * Compatibility shim — `libraries/openai.js` was the original AI library.
 * It has been moved to `libraries/ai/providers/openai.js` and the new unified
 * surface is `libraries/ai/index.js`.
 *
 * Existing callers (`require('./libraries/openai.js')`) continue to receive the
 * OpenAI provider class with the same constructor + prototype as before. New
 * code should use the unified surface:
 *
 *   const ai = Manager.AI(assistant);
 *   await ai.request({ provider: 'openai' | 'anthropic', ... });
 */
module.exports = require('./ai/providers/openai.js');
