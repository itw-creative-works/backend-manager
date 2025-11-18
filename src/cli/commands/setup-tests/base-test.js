/**
 * Base class for all setup tests
 * Each test should extend this class and implement the `run()` method
 */
class BaseTest {
  constructor(context) {
    this.context = context;
    this.self = context.main;
  }

  /**
   * Override this method in each test
   * @returns {Promise<boolean>} True if test passes, false if it fails
   */
  async run() {
    throw new Error('Test must implement run() method');
  }

  /**
   * Override this method to provide a fix for failed tests
   * @returns {Promise<void>}
   */
  async fix() {
    throw new Error('No automatic fix available for this test');
  }

  /**
   * Get the test name (used for logging)
   * @returns {string}
   */
  getName() {
    return this.constructor.name.replace(/Test$/, '').replace(/([A-Z])/g, ' $1').trim().toLowerCase();
  }
}

module.exports = BaseTest;
