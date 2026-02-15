import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { User, Mail, Lock, Check, ArrowLeft } from 'lucide-react-native';

export default function Register() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const handleRegister = () => {
    // TODO: Implement registration logic
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 p-6"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <TouchableOpacity onPress={() => router.back()} className="mb-6">
            <ArrowLeft size={24} color="#0f172a" />
          </TouchableOpacity>

          <Text className="text-3xl font-bold text-slate-900 mb-2">Inscription</Text>
          <Text className="text-slate-500 mb-8">Créez votre compte étudiant DefiTech.</Text>

          <View className="space-y-4 mb-6">
            <View>
              <Text className="text-slate-700 font-medium mb-2">Nom complet</Text>
              <View className="flex-row items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50">
                <User size={20} color="#64748b" />
                <TextInput 
                  placeholder="Jean Dupont"
                  value={formData.name}
                  onChangeText={(text) => setFormData({...formData, name: text})}
                  className="flex-1 ml-3 text-slate-900"
                />
              </View>
            </View>

            <View>
              <Text className="text-slate-700 font-medium mb-2">Email Institutionnel</Text>
              <View className="flex-row items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50">
                <Mail size={20} color="#64748b" />
                <TextInput 
                  placeholder="jean.dupont@defitech.tg"
                  value={formData.email}
                  onChangeText={(text) => setFormData({...formData, email: text})}
                  className="flex-1 ml-3 text-slate-900"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View>
              <Text className="text-slate-700 font-medium mb-2">Mot de passe</Text>
              <View className="flex-row items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50">
                <Lock size={20} color="#64748b" />
                <TextInput 
                  placeholder="••••••••"
                  secureTextEntry
                  value={formData.password}
                  onChangeText={(text) => setFormData({...formData, password: text})}
                  className="flex-1 ml-3 text-slate-900"
                />
              </View>
            </View>

            <View>
              <Text className="text-slate-700 font-medium mb-2">Confirmer le mot de passe</Text>
              <View className="flex-row items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50">
                <Lock size={20} color="#64748b" />
                <TextInput 
                  placeholder="••••••••"
                  secureTextEntry
                  value={formData.confirmPassword}
                  onChangeText={(text) => setFormData({...formData, confirmPassword: text})}
                  className="flex-1 ml-3 text-slate-900"
                />
              </View>
            </View>
          </View>

          <TouchableOpacity 
            onPress={handleRegister}
            className="w-full bg-green-600 py-4 rounded-xl items-center shadow-md shadow-green-200 mb-6"
          >
            <Text className="text-white font-bold text-lg">S'inscrire</Text>
          </TouchableOpacity>

          <View className="flex-row justify-center pb-8">
            <Text className="text-slate-500">Déjà inscrit ? </Text>
            <TouchableOpacity onPress={() => router.push('/auth/login')}>
              <Text className="text-green-600 font-bold">Se connecter</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
