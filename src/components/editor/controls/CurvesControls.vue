<script setup lang="ts">
    import { computed, nextTick, onMounted, ref, shallowRef, useId, useTemplateRef, watch } from 'vue';
    import {
        CURVES_CHANNELS,
        CURVE_MAX,
        buildCurveLut,
        cloneCurves,
        computeChannelHistogram,
        defaultCurves,
        insertPoint,
        isIdentityCurves,
        isValidCurves,
        movePoint,
        removePoint,
        type CurvesChannel,
        type CurvesParams,
    } from '@/lib/curves';
    import { computeHistogram } from '@/lib/levels';
    import ToolModal from '../dialogs/ToolModal.vue';
    import { BaseButton, BaseSelect } from 'chrome-extension-component-library';
    import BaseNumberInput from '@/components/bascomponents/BaseNumberInput.vue';
    import BaseCheckbox from '@/components/bascomponents/BaseCheckbox.vue';

    const HISTOGRAM_SAMPLE_SIZE = 256;
    const PAD = 6;
    const VIEW = CURVE_MAX + PAD * 2;
    const HIT_RADIUS = 10;

    const props = defineProps<{
        image: ImageBitmap
        disabled: boolean
        error: string | null
    }>();

    const emit = defineEmits<{
        apply: [curves: CurvesParams]
        cancel: []
        preview: [curves: CurvesParams | null]
    }>();

    const curves = ref<CurvesParams>(defaultCurves());
    const channel = ref<CurvesChannel>('rgb');
    const channelOptions = CURVES_CHANNELS.map(({ id, label }) => ({ value: id, label }));
    const showPreview = ref(true);
    const selectedByChannel = ref<Record<CurvesChannel, number>>({ rgb: 0, red: 0, green: 0, blue: 0 });
    const selected = computed({
        get: () => selectedByChannel.value[channel.value],
        set: (index: number) => {
            selectedByChannel.value[channel.value] = index;
        },
    });
    const histograms = shallowRef<Record<CurvesChannel, Uint32Array> | null>(null);
    const histogramError = ref(false);
    const graph = useTemplateRef<SVGSVGElement>('graph');
    const idPrefix = useId();
    let dragIndex: number | null = null;
    let dragPointerId: number | null = null;

    const points = computed(() => curves.value[channel.value]);
    const valid = computed(() => isValidCurves(curves.value));
    const unchanged = computed(() => valid.value && isIdentityCurves(curves.value));
    const selectedPoint = computed(() => points.value[selected.value] ?? null);

    const toSvgX = (x: number) => x + PAD;
    const toSvgY = (y: number) => CURVE_MAX - y + PAD;

    const curvePath = computed(() => {
        const lut = buildCurveLut(points.value);
        return Array.from(lut, (y, x) => `${x === 0 ? 'M' : 'L'}${toSvgX(x)} ${toSvgY(y)}`).join(' ');
    });

    const histogramPath = computed(() => {
        const bins = histograms.value?.[channel.value];
        if (!bins) return '';
        const max = Math.max(1, ...bins);
        let path = `M${toSvgX(0)} ${toSvgY(0)}`;
        for (let i = 0; i < 256; i++) path += ` L${toSvgX(i)} ${toSvgY((bins[i]! / max) * CURVE_MAX)}`;
        return `${path} L${toSvgX(CURVE_MAX)} ${toSvgY(0)} Z`;
    });

    onMounted(() => {
        try {
            const scale = Math.min(1, HISTOGRAM_SAMPLE_SIZE / Math.max(props.image.width, props.image.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(props.image.width * scale));
            canvas.height = Math.max(1, Math.round(props.image.height * scale));
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) throw new Error('unavailable');
            context.drawImage(props.image, 0, 0, canvas.width, canvas.height);
            const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
            histograms.value = {
                rgb: computeHistogram(data),
                red: computeChannelHistogram(data, 0),
                green: computeChannelHistogram(data, 1),
                blue: computeChannelHistogram(data, 2),
            };
        } catch {
            histogramError.value = true;
        }
    });

    watch(
        [curves, showPreview],
        ([value, enabled]) => emit('preview', enabled && isValidCurves(value) && !isIdentityCurves(value) ? cloneCurves(value) : null),
        { deep: true },
    );

    function pointerToCurve(event: PointerEvent): { x: number, y: number } | null {
        const rect = graph.value?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return null;
        const x = ((event.clientX - rect.left) / rect.width) * VIEW - PAD;
        const y = CURVE_MAX - (((event.clientY - rect.top) / rect.height) * VIEW - PAD);
        return { x: Math.round(x), y: Math.round(y) };
    }

    function hitTest(event: MouseEvent): { target: { x: number, y: number }, index: number } | null {
        const rect = graph.value?.getBoundingClientRect();
        const target = pointerToCurve(event as PointerEvent);
        if (!rect || !target) return null;
        let nearest = -1;
        let nearestDistance = Infinity;
        points.value.forEach((p, i) => {
            const distance = Math.hypot(p.x - target.x, p.y - target.y);
            if (distance < nearestDistance) {
                nearest = i;
                nearestDistance = distance;
            }
        });
        return { target, index: nearestDistance <= HIT_RADIUS * (VIEW / rect.width) ? nearest : -1 };
    }

    // Pointer capture retargets dblclick to the SVG, so hit-test here instead of on the circles.
    function onDoubleClick(event: MouseEvent) {
        const hit = hitTest(event);
        if (hit && hit.index >= 0) remove(hit.index);
    }

    function onPointerDown(event: PointerEvent) {
        if (props.disabled || dragPointerId !== null || !graph.value) return;
        const hit = hitTest(event);
        if (!hit) return;
        const { target } = hit;
        dragIndex = hit.index >= 0
            ? hit.index
            : insertPoint(points.value, target.x, target.y);
        selected.value = dragIndex;
        focusPoint(dragIndex);
        dragPointerId = event.pointerId;
        graph.value.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
        if (props.disabled || dragPointerId !== event.pointerId || dragIndex === null) return;
        const target = pointerToCurve(event);
        if (!target) return;
        movePoint(points.value, dragIndex, target.x, target.y);
    }

    function onPointerUp(event: PointerEvent) {
        if (dragPointerId !== event.pointerId) return;
        dragIndex = null;
        dragPointerId = null;
        if (graph.value?.hasPointerCapture(event.pointerId)) graph.value.releasePointerCapture(event.pointerId);
    }

    function remove(index: number) {
        if (props.disabled) return;
        if (removePoint(points.value, index)) {
            selected.value = Math.min(index, points.value.length - 1);
            focusPoint(selected.value);
        }
    }

    // preventDefault on pointerdown plus pointer capture stops the browser from focusing the point,
    // so keyboard actions (Delete, arrows) need focus moved explicitly.
    function focusPoint(index: number) {
        void nextTick(() => {
            const circles = graph.value?.querySelectorAll<SVGElement>('.graph__point');
            circles?.[index]?.focus();
        });
    }

    function onKeyDown(index: number, event: KeyboardEvent) {
        if (props.disabled) return;
        const point = points.value[index];
        if (!point) return;
        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            remove(index);
            return;
        }
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
        const dy = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
        if (dx === 0 && dy === 0) return;
        event.preventDefault();
        movePoint(points.value, index, point.x + dx, point.y + dy);
    }

    function onField(axis: 'x' | 'y', event: Event) {
        const point = selectedPoint.value;
        const input = event.target as HTMLInputElement;
        if (!point || input.value.trim() === '' || !Number.isFinite(input.valueAsNumber)) {
            input.value = String(point?.[axis] ?? '');
            return;
        }
        const value = Math.round(input.valueAsNumber);
        movePoint(points.value, selected.value, axis === 'x' ? value : point.x, axis === 'y' ? value : point.y);
        input.value = String(point[axis]);
    }

    function reset() {
        curves.value = defaultCurves();
        selectedByChannel.value = { rgb: 0, red: 0, green: 0, blue: 0 };
    }

    function apply() {
        if (!props.disabled && valid.value && !unchanged.value) emit('apply', cloneCurves(curves.value));
    }

    function cancel() {
        emit('preview', null);
        emit('cancel');
    }
