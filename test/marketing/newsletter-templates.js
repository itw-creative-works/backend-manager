/**
 * Newsletter template fixture tests.
 *
 * Renders each template against hand-built structures covering edge cases
 * (no citations, no sponsorships, no images, missing CTA, very long subject,
 * empty/partial sections, missing template-specific fields) and asserts on
 * the rendered HTML so we catch layout regressions WITHOUT paying for AI runs.
 *
 * No AI calls, no network, no Firebase — pure shape/snapshot assertions.
 *
 * Each template owns its own content schema (see classic-schema.js,
 * field-report.js) so the fixtures here are per-template: the "classic"
 * fixture covers clean + editorial; the "field-report" fixture covers
 * field-report.
 */
const { renderNewsletter } = require('../../src/manager/libraries/email/generators/lib/mjml-template.js');
const { listTemplates, resolveTemplate } = require('../../src/manager/libraries/email/generators/lib/templates/index.js');

const TEST_BRAND = {
  id: 'testco',
  name: 'TestCo',
  url: 'https://testco.example',
  address: {
    line1: '123 Main St',
    line2: 'Suite 100',
    city: 'Testville',
    region: 'TS',
    postalCode: '12345',
    country: 'United States',
  },
};

const BASE_UNIVERSALS = {
  subject: 'A normal subject for a normal newsletter',
  preheader: 'A short, descriptive preheader.',
  signoff: 'Best,\nThe TestCo Team',
  citations: [
    { note: 'A factual claim that needs attribution', source: 'Industry report, April 2026' },
    { note: 'Another claim with hard data', source: 'Vendor announcement, March 2026' },
  ],
};

// Classic content shape — used by `clean` and `editorial`.
const CLASSIC_STRUCTURE = {
  ...BASE_UNIVERSALS,
  intro: 'This is an intro paragraph that sets up the rest of the newsletter.',
  sections: [
    {
      title: 'Section one',
      body: 'First section body. Identity matters because trust is the new growth lever. Teams that handle this well will spend less time cleaning up later.',
      image_prompt: 'abstract illustration',
    },
    {
      title: 'Section two',
      body: 'Second section body. The practical takeaway is straightforward: keep your account hygiene tight and document your processes.',
      image_prompt: 'abstract illustration',
    },
    {
      title: 'Section three',
      body: 'Third section body. Self-contained, no outbound links.',
      image_prompt: 'abstract illustration',
    },
  ],
};

// Field Report content shape — used by `field-report`.
const FIELD_REPORT_STRUCTURE = {
  ...BASE_UNIVERSALS,
  signoff: '— Stay sharp,\nThe TestCo Desk',
  tldr: 'Platform changes are accelerating identity friction. Operators who lock down attribution this quarter will outpace the rest.',
  dateline: 'LOS ANGELES',
  dispatches: [
    {
      kicker: 'LEAD DISPATCH',
      headline: 'Identity becomes the new growth lever',
      byline: 'Filed by The TestCo growth desk',
      location: 'OAKLAND',
      lede: 'A wave of platform changes is forcing operators to rethink how attribution holds together at scale.',
      dispatch: 'Trust matters because the new growth lever is identity. Teams that handle this well will spend less time cleaning up later. The practical implication is to lock in attribution now while the toolchain still tolerates ambiguity.',
      dataPoints: [
        { label: 'USERS REACHED', value: '12.4K' },
        { label: 'WoW GROWTH',    value: '+38%' },
      ],
      image_prompt: 'abstract illustration',
    },
    {
      kicker: 'FIELD NOTES',
      headline: 'Operators document their hygiene',
      byline: 'Filed by The TestCo platform desk',
      location: 'REMOTE',
      lede: 'The accounts that survive the next platform sweep are the ones with paper trails.',
      dispatch: 'Account hygiene is now a documentation problem, not a tooling problem. Save your processes. The teams already running on documented playbooks are ahead.',
      dataPoints: [],
      image_prompt: 'abstract illustration',
    },
    {
      kicker: 'WATCH',
      headline: 'A third dispatch',
      byline: 'Filed by The TestCo signals desk',
      location: 'NEW YORK',
      lede: 'Some filings just observe.',
      dispatch: 'Self-contained dispatch, no outbound links.',
      dataPoints: [{ label: 'OBSERVATIONS', value: '3' }],
      image_prompt: 'abstract illustration',
    },
  ],
};

