<p align="center">
  <a href="https://itwcreativeworks.com">
    <img src="https://cdn.itwcreativeworks.com/assets/itw-creative-works/images/logo/itw-creative-works-brandmark-black-x.svg" width="100px">
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/package-json/v/itw-creative-works/backend-manager.svg">
  <br>
  <img src="https://img.shields.io/librariesio/release/npm/backend-manager.svg">
  <img src="https://img.shields.io/bundlephobia/min/backend-manager.svg">
  <img src="https://img.shields.io/codeclimate/maintainability-percentage/itw-creative-works/backend-manager.svg">
  <img src="https://img.shields.io/npm/dm/backend-manager.svg">
  <img src="https://img.shields.io/node/v/backend-manager.svg">
  <img src="https://img.shields.io/website/https/itwcreativeworks.com.svg">
  <img src="https://img.shields.io/github/license/itw-creative-works/backend-manager.svg">
  <img src="https://img.shields.io/github/contributors/itw-creative-works/backend-manager.svg">
  <img src="https://img.shields.io/github/last-commit/itw-creative-works/backend-manager.svg">
  <br>
  <br>
  <a href="https://itwcreativeworks.com">Site</a> | <a href="https://www.npmjs.com/package/backend-manager">NPM Module</a> | <a href="https://github.com/itw-creative-works/backend-manager">GitHub Repo</a>
  <br>
  <br>
  <strong>Backend Manager</strong> is an NPM module for Firebase developers that instantly implements powerful backend features. Be sure to look at which functions it exposes before using it!
</p>

## 📦 Install Backend Manager
<!-- First, install the global command line utility with npm: -->
First, install the package via npm:
```shell
npm i backend-manager
```

## 🦄 Features
* Automatically create and deploy powerful management and marketing functions
* Automatically keep your Firebase dependencies up to date

## 📘 Example Setup
After installing via npm, simply paste this script in your Firebase `functions/index.js` file.
```js
// In your functions/index.js file
const Manager = (new (require('backend-manager'))).init(exports, {
  initializeApp: true
});

const { functions, admin, cors, Assistant } = Manager.libraries;
```

Next, run the setup command to allow `backend-manager` to configure your Firebase project with best practices and help keep your dependencies up to date!
```shell
npx bm setup
```

Your project will be checked for errors and any tips and fixes will be provided to you!

## 💻 Example CLI Usage
Note: you may have to run cli commands with `npx bm <command>` if you install this package locally.
  * `npx bm v`: Check version of backend-manager.
  * `npx bm setup`: Runs some checks and sets up your Firebase project.

  * `npx bm config:get`: Save Firebase config to your project.
  * `npx bm config:set`: Start an interface for setting a config value. You'll be prompted for the `path` and `value`.
  * `npx bm config:delete`: Start an interface for deleting a config value. You'll be prompted for the `path`.
  * `npx bm serve <port>`: Serve your Firebase project, defaults to port 5000.
  * `npx bm test`: Run Firebase test `.js` files in the `./test` directory.
  * `npx bm i local`: Install local copies of this important module: `backend-manager`.
  * `npx bm i production`: Install production copies of this important module: `backend-manager`.
  * `npx bm deploy`: Deploy the functions of your Firebase project.

  * `npx bm clean:npm`: Delete, clean, and reinstall npm modules.


## 🗨️ Final Words
If you are still having difficulty, we would love for you to post a question to [the Backend Manager issues page](https://github.com/itw-creative-works/backend-manager/issues). It is much easier to answer questions that include your code and relevant files! So if you can provide them, we'd be extremely grateful (and more likely to help you find the answer!)

## 📚 Projects Using this Library
[Somiibo](https://somiibo.com/): A Social Media Bot with an open-source module library. <br>
[JekyllUp](https://jekyllup.com/): A website devoted to sharing the best Jekyll themes. <br>
[Slapform](https://slapform.com/): A backend processor for your HTML forms on static sites. <br>
[SoundGrail Music App](https://app.soundgrail.com/): A resource for producers, musicians, and DJs. <br>
[Hammock Report](https://hammockreport.com/): An API for exploring and listing backyard products. <br>

Ask us to have your project listed! :)
