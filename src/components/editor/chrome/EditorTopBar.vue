<script setup lang="ts">
    import { computed, nextTick, shallowRef, useTemplateRef } from 'vue';
    import type { ImageInfo } from '@/types/editor';
    import BaseButton from '@/components/bascomponents/BaseButton.vue';
    import DropdownSelect, { type DropdownOption } from '@/components/shared/DropdownSelect.vue';
    import type { ThemeMode } from '@/lib/theme';

    const props = defineProps<{
        image: ImageInfo | null
        busy: boolean
        isDarkMode: boolean
        themeMode: ThemeMode
        rulersEnabled: boolean
        navigationAnimationsEnabled: boolean
        prefersReducedMotion: boolean
    }>();

    const emit = defineEmits<{
        rename: [fileName: string]
        'select-theme': [mode: ThemeMode]
        'toggle-rulers': []
        'toggle-navigation-animations': []
        close: []
    }>();

    const isEditing = shallowRef(false);
    const draftName = shallowRef('');
    const suppressFilenameFocusRing = shallowRef(false);
    const filenameAction = useTemplateRef<HTMLButtonElement>('filenameAction');
    const filenameInput = useTemplateRef<HTMLInputElement>('filenameInput');
    const themeOptions: DropdownOption[] = [
        { value: 'light', label: 'Light mode' },
        { value: 'dark', label: 'Dark mode' },
        { value: 'auto', label: 'Auto' },
    ];

    function selectTheme(value: string) {
        if (value === 'light' || value === 'dark' || value === 'auto') emit('select-theme', value);
    }

    const fileName = computed(() => props.image?.fileName ?? 'No image');
    const fileNameBase = computed(() => {
        const dot = fileName.value.lastIndexOf('.');
        return dot > 0 ? fileName.value.slice(0, dot) : fileName.value;
    });
    const fileExtension = computed(() => {
        if (!props.image) return '';
        const dot = fileName.value.lastIndexOf('.');
        return dot > 0 ? fileName.value.slice(dot) : '';
    });
    const displayedName = computed({
        get: () => isEditing.value ? draftName.value : fileNameBase.value,
        set: (value: string) => { draftName.value = value; },
    });
    async function startRenaming() {
        if (!props.image || props.busy || isEditing.value) return;
        suppressFilenameFocusRing.value = false;
        draftName.value = fileNameBase.value;
        isEditing.value = true;
        await nextTick();
        filenameInput.value?.focus();
        filenameInput.value?.setSelectionRange(0, draftName.value.length);
    }

    async function finishRenaming(cancel = false, restoreFocus = false) {
        if (!isEditing.value) return;
        if (!cancel) {
            const input = filenameInput.value;
            const name = draftName.value.trim().replace(/\.(?:jpe?g|png|webp)$/i, '');
            input?.setCustomValidity(name ? '' : 'Enter a filename without an extension.');
            if (input && !input.reportValidity()) return;
            emit('rename', name);
        }
        isEditing.value = false;
        if (restoreFocus) {
            suppressFilenameFocusRing.value = true;
            await nextTick();
            filenameAction.value?.focus();
        }
    }

</script>