const FIXTURES = {
  clean:           CLASSIC_STRUCTURE,
  editorial:       CLASSIC_STRUCTURE,
  'field-report':  FIELD_REPORT_STRUCTURE,
};

const IMAGE_PATHS = [
  'https://example.com/img1.png',
  'https://example.com/img2.png',
  'https://example.com/img3.png',
];

const SPONSORSHIPS = [
  {
    label: 'From the team',
    headline: 'Try TestCo',
    body: 'Short pitch text for in-house promo.',
    url: 'https://testco.example/promo',
    ctaLabel: 'Start free',
    position: 'middle',
  },
];

const TEMPLATES = ['clean', 'editorial', 'field-report'];

/**
 * Render a template against its native fixture (or a fixture override).
 */
async function render(templateName, structureOverrides = {}, overrides = {}) {
  const baseFixture = FIXTURES[templateName] || CLASSIC_STRUCTURE;
  const structure = { ...baseFixture, ...structureOverrides };
  const newsletterConfig = {
    template: templateName,
    theme: {
      primaryColor:   '#0072FF',
      secondaryColor: '#1E1E2A',
      accentColor:    '#F4F6FA',
      font:           'Inter, system-ui, sans-serif',
    },
    sponsorships: overrides.sponsorships !== undefined ? overrides.sponsorships : [],
  };

  return renderNewsletter({
    brand: overrides.brand || TEST_BRAND,
    newsletterConfig,
    structure,
    imagePaths: overrides.imagePaths !== undefined ? overrides.imagePaths : IMAGE_PATHS,
    campaign: 'fixture',
  });
}

