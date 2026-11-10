import {mkdirSync, copyFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {prepareDesign} from '../design/prepare.mjs';
import {prepareLessonProjects} from './lesson-projects.mjs';
import {sharingConfigurationBytes} from './release-review.mjs';

// The source editor and the VSIX use the same generated extension resources.
export function prepareExtensionAssets(root, {website = false} = {}) {
  prepareDesign({website});
  prepareLessonProjects(root);
  const media = path.join(root, 'extension/media');
  const harness = path.join(media, 'sharing-harness');
  mkdirSync(harness, {recursive:true});
  copyFileSync(path.join(root, 'sharing/harness/ZeroLibraryHarness.java'), path.join(harness, 'ZeroLibraryHarness.java'));
  writeFileSync(path.join(media, 'sharing-config.json'), sharingConfigurationBytes(root));
}
