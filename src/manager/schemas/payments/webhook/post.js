/**
 * Schema: POST /payments/webhook
 * Minimal schema - webhook payloads are validated by the processor, not the schema
 * The processor and key come from query params, not the body
 */
module.exports = () => ({});
