<script setup lang="ts">
    import { nextTick, onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef } from 'vue';
    import { useDragOffset } from '@/composables/useDragOffset';
    import type { Point } from '@/lib/crop';
    import { clampGripOffset } from '@/lib/drag';
    import { BaseAlert, BaseButton } from 'chrome-extension-component-library';

    const props = withDefaults(defineProps<{
        title: string
        applyLabel?: string
        canApply: boolean
        busy: boolean
        error?: string | null
        compact?: boolean
        focusTitle?: boolean
        draggable?: boolean
        compactOnSmallScreens?: boolean
        scrollBody?: boolean
    }>(), {
        applyLabel: 'Apply',
        error: null,
        compact: false,
        focusTitle: false,
        draggable: true,
        compactOnSmallScreens: false,
        scrollBody: false,
    });

    const emit = defineEmits<{
        apply: []
        cancel: []
    }>();

    const titleId = useId();
    const dialog = useTemplateRef<HTMLDialogElement>('dialog');
    const grip = useTemplateRef<HTMLButtonElement>('grip');
    const position = shallowRef<Point | null>(null);
    const { offset, dragging, transform, onPointerDown, onPointerMove, onPointerEnd, nudge, reset } = useDragOffset({ clamp: clampOffset });
    let previousFocus: HTMLElement | null = null;

    function clampOffset(next: Point): Point {
        const rect = grip.value?.getBoundingClientRect();
        if (!rect) return next;
        return clampGripOffset(next, offset.value, rect, { width: window.innerWidth, height: window.innerHeight });
    }

    function keepGripInViewport() {
        nudge(0, 0);
    }

    function moveWithKeyboard(event: KeyboardEvent) {
        const step = event.shiftKey ? 50 : 10;
        const moves: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
        };
        if (event.key === 'Home') {
            event.preventDefault();
            reset();
        } else {
            const move = moves[event.key];
            if (!move) return;
            event.preventDefault();
            nudge(...move);
        }
    }

    onMounted(() => {
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.value?.show();
        const rect = dialog.value?.getBoundingClientRect();
        if (rect) position.value = { x: rect.left, y: rect.top };
        if (props.draggable) window.addEventListener('resize', keepGripInViewport);
        document.addEventListener('keydown', cancelOnEscape);
    });

    onBeforeUnmount(() => {
        window.removeEventListener('resize', keepGripInViewport);
        document.removeEventListener('keydown', cancelOnEscape);
        dialog.value?.close();
        void nextTick(() => {
            if (previousFocus?.isConnected) previousFocus.focus();
        });
    });

    function apply() {
        if (!props.busy && props.canApply) emit('apply');
    }

    function cancel() {
        if (!props.busy) emit('cancel');
    }

    function cancelOnEscape(event: KeyboardEvent) {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        cancel();
    }
</script>

<template>
    <Teleport to="body">
        <dialog
            ref="dialog"
            class="tool-modal"
            :class="{
                'tool-modal--compact': compact,
                'tool-modal--static': !draggable,
                'tool-modal--compact-on-small-screens': compactOnSmallScreens,
                'tool-modal--scroll-body': scrollBody,
                'is-dragging': dragging,
            }"
            :style="{
                transform,
                ...(position ? { position: 'fixed', left: `${position.x}px`, top: `${position.y}px`, right: 'auto', bottom: 'auto', margin: 0 } : {}),
            }"
            :aria-labelledby="titleId"
            @cancel.prevent="cancel"
            @keydown.esc.stop.prevent="cancel"
        >
            <form class="tool-modal__form" :aria-busy="busy" @submit.prevent="apply">
                <header class="tool-modal__header">
                    <h2 :id="titleId" class="tool-modal__title" :tabindex="focusTitle ? -1 : undefined" :autofocus="focusTitle">{{ title }}</h2>
                    <button v-if="draggable" ref="grip" type="button" class="tool-modal__grip"
                        :aria-label="`Move ${title} dialog. Use arrow keys to move; Home resets the position.`"
                        title="Drag to move; double-click to reset"
                        @pointerdown="onPointerDown"
                        @pointermove="onPointerMove"
                        @pointerup="onPointerEnd"
                        @pointercancel="onPointerEnd"
                        @lostpointercapture="onPointerEnd"
                        @dblclick="reset"
                        @keydown="moveWithKeyboard"
                    ></button>
                </header>
                <fieldset class="tool-modal__fields" :disabled="busy">
                    <slot />
                </fieldset>
                <BaseAlert v-if="error" :message="error" />
                <p v-if="busy" class="tool-modal__status" role="status">Processing image...</p>
                <footer class="tool-modal__actions">
                    <BaseButton variant="bare" class="tool-modal__button" :disabled="busy" @click="cancel">Cancel</BaseButton>
                    <BaseButton variant="bare" type="submit" class="tool-modal__button tool-modal__button--apply" :disabled="busy || !canApply">
                        {{ applyLabel }}
                    </BaseButton>
                </footer>
            </form>
        </dialog>
    </Teleport>
