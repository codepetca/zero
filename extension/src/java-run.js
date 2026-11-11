'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {resolveProject} = require('./core');
const {parseXml, single, value} = require('./project-pom');

const ordinaryLaunchFields = new Set([
  'type', 'name', 'request', 'mainClass', 'projectName', 'noDebug',
  '__origin', '__progressId', '__workspaceFolder',
]);

async function mavenEntryPoint(root) {
  const pomPath = path.join(root, 'pom.xml');
  const stat = await fs.lstat(pomPath);
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) return;
  const pom = parseXml(await fs.readFile(pomPath, 'utf8'));
  const build = single(pom, 'build');
  const plugins = single(build, 'plugins');
  const javafx = plugins.children.find(plugin => plugin.name === 'plugin'
    && value(single(plugin, 'artifactId')) === 'javafx-maven-plugin');
  if (!javafx || value(single(javafx, 'groupId')) !== 'org.openjfx') return;
  const mainClass = value(single(single(javafx, 'configuration'), 'mainClass'));
  return {
    mainClass: mainClass === '${app.mainClass}'
      ? value(single(single(pom, 'properties'), 'app.mainClass')) : mainClass,
    projectName: value(single(pom, 'artifactId')),
  };
}

function registerJavaRun(vscode) {
  return vscode.debug.registerDebugConfigurationProvider('java', {
    async resolveDebugConfiguration(folder, config, token) {
      // The Java Debugger can save its generated default in launch.json before
      // calling this hook. Match the launch it generated, including its default
      // name and fields, so saved custom options still go to the Java adapter.
      if (folder?.uri.scheme !== 'file' || vscode.workspace.isTrusted !== true
          || config.type !== 'java' || config.request !== 'launch' || config.noDebug !== true
          || config.__origin !== 'internal' || typeof config.mainClass !== 'string'
          || config.name !== config.mainClass.split('.').at(-1)
          || Object.keys(config).some(key => !ordinaryLaunchFields.has(key))) return config;

      let root, entryPoint;
      try {
        const folders = vscode.workspace.workspaceFolders || [];
        if (folders.some(item => item.uri.scheme !== 'file')) return config;
        root = await resolveProject(folders.map(item => item.uri.fsPath));
        if (await resolveProject([folder.uri.fsPath]) !== root) return config;
        entryPoint = await mavenEntryPoint(root);
      } catch {
        return config;
      }
      if (entryPoint?.mainClass !== config.mainClass || entryPoint.projectName !== config.projectName) return config;

      // Run Java may have already shown progress before starting the debug
      // request. Finish its reporter because the Java adapter won't start.
      const progress = vscode.extensions.getExtension('vscjava.vscode-java-debug')?.exports?.progressProvider;
      if (typeof config.__progressId === 'string' && typeof progress?.getProgressReporter === 'function') {
        const reporter = progress.getProgressReporter(config.__progressId);
        if (!reporter || reporter.isCancelled()) return;
        reporter.done();
      }
      if (token?.isCancellationRequested) return;
      await vscode.commands.executeCommand('zero.runApp', root);
      return undefined;
    },
  });
}

module.exports = {registerJavaRun};
