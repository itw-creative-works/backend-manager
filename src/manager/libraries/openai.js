const fetch = require('wonderful-fetch');
const jetpack = require('fs-jetpack');
const powertools = require('node-powertools');
const _ = require('lodash');
const JSON5 = require('json5');

// Constants
const DEFAULT_MODEL = 'gpt-4o';

// https://platform.openai.com/docs/pricing
const MODEL_TABLE = {
  // Jul 11, 2025
  'gpt-4.1': {
    input: 2.00,
    output: 8.00,
    provider: 'openai',
    features: {
      json: true,
    },
  },
  'gpt-4.1-mini': {
    input: 0.40,
    output: 1.60,
    provider: 'openai',
    features: {
      json: true,
    },
  },
  'gpt-4.1-nano': {
    input: 0.10,
    output: 0.40,
    provider: 'openai',
    features: {
      json: true,
    },
  },
  'gpt-4o': {
    input: 2.50,
    output: 10.00,
    provider: 'openai',
    features: {
      json: true,
    },
  },
  'gpt-4o-mini': {
    input: 0.15,
    output: 0.60,
    provider: 'openai',
    features: {
      json: true,
    },
  },
  'o1-preview': {
    input: 15.00,
    output: 60.00,
    provider: 'openai',
    features: {
      json: true,
    },
  },
  'o1-mini': {
    input: 1.10,
    output: 4.40,
    provider: 'openai',
    features: {
      json: true,
    },
  },
  'gpt-4-turbo': {
    input: 10.00,
    output: 30.00,
    provider: 'openai',
    features: {
      json: true,
    },
  },
  'gpt-4': {
    input: 30.00,
    output: 60.00,
    provider: 'openai',
    features: {
      json: true,
    },
  },
  'gpt-4-vision': {
    input: 30.00,
    output: 60.00,
    provider: 'openai',
    features: {
      json: false,
    },
  },
  'gpt-3.5-turbo': {
    input: 0.50,
    output: 1.50,
    provider: 'openai',
    features: {
      json: false,
    },
  },
}

