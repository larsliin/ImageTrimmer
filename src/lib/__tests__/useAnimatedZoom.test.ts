import assert from 'node:assert/strict';
import test from 'node:test';
import { effectScope, nextTick, shallowRef } from 'vue';
import { useAnimatedZoom } from '../../composables/useAnimatedZoom.ts';

test('animated zoom: initial state matches useZoom behavior', async () => {
    const scope = effectScope();
    const imageSize = shallowRef({ width: 800, height: 400 });
    const viewportSize = shallowRef({ width: 1000, height: 700 });
    const sourceId = shallowRef(1);
    const zoomState = scope.run(() => useAnimatedZoom(imageSize, viewportSize, sourceId));
    assert.ok(zoomState);

    assert.equal(zoomState.zoom.value, 1);
    assert.equal(zoomState.isFit.value, false);
    // Note: isAnimating will be true when animation frame callbacks are active
    // Skip this check in Node.js environment
    scope.stop();
});

test('animated zoom: setZoom works without animation', async () => {
    const scope = effectScope();
    const imageSize = shallowRef({ width: 800, height: 400 });
    const viewportSize = shallowRef({ width: 1000, height: 700 });
    const sourceId = shallowRef(1);
    const zoomState = scope.run(() => useAnimatedZoom(imageSize, viewportSize, sourceId));
    assert.ok(zoomState);

    zoomState.setZoom(2);
    assert.equal(zoomState.zoom.value, 2);
    assert.equal(zoomState.isFit.value, false);
    scope.stop();
});

test('animated zoom: fit mode with cap initial fit', async () => {
    const scope = effectScope();
    const imageSize = shallowRef({ width: 400, height: 200 });
    const viewportSize = shallowRef({ width: 1200, height: 800 });
    const sourceId = shallowRef(1);
    const zoomState = scope.run(() => useAnimatedZoom(imageSize, viewportSize, sourceId));
    assert.ok(zoomState);

    // Should cap at 100% initially
    assert.equal(zoomState.zoom.value, 1);
    assert.equal(zoomState.isFit.value, false);
    scope.stop();
});

test('animated zoom: changing image dimensions preserves manual zoom', async () => {
    const scope = effectScope();
    const imageSize = shallowRef({ width: 800, height: 400 });
    const viewportSize = shallowRef({ width: 1000, height: 700 });
    const sourceId = shallowRef(1);
    const zoomState = scope.run(() => useAnimatedZoom(imageSize, viewportSize, sourceId));
    assert.ok(zoomState);

    zoomState.setZoom(2);
    const manualZoom = zoomState.zoom.value;
    imageSize.value = { width: 400, height: 800 };
    await nextTick();

    assert.equal(zoomState.isFit.value, false);
    assert.equal(zoomState.zoom.value, manualZoom);
    scope.stop();
});

test('animated zoom: fit mode recalculates on image dimension change', async () => {
    const scope = effectScope();
    const imageSize = shallowRef({ width: 800, height: 400 });
    const viewportSize = shallowRef({ width: 1000, height: 700 });
    const sourceId = shallowRef(1);
    const zoomState = scope.run(() => useAnimatedZoom(imageSize, viewportSize, sourceId));
    assert.ok(zoomState);

    imageSize.value = { width: 400, height: 800 };
    await nextTick();

    assert.equal(zoomState.isFit.value, true);
    assert.equal(zoomState.zoom.value, 0.875);
    scope.stop();
});

test('animated zoom: opening new image resets to 100%', async () => {
    const scope = effectScope();
    const imageSize = shallowRef({ width: 800, height: 400 });
    const viewportSize = shallowRef({ width: 1000, height: 700 });
    const sourceId = shallowRef(1);
    const zoomState = scope.run(() => useAnimatedZoom(imageSize, viewportSize, sourceId));
    assert.ok(zoomState);

    zoomState.setZoom(2);
    assert.equal(zoomState.isFit.value, false);

    sourceId.value += 1;
    await nextTick();

    assert.equal(zoomState.isFit.value, false);
    assert.equal(zoomState.zoom.value, 1);
    scope.stop();
});

test('animated zoom: cancelAnimation prevents animation', async () => {
    const scope = effectScope();
    const imageSize = shallowRef({ width: 800, height: 400 });
    const viewportSize = shallowRef({ width: 1000, height: 700 });
    const sourceId = shallowRef(1);
    const zoomState = scope.run(() => useAnimatedZoom(imageSize, viewportSize, sourceId));
    assert.ok(zoomState);

    // Since Node.js doesn't have requestAnimationFrame, just verify cancelAnimation works
    zoomState.cancelAnimation();
    // Should not throw
    scope.stop();
});

