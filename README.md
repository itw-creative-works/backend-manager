<div align="center">
  <a href="https://cdn.itwcreativeworks.com/assets/itw-creative-works/images/logo/itw-creative-works-brandmark-black-x.svg">
    <img src="https://cdn.itwcreativeworks.com/assets/itw-creative-works/images/logo/itw-creative-works-brandmark-black-x.svg">
  </a>
  <br>
  <br>

![GitHub package.json version](https://img.shields.io/github/package-json/v/itw-creative-works/backend-manager.svg)

![David](https://img.shields.io/david/itw-creative-works/backend-manager.svg)
![David](https://img.shields.io/david/dev/itw-creative-works/backend-manager.svg) <!-- ![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/itw-creative-works/backend-manager.svg) -->
![npm bundle size](https://img.shields.io/bundlephobia/min/backend-manager.svg)
![Code Climate maintainability](https://img.shields.io/codeclimate/maintainability-percentage/itw-creative-works/backend-manager.svg)
![npm](https://img.shields.io/npm/dm/backend-manager.svg) <!-- [![NPM total downloads](https://img.shields.io/npm/dt/backend-manager.svg?style=flat)](https://npmjs.org/package/backend-manager) -->
![node](https://img.shields.io/node/v/backend-manager.svg)
![Website](https://img.shields.io/website/https/itwcreativeworks.com.svg)
![GitHub](https://img.shields.io/github/license/itw-creative-works/backend-manager.svg)
![GitHub contributors](https://img.shields.io/github/contributors/itw-creative-works/backend-manager.svg)
![GitHub last commit](https://img.shields.io/github/last-commit/itw-creative-works/backend-manager.svg)

# Backend Manager
**Backend Manager** is an NPM module for Firebase developers that instantly implements powerful backend features. Be sure to look at which functions it exposes before using it!

[Site](https://itwcreativeworks.com) | [NPM Module](https://www.npmjs.com/package/backend-manager) | [GitHub Repo](https://github.com/itw-creative-works/backend-manager)

</div>

## Install
Install with npm:
```shell
npm install backend-manager
```

## Features
* Automatically create and deploy powerful management and marketing functions
* Automatically keep your Firebase dependencies up to date

## Example Setup
After installing via npm, simply paste this script simply paste this script in your `functions/index.js` file.
```js
// In your functions/index.js file
exports.backendManager = (require('backend-manager'))({
  ref: {
    exports: exports,
    cors: cors,
    functions: functions,
    admin: admin,
  },
  options: {}
});
```

## Example CLI Usage
  * `bm v`: Check version of backend-manager.
  * `bm setup`: Runs some checks and sets up your Firebase project.

  * `bm config:get`: Save Firebase config to your project.
  * `bm config:set`: Start an interface for setting a config value. You'll be prompted for the `path` and `value`.
  * `bm config:delete`: Start an interface for deleting a config value. You'll be prompted for the `path`.
  * `bm serve <port>`: Serve your Firebase project, defaults to port 5000.
  * `bm test`: Run Firebase test `.js` files in the `./test` directory.
  * `bm i local`: Install local copies of this important module: `backend-manager`.
  * `bm i production`: Install production copies of this important module: `backend-manager`.
  * `bm deploy`: Deploy the functions of your Firebase project.


## Final Words
If you are still having difficulty, we would love for you to post a question to [the Backend Manager issues page](https://github.com/itw-creative-works/backend-manager/issues). It is much easier to answer questions that include your code and relevant files! So if you can provide them, we'd be extremely grateful (and more likely to help you find the answer!)

## Projects Using this Library
[Somiibo](https://somiibo.com/): A Social Media Bot with an open-source module library. <br>
[JekyllUp](https://jekyllup.com/): A website devoted to sharing the best Jekyll themes. <br>
[Slapform](https://slapform.com/): A backend processor for your HTML forms on static sites. <br>
[SoundGrail Music App](https://app.soundgrail.com/): A resource for producers, musicians, and DJs. <br>
[Hammock Report](https://hammockreport.com/): An API for exploring and listing backyard products. <br>

Ask us to have your project listed! :)