<template>
    <header class="top-bar">
        <div class="top-bar__brand" aria-hidden="true">
            <img class="top-bar__logo" src="/favicon.svg" alt="" />
        </div>
        <dl class="document-details">
            <div class="document-detail document-detail--file">
                <dt>
                    <i class="document-detail__icon bi bi-file-earmark-image" aria-hidden="true"></i>
                </dt>
                <dd class="filename-controls" :class="{ 'filename-controls--editing': isEditing }">
                    <button
                        v-if="!isEditing"
                        ref="filenameAction"
                        class="filename-control filename-control--action"
                        type="button"
                        :aria-label="`Rename ${fileName}`"
                        :title="fileName"
                        :disabled="busy || !image"
                        :class="{ 'filename-control--programmatic-return': suppressFilenameFocusRing }"
                        @click="startRenaming"
                        @keydown.space.prevent="startRenaming"
                        @blur="suppressFilenameFocusRing = false"
                    >
                        <span class="filename-field">
                            <span class="filename-base">
                                <span class="filename-base-text">{{ fileNameBase }}</span>
                            </span>
                            <span v-if="fileExtension" class="filename-extension">{{ fileExtension }}</span>
                        </span>
                        <i
                            v-if="image"
                            class="filename-edit-indicator bi bi-pencil"
                            aria-hidden="true"
                        ></i>
                    </button>
                    <div v-else class="filename-control">
                        <div class="filename-field">
                            <div class="filename-base">
                                <input
                                    ref="filenameInput"
                                    v-model="displayedName"
                                    class="filename-input"
                                    type="text"
                                    aria-label="Filename"
                                    required
                                    :title="fileName"
                                    :disabled="busy || !image"
                                    @input="filenameInput?.setCustomValidity('')"
                                    @blur="finishRenaming()"
                                    @keydown.enter.prevent="finishRenaming(false, true)"
                                    @keydown.esc.prevent="finishRenaming(true, true)"
                                />
                            </div>
                            <span v-if="fileExtension" class="filename-extension">{{ fileExtension }}</span>
                        </div>
                        <i
                            v-if="image"
                            class="filename-edit-indicator bi bi-pencil"
                            aria-hidden="true"
                        ></i>
                    </div>
                </dd>
            </div>
        </dl>
        <div class="controls-group">
            <BaseButton
                class="rulers-toggle"
                aria-label="Pixel rulers"
                :aria-pressed="rulersEnabled"
                :title="rulersEnabled ? 'Hide pixel rulers' : 'Show pixel rulers'"
                :disabled="busy || !image"
                @click="emit('toggle-rulers')"
            >
                <i class="bi bi-rulers" aria-hidden="true"></i>
            </BaseButton>
            <BaseButton
                class="navigation-animation-toggle"
                aria-label="Animated zoom and pan"
                :aria-pressed="navigationAnimationsEnabled"
                :title="prefersReducedMotion
                    ? 'Animated zoom and pan are disabled by your system reduced-motion setting'
                    : navigationAnimationsEnabled
                        ? 'Disable animated zoom and pan for better performance'
                        : 'Enable animated zoom and pan'"
                :disabled="prefersReducedMotion"
                @click="emit('toggle-navigation-animations')"
            >
                <i class="bi bi-wind" aria-hidden="true"></i>
            </BaseButton>
            <DropdownSelect
                class="theme-picker"
                label="Theme"
                :model-value="themeMode"
                :options="themeOptions"
                @select="selectTheme"
            >
                <i :class="isDarkMode ? 'bi bi-moon' : 'bi bi-sun'" aria-hidden="true"></i>
            </DropdownSelect>
        </div>
        <BaseButton
            class="close-button"
            aria-label="Close image"
            title="Close and unload the current image"
            :disabled="!image"
            @click="emit('close')"
        >
            <i class="bi bi-x-lg" aria-hidden="true"></i>
        </BaseButton>
    </header>
</template>

<style scoped>
.top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0;
    height: 48px;
    overflow-x: auto;
    padding: 0 12px 0 0;
    background-color: var(--color-panel);
    border-bottom: 1px solid var(--color-border);
}

.top-bar__brand {
    display: grid;
    flex: 0 0 48px;
    place-items: center;
    align-self: stretch;
    border-right: 1px solid var(--color-border);
}

.top-bar__logo {
    display: block;
    width: 28px;
    height: 28px;
}

.document-details {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 12px;
    min-width: 0;
    margin-left: 14px;
}

.rulers-toggle,
.navigation-animation-toggle {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-muted);
    background-color: var(--color-panel-raised);
    cursor: pointer;
}

.rulers-toggle {
    display: flex;
    justify-content: center;
    gap: 5px;
    width: auto;
    margin-left: auto;
    margin-right: 8px;
    padding: 0 8px;
    font-size: 0.75rem;
}

.rulers-toggle:disabled,
.navigation-animation-toggle:disabled {
    opacity: var(--opacity-button-secondary-disabled);
    cursor: default;
}

.rulers-toggle:hover:not(:disabled),
.navigation-animation-toggle:hover:not(:disabled) {
    color: var(--color-text);
    background-color: var(--color-hover);
}

.rulers-toggle:focus-visible,
.navigation-animation-toggle:focus-visible {
    outline: 1px solid var(--color-focus);
    outline-offset: 1px;
}

.controls-group {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px 4px;
    height: 32px;
    background-color: var(--color-panel-raised);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    margin-left: auto;
    margin-right: 12px;
}

.controls-group .rulers-toggle,
.controls-group .navigation-animation-toggle {
    display: grid;
    place-items: center;
    margin: 0;
    padding: 0;
    width: 24px;
    height: 24px;
    background-color: transparent;
    border: none;
    border-radius: 4px;
}

