<script setup lang="ts">
    import { nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue';
    import BaseButton from '@/components/bascomponents/BaseButton.vue';

    defineProps<{
        label: string
        active: boolean
    }>();

    const open = defineModel<boolean>('open', { required: true });

    const PANEL_GAP = 6;
    const VIEWPORT_MARGIN = 8;
    const panelId = useId();
    const root = useTemplateRef<HTMLDivElement>('root');
    const toggleButton = useTemplateRef<InstanceType<typeof BaseButton>>('toggleButton');
    const panel = useTemplateRef<HTMLDivElement>('panel');
    const panelStyle = ref<Record<string, string>>({});

    // Centers the panel on the toggle and clamps it to the viewport.
    async function positionPanel() {
        const rect = toggleButton.value?.getBoundingClientRect();
        if (!rect) return;
        const left = rect.right + PANEL_GAP;
        const maxWidth = `${Math.max(window.innerWidth - left - VIEWPORT_MARGIN, 0)}px`;
        const viewportHeight = window.innerHeight;
        const availableHeight = Math.max(viewportHeight - VIEWPORT_MARGIN * 2, 0);
        panelStyle.value = {
            top: `${VIEWPORT_MARGIN}px`,
            left: `${left}px`,
            maxWidth,
        };
        await nextTick();
        const height = panel.value?.getBoundingClientRect().height ?? 0;
        const isTooTall = height > availableHeight;
        const visibleHeight = Math.min(height, availableHeight);
        const centeredTop = rect.top + rect.height / 2 - visibleHeight / 2;
        const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - visibleHeight - VIEWPORT_MARGIN);
        const top = Math.min(Math.max(centeredTop, VIEWPORT_MARGIN), maxTop);
        panelStyle.value = {
            top: `${top}px`,
            left: `${left}px`,
            maxWidth,
            ...(isTooTall ? { maxHeight: `${availableHeight}px` } : {}),
        };
    }

    function closeOnOutsidePointer(event: PointerEvent) {
        if (event.target instanceof Node && !root.value?.contains(event.target)) open.value = false;
    }

    function addListeners() {
        document.addEventListener('pointerdown', closeOnOutsidePointer);
        window.addEventListener('resize', positionPanel);
    }

    function removeListeners() {
        document.removeEventListener('pointerdown', closeOnOutsidePointer);
        window.removeEventListener('resize', positionPanel);
    }

    watch(open, (isOpen) => {
        if (isOpen) {
            void positionPanel();
            addListeners();
        } else {
            removeListeners();
        }
    }, { immediate: true });

    onBeforeUnmount(removeListeners);

    function closeOnEscape(event: KeyboardEvent) {
        if (event.key !== 'Escape' || !open.value) return;
        event.stopPropagation();
        open.value = false;
        void nextTick(() => toggleButton.value?.focus());
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
        class="tool-foldout"
        @keydown="closeOnEscape"
        @focusout="closeOnFocusLeave"
    >
        <BaseButton
            ref="toggleButton"
            variant="tool"
            :class="{ 'is-active': active || open }"
            :aria-label="label"
            :title="label"
            :aria-expanded="open"
            :aria-controls="panelId"
            data-more-tools-launcher="true"
            @click="open = !open"
        >
            <slot name="icon">
                <i class="bi bi-three-dots-vertical" aria-hidden="true"></i>
            </slot>
        </BaseButton>
        <div
            v-show="open"
            :id="panelId"
            ref="panel"
            class="tool-foldout__panel"
            role="group"
            :aria-label="label"
            :style="panelStyle"
        >
            <slot></slot>
        </div>
    </div>
</template>

<style scoped>
.tool-foldout__panel {
    position: fixed;
    z-index: 30;
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    padding: 6px;
    overflow-x: auto;
    overflow-y: auto;
    background-color: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgb(0 0 0 / 40%);
}
</style>