module.exports = {
  description: 'Newsletter template fixture suite',
  type: 'suite',
  auth: 'none',
  timeout: 30000,
  tests: [
    {
      name: 'every registered template renders without throwing',
      async run({ assert }) {
        for (const templateName of TEMPLATES) {
          const t = resolveTemplate(templateName);
          assert.ok(t, `Template "${templateName}" should resolve`);
          assert.ok(typeof t.build === 'function', `Template "${templateName}" should expose build()`);
          assert.ok(t.meta && t.meta.name, `Template "${templateName}" should expose meta.name`);
        }

        // Render the full fixture against every template
        for (const templateName of TEMPLATES) {
          const result = await render(templateName);
          assert.ok(result.html.includes('<html'), `${templateName}: produces HTML`);
          assert.equal(result.template, templateName, `${templateName}: reports correct template name`);
          assert.equal(result.errors.length, 0, `${templateName}: no MJML errors`);
        }
      },
    },
    {
      name: 'shell always renders the CAN-SPAM address in the footer',
      async run({ assert }) {
        for (const templateName of TEMPLATES) {
          const result = await render(templateName);
          assert.ok(
            result.html.includes('123 Main St, Suite 100, Testville, TS 12345, United States'),
            `${templateName}: renders the structured brand.address in the footer`
          );
        }
      },
    },
    {
      // Unsubscribe links are NOT rendered by BEM — both Beehiiv and SendGrid
      // auto-append a CAN-SPAM-compliant unsubscribe footer to every email they
      // send (with a working URL tied to the subscriber). Rendering our own
      // ${brandUrl}/unsubscribe would create a dead second link.
      name: 'footer renders brand link but NOT a hand-rolled unsubscribe link',
      async run({ assert }) {
        for (const templateName of TEMPLATES) {
          const result = await render(templateName);
          assert.ok(result.html.includes('TestCo'), `${templateName}: brand name renders`);
          assert.ok(result.html.includes('testco.example'), `${templateName}: brand URL renders`);
          assert.ok(!result.html.toLowerCase().includes('unsubscribe'),
            `${templateName}: should NOT include an "unsubscribe" link (sending platform appends its own)`);
          assert.ok(!result.html.includes('/unsubscribe'),
            `${templateName}: should NOT include a /unsubscribe URL`);
        }
      },
    },
    {
      name: 'citations render when present, omit cleanly when missing',
      async run({ assert }) {
        for (const templateName of TEMPLATES) {
          // With citations
          const withCites = await render(templateName);
          assert.ok(withCites.html.toLowerCase().includes('sources'), `${templateName}: cites are rendered`);
          assert.ok(withCites.html.includes('[1]'), `${templateName}: citation marker [1] is rendered`);
          assert.ok(withCites.html.includes('Industry report, April 2026'), `${templateName}: citation source is rendered`);

          // Without citations — shell must NOT render the "Sources & data" header
          const noCites = await render(templateName, { citations: [] });
          assert.ok(
            !noCites.html.toLowerCase().includes('sources &amp; data')
            && !noCites.html.toLowerCase().includes('sources & data'),
            `${templateName}: skips Sources section when citations is empty`
          );
        }
      },
    },
    {
      name: 'sponsorships render when present, omit cleanly when missing',
      async run({ assert }) {
        for (const templateName of TEMPLATES) {
          const withSponsors = await render(templateName, {}, { sponsorships: SPONSORSHIPS });
          assert.ok(withSponsors.html.includes('Try TestCo'), `${templateName}: sponsor headline renders`);
          assert.ok(withSponsors.html.includes('Start free'), `${templateName}: sponsor CTA renders`);
          assert.ok(withSponsors.html.includes('testco.example/promo'), `${templateName}: sponsor URL renders`);

          // No sponsorships — should NOT find the in-house promo content
          const noSponsors = await render(templateName, {}, { sponsorships: [] });
          assert.ok(!noSponsors.html.includes('Try TestCo'), `${templateName}: omits sponsor content when none configured`);
        }
      },
    },
    {
      name: 'signoff renders without dramatic dark-block treatment',
      async run({ assert }) {
        // Classic templates carry "Best,\nThe TestCo Team"; Field Report carries "— Stay sharp,\nThe TestCo Desk"
        for (const templateName of ['clean', 'editorial']) {
          const result = await render(templateName);
          assert.ok(result.html.includes('Best,'),         `${templateName}: signoff first line`);
          assert.ok(result.html.includes('The TestCo Team'), `${templateName}: signoff second line`);
          assert.ok(!result.html.includes('— Signed —'),   `${templateName}: no "— Signed —" eyebrow`);
          assert.ok(!result.html.includes('SIGNED'),       `${templateName}: no SIGNED label`);
        }
        const fr = await render('field-report');
        assert.ok(fr.html.includes('Stay sharp'),       `field-report: correspondent signoff first line`);
        assert.ok(fr.html.includes('The TestCo Desk'),  `field-report: correspondent signoff second line`);
      },
    },
    {
      name: 'images render when imagePaths provided, omit cleanly when missing',
      async run({ assert }) {
        for (const templateName of TEMPLATES) {
          const withImages = await render(templateName);
          assert.ok(withImages.html.includes('https://example.com/img1.png'), `${templateName}: img1 renders`);
          assert.ok(withImages.html.includes('https://example.com/img2.png'), `${templateName}: img2 renders`);

          // No images — the HTML should not contain those URLs but must still render
          const noImages = await render(templateName, {}, { imagePaths: [] });
          assert.ok(noImages.html.includes('<html'), `${templateName}: still renders HTML with no images`);
          assert.ok(!noImages.html.includes('example.com/img1.png'), `${templateName}: no image URL when imagePaths empty`);
        }
      },
    },
    {
      name: 'mj-button containers always have padding 0 horizontal (no 25px default leak)',
      async run({ assert }) {
        for (const templateName of TEMPLATES) {
          const result = await render(templateName);
          // mj-button compiles to a nested table whose container <td> sits
          // immediately before a `<table ... border-collapse:separate ...>` —
          // that's the only place a horizontal padding leak would visually push
          // the button off-axis.
          const buttonContainerRe = /<td\s[^>]*?style="([^"]*?padding:[^";]+;[^"]*?)"[^>]*?>\s*<table[^>]*?border-collapse:separate/g;
          let m;
          const offenders = [];
          while ((m = buttonContainerRe.exec(result.html)) !== null) {
            if (m[1].includes('padding:10px 25px')) {
              offenders.push(m[0].slice(0, 200));
            }
          }
          assert.equal(offenders.length, 0,
            `${templateName}: button-container TDs must not carry MJML's default 10px/25px padding (found ${offenders.length} offenders: ${offenders.slice(0, 2).join(' ; ')})`
          );
        }
      },
    },
    {
      name: 'long subject does not blow up the template',
      async run({ assert }) {
        const longSubject = 'A very long subject line that exceeds normal length expectations and should be rendered without breaking the layout, even when it spans multiple visual lines';
        for (const templateName of TEMPLATES) {
          const result = await render(templateName, { subject: longSubject });
          assert.equal(result.errors.length, 0, `${templateName}: long subject produces no MJML errors`);
          assert.ok(result.html.includes('A very long subject'), `${templateName}: long subject is rendered`);
        }
      },
    },
    {
      name: 'minimum-viable structure renders cleanly (classic templates)',
      async run({ assert }) {
        const minimal = {
          ...CLASSIC_STRUCTURE,
          sections: [
            { title: 'Only section', body: 'A very short body.', cta: null, image_prompt: '' },
          ],
          citations: [],
        };

        for (const templateName of ['clean', 'editorial']) {
          const result = await render(templateName, minimal, { sponsorships: [], imagePaths: [] });
          assert.equal(result.errors.length, 0, `${templateName}: minimal structure has no MJML errors`);
          assert.ok(result.html.includes('Only section'), `${templateName}: renders the single section title`);
          assert.ok(result.html.includes('A very short body'), `${templateName}: renders the single section body`);
        }
      },
    },
    {
      name: 'minimum-viable structure renders cleanly (field-report)',
      async run({ assert }) {
        const minimal = {
          ...FIELD_REPORT_STRUCTURE,
          tldr: 'A terse one-line briefing.',
          dispatches: [
            {
              kicker: 'BRIEF',
              headline: 'Only dispatch',
              byline: 'Filed by The TestCo desk',
              location: 'REMOTE',
              lede: 'One paragraph.',
              dispatch: 'A very short dispatch body.',
              dataPoints: [],
              cta: null,
              image_prompt: '',
            },
          ],
          citations: [],
        };

        const result = await render('field-report', minimal, { sponsorships: [], imagePaths: [] });
        assert.equal(result.errors.length, 0, `field-report: minimal structure has no MJML errors`);
        assert.ok(result.html.includes('Only dispatch'),       `field-report: renders single headline`);
        assert.ok(result.html.includes('A very short dispatch'), `field-report: renders single dispatch body`);
        assert.ok(result.html.includes('A terse one-line briefing'), `field-report: renders TLDR`);
      },
    },
    {
      name: 'gracefully omits missing optional fields without breaking the template',
      async run({ assert }) {
        // Classic templates — missing intro, missing one section body.
        for (const templateName of ['clean', 'editorial']) {
          const partial = {
            ...CLASSIC_STRUCTURE,
            intro: '',
            sections: [
              { title: 'Has body', body: 'Body text here.', image_prompt: '' },
              { title: 'No body',  body: '',                image_prompt: '' },
              { title: 'Has third', body: 'Body.',          image_prompt: '' },
            ],
          };
          const result = await render(templateName, partial);
          assert.equal(result.errors.length, 0, `${templateName}: partial sections produce no MJML errors`);
          assert.ok(result.html.includes('Has body'), `${templateName}: section with body renders`);
          assert.ok(result.html.includes('No body'),  `${templateName}: section with empty body renders title`);
          assert.ok(result.html.includes('Has third'), `${templateName}: third section title renders`);
        }

        // Field Report — missing tldr, missing one dispatch body+lede, missing dataPoints.
        const fr = await render('field-report', {
          tldr: '',
          dispatches: [
            {
              kicker: 'DISPATCH', headline: 'Only headline + body', byline: 'Filed by desk',
              location: 'REMOTE', lede: '', dispatch: 'Some body text.', dataPoints: [], image_prompt: '',
            },
            {
              kicker: 'WATCH', headline: 'Just data, no body', byline: 'Filed by desk',
              location: 'REMOTE', lede: '', dispatch: '', dataPoints: [{ label: 'STAT', value: '99%' }], image_prompt: '',
            },
          ],
        });
        assert.equal(fr.errors.length, 0, `field-report: partial dispatches produce no MJML errors`);
        assert.ok(fr.html.includes('Only headline + body'), `field-report: dispatch with body renders headline`);
        assert.ok(fr.html.includes('Just data, no body'),   `field-report: dispatch with only dataPoints still renders headline`);
        assert.ok(fr.html.includes('99%'),                  `field-report: dataPoints render as fallback when no body`);
        assert.ok(!fr.html.includes('// THIS ISSUE //'),    `field-report: TLDR block hidden when tldr is empty`);
      },
    },
    {
      name: 'completely empty section/dispatch is dropped, not rendered as a hollow stub',
      async run({ assert }) {
        // Classic templates: empty section between two real ones should be dropped.
        for (const templateName of ['clean', 'editorial']) {
          const result = await render(templateName, {
            sections: [
              { title: 'Real one',   body: 'Real body.', cta: null, image_prompt: '' },
              { title: '',           body: '',           cta: null, image_prompt: '' },  // empty
              { title: 'Real two',   body: 'Real body 2.', cta: null, image_prompt: '' },
            ],
          });
          assert.equal(result.errors.length, 0, `${templateName}: empty middle section produces no MJML errors`);
          assert.ok(result.html.includes('Real one'),  `${templateName}: first section still renders`);
          assert.ok(result.html.includes('Real two'),  `${templateName}: third section still renders`);
        }

        // Field Report: empty dispatch dropped.
        const fr = await render('field-report', {
          dispatches: [
            { kicker: 'DISPATCH', headline: 'Real dispatch', byline: 'X', location: 'REMOTE',
              lede: 'Real lede.', dispatch: 'Real body.', dataPoints: [], cta: null, image_prompt: '' },
            { kicker: '', headline: '', byline: '', location: '', lede: '', dispatch: '',
              dataPoints: [], cta: null, image_prompt: '' },
            { kicker: 'WATCH', headline: 'Other dispatch', byline: 'Y', location: 'REMOTE',
              lede: 'Other lede.', dispatch: 'Other body.', dataPoints: [], cta: null, image_prompt: '' },
          ],
        });
        assert.equal(fr.errors.length, 0, `field-report: empty middle dispatch produces no MJML errors`);
        assert.ok(fr.html.includes('Real dispatch'),  `field-report: first dispatch renders`);
        assert.ok(fr.html.includes('Other dispatch'), `field-report: third dispatch renders`);
      },
    },
    {
      name: 'field-report renders its identity markers (kicker, dateline, terminal block, terminator)',
      async run({ assert }) {
        const result = await render('field-report');
        assert.ok(result.html.includes('LEAD DISPATCH'),    `field-report: kicker renders`);
        assert.ok(result.html.includes('FIELD NOTES'),      `field-report: second kicker renders`);
        assert.ok(result.html.includes('// THIS ISSUE //'), `field-report: TLDR terminal label renders`);
        assert.ok(result.html.includes('// BY THE NUMBERS //'), `field-report: dataPoint terminal label renders (full-width strip)`);
        assert.ok(result.html.includes('END DISPATCH'),     `field-report: dispatch terminator renders`);
        assert.ok(result.html.includes('OAKLAND'),          `field-report: dispatch location renders`);
        assert.ok(result.html.includes('VOL. '),            `field-report: issue volume strap renders`);
        // Body's first paragraph drop-cap rule should be present in CSS
        assert.ok(result.html.includes('dispatch-body'),    `field-report: dispatch body class is present`);
      },
    },
    {
      name: 'template metadata is well-formed for every registered template',
      async run({ assert }) {
        const all = listTemplates();
        assert.ok(all.length >= 3, 'has at least 3 templates registered');

        for (const meta of all) {
          assert.ok(meta.name, `meta.name is set`);
          assert.ok(meta.description, `meta.description is set for ${meta.name}`);
          assert.ok(Array.isArray(meta.requires), `meta.requires is array for ${meta.name}`);
          assert.ok(Array.isArray(meta.optional), `meta.optional is array for ${meta.name}`);
          assert.ok(meta.supports, `meta.supports is set for ${meta.name}`);
        }
      },
    },
    {
      name: 'template-owned schemas are exported and merged correctly',
      async run({ assert }) {
        for (const templateName of TEMPLATES) {
          const t = resolveTemplate(templateName);
          assert.ok(t.schema, `${templateName}: exports a schema`);
          assert.ok(t.schema.required, `${templateName}: schema has required[]`);
          assert.ok(t.schema.properties, `${templateName}: schema has properties{}`);
        }

        // Field Report's schema must declare dispatches; classic templates must declare sections.
        assert.ok(resolveTemplate('field-report').schema.properties.dispatches, 'field-report: has dispatches in schema');
        assert.ok(resolveTemplate('clean').schema.properties.sections,           'clean: has sections in schema');
        assert.ok(resolveTemplate('editorial').schema.properties.sections,       'editorial: has sections in schema');
      },
    },
  ],
};

// Exported for adhoc inspection (not used by the runner)
module.exports.CLASSIC_STRUCTURE = CLASSIC_STRUCTURE;
module.exports.FIELD_REPORT_STRUCTURE = FIELD_REPORT_STRUCTURE;
module.exports.IMAGE_PATHS = IMAGE_PATHS;
module.exports.SPONSORSHIPS = SPONSORSHIPS;
