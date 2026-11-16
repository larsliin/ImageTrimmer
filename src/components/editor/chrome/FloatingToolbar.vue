<script setup lang="ts">
    import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue';
    import { useDragOffset } from '@/composables/useDragOffset';
    import type { Point } from '@/lib/crop';
    import { clampGripOffset } from '@/lib/drag';

    const props = defineProps<{
        label: string
        scrollable?: boolean
    }>();

    const NUDGE = 10;
    const { offset, dragging, transform, onPointerDown, onPointerMove, onPointerEnd, nudge, reset } = useDragOffset({
        onEnd: commitOffset,
        clamp: clampOffset,
    });
    const root = useTemplateRef<HTMLDivElement>('root');
    const grip = useTemplateRef<HTMLButtonElement>('grip');
    // Keep the opening pixel position independent of viewport resizing.
    const anchor = shallowRef<Point | null>(null);
    let initialAnchor: Point | null = null;

    function clampOffset(next: Point): Point {
        const rect = grip.value?.getBoundingClientRect();
        if (!rect) return next;
        return clampGripOffset(next, offset.value, rect, { width: window.innerWidth, height: window.innerHeight });
    }

    onMounted(() => {
        const rect = root.value?.getBoundingClientRect();
        if (!rect) return;
        initialAnchor = {
            x: rect.left,
            y: rect.top,
        };
        anchor.value = initialAnchor;
        window.addEventListener('resize', keepGripInViewport);
    });

    onBeforeUnmount(() => window.removeEventListener('resize', keepGripInViewport));

    function keepGripInViewport() {
        nudge(0, 0);
    }

    function commitOffset() {
        if (!anchor.value) return;
        anchor.value = {
            x: anchor.value.x + offset.value.x,
            y: anchor.value.y + offset.value.y,
        };
        reset();
    }

    const style = computed(() => anchor.value
        ? {
            position: 'fixed' as const,
            left: `${anchor.value.x}px`,
            top: `${anchor.value.y}px`,
            transform: transform.value,
            maxWidth: props.scrollable
                ? `calc(100vw - ${Math.max(0, anchor.value.x + offset.value.x)}px - 16px)`
                : undefined,
        }
        : { transform: transform.value });

    function moveWithKeyboard(event: KeyboardEvent) {
        const step = event.shiftKey ? NUDGE * 5 : NUDGE;
        const moves: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
        };
        if (event.key === 'Home') {
            event.preventDefault();
            resetPosition();
            return;
        }
        const move = moves[event.key];
        if (!move) return;
        event.preventDefault();
        nudge(...move);
        commitOffset();
    }

    function resetPosition() {
        reset();
        anchor.value = initialAnchor;
    }
</script>

<template>
    <div
        ref="root"
        class="floating-toolbar"
        :class="{ 'is-dragging': dragging, 'is-scrollable': scrollable }"
        role="toolbar"
        :aria-label="label"
        :style="style"
    >
        <button
            ref="grip"
            type="button"
            class="floating-toolbar__grip"
            :aria-label="`Move ${label}. Use arrow keys to move; Home resets the position.`"
            title="Drag to move"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerEnd"
            @pointercancel="onPointerEnd"
            @lostpointercapture="onPointerEnd"
            @dblclick="resetPosition"
            @keydown="moveWithKeyboard"
        ></button>
        <div class="floating-toolbar__content">
            <slot></slot>
        </div>
    </div>
</template>

<style scoped>
.floating-toolbar {
    display: flex;
    align-items: stretch;
    gap: 8px;
    width: max-content;
    box-sizing: border-box;
    padding: 6px 12px 6px 6px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background-color: var(--color-panel);
    box-shadow: var(--shadow-floating-panel);
    white-space: nowrap;
    pointer-events: auto;
}

.floating-toolbar.is-dragging {
    user-select: none;
}

.floating-toolbar.is-scrollable {
    max-width: calc(100vw - 32px);
}

.is-scrollable .floating-toolbar__content {
    overflow-x: auto;
}

.floating-toolbar__grip {
    flex: 0 0 auto;
    align-self: stretch;
    width: 12px;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background-color: transparent;
    background-image: radial-gradient(circle, var(--color-text-muted) 1px, transparent 1.5px);
    background-position: center;
    background-size: 4px 4px;
    cursor: grab;
    touch-action: none;
}

.floating-toolbar__grip:hover {
    background-color: var(--color-hover);
}

.floating-toolbar.is-dragging .floating-toolbar__grip {
    cursor: grabbing;
}

.floating-toolbar__grip:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 0;
}

.floating-toolbar__content {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    min-width: 0;
}
</style>