</script>

<template>
    <ToolModal
        title="Curves"
        apply-label="Apply curves"
        :can-apply="valid && !unchanged"
        :busy="disabled"
        :error="error"
        compact-on-small-screens
        scroll-body
        @apply="apply"
        @cancel="cancel"
    >
        <div class="curves">
            <div class="field field--channel">
                <label :for="`${idPrefix}-channel`">Channel</label>
                <BaseSelect :id="`${idPrefix}-channel`" v-model="channel" :options="channelOptions"
                    class="field__input channel-select__input" />
            </div>

            <svg
                ref="graph"
                class="graph"
                :viewBox="`0 0 ${VIEW} ${VIEW}`"
                role="group"
                aria-label="Curve graph"
                aria-description="Click to add points; drag to adjust. Arrow keys nudge (Shift for 10). Double-click or Delete removes a point."
                @pointerdown.prevent="onPointerDown"
                @pointermove="onPointerMove"
                @pointerup="onPointerUp"
                @dblclick="onDoubleClick"
                @pointercancel="onPointerUp"
                @lostpointercapture="onPointerUp"
            >
                <rect :x="PAD" :y="PAD" :width="CURVE_MAX" :height="CURVE_MAX" class="graph__bg" />
                <path v-if="histogramPath" :d="histogramPath" class="graph__histogram" />
                <g class="graph__grid" aria-hidden="true">
                    <template v-for="i in 3" :key="i">
                        <line :x1="PAD + (CURVE_MAX * i) / 4" :y1="PAD" :x2="PAD + (CURVE_MAX * i) / 4" :y2="PAD + CURVE_MAX" />
                        <line :x1="PAD" :y1="PAD + (CURVE_MAX * i) / 4" :x2="PAD + CURVE_MAX" :y2="PAD + (CURVE_MAX * i) / 4" />
                    </template>
                    <line class="graph__diagonal" :x1="PAD" :y1="PAD + CURVE_MAX" :x2="PAD + CURVE_MAX" :y2="PAD" />
                </g>
                <path :d="curvePath" class="graph__curve" :class="`graph__curve--${channel}`" />
                <circle
                    v-for="(point, index) in points"
                    :key="index"
                    class="graph__point"
                    :class="{ 'is-selected': index === selected }"
                    :cx="toSvgX(point.x)"
                    :cy="toSvgY(point.y)"
                    r="5"
                    tabindex="0"
                    role="slider"
                    :aria-label="`Curve point ${index + 1}`"
                    :aria-valuenow="point.y"
                    :aria-valuetext="`Input ${point.x}, output ${point.y}`"
                    aria-valuemin="0"
                    aria-valuemax="255"
                    @focus="selected = index"
                    @keydown="onKeyDown(index, $event)"
                />
            </svg>
            <p v-if="histogramError" class="hint">Histogram unavailable.</p>

            <div class="fields">
                <label class="field" :for="`${idPrefix}-input`">
                    Input
                    <BaseNumberInput :id="`${idPrefix}-input`" class="field__input" variant="field" min="0" max="255" step="1"
                        :value="selectedPoint?.x" @change="onField('x', $event)" />
                </label>
                <label class="field" :for="`${idPrefix}-output`">
                    Output
                    <BaseNumberInput :id="`${idPrefix}-output`" class="field__input" variant="field" min="0" max="255" step="1"
                        :value="selectedPoint?.y" @change="onField('y', $event)" />
                </label>
                <BaseButton variant="secondary" class="reset-button" :disabled="unchanged" @click="reset">Reset</BaseButton>
            </div>
            <label class="preview-toggle">
                <BaseCheckbox v-model="showPreview" />
                Preview
            </label>
        </div>
    </ToolModal>
