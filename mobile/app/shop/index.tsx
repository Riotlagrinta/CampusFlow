import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { Zap, Sparkles, MessageCircle, ChevronLeft, ArrowRight, CheckCircle2 } from 'lucide-react-native';
import { router } from 'expo-router';

const PACKS = [
  {
    id: 'starter',
    name: 'Pack Découverte',
    tokens: 50,
    price: 500,
    description: 'Parfait pour un devoir rapide.',
    color: 'bg-blue-500',
    popular: false
  },
  {
    id: 'pro',
    name: 'Pack Révision',
    tokens: 150,
    price: 1000,
    description: 'Idéal pour préparer un examen.',
    color: 'bg-purple-600',
    popular: true
  },
  {
    id: 'master',
    name: 'Pack Master',
    tokens: 500,
    price: 2000,
    description: 'Accès illimité pour tout le semestre.',
    color: 'bg-amber-500',
    popular: false
  }
];

export default function ShopScreen() {
  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <View className="px-4 py-4 flex-row items-center bg-white border-b border-slate-200">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <ChevronLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-slate-900">Boutique de Jetons IA</Text>
      </View>

      <ScrollView className="p-4" showsVerticalScrollIndicator={false}>
        <View className="mb-6 mt-2">
          <Text className="text-2xl font-black text-slate-900 leading-tight">
            Libérez la puissance de l&apos;IA pour vos études
          </Text>
          <Text className="text-slate-500 font-medium mt-2">
            Rechargez vos jetons en un clic via T-Money ou Flooz.
          </Text>
        </View>

        {PACKS.map((pack) => (
          <TouchableOpacity 
            key={pack.id}
            onPress={() => router.push({
              pathname: '/shop/checkout',
              params: { packId: pack.id }
            })}
            className={`bg-white rounded-[2.5rem] p-6 mb-6 border-2 ${pack.popular ? 'border-blue-500 shadow-xl shadow-blue-100' : 'border-slate-100'} relative overflow-hidden`}
          >
            {pack.popular && (
              <View className="absolute top-4 right-6 bg-blue-500 px-3 py-1 rounded-full">
                <Text className="text-[10px] font-black text-white uppercase">Populaire</Text>
              </View>
            )}

            <View className={`${pack.color} w-12 h-12 rounded-2xl items-center justify-center mb-4 shadow-lg`}>
              {pack.id === 'starter' ? <Zap size={24} color="white" /> : pack.id === 'pro' ? <MessageCircle size={24} color="white" /> : <Sparkles size={24} color="white" />}
            </View>

            <Text className="text-xl font-black text-slate-900">{pack.name}</Text>
            <Text className="text-slate-500 text-sm font-medium mb-4">{pack.description}</Text>

            <View className="flex-row items-baseline mb-4">
              <Text className="text-3xl font-black text-slate-900">{pack.price}</Text>
              <Text className="text-xs font-bold text-slate-500 ml-1 uppercase">FCFA</Text>
            </View>

            <View className="flex-row items-center mb-6">
              <Text className="text-blue-600 font-black text-2xl">{pack.tokens}</Text>
              <Text className="text-blue-600 font-bold text-xs uppercase ml-2 tracking-widest">Jetons</Text>
            </View>

            <View className="space-y-2 mb-6">
              <View className="flex-row items-center">
                <CheckCircle2 size={16} color="#10b981" />
                <Text className="text-slate-600 text-xs font-bold ml-2">Recherches Google incluses</Text>
              </View>
              <View className="flex-row items-center">
                <CheckCircle2 size={16} color="#10b981" />
                <Text className="text-slate-600 text-xs font-bold ml-2">Analyse de PDF</Text>
              </View>
            </View>

            <View className={`w-full py-4 rounded-2xl flex-row items-center justify-center ${pack.popular ? 'bg-blue-600' : 'bg-slate-900'}`}>
              <Text className="text-white font-black text-xs uppercase tracking-widest mr-2">Acheter maintenant</Text>
              <ArrowRight size={16} color="white" />
            </View>
          </TouchableOpacity>
        ))}
        
        <View className="h-10" />
      </ScrollView>
    </SafeAreaView>
  );
}
