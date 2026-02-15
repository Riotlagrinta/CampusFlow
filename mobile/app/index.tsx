import React from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { ArrowRight, CheckCircle, Shield, Zap } from 'lucide-react-native';

export default function OnboardingScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {/* Hero Section */}
        <View className="items-center px-6 pt-10 pb-6">
          <View className="w-20 h-20 bg-blue-100 rounded-2xl items-center justify-center mb-6">
            <Zap size={40} color="#0066cc" />
          </View>
          <Text className="text-3xl font-bold text-center text-slate-900 mb-2">
            DefiTech Student Hub
          </Text>
          <Text className="text-lg text-center text-slate-500 mb-8">
            L'ERP institutionnel nouvelle génération pour votre réussite académique.
          </Text>
        </View>

        {/* Features Grid */}
        <View className="px-6 space-y-6">
          <FeatureItem 
            title="Planning Dynamique" 
            desc="Consultez vos cours en temps réel et recevez des rappels intelligents."
          />
          <FeatureItem 
            title="Ressources & IA" 
            desc="Accédez aux cours et posez vos questions à notre Assistant IA 24/7."
          />
          <FeatureItem 
            title="Communauté Active" 
            desc="Échangez sur le forum et participez aux quiz pour gagner des XP."
          />
        </View>

        {/* Call to Action */}
        <View className="mt-auto px-6 py-8 space-y-4">
          <TouchableOpacity 
            onPress={() => router.push('/auth/login')}
            className="w-full bg-primary py-4 rounded-xl items-center flex-row justify-center shadow-lg shadow-blue-200"
          >
            <Text className="text-white font-bold text-lg mr-2">Se Connecter</Text>
            <ArrowRight size={20} color="white" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={() => router.push('/auth/register')}
            className="w-full bg-slate-100 py-4 rounded-xl items-center border border-slate-200"
          >
            <Text className="text-slate-700 font-bold text-lg">Créer un compte</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => router.push('/(tabs)')}
            className="py-2 items-center"
          >
            <Text className="text-slate-400 text-sm">Continuer en tant qu'invité (Demo)</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureItem({ title, desc }: { title: string, desc: string }) {
  return (
    <View className="flex-row items-start mb-4">
      <View className="bg-green-100 p-2 rounded-full mr-4 mt-1">
        <CheckCircle size={20} color="#16a34a" />
      </View>
      <View className="flex-1">
        <Text className="font-bold text-slate-800 text-base mb-1">{title}</Text>
        <Text className="text-slate-500 leading-5">{desc}</Text>
      </View>
    </View>
  );
}
