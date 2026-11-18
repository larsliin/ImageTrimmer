<script setup lang="ts">
    import { computed } from 'vue';
    import { MAX_STRAIGHTEN_ANGLE, type CropRect } from '@/lib/crop';
    import { MAX_LEVEL_ANGLE } from '@/lib/straighten';
    import type { Size } from '@/lib/zoom';
    import FloatingToolbar from '../chrome/FloatingToolbar.vue';
    import { BaseAlert, BaseIconButton } from 'chrome-extension-component-library';
    import BaseRangeInput from '@/components/bascomponents/BaseRangeInput.vue';
    import BaseCheckbox from '@/components/bascomponents/BaseCheckbox.vue';
    import BaseNumberInput from '@/components/bascomponents/BaseNumberInput.vue';

    const props = defineProps<{
        image: Size
        crop: CropRect
        disabled: boolean
        dragging: boolean
        valid: boolean
        unchanged: boolean
        straighten?: boolean
        canStraighten?: boolean
    }>();
    const maxAngle = computed(() => props.straighten ? MAX_LEVEL_ANGLE : MAX_STRAIGHTEN_ANGLE);
    const toolName = computed(() => props.straighten ? 'Straighten' : 'Crop');
    const actionName = computed(() => props.straighten ? 'straighten' : 'crop');

    const emit = defineEmits<{
        'update:crop': [crop: CropRect]
        'manual-change': [event: Event]
        apply: []
        cancel: []
        straighten: []
    }>();

    const angle = defineModel<number>('angle', { required: true });
    const snapToPixel = defineModel<boolean>('snapToPixel', { required: true });
    const validationMessage = computed(() => {
        if (!props.straighten) return 'Invalid crop or angle';
        return `Enter an angle within ±${maxAngle.value}°.`;
    });

    function updateCrop(field: keyof CropRect, value: number) {
        emit('update:crop', { ...props.crop, [field]: value });
    }

    function displayDimension(value: number): number {
        return Number.isFinite(value) ? Number(value.toFixed(1)) : value;
    }

    const cropX = computed({ get: () => props.crop.x, set: (value: number) => updateCrop('x', value) });
    const cropY = computed({ get: () => props.crop.y, set: (value: number) => updateCrop('y', value) });
    const cropWidth = computed({ get: () => displayDimension(props.crop.width), set: (value: number) => updateCrop('width', value) });
    const cropHeight = computed({ get: () => displayDimension(props.crop.height), set: (value: number) => updateCrop('height', value) });

    function zeroIfEmpty(event: FocusEvent, field: keyof CropRect | 'angle') {
        if ((event.target as HTMLInputElement).value !== '') return;
        if (field === 'angle') angle.value = 0;
        else updateCrop(field, 0);
    }
</script>

