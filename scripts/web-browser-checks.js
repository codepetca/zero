// Loaded by the pinned Playwright CLI as an async function, not a test-runner spec.
async (page) => {
  const urls = __URLS__;
  const results = [];
  // JavaFX label peers also have aria-hidden text measurement nodes.
  const visibleText = (text) =>
    page.getByText(text, { exact: true }).filter({ visible: true });
  const check = (condition, name, data) => {
    results.push({ name, pass: !!condition, data });
    if (!condition) throw new Error(JSON.stringify(results));
  };
  await page.addInitScript(() => {
    window.__zeroCheck = { texts: [], images: [], last: null, errors: [] };
    addEventListener('error', (event) =>
      window.__zeroCheck.errors.push(event.message)
    );
    const p = CanvasRenderingContext2D.prototype,
      clear = p.clearRect,
      text = p.fillText,
      image = p.drawImage;
    p.clearRect = function (...args) {
      const c = window.__zeroCheck;
      if (c.texts.length) c.last = { texts: c.texts, images: c.images };
      c.texts = [];
      c.images = [];
      return clear.apply(this, args);
    };
    p.fillText = function (...args) {
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
  check(
    s.images.length === 12,
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
  return {
    status: 'passed',
    results,
    browser: await page.evaluate(() => navigator.userAgent),
    scope:
      'Nested preview paths; physical tab switching and other browser engines need separate verification.'
  };
};
