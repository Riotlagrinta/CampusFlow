import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl } from 'react-native';
import { Calendar, BookOpen, MessageSquare, GraduationCap, Bell, User, ShoppingBag, Sparkles, Bot } from 'lucide-react-native';
import { router } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import api from '../../src/services/api';
import { registerForPushNotificationsAsync } from '../../src/services/notifications';
import { cacheData, getCachedData } from '../../src/services/cache';

export default function Dashboard() {
  const { token, signOut } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUserData = async () => {
    try {
      // Tenter de charger le cache d'abord
      const cachedProfile = await getCachedData('userProfile');
      if (cachedProfile && !userData) {
        setUserData(cachedProfile);
        setLoading(false);
      }

      const response = await api.get('/user/profile');
      setUserData(response.data);
      
      // Sauvegarder dans le cache pour la prochaine fois
      await cacheData('userProfile', response.data);
      
      await registerForPushNotificationsAsync();
    } catch (error) {
      console.error('Erreur fetch profile (hors-ligne ?):', error);
      // Si erreur réseau, on garde les données du cache
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (token) fetchUserData();
  }, [token]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchUserData();
  };

  const menuItems = [
    { title: 'Planning', icon: Calendar, color: 'bg-blue-500', href: '/planning' },
    { title: 'Quiz', icon: BookOpen, color: 'bg-green-500', href: '/quiz' },
    { title: 'Forum', icon: MessageSquare, color: 'bg-purple-500', href: '/forum' },
    { title: 'Ressources', icon: GraduationCap, color: 'bg-orange-500', href: '/resources' },
  ];

  if (loading && !refreshing) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50">
        <ActivityIndicator size="large" color="#0066cc" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView 
        className="flex-1 px-4 pt-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View className="flex-row justify-between items-center mb-8">
          <View className="flex-1">
            <Text className="text-slate-500 text-sm font-medium">Bonjour 👋</Text>
            <Text className="text-2xl font-bold text-slate-900 truncate" numberOfLines={1}>
              {userData?.firstName || 'Étudiant'}
            </Text>
          </View>
          <View className="flex-row items-center">
            <TouchableOpacity 
              onPress={() => router.push('/shop')}
              className="bg-blue-50 px-3 py-2 rounded-2xl border border-blue-100 mr-2 flex-row items-center shadow-sm shadow-blue-50"
            >
              <Sparkles size={16} color="#3b82f6" />
              <Text className="text-blue-600 font-black text-xs ml-1.5">{userData?.aiBonusRequests || 0}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => router.push('/profile')}
              className="p-2 bg-white rounded-full shadow-sm border border-slate-100"
            >
              <User size={24} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Prochain Cours Widget (Simulation dynamique) */}
        <View className="bg-white p-5 rounded-[2rem] mb-8 border border-slate-100 shadow-sm">
            <View className="flex-row items-center justify-between mb-4">
                <Text className="text-xs font-black text-slate-400 uppercase tracking-widest">En ce moment</Text>
                <View className="bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                    <Text className="text-[8px] font-black text-emerald-600 uppercase">Cours Actif</Text>
                </View>
            </View>
            <Text className="text-xl font-black text-slate-900 mb-1">Algorithmique S2</Text>
            <View className="flex-row items-center">
                <Calendar size={14} color="#64748b" />
                <Text className="text-slate-500 text-xs ml-2 font-medium">Salle 102 • 08h00 - 10h00</Text>
            </View>
        </View>

        {/* Stats Summary / Banner */}
        <View className="bg-blue-600 p-6 rounded-3xl mb-8 shadow-lg shadow-blue-200">
          <Text className="text-white/80 text-sm mb-1">XP Actuelle</Text>
          <Text className="text-white text-3xl font-bold mb-4">{userData?.xp || 0} XP</Text>
          <View className="h-2 bg-white/20 rounded-full overflow-hidden">
            <View 
              className="h-full bg-white" 
              style={{ width: `${Math.min((userData?.xp % 1000) / 10, 100)}%` }} 
            />
          </View>
          <Text className="text-white/80 text-xs mt-2 text-right">Niveau {userData?.level || 1}</Text>
        </View>

        {/* Quick Menu Grid */}
        <Text className="text-lg font-bold text-slate-900 mb-4">Menu Principal</Text>
        <View className="flex-row flex-wrap justify-between">
          {menuItems.map((item, index) => (
            <TouchableOpacity 
              key={index}
              onPress={() => router.push(item.href as any)}
              className="w-[48%] bg-white p-4 rounded-2xl mb-4 shadow-sm border border-slate-100 items-center"
            >
              <View className={`${item.color} p-3 rounded-xl mb-3`}>
                <item.icon size={24} color="white" />
              </View>
              <Text className="font-semibold text-slate-800">{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* AI Assistant Banner */}
        <TouchableOpacity 
          onPress={() => router.push('/ai-assistant')}
          className="bg-slate-900 p-5 rounded-3xl mb-8 flex-row items-center justify-between"
        >
          <View className="flex-1">
            <View className="flex-row items-center mb-1">
              <Sparkles size={18} color="#60a5fa" />
              <Text className="text-blue-400 font-bold ml-2">Assistant IA</Text>
            </View>
            <Text className="text-white text-base font-medium">Une question sur un cours ?</Text>
            <Text className="text-white/60 text-xs mt-1">Réponses instantanées via Llama 3.3</Text>
          </View>
          <View className="bg-white/10 p-3 rounded-2xl">
            <Bot size={32} color="white" />
          </View>
        </TouchableOpacity>

        {/* Info Card */}
        <View className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 mb-10">
          <Text className="text-indigo-800 font-bold mb-1">Filière</Text>
          <Text className="text-indigo-700 text-sm">
            {userData?.field?.name || 'Non définie'} - {userData?.academicLevel?.name || 'Niveau inconnu'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
