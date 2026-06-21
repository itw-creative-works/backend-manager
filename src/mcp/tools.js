/**
 * MCP Tool Definitions
 *
 * Each tool maps to a BEM route with method, path, and JSON Schema for inputs.
 * annotations.readOnlyHint / destructiveHint control Claude Desktop's read/write categorization.
 */
module.exports = [
  // --- Firestore ---
  {
    name: 'firestore_read',
    description: 'Read a Firestore document by path (e.g. "users/abc123")',
    role: 'admin',
    method: 'GET',
    path: 'admin/firestore',
    annotations: { title: 'Read a Firestore document', readOnlyHint: true },
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
    role: 'admin',
    method: 'POST',
    path: 'admin/firestore',
    annotations: { title: 'Write a Firestore document', readOnlyHint: false, destructiveHint: false, idempotentHint: true },
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
    role: 'admin',
    method: 'POST',
    path: 'admin/firestore/query',
    annotations: { title: 'Query a Firestore collection', readOnlyHint: true },
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
    role: 'admin',
    method: 'POST',
    path: 'admin/email',
    annotations: { title: 'Send a transactional email', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
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
    role: 'admin',
    method: 'POST',
    path: 'admin/notification',
    annotations: { title: 'Send a push notification', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
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
    role: 'user',
    method: 'GET',
    path: 'user',
    annotations: { title: 'Get authenticated user info', readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_subscription',
    description: 'Get subscription info for a user. Defaults to the authenticated user, or pass a uid to look up another user (admin only).',
    role: 'user',
    method: 'GET',
    path: 'user/subscription',
    annotations: { title: 'Get subscription info', readOnlyHint: true },
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
    role: 'admin',
    method: 'POST',
    path: 'admin/users/sync',
    annotations: { title: 'Sync users across systems', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // --- Marketing Campaigns ---
  {
    name: 'list_campaigns',
    description: 'List marketing campaigns with optional filters by date range, status, and type',
    role: 'admin',
    method: 'GET',
    path: 'marketing/campaign',
    annotations: { title: 'List marketing campaigns', readOnlyHint: true },
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
    role: 'admin',
    method: 'POST',
    path: 'marketing/campaign',
    annotations: { title: 'Create a marketing campaign', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Campaign name' },
        subject: { type: 'string', description: 'Email subject line' },
        type: { type: 'string', enum: ['email', 'push'], default: 'email', description: 'Campaign type' },
        preheader: { type: 'string', description: 'Email preheader text' },
        template: { type: 'string', description: 'Email template name (card, plain, order, feedback)', default: 'card' },
        data: { type: 'object', description: 'Template data — content goes in data.content: { title, message (markdown), button: { text, url }, discountCode }' },
        segments: { type: 'array', items: { type: 'string' }, description: 'Target segment keys (e.g. ["subscription_free"])' },
        excludeSegments: { type: 'array', items: { type: 'string' }, description: 'Exclude segment keys' },
        all: { type: 'boolean', description: 'Send to all contacts (overrides segments)' },
        sendAt: { description: 'Schedule time (ISO string or unix timestamp). Omit for immediate.' },
        sender: { type: 'string', description: 'Sender preset name', default: 'marketing' },
        test: { type: 'boolean', description: 'Send as test (to sender only)', default: false },
      },
      required: ['name', 'subject'],
    },
  },

  {
    name: 'update_campaign',
    description: 'Update a pending marketing campaign. Only pending campaigns can be edited.',
    role: 'admin',
    method: 'PUT',
    path: 'marketing/campaign',
    annotations: { title: 'Update a campaign', readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Campaign ID to update' },
        name: { type: 'string', description: 'Campaign name' },
        subject: { type: 'string', description: 'Email subject line' },
        preheader: { type: 'string', description: 'Email preheader text' },
        template: { type: 'string', description: 'Email template name' },
        data: { type: 'object', description: 'Template data' },
        segments: { type: 'array', items: { type: 'string' }, description: 'Target segment keys' },
        excludeSegments: { type: 'array', items: { type: 'string' }, description: 'Exclude segment keys' },
        all: { type: 'boolean', description: 'Send to all contacts' },
        sendAt: { description: 'Reschedule time (ISO string or unix timestamp)' },
        sender: { type: 'string', description: 'Sender preset name' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_campaign',
    description: 'Delete a pending marketing campaign. Only pending campaigns can be deleted.',
    role: 'admin',
    method: 'DELETE',
    path: 'marketing/campaign',
    annotations: { title: 'Delete a campaign', readOnlyHint: false, destructiveHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Campaign ID to delete' },
      },
      required: ['id'],
    },
  },

  // --- Marketing Contacts ---
  {
    name: 'create_contact',
    description: 'Add a marketing contact to email providers (SendGrid/Beehiiv). Admin mode skips reCAPTCHA and allows tags.',
    role: 'admin',
    method: 'POST',
    path: 'marketing/contact',
    annotations: { title: 'Add a marketing contact', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Contact email address' },
        firstName: { type: 'string', description: 'First name' },
        lastName: { type: 'string', description: 'Last name' },
        source: { type: 'string', description: 'Contact source (e.g. "manual", "import")' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Contact tags' },
        skipValidation: { type: 'boolean', description: 'Skip email validation (admin only)', default: false },
      },
      required: ['email'],
    },
  },
  {
    name: 'delete_contact',
    description: 'Remove a marketing contact from email providers and revoke marketing consent.',
    role: 'admin',
    method: 'DELETE',
    path: 'marketing/contact',
    annotations: { title: 'Remove a marketing contact', readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Contact email to remove' },
      },
      required: ['email'],
    },
  },

  // --- Stats ---
  {
    name: 'get_stats',
    description: 'Get system statistics (user counts, subscription metrics, etc.)',
    role: 'admin',
    method: 'GET',
    path: 'admin/stats',
    annotations: { title: 'Get system statistics', readOnlyHint: true },
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
    role: 'admin',
    method: 'POST',
    path: 'payments/cancel',
    annotations: { title: 'Cancel a subscription', readOnlyHint: false, destructiveHint: true },
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
    role: 'admin',
    method: 'POST',
    path: 'payments/refund',
    annotations: { title: 'Refund a payment', readOnlyHint: false, destructiveHint: true },
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

  {
    name: 'get_payment_portal',
    description: 'Generate a Stripe Billing Portal link for the authenticated user to manage their subscription.',
    role: 'admin',
    method: 'POST',
    path: 'payments/portal',
    annotations: { title: 'Get payment portal link', readOnlyHint: true, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        returnUrl: { type: 'string', description: 'URL to redirect to after the portal session' },
      },
    },
  },

  // --- Cron ---
  {
    name: 'run_cron',
    description: 'Manually trigger a cron job by ID (e.g. "daily", "reset-usage", "marketing-campaigns")',
    role: 'admin',
    method: 'POST',
    path: 'admin/cron',
    annotations: { title: 'Trigger a cron job', readOnlyHint: false, destructiveHint: false },
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
    role: 'admin',
    method: 'POST',
    path: 'admin/post',
    annotations: { title: 'Create a blog post', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
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
  {
    name: 'update_post',
    description: 'Update an existing blog post. Fetches the post by URL and uploads changes via GitHub.',
    role: 'admin',
    method: 'PUT',
    path: 'admin/post',
    annotations: { title: 'Update a blog post', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Blog post URL to update' },
        body: { type: 'string', description: 'Updated post content body' },
        title: { type: 'string', description: 'Updated post title' },
        postPath: { type: 'string', description: 'Path to the post (default: "guest")' },
      },
      required: ['url', 'body'],
    },
  },

  // --- Backup ---
  {
    name: 'create_backup',
    description: 'Create a Firestore data backup. Optionally filter with a deletion regex.',
    role: 'admin',
    method: 'POST',
    path: 'admin/backup',
    annotations: { title: 'Create a Firestore backup', readOnlyHint: false, destructiveHint: false },
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
    description: 'Execute a hook or BEM cron job by path. Searches: BEM internal crons (e.g. "cron/daily/blog-auto-publisher", "cron/daily/marketing-newsletter-generate"), consumer hooks/ directory, and consumer project root. Supports both function exports and class-based hooks.',
    role: 'admin',
    method: 'POST',
    path: 'admin/hook',
    annotations: { title: 'Run hook or cron', readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Hook path (e.g. "cron/daily/blog-auto-publisher", "cron/daily/marketing-newsletter-generate", "cron/daily/reset-usage", "cron/frequent/marketing-campaigns", or a consumer hook path)' },
      },
      required: ['path'],
    },
  },

  // --- UUID ---
  {
    name: 'generate_uuid',
    description: 'Generate a UUID (v4 random or v5 namespace-based)',
    role: 'admin',
    method: 'POST',
    path: 'general/uuid',
    annotations: { title: 'Generate a UUID', readOnlyHint: true },
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
    role: 'public',
    method: 'GET',
    path: 'test/health',
    annotations: { title: 'Check server health', readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
