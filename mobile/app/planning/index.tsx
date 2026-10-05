import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Calendar, Clock, User, WifiOff } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { fetchAllPages } from '../../src/services/pagination';
import { DAY_ORDER, getCurrentSemester } from '../../src/utils/semester';
import { useCachedResource } from '@/hooks/use-cached-resource';
import { useAppColors } from '@/hooks/use-app-colors';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { RequireLogin } from '@/components/require-login';
import { SemesterToggle } from '@/components/semester-toggle';
import { EmptyView, ErrorView, LoadingView, StatusBanner } from '@/components/state-views';

interface ScheduleEvent {
  id: string;
  day: string;
  time: string;
  subjectName?: string | null;
  subject?: { name?: string } | null;
  type?: string | null;
  teacher?: string | null;
  // Stocké en texte côté serveur (String?) : jamais utilisé dans un calcul.
  credits?: string | number | null;
  isAcademic?: boolean;
}

/** Libellé des crédits, ou null si la valeur est absente ou inexploitable (jamais « NaN »). */
function creditsLabel(credits: ScheduleEvent['credits']): string | null {
  let text = '';
  if (typeof credits === 'string') text = credits.trim();
  else if (typeof credits === 'number' && Number.isFinite(credits)) text = String(credits);
  return text ? `Crédits : ${text}` : null;
}

function CreditsText({ value }: { value: ScheduleEvent['credits'] }) {
  const label = creditsLabel(value);
  if (!label) return null;
  return <Text className="text-xs text-slate-400 dark:text-slate-500 mt-2">{label}</Text>;
}

function dayRank(day: string): number {
  const index = DAY_ORDER.indexOf(day);
  return index === -1 ? DAY_ORDER.length : index;
}

export default function PlanningScreen() {
  const { token } = useAuth();
  const colors = useAppColors();
  const [semester, setSemester] = useState(getCurrentSemester());

  // Le serveur pagine par 50 : toutes les pages sont lues (liste mise en cache pour le hors-ligne).
  const fetchSchedules = useCallback(
    () => fetchAllPages<ScheduleEvent>('/planning/personal', { semester }),
    [semester]
  );
  const schedules = useCachedResource<ScheduleEvent[]>(`planning:S${semester}`, fetchSchedules, !!token);

  // Regroupement par jour (lundi → dimanche), puis par horaire.
  const groups = useMemo(() => {
    const byDay = new Map<string, ScheduleEvent[]>();
    for (const event of schedules.data ?? []) {
      const list = byDay.get(event.day) ?? [];
      list.push(event);
      byDay.set(event.day, list);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => dayRank(a) - dayRank(b))
      .map(([day, events]) => ({
        day,
        events: [...events].sort((a, b) => a.time.localeCompare(b.time)),
      }));
  }, [schedules.data]);

  if (!token) {
    return (
      <Screen>
        <ScreenHeader title="Emploi du temps" />
        <RequireLogin message="Connectez-vous pour consulter votre emploi du temps." />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Emploi du temps"
        right={schedules.offline ? <WifiOff size={20} color="#ef4444" /> : undefined}
      />

      {schedules.loading ? (
        <LoadingView />
      ) : schedules.error && !schedules.data ? (
        <ErrorView message={schedules.error} onRetry={schedules.reload} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={schedules.refreshing} onRefresh={schedules.refresh} />}
        >
          <StatusBanner offline={schedules.offline} error={schedules.data ? schedules.error : null} />
          <SemesterToggle value={semester} onChange={setSemester} />

          {groups.length === 0 ? (
            <EmptyView
              icon={Calendar}
              title="Aucun cours trouvé"
              message="Aucun créneau n'est enregistré pour ce semestre."
            />
          ) : (
            groups.map(({ day, events }) => (
              <View key={day} className="mb-4">
                <Text className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-3">{day}</Text>
                {events.map((event) => (
                  <View
                    key={event.id}
                    className="bg-white dark:bg-slate-900 p-4 rounded-xl mb-3 border-l-4 border-blue-500"
                  >
                    <View className="flex-row justify-between items-start mb-2">
                      <Text className="font-bold text-slate-900 dark:text-white text-lg flex-1 mr-2">
                        {event.subject?.name || event.subjectName || 'Cours'}
                      </Text>
                      <Text className="bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 px-2 py-1 rounded text-xs font-bold uppercase overflow-hidden">
                        {event.type || 'Cours'}
                      </Text>
                    </View>

                    <View className="flex-row items-center mb-1">
                      <Clock size={16} color={colors.muted} />
                      <Text className="text-slate-600 dark:text-slate-300 ml-2">{event.time}</Text>
                    </View>

                    {event.teacher ? (
                      <View className="flex-row items-center">
                        <User size={16} color={colors.muted} />
                        <Text className="text-slate-600 dark:text-slate-300 ml-2">{event.teacher}</Text>
                      </View>
                    ) : null}

                    <CreditsText value={event.credits} />
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
