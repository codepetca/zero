// Loaded by the existing pinned Playwright CLI; all state comes from ordinary Java draw().
async (page) => {
  const urls = __URLS__;
  const artifactRoot = __ARTIFACT_ROOT__;
  const results = [];
  const check = (pass, name, data) => {
    results.push({ name, pass: !!pass, data });
    if (!pass) throw new Error(JSON.stringify(results));
  };
  await page.addInitScript(() => {
    window.__mobileCheck = { texts: [], last: [], errors: [] };
    addEventListener('pointerdown', event => { if (event.pointerType === 'touch') window.__activeTouchId = event.pointerId; }, true);
    addEventListener('error', event => window.__mobileCheck.errors.push(event.message));
    const p = CanvasRenderingContext2D.prototype, clear = p.clearRect, fill = p.fillText;
    p.clearRect = function(...args) {
      const state = window.__mobileCheck;
      if (state.texts.length) state.last = state.texts;
      state.texts = [];
      return clear.apply(this, args);
    };
    p.fillText = function(...args) {
      window.__mobileCheck.texts.push(String(args[0]));
      return fill.apply(this, args);
    };
  });
  const state = () => page.evaluate(() => {
    const text = window.__mobileCheck.last.find(value => value.startsWith('Mobile state: '));
    return text?.slice(14).split(',').map(value => value === 'true' ? true : value === 'false' ? false : Number(value));
  });
  const settle = () => page.waitForTimeout(100);
  const waitState = async (index, value) => {
    await page.waitForFunction(({ index, value }) => {
      const text = window.__mobileCheck.last.find(value => value.startsWith('Mobile state: '));
      return text?.slice(14).split(',')[index] === String(value);
    }, { index, value });
    return state();
  };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const point = (x, y, id = 1) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 });
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const canvasPoint = async (x, y, width, height) => {
    const box = await page.locator('canvas').boundingBox();
    return point(box.x + x * box.width / width, box.y + y * box.height / height);
  };
  try {
    for (const [fixture, width, height, padding] of [['helpers', 480, 400, 0], ['mobile', 360, 640, 12]]) {
      await page.setViewportSize({ width: 1200, height: 1000 });
      await page.goto(urls[fixture]);
      await page.waitForFunction(() => window.__mobileCheck.last.some(value => value.startsWith('Mobile state: ')));
      const canvas = page.locator('canvas');
      const input = page.locator('input[type="text"]');
      const button = page.getByRole('button', { name: 'Greet mobile', exact: true });
      const dimensions = await canvas.evaluate(canvas => ({ width: canvas.width, height: canvas.height }));
      const desktopCanvas = await canvas.boundingBox();
      const desktopButton = fixture === 'mobile' ? await button.boundingBox() : null;
      const logicalHeight = desktopButton ? desktopButton.y + desktopButton.height - desktopCanvas.y + padding : height;
      const logicalWidth = width + 2 * padding;
      check(Math.abs(desktopCanvas.width - width) < 1 && Math.abs(desktopCanvas.height - height) < 1,
        fixture + ': desktop preserves fixed canvas size');
      // Synthetic CSS values exercise the fit arithmetic. This does not prove
      // physical phone notch behavior or the browser's env(safe-area-inset-*) values.
      await page.setViewportSize({width:390,height:844});
      const syntheticInsets = {left:17,right:29,top:23,bottom:31};
      const previousInsets = await page.evaluate(insets => {
        const style = document.documentElement.style;
        const previous = {};
        for (const [side,value] of Object.entries(insets)) {
          const property = '--safe-area-inset-' + side;
          previous[property] = {value:style.getPropertyValue(property),priority:style.getPropertyPriority(property)};
          style.setProperty(property,value + 'px');
        }
        window.dispatchEvent(new Event('resize'));
        return previous;
      },syntheticInsets);
      try {
        await settle();
        const box = await canvas.boundingBox();
        const inner = {x:17,y:23,width:390-17-29,height:844-23-31};
        const outerHeight = logicalHeight + padding;
        const scale = Math.min(1,inner.width/logicalWidth,inner.height/outerHeight);
        const content = {x:box.x-padding*scale,y:box.y-padding*scale,width:logicalWidth*scale,height:outerHeight*scale};
        const inside = bounds => bounds.x >= inner.x-.5 && bounds.y >= inner.y-.5
          && bounds.x+bounds.width <= inner.x+inner.width+.5 && bounds.y+bounds.height <= inner.y+inner.height+.5;
        check(Math.abs(box.width/width-scale)<.015 && Math.abs(box.height/height-scale)<.015,
          fixture + ': synthetic safe-area CSS insets determine shrink-only aspect fit', {box,scale,inner});
        check(inside(box) && inside(content)
          && Math.abs(content.x+content.width/2-inner.x-inner.width/2)<2
          && Math.abs(content.y+content.height/2-inner.y-inner.height/2)<2,
          fixture + ': synthetic safe-area inner rectangle contains and centers the whole padded content', {content,box,inner});
        if (desktopButton) {
          for (const control of [input,button]) {
            const bounds = await control.boundingBox();
            check(inside(bounds),'Portrait ordinary control fits synthetic safe-area inner rectangle',bounds);
          }
        }
      } finally {
        await page.evaluate(previous => {
          const style = document.documentElement.style;
          for (const [property,{value,priority}] of Object.entries(previous)) {
            if (value) style.setProperty(property,value,priority);
            else style.removeProperty(property);
          }
          window.dispatchEvent(new Event('resize'));
        },previousInsets);
        await settle();
      }
      for (const viewport of [{width:390,height:844}, {width:740,height:320}, {width:360,height:640}, {width:1200,height:1000}]) {
        await page.setViewportSize(viewport);
        await settle();
        const box = await canvas.boundingBox();
        const scale = Math.min(1, viewport.width / logicalWidth, viewport.height / (logicalHeight + padding));
        const s = await state();
        const backing = await canvas.evaluate(canvas => ({width:canvas.width,height:canvas.height,touch:getComputedStyle(canvas).touchAction}));
        check(s[8] === width && s[9] === height && backing.width === dimensions.width && backing.height === dimensions.height,
          fixture + ': logical and backing dimensions survive viewport ' + JSON.stringify(viewport), {s,backing});
        check(Math.abs(box.width / width - box.height / height) < .005 && Math.abs(box.width / width - scale) < .015,
          fixture + ': aspect fit and shrink-only scale ' + JSON.stringify(viewport), {box,scale,logicalHeight});
        check(box.x >= -.5 && box.y >= -.5 && box.x + box.width <= viewport.width + .5 && box.y + box.height <= viewport.height + .5
          && Math.abs(box.x + box.width / 2 - viewport.width / 2) < 2,
          fixture + ': centered canvas stays on screen', box);
        check(Math.abs(box.y - padding * scale + (logicalHeight + padding) * scale / 2 - viewport.height / 2) < 2,
          fixture + ': whole padded content remains vertically centered', {box,scale,logicalHeight});
        check(backing.touch === 'none', fixture + ': browser gestures disabled on canvas only', backing.touch);
        if (desktopButton) {
          for (const control of [input, button]) {
            const bounds = await control.boundingBox();
            check(bounds.x >= -.5 && bounds.y >= -.5 && bounds.x + bounds.width <= viewport.width + .5 && bounds.y + bounds.height <= viewport.height + .5,
              'Portrait ordinary control fits viewport', bounds);
            check(bounds.y >= box.y + box.height - 1, 'Portrait controls retain position below canvas', bounds);
          }
        }
        if ((viewport.width === 390 && viewport.height === 844) || (viewport.width === 740 && viewport.height === 320)) {
          const screenshot = artifactRoot + '/' + fixture + '-' + (viewport.width === 390 ? 'phone-portrait' : 'short-landscape') + '.png';
          await page.screenshot({path:screenshot,fullPage:true});
          check(true,fixture + ': saved viewport evidence screenshot',screenshot);
        }
        for (const [x,y] of [[8,8], [width / 2,height / 2], [width - 8,height - 8]]) {
          const before = await state(), at = await canvasPoint(x,y,width,height);
          await touch('touchStart', [at]);
          await waitState(3, true);
          await touch('touchEnd', []);
          const after = await waitState(3, false);
          check(after[0] === before[0] + 1 && Math.abs(after[6]-x) <= 2 && Math.abs(after[7]-y) <= 2,
            fixture + ': real CDP touch maps logical corner/center exactly once', {x,y,before,after});
        }
        const beforeQuick = await state(), quick = await canvasPoint(width/2,height/2,width,height);
        await touch('touchStart',[quick]);
        await touch('touchEnd',[]);
        await waitState(0,beforeQuick[0]+1);
        const afterQuick = await state();
        check(!afterQuick[3] && Math.abs(afterQuick[6]-width/2)<=2 && Math.abs(afterQuick[7]-height/2)<=2,
          fixture + ': short touch without a render wait retains one press and logical release coordinates', {beforeQuick,afterQuick});
      }
      await page.setViewportSize({width:740,height:320});
      await settle();
      let before = await state(), at = await canvasPoint(width/2,height/2,width,height);
      await touch('touchStart', [at]);
      await waitState(3,true);
      await touch('touchMove', [point(1,1)]);
      await settle();
      let held = await state();
      check(held[0] === before[0]+1 && held[3] === true && (held[6] < 0 || held[7] < 0), fixture + ': captured real touch drag stays held outside canvas', held);
      await touch('touchEnd', []);
      await waitState(3,false);
      check((await state())[0] === before[0]+1, fixture + ': outside release does not create another press');
      before = await state();
      at = await canvasPoint(width/2,height/2,width,height);
      await touch('touchStart',[at]);
      await waitState(3,true);
      await touch('touchStart',[at, point(at.x+15,at.y+15,2)]);
      await settle();
      const twoContacts = await state();
      check(twoContacts[0] === before[0]+1 && Math.abs(twoContacts[6]-width/2) <= 2 && Math.abs(twoContacts[7]-height/2) <= 2,
        fixture + ': secondary real contact does not press or move primary input', twoContacts);
      await touch('touchEnd',[at]);
      await settle();
      check((await state())[3] === true, fixture + ': secondary contact release leaves owned touch held');
      await touch('touchEnd',[]);
      await waitState(3,false);
      // CDP produces actual touch/pointer dispatch above. Cancellation/lost capture
      // and lifecycle transitions below are explicitly synthetic failure paths.
      for (const event of ['pointercancel','lostpointercapture','blur','pagehide']) {
        before = await state();
        at = await canvasPoint(width/2,height/2,width,height);
        await touch('touchStart',[at]);
        await waitState(3,true);
        await page.evaluate(event => {
          if (event === 'blur') window.dispatchEvent(new Event('blur'));
          else if (event === 'pagehide') window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
          else {
            const canvas = document.querySelector('canvas');
            // Record the actual active pointer id without relying on adapter internals.
            canvas.dispatchEvent(new PointerEvent(event,{bubbles:true,pointerType:'touch',pointerId:window.__activeTouchId}));
          }
        },event);
        await waitState(3,false);
        await touch('touchEnd',[]);
        if (event === 'pagehide') await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await touch('touchStart',[at]);
        await waitState(3,true);
        await touch('touchEnd',[]);
        const after = await waitState(3,false);
        check(after[0] === before[0]+2, fixture + ': synthetic ' + event + ' clears held state and permits one fresh real press', {before,after});
      }
      // Disable touch emulation only for real mouse/keyboard regression checks.
      await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
      at = await canvasPoint(width/2,height/2,width,height);
      for (const [buttonName,index,heldIndex] of [['left',0,3],['middle',1,4],['right',2,5]]) {
        before = await state();
        await page.mouse.move(at.x,at.y);
        await page.mouse.down({button:buttonName});
        await waitState(heldIndex,true);
        await page.mouse.move(1,1);
        await page.mouse.up({button:buttonName});
        const after = await waitState(heldIndex,false);
        check(after[index] === before[index]+1, fixture + ': real ' + buttonName + ' mouse press and outside release', {before,after});
      }
      await page.mouse.click(at.x,at.y);
      before = await state();
      await page.keyboard.down('a');
      await waitState(11,true);
      await page.keyboard.down('a');
      await settle();
      await page.keyboard.up('a');
      let after = await waitState(11,false);
      check(after[10] === before[10]+1, fixture + ': keyboard held state and one-frame press preserved');
      for (const event of ['blur','pagehide']) {
        await page.keyboard.down('a');
        await waitState(11,true);
        await page.evaluate(event => window.dispatchEvent(event === 'blur' ? new Event('blur') : new PageTransitionEvent('pagehide',{persisted:true})),event);
        await waitState(11,false);
        await page.keyboard.up('a');
        if (event === 'pagehide') await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        before = await state();
        await page.keyboard.press('a');
        await waitState(10,before[10]+1);
        check(!(await state())[11], fixture + ': synthetic ' + event + ' clears held keyboard input and permits fresh press');
      }
      if (fixture === 'mobile') {
        await input.fill('Ada');
        await button.click();
        await page.waitForFunction(() => window.__mobileCheck.last.includes('Hello, Ada'));
        await input.fill('Grace');
        before = await state();
        await input.press('a');
        await input.press('ArrowLeft');
        await input.press('Enter');
        await page.waitForFunction(() => window.__mobileCheck.last.includes('Enter, Gracea'));
        after = await state();
        check(after[10] === before[10] && !after[11], 'Scaled ordinary TextField typing/Enter/arrows keep control focus and do not feed game input');
        await page.mouse.click(at.x,at.y);
        await page.keyboard.press('a');
        await waitState(10,before[10]+1);
        check(true,'Canvas tap returns keyboard focus after ordinary controls');
      }
      check((await page.evaluate(() => window.__mobileCheck.errors)).length === 0,fixture + ': no browser JavaScript errors');
      await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    }
  } finally {
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
    await cdp.detach();
  }
  return {status:'passed',results,browser:await page.evaluate(() => navigator.userAgent),
    scope:'Headless Chrome with real CDP touch dispatch and viewport resizing; cancel, lost capture, blur and persisted pagehide are synthetic. Physical phones and other engines remain untested.'};
};
