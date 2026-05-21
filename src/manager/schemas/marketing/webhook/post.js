/**
 * Schema: POST /marketing/webhook
 *
 * Empty by design — webhook payloads are provider-defined and validated inside
 * each processor module. Auth + provider come from query params, not the body.
 */
module.exports = () => ({});