.controls-group .rulers-toggle:hover:not(:disabled),
.controls-group .navigation-animation-toggle:hover:not(:disabled) {
    color: var(--color-text);
    background-color: var(--color-hover);
}

.controls-group .rulers-toggle:focus-visible,
.controls-group .navigation-animation-toggle:focus-visible {
    outline: 1px solid var(--color-focus);
    outline-offset: -3px;
}

.controls-group .rulers-toggle[aria-pressed='true']:not(:disabled),
.controls-group .navigation-animation-toggle[aria-pressed='true']:not(:disabled) {
    color: var(--color-text);
    background-color: var(--color-active);
}

.controls-group .rulers-toggle:active:not(:disabled),
.controls-group .navigation-animation-toggle:active:not(:disabled) {
    box-shadow: inset 0 0 0 1px var(--color-border);
}

.controls-group .rulers-toggle:disabled,
.controls-group .navigation-animation-toggle:disabled {
    opacity: var(--opacity-button-secondary-disabled);
    cursor: default;
}

.controls-group :deep(.dropdown-select__trigger) {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background-color: transparent;
    border: none;
    border-radius: 4px;
}

.controls-group :deep(.dropdown-select__trigger:focus-visible) {
    outline: 1px solid var(--color-focus);
    outline-offset: -3px;
}

.close-button {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    margin-right: 12px;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--color-text-muted);
    background-color: transparent;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
}

.close-button:hover:not(:disabled) {
    color: var(--color-text);
    background-color: var(--color-hover);
}

.close-button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
}

.close-button:disabled {
    opacity: var(--opacity-button-secondary-disabled);
    cursor: default;
}

.document-detail {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--color-text-muted);
}

.document-detail dt {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    color: var(--color-text-muted);
    font-size: 0.6875rem;
    font-weight: 600;
    line-height: 18px;
    letter-spacing: 0.045em;
    text-transform: uppercase;
    white-space: nowrap;
}

.document-detail__icon {
    display: grid;
    flex: 0 0 24px;
    align-self: center;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background-color: var(--color-panel-raised);
    font-size: 12px;
}

.document-detail dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
}

.filename-controls {
    display: flex;
    align-items: center;
    flex: 0 1 auto;
    min-width: 0;
}

.filename-control {
    outline-offset: 1px;
    display: flex;
    align-items: center;
    min-width: 0;
    height: 28px;
    gap: 8px;
    padding: 0;
    border: 0;
    color: var(--color-text);
    background-color: transparent;
    font: inherit;
    text-align: left;
}

.filename-field {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 8px;
    min-width: 0;
    height: 28px;
    padding: 0 3px;
    border: 1px solid transparent;
    border-radius: 5px;
    background-color: transparent;
    font-size: 0.8125rem;
    font-weight: 500;
    line-height: 18px;
    color: var(--color-text);
    transition: background-color 120ms ease, border-color 120ms ease;
}

.filename-control--action:not(:disabled):hover .filename-field,
.filename-controls--editing .filename-field {
    border-color: var(--color-border);
    background-color: var(--color-panel-raised);
}

.filename-control--action:focus-visible:not(.filename-control--programmatic-return) .filename-field {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
}

.filename-control--action:disabled {
    color: var(--color-text-muted);
    cursor: default;
}

.filename-control--action {
    appearance: none;
    cursor: pointer;
    outline: none;
}

.filename-base {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
}

.filename-base-text {
    display: block;
    min-width: .5rem;
    max-width: min(18rem, 40vw);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.filename-input {
    field-sizing: content;
    flex: 1 1 auto;
    width: auto;
    min-width: .5rem;
    max-width: min(18rem, 40vw);
    height: 18px;
    padding: 0;
    border: 0;
    outline: none;
    font: inherit;
    color: inherit;
    background-color: transparent;
}

.filename-input:disabled {
    cursor: default;
    color: var(--color-text-muted);
}

.filename-edit-indicator {
    flex: 0 0 14px;
    width: 14px;
    color: var(--color-text);
    font-size: 10px;
    text-align: center;
    transition: color 120ms ease, opacity 120ms ease;
}

.filename-extension {
    flex: 0 0 auto;
    margin-inline-start: -6px;
    color: var(--color-text-muted);
}

@media (max-width: 640px) {
    .document-details {
        gap: 10px;
    }
}
</style>