</template>

<style scoped>
.tool-modal {
    position: fixed;
    inset: 0;
    z-index: 40;
    width: min(420px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    margin: auto;
    padding: 0;
    overflow: auto;
    scrollbar-width: none;
    color: var(--color-text);
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: var(--shadow-floating-panel);
}

.tool-modal::-webkit-scrollbar {
    display: none;
}

.tool-modal__form {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 24px;
}

.tool-modal__title {
    font-size: 18px;
    font-weight: 600;
}

.tool-modal--scroll-body {
    overflow: hidden;
}

.tool-modal--scroll-body .tool-modal__form {
    max-height: calc(100dvh - 34px);
}

.tool-modal--scroll-body .tool-modal__fields {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
}

.tool-modal--scroll-body .tool-modal__form > :not(.tool-modal__fields) {
    flex-shrink: 0;
}

.tool-modal__header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.tool-modal.is-dragging .tool-modal__grip {
    cursor: grabbing;
}

.tool-modal__grip {
    position: absolute;
    /* Sits just below the dialog's top edge; offsets the form's top padding. */
    top: -16px;
    left: 50%;
    flex: 0 0 auto;
    width: 36px;
    height: 12px;
    padding: 0;
    background-color: transparent;
    background-image: radial-gradient(circle, var(--color-text-muted) 1px, transparent 1.5px);
    background-position: center;
    background-size: 4px 4px;
    border: 0;
    border-radius: 0;
    transform: translateX(-50%);
    cursor: grab;
    touch-action: none;
    user-select: none;
}

.tool-modal__grip:hover {
    background-color: var(--color-hover);
}

.tool-modal__grip:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
}

.tool-modal--compact .tool-modal__form {
    gap: 18px;
    padding: 22px 20px;
}

.tool-modal--compact .tool-modal__grip {
    top: -21px;
}

.tool-modal--compact.tool-modal--static .tool-modal__form {
    padding-top: 20px;
}

@media (max-height: 500px) {
    .tool-modal--compact .tool-modal__form,
    .tool-modal--compact.tool-modal--static .tool-modal__form {
        gap: 12px;
        padding: 16px;
    }

    .tool-modal--compact .tool-modal__grip {
        top: -15px;
    }
}

.tool-modal__fields {
    min-width: 0;
    padding: 0;
    border: 0;
}

.tool-modal__status {
    color: var(--color-text-muted);
}

.tool-modal__actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
}

.tool-modal__button {
    min-height: 34px;
    padding: 6px 12px;
    background: var(--color-button-secondary);
    border: 1px solid var(--color-button-secondary-border);
    border-radius: var(--radius-button);
    cursor: pointer;
}

.tool-modal__button--apply {
    color: #fff;
    background: var(--color-accent);
    border-color: transparent;
}

.tool-modal__button:hover:not(:disabled) {
    filter: brightness(1.15);
}

.tool-modal__button:not(.tool-modal__button--apply):hover:not(:disabled) {
    background: var(--color-button-secondary-hover);
    border-color: var(--color-button-secondary-border-hover);
    filter: none;
}

.tool-modal__button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.tool-modal__button:not(.tool-modal__button--apply):disabled {
    opacity: var(--opacity-button-secondary-disabled);
}

.tool-modal__button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
}

@media (max-width: 1440px), (max-height: 800px) {
    .tool-modal--compact-on-small-screens {
        width: min(320px, calc(100vw - 32px));
        font-size: 13px;
    }

    .tool-modal--compact-on-small-screens .tool-modal__form {
        gap: 12px;
        padding: 16px;
    }

    .tool-modal--compact-on-small-screens .tool-modal__title {
        font-size: 16px;
    }

    .tool-modal--compact-on-small-screens .tool-modal__grip {
        top: -12px;
    }

    .tool-modal--compact-on-small-screens .tool-modal__button {
        min-height: 30px;
        padding: 4px 10px;
    }
}

</style>
