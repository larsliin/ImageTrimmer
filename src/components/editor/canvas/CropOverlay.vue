<script setup lang="ts">
    import { useToolDraft } from '@/composables/useToolDraft';
    import { computed, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
    import { isValidLevelAngle, MAX_LEVEL_ANGLE, straightenCrop } from '@/lib/straighten';
    import { rotationCursors } from '@/lib/rotationCursors';
    import { cropFromPoints, squareCropFromPoints, moveCrop, resizeCrop, snapCropToPixels, isValidCrop, previewToImagePoint, isCropInsideRotatedImage, isValidAngle, largestCropInsideRotatedImage, constrainCropInsideRotatedImage, constrainCropDrag, type CropRect, type CropHandle, type Point } from '@/lib/crop';
    import type { Size } from '@/lib/zoom';
    import CropControls from '../controls/CropControls.vue';

    const props = defineProps<{
        image: Size
        disabled: boolean
        panMode: boolean
        initialCrop?: CropRect
        straighten?: boolean
        canStraighten?: boolean
        focusOnMount?: boolean
    }>();

    const angle = defineModel<number>('angle', { default: 0 });
    const snapPreferenceKey = 'image-editor-crop-snap-to-pixel';

    function loadSnapPreference(): boolean {
        try {
            const preference = localStorage.getItem(snapPreferenceKey);
            if (preference === null) return false;
            if (preference === 'true') return true;
            if (preference === 'false') return false;
            console.warn('Ignoring an invalid saved crop snap preference:', preference);
        } catch (error) {
            console.warn('Unable to restore the saved crop snap preference:', error);
        }
        return false;
    }

    const snapToPixel = shallowRef(loadSnapPreference());
    const snapEnabled = computed(() => !props.straighten && snapToPixel.value);
    watch(snapToPixel, (value) => {
        if (!props.straighten && value && isValidCrop(crop.value, props.image)) {
            crop.value = snapCropToPixels(crop.value, props.image);
            manualCrop = null;
        }
        if (props.straighten) return;
        try {
            localStorage.setItem(snapPreferenceKey, String(value));
        } catch (error) {
            console.warn('Unable to save the crop snap preference:', error);
        }
    });

    const emit = defineEmits<{
        apply: [crop: CropRect, angle: number]
        dirty: [value: boolean]
        cancel: []
        straighten: []
    }>();

    const surface = useTemplateRef<HTMLDivElement>('surface');
    const standardCrop = ref<CropRect>(props.initialCrop
        ? { ...props.initialCrop }
        : { x: 0, y: 0, width: props.image.width, height: props.image.height });
    // Keep framing intent independent of angle and snap; constraints never feed back into it.
    const framingIntent = shallowRef<CropRect | null>(null);
    const displayedAngle = shallowRef(isValidLevelAngle(angle.value) ? angle.value : 0);
    const crop = computed<CropRect>({
        get: () => {
            if (!props.straighten) return standardCrop.value;
            const intended = framingIntent.value ?? straightenCrop(props.image, displayedAngle.value);
            return constrainCropInsideRotatedImage(intended, props.image, displayedAngle.value, snapEnabled.value);
        },
        set: (value) => {
            if (!props.straighten) standardCrop.value = value;
            else if (isValidCrop(value, props.image)) framingIntent.value = { ...value };
        },
    });
    onMounted(() => {
        if (props.focusOnMount) surface.value?.focus({ preventScroll: true });
    });
    useToolDraft(() => ({
        tool: 'crop', rect: props.straighten ? framingIntent.value ?? crop.value : crop.value, angle: angle.value,
    }), value => emit('dirty', value));

    const dragging = shallowRef(false);
    const moving = shallowRef(false);
    const resizing = shallowRef<CropHandle | null>(null);
    const rotating = shallowRef(false);
    const activeRotationCursor = computed(() => !props.panMode && rotating.value && resizing.value
        ? rotationCursors[resizing.value] : undefined);
    const handles: { id: CropHandle; label: string; x: number; y: number; cursor: string }[] = [
        { id: 'nw', label: 'top left', x: 0, y: 0, cursor: 'nwse-resize' },
        { id: 'n', label: 'top', x: 50, y: 0, cursor: 'ns-resize' },
        { id: 'ne', label: 'top right', x: 100, y: 0, cursor: 'nesw-resize' },
        { id: 'e', label: 'right', x: 100, y: 50, cursor: 'ew-resize' },
        { id: 'se', label: 'bottom right', x: 100, y: 100, cursor: 'nwse-resize' },
        { id: 's', label: 'bottom', x: 50, y: 100, cursor: 'ns-resize' },
        { id: 'sw', label: 'bottom left', x: 0, y: 100, cursor: 'nesw-resize' },
        { id: 'w', label: 'left', x: 0, y: 50, cursor: 'ew-resize' },
    ];
    const visibleHandles = computed(() => props.straighten
        ? handles.filter(handle => isRotationHandle(handle.id))
        : handles);
    let start: Point | null = null;
    let end: Point | null = null;
    let pointerId: number | null = null;
    let previousCrop: CropRect | null = null;
    let previousIntent: CropRect | null = null;
    let previousAngle = 0;

    function isRotationHandle(handle: CropHandle): boolean {
        return !!props.straighten && handle.length === 2;
    }

    const rectValid = computed(() => isValidCrop(crop.value, props.image));
    const angleValid = computed(() => props.straighten ? isValidLevelAngle(angle.value) : isValidAngle(angle.value));
    const valid = computed(() =>
        rectValid.value && angleValid.value && isCropInsideRotatedImage(crop.value, props.image, angle.value),
    );
    const unchanged = computed(() =>
        angle.value === 0
        && crop.value.x === 0 && crop.value.y === 0
        && crop.value.width === props.image.width && crop.value.height === props.image.height,
    );

    // Keep the selection inside the image when X/Y or width/height are edited numerically.
    watch(() => [crop.value.x, crop.value.y] as const, ([x, y]) => {
        if (props.straighten) return;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const width = Math.max(1, Math.min(crop.value.width, props.image.width - x));
        const height = Math.max(1, Math.min(crop.value.height, props.image.height - y));
        if (Number.isFinite(width) && width !== crop.value.width) crop.value.width = width;
        if (Number.isFinite(height) && height !== crop.value.height) crop.value.height = height;
    });

    watch(() => [crop.value.width, crop.value.height] as const, ([width, height]) => {
        if (props.straighten) return;
        if (!Number.isFinite(width) || !Number.isFinite(height)) return;
        const maxWidth = props.image.width - crop.value.x;
        const maxHeight = props.image.height - crop.value.y;
        if (maxWidth >= 1 && width > maxWidth) crop.value.width = maxWidth;
        if (maxHeight >= 1 && height > maxHeight) crop.value.height = maxHeight;
    });

    // Automatic crops follow the current angle until the user adjusts the selection.
    let autoCrop = true;
    let manualCrop: CropRect | null = null;

    watch(angle, (value) => {
        if (!angleValid.value) return;
        if (props.straighten) {
            displayedAngle.value = value;
            return;
        }
        if (autoCrop) {
            crop.value = largestCropInsideRotatedImage(props.image, value);
            return;
        }
        if (rectValid.value) {
            manualCrop ??= { ...crop.value };
            crop.value = constrainCropInsideRotatedImage(manualCrop, props.image, value, snapEnabled.value);
        }
    }, { flush: 'sync' });
    // Keep showing the last valid selection (and grid) while a field is empty or invalid.
    const displayCrop = shallowRef<CropRect>({ ...crop.value });
    watch(crop, (value) => {
        if (isValidCrop(value, props.image)) displayCrop.value = { ...value };
        else if (dragging.value) displayCrop.value = { x: 0, y: 0, width: 0, height: 0 };
    }, { deep: true });

    const selectionStyle = computed(() => ({
        left: `${displayCrop.value.x / props.image.width * 100}%`,
        top: `${displayCrop.value.y / props.image.height * 100}%`,
        width: `${displayCrop.value.width / props.image.width * 100}%`,
        height: `${displayCrop.value.height / props.image.height * 100}%`,
    }));

    function point(event: PointerEvent, rotation = false): Point {
        const element = surface.value;
        if (!element) throw new Error('The crop selection is not available.');
        const bounds = element.getBoundingClientRect();
        // Rotation uses the raw pointer, including outside the frame, never pixel snapping.
        if (rotation) return {
            x: (event.clientX - bounds.left) * props.image.width / bounds.width,
            y: (event.clientY - bounds.top) * props.image.height / bounds.height,
        };
        return previewToImagePoint(
            { x: event.clientX, y: event.clientY },
            bounds,
            props.image,
            snapEnabled.value,
        );
    }

    function beginSelection(event: PointerEvent, handle: CropHandle | null = null) {
        if (props.disabled || props.panMode || pointerId !== null || event.button !== 0 || !surface.value) return;
        // Straighten framing changes only through corner rotation; interior/outside drags are inert.
        if (props.straighten && (handle === null || !isRotationHandle(handle))) return;
        event.preventDefault();
        previousIntent = framingIntent.value;
        previousAngle = displayedAngle.value;
        rotating.value = handle !== null && isRotationHandle(handle);
        if (!props.straighten) {
            autoCrop = false;
            manualCrop = null;
        }
        surface.value.focus({ preventScroll: true });
        surface.value.setPointerCapture(event.pointerId);
        pointerId = event.pointerId;
        previousCrop = { ...crop.value };
        start = point(event, rotating.value);
        end = start;
        resizing.value = handle;
        moving.value = !handle && (props.straighten ? rectValid.value : valid.value && !unchanged.value)
            && start.x >= crop.value.x && start.x <= crop.value.x + crop.value.width
            && start.y >= crop.value.y && start.y <= crop.value.y + crop.value.height;
        dragging.value = true;
        if (!props.straighten && !moving.value && !handle) crop.value = cropFromPoints(start, start);
    }

    function updateSelection(event: PointerEvent) {
        if (event.pointerId !== pointerId || !start) return;
        end = point(event, rotating.value);
        updateConstraint(event.shiftKey);
    }

    function updateConstraint(square: boolean) {
        if (!start || !end) return;
        if (rotating.value) {
            const centerX = props.image.width / 2;
            const centerY = props.image.height / 2;
            const delta = Math.atan2(end.y - centerY, end.x - centerX) - Math.atan2(start.y - centerY, start.x - centerX);
            const degrees = Math.atan2(Math.sin(delta), Math.cos(delta)) * 180 / Math.PI;
            rotateTo(previousAngle + degrees);
            return;
        }
        if (resizing.value && previousCrop) {
            const requested = resizeCrop(
                previousCrop,
                resizing.value,
                { x: end.x - start.x, y: end.y - start.y },
                props.image,
                square,
            );
            crop.value = props.straighten
                ? constrainCropDrag(previousCrop, requested, props.image, displayedAngle.value, snapEnabled.value)
                : requested;
            return;
        }
        if (moving.value && previousCrop) {
            const requested = moveCrop(previousCrop, { x: end.x - start.x, y: end.y - start.y }, props.image);
            crop.value = props.straighten
                ? constrainCropDrag(previousCrop, requested, props.image, displayedAngle.value, snapEnabled.value)
                : requested;
            return;
        }
        crop.value = square
            ? squareCropFromPoints(start, end, props.image)
            : cropFromPoints(start, end);
    }

    function onShiftChange(event: KeyboardEvent) {
        if (event.key === 'Shift') updateConstraint(event.shiftKey);
    }

    function endSelection(event: PointerEvent) {
        if (event.pointerId !== pointerId) return;
        if (event.type === 'pointerup') updateSelection(event);
        if (event.type !== 'pointerup' && props.straighten) {
            framingIntent.value = previousIntent;
            angle.value = previousAngle;
        } else if ((event.type !== 'pointerup' || !valid.value) && previousCrop) {
            crop.value = previousCrop;
        }
        const capturedId = pointerId;
        pointerId = null;
        start = null;
        end = null;
        dragging.value = false;
        moving.value = false;
        resizing.value = null;
        rotating.value = false;
        if (capturedId !== null && surface.value?.hasPointerCapture(capturedId)) {
            surface.value.releasePointerCapture(capturedId);
        }
    }

    function rotateTo(degrees: number) {
        angle.value = Math.max(-MAX_LEVEL_ANGLE, Math.min(MAX_LEVEL_ANGLE, Math.round(degrees * 100) / 100));
    }

    function resizeWithKeyboard(event: KeyboardEvent, handle: CropHandle) {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        if (props.disabled || props.panMode || dragging.value) return;
        if (isRotationHandle(handle)) {
            const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
            rotateTo(displayedAngle.value + direction * (event.shiftKey ? 1 : 0.1));
            return;
        }
        autoCrop = false;
        manualCrop = null;
        crop.value = resizeCrop(crop.value, handle, {
            x: event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0,
            y: event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0,
        }, props.image, event.shiftKey);
    }

    function onFormInput(event: Event) {
        const label = (event.target as HTMLElement).getAttribute('aria-label') ?? '';
        if (label.startsWith('Crop ')) {
            autoCrop = false;
            manualCrop = null;
        }
    }

    function apply() {
        if (!props.disabled && !dragging.value && valid.value && !unchanged.value) {
            emit('apply', { ...crop.value }, angle.value);
        }
    }

    function requestStraighten() {
        if (props.straighten && props.canStraighten && !props.disabled && !dragging.value && angleValid.value) {
            emit('straighten');
        }
    }
</script>

<template>
    <div
        ref="surface"
        class="crop-surface"
        :class="{ 'is-panning': panMode, 'is-straighten': straighten, 'is-moving': moving, 'is-rotating': !!activeRotationCursor }"
        :style="{ cursor: activeRotationCursor }"
        tabindex="0"
        :aria-label="straighten
            ? 'Straighten framing. Drag a corner or adjust the angle to rotate; the crop fits automatically. Enter applies; Escape cancels.'
            : 'Crop selection. Drag inside to move or outside to select. Hold Shift for square. Enter applies; Escape cancels.'"
        @pointerdown="beginSelection($event)"
        @pointermove="updateSelection"
        @pointerup="endSelection"
        @pointercancel="endSelection"
        @lostpointercapture="endSelection"
        @keydown="onShiftChange"
        @keyup="onShiftChange"
        @keydown.enter.prevent="apply"
        @keydown.esc.prevent.stop="emit('cancel')"
    >
        <div
            v-if="displayCrop.width > 0 && displayCrop.height > 0"
            class="crop-selection"
            :class="{ 'is-movable': !straighten && !unchanged && !panMode }"
            :style="selectionStyle"
        >
            <span class="crop-grid" aria-hidden="true"></span>
            <template v-if="!panMode">
                <button
                    v-for="handle in visibleHandles"
                    :key="handle.id"
                    type="button"
                    class="crop-handle"
                    :class="isRotationHandle(handle.id) ? `is-rotation is-rotation-${handle.id}` : ''"
                    :aria-label="isRotationHandle(handle.id) ? `Rotate image from ${handle.label}` : `Resize crop ${handle.label}`"
                    :title="isRotationHandle(handle.id)
                        ? `Rotate from ${handle.label}; arrow keys adjust 0.1 degrees, Shift adjusts 1 degree`
                        : `Resize ${handle.label}; use arrow keys for pixel adjustments`"
                    :disabled="disabled"
                    :style="{
                        left: `${handle.x}%`, top: `${handle.y}%`,
                        cursor: activeRotationCursor ? 'inherit' : isRotationHandle(handle.id) ? rotationCursors[handle.id] : handle.cursor,
                        transform: isRotationHandle(handle.id)
                            ? `translate(${handle.x === 0 ? '0%' : '-100%'}, ${handle.y === 0 ? '0%' : '-100%'})`
                            : 'translate(-50%, -50%)',
                    }"
                    @pointerdown.stop="beginSelection($event, handle.id)"
                    @keydown="resizeWithKeyboard($event, handle.id)"
                ></button>
            </template>
        </div>
    </div>
    <CropControls
        :image="image"
        :crop="crop"
        :disabled="disabled"
        :dragging="dragging"
        :valid="valid"
        :unchanged="unchanged"
        :straighten="straighten"
        :can-straighten="canStraighten"
        v-model:angle="angle"
        v-model:snap-to-pixel="snapToPixel"
        @update:crop="crop = $event"
        @manual-change="onFormInput"
        @apply="apply"
        @cancel="emit('cancel')"
        @straighten="requestStraighten"
    >
    </CropControls>