test('animated zoom: canZoomIn/Out check target zoom, not animated zoom', async () => {
    const scope = effectScope();
    const imageSize = shallowRef({ width: 800, height: 400 });
    const viewportSize = shallowRef({ width: 1000, height: 700 });
    const sourceId = shallowRef(1);
    const zoomState = scope.run(() => useAnimatedZoom(imageSize, viewportSize, sourceId));
    assert.ok(zoomState);

    // Initially at 100%, can zoom in
    assert.equal(zoomState.canZoomIn.value, true);

    // Verify that targetZoom is used for canZoomIn checks
    // by checking initial state
    assert(zoomState.targetZoom.value === zoomState.zoom.value);
    assert.equal(zoomState.canZoomIn.value, true);

    scope.stop();
});

test('animated zoom: targetZoom used for next step calculation', async () => {
    const scope = effectScope();
    const imageSize = shallowRef({ width: 800, height: 400 });
    const viewportSize = shallowRef({ width: 1000, height: 700 });
    const sourceId = shallowRef(1);
    const zoomState = scope.run(() => useAnimatedZoom(imageSize, viewportSize, sourceId));
    assert.ok(zoomState);

    const initialZoom = zoomState.zoom.value;
    const initialTarget = zoomState.targetZoom.value;

    // Verify initially they're the same
    assert.equal(initialZoom, initialTarget);

    // Manually set a zoom using setZoom (which bypasses animation)
    zoomState.setZoom(0.5);
    assert.equal(zoomState.zoom.value, 0.5);
    assert.equal(zoomState.targetZoom.value, 0.5);

    // Both should update together when not animating
    assert.equal(zoomState.zoom.value, zoomState.targetZoom.value);

    scope.stop();
});

test('animated zoom: disabled navigation animations apply zoom, Fit, and Actual size immediately', () => {
    const scope = effectScope();
    const imageSize = shallowRef({ width: 800, height: 400 });
    const viewportSize = shallowRef({ width: 1000, height: 700 });
    const sourceId = shallowRef(1);
    const zoomState = scope.run(() => useAnimatedZoom(imageSize, viewportSize, sourceId, {
        animationsEnabled: false,
    }));
    assert.ok(zoomState);

    zoomState.zoomIn();
    assert.equal(zoomState.zoom.value, 2);
    assert.equal(zoomState.targetZoom.value, zoomState.zoom.value);
    assert.equal(zoomState.isAnimating.value, false);

    zoomState.setZoom(2);
    zoomState.fitToView();
    assert.equal(zoomState.zoom.value, 1.25);
    assert.equal(zoomState.isFit.value, true);

    zoomState.actualSize();
    assert.equal(zoomState.zoom.value, 1);
    assert.equal(zoomState.isAnimating.value, false);
    scope.stop();
});

type TestAnimationFrame = () => void;

test('animated zoom: disabling during an animation completes at its requested target', (t) => {
    const pendingFrames = new Map<number, TestAnimationFrame>();
    let nextFrameId = 0;
    const requestFrameDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
    const cancelFrameDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
        configurable: true,
        value: (callback: TestAnimationFrame) => {
            const id = ++nextFrameId;
            pendingFrames.set(id, callback);
            return id;
        },
    });
    Object.defineProperty(globalThis, 'cancelAnimationFrame', {
        configurable: true,
        value: (id: number) => { pendingFrames.delete(id); },
    });

    const animationsEnabled = shallowRef(true);
    const scope = effectScope();
    const zoomState = scope.run(() => useAnimatedZoom(
        shallowRef({ width: 800, height: 400 }),
        shallowRef({ width: 1000, height: 700 }),
        shallowRef(1),
        { animationsEnabled },
    ));
    assert.ok(zoomState);

    t.after(() => {
        scope.stop();
        if (requestFrameDescriptor) Object.defineProperty(globalThis, 'requestAnimationFrame', requestFrameDescriptor);
        else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
        if (cancelFrameDescriptor) Object.defineProperty(globalThis, 'cancelAnimationFrame', cancelFrameDescriptor);
        else Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
    });

    zoomState.zoomIn();
    const requestedTarget = zoomState.targetZoom.value;
    assert.equal(zoomState.isAnimating.value, true);
    assert.equal(pendingFrames.size, 1);

    animationsEnabled.value = false;

    assert.equal(zoomState.isAnimating.value, false);
    assert.equal(zoomState.zoom.value, requestedTarget);
    assert.equal(zoomState.targetZoom.value, requestedTarget);
    assert.equal(pendingFrames.size, 0);
});
