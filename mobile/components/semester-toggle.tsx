import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

const SEMESTERS = [1, 2];

/** Sélecteur de semestre S1 / S2 (même logique que l'application web). */
export function SemesterToggle({
  value,
  onChange,
}: {
  value: number;
  onChange: (semester: number) => void;
}) {
  return (
    <View className="flex-row bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-4 self-start">
      {SEMESTERS.map((semester) => {
        const active = semester === value;
        return (
          <TouchableOpacity
            key={semester}
            onPress={() => onChange(semester)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Semestre ${semester}`}
            className={`px-5 py-2 rounded-lg ${active ? 'bg-white dark:bg-slate-700' : ''}`}
          >
            <Text
              className={`text-xs font-bold ${
                active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              S{semester}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
