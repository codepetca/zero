// Loaded by the pinned Playwright CLI as an async function, not a test-runner spec.
async (page) => {
  const urls = __URLS__;
  const artifactRoot = __ARTIFACT_ROOT__;
  const results = [];
  const helperImageDraws = 15;
  // JavaFX label peers also have aria-hidden text measurement nodes.
  const visibleText = (text) =>
    page.getByText(text, { exact: true }).filter({ visible: true });
  const check = (condition, name, data) => {
    results.push({ name, pass: !!condition, data });
    if (!condition) throw new Error(JSON.stringify(results));
  };
  await page.addInitScript(() => {
    window.__zeroAudio = [];
    const create = document.createElement.bind(document);
    document.createElement = function(name, ...args) {
      const element = create(name, ...args);
      if (name.toLowerCase() === 'audio') window.__zeroAudio.push(element);
      return element;
    };
    window.__zeroCheck = { texts: [], images: [], last: null, errors: [], draws: 0, clears: 0 };
    addEventListener('error', (event) =>
      window.__zeroCheck.errors.push(event.message)
    );
    const p = CanvasRenderingContext2D.prototype,
      clear = p.clearRect,
      text = p.fillText,
      image = p.drawImage;
    p.clearRect = function (...args) {
      const c = window.__zeroCheck;
      c.clears++;
      if (c.texts.length) c.last = { texts: c.texts, images: c.images };
      c.texts = [];
      c.images = [];
      return clear.apply(this, args);
    };
    p.fillText = function (...args) {
      window.__zeroCheck.draws++;
      const actorFontMarkers = {'Actor checks ready':'before', 'Actor shape':'inside',
        'Actor failing font':'failing', 'Actor scope restored':'after'};
      const actorFontMarker = actorFontMarkers[String(args[0])];
      if (actorFontMarker) {
        window.__zeroCheck.actorFonts ||= {};
        window.__zeroCheck.actorFonts[actorFontMarker] = this.font;
      }
      if (String(args[0]) === 'Actor scope restored') {
        const matrix = this.getTransform();
        window.__zeroCheck.actorScope = {font:this.font,fill:this.fillStyle,lineWidth:this.lineWidth,
          transform:[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f]};
      }
      if (String(args[0]) === 'Deferred draw completed') {
        window.__zeroCheck.deferredHiddenDuringDraw = ![...document.querySelectorAll('body *')].some(element =>
          element.children.length === 0 && element.textContent === 'Deferred view'
          && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
      }
      window.__zeroCheck.texts.push(String(args[0]));
      return text.apply(this, args);
    };
    p.drawImage = function (...args) {
      window.__zeroCheck.images.push(args.slice(1));
      return image.apply(this, args);
    };
  });
  await page.goto(urls.helpers);
  await page.waitForFunction(() =>
    window.__zeroCheck?.last?.texts.includes('Web helpers ready')
  );
  const state = () => page.evaluate(() => window.__zeroCheck.last);
  let s = await state();
  check(s.texts.includes('Game API checks ready'), 'Native/browser math and ArrayList semantics agree');
  check(s.texts.includes('Actor checks ready'), 'Actor subclasses, movement, aiming, validation and explicit animation updates agree');
  const actorPixels = await page.locator('canvas').evaluate(canvas => {
    const bounds = canvas.getBoundingClientRect();
    return [[269, 289], [281, 289], [314, 289], [359, 289]].map(([x, y]) =>
      Array.from(canvas.getContext('2d').getImageData(
        Math.floor(x * canvas.width / bounds.width), Math.floor(y * canvas.height / bounds.height), 1, 1).data));
  });
  check(JSON.stringify(actorPixels) === '[[80,200,80,255],[240,90,40,255],[240,90,40,255],[40,120,240,255]]',
    'Actor draws centered images with clockwise rotation, regions and the explicitly advanced animation frame', actorPixels);
  const actorDrawingPixels = await page.locator('canvas').evaluate(canvas => {
    const bounds = canvas.getBoundingClientRect();
    return [[398,136],[408,136],[400,146],[434,140],[360,174],[360,170],[425,180],[435,195]].map(([x,y]) =>
      Array.from(canvas.getContext('2d').getImageData(
        Math.floor(x * canvas.width / bounds.width), Math.floor(y * canvas.height / bounds.height),1,1).data));
  });
  check(JSON.stringify(actorDrawingPixels) === '[[0,0,255,255],[255,255,255,255],[255,215,0,255],[0,0,255,255],[255,215,0,255],[0,0,255,255],[255,215,0,255],[0,0,0,255]]',
    'Actor own draw uses centered local coordinates, clockwise rotation, nested contexts and legacy dispatch', actorDrawingPixels);
  const actorFonts = await page.evaluate(() => window.__zeroCheck.actorFonts);
  check(/20px/.test(actorFonts.before) && /9px/.test(actorFonts.inside)
      && /42px/.test(actorFonts.failing) && /20px/.test(actorFonts.after),
    'Canvas text uses requested font sizes before, inside and after Actor callbacks', actorFonts);
  const actorScope = await page.evaluate(() => window.__zeroCheck.actorScope);
  check(actorScope.fill === '#000000' && actorScope.lineWidth === 2 && /20px/.test(actorScope.font)
      && JSON.stringify(actorScope.transform) === '[1,0,0,1,0,0]',
    'Actor draw restores fill, font, stroke width and transform even after callback failure', actorScope);
  const rgbPixel = await page.locator('canvas').evaluate(canvas => {
    const bounds = canvas.getBoundingClientRect();
    return Array.from(canvas.getContext('2d').getImageData(
      Math.floor(450 * canvas.width / bounds.width), Math.floor(340 * canvas.height / bounds.height), 1, 1).data);
  });
  check(JSON.stringify(rgbPixel) === '[17,99,203,255]', 'Color.rgb renders exact opaque channels and rejects invalid channels', rgbPixel);
  for (const key of ['Digit1', 'Digit2', 'Digit3', 'Escape']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(70);
  }
  s = await state();
  check(s.texts.includes('Digits: 123 Escapes: 1'), 'Number-row and Escape keys reach ordinary Java KeyCode checks');
  check(
    s.images.length === helperImageDraws,
    'Drawing and sprite overloads render',
    s.images.length
  );
  check(
    (await page.locator('canvas').getAttribute('aria-label')) ===
      'Zero web helper check',
    'Canvas accessible text preserved'
  );
  await page.keyboard.press('Space');
  await page.waitForTimeout(70);
  s = await state();
  check(s.texts.includes('Presses: 1'), 'New Space press');
  await page.keyboard.down('Space');
  await page.waitForTimeout(80);
  await page.keyboard.down('Space');
  await page.waitForTimeout(70);
  await page.keyboard.up('Space');
  s = await state();
  check(
    s.texts.includes('Presses: 2'),
    'Held Space does not create repeated presses'
  );
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(170);
  await page.keyboard.up('ArrowRight');
  s = await state();
  check(
    Number(s.texts.find((t) => t.startsWith('Position:')).split(':')[1]) > 150,
    'Held movement updates ordinary Java state'
  );
  const canvas = await page.locator('canvas').boundingBox();
  await page.mouse.click(canvas.x + 100, canvas.y + 150);
  await page.waitForTimeout(70);
  s = await state();
  check(s.texts.includes('Clicks: 1'), 'Mouse press reaches the canvas');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(70);
  s = await state();
  check(
    s.texts.includes('Paused'),
    'Synthetic blur pauses through browser focus adapter'
  );
  check(
    (await page.evaluate(() => window.__zeroCheck.errors)).length === 0,
    'No JavaScript errors in helpers'
  );
  // A completed image at 10s must extend the 30s wait for a second at 35s.
  // This exercises real loader timers without slowing every network resource.
  const delayed = async route => {
    await new Promise(resolve => setTimeout(resolve, route.request().url().endsWith('/tiles.png') ? 10000 : 35000));
    await route.continue();
  };
  await page.route('**/tiles.png', delayed);
  await page.route('**/late-image.png', delayed);
  try {
    await page.goto(urls.helpers, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.__zeroCheck?.last?.texts.includes('Web helpers ready'), null, {timeout:45000});
    check((await state()).images.length === helperImageDraws, 'Image progress extends startup beyond the original 30-second deadline');
  } finally {
    await page.unroute('**/tiles.png', delayed);
    await page.unroute('**/late-image.png', delayed);
  }
  await page.addInitScript(() => {
    const mode = new URL(location.href).searchParams.get('zero-loading-check');
    if (!mode) return;
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => schedule(callback,
      delay === 30000 ? (mode === 'stall' ? 100 : 1000) : delay === 120000 ? (mode === 'total' ? 100 : 1000) : delay, ...args);
  });
  const held = async route => { await new Promise(resolve => setTimeout(resolve, 500)); await route.continue(); };
  await page.route('**/tiles.png', held);
  await page.route('**/late-image.png', held);
  try {
    for (const mode of ['stall', 'total']) {
      await page.goto(urls.helpers + '?zero-loading-check=' + mode, {waitUntil:'domcontentloaded'});
      const expected = mode === 'stall' ? 'Image loading stalled for 30 seconds' : 'Image loading exceeded two minutes';
      await visibleText(new RegExp('^' + expected)).waitFor({timeout:5000});
      await page.waitForTimeout(650);
      check(!(await state())?.texts.includes('Web helpers ready'),
        mode === 'stall' ? 'Accelerated stall deadline prevents late app startup' : 'Accelerated total deadline bounds image waits');
    }
  } finally {
    await page.unroute('**/tiles.png', held);
    await page.unroute('**/late-image.png', held);
  }
  await page.goto(urls.quiz);
  await page.waitForSelector('input[type="text"]');
  await page.locator('input[type="text"]').fill('41');
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  // WebFX flushes JavaFX property changes to DOM peers on the next frame.
  await visibleText('Try again.').waitFor({ state: 'visible' });
  check((await visibleText('Try again.').count()) === 1, 'Quiz retry feedback');
  check(
    await visibleText('Score: 0').isVisible(),
    'Quiz retry leaves score unchanged'
  );
  await page.locator('input[type="text"]').fill('42');
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await visibleText('Correct!').waitFor({ state: 'visible' });
  await visibleText('Score: 10').waitFor({ state: 'visible' });
  await page
    .getByRole('button', { name: 'Check answer', exact: true, disabled: true })
    .waitFor({ state: 'visible' });
  check((await visibleText('Correct!').count()) === 1, 'Quiz success feedback');
  check(
    await page
      .getByRole('button', { name: 'Check answer', exact: true })
      .isDisabled(),
    'Quiz awards a question only once'
  );
  check(
    await visibleText('Score: 10').isVisible(),
    'Java button handler updates shared score component'
  );
  check(
    (await page.evaluate(() => window.__zeroCheck.errors)).length === 0,
    'No JavaScript errors in quiz'
  );
  await page.goto(urls.drawing);
  await page.waitForSelector('canvas');
  const pixel = (x, y) =>
    page.locator('canvas').evaluate(
      (canvas, { x, y }) => {
        const bounds = canvas.getBoundingClientRect();
        return Array.from(
          canvas
            .getContext('2d')
            .getImageData(
              Math.floor((x * canvas.width) / bounds.width),
              Math.floor((y * canvas.height) / bounds.height),
              1,
              1
            ).data
        );
      },
      { x, y }
    );
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    const c = canvas?.getContext('2d').getImageData(100, 100, 1, 1).data;
    return c && c[0] === 255 && c[1] === 255 && c[2] === 255 && c[3] === 255;
  });
  const paintCanvas = await page.locator('canvas').boundingBox();
  await page.mouse.move(paintCanvas.x + 100, paintCanvas.y + 100);
  await page.mouse.down();
  await page.mouse.move(paintCanvas.x + 160, paintCanvas.y + 100, { steps: 6 });
  await page.mouse.up();
  let painted = await pixel(130, 100);
  check(
    painted[0] === 0 &&
      painted[1] === 0 &&
      painted[2] === 139 &&
      painted[3] === 255,
    'Drawing drag leaves an ordinary Java paint stroke',
    painted
  );
  await page.mouse.click(paintCanvas.x + 130, paintCanvas.y + 100, {
    button: 'right'
  });
  painted = await pixel(130, 100);
  check(
    painted.every((value) => value === 255),
    'Drawing secondary click clears the canvas',
    painted
  );
  check(
    (await page.evaluate(
      () => window.__zeroCheck.last?.images?.length || 0
    )) === 0,
    'Ordinary drawing example starts without image dependencies'
  );
  check(
    (await page.evaluate(() => window.__zeroCheck.errors)).length === 0,
    'No JavaScript errors in drawing'
  );
  await page.goto(urls.audio);
  await page.getByText(/^Audio checks ready:/).filter({ visible: true }).waitFor();
  await page.waitForFunction(() => window.__zeroCheck.last?.texts.some(text => text.startsWith('Audio API ready:')));
  check((await state()).texts.some(text => text.startsWith('Audio API ready:')), 'Seven-helper audio setup validates aliases, cache, ownership and volume errors');
  await page.getByRole('button', {name: 'Resume', exact: true}).click();
  await page.waitForFunction(() => window.__zeroCheck.last?.texts.includes('Music playing: true'));
  check((await state()).texts.includes('Independent playing: false'), 'Pre-ready pause and stop leave independent music stopped');
  const musicState = () => page.evaluate(() => {
    const audio = window.__zeroAudio.find(element => element.getAttribute('src') && element.volume === .19);
    return {playing: !audio.paused, time: audio.currentTime, muted: audio.muted, loop: audio.loop, volume: audio.volume};
  });
  let audioState = await musicState();
  check(audioState.playing && audioState.loop && audioState.muted && audioState.volume === .19, 'Music ready callback applies pre-ready intent and retained loop/volume');
  await page.getByRole('button', {name: 'Loop', exact: true}).click();
  await page.getByRole('button', {name: 'Play twice', exact: true}).click();
  await page.waitForFunction(() => window.__zeroAudio.filter(a => a.getAttribute('src') && a.volume === .23 && !a.paused).length === 2);
  await page.waitForFunction(() => window.__zeroCheck.last?.texts.includes('Effect playing: true'));
  check((await state()).texts.includes('Effect playing: true'), 'Overlapping effect voices report actual playing status');
  await page.getByRole('button', {name: 'Mute', exact: true}).click();
  await page.waitForFunction(() => window.__zeroCheck.last?.texts.includes('Effect playing: false'));
  audioState = await musicState();
  check(audioState.muted && audioState.volume === .19, 'Mute stops active effects and retains music volume');
  await page.getByRole('button', {name: 'Play twice', exact: true}).click();
  check((await page.evaluate(() => window.__zeroAudio.filter(a => a.getAttribute('src') && a.volume === .23 && !a.paused).length)) === 0, 'Muted effects do not create playing voices');
  await page.getByRole('button', {name: 'Mute', exact: true}).click();
  await page.evaluate(() => {
    window.__denyEffects = true;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() {
      return window.__denyEffects && this.volume === .23 ? Promise.reject(new DOMException('Gesture required', 'NotAllowedError')) : play.call(this);
    };
  });
  const beforeSpam = await page.evaluate(() => window.__zeroAudio.length);
  await page.getByRole('button', {name: 'Spam effects', exact: true}).click();
  await page.waitForFunction(() => document.body.innerText.includes('Click or press a key to enable sound.'));
  const afterSpam = await page.evaluate(() => ({created: window.__zeroAudio.length, pending: window.__zeroAudio.filter(a => a.getAttribute('src') && a.volume === .23).length}));
  check(afterSpam.created - beforeSpam <= 32 && afterSpam.pending === 1, 'Injected autoplay denial bounds 100 same-frame plays and coalesces pending voices', afterSpam);
  await page.getByRole('button', {name: 'Spam effects', exact: true}).click();
  check(await page.evaluate(count => window.__zeroAudio.length === count, afterSpam.created), 'Further blocked frames do not allocate additional voices');
  await page.evaluate(() => window.__denyEffects = false);
  await page.getByRole('button', {name: 'Mute', exact: true}).click();
  await page.getByRole('button', {name: 'Mute', exact: true}).click();
  await page.getByRole('button', {name: 'Pause', exact: true}).click();
  const heldAt = (await musicState()).time;
  await page.waitForTimeout(120);
  check(!(await musicState()).playing && Math.abs((await musicState()).time - heldAt) < .03, 'Music pause holds playback position');
  await page.getByRole('button', {name: 'Resume', exact: true}).click();
  await page.waitForTimeout(120);
  check((await musicState()).playing && Math.abs((await musicState()).time - heldAt) > .04, 'Music resumes from paused position');
  await page.getByRole('button', {name: 'Rewind', exact: true}).click();
  await page.waitForFunction(() => { const a = window.__zeroAudio.find(a => a.getAttribute('src') && a.volume === .19); return a.paused && a.currentTime < .03; });
  check(!(await musicState()).playing && (await musicState()).time < .03, 'Music stop rewinds without discarding loop mode');
  await page.getByRole('button', {name: 'Resume', exact: true}).click();
  await page.waitForTimeout(1150);
  check((await musicState()).playing && (await musicState()).loop, 'Music repeats through an actual audio end boundary');
  await page.getByRole('button', {name: 'Once', exact: true}).click();
  await page.waitForFunction(() => window.__zeroCheck.last?.texts.includes('Once playing: true'));
  await page.waitForFunction(() => window.__zeroCheck.last?.texts.includes('Once playing: false'));
  check(true, 'Natural end callback stops non-looping music status');
  await page.getByRole('button', {name: 'Once', exact: true}).click();
  await page.waitForFunction(() => window.__zeroCheck.last?.texts.includes('Once playing: true'));
  check(await page.evaluate(() => window.__zeroAudio.some(a => a.getAttribute('src') && a.volume === 1 && !a.paused && a.currentTime < .5)), 'Play after end rewinds and restarts');
  await page.getByRole('button', {name: 'Check error', exact: true}).click();
  await page.getByText('Named late failure: true', {exact: true}).filter({visible:true}).waitFor();
  check(true, 'Actual malformed audio callback preserves named Music failure');
  await page.evaluate(() => {
    const activeOnce = window.__zeroAudio.find(a => a.getAttribute('src') && a.volume === 1 && !a.paused);
    activeOnce.dispatchEvent(new Event('error'));
  });
  await page.getByRole('button', {name: 'Check late', exact: true}).click();
  await page.getByText('Named playing failure: true', {exact:true}).filter({visible:true}).waitFor();
  check((await musicState()).playing, 'Injected failure of playing music disposes only its player');
  await page.getByRole('button', {name: 'Stop app', exact: true}).click();
  await page.getByText('App cleanup: true', {exact:true}).filter({visible:true}).waitFor();
  check(await page.evaluate(() => window.__zeroAudio.every(a => a.paused && !a.getAttribute('src'))), 'App stop closes all effect voices and independent music');
  await page.reload();
  await page.getByText(/^Audio checks ready:/).filter({visible:true}).waitFor();
  await page.waitForFunction(() => window.__zeroCheck.last?.texts.some(text => text.startsWith('Audio API ready:')));
  await page.getByRole('button', {name: 'Loop', exact: true}).click();
  await page.getByRole('button', {name: 'Resume', exact: true}).click();
  await page.getByRole('button', {name: 'Once', exact: true}).click();
  await page.waitForFunction(() => window.__zeroCheck.last?.texts.includes('Music playing: true') && window.__zeroCheck.last?.texts.includes('Once playing: true'));
  await page.getByRole('button', {name: 'Pause', exact: true}).click();
  await page.waitForFunction(() => window.__zeroCheck.last?.texts.includes('Music playing: false'));
  check((await state()).texts.includes('Once playing: true'), 'Independent music keeps playing when another player pauses');
  await page.getByRole('button', {name: 'Resume', exact: true}).click();
  await page.waitForFunction(() => window.__zeroCheck.last?.texts.includes('Music playing: true'));
  const beforePersisted = await page.evaluate(() => {
    const sources = window.__zeroAudio.filter(a => a.getAttribute('src'));
    window.__retainedAudio = sources.map(a => ({audio: a, source: a.getAttribute('src')}));
    window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted: true}));
    return {draws: window.__zeroCheck.draws, time: sources.find(a => a.volume === .19).currentTime};
  });
  check(await page.evaluate(() => window.__retainedAudio.every(({audio, source}) => audio.paused && audio.getAttribute('src') === source)), 'Persisted pagehide pauses audio and retains every player source');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true})));
  await page.waitForFunction(before => window.__zeroCheck.draws > before + 5, beforePersisted.draws);
  const restoredDraws = await page.evaluate(() => window.__zeroCheck.draws);
  check(restoredDraws > beforePersisted.draws, 'Ordinary GameApp drawing continues after persisted pagehide and pageshow', {before: beforePersisted.draws, after: restoredDraws});
  await page.waitForTimeout(100);
  check(!(await musicState()).playing && Math.abs((await musicState()).time - beforePersisted.time) < .03, 'Restored music stays paused at its retained position');
  await page.getByRole('button', {name: 'Resume', exact: true}).click();
  await page.waitForFunction(() => window.__zeroCheck.last?.texts.includes('Music playing: true'));
  check((await state()).texts.includes('Once playing: false'), 'Restored music resumes independently without restarting another player');
  await page.getByRole('button', {name: 'Once', exact: true}).click();
  await page.waitForFunction(() => window.__zeroCheck.last?.texts.includes('Once playing: true'));
  check((await musicState()).playing, 'Second retained Music remains usable after restore');
  await page.getByRole('button', {name: 'Play twice', exact: true}).click();
  await page.waitForFunction(() => window.__zeroCheck.last?.texts.includes('Effect playing: true'));
  check(true, 'Retained Sound can play after restore');
  const finalDraws = await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted: false}));
    return window.__zeroCheck.draws;
  });
  check(await page.evaluate(() => window.__zeroAudio.every(a => a.paused && !a.getAttribute('src'))), 'Non-persisted pagehide still invokes app-owned cleanup after restore');
  await page.waitForTimeout(100);
  check(await page.evaluate(before => window.__zeroCheck.draws === before, finalDraws), 'Non-persisted pagehide stops the GameApp timer');
  check((await page.evaluate(() => window.__zeroCheck.errors)).length === 0, 'No JavaScript errors in audio fixture');
  await page.goto(urls.hello);
  await page.locator('input[type="text"]').fill('Ada');
  await page.getByRole('button',{name:'Say hello',exact:true}).click();
  await visibleText('Hello, Ada!').waitFor();
  check(true,'Ordinary greeting controls render and handle text/button input');
  await page.locator('input[type="text"]').fill('Grace');
  await page.locator('input[type="text"]').press('Enter');
  await visibleText('Hello, Grace!').waitFor();
  check(true,'Ordinary TextField action handles Enter');
  await page.getByRole('button',{name:'Start again',exact:true}).click();
  await visibleText('Your greeting will appear here.').waitFor();
  check(await page.locator('input[type="text"]').inputValue()==='','Greeting reset preserves ordinary object updates');
  const resourceLabel = page.getByText(/^Resource: /).filter({visible:true});
  await resourceLabel.waitFor();
  const displayedResource = (await resourceLabel.innerText()).slice('Resource: '.length);
  const resourceUrl = new URL(displayedResource, page.url());
  const resourceResponse = await page.request.get(resourceUrl.href);
  check(resourceUrl.pathname.endsWith('/hello-app/theme.css') && resourceResponse.status() === 200,
    'Cross-file resource URL with inferred var resolves packaged data (no CSS styling claim)',
    {url:resourceUrl.href,status:resourceResponse.status()});
  check((await page.evaluate(()=>window.__zeroCheck.errors)).length===0,'No JavaScript errors in greeting/resource probe');
  await page.setViewportSize({width:260,height:360});
  await page.goto(urls['zero-ui']);
  await visibleText('Probe title').waitFor();
  await visibleText('TextField checks ready').waitFor();
  const zeroName = page.locator('input[type="text"]');
  check(await zeroName.inputValue() === '', 'Zero TextField constructor, prompt and setter/error checks pass');
  await zeroName.click();
  await zeroName.press('Tab');
  await page.getByPlaceholder('Your name', {exact:true}).waitFor();
  check(true, 'An empty unfocused Zero TextField displays its prompt');
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'button' && document.activeElement?.textContent?.includes('Greet probe'));
  check(true, 'Tab skips the disabled button and focuses the next enabled Zero button');
  await page.keyboard.press('Shift+Tab');
  await page.waitForFunction(() => document.activeElement?.matches('input[type="text"]'));
  check(true, 'Shift+Tab skips the disabled button and returns to the Zero text field');
  await zeroName.click();
  await zeroName.pressSequentially('Sam');
  check(await zeroName.inputValue() === 'Sam', 'Typing edits the Zero TextField');
  await zeroName.press('Tab');
  await page.keyboard.press('Space');
  await visibleText('Hello, Sam!').waitFor();
  check(true, 'Tab reaches Zero Button and keyboard activation reads typed TextField text');
  await zeroName.fill('Ada');
  await page.getByRole('button', {name:'Greet probe', exact:true}).click();
  await visibleText('Hello, Ada!').waitFor();
  check(true, 'Zero Button callback reads the current field text on each activation');
  await visibleText('Greeting actions: 2').waitFor();
  await page.getByRole('button', {name:'Disable greeting controls', exact:true}).click();
  await zeroName.waitFor({state:'visible'});
  await page.waitForFunction(() => document.querySelector('input[type="text"]')?.disabled === true);
  const disabledGreet = page.getByRole('button', {name:'Greet probe', exact:true});
  await page.waitForFunction(() => [...document.querySelectorAll('[role="button"]')]
    .some(button => button.textContent.includes('Greet probe') && button.getAttribute('aria-disabled') === 'true'));
  const disabledGreetBox = await disabledGreet.boundingBox();
  await page.mouse.click(disabledGreetBox.x + disabledGreetBox.width / 2, disabledGreetBox.y + disabledGreetBox.height / 2);
  const disabledNameBox = await zeroName.boundingBox();
  await page.mouse.click(disabledNameBox.x + disabledNameBox.width / 2, disabledNameBox.y + disabledNameBox.height / 2);
  await page.keyboard.type('blocked');
  check(await zeroName.inputValue() === 'Ada' && await visibleText('Greeting actions: 2').isVisible(),
    'Disabled Zero TextField blocks typing and disabled Button blocks mouse activation without losing state');
  await page.getByRole('button', {name:'Enable greeting controls', exact:true}).click();
  await page.waitForFunction(() => document.querySelector('input[type="text"]')?.disabled === false);
  await zeroName.click();
  await zeroName.press('End');
  await zeroName.pressSequentially('!');
  await page.getByRole('button', {name:'Greet probe', exact:true}).click();
  await visibleText('Hello, Ada!!').waitFor();
  await visibleText('Greeting actions: 3').waitFor();
  check(true, 'Re-enabling existing controls restores editing and the retained button action');
  await page.getByRole('button', {name:'Disable input group', exact:true}).click();
  await page.waitForFunction(() => document.querySelector('input[type="text"]')?.disabled === true);
  await page.getByRole('button', {name:'Enable children inside group', exact:true}).click();
  check(await zeroName.isDisabled(), 'A child enabled directly remains disabled under its disabled Column');
  const groupGreetBox = await page.getByRole('button', {name:'Greet probe', exact:true}).boundingBox();
  await page.mouse.click(groupGreetBox.x + groupGreetBox.width / 2, groupGreetBox.y + groupGreetBox.height / 2);
  const groupNameBox = await zeroName.boundingBox();
  await page.mouse.click(groupNameBox.x + groupNameBox.width / 2, groupNameBox.y + groupNameBox.height / 2);
  await page.keyboard.type('blocked');
  check(await zeroName.inputValue() === 'Ada!' && await visibleText('Greeting actions: 3').isVisible(),
    'A disabled Column blocks actual descendant typing and button activation while preserving state');
  check(await page.getByRole('button', {name:'Enable greeting controls', exact:true}).count() === 0,
    'Disabling a Column preserves the controls own enabled flags');
  await page.getByRole('button', {name:'Disable greeting controls', exact:true}).focus();
  await page.keyboard.press('Shift+Tab');
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'button' && document.activeElement?.textContent?.includes('Play probe'));
  check(true, 'Keyboard traversal skips all descendants of the disabled Column');
  await page.getByRole('button', {name:'Enable input group', exact:true}).click();
  await page.waitForFunction(() => document.querySelector('input[type="text"]')?.disabled === false);
  check(await page.getByRole('button', {name:'Disabled greeting action', exact:true}).isDisabled(),
    'Re-enabling a Column preserves a child that was disabled separately');
  await zeroName.click();
  await zeroName.press('End');
  await zeroName.pressSequentially('!');
  await page.getByRole('button', {name:'Greet probe', exact:true}).click();
  await visibleText('Hello, Ada!!!').waitFor();
  await visibleText('Greeting actions: 4').waitFor();
  check(true, 'Re-enabling a Column restores descendant editing and the retained button action');
  await page.getByRole('button', {name:'Show initially disabled group', exact:true}).click();
  await visibleText('Initially disabled group').waitFor();
  await page.waitForFunction(() => document.querySelector('input[type="text"]')?.disabled === true);
  const mountedName = page.locator('input[type="text"]');
  check(await mountedName.inputValue() === 'Retained', 'An initially disabled Column applies to newly mounted children');
  const mountedBox = await page.getByRole('button', {name:'Mounted group action', exact:true}).boundingBox();
  await page.mouse.click(mountedBox.x + mountedBox.width / 2, mountedBox.y + mountedBox.height / 2);
  check(await visibleText('Mounted group actions: 0').isVisible(), 'A newly mounted disabled child cannot activate');
  await page.getByRole('button', {name:'Enable mounted group', exact:true}).click();
  await page.waitForFunction(() => document.querySelector('input[type="text"]')?.disabled === false);
  await page.getByRole('button', {name:'Mounted group action', exact:true}).click();
  await visibleText('Mounted group actions: 1').waitFor();
  check(true, 'Newly mounted children become interactive when their Column is enabled');
  await page.getByRole('button', {name:'Return to probe title', exact:true}).click();
  await visibleText('Probe title').waitFor();
  await page.waitForTimeout(100);
  const initialIdle = await page.evaluate(() => window.__zeroCheck.clears);
  await page.waitForTimeout(120);
  check(await page.evaluate(() => window.__zeroCheck.clears) === initialIdle,
    'A title shown during setup leaves update and draw idle');
  await page.getByRole('button', {name:'Play probe', exact:true}).click();
  await visibleText('Zero UI ready').waitFor();
  await visibleText('Input reset check ready').waitFor();
  const smallCanvas = await page.locator('canvas').boundingBox();
  const smallHud = await visibleText('Input reset check ready').boundingBox();
  check(smallCanvas.x >= -1 && smallCanvas.y >= -1 && smallCanvas.x+smallCanvas.width <= 261
      && smallHud.y+smallHud.height <= 361,
    'Initial title reserves a fitted full game and complete HUD on a small viewport', {canvas:smallCanvas,hud:smallHud});
  await page.mouse.move(smallCanvas.x+smallCanvas.width*.75,smallCanvas.y+smallCanvas.height*.75);
  await page.waitForFunction(() => {
    const text = [...window.__zeroCheck.texts,...(window.__zeroCheck.last?.texts || [])].find(t => t.startsWith('Zero UI pointer: '));
    const point = text?.slice('Zero UI pointer: '.length).split(',').map(Number);
    return point && Math.abs(point[0]-240) <= 2 && Math.abs(point[1]-135) <= 2;
  });
  check(true, 'Title-to-game navigation retains the fitted canvas input transform');
  await page.setViewportSize({width:1280,height:900});
  await page.waitForTimeout(100);
  const uiFrameCount = async () => Number((await state()).texts.find(t => t.startsWith('Zero UI frames: ')).split(': ')[1]);
  await page.waitForFunction(() => window.__zeroCheck.last?.texts.some(t => t.startsWith('Zero UI frames: ')));
  const uiBefore = await uiFrameCount();
  for (let i = 1; i <= 2; i++) {
    await page.getByRole('button', {name:'Zero button', exact:true}).click();
    await visibleText('Zero clicks: ' + i).waitFor();
  }
  check(await uiFrameCount() > uiBefore, 'Zero button callback replacement and label mutation preserve GameApp frames');
  const uiCanvas = page.locator('canvas');
  const uiBox = await uiCanvas.boundingBox();
  const zeroInputState = async () => page.evaluate(() => {
    const texts = window.__zeroCheck.last?.texts || [];
    return {
      mask: Number(texts.find(text => text.startsWith('Zero key mask: '))?.slice('Zero key mask: '.length)),
      edges: texts.find(text => text.startsWith('Zero key edges: '))?.slice('Zero key edges: '.length).split(',').map(Number)
    };
  });
  const waitZeroInput = async (mask, index, edges) => page.waitForFunction(([expectedMask, keyIndex, expectedEdges]) => {
    const texts = window.__zeroCheck.last?.texts || [];
    const actualMask = Number(texts.find(text => text.startsWith('Zero key mask: '))?.slice('Zero key mask: '.length));
    const actualEdges = texts.find(text => text.startsWith('Zero key edges: '))?.slice('Zero key edges: '.length).split(',').map(Number);
    return actualMask === expectedMask && actualEdges?.[keyIndex] === expectedEdges;
  }, [mask, index, edges]);
  await uiCanvas.click({position:{x:uiBox.width / 2,y:uiBox.height / 2}});
  for (const [index, code] of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].entries()) {
    const before = await zeroInputState();
    await page.keyboard.down(code);
    await waitZeroInput(1 << index, index, before.edges[index] + 1);
    await page.keyboard.down(code);
    const repeatedAt = await uiFrameCount();
    await page.waitForFunction(frame => Number(window.__zeroCheck.last?.texts.find(text => text.startsWith('Zero UI frames: '))?.split(': ')[1]) > frame + 2, repeatedAt);
    check((await zeroInputState()).edges[index] === before.edges[index] + 1,
      code + ' held/repeated key events produce one non-consuming Zero edge');
    await page.keyboard.up(code);
    await waitZeroInput(0, index, before.edges[index] + 1);
  }
  const beforeControl = await zeroInputState();
  await page.getByRole('button', {name:'Zero button', exact:true}).focus();
  const controlAt = await uiFrameCount();
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(frame => Number(window.__zeroCheck.last?.texts.find(text => text.startsWith('Zero UI frames: '))?.split(': ')[1]) > frame + 2, controlAt);
  await waitZeroInput(0, 0, beforeControl.edges[0]);
  await page.keyboard.up('ArrowLeft');
  check(true, 'Focused UI controls keep arrow keys out of Zero canvas input');
  await uiCanvas.click({position:{x:uiBox.width / 2,y:uiBox.height / 2}});
  const beforeBlur = await zeroInputState();
  await page.keyboard.down('ArrowUp');
  await waitZeroInput(4, 2, beforeBlur.edges[2] + 1);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await waitZeroInput(0, 2, beforeBlur.edges[2] + 1);
  await page.keyboard.up('ArrowUp');
  check(true, 'Synthetic browser blur clears Zero held arrow input without replaying edges');
  await page.mouse.move(uiBox.x + uiBox.width * .75, uiBox.y + uiBox.height * .75);
  await page.waitForFunction(() => {
    const text = window.__zeroCheck.last?.texts.find(t => t.startsWith('Zero UI pointer: '));
    const point = text?.slice('Zero UI pointer: '.length).split(',').map(Number);
    return point && Math.abs(point[0]-240) <= 2 && Math.abs(point[1]-135) <= 2;
  });
  check(true, 'Zero HUD keeps canvas pointer input live');
  const uiPixels = await uiCanvas.evaluate(canvas => {
    const bounds = canvas.getBoundingClientRect();
    return [[20,80],[50,80],[80,80],[100,80],[140,80]].map(([x,y]) => Array.from(canvas.getContext('2d').getImageData(
      Math.floor(x * canvas.width / bounds.width), Math.floor(y * canvas.height / bounds.height),1,1).data));
  });
  check(JSON.stringify(uiPixels) === '[[17,99,203,255],[0,0,255,255],[255,215,0,255],[0,0,0,255],[255,255,255,255]]',
    'Zero Color RGB, BLUE, GOLD, BLACK stroke and WHITE background render exact pixels', uiPixels);
  const beforeReplacement = await uiFrameCount();
  await page.getByRole('button', {name:'Replace controls', exact:true}).click();
  await visibleText('Replacement HUD').waitFor();
  await page.waitForFunction(before => Number(window.__zeroCheck.last?.texts.find(t => t.startsWith('Zero UI frames: '))?.split(': ')[1]) > before + 2, beforeReplacement);
  check(await page.getByRole('button', {name:'Zero button', exact:true}).count() === 0,
    'GameApp controls replacement removes old HUD while drawing continues');
  const probeState = async () => page.evaluate(() => {
    const text = [...window.__zeroCheck.texts, ...(window.__zeroCheck.last?.texts || [])].find(t => t.startsWith('Probe state: '));
    return text?.slice('Probe state: '.length).split(',');
  });
  await page.getByRole('button', {name:'Pause frame loop', exact:true}).click();
  await page.waitForTimeout(100);
  const pausedState = await probeState();
  await page.waitForTimeout(120);
  const stillPausedState = await probeState();
  check(pausedState[0] === stillPausedState[0] && Number(stillPausedState[1]) > Number(pausedState[1]) && stillPausedState[2] === 'true',
    'Explicit pause freezes update while draw continues');
  await page.getByRole('button', {name:'Open probe menu', exact:true}).click();
  await visibleText('Probe menu').waitFor();
  const idleMenu = await page.evaluate(() => window.__zeroCheck.clears);
  await page.waitForTimeout(120);
  check(await page.evaluate(() => window.__zeroCheck.clears) === idleMenu,
    'A menu suspends game update and drawing');
  await page.keyboard.down('a');
  await page.getByRole('button', {name:'Return to probe game', exact:true}).click();
  await visibleText('Replacement HUD').waitFor();
  await page.waitForTimeout(100);
  const returnedPaused = await probeState();
  check(returnedPaused[0] === stillPausedState[0] && returnedPaused[2] === 'true',
    'showGame preserves the retained HUD and independent explicit pause');
  await page.getByRole('button', {name:'Resume frame loop', exact:true}).click();
  await page.keyboard.up('a');
  await visibleText('Resume checks ready').waitFor();
  await page.waitForFunction(before => {
    const text = [...window.__zeroCheck.texts, ...(window.__zeroCheck.last?.texts || [])].find(t => t.startsWith('Probe state: '));
    return text && Number(text.slice('Probe state: '.length).split(',')[0]) > before;
  }, Number(returnedPaused[0]));
  check(true, 'Resume starts with zero delta and cleared input after an idle UI callback');
  await page.getByRole('button', {name:'Defer probe view', exact:true}).click();
  await visibleText('Deferred view').waitFor();
  check(await page.evaluate(() => window.__zeroCheck.deferredHiddenDuringDraw === true
      && window.__zeroCheck.texts.includes('Deferred draw completed')),
    'Navigation requested inside update commits after its final draw');
  const deferredIdle = await page.evaluate(() => window.__zeroCheck.clears);
  await page.waitForTimeout(120);
  check(await page.evaluate(() => window.__zeroCheck.clears) === deferredIdle, 'Deferred navigation leaves no hidden game frames');
  await page.getByRole('button', {name:'Return to probe game', exact:true}).click();
  await visibleText('Replacement HUD').waitFor();
  await page.getByRole('button', {name:'Open probe menu', exact:true}).click();
  await visibleText('Probe menu').waitFor();
  await page.getByRole('button', {name:'Probe title screen', exact:true}).click();
  await visibleText('Probe title').waitFor();
  await page.getByRole('button', {name:'Play probe', exact:true}).click();
  await visibleText('Replacement HUD').waitFor();
  check(true, 'Ordinary title and menu views keep their callbacks functional while idle');
  check((await page.evaluate(() => window.__zeroCheck.errors)).length === 0, 'No JavaScript errors in Zero UI fixture');
  await page.goto(urls.counter);
  await visibleText('Score: 0').waitFor();
  await page.getByRole('button', {name:'Add one', exact:true}).click();
  await visibleText('Score: 1').waitFor();
  await page.getByRole('button', {name:'Add one', exact:true}).click();
  await visibleText('Score: 2').waitFor();
  await page.getByRole('button', {name:'Reset', exact:true}).click();
  await visibleText('Score: 0').waitFor();
  await page.getByRole('button', {name:'Add one', exact:true}).click();
  await visibleText('Score: 1').waitFor();
  check((await page.evaluate(() => window.__zeroCheck.errors)).length === 0, 'Java-and-Zero-only counter updates and resets shared ScoreDisplay');
  await page.goto(urls['coin-game']);
  await visibleText('COIN QUEST').waitFor();
  await page.screenshot({path:artifactRoot + '/coin-title.png'});
  const titleClears = await page.evaluate(() => window.__zeroCheck.clears);
  await page.waitForTimeout(150);
  check(await page.evaluate(() => window.__zeroCheck.clears) === titleClears, 'Coin Quest title is idle before Play');
  await page.getByRole('button', {name:'How to play', exact:true}).click();
  await visibleText('How to play').waitFor();
  await page.getByRole('button', {name:'Back', exact:true}).click();
  await visibleText('COIN QUEST').waitFor();
  await page.getByRole('button', {name:'Play', exact:true}).click();
  await visibleText('Score: 0').waitFor();
  await visibleText('Level 1 of 2 — collect 3 coins.').waitFor();
  await page.waitForTimeout(150);
  check(await visibleText('Score: 0').count() === 1, 'Help/back/Play starts a quiet zero-score game');
  const moveToCoin = async (x,y) => {
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.move(box.x + x * box.width / 640, box.y + y * box.height / 360);
  };
  await moveToCoin(120,80);
  await visibleText('Score: 1').waitFor();
  await page.getByRole('button', {name:'Pause', exact:true}).click();
  await visibleText('Paused').waitFor();
  await page.screenshot({path:artifactRoot + '/coin-paused.png'});
  const pausedTimer = await page.getByText(/^Time left: /).filter({visible:true}).innerText();
  const pausedClears = await page.evaluate(() => window.__zeroCheck.clears);
  await page.waitForTimeout(1200);
  check(await page.evaluate(() => window.__zeroCheck.clears) === pausedClears
      && await visibleText('Score: 1 / 6').count() === 1
      && await page.getByText(/^Time left: /).filter({visible:true}).innerText() === pausedTimer,
    'Pause menu freezes canvas, score and active countdown');
  await page.getByRole('button', {name:'Resume', exact:true}).click();
  await visibleText('Score: 1').waitFor();
  await page.waitForTimeout(150);
  check(await visibleText('Score: 1').count() === 1
      && await page.getByText(/^Time left: /).filter({visible:true}).innerText() === pausedTimer,
    'Resume preserves level, score and timer and waits for fresh pointer movement');
  await page.getByRole('button', {name:'Pause', exact:true}).click();
  await visibleText('Paused').waitFor();
  await page.getByRole('button', {name:'Restart game', exact:true}).click();
  await visibleText('Score: 0').waitFor();
  await visibleText('Time left: 30s').waitFor();
  check(true, 'Pause-menu restart begins a fresh first level');
  for (let cycle = 0; cycle < 2; cycle++) {
    if (cycle) {
      await page.getByRole('button', {name:'Play again', exact:true}).click();
      await visibleText('Score: 0').waitFor();
      await visibleText('Level 1 of 2 — collect 3 coins.').waitFor();
      await page.waitForTimeout(150);
      check(await visibleText('Score: 0').count() === 1, 'Play again resets both levels and keeps quiet-start score zero');
    }
    await moveToCoin(60,300);
    await page.waitForTimeout(60);
    for (const [level,coins] of [[[120,80],[320,260],[520,80]],[[120,260],[320,80],[520,260]]].entries()) {
      await visibleText('Level ' + (level+1) + ' of 2 — collect 3 coins.').waitFor();
      for (const [index,[x,y]] of coins.entries()) {
        await moveToCoin(x,y);
        const score = level*3+index+1;
        if (score < 6) await visibleText('Score: '+score).waitFor();
        else await visibleText('Final score: 6 / 6').waitFor();
      }
    }
    await visibleText('You win!').waitFor();
    if (cycle === 0) await page.screenshot({path:artifactRoot + '/coin-win.png'});
    check(true, 'Coin Quest completes both levels and wins cycle ' + (cycle+1));
  }
  await page.getByRole('button', {name:'Title screen', exact:true}).click();
  await visibleText('COIN QUEST').waitFor();
  await page.getByRole('button', {name:'Play', exact:true}).click();
  await visibleText('Score: 0').waitFor();
  await moveToCoin(48,300);
  await visibleText("Time's up!").waitFor({timeout:40000});
  await visibleText('Final score: 0 / 6').waitFor();
  check(true, 'Thirty real active seconds end in the failure results view');
  await page.getByRole('button', {name:'Play again', exact:true}).click();
  await visibleText('Score: 0').waitFor();
  await visibleText('Time left: 30s').waitFor();
  check(true, 'Failure results can replay into a fresh game');
  check((await page.evaluate(() => window.__zeroCheck.errors)).length === 0, 'No JavaScript errors in fuller coin-game prototype');
  return {
    status: 'passed',
    results,
    browser: await page.evaluate(() => navigator.userAgent),
    scope:
      'Nested preview paths; physical tab switching and other browser engines need separate verification.'
  };
};
