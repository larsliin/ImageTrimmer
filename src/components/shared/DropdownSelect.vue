<script setup lang="ts">
    import { computed, nextTick, onBeforeUnmount, shallowRef, useId, useTemplateRef, watch } from 'vue';

    export interface DropdownOption {
        value: string
        label: string
    }

    const props = defineProps<{
        label: string
        modelValue: string
        options: readonly DropdownOption[]
    }>();

    const emit = defineEmits<{
        select: [value: string]
    }>();

    const open = shallowRef(false);
    const root = useTemplateRef<HTMLDivElement>('root');
    const trigger = useTemplateRef<HTMLButtonElement>('trigger');
    const panel = useTemplateRef<HTMLDivElement>('panel');
    const panelId = useId();
    const panelStyle = shallowRef<Record<string, string>>({});
    const selectedOption = computed(() => props.options.find((option) => option.value === props.modelValue) ?? null);

    async function positionPanel() {
        const triggerRect = trigger.value?.getBoundingClientRect();
        if (!triggerRect || typeof window === 'undefined') return;

        panelStyle.value = { top: `${triggerRect.bottom + 6}px`, left: `${triggerRect.left}px` };
        await nextTick();

        const panelRect = panel.value?.getBoundingClientRect();
        if (!panelRect) return;

        const margin = 8;
        const availableWidth = Math.max(window.innerWidth - margin * 2, 0);
        const panelWidth = Math.min(panelRect.width, availableWidth);
        const left = Math.min(Math.max(margin, triggerRect.right - panelWidth + 4), window.innerWidth - panelWidth - margin);
        const top = triggerRect.bottom + panelRect.height + margin <= window.innerHeight
            ? triggerRect.bottom + 6
            : Math.max(margin, triggerRect.top - panelRect.height - 6);
        panelStyle.value = { top: `${top}px`, left: `${left}px` };
    }

    function closeOnOutsidePointer(event: PointerEvent) {
        if (event.target instanceof Node && !root.value?.contains(event.target)) open.value = false;
    }

    function addListeners() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        document.addEventListener('pointerdown', closeOnOutsidePointer);
        window.addEventListener('resize', positionPanel);
        window.addEventListener('scroll', positionPanel, true);
    }

    function removeListeners() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        document.removeEventListener('pointerdown', closeOnOutsidePointer);
        window.removeEventListener('resize', positionPanel);
        window.removeEventListener('scroll', positionPanel, true);
    }

    watch(open, (isOpen) => {
        if (isOpen) {
            addListeners();
            void positionPanel();
        } else {
            removeListeners();
        }
    });

    onBeforeUnmount(removeListeners);

    async function focusOption(index: number) {
        await nextTick();
        panel.value?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
    }

    async function toggle() {
        open.value = !open.value;
        if (open.value) {
            const selectedIndex = props.options.findIndex((option) => option.value === props.modelValue);
            await focusOption(Math.max(selectedIndex, 0));
        }
    }

    function selectOption(value: string) {
        emit('select', value);
        open.value = false;
        void nextTick(() => trigger.value?.focus());
    }

    function closeOnEscape(event: KeyboardEvent) {
        if (!open.value || event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        open.value = false;
        void nextTick(() => trigger.value?.focus());
    }

    function handleOptionKeydown(event: KeyboardEvent, index: number) {
        let nextIndex: number | null = null;
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (index + 1) % props.options.length;
        else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
            nextIndex = (index - 1 + props.options.length) % props.options.length;
        } else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = props.options.length - 1;
        if (nextIndex === null) return;

        event.preventDefault();
        const option = props.options[nextIndex];
        if (option) {
            emit('select', option.value);
            void focusOption(nextIndex);
        }
    }

    function closeOnFocusLeave(event: FocusEvent) {
        if (
            open.value
            && event.relatedTarget instanceof Node
            && !root.value?.contains(event.relatedTarget)
        ) open.value = false;
    }
</script>

<template>
    <div
        ref="root"
        class="dropdown-select"
        @keydown="closeOnEscape"
        @focusout="closeOnFocusLeave"
    >
        <button
            ref="trigger"
            class="dropdown-select__trigger"
            type="button"
            :aria-label="`${label}: ${selectedOption?.label ?? 'No options'}`"
            :title="`${label}: ${selectedOption?.label ?? 'No options'}`"
            :aria-expanded="open"
            :aria-controls="panelId"
            :disabled="options.length === 0"
            @click="toggle"
        >
            <slot></slot>
        </button>
        <div
            v-if="open"
            :id="panelId"
            ref="panel"
            class="dropdown-select__panel"
            role="radiogroup"
            :aria-label="label"
            :style="panelStyle"
        >
            <button
                v-for="(option, index) in options"
                :key="option.value"
                class="dropdown-select__option"
                :class="{ 'dropdown-select__option--selected': option.value === modelValue }"
                type="button"
                role="radio"
                :aria-label="option.label"
                :aria-checked="option.value === modelValue"
                :tabindex="option.value === modelValue || (!selectedOption && index === 0) ? 0 : -1"
                @click="selectOption(option.value)"
                @keydown="handleOptionKeydown($event, index)"
            >
                <span class="dropdown-select__option-content">
                    <i
                        class="bi"
                        :class="{
                            'bi-sun': option.value === 'light',
                            'bi-moon': option.value === 'dark',
                            'bi-circle-half': option.value === 'auto',
                        }"
                        aria-hidden="true"
                    ></i>
                    <span>{{ option.label }}</span>
                </span>
            </button>
        </div>
    </div>
</template>

<style scoped>
.dropdown-select {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
}

.dropdown-select__trigger {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    color: var(--color-text-muted);
    background-color: transparent;
    cursor: pointer;
}

.dropdown-select__trigger:hover {
    color: var(--color-text);
    background-color: var(--color-hover);
}

.dropdown-select__trigger:focus-visible,
.dropdown-select__option:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
}

.dropdown-select__panel {
    position: fixed;
    z-index: 40;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: min(168px, calc(100vw - 16px));
    max-height: calc(100vh - 16px);
    overflow-y: auto;
    padding: 4px;
    background-color: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    box-shadow: var(--shadow-floating-panel);
}

.dropdown-select__option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 34px;
    padding: 6px 9px;
    border: 0;
    border-radius: 4px;
    color: var(--color-text);
    background-color: transparent;
    text-align: left;
    cursor: pointer;
    font-size: 13px;
}

.dropdown-select__option-content {
    display: flex;
    align-items: center;
    gap: 8px;
}

.dropdown-select__option-content i {
    color: var(--color-text-muted);
    font-size: 14px;
}

.dropdown-select__option:hover:not(.dropdown-select__option--selected) {
    background-color: var(--color-hover);
}

.dropdown-select__option--selected {
    background-color: var(--color-accent);
    color: #fff;
    font-weight: 600;
}

.dropdown-select__option--selected .dropdown-select__option-content i {
    color: #fff;
}
</style>
