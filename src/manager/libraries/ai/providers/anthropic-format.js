/**
 * Shared pure formatting helpers for the two Claude providers (anthropic,
 * claude-code). Both hit the same Claude Messages API — only auth differs — so
 * the option-shape → request-body mapping lives here once.
 *
 * Handles the unified cross-provider message conventions:
 *   - { role: 'system'|'developer'|'user'|'assistant', content: string }
 *   - { role: 'assistant', content?, toolCalls: [{ id, name, arguments }] }
 *     → assistant turn with tool_use blocks
 *   - { role: 'tool', toolCallId, content } → tool_result block; consecutive
 *     tool turns merge into ONE user turn (the Messages API requires all
 *     results for an assistant turn in a single following user message)
 *   - raw Anthropic block arrays (content: [{ type, ... }]) pass through untouched
 *
 * All functions are pure — no network, no SDK — so they're unit-testable
 * without an assistant.
 */

/**
 * Map normalized function-tool definitions to Anthropic tool definitions.
 *
 * Accepts entries shaped { name, description, parameters } (optionally with
 * type: 'function'). Provider-specific hosted tools (any other `type`, e.g.
 * OpenAI's { type: 'web_search' }) have no Anthropic equivalent — throw with a
 * clear message instead of silently dropping them.
 *
 * @param {Array} list - options.tools.list
 * @returns {Array<{name, description, input_schema}>}
 */
function buildToolDefs(list) {
  if (!Array.isArray(list) || !list.length) {
    return [];
  }

  return list.map((tool) => {
    if (!tool || !tool.name || (tool.type && tool.type !== 'function')) {
      throw new Error(`Anthropic tools must be function tools ({ name, description, parameters }) — got ${JSON.stringify(tool && (tool.type || tool.name) || tool)}`);
    }

    return {
      name: tool.name,
      description: tool.description || '',
      input_schema: tool.parameters || { type: 'object', properties: {} },
    };
  });
}

/**
 * Map the unified tools.choice value to Anthropic's tool_choice.
 *
 * 'auto' → { type: 'auto' }, 'required' → { type: 'any' },
 * 'none' → { type: 'none' }, { name } → { type: 'tool', name }
 */
function buildToolChoice(choice) {
  if (!choice) {
    return undefined;
  }

  if (choice === 'auto') {
    return { type: 'auto' };
  }

  if (choice === 'required') {
    return { type: 'any' };
  }

  if (choice === 'none') {
    return { type: 'none' };
  }

  if (typeof choice === 'object' && choice.name) {
    return { type: 'tool', name: choice.name };
  }

  return undefined;
}

/**
 * Build Anthropic { system, messages } from the unified option shape.
 *
 * Accepts either:
 *   - options.messages: unified turns (see module header)
 *   - options.prompt.content (system) + options.message.content (user)
 */
function buildMessages(options) {
  if (!Array.isArray(options.messages) || !options.messages.length) {
    return {
      system: stringifyContent(options.prompt?.content || ''),
      messages: [{ role: 'user', content: stringifyContent(options.message?.content || '') }],
    };
  }

  // System: collect system + developer turns (Anthropic has no developer role —
  // fold it into the system prompt, preserving order)
  const system = options.messages
    .filter((m) => m.role === 'system' || m.role === 'developer')
    .map((m) => stringifyContent(m.content))
    .filter(Boolean)
    .join('\n\n');

  const messages = [];

  for (const m of options.messages) {
    if (m.role === 'system' || m.role === 'developer') {
      continue;
    }

    // Tool result turn → tool_result block; merge into the previous user turn
    // if that turn is already a tool-result carrier (consecutive results)
    if (m.role === 'tool') {
      const block = {
        type: 'tool_result',
        tool_use_id: m.toolCallId,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content || ''),
      };

      const last = messages[messages.length - 1];

      if (last && last.role === 'user' && Array.isArray(last.content) && last.content.every((c) => c.type === 'tool_result')) {
        last.content.push(block);
      } else {
        messages.push({ role: 'user', content: [block] });
      }

      continue;
    }

    // Raw Anthropic block arrays pass through untouched (callers may replay
    // raw.content from a prior response verbatim)
    if (Array.isArray(m.content) && m.content.some((c) => c && typeof c === 'object' && c.type)) {
      messages.push({ role: m.role, content: m.content });
      continue;
    }

    // Assistant turn with tool calls → text block (if any) + tool_use blocks
    if (m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length) {
      const content = [];
      const text = stringifyContent(m.content || '');

      if (text) {
        content.push({ type: 'text', text });
      }

      for (const call of m.toolCalls) {
        content.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: parseArguments(call.arguments),
        });
      }

      messages.push({ role: 'assistant', content });
      continue;
    }

    // Plain text turn
    messages.push({ role: m.role, content: stringifyContent(m.content) });
  }

  return { system, messages };
}

/**
 * Extract normalized tool calls from a response's content blocks.
 *
 * @param {Array} content - raw.content from the Messages API
 * @returns {Array<{id, name, arguments}>} arguments is the parsed input object
 */
function extractToolCalls(content) {
  return (content || [])
    .filter((c) => c.type === 'tool_use')
    .map((c) => ({ id: c.id, name: c.name, arguments: c.input || {} }));
}

/**
 * Map Anthropic stop_reason to the normalized stopReason.
 */
function mapStopReason(stopReason) {
  if (stopReason === 'tool_use') {
    return 'tool_use';
  }

  if (stopReason === 'max_tokens') {
    return 'max_tokens';
  }

  return 'end';
}

function parseArguments(args) {
  if (args && typeof args === 'object') {
    return args;
  }

  if (typeof args === 'string' && args.trim()) {
    try {
      return JSON.parse(args);
    } catch (e) {
      return {};
    }
  }

  return {};
}

function stringifyContent(content) {
  if (!content) {
    return '';
  }

  if (typeof content === 'string') {
    return content;
  }

  // OpenAI sometimes uses [{ type: 'input_text', text: '...' }] — flatten to string
  if (Array.isArray(content)) {
    return content
      .filter((c) => c.type === 'input_text' || c.type === 'text')
      .map((c) => c.text || '')
      .join('\n');
  }

  return String(content);
}

module.exports = {
  buildToolDefs,
  buildToolChoice,
  buildMessages,
  extractToolCalls,
  mapStopReason,
  stringifyContent,
};
