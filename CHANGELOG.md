# CHANGELOG

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## Changelog Categories

- `BREAKING` for breaking changes.
- `Added` for new features.
- `Changed` for changes in existing functionality.
- `Deprecated` for soon-to-be removed features.
- `Removed` for now removed features.
- `Fixed` for any bug fixes.
- `Security` in case of vulnerabilities.

---#
# [4.1.0] - 2024-05-08
### Changed
- Attach `schema` to `bm-properties` response header.
- `assistant.request.url` is now properly set for all environments (development, production, etc) and works whether called from custom domain or Firebase default function domain.

## [4.0.0] - 2024-05-08
### ⚠️ BREAKING
- Require Node.js version `18` or higher.
- Updated `firebase-functions` to `6.0.1` (now need to require `firebase-functions/v1` to use v1 functions or `firebase-functions/v2` to use v2 functions).

## [3.2.109] - 2024-05-08
### Changed
- Replaced all `methods` references with `routes`. This should be changed in your code as well.

## [3.2.32] - 2024-01-30
### Changed
- Modified `.assistant().errorify()` to have defaults of `log`, `sentry`, and `send` to `false` if not specified to prevent accidental logging and premature sending of errors.

## [3.2.30] - 2024-01-30
### Changed
- Modified `.assistant()` token/key check to use `options.apiKey || data.apiKey`

## [3.2.0] - 2024-01-19
### Added
- Added `.settings()` API. Put your settings in `./schemas/*.js` and access them with `assistant.settings.*`.

## [3.1.0] - 2023-12-19
### Added
- Added `.analytics()` API GA4 support.

#### New Analytics Format
```js
  analytics.send({
    name: 'tutorial_begin',
    params: {
      tutorial_id: 'tutorial_1',
      tutorial_name: 'the_beginning',
      tutorial_step: 1,
    },
  });
```
- Added `.usage()` API to track user usage.
- Added `.middleware()` API to help setup http functions.
- Added `.respond()` function to `assistant.js` to help with http responses.

## [3.0.0] - 2023-09-05
### ⚠️ BREAKING
- Updated `firebase-admin` from `9.12.0` --> `11.10.1`
- Updated `firebase-functions` from `3.24.1` --> `4.4.1`
- This project now requires `firebase-tools` from `10.9.2` --> `12.5.2`

- Updated required Node.js version from `12` --> `16`

- Updated `@google-cloud/storage` from `5.20.5` --> `7.0.1`
- Updated `fs-jetpack` from `4.3.1` --> `5.1.0`
- Updated `uuid` from `8.3.2` --> `9.0.0`

- Removed `backend-assistant` dependency and moved to custom library within this module at `./src/manager/helpers/assistant.js`
- Replaced `require('firebase-functions/lib/logger/compat')` with the updated `require('firebase-functions/logger/compat')`
- Changed default for `options.setupFunctionsLegacy` from `true` --> `false`
- `.analytics()` is broken due to GA4 updates and should not be used until the next feature release
- Updated geolocation and client data retrieval to new format:
#### New Way
```js
  const assistant = new Assistant();

  // Get geolocation data
  assistant.request.geolocation.ip;
  assistant.request.geolocation.continent;
  assistant.request.geolocation.country;
  assistant.request.geolocation.region;
  assistant.request.geolocation.city;
  assistant.request.geolocation.latitude;
  assistant.request.geolocation.longitude;

  // Get Client data
  assistant.request.client.userAgent;
  assistant.request.client.language;
  assistant.request.client.platform;
  assistant.request.client.mobile;
```

#### Old Way
```js
  const assistant = new Assistant();

  // Get geolocation data
  assistant.request.ip;
  assistant.request.continent;
  assistant.request.country;
  assistant.request.region;
  assistant.request.city;
  assistant.request.latitude;
  assistant.request.longitude;

  // Get Client data
  assistant.request.userAgent;
  assistant.request.language;
  assistant.request.platform;
  assistant.request.mobile;
```

## [2.6.0] - 2023-09-05
### Added
- Identity Platform auth/before-create.js
- Identity Platform auth/before-signin.js
- Disable these by passing `options.setupFunctionsIdentity: false`
