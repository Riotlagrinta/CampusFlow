import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { Mail, Lock, ArrowLeft, Eye, EyeOff } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    setLoading(true);
    try {
      await signIn(email, password);
      router.replace('/(tabs)');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Email ou mot de passe incorrect';
      Alert.alert('Erreur de connexion', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 p-6"
      >
        <TouchableOpacity onPress={() => router.back()} className="mb-8">
          <ArrowLeft size={24} color="#0f172a" />
        </TouchableOpacity>

        <Text className="text-3xl font-bold text-slate-900 mb-2">Bon retour 👋</Text>
        <Text className="text-slate-500 mb-8">Connectez-vous pour accéder à votre espace étudiant.</Text>

        <View className="mb-6">
          <View className="mb-4">
            <Text className="text-slate-700 font-medium mb-2">Email Universitaire</Text>
            <View className="flex-row items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50">
              <Mail size={20} color="#64748b" />
              <TextInput 
                placeholder="etudiant@defitech.tg"
                value={email}
                onChangeText={setEmail}
                className="flex-1 ml-3 text-slate-900"
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
          </View>

          <View>
            <Text className="text-slate-700 font-medium mb-2">Mot de passe</Text>
            <View className="flex-row items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50">
              <Lock size={20} color="#64748b" />
              <TextInput 
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                className="flex-1 ml-3 text-slate-900"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={20} color="#64748b" /> : <Eye size={20} color="#64748b" />}
              </TouchableOpacity>
            </View>
            <TouchableOpacity className="self-end mt-2">
              <Text className="text-blue-600 font-medium text-sm">Mot de passe oublié ?</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity 
          onPress={handleLogin}
          disabled={loading}
          className={`w-full py-4 rounded-xl items-center shadow-md shadow-blue-200 ${loading ? 'bg-blue-400' : 'bg-blue-600'}`}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold text-lg">Se connecter</Text>
          )}
        </TouchableOpacity>

        <View className="flex-row justify-center mt-6">
          <Text className="text-slate-500">Pas encore de compte ? </Text>
          <TouchableOpacity onPress={() => router.push('/auth/register')}>
            <Text className="text-blue-600 font-bold">S&apos;inscrire</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
