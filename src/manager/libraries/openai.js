const fetch = require('wonderful-fetch');
const jetpack = require('fs-jetpack');
const powertools = require('node-powertools');
const _ = require('lodash');
const JSON5 = require('json5');
const path = require('path');
const mimeTypes = require('mime-types');

// Constants
const DEFAULT_MODEL = 'gpt-4o';
const MODERATION_MODEL = 'omni-moderation-latest';

// https://platform.openai.com/docs/pricing
const MODEL_TABLE = {
  // Jul 11, 2025
  'gpt-4.5-preview': {
    input: 75.00,
    output: 150.00,
    provider: 'openai',
    features: {
      json: true,
    },
  },
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
  'o1-pro': {
    input: 150.00,
    output: 600.00,
    provider: 'openai',
    features: {
      json: true,
    },
  },
  'o3-pro': {
    input: 20.00,
    output: 80.00,
    provider: 'openai',
    features: {
      json: true,
    },
  },
  'o3': {
    input: 2.00,
    output: 8.00,
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

    // Format schema
    options.schema = options.schema || undefined;

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
    options.message.attachments = options.message.attachments || [];

    // Format history
    options.history = options.history || {};
    options.history.messages = options.history.messages || [];
    options.history.limit = typeof options.history.limit === 'undefined' ? 5 : options.history.limit;

    let attempt = { count: 0 };

    function _log() {
      if (!options.log)  {
        return;
      }

      assistant.log('callOpenAI():', ...arguments);
    }


    // Log
    _log('Starting', options);


    // Load prompt
    const prompt = loadContent(options.prompt, _log);
    const message = loadContent(options.message, _log);
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


    // Moderate if needed
    let moderation = null;
    if (options.moderate) {
      moderation = await makeRequest('moderations', options, self, prompt, message, user, _log)
      .then(async (r) => {
        // {
        //   id: 'modr-8205',
        //   model: 'omni-moderation-latest',
        //   results: [
        //     {
        //       flagged: false,
        //       categories: [Object],
        //       category_scores: [Object],
        //       category_applied_input_types: [Object]
        //     }
        //   ]
        // }

        // Log
        _log('Moderated', r);

        // Return results
        return r.results[0];
      })
      .catch((e) => e);

      // Check for moderation flag
      if (moderation.flagged) {
        return reject(assistant.errorify(`This request is inappropriate`, {code: 451}));
      }
    }


    // Make attempt
    attemptRequest(options, self, prompt, message, user, moderation, attempt, assistant, resolve, reject, _log);
  });
}

function tryParse(content) {
  try {
    return JSON5.parse(content);
  } catch (e) {
    return content;
  }
}

