/**
 * GET /payments/discount?code=FLASH20
 * Validates a discount code and returns the discount details
 */
const discountCodes = require('../../../libraries/payment/discount-codes.js');

module.exports = async ({ assistant, settings }) => {
  const result = discountCodes.validate(settings.code);

  assistant.log(`Discount validation: code=${result.code}, valid=${result.valid}`);

  if (!result.valid) {
    return assistant.respond({ valid: false }, { code: 200 });
  }

  return assistant.respond({
    valid: true,
    code: result.code,
    percent: result.percent,
    duration: result.duration,
  });
};
