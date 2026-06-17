const path = require('path');

const ROLE_HIERARCHY = {
  admin: ['admin', 'user', 'public'],
  user: ['user', 'public'],
  public: ['public'],
};

/**
 * Classify a Bearer token into a role without hitting the database.
 * Actual validation happens at the route level when a tool is called.
 */
function resolveAuthInfo(token) {
  const configKey = process.env.BACKEND_MANAGER_KEY || '';

  if (token && configKey && token === configKey) {
    return { role: 'admin', authType: 'adminKey', token };
  }

  if (token) {
    return { role: 'user', authType: 'userToken', token };
  }

  return { role: 'public', authType: 'none', token: '' };
}

/**
 * Filter tools to only those visible for a given role.
 * admin → all, user → user + public, public → public only.
 */
function filterToolsByRole(tools, role) {
  const allowed = ROLE_HIERARCHY[role] || ROLE_HIERARCHY.public;

  return tools.filter((tool) => allowed.includes(tool.role || 'admin'));
}

/**
 * Load consumer MCP tools from `functions/mcp.js` if it exists.
 * Returns an empty array if the file doesn't exist or fails to load.
 */
function loadConsumerTools(cwd) {
  if (!cwd) {
    return [];
  }

  const mcpPath = path.join(cwd, 'mcp.js');

  try {
    const jetpack = require('fs-jetpack');

    if (!jetpack.exists(mcpPath)) {
      return [];
    }

    const consumerTools = require(mcpPath);

    if (!Array.isArray(consumerTools)) {
      console.error(`[BEM MCP] Consumer mcp.js must export an array, got ${typeof consumerTools}`);
      return [];
    }

    for (const tool of consumerTools) {
      if (!tool.name || !tool.description) {
        console.error(`[BEM MCP] Consumer tool missing name or description:`, tool);
        return [];
      }

      if (!tool.path && !tool.handler) {
        console.error(`[BEM MCP] Consumer tool "${tool.name}" must have a path or handler`);
        return [];
      }

      tool.role = tool.role || 'admin';
      tool._consumer = true;
    }

    return consumerTools;
  } catch (error) {
    console.error(`[BEM MCP] Failed to load consumer tools from ${mcpPath}:`, error.message);
    return [];
  }
}

/**
 * Merge built-in and consumer tools into a Map.
 * Consumer tools with the same name override built-ins.
 */
function buildToolMap(builtinTools, consumerTools) {
  const map = new Map();

  for (const tool of builtinTools) {
    map.set(tool.name, tool);
  }

  for (const tool of consumerTools) {
    map.set(tool.name, tool);
  }

  return map;
}

module.exports = {
  resolveAuthInfo,
  filterToolsByRole,
  loadConsumerTools,
  buildToolMap,
  ROLE_HIERARCHY,
};
