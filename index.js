'use strict';

const { existsSync, readFileSync, mkdirSync, writeFileSync } = require('fs');
const { dirname, join } = require('path');
const { execSync } = require('child_process');
const { debuglog: Debuglog } = require('util');
const debugLogger = Debuglog('version');
const currentProjectRoot = process.cwd();
const isNpxRun = __dirname.indexOf(currentProjectRoot === -1);
let outputConsole = false;

function logger(level, msg) {
  if (outputConsole) {
    console[level](msg);
  }
}

function outputError(err) {
  logger('log', '*'.repeat(50));
  logger('error', typeof err === 'string' ? err : err.message);
  logger('log', '*'.repeat(50));
}

function runCmd(cmd, cwd) {
  try {
    return execSync(cmd, {
      cwd: cwd || process.env.HOME,
    }).toString();
  } catch (err) {
    outputError(
      `"${cmd}" run failed, err=${err.message}`
    );
    process.exit(1);
  }
}

function getReplacedDepenciesVersion(pkgVersion, targetVersion) {
  if (pkgVersion === targetVersion) {
    return pkgVersion;
  }

  if (pkgVersion === 'latest') {
    return '^' + targetVersion;
  }

  // 替换掉版本号
  return pkgVersion.replace(/\d+\.\d+\.\d+/, targetVersion);
}

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

function getVersion(pkgName, resolveMode = true, options = {}) {
  options.cwd = options.cwd || currentProjectRoot;
  try {
    if (resolveMode) {
      return require(join(options.cwd, 'node_modules', `${pkgName}/package.json`)).version;
    } else {
      return require(`${pkgName}/package.json`).version;
    }
  } catch (e) {
    return undefined;
  }
}

// 普通检查包依赖的版本是否错误
function checkVersion(coreVersion) {
  const baseDir = dirname(require.resolve('@midwayjs/version'));
  const decoratorVersion = getVersion('@midwayjs/decorator') || '3.7.0';
  const result = [];
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

  // 当前版本的包信息列表
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

// 下载最新的包到 node_modules
function getLatestPackage(templateUri, baseDir) {
  let data = runCmd(`npm view ${templateUri} dist-tags --json`);
  const remoteVersion = JSON.parse(data)['latest'];

  function checkoutVersionEquals() {
    const midwayVersionPkgVersion = getVersion('@midwayjs/version', true, {
      cwd: baseDir,
    });
    return midwayVersionPkgVersion === remoteVersion;
  }

  if (!checkoutVersionEquals()) {
    // 如果 node_modules 不存在，则建一个
    if (!existsSync(join(baseDir, 'node_modules'))) {
      mkdirSync(join(baseDir, 'node_modules'));
    }
    // 如果版本不同，则需要重新安装
    runCmd(`npm pack @midwayjs/version --quiet --pack-destination=${join(baseDir, 'node_modules')}`);
    // 用 install 安装 zip 包
    runCmd(`npm install --quiet --no-save --no-package-lock ${join(baseDir, 'node_modules', `midwayjs-version-${remoteVersion}.tgz`)}`, baseDir);

    if (!checkoutVersionEquals()) {
      outputError('@midwayjs/version install error and version is not equals');
    }
  }
}

// 检查包是否可以更新到最新版本
function checkPackageUpdate(writeUpdate = false) {
  if (!existsSync(join(currentProjectRoot, 'package.json'))) {
    outputError('>> Package.json not found in current cwd, please check it.');
    return;
  }

  const baseDir = join(dirname(require.resolve('@midwayjs/version')), '../../../');
  const versionBaseDir = dirname(require.resolve('@midwayjs/version'));
  
  getLatestPackage('@midwayjs/version', baseDir);

  const {decorator: decoratorVersion, core: coreVersion} = require('@midwayjs/version');
  const result = [];
  const versionFile = join(
    versionBaseDir,
    `versions/${decoratorVersion.replace(/\./g, '_')}-${coreVersion.replace(
      /\./g,
      '_'
    )}.json`
  );

  const text = readFileSync(versionFile, 'utf-8');
  const versions = JSON.parse(text);
  logger('log', '>> Start to check your midway component version...\n');

  // 当前版本的包信息列表
  const pkgList = Object.keys(versions);
  // package.json 的内容
  const pkgText = readFileSync(join(currentProjectRoot, 'package.json'), 'utf-8');
  let pkgJSON;
  try {
    pkgJSON = JSON.parse(pkgText);
  } catch (e) {
    outputError('>> >> Package.json parse error, please check it.');
    return;
  }

  let fail = 0;

  // 把当前的实际依赖的包版本和 versions 文件中的版本进行对比
  for (const pkgName of pkgList) {
    const version = getVersion(pkgName);
    if (!version) {
      continue;
    }

    versions[pkgName] = [].concat(versions[pkgName]);

    const latestVersion = versions[pkgName].pop();

    if (latestVersion === version) {
      // ignore
    } else {
      // fail
      fail++;
      result.push({
        name: pkgName,
        current: version,
        latestVersion,
      });
      logger('error', `\x1b[33m▫️\x1B[0m ${pkgName.padEnd(40, ' ')}${version.padEnd(8, ' ')} => ${latestVersion}`);
    }
  }

  if (writeUpdate) {
    if (result.length > 0) {
      // 循环 pkg，设置依赖版本
      for (const pkg of result) {
        if (pkgJSON['dependencies'][pkg.name]) {
          pkgJSON['dependencies'][pkg.name] = getReplacedDepenciesVersion(pkgJSON['dependencies'][pkg.name], pkg.latestVersion);
        } else if (pkgJSON['devDependencies'][pkg.name]) {
          pkgJSON['devDependencies'][pkg.name] = getReplacedDepenciesVersion(pkgJSON['devDependencies'][pkg.name], pkg.latestVersion);
        }
      }
      // 写入 package.json
      writeFileSync(join(currentProjectRoot, 'package.json'), JSON.stringify(pkgJSON, null, 2));
      logger('log', '*'.repeat(60));
      logger('log', `>> Write complete, please re-run install command.`);
      logger('log', '*'.repeat(60));
    }
  } else {
    logger('log', '*'.repeat(60));
    if (fail > 0) {
      logger('log', `>> Check complete, found \x1B[41m${fail}\x1B[0m package can be update.`);
      logger('log', `>> Please check the result above.`);
    } else {
      logger('log', `>> Check complete, all versions are healthy.`);
    }
    logger('log', '*'.repeat(60));
  
  }

  return result;
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


exports.check = function (output = false) {
  outputConsole = output;
  const coreVersion = getVersion('@midwayjs/core');

  if (!coreVersion) {
    outputError('>> Please install @midwayjs/core first');
    return;
  }

  if (!checkUpdate(coreVersion)) {
    return;
  }

  if (process.argv.includes('-u')) {
    checkPackageUpdate(process.argv.includes('-w'));
  } else {
    return checkVersion(coreVersion);
  }
}

exports.checkPackageUpdate = checkPackageUpdate;