/**
 * Email validation test — verifies all free checks (format, disposable, corporate, localPart, typo, dns)
 *
 * Run:   node src/manager/libraries/email/validation.test.js
 */
const { validate } = require('./validation.js');

const FREE_CHECKS = ['format', 'disposable', 'corporate', 'localPart', 'typo', 'dns'];

const CASES = [
  // ---- Should PASS ----
  { email: 'user@gmail.com', expect: 'pass' },
  { email: 'someone@yahoo.com', expect: 'pass' },
  { email: 'hello@outlook.com', expect: 'pass' },
  { email: 'sarah@protonmail.com', expect: 'pass' },
  { email: 'first.last@microsoft.com', expect: 'pass' },
  { email: 'user+tag@gmail.com', expect: 'pass' },
  { email: 'john@icloud.com', expect: 'pass' },
  { email: 'user@aol.com', expect: 'pass' },
  { email: 'user@hotmail.com', expect: 'pass' },

  // ---- Should FAIL: format ----
  { email: '', expect: 'fail', check: 'format' },
  { email: 'notanemail', expect: 'fail', check: 'format' },
  { email: '@nodomain.com', expect: 'fail', check: 'format' },
  { email: 'noat.com', expect: 'fail', check: 'format' },
  { email: 'spaces in@email.com', expect: 'fail', check: 'format' },

  // ---- Should FAIL: disposable (vendor list) ----
  { email: 'test@mailinator.com', expect: 'fail', check: 'disposable' },
  { email: 'test@guerrillamail.com', expect: 'fail', check: 'disposable' },
  { email: 'user@yopmail.com', expect: 'fail', check: 'disposable' },

  // ---- Should FAIL: disposable (custom list) ----
  { email: 'test@dollicons.com', expect: 'fail', check: 'disposable' },
  { email: 'test@availors.com', expect: 'fail', check: 'disposable' },
  { email: 'test@sharebot.net', expect: 'fail', check: 'disposable' },
  { email: 'test@deltajohnsons.com', expect: 'fail', check: 'disposable' },
  { email: 'test@gmail10p.com', expect: 'fail', check: 'disposable' },
  { email: 'test@dyzov.com', expect: 'fail', check: 'disposable' },
  { email: 'test@mailpwr.com', expect: 'fail', check: 'disposable' },
  { email: 'test@closetab.email', expect: 'fail', check: 'disposable' },
  { email: 'test@biosu.dev', expect: 'fail', check: 'disposable' },
  { email: 'test@wikfee.com', expect: 'fail', check: 'disposable' },
  { email: 'test@oakon.com', expect: 'fail', check: 'disposable' },

  // ---- Should FAIL: corporate ----
  { email: 'user@instagram.com', expect: 'fail', check: 'corporate' },
  { email: 'user@facebook.com', expect: 'fail', check: 'corporate' },

  // ---- Should FAIL: localPart (exact) ----
  { email: 'noreply@gmail.com', expect: 'fail', check: 'localPart' },
  { email: 'no-reply@gmail.com', expect: 'fail', check: 'localPart' },

  // ---- Should FAIL: localPart (patterns) ----
  { email: '123456@gmail.com', expect: 'fail', check: 'localPart' },
  { email: 'aaaa@gmail.com', expect: 'fail', check: 'localPart' },
  { email: 'a123@gmail.com', expect: 'fail', check: 'localPart' },
  { email: 'testuser@gmail.com', expect: 'fail', check: 'localPart' },
  { email: '_test.basic@somiibo.com', expect: 'fail', check: 'localPart' },
  { email: '_test.allow_consent-granted@somiibo.com', expect: 'pass' },

  // ---- Should FAIL: typo domains ----
  { email: 'user@gamil.com', expect: 'fail', check: 'typo' },
  { email: 'user@gamil.con', expect: 'fail', check: 'typo' },
  { email: 'user@gmai.com', expect: 'fail', check: 'typo' },
  { email: 'user@gmai.co', expect: 'fail', check: 'typo' },
  { email: 'user@gmial.com', expect: 'fail', check: 'disposable' },
  { email: 'user@gnail.com', expect: 'fail', check: 'typo' },
  { email: 'user@gmail.con', expect: 'fail', check: 'typo' },
  { email: 'user@gmail.cok', expect: 'fail', check: 'typo' },
  { email: 'user@gmail.cm', expect: 'fail', check: 'typo' },
  { email: 'user@aol.con', expect: 'fail', check: 'typo' },
  { email: 'user@icloud.con', expect: 'fail', check: 'typo' },
  { email: 'user@hotmail.con', expect: 'fail', check: 'typo' },
  { email: 'user@hotmial.com', expect: 'fail', check: 'disposable' },
  { email: 'user@hotnail.com', expect: 'fail', check: 'typo' },
  { email: 'user@outlook.con', expect: 'fail', check: 'typo' },
  { email: 'user@outlok.com', expect: 'fail', check: 'typo' },
  { email: 'user@yahoo.con', expect: 'fail', check: 'typo' },
  { email: 'user@protonmial.com', expect: 'fail', check: 'typo' },
  { email: 'user@oegmail.com', expect: 'fail', check: 'typo' },

  // ---- Should FAIL: dns (no MX / null MX / domain not found) ----
  { email: 'someone@thisdoesnotexist99887766.com', expect: 'fail', check: 'dns' },
  { email: 'someone@zzzznotreal123456.net', expect: 'fail', check: 'dns' },
  { email: 'someone@example.com', expect: 'fail', check: 'dns' },
];

async function run() {
  let passed = 0;
  let failed = 0;

  for (const { email, expect: expected, check: expectedCheck } of CASES) {
    const result = await validate(email, { checks: FREE_CHECKS });
    const actualPass = result.valid;
    const ok = (expected === 'pass' && actualPass) || (expected === 'fail' && !actualPass);

    if (ok && expectedCheck && !actualPass) {
      const failedCheck = Object.entries(result.checks).find(([, v]) => v && !v.valid);
      if (failedCheck && failedCheck[0] !== expectedCheck) {
        console.log(`  ✗ ${email}`);
        console.log(`    Expected to fail on: ${expectedCheck}, actually failed on: ${failedCheck[0]}`);
        failed++;
        continue;
      }
    }

    if (ok) {
      passed++;
    } else {
      failed++;
      const failedCheck = Object.entries(result.checks).find(([, v]) => v && !v.valid);
      console.log(`  ✗ ${email}`);
      console.log(`    Expected: ${expected}, Got: ${actualPass ? 'pass' : 'fail'}${failedCheck ? ` (${failedCheck[0]})` : ''}`);
    }
  }

  console.log('');
  console.log(`${passed} passed, ${failed} failed out of ${CASES.length} cases`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
