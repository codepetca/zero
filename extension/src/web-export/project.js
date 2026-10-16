'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const lock = require('./toolchain-lock.json');
const xml = (value) =>
  String(value).replace(
    /[<>&"']/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;'
      })[c]
  );
async function generateProject(root, adapted, resources, artifactRoot) {
  const put = async (relative, content) => {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  };
  for (const [name, content] of Object.entries(adapted.sources)) {
    if (
      !name.endsWith('.java') ||
      path.isAbsolute(name) ||
      name.split(/[\\/]/).some((p) => p === '..' || p === '.')
    )
      throw new Error(`Invalid generated Java path: ${name}`);
    await put(`src/main/java/${name}`, content);
  }
  const template = (name) =>
    fs.readFile(path.join(__dirname, 'template', name), 'utf8');
  const packages = [
    ...new Set(
      Object.keys(adapted.sources)
        .map((name) => path.posix.dirname(name))
        .filter((name) => name !== '.')
    )
  ];
  await put(
    'src/main/module.gwt.xml',
    (await template('module.gwt.xml')).replace(
      '<!-- APP_SOURCE_PATHS -->',
      packages.map((name) => `<source path="${xml(name)}"/>`).join('\n')
    )
  );
  await put(
    'src/main/resources/super/dev/webfx/platform/boot/gwt/GwtEntryPoint.java',
    (await template('GwtEntryPoint.java')).replace(
      '__MAIN_CLASS__',
      adapted.mainClass
    )
  );
  await put(
    'src/main/resources/super/dev/webfx/platform/resource/gwt/GwtEmbedResourcesBundle.java',
    await template('GwtEmbedResourcesBundle.java')
  );
  await put(
    'src/main/resources/super/dev/webfx/kit/mapper/peers/javafxgraphics/elemental2/util/FxEvents.java',
    await template('FxEvents.java')
  );
  await put(
    'src/main/resources/dev/webfx/platform/meta/exe/exe.properties',
    'executableModuleName=zero-web\nexecutableModuleVersion=1.0.0\napplicationModuleName=zero\npwa=null\nenvironment=production\n'
  );
  await put(
    'src/main/resources/public/dev/webfx/kit/css/main.css',
    await template('main.css')
  );
  await put(
    'src/main/resources/public/index.html',
    '<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Zero app</title><link rel="stylesheet" href="./dev/webfx/kit/css/main.css"></head><body><script src="./zero_web.nocache.js"></script></body></html>\n'
  );
  for (const resource of resources)
    await put(`src/main/resources/public/${resource.path}`, resource.bytes);
  const dep = (g, a, v, extra = '') =>
    `<dependency><groupId>${g}</groupId><artifactId>${a}</artifactId><version>${v}</version>${extra}</dependency>`;
  const dependencies = lock.webfx.map((a) =>
    dep(
      a.groupId,
      a.artifactId,
      a.version,
      `<scope>system</scope><systemPath>${xml('${zero.artifactRoot}/' + a.file)}</systemPath>`
    )
  );
  for (const [g, a, v] of [
    ['org.gwtproject', 'gwt-user', lock.gwt],
    ['org.gwtproject', 'gwt-dev', lock.gwt],
    ['com.google.elemental2', 'elemental2-dom', '1.2.3'],
    ['com.google.elemental2', 'elemental2-svg', '1.2.3'],
    ['com.google.jsinterop', 'base', '1.0.1'],
    ['com.google.jsinterop', 'jsinterop-annotations', '2.0.2'],
    ['org.treblereel.gwt.nio', 'gwt-nio', '1.1'],
    ['org.jresearch.gwt.time', 'org.jresearch.gwt.time', '2.0.12']
  ])
    dependencies.push(dep(g, a, v));
  await put(
    'pom.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>school.zero</groupId><artifactId>zero-web</artifactId><version>1.0.0</version><packaging>gwt-app</packaging>
<properties><project.build.sourceEncoding>UTF-8</project.build.sourceEncoding><maven.main.skip>true</maven.main.skip><zero.artifactRoot>${xml(artifactRoot)}</zero.artifactRoot><maven.test.skip>true</maven.test.skip></properties>
<dependencies>${dependencies.join('\n')}</dependencies><build><plugins>
<plugin><groupId>net.ltgt.gwt.maven</groupId><artifactId>gwt-maven-plugin</artifactId><version>${lock.gwtPlugin}</version><extensions>true</extensions><configuration><moduleName>zero_web</moduleName><moduleShortName>zero_web</moduleShortName><failOnError>true</failOnError><sourceLevel>17</sourceLevel><style>OBF</style><optimize>9</optimize><localWorkers>2</localWorkers>
<!-- Plugin 1.2.0 quotes absolute compiler paths containing spaces as literal
     argument data on Unix. It appends compilerArgs after those defaults and
     launches GWT in target/. Final relative overrides select the same owned
     output/work/deploy paths without changing or relocating the cache. -->
<compilerArgs><arg>-war</arg><arg>${'${project.build.finalName}'}</arg><arg>-workDir</arg><arg>gwt/work</arg><arg>-deploy</arg><arg>gwt/deploy</arg></compilerArgs><jvmArgs><arg>-Xmx2g</arg></jvmArgs></configuration></plugin>
<plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-compiler-plugin</artifactId><version>3.11.0</version></plugin>
<plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-resources-plugin</artifactId><version>3.3.1</version></plugin>
<plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-surefire-plugin</artifactId><version>3.1.2</version></plugin>
<plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-war-plugin</artifactId><version>3.4.0</version></plugin>
<plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-install-plugin</artifactId><version>3.1.0</version></plugin><plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-deploy-plugin</artifactId><version>3.1.1</version></plugin><plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-clean-plugin</artifactId><version>3.2.0</version></plugin></plugins></build></project>`
  );
}
module.exports = { generateProject };
