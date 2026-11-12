<script setup lang="ts">
    import { computed } from 'vue';
    import { MAX_STRAIGHTEN_ANGLE, type CropRect } from '@/lib/crop';
    import type { Size } from '@/lib/zoom';
    import FloatingToolbar from '../chrome/FloatingToolbar.vue';
    import { BaseIconButton } from 'chrome-extension-component-library';
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
    }>();

    const emit = defineEmits<{
        'update:crop': [crop: CropRect]
        'manual-change': [event: Event]
        apply: []
        cancel: []
    }>();

    const angle = defineModel<number>('angle', { required: true });
    const snapToPixel = defineModel<boolean>('snapToPixel', { required: true });

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
        <FloatingToolbar label="Crop toolbar">
            <form
                class="crop-controls"
                aria-label="Crop controls"
                @submit.prevent="emit('apply')"
                @input="emit('manual-change', $event)"
                @keydown.esc.prevent="emit('cancel')"
            >
                <fieldset :disabled="disabled || dragging">
                    <div class="crop-fields">
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
                        <label class="crop-snap">
                            <BaseCheckbox
                                v-model="snapToPixel"
                                aria-label="Snap to pixel"
                                title="Keep crop edges aligned to source pixels while dragging."
                            />
                            Snap to pixel
                        </label>
                        <span class="crop-divider" role="separator" aria-orientation="vertical"></span>
                        <label class="crop-angle-slider">Straighten
                            <BaseRangeInput v-model.number="angle" class="crop-angle-range" aria-label="Straighten angle slider"
                                :min="-MAX_STRAIGHTEN_ANGLE" :max="MAX_STRAIGHTEN_ANGLE" step="0.1" />
                        </label>
                        <label><BaseNumberInput v-model.number="angle" aria-label="Straighten angle in degrees"
                            :min="-MAX_STRAIGHTEN_ANGLE" :max="MAX_STRAIGHTEN_ANGLE" step="0.1" required @blur="zeroIfEmpty($event, 'angle')" /> deg</label>
                        <BaseIconButton variant="secondary" class="icon-button" label="Reset angle" title="Reset angle" :disabled="angle === 0" @click="angle = 0">
                            <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
                        </BaseIconButton>
                    </div>
                    <p v-if="!valid && !dragging" class="crop-error" role="alert"
                        :title="`Enter a non-empty crop inside the image bounds and an angle within ±${MAX_STRAIGHTEN_ANGLE}°.`">
                        <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i> Invalid crop or angle
                    </p>
                    <div class="crop-actions">
                        <span class="crop-divider" role="separator" aria-orientation="vertical"></span>
                        <BaseIconButton variant="primary" type="submit" class="icon-button" label="Apply crop" title="Apply crop" :disabled="!valid || unchanged">
                            <i class="bi bi-check-lg" aria-hidden="true"></i>
                        </BaseIconButton>
                        <BaseIconButton variant="secondary" class="icon-button" label="Cancel crop" title="Cancel crop" @click="emit('cancel')">
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

.crop-error {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 0 auto;
    font-size: 12px;
    color: #ffa3a3;
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
    .crop-angle-slider {
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
