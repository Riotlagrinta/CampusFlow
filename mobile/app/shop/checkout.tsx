import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView, Alert, Linking } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ChevronLeft, Smartphone, CheckCircle2, Copy, Info, MessageCircle, ArrowLeft } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import api from '../../src/services/api';

const PACKS: Record<string, { name: string, price: number, tokens: number }> = {
  'starter': { name: 'Pack Découverte', price: 500, tokens: 50 },
  'pro': { name: 'Pack Révision', price: 1000, tokens: 150 },
  'master': { name: 'Pack Master', price: 2000, tokens: 500 }
};

const ADMIN_PHONE = "+22871796050"; 
const TMONEY_NUMBER = "71796050"; 
const FLOOZ_NUMBER = "79683081";  

export default function CheckoutScreen() {
  const { packId } = useLocalSearchParams();
  const pack = PACKS[packId as string] || PACKS.starter;

  const [method, setMethod] = useState<'TMONEY' | 'FLOOZ' | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGeniusPay = async () => {
    setLoading(true);
    try {
      // Appel à l'API de ton serveur (qui est déjà configurée pour Genius Pay)
      const res = await api.post('/payment/genius/create', { packId });
      
      if (res.data.url) {
        // Ouvrir l'URL de paiement dans le navigateur du smartphone
        await Linking.openURL(res.data.url);
        // Rediriger vers l'accueil ou le profil après ouverture
        router.replace('/(tabs)');
      } else {
        Alert.alert('Erreur', res.data.error || "Impossible d'initialiser le paiement.");
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Erreur', "Problème de connexion au serveur de paiement.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copié !', 'Le numéro a été copié dans votre presse-papiers.');
  };

  const handleNotifyAdmin = async () => {
    setLoading(true);
    
    try {
        // 1. Enregistrer l'intention sur le serveur
        await api.post('/payment/manual-request', { packId, method });

        // 2. Préparer le message WhatsApp
        const message = `Bonjour Admin ! Je viens d'effectuer un transfert de ${pack.price} FCFA par ${method} pour le ${pack.name}. Voici ma preuve de paiement (capture d'écran) :`;
        const whatsappUrl = `whatsapp://send?phone=${ADMIN_PHONE.replace(/\+/g, '')}&text=${encodeURIComponent(message)}`;
        
        const canOpen = await Linking.canOpenURL(whatsappUrl);
        if (canOpen) {
          await Linking.openURL(whatsappUrl);
        } else {
          // Fallback vers l'URL web
          await Linking.openURL(`https://wa.me/${ADMIN_PHONE.replace(/\+/g, '')}?text=${encodeURIComponent(message)}`);
        }
        
        router.replace('/(tabs)');
    } catch (error) {
        Alert.alert('Erreur', "Impossible de contacter le serveur ou d'ouvrir WhatsApp.");
    } finally {
        setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-4 py-4 flex-row items-center border-b border-slate-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <ArrowLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-slate-900">Finaliser votre achat</Text>
      </View>

      <ScrollView className="p-6" showsVerticalScrollIndicator={false}>
        <View className="mb-8">
          <Text className="text-slate-500 font-medium">Suivez les instructions pour activer vos jetons.</Text>
        </View>

        {/* Recap Pack */}
        <View className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex-row items-center justify-between mb-8">
          <View>
            <Text className="text-[10px] font-black uppercase text-blue-600 tracking-widest mb-1">Pack sélectionné</Text>
            <Text className="text-xl font-bold text-slate-900">{pack.name}</Text>
            <Text className="text-sm text-slate-500 font-medium">{pack.tokens} jetons IA</Text>
          </View>
          <Text className="text-2xl font-black text-slate-900">{pack.price} FCFA</Text>
        </View>

        {/* Step 1: Method */}
        <View className="mb-8">
          <View className="flex-row items-center mb-4">
            <View className="w-6 h-6 bg-slate-900 rounded-full flex items-center justify-center mr-3">
              <Text className="text-white text-xs font-black">1</Text>
            </View>
            <Text className="font-bold text-slate-800">Choisissez votre moyen de paiement</Text>
          </View>
          
          <View className="space-y-4">
            {/* Genius Pay Automatic */}
            <TouchableOpacity 
              onPress={handleGeniusPay}
              disabled={loading}
              className="p-6 rounded-[2rem] border-2 border-blue-500 bg-blue-50/50 flex-row items-center shadow-sm"
            >
              <View className="w-12 h-12 bg-blue-600 rounded-2xl items-center justify-center shadow-lg">
                <Smartphone color="white" />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Recommandé</Text>
                <Text className="text-lg font-black text-slate-900">Paiement Automatique</Text>
                <Text className="text-xs text-slate-500 font-medium italic">T-Money & Flooz (Instantané)</Text>
              </View>
            </TouchableOpacity>

            <View className="flex-row items-center py-2">
                <View className="flex-1 h-[1px] bg-slate-200" />
                <Text className="mx-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ou manuel</Text>
                <View className="flex-1 h-[1px] bg-slate-200" />
            </View>

            <View className="flex-row justify-between">
              <TouchableOpacity 
                onPress={() => setMethod('TMONEY')}
                className={`w-[48%] p-6 rounded-3xl border-2 items-center ${method === 'TMONEY' ? 'border-yellow-400 bg-yellow-50' : 'border-slate-100 bg-white'}`}
              >
                <View className="w-12 h-12 bg-yellow-400 rounded-2xl flex items-center justify-center shadow-lg mb-3">
                  <Smartphone color="white" />
                </View>
                <Text className="font-black text-[10px] uppercase tracking-widest text-slate-900">Manuel T-Money</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={() => setMethod('FLOOZ')}
                className={`w-[48%] p-6 rounded-3xl border-2 items-center ${method === 'FLOOZ' ? 'border-blue-600 bg-blue-50' : 'border-slate-100 bg-white'}`}
              >
                <View className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg mb-3">
                  <Smartphone color="white" />
                </View>
                <Text className="font-black text-[10px] uppercase tracking-widest text-slate-900">Manuel Flooz</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Step 2 & 3 */}
        {method && (
          <View className="space-y-6">
            <View className="flex-row items-center mb-4">
              <View className="w-6 h-6 bg-slate-900 rounded-full flex items-center justify-center mr-3">
                <Text className="text-white text-xs font-black">2</Text>
              </View>
              <Text className="font-bold text-slate-800">Effectuez le transfert</Text>
            </View>

            <View className="bg-slate-900 p-8 rounded-[2.5rem] mb-6">
              <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Numéro à créditer</Text>
              <View className="flex-row items-center justify-between">
                <Text className="text-3xl font-black text-white tracking-tighter">
                  {method === 'TMONEY' ? TMONEY_NUMBER : FLOOZ_NUMBER}
                </Text>
                <TouchableOpacity 
                  onPress={() => copyToClipboard(method === 'TMONEY' ? TMONEY_NUMBER : FLOOZ_NUMBER)}
                  className="bg-white/10 p-3 rounded-xl"
                >
                  <Copy size={20} color="white" />
                </TouchableOpacity>
              </View>
              
              <View className="flex-row items-start mt-6 bg-white/5 p-4 rounded-2xl border border-white/5">
                <Info size={16} color="#60a5fa" />
                <Text className="text-xs text-slate-400 ml-2 flex-1">
                  Vérifiez bien le numéro avant de confirmer le transfert.
                </Text>
              </View>
            </View>

            <View className="flex-row items-center mb-4">
              <View className="w-6 h-6 bg-slate-900 rounded-full flex items-center justify-center mr-3">
                <Text className="text-white text-xs font-black">3</Text>
              </View>
              <Text className="font-bold text-slate-800">Envoyez votre preuve</Text>
            </View>

            <Text className="text-sm text-slate-500 font-medium mb-4">
              Une fois le transfert effectué, envoyez une capture d'écran de la confirmation à l'administrateur.
            </Text>

            <TouchableOpacity 
              onPress={handleNotifyAdmin}
              className="w-full py-5 bg-emerald-600 rounded-[2rem] flex-row items-center justify-center shadow-xl shadow-emerald-100"
            >
              <MessageCircle size={20} color="white" />
              <Text className="text-white font-black uppercase text-xs tracking-widest ml-3">Preuve par WhatsApp</Text>
            </TouchableOpacity>
            
            <View className="h-10" />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
