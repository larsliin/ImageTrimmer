<script setup lang="ts">
    import { onBeforeUnmount, onMounted, useId, useTemplateRef } from 'vue';
    import { BaseButton } from 'chrome-extension-component-library';

    defineProps<{ toolName: string }>();
    const emit = defineEmits<{ keep: [], discard: [] }>();
    const id = useId();
    const backdrop = useTemplateRef<HTMLDivElement>('backdrop');
    const dialog = useTemplateRef<HTMLDivElement>('dialog');
    const keepButton = useTemplateRef<InstanceType<typeof BaseButton>>('keepButton');
    const inertElements: { element: HTMLElement, previous: boolean }[] = [];

    onMounted(() => {
        for (const element of document.body.children) {
            if (!(element instanceof HTMLElement) || element === backdrop.value) continue;
            inertElements.push({ element, previous: element.inert });
            element.inert = true;
        }
        window.addEventListener('keydown', onKeydown, true);
        keepButton.value?.focus();
    });

    onBeforeUnmount(() => {
        window.removeEventListener('keydown', onKeydown, true);
        for (const { element, previous } of inertElements) element.inert = previous;
    });

    function onKeydown(event: KeyboardEvent) {
        event.stopImmediatePropagation();
        if (event.key === 'Escape') {
            event.preventDefault();
            emit('keep');
        } else if (event.key === 'Tab') {
            const buttons = dialog.value?.querySelectorAll<HTMLButtonElement>('button');
            if (!buttons?.length) return;
            event.preventDefault();
            const index = [...buttons].findIndex(button => button === document.activeElement);
            const next = index < 0 ? (event.shiftKey ? buttons.length - 1 : 0)
                : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
            buttons[next]?.focus();
        }
    }
</script>

<template>
    <Teleport to="body">
        <div ref="backdrop" class="discard-backdrop" @pointerdown.self.prevent @keydown="onKeydown">
            <div
                ref="dialog"
                class="discard-dialog"
                role="alertdialog"
                aria-modal="true"
                :aria-labelledby="`${id}-title`"
                :aria-describedby="`${id}-message`"
                tabindex="-1"
            >
                <h2 :id="`${id}-title`" class="discard-title">Discard unapplied changes?</h2>
                <p :id="`${id}-message`" class="discard-message">
                    Your changes in {{ toolName }} haven’t been applied. Discard them and close this tool?
                </p>
                <div class="discard-actions">
                    <BaseButton ref="keepButton" variant="secondary" class="discard-button" @click="emit('keep')">Keep editing</BaseButton>
                    <BaseButton variant="secondary" class="discard-button" @click="emit('discard')">Discard changes</BaseButton>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.discard-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 55%);
}

.discard-dialog {
    box-sizing: border-box;
    width: min(420px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 20px;
    overflow: auto;
    color: var(--color-text);
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: var(--shadow-floating-panel);
}

.discard-title {
    margin: 0 0 12px;
    font-size: 18px;
    font-weight: 600;
    overflow-wrap: anywhere;
}

.discard-message {
    margin: 0 0 20px;
    line-height: 1.5;
    overflow-wrap: anywhere;
}

.discard-actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
}

.discard-button {
    flex: 1 1 auto;
    min-height: 34px;
    padding: 6px 12px;
    white-space: normal;
    overflow-wrap: anywhere;
}

.discard-button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
}
</style>