</template>

<style scoped>
.crop-surface {
    position: absolute;
    inset: 0;
    overflow: hidden;
    cursor: crosshair;
    touch-action: none;
}

.crop-surface.is-straighten {
    cursor: default;
}

.crop-surface.is-panning {
    cursor: inherit;
}

.crop-selection {
    position: absolute;
    border: 1px solid #fff;
    outline: 1px solid #000;
    box-shadow: 0 0 0 100vmax rgb(0 0 0 / 55%);
    pointer-events: none;
}

.crop-selection.is-movable {
    pointer-events: auto;
    cursor: move;
}

.crop-surface.is-moving {
    cursor: move;
}

.crop-surface.is-rotating .crop-selection {
    cursor: inherit;
}

.crop-grid {
    pointer-events: none;
    position: absolute;
    inset: 0;
}

.crop-handle {
    position: absolute;
    z-index: 1;
    width: 12px;
    height: 12px;
    padding: 0;
    border: 1px solid #000;
    border-radius: 1px;
    background: #fff;
    pointer-events: auto;
    touch-action: none;
    transform: translate(-50%, -50%);
}

.crop-handle.is-rotation { width: 28px; height: 28px; border: 0; border-radius: 0; background: transparent; }

.crop-handle.is-rotation::before {
    content: ''; position: absolute; width: 12px; height: 12px; box-sizing: border-box; border: 1px solid #000;
    border-radius: 1px; background: #fff; pointer-events: none;
}

.crop-handle.is-rotation-nw::before { top: -6px; left: -6px; }
.crop-handle.is-rotation-ne::before { top: -6px; right: -6px; }
.crop-handle.is-rotation-se::before { right: -6px; bottom: -6px; }
.crop-handle.is-rotation-sw::before { bottom: -6px; left: -6px; }

.crop-handle.is-rotation:focus-visible { outline: 2px solid var(--color-focus); outline-offset: -2px; }

.crop-grid::before,
.crop-grid::after {
    content: '';
    position: absolute;
    border: 0 solid rgb(255 255 255 / 60%);
}

.crop-grid::before {
    inset: 0 33.333333%;
    border-left-width: 1px;
    border-right-width: 1px;
}

.crop-grid::after {
    inset: 33.333333% 0;
    border-top-width: 1px;
    border-bottom-width: 1px;
}

.crop-surface:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
}
</style>
