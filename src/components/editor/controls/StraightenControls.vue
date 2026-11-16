<script setup lang="ts">
    import { BaseIconButton } from 'chrome-extension-component-library';
    import BaseRangeInput from '@/components/bascomponents/BaseRangeInput.vue';
    import BaseNumberInput from '@/components/bascomponents/BaseNumberInput.vue';
    import { MAX_LEVEL_ANGLE } from '@/lib/straighten';
    import FloatingToolbar from '../chrome/FloatingToolbar.vue';

    const props = defineProps<{ disabled: boolean, canStraighten: boolean, canApply: boolean, valid: boolean }>();
    const emit = defineEmits<{ straighten: [], apply: [], cancel: [] }>();
    const angle = defineModel<number>('angle', { required: true });

    function apply() {
        if (!props.disabled && props.valid && props.canApply) emit('apply');
    }

    function zeroIfEmpty(event: FocusEvent) {
        if ((event.target as HTMLInputElement).value === '') angle.value = 0;
    }
</script>

<template>
    <Teleport defer to="#editor-tool-controls">
        <FloatingToolbar label="Straighten toolbar">
            <form class="straighten-controls" aria-label="Straighten controls" novalidate
                @submit.prevent="apply" @keydown.esc.prevent="emit('cancel')">
                <fieldset :disabled="disabled">
                    <label class="straighten-angle-slider" @keydown.enter.prevent.stop="apply">Angle
                        <BaseRangeInput v-model.number="angle" aria-label="Straighten angle slider"
                            :min="-MAX_LEVEL_ANGLE" :max="MAX_LEVEL_ANGLE" step="0.1" />
                    </label>
                    <label @keydown.enter.prevent.stop="apply"><BaseNumberInput v-model.number="angle" aria-label="Straighten angle in degrees"
                        :min="-MAX_LEVEL_ANGLE" :max="MAX_LEVEL_ANGLE" step="0.1" required @blur="zeroIfEmpty" /> deg</label>
                    <BaseIconButton variant="secondary" type="button" class="icon-button" label="Straighten"
                        title="Straighten" :disabled="disabled || !canStraighten" @click="emit('straighten')">
                        <i class="bi bi-hr" aria-hidden="true"></i>
                    </BaseIconButton>
                    <p v-if="!valid" class="straighten-error" role="alert">Enter an angle within ±{{ MAX_LEVEL_ANGLE }}°.</p>
                    <span class="straighten-divider" role="separator" aria-orientation="vertical"></span>
                    <BaseIconButton variant="primary" type="submit" class="icon-button" label="Apply straighten"
                        title="Apply straighten" :disabled="disabled || !valid || !canApply">
                        <i class="bi bi-check-lg" aria-hidden="true"></i>
                    </BaseIconButton>
                    <BaseIconButton variant="secondary" type="button" class="icon-button" label="Cancel straighten"
                        title="Cancel straighten" @click="emit('cancel')">
                        <i class="bi bi-x-lg" aria-hidden="true"></i>
                    </BaseIconButton>
                </fieldset>
            </form>
        </FloatingToolbar>
    </Teleport>
</template>

<style scoped>
.straighten-controls {
    width: max-content;
    white-space: nowrap;
}

fieldset {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
}

label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
}

.straighten-controls :deep(input[type='range']) {
    appearance: none;
    width: 140px;
    padding: 0;
    background: transparent;
    border: 0;
}

.straighten-controls :deep(input[type='number']) {
    box-sizing: border-box;
    width: 78px;
    height: 30px;
    padding: 4px 8px;
    color: var(--color-text);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    font: inherit;
}

.straighten-controls :deep(input:focus-visible) {
    outline: 1px solid var(--color-focus);
    outline-offset: 0;
}

.straighten-error {
    margin: 0;
    font-size: 12px;
    color: var(--color-error);
}

.straighten-divider {
    height: 24px;
    border-left: 1px solid var(--color-border);
}

.icon-button {
    width: 30px;
    height: 30px;
    padding: 0;
}

.straighten-controls :deep(button:focus-visible) {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
}
</style>
