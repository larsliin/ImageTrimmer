export type ThemeMode = 'light' | 'dark' | 'auto';

export function isThemeMode(value: string | null): value is ThemeMode {
    return value === 'light' || value === 'dark' || value === 'auto';
}
