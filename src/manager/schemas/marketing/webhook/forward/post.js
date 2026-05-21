/**
 * Schema: POST /marketing/webhook/forward
 *
 * Empty by design — the body is the raw provider webhook payload that gets
 * forwarded to every child BEM unchanged. Validation happens in the dispatcher
 * (provider + key query params) and at each child's receiver.
 */
module.exports = () => ({});
