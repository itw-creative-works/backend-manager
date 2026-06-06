https://github.com/disposable-email-domains/disposable-email-domains?tab=readme-ov-file
https://www.npmjs.com/package/disposable-domains
https://github.com/tompec/disposable-email-domains

Two repos:

Repo	Domains	Approach
disposable-email-domains/disposable-email-domains	5,359	Curated, conservative, high confidence
ivolo/disposable-email-domains	121,569	Aggressive, aggregated from many sources, more false positives
Our current list has 854 — so even the smaller curated list is 6x larger.

For our use case (currently only used to skip marketing sync, not blocking signups), I'd recommend the 5,359 curated list — it's comprehensive enough without being overly aggressive. And if we ever do use it for blocking signups, the false positive risk is much lower.

Want to swap to that one?
