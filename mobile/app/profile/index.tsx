import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { User, Settings, Bell, LogOut, ChevronRight, Award } from 'lucide-react-native';
import { router } from 'expo-router';

export default function ProfileScreen() {
  const menuItems = [
    { icon: Bell, title: 'Notifications', color: 'text-blue-500' },
    { icon: Award, title: 'Mes Badges', color: 'text-yellow-500' },
    { icon: Settings, title: 'Paramètres', color: 'text-slate-500' },
  ];

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView>
        <View className="bg-white p-6 items-center border-b border-slate-200">
          <View className="w-24 h-24 bg-slate-200 rounded-full mb-4 items-center justify-center border-4 border-blue-50">
            <User size={50} color="#64748b" />
          </View>
          <Text className="text-2xl font-bold text-slate-900">Étudiant DefiTech</Text>
          <Text className="text-slate-500">L2 Génie Logiciel</Text>
          
          <TouchableOpacity className="mt-4 px-6 py-2 bg-blue-600 rounded-full">
            <Text className="text-white font-bold">Modifier le profil</Text>
          </TouchableOpacity>
        </View>

        <View className="mt-6 bg-white border-t border-b border-slate-200">
          {menuItems.map((item, index) => (
            <TouchableOpacity key={index} className="flex-row items-center p-4 border-b border-slate-100 last:border-0">
              <item.icon size={22} className={item.color} />
              <Text className="flex-1 ml-4 text-slate-800 font-medium">{item.title}</Text>
              <ChevronRight size={20} color="#cbd5e1" />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity 
          onPress={() => router.replace('/')}
          className="mt-8 mx-6 flex-row items-center justify-center p-4 bg-red-50 rounded-2xl border border-red-100"
        >
          <LogOut size={22} color="#ef4444" />
          <Text className="ml-2 text-red-600 font-bold text-lg">Déconnexion</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
