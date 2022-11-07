'use strict';

const { existsSync, readFileSync } = require('fs');
const { dirname, join } = require('path');
const isNpxRun = __dirname.indexOf(process.cwd() === -1);

// compare semver version
function compareVersion(v1, v2) {
  const v1Arr = v1.split('.');
  const v2Arr = v2.split('.');
  const len = Math.max(v1Arr.length, v2Arr.length);
  for (let i = 0; i < len; i++) {
    const num1 = parseInt(v1Arr[i], 10);
    const num2 = parseInt(v2Arr[i], 10);
    if (num1 > num2) {
      return 1;
    } else if (num1 < num2) {
      return -1;
    }
  }
  return 0;
}

function getVersion(pkgName, resolveMode = true) {
  try {
    if (resolveMode) {
      return require(join(process.cwd(), 'node_modules', `${pkgName}/package.json`)).version;
    } else {
      return require(`${pkgName}/package.json`).version;
    }
  } catch (e) {
    return undefined;
  }
}

function checkUpdate(coreVersion) {
  // save version to current dir
  const midwayVersionPkgVersion = getVersion('@midwayjs/version', false);
  // compare coreVersion and midwayVersionPkgVersion with semver version
  if (compareVersion(coreVersion, midwayVersionPkgVersion) > 0) {
    logger('log', '*'.repeat(50));
    if (isNpxRun) {
      logger('log', 
        `>> Current version is too old, please run "npx clear-npx-cache" by yourself and re-run the command.`
      );
    } else {
      logger('log', 
        `>> Current version is too old, please upgrade dependencies and re-run the command.`
      );
    }

    logger('log', '*'.repeat(50));
    return false;
  }
  return true;
}

exports.check = function (outputConsole = false) {
  function logger(level, msg) {
    if (outputConsole) {
      console[level](msg);
    }
  }
  const decoratorVersion = getVersion('@midwayjs/decorator') || '3.7.0';
  const coreVersion = getVersion('@midwayjs/core');
  const result = [];

  if (!coreVersion) {
    logger('log', '*'.repeat(50));
    logger('error', '>> Please install @midwayjs/core first');
    logger('log', '*'.repeat(50));
    return;
  }

  const baseDir = dirname(require.resolve('@midwayjs/version'));
  if (!checkUpdate(coreVersion)) {
    return;
  }

  const versionFile = join(
    baseDir,
    `versions/${decoratorVersion.replace(/\./g, '_')}-${coreVersion.replace(
      /\./g,
      '_'
    )}.json`
  );

  if (!existsSync(versionFile)) {
    logger('log', '*'.repeat(50));
    logger('error', 
      `>> Current version @midwayjs/decorator(${decoratorVersion}) and @midwayjs/core(${coreVersion}) not found in @midwayjs/version, please check it.`
    );
    logger('log', '*'.repeat(50));
    return;
  }

  const text = readFileSync(versionFile, 'utf-8');
  const versions = JSON.parse(text);
  let fail = 0;
  logger('log', '>> Start to check your midway component version...\n');

  const pkgList = Object.keys(versions);
  for (const pkgName of pkgList) {
    const version = getVersion(pkgName);
    if (!version) {
      logger('info', `\x1B[32m✓\x1B[0m ${pkgName}(not installed)`);
      continue;
    }

    if (versions[pkgName].indexOf(version) !== -1 ) {
      // ok
      logger('info', `\x1B[32m✓\x1B[0m ${pkgName}(${version})`);
    } else {
      // fail
      fail++;
      result.push({
        name: pkgName,
        current: version,
        allow: versions[pkgName],
      });
      logger('error', `\x1B[31m✖\x1B[0m ${pkgName}(current: ${version}, allow: ${JSON.stringify(versions[pkgName])})`);
    }
  }

  logger('log', '*'.repeat(50));
  if (fail > 0) {
    logger('log', `>> Check complete, found \x1B[41m${fail}\x1B[0m problem.`);
    logger('log', `>> Please check the result above.`);
  } else {
    logger('log', `>> Check complete, all versions are healthy.`);
  }
  logger('log', '*'.repeat(50));

  return result;
}
