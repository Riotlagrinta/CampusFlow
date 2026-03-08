import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl } from 'react-native';
import { Calendar, Clock, MapPin, ChevronLeft, WifiOff } from 'lucide-react-native';
import { router } from 'expo-router';
import api from '../../src/services/api';
import { cacheData, getCachedData } from '../../src/services/cache';

interface ScheduleEvent {
  subjectName?: string;
  subject?: { name: string };
  type?: string;
  day: string;
  time: string;
  teacher?: string;
}

export default function PlanningScreen() {
  const [schedules, setSchedules] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const fetchSchedules = async () => {
    try {
      const cachedSchedules = await getCachedData('userSchedules');
      if (cachedSchedules) setSchedules(cachedSchedules as ScheduleEvent[]);

      const response = await api.get('/planning/personal');
      setSchedules(response.data);
      await cacheData('userSchedules', response.data);
      setIsOffline(false);
    } catch {
      console.log('Mode hors-ligne détecté pour le planning');
      setIsOffline(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  if (loading && schedules.length === 0) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50">
        <ActivityIndicator size="large" color="#0066cc" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <View className="px-4 py-4 flex-row items-center bg-white border-b border-slate-200 justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <ChevronLeft size={24} color="#0f172a" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-slate-900">Emploi du temps</Text>
        </View>
        {isOffline && <WifiOff size={20} color="#ef4444" />}
      </View>

      <ScrollView 
        className="p-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchSchedules(); }} />}
      >
        <Text className="text-lg font-bold text-slate-700 mb-4">Mes cours enregistrés</Text>
        
        {schedules.length === 0 ? (
          <View className="bg-white p-8 rounded-2xl items-center border border-dashed border-slate-300">
            <Calendar size={48} color="#cbd5e1" />
            <Text className="text-slate-400 mt-4 text-center">Aucun cours trouvé. Connectez-vous une fois pour synchroniser.</Text>
          </View>
        ) : (
          schedules.map((event, index) => (
            <View key={index} className="bg-white p-4 rounded-xl mb-4 shadow-sm border-l-4 border-blue-500">
              <View className="flex-row justify-between mb-2">
                <Text className="font-bold text-slate-900 text-lg">{event.subjectName || event.subject?.name}</Text>
                <Text className="bg-blue-50 text-blue-600 px-2 py-1 rounded text-xs font-bold uppercase">
                  {event.type || 'Cours'}
                </Text>
              </View>
              
              <View className="flex-row items-center mb-1">
                <Clock size={16} color="#64748b" />
                <Text className="text-slate-600 ml-2">{event.day} • {event.time}</Text>
              </View>
              
              <View className="flex-row items-center">
                <MapPin size={16} color="#64748b" />
                <Text className="text-slate-600 ml-2">{event.teacher || 'Salle à confirmer'}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
