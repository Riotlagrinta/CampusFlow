import React from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { useAppColors } from '@/hooks/use-app-colors';

type IconComponent = React.ComponentType<{ size?: number; color?: string }>;

type FormFieldProps = TextInputProps & {
  label: string;
  icon?: IconComponent;
  /** Élément à droite du champ (ex. bouton afficher/masquer le mot de passe). */
  right?: React.ReactNode;
  hint?: string;
};

/** Champ de formulaire avec libellé, icône optionnelle et thème clair/sombre. */
export function FormField({ label, icon: Icon, right, hint, ...inputProps }: FormFieldProps) {
  const colors = useAppColors();

  return (
    <View className="mb-4">
      <Text className="text-slate-700 dark:text-slate-300 font-medium mb-2">{label}</Text>
      <View className="flex-row items-center border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-slate-50 dark:bg-slate-800">
        {Icon ? <Icon size={20} color={colors.muted} /> : null}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.placeholder}
          className={`flex-1 text-slate-900 dark:text-white ${Icon ? 'ml-3' : ''}`}
          {...inputProps}
        />
        {right}
      </View>
      {hint ? (
        <Text className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 ml-1">{hint}</Text>
      ) : null}
    </View>
  );
}
