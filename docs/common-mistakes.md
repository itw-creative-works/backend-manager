# Common Mistakes to Avoid

1. **Don't modify Manager internals directly** — Use factory methods and public APIs
2. **Always use `assistant.respond()` for responses** — Don't use `res.send()` directly
3. **Match schema names to route names** — If route is `myEndpoint`, schema should be `myEndpoint`
4. **Always await async operations** — Don't forget `await` on Firestore operations
5. **Handle errors properly** — Use `assistant.errorify()` with appropriate status codes
6. **Don't call `respond()` multiple times** — Only one response per request
7. **Use short-circuit returns** — Return early from error conditions
8. **Increment usage before update** — Call `usage.increment()` then `usage.update()`
9. **Add Firestore composite indexes for new compound queries** — Any new Firestore query using multiple `.where()` clauses or `.where()` + `.orderBy()` requires a composite index. Add it to `src/cli/commands/setup-tests/helpers/required-indexes.js` (the SSOT). Consumer projects pick these up via `npx mgr setup`, which syncs them into `firestore.indexes.json`. Without the index, the query will crash with `FAILED_PRECONDITION` in production.
10. **Don't put test data cleanup at the END of a test** — End-of-test cleanup doesn't fire when the previous run was killed mid-execution, so the next run inherits stale state. ALL test-data cleanup belongs in the runner's pre-test phase ([../src/test/test-accounts.js](../src/test/test-accounts.js) `deleteTestUsers()` + [../src/test/runner.js](../src/test/runner.js) `setupAccounts()`), which **flushes the entire emulator Firestore before every run** — so there's nothing to register when you add a test that writes data. Seed any required fixtures in `test/_init.js`'s `setup()` (runs after the flush). The only acceptable trailing cleanup is within-run state isolation (one test removes a doc so the NEXT test in the same run sees a clean slate) — that's not preparing the next run, it's intra-run housekeeping. See [test-framework.md](test-framework.md) "Test Data Cleanup".
