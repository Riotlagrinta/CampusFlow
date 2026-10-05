import React from 'react';
import { View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Edge = 'top' | 'bottom';

type ScreenProps = ViewProps & {
  /** Bords protégés par les marges de sécurité (encoche, barre de navigation). */
  edges?: Edge[];
};

/**
 * Conteneur d'écran : fond clair/sombre et marges de sécurité.
 * Remplace le SafeAreaView de react-native, déprécié et sans effet sur Android.
 */
export function Screen({ edges = ['top', 'bottom'], style, className, children, ...rest }: ScreenProps) {
  const insets = useSafeAreaInsets();
  // Un fond fourni par l'appelant remplace le fond par défaut (deux classes bg-* en
  // conflit se départagent selon l'ordre du CSS généré, pas celui de la chaîne).
  const background = className?.includes('bg-') ? '' : 'bg-slate-50 dark:bg-slate-950';

  return (
    <View
      className={`flex-1 ${background} ${className ?? ''}`}
      style={[
        {
          paddingTop: edges.includes('top') ? insets.top : 0,
          paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
