import { ref } from 'vue';

// Drag-and-drop of one file onto an element, tracking whether a drag is currently over it.
// eslint-disable-next-line no-unused-vars
export function useFileDrop(onFile: (file: File) => void) {
    const isDropActive = ref(false);

    function handleDragEnter(event: DragEvent) {
        event.preventDefault();
        isDropActive.value = true;
    }

    function handleDragOver(event: DragEvent) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    }

    function handleDragLeave(event: DragEvent) {
        event.preventDefault();
        const workspace = event.currentTarget;
        if (workspace instanceof HTMLElement && event.relatedTarget instanceof Node
            && workspace.contains(event.relatedTarget)) return;
        isDropActive.value = false;
    }

    function handleDrop(event: DragEvent) {
        event.preventDefault();
        isDropActive.value = false;
        const file = event.dataTransfer?.files[0];
        if (file) onFile(file);
    }

    return { isDropActive, handleDragEnter, handleDragOver, handleDragLeave, handleDrop };
}
