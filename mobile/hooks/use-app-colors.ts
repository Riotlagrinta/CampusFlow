import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Couleurs à passer en props (icônes, placeholder, indicateurs) : les classes
 * `dark:` de NativeWind ne s'appliquent pas aux props `color`.
 */
export function useAppColors() {
  const isDark = useColorScheme() === 'dark';

  return {
    isDark,
    /** Titres et icônes principales. */
    text: isDark ? '#f8fafc' : '#0f172a',
    /** Texte secondaire et icônes discrètes. */
    muted: isDark ? '#94a3b8' : '#64748b',
    /** Icônes désactivées / décoratives. */
    subtle: isDark ? '#475569' : '#cbd5e1',
    primary: isDark ? '#60a5fa' : '#0066cc',
    placeholder: '#94a3b8',
  };
}
