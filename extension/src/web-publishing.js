'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

// The staging job handles data only. Pages credentials belong to the deploy job.
const pagesWorkflow = `name: Publish Zero game
run-name: Zero web \${{ inputs.source_sha }}
on:
  workflow_dispatch:
    inputs:
      source_sha:
        description: Reviewed source commit
        required: true
        type: string
      release_id:
        description: Temporary draft release ID
        required: true
        type: string
      stage_tag:
        description: Exact temporary draft name
        required: true
        type: string
      asset_id:
        description: Exact locally built asset ID
        required: true
        type: string
      profile_sha256:
        description: Local compiler and compatibility profile digest
        required: true
        type: string
      bundle_sha256:
        description: Exact local bundle digest
        required: true
        type: string
permissions:
  contents: read
concurrency:
  group: zero-pages
  cancel-in-progress: false
jobs:
  stage:
    if: github.ref == 'refs/heads/main' && inputs.source_sha == github.sha
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    permissions:
      contents: write
    env:
      GITHUB_TOKEN: \${{ github.token }}
      ZERO_SOURCE_SHA: \${{ inputs.source_sha }}
      ZERO_RELEASE_ID: \${{ inputs.release_id }}
      ZERO_STAGE_TAG: \${{ inputs.stage_tag }}
      ZERO_ASSET_ID: \${{ inputs.asset_id }}
      ZERO_PROFILE_SHA256: \${{ inputs.profile_sha256 }}
      ZERO_BUNDLE_SHA256: \${{ inputs.bundle_sha256 }}
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262
        with:
          persist-credentials: false
          ref: \${{ inputs.source_sha }}
          sparse-checkout: .zero-web
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020
        with:
          node-version: '22'
      - name: Validate the locally built app
        id: export
        run: node .zero-web/run.cjs
      - uses: actions/upload-pages-artifact@56afc609e74202658d3ffba0e8f6dda462b719fa
        with:
          path: \${{ steps.export.outputs.site }}
          retention-days: 1
      - name: Remove temporary app bundle
        if: always()
        env:
          ZERO_CLEANUP: 'true'
        run: node .zero-web/run.cjs
  deploy:
    needs: stage
    runs-on: ubuntu-24.04
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e
        id: deployment
`;

// This guide is part of the project-owned publishing kit and its owner hash.
// Keep its bytes pinned across editor-only UI changes; update it through a kit migration.
function publishingGuide(repositoryPage) {
  return `# Share your app

Choose **Publish app** in the Zero sidebar to publish a completed version using your connected GitHub repository. The first time, Zero reviews the public destination, prepares the publishing files, checks the Zero GitHub App’s access to this repository, and uses the normal reviewed upload. Later updates use the same button and keep the same page URL.

Wait for **Your app is live**. Then choose **Open app** or **Copy playable link**. You can retrieve the verified link later with **Zero: Copy Playable Link** or **Zero: Open Published App** in the command palette. This playable link is separate from the source repository link submitted in Pika.

If Zero reports one setup step, follow that specific action and choose **Recheck**. Zero preserves repository visibility, existing websites and custom domains. School policies, account permissions or private-repository plans can require help from your teacher or IT. The first publish confirms its destination. Later explicit Publish actions revalidate and update that approved site without another destination dialog. If optional simulation is configured for testing, it makes no upload or public website change.

Your completed version must be saved and uploaded. If Zero asks you to finish a change or upload current work, use its ordinary workflow and try **Publish app** again. A failed build preserves the previously published page. Zero shows a new link only after the exact publishing run succeeds and the public site serves that version.

${repositoryPage ? `Source repository: ${repositoryPage}\n\n` : ''}## Export files or use itch.io

Choose **Export for web** from Zero's title menu or the command palette for a local browser build. Choose **Preview game** to try it on your computer, **Save ZIP** to save a copy, or **Share…** to choose a destination.

For itch.io, open https://itch.io/game/new in your own account. Choose **HTML**, upload the exported ZIP, and select **This file will be played in the browser**. Preview controls and sound before choosing visibility and saving the page. Copy the actual published game-page URL.

## Storage

The exported app includes its JavaScript, images, audio and runtime license/source material. It includes no Java installation or Maven compiler. Exporting replaces the last generated output in **.zero/web-export** and keeps it ignored by Git. A failed build preserves the last successful export. Compiler downloads are cached once per Zero installation.

Zero compiles and checks the browser app locally. GitHub Pages deploys those exact bytes; it does not commit generated game files into source history. A temporary draft release carries the app to Actions and is deleted after staging; interrupted cleanup is retried when you recheck. The deployment artifact expires after one day, while the live site remains available independently. GitHub retains its normal run/deployment history. Large image/audio assets usually dominate game size.

Hosting references: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages and https://itch.io/docs/creators/html5
`;
}

async function pagesFiles(engineRoot) {
  const files = new Map();
  files.set('.zero-web/run.cjs',await fs.readFile(path.join(__dirname,'web-deploy-runner.cjs')));
  files.set('.zero-web/web-publish-bundle.js',await fs.readFile(path.join(__dirname,'web-publish-bundle.js')));
  // Generated app bytes are staged temporarily; only deployment source is tracked.
  files.set('.zero-web/publish.yml',Buffer.from(pagesWorkflow));
  files.set('.zero-web/README.md',Buffer.from(publishingGuide()));
  return files;
}

async function preparePagesFiles(projectRoot,engineRoot) {
  const root=await fs.realpath(projectRoot), files=await pagesFiles(engineRoot);
  // Check every path before writing; never overwrite an edited publishing kit.
  const create=[];
  for (const [name,data] of files) {
    let current=root;
    for (const part of name.split('/')) {
      current=path.join(current,part);
      const stat=await fs.lstat(current).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
      if(stat?.isSymbolicLink()) throw new Error('A publishing-kit path is a symbolic link. Move it before preparing sharing.');
    }
    const existing=await fs.readFile(path.join(root,name)).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(existing && !existing.equals(data)) throw new Error(`Publishing file ${name} already has different content. Preserve or move that folder before preparing a new kit.`);
    if(!existing)create.push([name,data]);
  }
  for(const [name,data]of create) {
    await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});
    await fs.writeFile(path.join(root,name),data,{flag:'wx'});
  }
  return {created:create.map(([name])=>name),guide:publishingGuide(),workflow:pagesWorkflow};
}

module.exports={pagesWorkflow,pagesFiles,preparePagesFiles,publishingGuide};
