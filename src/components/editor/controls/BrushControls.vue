<script setup lang="ts">
    import { nextTick, onBeforeUnmount, onMounted, useTemplateRef } from 'vue';
    import FloatingToolbar from '../chrome/FloatingToolbar.vue';
    import { BaseAlert, BaseIconButton } from 'chrome-extension-component-library';
    import BaseNumberInput from '@/components/bascomponents/BaseNumberInput.vue';
    import BaseRangeInput from '@/components/bascomponents/BaseRangeInput.vue';
    import { isValidBrushSettings, type BrushSettings } from '@/lib/brush';

    const props = defineProps<{
        settings: BrushSettings
        disabled: boolean
        canApply: boolean
        error: string | null
    }>();

    const emit = defineEmits<{
        'update:settings': [settings: BrushSettings]
        apply: []
        cancel: []
    }>();

    const thicknessSlider = useTemplateRef<InstanceType<typeof BaseRangeInput>>('thicknessSlider');
    let previousFocus: HTMLElement | null = null;

    // Moving focus off the tool button keeps Enter from toggling the tool closed; only a focused Apply submits.
    onMounted(() => {
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        thicknessSlider.value?.focus();
    });

    onBeforeUnmount(() => {
        void nextTick(() => {
            if (previousFocus?.isConnected) previousFocus.focus();
        });
    });

    function updateSetting<K extends keyof BrushSettings>(key: K, value: BrushSettings[K]) {
        const settings = { ...props.settings, [key]: value };
        if (isValidBrushSettings(settings)) emit('update:settings', settings);
    }

    function commitThickness(event: FocusEvent) {
        if (!(event.target instanceof HTMLInputElement)) return;
        const input = event.target;
        const value = input.valueAsNumber;
        const thickness = Number.isFinite(value) ? Math.min(500, Math.max(1, Math.round(value))) : props.settings.thickness;
        updateSetting('thickness', thickness);
        input.value = String(thickness);
    }
</script>

<template>
    <Teleport defer to="#editor-tool-controls">
        <FloatingToolbar label="Brush toolbar">
            <form class="brush-controls" aria-label="Brush controls" :aria-busy="disabled" @submit.prevent="emit('apply')">
                <fieldset class="brush-controls__fields" :disabled="disabled">
                    <div class="brush-control">
                        <label class="brush-control__slider">
                            <span>Thickness</span>
                            <BaseRangeInput
                                ref="thicknessSlider"
                                :model-value="settings.thickness"
                                aria-label="Brush thickness slider"
                                min="1"
                                max="500"
                                step="1"
                                @update:model-value="updateSetting('thickness', $event ?? settings.thickness)"
                            />
                        </label>
                        <label class="brush-control__number">
                            <BaseNumberInput
                                class="brush-control__thickness"
                                :value="settings.thickness"
                                aria-label="Brush thickness in pixels"
                                min="1"
                                max="500"
                                step="1"
                                required
                                @input="updateSetting('thickness', ($event.target as HTMLInputElement).valueAsNumber)"
                                @blur="commitThickness"
                                @keydown.enter.prevent
                            />
                            px
                        </label>
                    </div>
                    <span class="brush-controls__divider" role="separator" aria-orientation="vertical"></span>
                    <label class="brush-control brush-control--color">
                        <span>Color</span>
                        <input
                            type="color"
                            :value="settings.color"
                            aria-label="Brush color"
                            @input="updateSetting('color', ($event.target as HTMLInputElement).value)"
                        />
                        <output>{{ settings.color.toUpperCase() }}</output>
                    </label>
                    <span class="brush-controls__divider" role="separator" aria-orientation="vertical"></span>
                    <BaseIconButton variant="primary" type="submit" class="brush-controls__action"
                        label="Apply brush strokes" title="Apply brush strokes" :disabled="!canApply">
                        <i class="bi bi-check-lg" aria-hidden="true"></i>
                    </BaseIconButton>
                    <BaseIconButton variant="secondary" class="brush-controls__action" label="Cancel brush strokes"
                        title="Cancel brush strokes" @click="emit('cancel')">
                        <i class="bi bi-x-lg" aria-hidden="true"></i>
                    </BaseIconButton>
                </fieldset>
                <BaseAlert v-if="error" class="brush-controls__error" :message="error" />
                <p v-if="disabled" class="brush-controls__status" role="status">Processing image...</p>
            </form>
        </FloatingToolbar>
    </Teleport>
</template>

<style scoped>
.brush-controls {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 12px;
    width: max-content;
    padding: 0;
    white-space: nowrap;
}

.brush-controls__fields {
    display: flex;
    flex: 1;
    flex-wrap: nowrap;
    align-items: center;
    gap: 10px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
}

.brush-control {
    display: grid;
    flex: 0 0 auto;
    grid-template-columns: auto auto;
    align-items: center;
    gap: 6px;
    color: var(--color-text);
    font-size: 12px;
}

.brush-control__slider {
    display: grid;
    grid-template-columns: auto 120px;
    align-items: center;
    gap: 6px;
}

.brush-control__number {
    display: flex;
    align-items: center;
    gap: 4px;
}

.brush-control__thickness {
    width: 78px;
    height: 30px;
    padding: 4px 8px;
    color: var(--color-text);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    font: inherit;
}

.brush-control__thickness:focus-visible {
    outline: 1px solid var(--color-focus);
    outline-offset: 0;
}

.brush-control output {
    min-width: 42px;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
    text-align: center;
}

.brush-control--color {
    grid-template-columns: auto 32px auto;
}

.brush-control--color input {
    width: 30px;
    height: 30px;
    padding: 2px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg);
    cursor: pointer;
}

.brush-control--color output {
    min-width: 56px;
}

.brush-controls__divider {
    flex: 0 0 auto;
    height: 24px;
    border-left: 1px solid var(--color-border);
}

.brush-controls__action {
    flex: 0 0 30px;
    width: 30px;
    height: 30px;
    padding: 0;
}

.brush-controls__action:focus-visible,
.brush-control--color input:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
}

.brush-controls__error.alert {
    flex: 0 1 auto;
    gap: 4px;
    max-width: 240px;
    padding: 2px 4px;
    font-size: 12px;
    white-space: normal;
}

.brush-controls__error :deep(.alert-icon) {
    font-size: 12px;
}

.brush-controls__status {
    flex: 0 0 auto;
    margin: 0;
    color: var(--color-text-muted);
    font-size: 12px;
    white-space: nowrap;
}

@media (max-width: 1400px) {
    .brush-control__slider {
        grid-template-columns: auto 80px;
    }

    .brush-control__thickness {
        width: 60px;
    }

    .brush-control--color {
        grid-template-columns: auto 32px;
    }

    .brush-control--color output {
        display: none;
    }
}
</style>
