import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl } from 'react-native';
import { GraduationCap, FileText, Download, PlayCircle, ChevronLeft, WifiOff, Search } from 'lucide-react-native';
import { router } from 'expo-router';
import api from '../../src/services/api';
import { cacheData, getCachedData } from '../../src/services/cache';

export default function ResourcesScreen() {
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const fetchResources = async () => {
    try {
      const cached = await getCachedData('userResources');
      if (cached) setResources(cached);

      const response = await api.get('/resources');
      setResources(response.data);
      await cacheData('userResources', response.data);
      setIsOffline(false);
    } catch (error) {
      setIsOffline(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <View className="px-4 py-4 flex-row items-center bg-white border-b border-slate-200 justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <ChevronLeft size={24} color="#0f172a" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-slate-900">Ressources</Text>
        </View>
        {isOffline && <WifiOff size={20} color="#ef4444" />}
      </View>

      <ScrollView 
        className="p-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchResources(); }} />}
      >
        <Text className="text-lg font-bold text-slate-700 mb-4">Mes Cours & Documents</Text>
        
        {resources.map((res, index) => (
          <View key={index} className="bg-white p-4 rounded-xl mb-4 flex-row items-center shadow-sm border border-slate-100">
            <View className={`p-3 rounded-lg mr-4 ${res.type === 'PDF' ? 'bg-red-50' : 'bg-blue-50'}`}>
              {res.type === 'PDF' ? <FileText size={24} color="#ef4444" /> : <PlayCircle size={24} color="#3b82f6" />}
            </View>
            <View className="flex-1">
              <Text className="font-bold text-slate-900">{res.title}</Text>
              <Text className="text-slate-500 text-xs">{res.subject?.name || 'Général'} • {res.size || 'N/A'}</Text>
            </View>
            <TouchableOpacity className="p-2 bg-slate-100 rounded-full">
              <Download size={20} color="#64748b" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
