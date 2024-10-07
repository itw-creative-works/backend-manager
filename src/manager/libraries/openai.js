const fetch = require('wonderful-fetch');
const jetpack = require('fs-jetpack');
const powertools = require('node-powertools');
const _ = require('lodash');
const JSON5 = require('json5');

// Constants
const DEFAULT_MODEL = 'gpt-4o';
const TOKEN_COST_TABLE = {
  // Oct 7th, 2024
  'gpt-4o': {
    input: 0.002500,
    output: 0.010000,
  },
  'gpt-4o-mini': {
    input: 0.000150,
    output: 0.000600,
  },
  'o1-preview': {
    input: 0.015000,
    output: 0.060000,
  },
  'o1-mini': {
    input: 0.003000,
    output: 0.012000,
  },
  'gpt-4-turbo': {
    input: 0.010000,
    output: 0.030000,
  },
  'gpt-4': {
    input: 0.030000,
    output: 0.060000,
  },
  'gpt-3.5-turbo': {
    input: 0.000500,
    output: 0.001500,
  },

  // // Sept 21st, 2024
  // 'gpt-4o': {
  //   input: 0.005000,
  //   output: 0.015000,
  // },
  // 'gpt-4o-mini': {
  //   input: 0.000150,
  //   output: 0.000600,
  // },
  // 'o1-preview': {
  //   input: 0.015000,
  //   output: 0.060000,
  // },
  // 'o1-mini': {
  //   input: 0.003000,
  //   output: 0.012000,
  // },
  // 'gpt-4-turbo': {
  //   input: 0.010000,
  //   output: 0.030000,
  // },
  // 'gpt-4': {
  //   input: 0.030000,
  //   output: 0.060000,
  // },
  // 'gpt-3.5-turbo': {
  //   input: 0.000500,
  //   output: 0.001500,
  // },

  // // Jul 18th, 2024
  // 'gpt-4o': {
  //   input: 0.005000,
  //   output: 0.015000,
  // },
  // 'gpt-4o-mini': {
  //   input: 0.000150,
  //   output: 0.000600,
  // },
  // 'gpt-4-turbo': {
  //   input: 0.010000,
  //   output: 0.030000,
  // },
  // 'gpt-4': {
  //   input: 0.030000,
  //   output: 0.060000,
  // },
  // 'gpt-3.5-turbo': {
  //   input: 0.000500,
  //   output: 0.001500,
  // },

  // // May 13th, 2024
  // 'gpt-4o': {
  //   input: 0.0050,
  //   output: 0.0150,
  // },
  // 'gpt-4-turbo': {
  //   input: 0.0100,
  //   output: 0.0300,
  // },
  // 'gpt-4-turbo-preview': {
  //   input: 0.0100,
  //   output: 0.0300,
  // },
  // 'gpt-4-vision-preview': {
  //   input: 0.0100,
  //   output: 0.0300,
  // },
  // 'gpt-4-1106-preview': {
  //   input: 0.0100,
  //   output: 0.0300,
  // },
  // 'gpt-4': {
  //   input: 0.0300,
  //   output: 0.0600,
  // },
  // 'gpt-3.5-turbo': {
  //   input: 0.0005,
  //   output: 0.0015,
  // },

  // // Apr 9th, 2024
  // 'gpt-4-turbo': {
  //   input: 0.0100,
  //   output: 0.0300,
  // },
  // 'gpt-4-turbo-preview': {
  //   input: 0.0100,
  //   output: 0.0300,
  // },
  // 'gpt-4-vision-preview': {
  //   input: 0.0100,
  //   output: 0.0300,
  // },
  // 'gpt-4-1106-preview': {
  //   input: 0.0100,
  //   output: 0.0300,
  // },
  // 'gpt-4': {
  //   input: 0.0300,
  //   output: 0.0600,
  // },
  // 'gpt-3.5-turbo': {
  //   input: 0.0005,
  //   output: 0.0015,
  // },

  // Mar 6th, 2024
  // 'gpt-4-turbo-preview': {
  //   input: 0.0100,
  //   output: 0.0300,
  // },
  // 'gpt-4-vision-preview': {
  //   input: 0.0100,
  //   output: 0.0300,
  // },
  // 'gpt-4-1106-preview': {
  //   input: 0.0100,
  //   output: 0.0300,
  // },
  // 'gpt-4': {
  //   input: 0.0300,
  //   output: 0.0600,
  // },
  // 'gpt-3.5-turbo': {
  //   input: 0.0005,
  //   output: 0.0015,
  // },

  // Nov 6th, 2023
  // 'gpt-4-turbo-preview': {
  //   input: 0.0100,
  //   output: 0.0300,
  // },
  // 'gpt-4-1106-preview': {
  //   input: 0.0100,
  //   output: 0.0300,
  // },
  // 'gpt-4': {
  //   input: 0.0300,
  //   output: 0.0600,
  // },
  // 'gpt-3.5-turbo': {
  //   input: 0.0010,
  //   output: 0.0020,
  // },
}

