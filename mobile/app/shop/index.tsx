import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Zap, Sparkles, MessageCircle, ArrowRight, CircleCheck } from 'lucide-react-native';
import { Redirect, router } from 'expo-router';
import { PACKS } from '../../src/packs';
import { PAYMENTS_ENABLED } from '../../src/config';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';

function ShopContent() {
  return (
    <Screen>
      <ScreenHeader title="Boutique de jetons IA" />

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
        <View className="mb-6 mt-2">
          <Text className="text-2xl font-black text-slate-900 dark:text-white leading-tight">
            Libérez la puissance de l&apos;IA pour vos études
          </Text>
          <Text className="text-slate-500 dark:text-slate-400 font-medium mt-2">
            Rechargez vos jetons via T-Money ou Flooz.
          </Text>
        </View>

        {PACKS.map((pack) => (
          <TouchableOpacity
            key={pack.id}
            onPress={() =>
              router.push({
                pathname: '/shop/checkout',
                params: { packId: pack.id },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`${pack.name}, ${pack.tokens} jetons, ${pack.price} francs CFA`}
            className={`bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 mb-6 border-2 ${
              pack.popular ? 'border-blue-500' : 'border-slate-100 dark:border-slate-800'
            } relative overflow-hidden`}
          >
            {pack.popular && (
              <View className="absolute top-4 right-6 bg-blue-500 px-3 py-1 rounded-full">
                <Text className="text-[10px] font-black text-white uppercase">Populaire</Text>
              </View>
            )}

            <View className={`${pack.color} w-12 h-12 rounded-2xl items-center justify-center mb-4`}>
              {pack.id === 'starter' ? (
                <Zap size={24} color="white" />
              ) : pack.id === 'pro' ? (
                <MessageCircle size={24} color="white" />
              ) : (
                <Sparkles size={24} color="white" />
              )}
            </View>

            <Text className="text-xl font-black text-slate-900 dark:text-white">{pack.name}</Text>
            <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-4">{pack.description}</Text>

            <View className="flex-row items-baseline mb-4">
              <Text className="text-3xl font-black text-slate-900 dark:text-white">{pack.price}</Text>
              <Text className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1 uppercase">FCFA</Text>
            </View>

            <View className="flex-row items-center mb-6">
              <Text className="text-blue-600 dark:text-blue-400 font-black text-2xl">{pack.tokens}</Text>
              <Text className="text-blue-600 dark:text-blue-400 font-bold text-xs uppercase ml-2 tracking-widest">
                Jetons
              </Text>
            </View>

            <View className="mb-6">
              <View className="flex-row items-center mb-2">
                <CircleCheck size={16} color="#10b981" />
                <Text className="text-slate-600 dark:text-slate-300 text-xs font-bold ml-2">
                  Recherches Google incluses
                </Text>
              </View>
              <View className="flex-row items-center">
                <CircleCheck size={16} color="#10b981" />
                <Text className="text-slate-600 dark:text-slate-300 text-xs font-bold ml-2">Analyse de PDF</Text>
              </View>
            </View>

            <View
              className={`w-full py-4 rounded-2xl flex-row items-center justify-center ${
                pack.popular ? 'bg-blue-600' : 'bg-slate-900 dark:bg-slate-700'
              }`}
            >
              <Text className="text-white font-black text-xs uppercase tracking-widest mr-2">Acheter maintenant</Text>
              <ArrowRight size={16} color="white" />
            </View>
          </TouchableOpacity>
        ))}

        <View className="h-10" />
      </ScrollView>
    </Screen>
  );
}

export default function ShopScreen() {
  // Paiements désactivés (freemium) : l'écran n'existe pas. Aucun bouton n'y mène ; si l'écran est
  // atteint par navigation directe, retour immédiat à l'accueil.
  if (!PAYMENTS_ENABLED) return <Redirect href="/" />;
  return <ShopContent />;
}