<template>
    <Teleport defer to="#editor-tool-controls">
        <FloatingToolbar :label="`${toolName} toolbar`">
            <!-- Measured angles can be finer than the input step; the overlay validates Straighten. -->
            <form
                class="crop-controls"
                :class="{ 'is-straighten': straighten }"
                :aria-label="`${toolName} controls`"
                :novalidate="straighten"
                @submit.prevent="emit('apply')"
                @input="emit('manual-change', $event)"
                @keydown.esc.prevent="emit('cancel')"
            >
                <fieldset :disabled="disabled || dragging">
                    <div class="crop-fields">
                        <template v-if="!straighten">
                            <label>X <BaseNumberInput v-model.number="cropX" aria-label="Crop X" min="0"
                                :max="image.width - 1" required :step="snapToPixel ? 1 : 'any'" @blur="zeroIfEmpty($event, 'x')" /></label>
                            <label>Y <BaseNumberInput v-model.number="cropY" aria-label="Crop Y" min="0"
                                :max="image.height - 1" required :step="snapToPixel ? 1 : 'any'" @blur="zeroIfEmpty($event, 'y')" /></label>
                            <label>Width <BaseNumberInput v-model.number="cropWidth" aria-label="Crop width" min="1"
                                :max="displayDimension(image.width - crop.x)" required :step="snapToPixel ? 1 : 'any'"
                                @blur="zeroIfEmpty($event, 'width')" /></label>
                            <label>Height <BaseNumberInput v-model.number="cropHeight" aria-label="Crop height" min="1"
                                :max="displayDimension(image.height - crop.y)" required :step="snapToPixel ? 1 : 'any'"
                                @blur="zeroIfEmpty($event, 'height')" /></label>
                        </template>
                        <label v-if="!straighten" class="crop-snap">
                            <BaseCheckbox
                                v-model="snapToPixel"
                                aria-label="Snap to pixel"
                                title="Keep crop edges aligned to source pixels while dragging."
                            />
                            Snap to pixel
                        </label>
                        <span class="crop-divider" role="separator" aria-orientation="vertical"></span>
                        <label class="crop-angle-slider" @keydown.enter.prevent.stop="emit('apply')">{{ straighten ? 'Angle' : 'Straighten' }}
                            <BaseRangeInput v-model.number="angle" class="crop-angle-range" aria-label="Straighten angle slider"
                                :min="-maxAngle" :max="maxAngle" step="0.1" />
                        </label>
                        <label @keydown.enter.prevent.stop="emit('apply')"><BaseNumberInput v-model.number="angle" aria-label="Straighten angle in degrees"
                            :min="-maxAngle" :max="maxAngle" step="0.1" required @blur="zeroIfEmpty($event, 'angle')" /> deg</label>
                        <BaseIconButton v-if="straighten" variant="secondary" type="button" class="icon-button"
                            label="Straighten" title="Straighten" :disabled="disabled || dragging || !canStraighten"
                            @click="emit('straighten')">
                            <i class="bi bi-hr" aria-hidden="true"></i>
                        </BaseIconButton>
                        <BaseIconButton v-if="!straighten" variant="secondary" class="icon-button" label="Reset angle" title="Reset angle" :disabled="angle === 0" @click="angle = 0">
                            <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
                        </BaseIconButton>
                    </div>
                    <BaseAlert v-if="!valid && !dragging" class="crop-error" :message="validationMessage"
                        :title="straighten ? validationMessage : `Enter a non-empty crop inside the image bounds and an angle within ±${maxAngle}°.`" />
                    <div class="crop-actions">
                        <span class="crop-divider" role="separator" aria-orientation="vertical"></span>
                        <BaseIconButton variant="primary" type="submit" class="icon-button" :label="`Apply ${actionName}`"
                            :title="`Apply ${actionName}`" :disabled="!valid || unchanged">
                            <i class="bi bi-check-lg" aria-hidden="true"></i>
                        </BaseIconButton>
                        <BaseIconButton variant="secondary" class="icon-button" :label="`Cancel ${actionName}`"
                            :title="`Cancel ${actionName}`" @click="emit('cancel')">
                            <i class="bi bi-x-lg" aria-hidden="true"></i>
                        </BaseIconButton>
                    </div>
                </fieldset>
            </form>
        </FloatingToolbar>
    </Teleport>
</template>

<style scoped>
.crop-controls {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 8px;
    width: max-content;
    box-sizing: border-box;
    padding: 0;
    white-space: nowrap;
}

.crop-error.alert {
    flex: 0 1 auto;
    gap: 4px;
    max-width: 240px;
    margin-left: auto;
    padding: 2px 4px;
    font-size: 12px;
    white-space: normal;
}

.crop-error :deep(.alert-icon) {
    font-size: 12px;
}

.crop-error + .crop-actions {
    margin-left: 0;
}

fieldset {
    display: flex;
    flex: 1;
    flex-wrap: nowrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 0;
    border: 0;
}

.crop-fields {
    display: flex;
    align-items: center;
    gap: 8px;
}

.crop-divider {
    height: 24px;
    border-left: 1px solid var(--color-border);
}

.crop-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
}

.crop-fields input {
    height: 30px;
    padding: 4px 8px;
    color: var(--color-text);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    font: inherit;
}

input[type='range'] {
    appearance: none;
    width: 140px;
    padding: 0;
    background: transparent;
    border: 0;
}

input[type='number'] {
    width: 78px;
}

.crop-controls :deep(input[type='checkbox']) {
    width: 16px;
    height: 16px;
    margin: 0;
    padding: 0;
    accent-color: var(--color-accent);
}

.crop-controls .icon-button {
    width: 30px;
    height: 30px;
    padding: 0;
}

@media (max-width: 1400px) {
    .crop-controls:not(.is-straighten) .crop-angle-slider {
        display: none;
    }

    input[type='number'] {
        width: 60px;
    }
}

.crop-controls .icon-button:disabled {
    opacity: var(--opacity-button-secondary-disabled);
}

.crop-controls .icon-button.primary-button:disabled {
    opacity: 0.4;
}

input:focus-visible {
    outline: 1px solid var(--color-focus);
    outline-offset: 0;
}

.crop-controls .icon-button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
}
</style>