</template>

<style scoped>
.curves {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.graph {
    display: block;
    flex-shrink: 0;
    width: 340px;
    aspect-ratio: 1;
    margin: 0 auto;
    touch-action: none;
    cursor: crosshair;
    user-select: none;
}

.graph__bg {
    fill: var(--color-bg);
    stroke: var(--color-border);
}

.graph__histogram {
    fill: #c9d1d9;
    opacity: 0.3;
}

.graph__grid line {
    stroke: var(--color-border);
    stroke-width: 1;
}

.graph__grid .graph__diagonal {
    stroke-dasharray: 4 4;
}

.graph__curve {
    fill: none;
    stroke: #fff;
    stroke-width: 2;
}

.graph__curve--red {
    stroke: #f87171;
}

.graph__curve--green {
    stroke: #4ade80;
}

.graph__curve--blue {
    stroke: #60a5fa;
}

.graph__point {
    fill: var(--color-bg);
    stroke: #fff;
    stroke-width: 2;
    cursor: move;
}

.graph__point.is-selected {
    fill: #fff;
    stroke: var(--color-accent);
}

.graph__point:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
}

.hint {
    color: var(--color-text-muted);
    font-size: 12px;
}

.fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
    align-items: end;
    gap: 12px;
}

.field {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 6px;
}

.field--channel {
    max-width: 50%;
}

.field--channel :deep(.channel-select__input) {
    width: 100%;
    min-width: 0;
    min-height: 34px;
    padding: 6px 32px 6px 10px;
    color: var(--color-text);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    font: inherit;
}

.field--channel :deep(.channel-select__input:focus-visible),
.preview-toggle :deep(input:focus-visible) {
    outline: 1px solid var(--color-focus);
    outline-offset: 0;
}

.preview-toggle {
    display: flex;
    align-items: center;
    align-self: flex-start;
    gap: 6px;
    cursor: pointer;
}

.reset-button {
    min-height: 34px;
    padding: 4px 12px;
}
</style>

<style scoped src="@/components/editor/controls/curvesResponsive.css"></style>
