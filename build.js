'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');

const SRC_DIR = 'src';
const BUILD_DIR = 'build';
const ELECTRON_BUILDER_ENV = 'electron-builder.env';

if (process.argv[2] && process.argv[2] === 'clean') {
  clean();
} else {
  clean();
  build();
  makeVersionString();
}

/** Remove all the files created during build()
 *
 * Do not remove other things in the build/ folder such as
 * PyInstaller's output.
 */
function clean() {
  const files = glob.sync(
    BUILD_DIR.concat(path.sep, '**', path.sep, '*'),
    {
      ignore: [
        path.join(BUILD_DIR, 'invest/**'),
        path.join(BUILD_DIR, 'pyi-build/**'),
      ]
    }
  );
  files.forEach((file) => {
    if (['.js', '.jsx', '.css', '.html', '.json']
      .includes(path.extname(file))
    ) {
      // console.log(file);
      fs.unlinkSync(file);
    }
  });
  try {
    fs.unlinkSync(ELECTRON_BUILDER_ENV);
  } catch {}
}

/** Transpile and copy all src/ code to build folder. */
function build() {
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR);
  }

  // transpile all jsx and es6 files to javascript
  // excluding ResultsTab jsx because we've temporarily removed that feature
  const cmdArgs = [SRC_DIR, '-d', BUILD_DIR, '--ignore', '**/ResultsTab/*'];
  const runBabel = spawnSync('npx babel', cmdArgs, {
    shell: true,
  });

  console.log(`${runBabel.stdout}`);
  if (runBabel.stderr) {
    console.log(`${runBabel.stderr}`);
  }

  // copy all other files to their same relative location in the build dir
  const files = glob.sync(SRC_DIR.concat(path.sep, '**', path.sep, '*'));
  files.forEach((file) => {
    if (['.css', '.html', '.png'].includes(path.extname(file))) {
      const dest = file.replace(SRC_DIR, BUILD_DIR);
      fs.copySync(file, dest);
    }
  });
}

/** Uniquely identify the changeset we're building & packaging.
 *
 * electron-builder will read this .env file and use the string in
 * the artifactName.
 */
 // TODO: this won't work well with a release workflow that relies on
 // github release objects to create the tag on github when we click "Publish"
 // the tag needs to be made locally first.
function makeVersionString() {
  const version = execFileSync('git', ['describe', '--tags']);
  fs.writeFileSync(ELECTRON_BUILDER_ENV, `VERSION=${version}`);
  console.log(`built version ${version}`);
}