function OpenAI(assistant, key) {
  const self = this;

  self.assistant = assistant;
  self.Manager = assistant.Manager;
  self.user = assistant.user;
  self.key = key
    || self.Manager.config?.openai?.key
    || self.Manager.config?.openai?.global
    || self.Manager.config?.openai?.main

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
    // Deep merge options
    options = _.merge({}, options);

    // Set defaults
    options.model = typeof options.model === 'undefined' ? DEFAULT_MODEL : options.model;
    options.response = typeof options.response === 'undefined' ? undefined : options.response;
    options.timeout = typeof options.timeout === 'undefined' ? 120000 : options.timeout;
    options.moderate = typeof options.moderate === 'undefined' ? true : options.moderate;
    options.log = typeof options.log === 'undefined' ? false : options.log;
    options.user = options.user || assistant.getUser();

    // Format retries
    options.retries = typeof options.retries === 'undefined' ? 0 : options.retries;
    options.retryTriggers = typeof options.retryTriggers === 'undefined' ? ['network', 'parse'] : options.retryTriggers;

    // Format other options
    options.temperature = typeof options.temperature === 'undefined' ? 0.7 : options.temperature;
    options.maxTokens = typeof options.maxTokens === 'undefined' ? 1024 : options.maxTokens;

    // Custom options
    options.dedupeConsecutiveRoles = typeof options.dedupeConsecutiveRoles === 'undefined' ? true : options.dedupeConsecutiveRoles;

    // Format prompt
    options.prompt = options.prompt || {};
    options.prompt.path = options.prompt.path || '';
    options.prompt.content = options.prompt.content || options.prompt.content || '';
    options.prompt.settings = options.prompt.settings || {};

    // Format message
    options.message = options.message || {};
    options.message.path = options.message.path || '';
    options.message.content = options.message.content || options.message.content || '';
    options.message.settings = options.message.settings || {};
    options.message.images = options.message.images || [];

    // Format history
    options.history = options.history || {};
    options.history.messages = options.history.messages || [];
    options.history.limit = typeof options.history.limit === 'undefined' ? 5 : options.history.limit;

    // Get model configuration
    const modelConfig = getModelConfig(options.model);

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

      let content = '';

      // Load content
      if (input.path) {
        // Convert to array if not already
        const pathArray = Array.isArray(input.path) ? input.path : [input.path];

        // Load and concatenate all files
        for (const path of pathArray) {
          const exists = jetpack.exists(path);

          _log('Reading prompt from path:', path);

          if (!exists) {
            return new Error(`Path ${path} not found`);
          } else if (exists === 'dir') {
            return new Error(`Path ${path} is a directory`);
          }

          try {
            const fileContent = jetpack.read(path);
            content += (content ? '\n' : '') + fileContent;
          } catch (e) {
            return new Error(`Error reading file ${path}: ${e}`);
          }
        }
      } else {
        content = input.content;
      }

      return powertools.template(content, input.settings).trim();
    }

    // Log
    _log('Starting', options);

    // Determine response format based on model features
    let responseFormat = options.response === 'json' ? { type: 'json_object' } : undefined;
    if (responseFormat && modelConfig.features.json === false) {
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

        // Format depending on mode
        if (mode === 'chatgpt') {
          // Get history with respect to the message limit
          const history = options.history.messages.slice(-options.history.limit);

          // Add prompt to beginning of history
          history.unshift({
            role: 'system',
            content: prompt,
            images: [],
          });

          // Get last history item
          const lastHistory = history[history.length - 1];

          // Remove last message from history
          if (
            options.dedupeConsecutiveRoles
            && lastHistory?.role === 'user'
          ) {
            history.pop();
          }

          // Add message to history
          history.push({
            role: 'user',
            content: message,
            images: options.message.images,
          });

          // Trim all history content
          history.forEach((m) => {
            if (typeof m.content === 'string') {
              m.content = m.content.trim();
            }
          });

          // Format history
          history.map((m) => {
            const originalContent = m.content;
            const originalImages = m.images;

            // Set properties
            m.role = m.role || 'system';
            m.content = [];
            m.images = [];

            // Format content
            if (originalContent) {
              m.content.push({
                type: 'text',
                text: originalContent,
              })
            }

            // Format images
            if (originalImages)  {
              originalImages.forEach((i) => {
                // Skip if no URL
                if (!i.url) {
                  return
                }

                // Add image
                m.content.push({
                  type: 'image_url',
                  image_url: {
                    url: i.url,
                    detail: i.detail || 'low',
                  }
                });
              });
            }

            // Delete any field except for role, content, images
            Object.keys(m).forEach((key) => {
              if (!['role', 'content', 'images'].includes(key)) {
                delete m[key];
              }
            });
          })

          // Log message
          history.forEach((m) => {
            _log('Message', m.role, m.content);
          });

          // Set request
          request.url = 'https://api.openai.com/v1/chat/completions';
          request.body = {
            model: options.model,
            response_format: responseFormat,
            messages: history,
            temperature: options.temperature,
            // max_tokens: options.maxTokens,
            max_completion_tokens: options.maxTokens,
            user: user,
          }
          resultPath = 'choices[0].message.content';
        } else if (mode === 'moderation') {
          // Set request
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
          // Log
          // _log('Response RAW', JSON.stringify(r));
          // {
          //   "id": "chatcmpl-AGKe03mwx644T6db3QRoXFz0aFuil",
          //   "object": "chat.completion",
          //   "created": 1728455968,
          //   "model": "gpt-4o-mini-2024-07-18",
          //   "choices": [{
          //     "index": 0,
          //     "message": {
          //       "role": "assistant",
          //       "content": "{\n  \"message\": \"We offer several pricing plans:\\n\\n1. **Basic Plan**: Free\\n   - Chatsy branding on chat\\n   - 1 chatbot\\n   - 5 knowledge base FAQs per chatbot\\n   - English only\\n\\n2. **Premium Plan**: $19/month\\n   - Chatsy branding removed\\n   - 1 chatbot\\n   - 10 knowledge base FAQs per chatbot\\n   - English only\\n\\n3. **Pro Plan**: $29/month\\n   - Chatsy branding removed\\n   - 3 chatbots\\n   - 10 knowledge base FAQs per chatbot\\n   - Automatically chats in the language of your customers\\n\\n4. **Pro Plan**: $49/month\\n   - Chatsy branding removed\\n   - 10 chatbots\\n   - 10 knowledge base FAQs per chatbot\\n   - Automatically chats in the language of your customers\\n\\nLet me know if you need more details or assistance with anything else!\",\n  \"user\": {\n    \"name\": \"\"\n  },\n  \"scores\": {\n    \"questionRelevancy\": 1\n  }\n}",
          //       "refusal": null
          //     },
          //     "logprobs": null,
          //     "finish_reason": "stop"
          //   }],
          //   "usage": {
          //     "prompt_tokens": 1306,
          //     "completion_tokens": 231,
          //     "total_tokens": 1537,
          //     "prompt_tokens_details": {
          //       "cached_tokens": 1024
          //     },
          //     "completion_tokens_details": {
          //       "reasoning_tokens": 0
          //     }
          //   },
          //   "system_fingerprint": "fp_e2bde53e6e"
          // }

          // Set token counts
          self.tokens.input.count += (r?.usage?.prompt_tokens || 0)
            - (r?.usage?.prompt_tokens_details?.cached_tokens || 0);
          self.tokens.output.count += r?.usage?.completion_tokens || 0;
          self.tokens.total.count = self.tokens.input.count + self.tokens.output.count;

          // Set token prices
          self.tokens.input.price = (self.tokens.input.count * modelConfig.input) / 1000000;
          self.tokens.output.price = (self.tokens.output.count * modelConfig.output) / 1000000;
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
        // Trim response
        if (typeof r === 'string') {
          r = r.trim();
        }

        // Log
        _log('Response', r.length, typeof r, r);
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

// Helper function to get model configuration with fallback to default model
function getModelConfig(model) {
  const config = MODEL_TABLE[model];

  // Return config if found
  if (config) {
    return config;
  }

  // Fallback to default model if not found
  console.warn(`Model configuration not found for: ${model}, falling back to ${DEFAULT_MODEL}`);
  return MODEL_TABLE[DEFAULT_MODEL];
}

module.exports = OpenAI;
