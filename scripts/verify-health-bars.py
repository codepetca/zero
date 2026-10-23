#!/usr/bin/env python3
"""Verify maintained health-bar samples in isolated trusted-local native builds."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import time
import xml.etree.ElementTree as ET
import zipfile

ZERO = Path(__file__).resolve().parent.parent
MODULE = ZERO / 'libraries/health-bars'
VERSION = '0.1.0'
NAMES = ('HealthBar', 'SegmentedHealthBar')
PACKAGE = 'zero/healthbars/'

HARNESS = '''import java.nio.file.Path;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.event.Event;
import javafx.stage.Stage;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import zero.healthbars.TYPE;
public class HealthBarsCheck extends Application {
    static Object field(Object object, String name) throws Exception {
        var field = object.getClass().getDeclaredField(name);
        field.setAccessible(true); return field.get(object);
    }
    static void require(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
    static double fraction(TYPE meter) {
        var view = (VBox) meter.view();
        if (view.getChildren().get(1) instanceof ProgressBar bar) return bar.getProgress();
        var segments = (HBox) view.getChildren().get(1);
        double filled = 0;
        for (var node : segments.getChildren()) filled += ((ProgressBar) node).getProgress();
        return filled / segments.getChildren().size();
    }
    public void start(Stage stage) {
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(15_000); } catch (InterruptedException ignored) { return; }
            System.err.println("HEALTH_BARS_TIMEOUT"); System.exit(1);
        });
        watchdog.setDaemon(true); watchdog.start();
        Main app = new Main();
        try {
            app.start(stage);
            Path actual = Path.of(TYPE.class.getProtectionDomain().getCodeSource().getLocation().toURI()).toRealPath();
            require(actual.equals(Path.of(System.getenv("EXPECTED_HEALTH_BARS_JAR")).toRealPath()), "Component comes from installed JAR");
            TYPE meter = (TYPE) field(app, "meter");
            var view = meter.view();
            Label label = (Label) ((VBox) view).getChildren().get(0);
            CHECKS
            require(view == meter.view(), "Explicit updates retain the same view");
            System.out.println("HEALTH_BARS_OK KIND");
        } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
        finally { app.stop(); stage.close(); Platform.exit(); }
    }
    public static void main(String[] args) { launch(args); }
}
'''
CHECKS = {
    'adventure': '''Button hit = (Button) field(app, "hit");
            Button heal = (Button) field(app, "heal");
            Button reset = (Button) field(app, "reset");
            require(meter.getHealth() == 100 && fraction(meter) == 1, "Adventure starts full");
            hit.fire();
            require(meter.getHealth() == 75 && fraction(meter) == .75 && label.getText().equals("Health: 75 / 100"), "Damage updates label and fractional fill");
            heal.fire(); require(meter.getHealth() == 85 && fraction(meter) == .85, "Heal restores ten");
            for (int i = 0; i < 6; i++) hit.fire();
            require(meter.getHealth() == 0 && fraction(meter) == 0, "Damage clamps to zero");
            reset.fire(); require(meter.getHealth() == 100 && fraction(meter) == 1, "Restart restores full health");
            hit.fire(); require(meter.getHealth() == 75, "Restarted adventure works again");''',
    'study': '''TextField answer = (TextField) field(app, "answer");
            Button check = (Button) field(app, "check");
            Button reset = (Button) field(app, "reset");
            Label feedback = (Label) field(app, "feedback");
            check.fire(); require(meter.getHealth() == 8, "Blank answer does not spend energy");
            answer.setText(" 3 "); Event.fireEvent(answer, new javafx.event.ActionEvent());
            require(meter.getHealth() == 7 && fraction(meter) == .875 && label.getText().equals("Study energy: 7 / 8"), "Enter handles trimmed answer and fractional fill");
            require(feedback.getText().equals("Correct!"), "Correct feedback");
            answer.setText("wrong"); check.fire();
            require(meter.getHealth() == 5 && feedback.getText().equals("Try again."), "Retry spends two energy");
            for (int i = 0; i < 4; i++) check.fire();
            require(meter.getHealth() == 0 && check.isDisabled() && answer.isDisabled(), "Exhaustion locks controls");
            check.fire(); require(meter.getHealth() == 0, "Exhausted session cannot spend more");
            reset.fire(); require(meter.getHealth() == 8 && fraction(meter) == 1 && answer.getText().isEmpty() && !check.isDisabled() && !answer.isDisabled(), "Reset restores budget and input");
            answer.setText("3"); check.fire(); require(meter.getHealth() == 7, "Second session works");'''
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ZERO / '.verification/health-bars')
    parser.add_argument('--cache-from', type=Path, help='Copy trusted cached dependencies into this proof cache.')
    args = parser.parse_args()
    output = args.output.absolute()
    output.mkdir(parents=True, exist_ok=False)
    output = output.resolve()
    cache = output / 'cache'
    if args.cache_from:
        shutil.copytree(args.cache_from.resolve(strict=True), cache)
    settings = output / 'settings.xml'
    settings.write_text('<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0"/>\n')
    wrapper = ZERO / 'student-template' / ('mvnw.cmd' if os.name == 'nt' else 'mvnw')
    common = [str(wrapper), '-B', '-s', str(settings), '-gs', str(settings), f'-Dmaven.repo.local={cache}']
    started = time.monotonic()
    source_files = [p for p in MODULE.rglob('*') if p.is_file() and 'target' not in p.parts]
    if any(p.is_symlink() for p in MODULE.rglob('*')):
        raise RuntimeError('Indirect module input refused')
    hashes = {str(p.relative_to(ZERO)): digest(p) for p in source_files}

    def run(directory, goals, name, marker=None, env=None, expected_failure=False):
        result = subprocess.run(common + ['-f', str(directory / 'pom.xml'), *goals], cwd=ZERO,
                                capture_output=True, text=True, env=env, timeout=180)
        (output / (name + '.log')).write_text(result.stdout + '\n' + result.stderr)
        if bool(result.returncode) != expected_failure or (marker and marker not in result.stdout):
            raise RuntimeError(f'Unexpected check result; see {output / (name + ".log")}')
        print(f'Passed {name}', flush=True)

    build = output / 'build'
    shutil.copytree(MODULE, build, ignore=shutil.ignore_patterns('target'))
    run(build, ['clean', 'verify'], 'library')
    reports = [ET.parse(p).getroot() for p in (build / 'target/surefire-reports').glob('TEST-*.xml')]
    if sum(int(r.attrib['tests']) for r in reports) != 6 or any(int(r.attrib[k]) for r in reports for k in ('failures','errors','skipped')):
        raise RuntimeError('Six original behavior tests must pass without skips')
    license_bytes = (MODULE / 'LICENSE').read_bytes()
    artifact = build / f'target/health-bars-{VERSION}.jar'
    for suffix in ('', '-sources', '-javadoc'):
        jar_path = build / f'target/health-bars-{VERSION}{suffix}.jar'
        with zipfile.ZipFile(jar_path) as jar:
            notice = 'resources/LICENSE' if suffix == '-javadoc' else 'META-INF/LICENSE'
            if jar.read(notice) != license_bytes:
                raise RuntimeError('Packaged MIT notice drift')
            if suffix == '':
                if {n for n in jar.namelist() if n.endswith('.class')} != {PACKAGE + n + '.class' for n in NAMES}:
                    raise RuntimeError('Unexpected library classes')
            if suffix == '-sources':
                for name in NAMES:
                    if jar.read(PACKAGE + name + '.java') != (MODULE / ('src/main/java/' + PACKAGE + name + '.java')).read_bytes():
                        raise RuntimeError('Packaged source drift')
    run(build, ['install','-DskipTests'], 'install')
    installed = cache / f'ca/codepet/zero/health-bars/{VERSION}/health-bars-{VERSION}.jar'
    if digest(installed) != digest(artifact):
        raise RuntimeError('Installed JAR bytes drift')
    mutant = output / 'fraction-regression'
    shutil.copytree(MODULE, mutant, ignore=shutil.ignore_patterns('target'))
    broken = mutant / ('src/main/java/' + PACKAGE + 'HealthBar.java')
    text = broken.read_text()
    if text.count('(double) this.health / maximum') != 1:
        raise RuntimeError('Regression input changed')
    broken.write_text(text.replace('(double) this.health / maximum', 'this.health / maximum'))
    run(mutant, ['clean','test'], 'fraction-regression', expected_failure=True)
    report = ET.parse(mutant / 'target/surefire-reports/TEST-zero.healthbars.HealthBarTest.xml').getroot()
    rejected = {t.attrib['name'] for t in report.findall('testcase') if t.find('failure') is not None or t.find('error') is not None}
    if rejected != {'partialDamageShowsCorrectFractionAndCaption','boundsAndIndependentInstancesSurviveReset'}:
        raise RuntimeError(f'Expected two fractional regressions; got {rejected}')
    for kind in ('adventure','study','segmented-adventure','segmented-study'):
        consumer = output / 'consumers' / kind
        java = consumer / 'src/main/java'
        # App's Zero UI overload depends on Element; keep the complete canonical tree.
        shutil.copytree(ZERO / 'framework/src/main/java/zero', java / 'zero')
        shutil.copy2(MODULE / f'examples/{kind}/Main.java', java / 'Main.java')
        component = 'SegmentedHealthBar' if kind.startswith('segmented-') else 'HealthBar'
        check = HARNESS.replace('TYPE', component).replace('CHECKS',CHECKS[kind.removeprefix('segmented-')]).replace('KIND',kind)
        (java / 'HealthBarsCheck.java').write_text(check)
        pom = (ZERO / 'student-template/pom.xml').read_text()
        dependency = f'<dependency><groupId>ca.codepet.zero</groupId><artifactId>health-bars</artifactId><version>{VERSION}</version></dependency>'
        (consumer / 'pom.xml').write_text(pom.replace('</dependencies>', dependency + '\n</dependencies>',1))
        run(consumer, ['-Dapp.mainClass=HealthBarsCheck','clean','compile','javafx:run'], kind,
            marker='HEALTH_BARS_OK ' + kind, env=dict(os.environ, EXPECTED_HEALTH_BARS_JAR=str(installed)))
    if hashes != {str(p.relative_to(ZERO)): digest(p) for p in source_files}:
        raise RuntimeError('Source changed during proof')
    receipt = {'schema':1,'status':'local-verified','coordinate':f'ca.codepet.zero:health-bars:{VERSION}',
               'sourceFilesSha256':hashes,'installedJarSha256':digest(installed),'originalTests':6,
               'regressionsRejected':sorted(rejected),'nativeConsumers':['adventure','study','segmented-adventure','segmented-study'],
               'checks':['packaged MIT notices','canonical sources JAR','installed JAR origin','fractional fill','damage/heal','exhaustion/reset'],
               'seconds':round(time.monotonic()-started,2),
               'limits':['trusted local Java','synthetic actions','physical input/novice/Windows/Linux desktops untested','no publication']}
    (output / 'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(f'HEALTH_BARS_VERIFIED {output / "receipt.json"}', flush=True)


if __name__ == '__main__':
    main()
