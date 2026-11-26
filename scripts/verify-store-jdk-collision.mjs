import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const [java, directory] = process.argv.slice(2);
const artifactBase = 'https://fdvfhpclefgmg9ks.public.blob.vercel-storage.com/';
const publishedHash = '80a35352b5a656b35623989e59f8b9689da2fb659479c200bb640c1277a4bc6b';
const catalogResponse = await fetch('https://zero.codepet.ca/api/sharing/catalog/v3', {signal:AbortSignal.timeout(20000)});
assert.equal(catalogResponse.status, 200);
const catalog = await catalogResponse.json();
const release = catalog.releases.find(item => item.id === 'lib-r1471779330-collision-helper' && item.version === '0.2.0');
assert.equal(release.namespace, 'zero.lib.r1471779330.collision_helper');
const artifact = release.artifacts.jar;
assert.equal(artifact.url, artifactBase + artifact.path);
assert.equal(artifact.sha256, publishedHash);
const jarResponse = await fetch(artifact.url, {redirect:'error', signal:AbortSignal.timeout(20000)});
assert.equal(jarResponse.status, 200);
const jar = Buffer.from(await jarResponse.arrayBuffer());
assert.equal(jar.length, artifact.size);
assert.equal(createHash('sha256').update(jar).digest('hex'), publishedHash);
const jarPath = join(directory, 'collision-helper-0.2.0.jar');
const sourcePath = join(directory, 'CollisionHelperCheck.java');
await writeFile(jarPath, jar);
await writeFile(sourcePath, `import zero.lib.r1471779330.collision_helper.CollisionHelper;

public class CollisionHelperCheck {
    public static void main(String[] arguments) {
        boolean overlap = CollisionHelper.overlaps(0, 0, 20, 20, 15, 10, 10, 10);
        boolean gap = !CollisionHelper.overlaps(0, 0, 20, 20, 25, 10, 10, 10);
        if (!overlap || !gap) throw new AssertionError("Check the rectangles");
        System.out.println("Collision Helper Pilot works");
    }
}
`);
const check = spawnSync(java, ['--class-path', jarPath, sourcePath], {encoding:'utf8', timeout:45000});
assert.equal(check.status, 0, check.stderr);
assert.equal(check.stdout.trim(), 'Collision Helper Pilot works');
await writeFile(join(directory, 'store-jdk-collision.json'), JSON.stringify({
  artifact: release.id, version: release.version, sha256: publishedHash, java: 'Store-provisioned JDK',
  overlap: true, gap: true, stdout: check.stdout.trim(),
}, null, 2));
console.log(check.stdout.trim());
