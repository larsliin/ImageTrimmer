<script setup lang="ts">
    import { computed, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue';
    import CropOverlay from './CropOverlay.vue';
    import { useToolDraft } from '@/composables/useToolDraft';
    import { previewToImagePoint, type CropRect, type Point } from '@/lib/crop';
    import {
        isValidLevelAngle, levelingAngle, levelLineProblem,
        sourceToStraightenedPoint, straightenedToSourcePoint,
    } from '@/lib/straighten';
    import type { Size } from '@/lib/zoom';

    const props = defineProps<{
        image: Size
        disabled: boolean
        panMode: boolean
    }>();

    const emit = defineEmits<{
        preview: [angle: number]
        apply: [crop: CropRect, angle: number]
        dirty: [value: boolean]
        cancel: []
    }>();

    const points = shallowRef<Point[]>([]);
    const cursor = shallowRef<Point | null>(null);
    const keyboardCursorActive = shallowRef(false);
    const angle = shallowRef(0);
    const lineProblem = shallowRef<string | null>(null);
    const announcement = shallowRef('');
    const surface = useTemplateRef<HTMLDivElement>('surface');
    interface PlacementGesture {
        pointerId: number
        startClient: Point
        startPoint: Point
        previousCursor: Point | null
        previousKeyboardCursorActive: boolean
        dragIntent: boolean
    }
    interface SuppressedClick {
        pointerId: number
        client: Point
    }
    const placementGesture = shallowRef<PlacementGesture | null>(null);
    let suppressedClick: SuppressedClick | null = null;
    useToolDraft(() => ({ tool: 'straighten', points: points.value, angle: angle.value }), value => emit('dirty', value));
    const angleValue = computed(() => typeof angle.value === 'number' ? angle.value : Number.NaN);
    const previewAngle = computed(() => isValidLevelAngle(angleValue.value) ? angleValue.value : null);
    const displayedAngle = shallowRef(0);
    const canPlace = computed(() => !props.disabled && !props.panMode && points.value.length < 2);
    const guideCorrection = computed(() => {
        const [first, second] = points.value;
        if (!first || !second || lineProblem.value
            || ![first.x, first.y, second.x, second.y].every(Number.isFinite)
            || (first.x === second.x && first.y === second.y)) return null;
        return levelingAngle(first, second);
    });
    const canStraighten = computed(() => {
        const [first, second] = points.value;
        if (props.disabled || previewAngle.value === null || guideCorrection.value === null || !first || !second) return false;
        // Test the actual source line, allowing the residual from rounding the correction to 0.01°.
        const residual = Math.abs((Math.atan2(second.y - first.y, second.x - first.x) * 180 / Math.PI
            + previewAngle.value) % 180);
        return Math.min(residual, 180 - residual) > 0.01 + 1e-10;
    });
    const outputSize = computed(() => ({ x: 0, y: 0, width: props.image.width, height: props.image.height }));
    const previewPoints = computed(() => points.value.map(point =>
        sourceToStraightenedPoint(point, props.image, displayedAngle.value, outputSize.value)));
    const previewCursor = computed(() => cursor.value
        ? sourceToStraightenedPoint(cursor.value, props.image, displayedAngle.value, outputSize.value)
        : null);
    const guide = computed(() => {
        const [placedStart, second] = previewPoints.value;
        const gesture = placementGesture.value;
        const start = placedStart ?? (gesture && points.value.length === 0
            ? sourceToStraightenedPoint(gesture.startPoint, props.image, displayedAngle.value, outputSize.value)
            : null);
        const end = second ?? previewCursor.value;
        return start && end ? { start, end } : null;
    });
    watch(previewAngle, (value) => {
        if (value === null) return;
        if (placementGesture.value && value !== displayedAngle.value) cancelPlacementGesture();
        displayedAngle.value = value;
        emit('preview', value);
    });
    watch(() => [props.disabled, props.panMode] as const, ([disabled, panMode]) => {
        if (disabled || panMode) cancelPlacementGesture();
    }, { flush: 'sync' });
    let announcementTimer = 0;
    function percent(value: number, length: number): string {
        return `${value / length * 100}%`;
    }
    function surfaceRect(): DOMRect | null {
        const rect = surface.value?.getBoundingClientRect();
        return rect && rect.width > 0 && rect.height > 0 ? rect : null;
    }
    // Clicks land on the (possibly manually rotated) preview; guide points are stored in source pixels.
    function displayToSource(point: Point): Point {
        return straightenedToSourcePoint(point, props.image, displayedAngle.value);
    }
    function pointFrom(event: MouseEvent | PointerEvent): { point: Point, display: Size } | null {
        const rect = surfaceRect();
        if (!rect) return null;
        return {
            point: displayToSource(previewToImagePoint({ x: event.clientX, y: event.clientY }, rect, props.image, false)),
            display: { width: rect.width, height: rect.height },
        };
    }

    function pointLineProblem(first: Point, second: Point, display: Size): string | null {
        const previewFirst = sourceToStraightenedPoint(first, props.image, displayedAngle.value, outputSize.value);
        const previewSecond = sourceToStraightenedPoint(second, props.image, displayedAngle.value, outputSize.value);
        return levelLineProblem(previewFirst, previewSecond, props.image, display);
    }

    function announce(message: string) {
        window.clearTimeout(announcementTimer);
        announcement.value = '';
        announcementTimer = window.setTimeout(() => {
            announcement.value = message;
        }, 50);
    }

    function completeLine(first: Point, second: Point, display: Size) {
        lineProblem.value = pointLineProblem(first, second, display);
        if (lineProblem.value) return false;
        points.value = [first, second];
        cursor.value = second;
        announce(previewAngle.value === null
            ? 'Reference line set. Enter a valid angle to continue.'
            : canStraighten.value
                ? 'Reference line set. Select Straighten to level it, or adjust the angle first.'
                : 'Reference line set. The line is level. Straighten is disabled until you change the angle away from level.');
        return true;
    }

    function placePoint(point: Point, display: Size) {
        const [first] = points.value;
        if (!first) {
            points.value = [point];
            cursor.value = point;
            lineProblem.value = null;
            return;
        }
        completeLine(first, point, display);
    }

    function straighten() {
        if (!canStraighten.value || guideCorrection.value === null) return;
        angle.value = guideCorrection.value;
        announce('Reference line leveled. Straighten is disabled while level. Adjust the angle, then select Apply straighten.');
    }

    function consumeSuppressedClick(event: MouseEvent): boolean {
        if (!suppressedClick || event.detail === 0) return false;
        const pointerId = 'pointerId' in event ? event.pointerId : undefined;
        const samePointer = pointerId === undefined
            ? Math.round(event.clientX) === Math.round(suppressedClick.client.x)
                && Math.round(event.clientY) === Math.round(suppressedClick.client.y)
            : pointerId === suppressedClick.pointerId;
        if (!samePointer) return false;
        suppressedClick = null;
        return true;
    }

    function placePointerPoint(event: MouseEvent) {
        if (event.target !== event.currentTarget || consumeSuppressedClick(event)
            || event.detail === 0 || !canPlace.value || event.button !== 0) return;
        const clicked = pointFrom(event);
        if (clicked) placePoint(clicked.point, clicked.display);
    }

    function beginPointerPlacement(event: PointerEvent) {
        if (event.button !== 0 || event.isPrimary === false) return;
        suppressedClick = null;
        if (event.target !== event.currentTarget || !canPlace.value || placementGesture.value) return;
        const start = pointFrom(event);
        const element = surface.value;
        if (!start || !element) return;
        event.preventDefault();
        element.focus({ preventScroll: true });
        element.setPointerCapture(event.pointerId);
        placementGesture.value = {
            pointerId: event.pointerId,
            startClient: { x: event.clientX, y: event.clientY },
            startPoint: start.point,
            previousCursor: cursor.value,
            previousKeyboardCursorActive: keyboardCursorActive.value,
            dragIntent: false,
        };
        cursor.value = start.point;
    }

    function updatePointerPlacement(event: PointerEvent) {
        const gesture = placementGesture.value;
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        const position = pointFrom(event);
        if (!position) return;
        const dragIntent = gesture.dragIntent
            || Math.hypot(event.clientX - gesture.startClient.x, event.clientY - gesture.startClient.y) > 3;
        placementGesture.value = { ...gesture, dragIntent };
        cursor.value = position.point;
    }

    function releasePlacementPointer(pointerId: number) {
        const element = surface.value;
        if (element?.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    }

    function endPointerPlacement(event: PointerEvent) {
        const gesture = placementGesture.value;
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        updatePointerPlacement(event);
        const currentGesture = placementGesture.value;
        if (!currentGesture) return;
        const endpoint = pointFrom(event);
        const rect = surfaceRect();
        const dragIntent = currentGesture.dragIntent
            || Math.hypot(event.clientX - currentGesture.startClient.x, event.clientY - currentGesture.startClient.y) > 3;
        placementGesture.value = null;
        if (dragIntent) {
            suppressedClick = { pointerId: gesture.pointerId, client: { x: event.clientX, y: event.clientY } };
            const first = points.value[0] ?? gesture.startPoint;
            const completed = endpoint && rect
                ? completeLine(first, endpoint.point, { width: rect.width, height: rect.height })
                : false;
            if (!completed) {
                cursor.value = gesture.previousCursor;
                keyboardCursorActive.value = gesture.previousKeyboardCursorActive;
            }
        } else {
            cursor.value = gesture.previousCursor;
            keyboardCursorActive.value = gesture.previousKeyboardCursorActive;
        }
        releasePlacementPointer(gesture.pointerId);
    }

    function cancelPlacementGesture(event?: PointerEvent) {
        const gesture = placementGesture.value;
        if (!gesture || (event && event.pointerId !== gesture.pointerId)) return;
        placementGesture.value = null;
        points.value = points.value.slice(0, 1);
        cursor.value = gesture.previousCursor;
        keyboardCursorActive.value = gesture.previousKeyboardCursorActive;
        suppressedClick = {
            pointerId: gesture.pointerId,
            client: event ? { x: event.clientX, y: event.clientY } : gesture.startClient,
        };
        releasePlacementPointer(gesture.pointerId);
    }

    function cancelTool() {
        cancelPlacementGesture();
        emit('cancel');
    }

    function trackCursor(event: PointerEvent) {
        if (placementGesture.value) {
            updatePointerPlacement(event);
        } else if (event.target === event.currentTarget && points.value.length === 1 && canPlace.value) {
            cursor.value = pointFrom(event)?.point ?? null;
        }
    }

    function onPointerLeave() {
        if (!placementGesture.value && !keyboardCursorActive.value) cursor.value = null;
    }

    function moveKeyboardCursor(key: string, shift: boolean) {
        const rect = surfaceRect();
        if (!rect) return;
        const step = shift ? 10 : 1;
        const point = previewCursor.value ?? { x: props.image.width / 2, y: props.image.height / 2 };
        const x = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
        const y = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
        cursor.value = displayToSource({
            x: Math.max(0, Math.min(props.image.width, point.x + x * props.image.width / rect.width)),
            y: Math.max(0, Math.min(props.image.height, point.y + y * props.image.height / rect.height)),
        });
        keyboardCursorActive.value = true;
    }

    function onSurfaceKeydown(event: KeyboardEvent) {
        if (event.target !== event.currentTarget || !canPlace.value || placementGesture.value) return;
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            moveKeyboardCursor(event.key, event.shiftKey);
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            const rect = surfaceRect();
            if (!rect) return;
            const point = cursor.value ?? displayToSource({ x: props.image.width / 2, y: props.image.height / 2 });
            placePoint(point, { width: rect.width, height: rect.height });
            keyboardCursorActive.value = true;
        }
    }
    onBeforeUnmount(() => {
        cancelPlacementGesture();
        window.clearTimeout(announcementTimer);
    });
</script>

<template>
    <div
        ref="surface"
        class="straighten-surface"
        :class="{ 'is-placing': canPlace }"
        role="group"
        aria-label="Straighten image interaction"
        aria-describedby="straighten-image-instructions"
        tabindex="0"
        @keydown.esc.prevent.stop="cancelTool"
        @click="placePointerPoint"
        @pointerdown="beginPointerPlacement"
        @pointermove="trackCursor"
        @pointerup="endPointerPlacement"
        @pointercancel="cancelPlacementGesture"
        @lostpointercapture="cancelPlacementGesture"
        @pointerleave="onPointerLeave"
        @keydown="onSurfaceKeydown"
    >
        <CropOverlay
            v-model:angle="angle"
            :image="image"
            :disabled="disabled || placementGesture !== null"
            :pan-mode="panMode"
            :can-straighten="canStraighten"
            straighten
            @apply="(crop, value) => emit('apply', crop, value)"
            @cancel="cancelTool"
            @straighten="straighten"
        ></CropOverlay>
        <span id="straighten-image-instructions" class="visually-hidden">
            To set a reference line, click two distinct points or press and drag
            from the first point to the second, then release. A dragged line
            shorter than 8 displayed pixels is rejected; try again farther
            apart. Movement of 3 pixels or less counts as a click. Or focus
            this image area, use the arrow keys to position each point, and
            press Enter after each point. A coincident or too-short line is rejected;
            place the second point farther away. Hold Shift with an arrow key
            to move farther. After
            setting the line, the image does not rotate; select the Straighten
            button to level the measured line. Straighten stays available during
            editing, disabled while the line is level. Changing the angle away
            from level enables it again; reapplying restores the measured
            correction, and the crop fits automatically. You can also set the Angle
            slider or numeric field before or after measuring and apply directly without a reference line.
            Apply straighten is always visible, enabled only for a valid changed crop or angle.
            Setting a reference line alone does not enable Apply. From the moment Straighten opens, drag one of the four corner handles to rotate
            the image around its center, or draw an optional reference line elsewhere on the image, in either order.
            The crop fits automatically and cannot be resized.
            Corner arrow keys rotate by 0.1 degrees, or 1 degree with Shift.
            The crop stays inside the rotated image automatically. Use the
            Angle slider or numeric field for precise rotation. Press Enter in
            the crop controls or select Apply straighten to apply, and Escape
            to cancel. Cancel and reopen to start again.
        </span>
        <svg
            v-if="guide"
            class="straighten-line"
            :viewBox="`0 0 ${outputSize.width} ${outputSize.height}`"
            preserveAspectRatio="none"
            aria-hidden="true"
        >
            <line class="straighten-line__halo" :x1="guide.start.x" :y1="guide.start.y" :x2="guide.end.x" :y2="guide.end.y" />
            <line class="straighten-line__stroke" :x1="guide.start.x" :y1="guide.start.y" :x2="guide.end.x" :y2="guide.end.y" />
        </svg>
        <span
            v-for="(point, index) in previewPoints"
            :key="index"
            class="straighten-point"
            aria-hidden="true"
            :style="{ left: percent(point.x, outputSize.width), top: percent(point.y, outputSize.height) }"
        ></span>
        <span
            v-if="keyboardCursorActive && points.length === 0 && previewCursor"
            class="straighten-point straighten-point--keyboard"
            aria-hidden="true"
            :style="{ left: percent(previewCursor.x, outputSize.width), top: percent(previewCursor.y, outputSize.height) }"
        ></span>
        <span v-if="lineProblem" class="visually-hidden" role="alert">{{ lineProblem }}</span>
        <span class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{{ announcement }}</span>
    </div>
</template>

<style scoped>
.straighten-surface {
    position: absolute;
    inset: 0;
    overflow: hidden;
    touch-action: none;
}

.straighten-surface.is-placing {
    cursor: crosshair;
}

/* The frame and shading are visual only; corner handles retain their own hit targets. */
.straighten-surface :deep(.crop-surface) {
    pointer-events: none;
}

.straighten-surface:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
}

.straighten-line {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}

.straighten-line line {
    vector-effect: non-scaling-stroke;
}

.straighten-line__halo {
    stroke: #000;
    stroke-width: 2px;
}

.straighten-line__stroke {
    stroke: #fff;
    stroke-width: 0.75px;
}

.straighten-point {
    position: absolute;
    box-sizing: border-box;
    width: 10px;
    height: 10px;
    background: #fff;
    border: 2px solid #000;
    border-radius: 50%;
    pointer-events: none;
    transform: translate(-50%, -50%);
}

.straighten-point--keyboard {
    width: 14px;
    height: 14px;
    border-color: var(--color-focus);
}

.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}
</style>
