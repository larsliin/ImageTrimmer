<script setup lang="ts">
    import { useToolDraft } from '@/composables/useToolDraft';
    import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
    import { MAX_RESIZE_DIMENSION, dimensionForPercentage, heightForWidth, isValidResize, widthForHeight } from '@/lib/resize';
    import type { Size } from '@/lib/zoom';
    import FloatingToolbar from '../chrome/FloatingToolbar.vue';
    import { BaseIconButton } from 'chrome-extension-component-library';
    import BaseNumberInput from '@/components/bascomponents/BaseNumberInput.vue';

    const props = defineProps<{
        image: Size
        disabled: boolean
        error: string | null
    }>();

    const emit = defineEmits<{
        apply: [size: Size]
        dirty: [value: boolean]
        cancel: []
    }>();

    type Dimension = 'width' | 'height';
    type InputDimensions = Record<Dimension, number | string>;

    const size = ref<InputDimensions>({ width: props.image.width, height: props.image.height });
    const percentages = ref<InputDimensions>({ width: 100, height: 100 });
    useToolDraft(() => ({ tool: 'resize', width: size.value.width, height: size.value.height }), value => emit('dirty', value));

    const lockRatio = shallowRef(true);
    let previousFocus: HTMLElement | null = null;

    onMounted(() => {
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    });

    onBeforeUnmount(() => {
        void nextTick(() => {
            if (previousFocus?.isConnected) previousFocus.focus();
        });
    });

    const outputSize = computed(() => {
        const { width, height } = size.value;
        if (typeof width !== 'number' || typeof height !== 'number') return null;
        const result = { width, height };
        return isValidResize(result) ? result : null;
    });
    const valid = computed(() => outputSize.value !== null);
    const unchanged = computed(() =>
        outputSize.value?.width === props.image.width && outputSize.value?.height === props.image.height,
    );

    function percentageForDimension(dimension: Dimension): number | string {
        const value = size.value[dimension];
        return typeof value === 'number' && Number.isFinite(value) && value > 0
            ? Number((value / props.image[dimension] * 100).toFixed(1))
            : '';
    }

    function onDimensionInput(dimension: Dimension, unit: 'pixels' | 'percentage') {
        const other = dimension === 'width' ? 'height' : 'width';
        if (unit === 'percentage') {
            const input = percentages.value[dimension];
            const percentage = typeof input === 'number' ? Number(input.toFixed(1)) : input;
            percentages.value[dimension] = percentage;
            size.value[dimension] = typeof percentage === 'number'
                ? dimensionForPercentage(props.image[dimension], percentage) ?? ''
                : '';
            if (lockRatio.value) {
                percentages.value[other] = percentage;
                size.value[other] = typeof percentage === 'number'
                    ? dimensionForPercentage(props.image[other], percentage) ?? ''
                    : '';
            }
            return;
        }
        percentages.value[dimension] = percentageForDimension(dimension);
        const value = size.value[dimension];
        if (lockRatio.value && typeof value === 'number' && Number.isSafeInteger(value) && value >= 1) {
            size.value[other] = dimension === 'width'
                ? heightForWidth(value, props.image)
                : widthForHeight(value, props.image);
            percentages.value[other] = percentageForDimension(other);
        }
    }

    function toggleLock() {
        lockRatio.value = !lockRatio.value;
        if (lockRatio.value) onDimensionInput('width', 'pixels');
    }

    function apply() {
        if (!props.disabled && outputSize.value && !unchanged.value) emit('apply', { ...outputSize.value });
    }

    function cancel() {
        if (!props.disabled) emit('cancel');
    }
</script>

<template>
    <Teleport defer to="#editor-tool-controls">
        <FloatingToolbar label="Resize toolbar" @keydown.esc.stop.prevent="cancel">
            <form class="resize-form" aria-label="Resize image" :aria-busy="disabled" @submit.prevent="apply">
                <fieldset class="resize-controls" :disabled="disabled">
                    <label class="dimension-label">
                        Width px
                        <BaseNumberInput v-model.number="size.width" class="dimension-input" aria-label="Resize width" min="1"
                            :max="MAX_RESIZE_DIMENSION" required step="1" @input="onDimensionInput('width', 'pixels')" />
                    </label>
                    <label class="dimension-label">
                        Height px
                        <BaseNumberInput v-model.number="size.height" class="dimension-input" aria-label="Resize height" min="1"
                            :max="MAX_RESIZE_DIMENSION" required step="1" @input="onDimensionInput('height', 'pixels')" />
                    </label>
                    <span class="resize-divider" role="separator" aria-orientation="vertical"></span>
                    <label class="dimension-label">
                        Width %
                        <BaseNumberInput v-model.number="percentages.width" class="dimension-input" aria-label="Resize width percentage"
                            min="0" step="0.1" required @input="onDimensionInput('width', 'percentage')" />
                    </label>
                    <label class="dimension-label">
                        Height %
                        <BaseNumberInput v-model.number="percentages.height" class="dimension-input" aria-label="Resize height percentage"
                            min="0" step="0.1" required @input="onDimensionInput('height', 'percentage')" />
                    </label>
                    <div class="resize-actions">
                        <BaseIconButton
                            variant="secondary"
                            class="resize-button"
                            :active="lockRatio"
                            :label="lockRatio ? 'Aspect ratio locked' : 'Aspect ratio unlocked'"
                            :title="lockRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'"
                            @click="toggleLock"
                        >
                            <i aria-hidden="true" class="bi" :class="lockRatio ? 'bi-lock-fill' : 'bi-unlock'"></i>
                        </BaseIconButton>
                        <span class="resize-divider" role="separator" aria-orientation="vertical"></span>
                        <BaseIconButton variant="primary" type="submit" class="resize-button resize-button--apply" label="Apply resize" title="Apply resize"
                            :disabled="!valid || unchanged">
                            <i class="bi bi-check-lg" aria-hidden="true"></i>
                        </BaseIconButton>
                        <BaseIconButton variant="secondary" class="resize-button" label="Cancel resize" title="Cancel resize" @click="cancel">
                            <i class="bi bi-x-lg" aria-hidden="true"></i>
                        </BaseIconButton>
                    </div>
                </fieldset>
                <p v-if="!valid" class="validation-message" role="alert">
                    Enter whole-pixel dimensions between 1 and {{ MAX_RESIZE_DIMENSION }} px, or positive percentages within those bounds.
                </p>
                <p v-if="error" class="validation-message" role="alert">{{ error }}</p>
                <p v-if="disabled" class="resize-status" role="status">Processing image...</p>
            </form>
        </FloatingToolbar>
    </Teleport>
</template>

<style scoped>
.resize-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: max-content;
}

.resize-controls {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
}

.dimension-label {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 4px;
    font-size: 12px;
}

.dimension-input {
    width: 64px;
    min-width: 0;
    height: 30px;
    padding: 4px 8px;
    color: var(--color-text);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    font: inherit;
}

.dimension-input:focus-visible {
    outline: 1px solid var(--color-focus);
    outline-offset: 0;
}

.validation-message {
    max-width: 600px;
    white-space: normal;
    color: #fecaca;
}

.resize-status {
    color: var(--color-text-muted);
}

.resize-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.resize-divider {
    height: 24px;
    border-left: 1px solid var(--color-border);
}

.resize-button {
    width: 30px;
    height: 30px;
    padding: 0;
}

.resize-button--apply:disabled {
    opacity: 0.4;
}

.resize-button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
}
</style>