const UNSUPPORTED_JSON = [
  /gpt-3.5/,
  /gpt-4-vision/,
];


function OpenAI(assistant, key) {
  const self = this;

  self.assistant = assistant;
  self.Manager = assistant.Manager;
  self.user = assistant.user;
  self.key = key || self.Manager.config?.openai?.key;

  self.tokens = {
    total: {
      count: 0,
      price: 0,
    },
    input: {
      count: 0,
      price: 0,
    },
    output: {
      count: 0,
      price: 0,
    },
  }

  return self;
}

OpenAI.prototype.request = function (options) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  return new Promise(async function(resolve, reject) {
    options = _.merge({}, options);

    options.model = typeof options.model === 'undefined' ? DEFAULT_MODEL : options.model;
    options.timeout = typeof options.timeout === 'undefined' ? 120000 : options.timeout;
    options.moderate = typeof options.moderate === 'undefined' ? true : options.moderate;
    options.log = typeof options.log === 'undefined' ? false : options.log;
    options.user = options.user || assistant.getUser();

    options.retries = typeof options.retries === 'undefined' ? 0 : options.retries;
    options.retryTriggers = typeof options.retryTriggers === 'undefined' ? ['network', 'parse'] : options.retryTriggers;

    options.prompt = options.prompt || {};
    options.prompt.path = options.prompt.path || '';
    options.prompt.text = options.prompt.text || options.prompt.content || '';
    options.prompt.settings = options.prompt.settings || {};

    options.message = options.message || {};
    options.message.path = options.message.path || '';
    options.message.text = options.message.text || options.message.content || '';
    options.message.settings = options.message.settings || {};
    options.message.images = options.message.images || [];

    options.history = options.history || {};
    options.history.messages = options.history.messages || [];
    options.history.limit = typeof options.history.limit === 'undefined' ? 5 : options.history.limit;

    options.response = typeof options.response === 'undefined' ? undefined : options.response;
    options.temperature = typeof options.temperature === 'undefined' ? 0.7 : options.temperature;
    options.maxTokens = typeof options.maxTokens === 'undefined' ? 512 : options.maxTokens;

    let attempt = 0;

    function _log() {
      if (!options.log)  {
        return;
      }

      assistant.log('callOpenAI():', ...arguments);
    }

    function _load(input) {
      // console.log('*** input!!!', input.content.slice(0, 50), input.path);
      // console.log('*** input.content', input.content.slice(0, 50));
      // console.log('*** input.path', input.path);

      let text = '';

      // Load text
      if (input.path) {
        const exists = jetpack.exists(input.path);

        _log('Reading prompt from path:', input.path);

        if (!exists) {
          return new Error(`Path ${input.path} not found`);
        } else if (exists === 'dir') {
          return new Error(`Path ${input.path} is a directory`);
        }

        try {
          text = jetpack.read(input.path);
        } catch (e) {
          return new Error(`Error reading file ${input.path}: ${e}`);
        }
      } else {
        text = input.text;
      }

      return powertools.template(text, input.settings).trim();
    }

    // Log
    _log('Starting', options);

    // Determine response format
    let responseFormat = options.response === 'json' ? { type: 'json_object' } : undefined;
    if (UNSUPPORTED_JSON.some((model) => options.model.match(model))) {
      responseFormat = undefined;
      assistant.warn(`Model ${options.model} does not support JSON response format`);
    }

    _log('responseFormat', responseFormat);

    // Load prompt
    const prompt = _load(options.prompt);
    const message = _load(options.message);
    const user = options.user?.auth?.uid || assistant.request.geolocation.ip;

    // Log
    _log('Prompt', prompt);
    _log('Message', message);
    _log('User', user);

    // Check for errors
    if (prompt instanceof Error) {
      return reject(assistant.errorify(`Error loading prompt: ${prompt}`, {code: 400}));
    }

    if (message instanceof Error) {
      return reject(assistant.errorify(`Error loading message: ${message}`, {code: 400}));
    }

    // Request
    function _request(mode, options) {
      return new Promise(async function(resolve, reject) {
        let resultPath = '';
        const request = {
          url: '',
          method: 'post',
          response: 'json',
          // response: 'raw',
          // log: true,
          attachResponseHeaders: true,
          tries: 1,
          timeout: options.timeout,
          headers: {
            'Authorization': `Bearer ${self.key}`,
          },
          body: {},
        }

        if (mode === 'chatgpt') {
          request.url = 'https://api.openai.com/v1/chat/completions';

          // Get history
          const history = options.history.messages.slice(-options.history.limit);

          // Add prompt to history
          history.unshift({
            role: 'system',
            text: prompt,
            images: [],
          });

          // Set last history item
          const lastHistory = history[history.length - 1];

          // If message is different than last message in history, add it
          if (lastHistory?.text !== message) {
            history.push({
              role: 'user',
              text: message,
              images: options.message.images,
            });
          }

          // Format history
          history.map((m) => {
            m.role = m.role || 'system';

            m.content = [];

            // Set content
            if (m.text) {
              m.content.push({
                type: 'text',
                text: m.text,
              })
            }

            // Set images
            m.images = m.images || [];

            // Loop through and add
            m.images.forEach((i) => {
              if (i.url) {
                m.content.push({
                  type: 'image_url',
                  image_url: {
                    url: i.url,
                    detail: i.detail || 'low',
                  }
                });
              }
            }),

            // Delete text and images
            delete m.text;
            delete m.images;
          })

          // Log message
          history.forEach((m) => {
            _log('Message', m.role, m.content);
          });

          request.body = {
            model: options.model,
            response_format: responseFormat,
            messages: history,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            user: user,
          }
          resultPath = 'choices[0].message.content';
        } else if (mode === 'moderation') {
          request.url = 'https://api.openai.com/v1/moderations';
          request.body = {
            input: message,
            user: user,
          }
          resultPath = 'results[0]';
        }

        // Request
        await fetch(request.url, request)
        .then(async (r) => {
          // Set token counts
          self.tokens.input.count += r?.usage?.prompt_tokens || 0;
          self.tokens.output.count += r?.usage?.completion_tokens || 0;
          self.tokens.total.count = self.tokens.input.count + self.tokens.output.count;

          // Set token prices
          self.tokens.input.price = (self.tokens.input.count / 1000) * TOKEN_COST_TABLE[options.model].input;
          self.tokens.output.price = (self.tokens.output.count / 1000) * TOKEN_COST_TABLE[options.model].output;
          self.tokens.total.price = self.tokens.input.price + self.tokens.output.price;

          // Return
          return resolve(_.get(r, resultPath));
        })
        .catch((e) => {
          return reject(e);
        })
      });
    }

    // Moderate if needed
    let moderation = null;
    if (options.moderate) {
      moderation = await _request('moderation', options)
      .then(async (r) => {
        _log('Moderated', r);

        return r;
      })
      .catch((e) => e);

      // Check for moderation flag
      if (moderation.flagged) {
        return reject(assistant.errorify(`This request is inappropriate`, {code: 451}));
      }
    }

    function _attempt() {
      const retries = options.retries;
      const triggers = options.retryTriggers;

      // Increment attempt
      attempt++;

      // Log
      _log(`Request ${attempt}/${retries}`);

      // Request
      _request('chatgpt', options)
      .then((r) => {
        _log('Response', r);
        _log('Tokens', self.tokens);

        // Try to parse JSON response if needed
        try {
          const content = options.response === 'json' ? JSON5.parse(r) : r;

          // Return
          return resolve({
            content: content,
            tokens: self.tokens,
            moderation: moderation,
          })
        } catch (e) {
          assistant.error('Error parsing response', r, e);

          // Retry
          if (attempt < retries && triggers.includes('parse')) {
            return _attempt();
          }

          // Return
          return reject(e);
        }
      })
      .catch((e) => {
        const parsed = tryParse(e.message)?.error || {};
        const type = parsed?.type || '';
        const message = parsed?.message || e.message;

        // Log
        assistant.error(`Error requesting (type=${type}, message=${message})`, e);

        // Check for invalid request error
        if (type === 'invalid_request_error') {
          return reject(assistant.errorify(message, {code: 400}));
        }

        // Retry
        if (attempt < retries && triggers.includes('network')) {
          return _attempt();
        }

        // Return
        return reject(e);
      });
    }

    // Make attempt
    _attempt();
  });
}

function tryParse(content) {
  try {
    return JSON5.parse(content);
  } catch (e) {
    return content;
  }
}

module.exports = OpenAI;
