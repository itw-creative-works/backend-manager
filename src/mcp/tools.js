/**
 * MCP Tool Definitions
 *
 * Each tool maps to a BEM route with method, path, and JSON Schema for inputs.
 */
module.exports = [
  // --- Firestore ---
  {
    name: 'firestore_read',
    description: 'Read a Firestore document by path (e.g. "users/abc123")',
    method: 'GET',
    path: 'admin/firestore',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Firestore document path (e.g. "users/abc123")' },
      },
      required: ['path'],
    },
  },
  {
    name: 'firestore_write',
    description: 'Write/merge a Firestore document. Set merge=false to overwrite entirely.',
    method: 'POST',
    path: 'admin/firestore',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Firestore document path (e.g. "users/abc123")' },
        document: { type: 'object', description: 'Document data to write' },
        merge: { type: 'boolean', description: 'Merge with existing document (default: true)', default: true },
      },
      required: ['path', 'document'],
    },
  },
  {
    name: 'firestore_query',
    description: 'Query a Firestore collection with where clauses, ordering, and limits. Each query in the array has: collection (string), where (array of {field, operator, value}), orderBy (array of {field, order}), limit (number).',
    method: 'POST',
    path: 'admin/firestore/query',
    inputSchema: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          description: 'Array of query objects',
          items: {
            type: 'object',
            properties: {
              collection: { type: 'string', description: 'Collection path (e.g. "users")' },
              where: {
                type: 'array',
                description: 'Where clauses',
                items: {
                  type: 'object',
                  properties: {
                    field: { type: 'string' },
                    operator: { type: 'string', description: 'Firestore operator: ==, !=, <, <=, >, >=, in, not-in, array-contains, array-contains-any' },
                    value: { description: 'Value to compare against' },
                  },
                  required: ['field', 'operator', 'value'],
                },
              },
              orderBy: {
                type: 'array',
                description: 'Order by clauses',
                items: {
                  type: 'object',
                  properties: {
                    field: { type: 'string' },
                    order: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
                  },
                  required: ['field'],
                },
              },
              limit: { type: 'number', description: 'Max documents to return' },
            },
            required: ['collection'],
          },
        },
      },
      required: ['queries'],
    },
  },

  // --- Email ---
  {
    name: 'send_email',
    description: 'Send a transactional email via SendGrid. Recipients can be email strings, UIDs (auto-resolves from Firestore), or {email, name} objects.',
    method: 'POST',
    path: 'admin/email',
    inputSchema: {
      type: 'object',
      properties: {
        to: { description: 'Recipient(s): email string, UID string, {email, name} object, or array of any' },
        cc: { description: 'CC recipient(s): same formats as "to"' },
        bcc: { description: 'BCC recipient(s): same formats as "to"' },
        subject: { type: 'string', description: 'Email subject line' },
        template: { type: 'string', description: 'SendGrid template ID or name' },
        html: { type: 'string', description: 'Raw HTML body (alternative to template)' },
        data: { type: 'object', description: 'Template variables / dynamic data' },
        sender: { type: 'string', description: 'Sender preset name (e.g. "marketing", "support")' },
        group: { description: 'Unsubscribe group ID (number or string)' },
        categories: { type: 'array', items: { type: 'string' }, description: 'Email categories for tracking' },
      },
      required: ['to'],
    },
  },

  // --- Notifications ---
  {
    name: 'send_notification',
    description: 'Send a push notification via FCM to users or topics',
    method: 'POST',
    path: 'admin/notification',
    inputSchema: {
      type: 'object',
      properties: {
        notification: {
          type: 'object',
          description: 'Notification content',
          properties: {
            title: { type: 'string', description: 'Notification title' },
            body: { type: 'string', description: 'Notification body text' },
          },
          required: ['title', 'body'],
        },
        filters: {
          type: 'object',
          description: 'Targeting filters',
          properties: {
            tags: { description: 'Filter by tags' },
            owner: { type: 'string', description: 'Target specific user UID' },
            token: { type: 'string', description: 'Target specific FCM token' },
            limit: { type: 'number', description: 'Max recipients' },
          },
        },
      },
      required: ['notification'],
    },
  },

  // --- User Management ---
  {
    name: 'get_user',
    description: 'Get the currently authenticated user info. To look up a specific user, use firestore_read with path "users/{uid}" instead.',
    method: 'GET',
    path: 'user',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_subscription',
    description: 'Get subscription info for a user. Defaults to the authenticated user, or pass a uid to look up another user (admin only).',
    method: 'GET',
    path: 'user/subscription',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'User UID to look up (admin only, defaults to authenticated user)' },
      },
    },
  },
  {
    name: 'sync_users',
    description: 'Sync user data across systems (marketing contacts, etc). Processes users in batches.',
    method: 'POST',
    path: 'admin/users/sync',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // --- Marketing Campaigns ---
  {
    name: 'list_campaigns',
    description: 'List marketing campaigns with optional filters by date range, status, and type',
    method: 'GET',
    path: 'marketing/campaign',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Get a specific campaign by ID' },
        start: { description: 'Start date filter (ISO string or unix timestamp)' },
        end: { description: 'End date filter (ISO string or unix timestamp)' },
        status: { type: 'string', description: 'Filter by status: pending, sent, failed' },
        type: { type: 'string', description: 'Filter by type: email, push' },
        limit: { type: 'number', description: 'Max results (default: 100)' },
      },
    },
  },
  {
    name: 'create_campaign',
    description: 'Create a marketing campaign (email or push notification). Can be immediate or scheduled.',
    method: 'POST',
    path: 'marketing/campaign',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Campaign name' },
        subject: { type: 'string', description: 'Email subject line' },
        type: { type: 'string', enum: ['email', 'push'], default: 'email', description: 'Campaign type' },
        preheader: { type: 'string', description: 'Email preheader text' },
        content: { type: 'string', description: 'Campaign content (markdown)' },
        template: { type: 'string', description: 'Email template name', default: 'default' },
        segments: { type: 'array', items: { type: 'string' }, description: 'Target segment keys (e.g. ["subscription_free"])' },
        excludeSegments: { type: 'array', items: { type: 'string' }, description: 'Exclude segment keys' },
        all: { type: 'boolean', description: 'Send to all contacts (overrides segments)' },
        sendAt: { description: 'Schedule time (ISO string or unix timestamp). Omit for immediate.' },
        sender: { type: 'string', description: 'Sender preset name', default: 'marketing' },
        test: { type: 'boolean', description: 'Send as test (to sender only)', default: false },
        data: { type: 'object', description: 'Template variables' },
      },
      required: ['name', 'subject'],
    },
  },

  // --- Stats ---
  {
    name: 'get_stats',
    description: 'Get system statistics (user counts, subscription metrics, etc.)',
    method: 'GET',
    path: 'admin/stats',
    inputSchema: {
      type: 'object',
      properties: {
        update: { description: 'Pass true to force recalculation, or an object for specific stat options' },
      },
    },
  },

  // --- Payments ---
  {
    name: 'cancel_subscription',
    description: 'Cancel a subscription at the end of the current billing period. Requires the authenticated user to have an active subscription.',
    method: 'POST',
    path: 'payments/cancel',
    inputSchema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Cancellation reason' },
        feedback: { type: 'string', description: 'Additional feedback' },
        confirmed: { type: 'boolean', description: 'Must be true to confirm cancellation' },
      },
      required: ['confirmed'],
    },
  },
  {
    name: 'refund_payment',
    description: 'Process a refund for a subscription. Immediately cancels and refunds the latest payment.',
    method: 'POST',
    path: 'payments/refund',
    inputSchema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Refund reason (required)' },
        feedback: { type: 'string', description: 'Additional feedback' },
        confirmed: { type: 'boolean', description: 'Must be true to confirm refund' },
      },
      required: ['reason', 'confirmed'],
    },
  },

  // --- Cron ---
  {
    name: 'run_cron',
    description: 'Manually trigger a cron job by ID (e.g. "daily", "reset-usage", "marketing-campaigns")',
    method: 'POST',
    path: 'admin/cron',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Cron job ID to trigger' },
      },
      required: ['id'],
    },
  },

  // --- Blog Posts ---
  {
    name: 'create_post',
    description: 'Create a blog post. Handles image downloading, GitHub upload, and body rewriting.',
    method: 'POST',
    path: 'admin/post',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Post title' },
        body: { type: 'string', description: 'Post body (markdown)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Post tags' },
        categories: { type: 'array', items: { type: 'string' }, description: 'Post categories' },
        headerImageURL: { type: 'string', description: 'Header image URL' },
        status: { type: 'string', description: 'Post status (e.g. "draft", "published")' },
      },
      required: ['title', 'body'],
    },
  },

  // --- Backup ---
  {
    name: 'create_backup',
    description: 'Create a Firestore data backup. Optionally filter with a deletion regex.',
    method: 'POST',
    path: 'admin/backup',
    inputSchema: {
      type: 'object',
      properties: {
        deletionRegex: { type: 'string', description: 'Regex pattern to filter documents for deletion (optional)' },
      },
    },
  },

  // --- Hooks ---
  {
    name: 'run_hook',
    description: 'Execute a custom hook by path (e.g. "cron/daily/my-job")',
    method: 'POST',
    path: 'admin/hook',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Hook path to execute' },
      },
      required: ['path'],
    },
  },

  // --- UUID ---
  {
    name: 'generate_uuid',
    description: 'Generate a UUID (v4 random or v5 namespace-based)',
    method: 'POST',
    path: 'general/uuid',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for v5 UUID generation' },
        input: { type: 'string', description: 'Input string for v5 UUID' },
        version: { description: 'UUID version (default: "5")', default: '5' },
        namespace: { type: 'string', description: 'UUID namespace' },
      },
    },
  },

  // --- Health Check ---
  {
    name: 'health_check',
    description: 'Check if the BEM server is running and responding',
    method: 'GET',
    path: 'test/health',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
