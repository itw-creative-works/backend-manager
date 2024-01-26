const fetch = require('wonderful-fetch');
const jetpack = require('fs-jetpack');
const powertools = require('node-powertools');
const _ = require('lodash');

const TOKEN_COST_TABLE = {
  // Nov 6th, 2023
  'gpt-4-1106-preview': {
    input: 0.0100,
    output: 0.0300,
  },
  'gpt-4': {
    input: 0.0300,
    output: 0.0600,
  },
  'gpt-3.5-turbo': {
    input: 0.0010,
    output: 0.0020,
  },
}

function OpenAI(assistant, key) {
  const self = this;

  self.assistant = assistant;
  self.Manager = assistant.Manager;
  self.user = assistant.user;
  self.key = key;

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

    options.model = typeof options.model === 'undefined' ? 'gpt-3.5-turbo' : options.model;
    options.timeout = typeof options.timeout === 'undefined' ? 120000 : options.timeout;
    options.moderate = typeof options.moderate === 'undefined' ? true : options.moderate;
    options.user = options.user || assistant.getUser();

    options.prompt = options.prompt || {};
    options.prompt.path = options.prompt.path || '';
    options.prompt.settings = options.prompt.settings || {};

    options.message = options.message || {};
    options.message.path = options.message.path || '';
    options.message.settings = options.message.settings || {};

    options.history = options.history || {};
    options.history.messages = options.history.messages || [];
    options.history.limit = typeof options.history.limit === 'undefined' ? 5 : options.history.limit;

    options.response = typeof options.response === 'undefined' ? undefined : options.response;
    options.temperature = typeof options.temperature === 'undefined' ? 0.7 : options.temperature;
    options.maxTokens = typeof options.maxTokens === 'undefined' ? 512 : options.maxTokens;

    assistant.log('callOpenAI(): Starting', self.key);
    assistant.log('callOpenAI(): Starting', options);

    // Load prompt
    const prompt = powertools.template(
      jetpack.read(options.prompt.path),
      options.prompt.settings,
    ).trim();
    const message = powertools.template(
      jetpack.read(options.message.path),
      options.message.settings,
    ).trim();
    const user = options.user?.auth?.uid || assistant.request.geolocation.ip;
    const responseFormat = options.response === 'json' && !options.model.includes('gpt-3.5')
      ? { type: 'json_object' }
      : undefined;

    assistant.log('callOpenAI(): Prompt', prompt);
    assistant.log('callOpenAI(): Message', message);
    assistant.log('callOpenAI(): User', user);

    function _request(mode, options) {
      return new Promise(async function(resolve, reject) {
        let resultPath = '';
        const request = {
          url: '',
          method: 'post',
          response: 'json',
          // log: true,
          tries: 1,
          timeout: options.timeout,
          headers: {
            'Authorization': `Bearer ${Manager.config.openai.key}`,
          },
          body: {},
        }

        if (mode === 'chatgpt') {
          request.url = 'https://api.openai.com/v1/chat/completions';
          options.history.messages = options.history.messages.slice(-options.history.limit);
          options.history.messages.unshift({
            role: 'system',
            content: prompt,
          });
          options.history.messages.push({
            role: 'user',
            content: message,
          });

          // Log message
          assistant.log('callOpenAI(): Messages', options.history.messages);

          request.body = {
            model: options.model,
            response_format: responseFormat,
            messages: options.history.messages,
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
        .then((r) => {
          // Set token counts
          self.tokens.total.count += r?.usage?.total_tokens || 0;
          self.tokens.input.count += r?.usage?.prompt_tokens || 0;
          self.tokens.output.count += r?.usage?.completion_tokens || 0;

          // Set token prices
          self.tokens.total.price = (self.tokens.total.count / 1000) * TOKEN_COST_TABLE[options.model].input;
          self.tokens.input.price = (self.tokens.input.count / 1000) * TOKEN_COST_TABLE[options.model].input;
          self.tokens.output.price = (self.tokens.output.count / 1000) * TOKEN_COST_TABLE[options.model].output;

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
        assistant.log('callOpenAI(): Moderated', r);

        // Save moderation
        self.moderation = r;

        return r;
      })
      .catch((e) => e);

      if (moderation.flagged) {
        return reject(assistant.errorify(`This request is inappropriate`, {code: 400, sentry: false, send: false, log: false}));
      }
    }

    // Request
    await _request('chatgpt', options)
    .then((r) => {
      try {
        const content = options.response === 'json' ? JSON.parse(r) : r;

        return resolve({
          content: content,
          tokens: self.tokens,
          moderation: moderation,
        })
      } catch (e) {
        assistant.warn('callOpenAI(): Error parsing response', r, e);

        return reject(e);
      }
    })
    .catch((e) => reject(e));
  });
}


module.exports = OpenAI;
