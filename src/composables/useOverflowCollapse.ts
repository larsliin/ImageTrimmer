import { nextTick, onBeforeUnmount, onMounted, shallowRef, type Ref } from 'vue';

/**
 * Progressively collapses groups from the bottom as the container overflows, and restores
 * them in reverse as the container grows. The final state is allowed to scroll if it still
 * cannot fit.
 */
export function useOverflowCollapse(container: Readonly<Ref<HTMLElement | null>>) {
    const collapsedCount = shallowRef(0);
    const maxCollapsedCount = 3;
    let observer: ResizeObserver | null = null;
    let updating = false;
    let updateRequested = false;

    async function reconcile() {
        const element = container.value;
        if (!element) return;

        while (collapsedCount.value > 0) {
            const previousCount = collapsedCount.value;
            collapsedCount.value -= 1;
            await nextTick();
            if (element.scrollHeight > element.clientHeight + 1) {
                collapsedCount.value = previousCount;
                await nextTick();
                break;
            }
        }

        while (
            collapsedCount.value < maxCollapsedCount
            && element.scrollHeight > element.clientHeight + 1
        ) {
            collapsedCount.value += 1;
            await nextTick();
        }
    }

    async function update() {
        if (updating) {
            updateRequested = true;
            return;
        }
        updating = true;
        try {
            do {
                updateRequested = false;
                await reconcile();
            } while (updateRequested);
        } finally {
            updating = false;
        }
    }

    onMounted(() => {
        if (!container.value) return;
        observer = new ResizeObserver(() => void update());
        observer.observe(container.value);
        void update();
    });

    onBeforeUnmount(() => observer?.disconnect());

    return { collapsedCount, update };
}
