/**
 * Common email domain typos/misspellings.
 *
 * Each entry is a prefix string (without the leading @). The validator checks
 * if the domain STARTS WITH any of these prefixes, so "gamil." catches
 * gamil.com, gamil.con, gamil.co, etc.
 *
 * Only include patterns with ZERO chance of false positives — these must be
 * domains that are clearly misspelled versions of real providers and would
 * never host legitimate email.
 */
module.exports = [
  // Gmail typos
  'gamil.',
  'gmai.',
  'gmial.',
  'gmal.',
  'gmali.',
  'gmil.',
  'gnail.',
  'gmeil.',
  'gmaill.',
  'gmail.con',
  'gmail.com.',
  'gmail.co.',
  'gmail.cm',
  'gmail.om',
  'gmail.cok',
  'gmaul.',
  'gmqil.',

  // Yahoo typos
  'yaho.',
  'yahooo.',
  'yahho.',
  'yhaoo.',
  'yahoo.con',
  'yahoo.cok',

  // Hotmail typos
  'hotmal.',
  'hotmial.',
  'hotmil.',
  'hotamil.',
  'hotmail.con',
  'hotmail.cok',
  'hotnail.',

  // Outlook typos
  'outloo.',
  'outlok.',
  'outllook.',
  'outlook.con',
  'outlook.cok',
  'outlool.',

  // iCloud typos
  'icloud.con',
  'icloud.cok',
  'iclould.',
  'icoud.',
  'iclod.',

  // AOL typos
  'aol.con',
  'aol.cok',

  // Protonmail typos
  'protonmal.',
  'protonmial.',
  'protonmail.con',

  // Generic TLD typos (provider-agnostic, only on major providers)
  'gmail.cim',
  'yahoo.cim',
  'hotmail.cim',
  'outlook.cim',

  // Fake gmail-lookalike domains (disposable services mimicking gmail)
  'gmail10p.',
  'oegmail.',
  'gmailx.',
];