function loadContent(input, _log) {
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

function loadAttachment(type, content, _log) {
  if (!content) {
    return null;
  }

  _log('Loading attachment:', type, content.substring(0, 100));

  // Handle remote URLs (https://, http://)
  if (content.startsWith('http://') || content.startsWith('https://')) {
    _log('Remote URL detected:', content);
    return {
      contentType: 'url',
      data: content
    };
  }

  // Handle base64 data URLs (data:image/png;base64,...)
  if (content.startsWith('data:')) {
    _log('Base64 data URL detected');
    return {
      contentType: 'base64',
      data: content
    };
  }

  // Handle local file paths - need to read and convert to base64
  try {
    const exists = jetpack.exists(content);
    if (!exists) {
      throw new Error(`File not found: ${content}`);
    }
    if (exists === 'dir') {
      throw new Error(`Path is a directory: ${content}`);
    }

    _log('Local file detected, reading:', content);

    // Read file as buffer
    const fileBuffer = jetpack.read(content, 'buffer');
    if (!fileBuffer) {
      throw new Error(`Failed to read file: ${content}`);
    }

    // Get MIME type from file extension
    const mimeType = mimeTypes.lookup(content) || 'application/octet-stream';
    _log('Detected MIME type:', mimeType);

    // Convert to base64 data URL
    const base64Data = fileBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    _log('Converted to base64 data URL, length:', dataUrl.length);
    return {
      contentType: 'base64',
      data: dataUrl
    };

  } catch (error) {
    _log('Error loading attachment:', error.message);
    throw new Error(`Failed to load attachment: ${error.message}`);
  }
}

function formatMessageContent(content, attachments, _log, mode = 'responses') {
  const formattedContent = [];

  // Format text content
  if (content) {
    formattedContent.push({
      type: mode === 'moderations' ? 'text' : 'input_text',
      text: content,
    });
  }

  // Format attachments
  if (attachments) {
    attachments.forEach((attachment) => {
      try {
        // Use content field (supports URLs, base64, local paths) or fallback to url field
        const attachmentContent = attachment.content || attachment.url;

        if (!attachmentContent) {
          _log('Skipping attachment with no content or url:', attachment);
          return;
        }

        const loadedAttachment = loadAttachment(attachment.type, attachmentContent, _log);

        // Handle image attachments
        if (attachment.type === 'image' && loadedAttachment) {
          if (mode === 'moderations') {
            formattedContent.push({
              type: 'image_url',
              image_url: {
                url: loadedAttachment.data
              }
            });
          } else {
            formattedContent.push({
              type: 'input_image',
              image_url: loadedAttachment.data,
              detail: attachment.detail || 'low',
            });
          }
        }
        // Handle file attachments (only for responses, not moderation)
        else if (attachment.type === 'file' && loadedAttachment && mode !== 'moderations') {
          const fileContent = {
            type: 'input_file',
          };

          // Use correct field name based on content type
          if (loadedAttachment.contentType === 'url') {
            fileContent.file_url = loadedAttachment.data;
          } else if (loadedAttachment.contentType === 'base64') {
            fileContent.file_data = loadedAttachment.data;
            // Only include filename for base64 data, not for URLs
            fileContent.filename = attachment.filename || path.basename(attachmentContent);
          }

          formattedContent.push(fileContent);
        }
      } catch (error) {
        _log('Error processing attachment:', error.message);
        // Continue processing other attachments
      }
    });
  }

  return formattedContent;
}


function formatHistory(options, prompt, message, _log) {
  // Get history with respect to the message limit
  const history = options.history.messages.slice(-options.history.limit);

  // Add prompt to beginning of history
  history.unshift({
    role: 'developer',
    content: prompt,
    attachments: [],
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
    attachments: options.message.attachments,
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
    const originalAttachments = m.attachments;

    // Set properties
    m.role = m.role || 'developer';
    m.content = formatMessageContent(originalContent, originalAttachments, _log);
    m.attachments = [];

    // Delete any field except for role, content
    Object.keys(m).forEach((key) => {
      if (!['role', 'content'].includes(key)) {
        delete m[key];
      }
    });
  })

  // Log message
  history.forEach((m) => {
    _log('Message', m.role, m.content);
  });

  return history;
}

function attemptRequest(options, self, prompt, message, user, moderation, attempt, assistant, resolve, reject, _log) {
  const retries = options.retries;
  const triggers = options.retryTriggers;

  // Increment attempt
  attempt.count++;

  // Log
  _log(`Request ${attempt.count}/${retries}`);

  // Request
  makeRequest('responses', options, self, prompt, message, user, _log)
  .then((r) => {
    // Example
    // {
    //   id: 'resp_68734dd2e6148199956fb6ef63a72b13095b79119b6129af',
    //   object: 'response',
    //   created_at: 1752387027,
    //   status: 'completed',
    //   background: false,
    //   error: null,
    //   incomplete_details: null,
    //   instructions: null,
    //   max_output_tokens: 1024,
    //   max_tool_calls: null,
    //   model: 'gpt-4o-2024-08-06',
    //   output: [
    //     {
    //       id: 'msg_6872127d078081989822de29fea13a1b07e3a2c4abdba0ba',
    //       type: 'message',
    //       status: 'completed',
    //       content: [
    //         {
    //           type: 'output_text,
    //           annotations: [],
    //           logprobs: [],
    //           text: 'Hi!'
    //         }
    //       ],
    //       role: 'assistant'
    //     }
    //   ],
    //   parallel_tool_calls: true,
    //   previous_response_id: null,
    //   reasoning: { effort: null, summary: null },
    //   service_tier: 'default',
    //   store: true,
    //   temperature: 0.7,
    //   text: { format: { type: 'text' } },
    //   tool_choice: 'auto',
    //   tools: [],
    //   top_logprobs: 0,
    //   top_p: 1,
    //   truncation: 'disabled',
    //   usage: {
    //     input_tokens: 32,
    //     input_tokens_details: { cached_tokens: 0 },
    //     output_tokens: 3,
    //     output_tokens_details: { reasoning_tokens: 0 },
    //     total_tokens: 35
    //   },
    //   user: '127.0.0.1',
    //   metadata: {}
    // }

    // Ensure content is set
    const content = r.output[0].content;

    // Trim and combine all output text
    const outputText = content
      .filter((c) => c.type === 'output_text')
      .map((c) => c.text.trim())
      .join('\n')
      .trim();

    // Get model configuration
    const modelConfig = getModelConfig(options.model);

    // Set token counts
    self.tokens.input.count += (r.usage.input_tokens || 0)
      - (r.usage.input_tokens_details.cached_tokens || 0);
    self.tokens.output.count += r.usage.output_tokens || 0;
    self.tokens.total.count = self.tokens.input.count + self.tokens.output.count;

    // Set token prices
    self.tokens.input.price = (self.tokens.input.count * modelConfig.input) / 1000000;
    self.tokens.output.price = (self.tokens.output.count * modelConfig.output) / 1000000;
    self.tokens.total.price = self.tokens.input.price + self.tokens.output.price;

    // Log
    _log('Response', outputText.length, typeof outputText, outputText);
    _log('Tokens', self.tokens);

    // Try to parse JSON response if needed
    try {
      const parsed = options.response === 'json' ? JSON5.parse(outputText) : outputText;

      // Return
      return resolve({
        output: content,
        content: parsed,
        tokens: self.tokens,
        moderation: moderation,
      })
    } catch (e) {
      assistant.error('Error parsing response', r, e);

      // Retry
      if (attempt.count < retries && triggers.includes('parse')) {
        return attemptRequest(options, self, prompt, message, user, moderation, attempt, assistant, resolve, reject, _log);
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
    if (attempt.count < retries && triggers.includes('network')) {
      return attemptRequest(options, self, prompt, message, user, moderation, attempt, assistant, resolve, reject, _log);
    }

    // Return
    return reject(e);
  });
}

function makeRequest(mode, options, self, prompt, message, user, _log) {
  return new Promise(async function(resolve, reject) {
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
    if (mode === 'moderations') {
      // Format moderation input using shared helper
      const input = formatMessageContent(message, options.message.attachments, _log, 'moderations');

      // Set request
      request.url = 'https://api.openai.com/v1/moderations';
      request.body = {
        model: MODERATION_MODEL,
        input: input,
        user: user,
      }
    } else if (mode === 'responses') {
      // Format history for responses API
      const history = formatHistory(options, prompt, message, _log);

      // Set request
      request.url = 'https://api.openai.com/v1/responses';
      request.body = {
        model: options.model,
        input: history,
        user: user,
        temperature: options.temperature,
        max_output_tokens: options.maxTokens,
        text: resolveFormatting(options),
      }
    }

    // Request
    await fetch(request.url, request)
    .then(async (r) => {
      // Log raw response
      _log('Response RAW', JSON.stringify(r, null, 2));

      // Return
      return resolve(r);
    })
    .catch((e) => {
      return reject(e);
    })
  });
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

function resolveFormatting(options) {
  const modelConfig = getModelConfig(options.model);

  // Format for JSON
  if (options.response === 'json' && modelConfig.features?.json) {

    // If schema is set, return JSON schema format
    if (options.schema) {
      return {
        format: {
          type: 'json_schema',
          name: 'response_schema',
          schema: options.schema || {},
        },
      };
    } else {
      return {
        format: {
          type: 'json_object',
        },
      };
    };
  }

  // Other, return undefined
  return undefined;
}

module.exports = OpenAI;
