<script setup lang="ts">
    import { computed, onMounted, ref, useId, useTemplateRef, watch } from 'vue';
    import {
        DEFAULT_LEVELS,
        MAX_GAMMA,
        MIN_GAMMA,
        clampGamma,
        computeHistogram,
        gammaFromMidpoint,
        isIdentityLevels,
        isValidLevels,
        midpointFromGamma,
        type LevelsParams,
    } from '@/lib/levels';
    import ToolModal from '../dialogs/ToolModal.vue';
    import { BaseButton } from 'chrome-extension-component-library';
    import BaseNumberInput from '@/components/bascomponents/BaseNumberInput.vue';
    import BaseCheckbox from '@/components/bascomponents/BaseCheckbox.vue';

    const HISTOGRAM_SAMPLE_SIZE = 256;

    const props = defineProps<{
        image: ImageBitmap
        disabled: boolean
        error: string | null
    }>();

    const emit = defineEmits<{
        apply: [levels: LevelsParams]
        cancel: []
        preview: [levels: LevelsParams | null]
    }>();

    const levels = ref<LevelsParams>({ ...DEFAULT_LEVELS });
    const showPreview = ref(true);
    const histogramCanvas = useTemplateRef<HTMLCanvasElement>('histogram');
    const track = useTemplateRef<HTMLDivElement>('track');
    const idPrefix = useId();
    const histogramBins = ref<Uint32Array | null>(null);
    const histogramError = ref(false);

    const valid = computed(() => isValidLevels(levels.value));
    const unchanged = computed(() => valid.value && isIdentityLevels(levels.value));
    const midpoint = computed(() => (valid.value ? midpointFromGamma(levels.value) : 127.5));

    const percent = (value: number) => `${(Math.min(255, Math.max(0, value)) / DEFAULT_LEVELS.white) * 100}%`;

    onMounted(() => {
        try {
            const scale = Math.min(1, HISTOGRAM_SAMPLE_SIZE / Math.max(props.image.width, props.image.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(props.image.width * scale));
            canvas.height = Math.max(1, Math.round(props.image.height * scale));
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) throw new Error('unavailable');
            context.drawImage(props.image, 0, 0, canvas.width, canvas.height);
            histogramBins.value = computeHistogram(context.getImageData(0, 0, canvas.width, canvas.height).data);
        } catch {
            histogramError.value = true;
        }
    });

    watch([histogramBins, histogramCanvas], ([bins, canvas]) => {
        if (!bins || !canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;
        const { width, height } = canvas;
        context.clearRect(0, 0, width, height);
        const max = Math.max(1, ...bins);
        context.fillStyle = '#c9d1d9';
        for (let i = 0; i < 256; i++) {
            const barHeight = Math.round((bins[i]! / max) * height);
            context.fillRect(i, height - barHeight, 1, barHeight);
        }
    });

    watch(
        [levels, showPreview],
        ([value, enabled]) => emit('preview', enabled && isValidLevels(value) && !isIdentityLevels(value) ? { ...value } : null),
        { deep: true },
    );

    function valueFromPointer(event: PointerEvent): number {
        const rect = track.value?.getBoundingClientRect();
        if (!rect || rect.width === 0) return 0;
        return Math.round(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * DEFAULT_LEVELS.white);
    }

    function setBlack(value: number) {
        levels.value.black = Math.min(Math.max(0, Math.round(value)), levels.value.white - 1);
    }

    function setWhite(value: number) {
        levels.value.white = Math.max(Math.min(DEFAULT_LEVELS.white, Math.round(value)), levels.value.black + 1);
    }

    function setMidpoint(value: number) {
        const { black, white } = levels.value;
        levels.value.gamma = gammaFromMidpoint(Math.min(white, Math.max(black, value)), black, white);
    }

    type Handle = 'black' | 'mid' | 'white';

    function moveHandle(handle: Handle, value: number) {
        if (!valid.value) return;
        if (handle === 'black') setBlack(value);
        else if (handle === 'white') setWhite(value);
        else setMidpoint(value);
    }

    function onPointerDown(handle: Handle, event: PointerEvent) {
        if (props.disabled || !valid.value) return;
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        (event.currentTarget as HTMLElement).focus();
        moveHandle(handle, valueFromPointer(event));
    }

    function onPointerMove(handle: Handle, event: PointerEvent) {
        if (!(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) return;
        moveHandle(handle, valueFromPointer(event));
    }

    function onKeyDown(handle: Handle, event: KeyboardEvent) {
        const step = event.shiftKey ? 10 : 1;
        const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp'
            ? 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
        if (direction === 0) return;
        event.preventDefault();
        const current = handle === 'black' ? levels.value.black : handle === 'white' ? levels.value.white : midpoint.value;
        moveHandle(handle, Math.round(current) + direction * step);
    }

    function onGammaInput() {
        if (Number.isFinite(levels.value.gamma)) levels.value.gamma = clampGamma(Math.round(levels.value.gamma * 100) / 100);
    }

    function reset() {
        levels.value = { ...DEFAULT_LEVELS };
    }

    function apply() {
        if (!props.disabled && valid.value && !unchanged.value) emit('apply', { ...levels.value });
    }

    function cancel() {
        emit('preview', null);
        emit('cancel');
    }
</script>

<template>
    <ToolModal
        title="Levels"
        apply-label="Apply levels"
        :can-apply="valid && !unchanged"
        :busy="disabled"
        :error="error"
        compact-on-small-screens
        scroll-body
        @apply="apply"
        @cancel="cancel"
    >
        <div class="levels">
            <div class="histogram">
                <canvas
                    ref="histogram"
                    class="histogram__canvas"
                    width="256"
                    height="100"
                    role="img"
                    aria-label="Luminosity histogram of the image"
                ></canvas>
                <p v-if="histogramError" class="histogram__message">Histogram unavailable.</p>
            </div>

            <div ref="track" class="track">
                <div class="track__ramp" aria-hidden="true"></div>
                <button
                    type="button"
                    class="handle handle--black"
                    role="slider"
                    aria-label="Shadows (black point)"
                    :aria-valuemin="0"
                    :aria-valuemax="levels.white - 1"
                    :aria-valuenow="levels.black"
                    :style="{ left: percent(levels.black) }"
                    @pointerdown.prevent="onPointerDown('black', $event)"
                    @pointermove="onPointerMove('black', $event)"
                    @keydown="onKeyDown('black', $event)"
                ></button>
                <button
                    type="button"
                    class="handle handle--mid"
                    role="slider"
                    aria-label="Midtones (gamma)"
                    :aria-valuemin="MIN_GAMMA"
                    :aria-valuemax="MAX_GAMMA"
                    :aria-valuenow="levels.gamma"
                    :style="{ left: percent(midpoint) }"
                    @pointerdown.prevent="onPointerDown('mid', $event)"
                    @pointermove="onPointerMove('mid', $event)"
                    @keydown="onKeyDown('mid', $event)"
                ></button>
                <button
                    type="button"
                    class="handle handle--white"
                    role="slider"
                    aria-label="Highlights (white point)"
                    :aria-valuemin="levels.black + 1"
                    :aria-valuemax="255"
                    :aria-valuenow="levels.white"
                    :style="{ left: percent(levels.white) }"
                    @pointerdown.prevent="onPointerDown('white', $event)"
                    @pointermove="onPointerMove('white', $event)"
                    @keydown="onKeyDown('white', $event)"
                ></button>
            </div>

            <div class="fields">
                <label class="field" :for="`${idPrefix}-black`">
                    Shadows
                    <BaseNumberInput :id="`${idPrefix}-black`" v-model.number="levels.black" class="field__input" variant="field"
                        min="0" max="254" step="1" required />
                </label>
                <label class="field" :for="`${idPrefix}-gamma`">
                    Midtones
                    <BaseNumberInput :id="`${idPrefix}-gamma`" v-model.number="levels.gamma" class="field__input" variant="field"
                        :min="MIN_GAMMA" :max="MAX_GAMMA" step="0.01" required @change="onGammaInput" />
                </label>
                <label class="field" :for="`${idPrefix}-white`">
                    Highlights
                    <BaseNumberInput :id="`${idPrefix}-white`" v-model.number="levels.white" class="field__input" variant="field"
                        min="1" max="255" step="1" required />
                </label>
            </div>

            <p v-if="!valid" class="validation-message" role="alert">
                Shadows must be below highlights (0–255), and midtones between {{ MIN_GAMMA }} and {{ MAX_GAMMA }}.
            </p>
            <div class="footer-row">
                <BaseButton variant="secondary" class="reset-button" :disabled="unchanged" @click="reset">Reset</BaseButton>
                <label class="preview-toggle">
                    <BaseCheckbox v-model="showPreview" />
                    Preview
                </label>
            </div>
        </div>
    </ToolModal>
</template>

<style scoped>
.levels {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.histogram {
    position: relative;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
}

.histogram__canvas {
    display: block;
    width: 100%;
    height: 100px;
}

.histogram__message {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--color-text-muted);
}

.track {
    position: relative;
    height: 28px;
    margin: 0 7px;
}

.track__ramp {
    position: absolute;
    inset: 0 -7px auto;
    height: 8px;
    background: linear-gradient(to right, #000, #fff);
    border: 1px solid var(--color-border);
}

.handle {
    position: absolute;
    top: 10px;
    width: 0;
    height: 0;
    padding: 0;
    background: none;
    border: 7px solid transparent;
    border-top: 0;
    border-bottom: 12px solid;
    transform: translateX(-50%);
    cursor: ew-resize;
    touch-action: none;
    filter: drop-shadow(0 0 1px #fff);
}

.handle--black {
    border-bottom-color: #000;
}

.handle--mid {
    border-bottom-color: #808080;
}

.handle--white {
    border-bottom-color: #fff;
    filter: drop-shadow(0 0 1px #000);
}

.handle:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 3px;
}

.fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
}

.field {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 6px;
}

.preview-toggle :deep(input:focus-visible) {
    outline: 1px solid var(--color-focus);
    outline-offset: 0;
}

.footer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.preview-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
}

.reset-button {
    align-self: flex-start;
    min-height: 30px;
    padding: 4px 10px;
}

.validation-message {
    color: #fecaca;
}

@media (max-width: 1440px), (max-height: 800px) {
    .levels {
        gap: 6px;
    }

    .fields {
        gap: 8px;
    }

    .field {
        gap: 4px;
    }

    .field__input {
        min-height: 30px;
        padding: 4px 8px;
    }
}
</style>
