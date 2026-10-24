'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');

test('generated WebFX entrypoint registers the scheduled-exception console bridge', async () => {
  const {adaptSources} = require('../src/web-export/adapters');
  const {generateProject} = require('../src/web-export/project');
  const adapted = adaptSources({sources: {'Main.java': 'import javafx.application.Application; public class Main extends Application { public void start(javafx.stage.Stage stage) {} }'}});
  assert.ok(adapted.sources['zero/web/BrowserConsoleProvider.java']);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-console-project-'));
  try {
    await generateProject(directory, adapted, [], '/unused-artifacts');
    const entrypoint = await fs.readFile(path.join(directory, 'src/main/resources/super/dev/webfx/platform/boot/gwt/GwtEntryPoint.java'), 'utf8');
    assert.match(entrypoint, /register\(dev\.webfx\.platform\.console\.spi\.ConsoleProvider\.class, zero\.web\.BrowserConsoleProvider::new\)/);
    assert.equal(await fs.readFile(path.join(directory, 'src/main/java/zero/web/BrowserConsoleProvider.java'), 'utf8'), adapted.sources['zero/web/BrowserConsoleProvider.java']);
  } finally { await fs.rm(directory, {recursive: true, force: true}); }
});

test('actual Java console bridge stops owners once, preserves causes and delegates unrelated logs', {skip: !process.env.JAVA_HOME}, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-console-java-'));
  try {
    const files = [];
    async function put(name, source) {
      const file = path.join(directory, name); await fs.mkdir(path.dirname(file), {recursive: true});
      await fs.writeFile(file, source); files.push(file);
    }
    for (const name of ['BrowserConsoleProvider.java', 'BrowserLifecycle.java']) await put('zero/web/' + name, await fs.readFile(path.join(root, 'extension/src/web-export/adapters/runtime/zero/web', name), 'utf8'));
    // Only platform/console/sink dependencies are fakes; bridge and owner cleanup
    // below compile and execute their actual production Java source.
    await put('dev/webfx/platform/console/spi/impl/elemental2/Elemental2ConsoleProvider.java', `package dev.webfx.platform.console.spi.impl.elemental2;
public class Elemental2ConsoleProvider { public static int delegated; public void error(String message, Throwable failure) { delegated++; } }`);
    await put('elemental2/dom/DomGlobal.java', `package elemental2.dom;
public class DomGlobal { public static final Window window = new Window(); public static class Window { public void addEventListener(String type, java.util.function.Consumer<Object> action) {} } }`);
    await put('jsinterop/base/Js.java', `package jsinterop.base;
public class Js { public static boolean isTruthy(Object value) { return false; } public static Map asPropertyMap(Object value) { return new Map(); } public static class Map { public Object get(String key) { return null; } } }`);
    await put('zero/web/BrowserRuntime.java', `package zero.web;
public class BrowserRuntime {
 public static boolean failing; public static int fatals; public static Throwable reported; public static String stage, code;
 static boolean beginFailure() { if(failing)return false; failing=true; return true; }
 public static Runnable registerStop(Runnable stop) { return () -> {}; }
 public static void fatal(String at, String name, Throwable failure) { fatals++; reported=failure; stage=at; code=name; }
}`);
    await put('ConsoleBridgeCheck.java', `import zero.web.*;
import dev.webfx.platform.console.spi.impl.elemental2.Elemental2ConsoleProvider;
public class ConsoleBridgeCheck {
 static int stops; static void require(boolean value, String message) { if(!value)throw new AssertionError(message); }
 public static void main(String[] args) {
  BrowserConsoleProvider console=new BrowserConsoleProvider();
  String prefix="Uncaught exception occurred in scheduled runnable ";
  console.error("ordinary error",new IllegalArgumentException("logged only"));
  console.error(prefix+"without Throwable",null); console.error(null,new IllegalArgumentException("logged only"));
  require(BrowserRuntime.fatals==0,"ordinary logs must not terminate apps");
  Object owner=new Object();
  BrowserLifecycle.own(owner,()->{stops++;BrowserLifecycle.release(owner);console.error(prefix+"nested",new IllegalStateException("nested"));throw new IllegalStateException("cleanup failure");});
  IllegalStateException cause=new IllegalStateException("Lifecycle UI fault");
  console.error(prefix+"actual callback",cause);
  require(stops==1 && BrowserRuntime.fatals==1,"owners close once, including recursive errors");
  require(BrowserRuntime.reported==cause && cause.getSuppressed().length==1 && cause.getSuppressed()[0].getMessage().equals("cleanup failure"),"preserve original cause and cleanup diagnostic");
  require(BrowserRuntime.stage.equals("ui-callback") && BrowserRuntime.code.equals("UI_CALLBACK_FAILED"),"use existing bounded failure vocabulary");
  console.error(prefix+"duplicate",new IllegalStateException("duplicate"));
  require(stops==1 && BrowserRuntime.fatals==1,"duplicate scheduled errors are idempotent");
  require(Elemental2ConsoleProvider.delegated==6,"preserve all original logging calls");
  System.out.println("ZERO_CONSOLE_BRIDGE_OK");
 }
}`);
    const bin = name => path.join(process.env.JAVA_HOME, 'bin', name + (process.platform === 'win32' ? '.exe' : ''));
    execFileSync(bin('javac'), ['--release', '17', '-d', directory, ...files], {timeout: 20000, stdio: 'pipe'});
    assert.match(execFileSync(bin('java'), ['-cp', directory, 'ConsoleBridgeCheck'], {timeout: 10000, encoding: 'utf8'}), /ZERO_CONSOLE_BRIDGE_OK/);
  } finally { await fs.rm(directory, {recursive: true, force: true}); }
});
