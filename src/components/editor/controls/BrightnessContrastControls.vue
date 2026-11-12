<script setup lang="ts">
    import { computed, ref, useId, watch } from 'vue';
    import {
        DEFAULT_BRIGHTNESS_CONTRAST,
        MAX_BRIGHTNESS_CONTRAST,
        MIN_BRIGHTNESS_CONTRAST,
        isIdentityBrightnessContrast,
        isValidBrightnessContrast,
        type BrightnessContrastParams,
    } from '@/lib/brightnessContrast';
    import ToolModal from '../dialogs/ToolModal.vue';
    import BaseRangeInput from '@/components/bascomponents/BaseRangeInput.vue';
    import BaseCheckbox from '@/components/bascomponents/BaseCheckbox.vue';

    const props = defineProps<{
        image: ImageBitmap
        disabled: boolean
        error: string | null
    }>();

    const emit = defineEmits<{
        apply: [params: BrightnessContrastParams]
        cancel: []
        preview: [params: BrightnessContrastParams | null]
    }>();

    const params = ref<BrightnessContrastParams>({ ...DEFAULT_BRIGHTNESS_CONTRAST });
    const showPreview = ref(true);
    const idPrefix = useId();

    const valid = computed(() => isValidBrightnessContrast(params.value));
    const unchanged = computed(() => valid.value && isIdentityBrightnessContrast(params.value));

    watch(
        [params, showPreview],
        ([value, enabled]) => emit('preview', enabled && isValidBrightnessContrast(value) && !isIdentityBrightnessContrast(value) ? { ...value } : null),
        { deep: true },
    );

    function apply() {
        if (!props.disabled && valid.value && !unchanged.value) emit('apply', params.value);
    }

    function cancel() {
        if (!props.disabled) emit('cancel');
    }
</script>

<template>
    <ToolModal
        title="Brightness/Contrast"
        apply-label="Apply"
        :can-apply="valid && !unchanged"
        :busy="props.disabled"
        :error="error"
        :draggable="true"
        @apply="apply"
        @cancel="cancel"
    >
        <div class="brightness-contrast-content">
            <div class="control-group">
                <div class="control-header">
                    <label :for="`${idPrefix}-brightness`" class="control-label">Brightness</label>
                    <span class="control-value">{{ params.brightness }}</span>
                </div>
                <BaseRangeInput
                    :id="`${idPrefix}-brightness`"
                    v-model.number="params.brightness"
                    :min="MIN_BRIGHTNESS_CONTRAST"
                    :max="MAX_BRIGHTNESS_CONTRAST"
                    step="1"
                    :aria-label="`Brightness: ${params.brightness}`"
                />
            </div>

            <div class="control-group">
                <div class="control-header">
                    <label :for="`${idPrefix}-contrast`" class="control-label">Contrast</label>
                    <span class="control-value">{{ params.contrast }}</span>
                </div>
                <BaseRangeInput
                    :id="`${idPrefix}-contrast`"
                    v-model.number="params.contrast"
                    :min="MIN_BRIGHTNESS_CONTRAST"
                    :max="MAX_BRIGHTNESS_CONTRAST"
                    step="1"
                    :aria-label="`Contrast: ${params.contrast}`"
                />
            </div>

            <div class="preview-section">
                <label class="checkbox-label">
                    <BaseCheckbox v-model="showPreview" class="checkbox" />
                    <span>Live preview</span>
                </label>
            </div>
        </div>
    </ToolModal>
</template>

<style scoped>
.brightness-contrast-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.control-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.control-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.control-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text);
    margin: 0;
}

.control-value {
    font-family: monospace;
    font-size: 12px;
    color: var(--color-text-muted);
    min-width: 35px;
    text-align: right;
}

.preview-section {
    display: flex;
    align-items: center;
    padding-top: 4px;
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--color-text);
    cursor: pointer;
    user-select: none;
}

.checkbox-label :deep(.checkbox) {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: var(--color-accent);
}

.checkbox-label :deep(.checkbox:focus-visible) {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
}

.checkbox-label :deep(.checkbox:disabled) {
    cursor: not-allowed;
    opacity: var(--opacity-input-disabled);
}
</style>
