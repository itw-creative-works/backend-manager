const assert = require('assert');
const Manager = require('../../src/manager/index.js');

describe('AI Library Tests', function() {
  let manager;
  let assistant;
  let ai;

  before(function() {
    manager = new Manager();
    manager.init(exports, {
      projectType: 'custom',
      setupServer: false,
      initialize: false,
      backendManagerConfigPath: 'templates/backend-manager-config.json',
    });
    assistant = manager.assistant;
    ai = new (require('../../src/manager/libraries/openai'))(assistant, process.env.OPENAI_API_KEY);
  });

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Please set it in your environment variables.');
  }

  describe('Simple AI Message Test', function() {
    it('should respond with "Hi!" when asked to say hi', async function() {
      this.timeout(30000);

      const response = await ai.request({
        // log: true,
        prompt: { content: 'You are helping test an implementation. Please respond with "Hi!" and nothing else.' },
        message: { content: 'Hi there friend!' },
      });

      assert(response);
      assert(response.content);
      assert.strictEqual(response.content.trim(), 'Hi!');
    });

    it('should analyze an image and respond with "cat"', async function() {
      this.timeout(30000);

      const response = await ai.request({
        // log: true,
        prompt: { content: 'You are a helpful assistant that describes images. Please answer in ONE WORD.' },
        message: {
          content: 'What animal is this?',
          attachments: [
            {
              type: 'image',
              content: `${__dirname}/test.jpg`,
            }
          ]
        },
      });

      assert(response);
      assert(response.content);
      assert.strictEqual(response.content.trim().toLowerCase(), 'cat');
    });

    it('should analyze a PDF file and respond with "42"', async function() {
      this.timeout(30000);

      const response = await ai.request({
        // log: true,
        prompt: { content: 'You are a helpful assistant that analyzes documents. Please answer in ONE WORD.' },
        message: {
          content: 'What is the answer (numerical form)?',
          attachments: [
            {
              type: 'file',
              content: `${__dirname}/test.pdf`,
              filename: 'test.pdf'
            }
          ]
        },
      });

      assert(response);
      assert.strictEqual(response.content.trim().toLowerCase(), '42');
    });

    it('should analyze a remote image URL and respond with "cat"', async function() {
      this.timeout(30000);

      const response = await ai.request({
        // log: true,
        prompt: { content: 'You are a helpful assistant that describes images. Please answer in ONE WORD.' },
        message: {
          content: 'What animal is this?',
          attachments: [
            {
              type: 'image',
              content: 'https://raw.githubusercontent.com/ITW-Creative-Works/backend-manager/master/test/ai/test.jpg',
            }
          ]
        },
      });

      assert(response);
      assert(response.content);
      assert.strictEqual(response.content.trim().toLowerCase(), 'cat');
    });

    it('should analyze a remote PDF URL and respond with "42"', async function() {
      this.timeout(30000);

      const response = await ai.request({
        // log: true,
        prompt: { content: 'You are a helpful assistant that analyzes documents. Please answer in ONE WORD.' },
        message: {
          content: 'What is the answer (numerical form)?',
          attachments: [
            {
              type: 'file',
              content: 'https://raw.githubusercontent.com/ITW-Creative-Works/backend-manager/master/test/ai/test.pdf',
              filename: 'test.pdf'
            }
          ]
        },
      });

      assert(response);
      assert.strictEqual(response.content.trim().toLowerCase(), '42');
    });

    it('should return JSON when response format is set to json', async function() {
      this.timeout(30000);

      const response = await ai.request({
        // log: true,
        response: 'json',
        prompt: { content: 'You are a helpful assistant that returns structured data in JSON format.' },
        message: { content: 'Give me information about a cat in JSON format with fields: name, age, color.' },
      });

      assert(response);
      assert(response.content);
      assert(typeof response.content === 'object');
      assert(response.content.name);
      assert(response.content.age);
      assert(response.content.color);
    });

    it('should return data matching schema when schema is provided', async function() {
      this.timeout(30000);

      const schema = {
        type: 'object',
        properties: {
          animal: {
            type: 'string',
            description: 'The type of animal'
          },
          characteristics: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'List of characteristics'
          },
          habitat: {
            type: 'string',
            description: 'Where the animal lives'
          }
        },
        required: ['animal', 'characteristics', 'habitat'],
        additionalProperties: false
      };

      const response = await ai.request({
        // log: true,
        response: 'json',
        schema: schema,
        prompt: { content: 'You are a helpful assistant that provides animal information.' },
        message: { content: 'Tell me about a lion.' },
      });

      assert(response);
      assert(response.content);
      assert(typeof response.content === 'object');
      assert.strictEqual(typeof response.content.animal, 'string');
      assert(Array.isArray(response.content.characteristics));
      assert.strictEqual(typeof response.content.habitat, 'string');
      assert(response.content.animal.toLowerCase().includes('lion'));
    });

    it('should moderate content and return moderation results', async function() {
      this.timeout(30000);

      const response = await ai.request({
        // log: true,
        moderate: true,
        prompt: { content: 'You are a helpful assistant.' },
        message: { content: 'This is a completely normal and appropriate message about cats.' },
      });

      assert(response);
      assert(response.content);
      assert(response.moderation);
      assert(typeof response.moderation.flagged === 'boolean');
      assert.strictEqual(response.moderation.flagged, false);
    });

    it('should moderate content with image attachment', async function() {
      this.timeout(30000);

      const response = await ai.request({
        // log: true,
        moderate: true,
        prompt: { content: 'You are a helpful assistant.' },
        message: {
          content: 'Here is an image of a cat.',
          attachments: [
            {
              type: 'image',
              content: `${__dirname}/test.jpg`,
            }
          ]
        },
      });

      assert(response);
      assert(response.content);
      assert(response.moderation);
      assert(typeof response.moderation.flagged === 'boolean');
      assert.strictEqual(response.moderation.flagged, false);
    });
  });
});
