import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import { isThemeMode, type ThemeMode } from '@/lib/theme';

const themeStorageKey = 'image-editor-theme';

export function useTheme() {
    const themeMode = shallowRef<ThemeMode>('light');
    const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const systemPrefersDark = shallowRef(systemThemeQuery.matches);

    try {
        const savedTheme = localStorage.getItem(themeStorageKey);
        if (isThemeMode(savedTheme)) {
            themeMode.value = savedTheme;
        } else if (savedTheme !== null) {
            console.warn('Ignoring an invalid saved theme preference:', savedTheme);
        }
    } catch (error) {
        console.warn('Unable to restore the saved theme preference:', error);
    }

    const isDarkMode = computed(() => themeMode.value === 'auto'
        ? systemPrefersDark.value
        : themeMode.value === 'dark');

    watch(isDarkMode, (isDark) => {
        document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    }, { immediate: true });

    function selectTheme(mode: ThemeMode) {
        themeMode.value = mode;
        try {
            localStorage.setItem(themeStorageKey, mode);
        } catch (error) {
            console.warn('Unable to save the theme preference:', error);
        }
    }

    function onSystemThemeChange(event: MediaQueryListEvent) {
        systemPrefersDark.value = event.matches;
    }

    onMounted(() => systemThemeQuery.addEventListener('change', onSystemThemeChange));
    onBeforeUnmount(() => systemThemeQuery.removeEventListener('change', onSystemThemeChange));

    return { themeMode, isDarkMode, selectTheme };
}
