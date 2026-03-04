import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, ScrollView, Platform, KeyboardAvoidingView, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { User, Mail, Lock, Check, ArrowLeft, BookOpen, GraduationCap, Smartphone } from 'lucide-react-native';
import api from '../../src/services/api';

export default function Register() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    fieldId: '',
    academicLevelId: '',
  });

  const [options, setOptions] = useState<{ fields: any[], levels: any[] }>({ fields: [], levels: [] });
  const [loading, setLoading] = useState(false);
  const [fetchingOptions, setFetchingOptions] = useState(true);

  useEffect(() => {
    // Charger les filières et niveaux depuis le serveur
    api.get('/academic/options')
      .then(res => {
        setOptions(res.data);
        setFetchingOptions(false);
      })
      .catch(err => {
        console.error("Erreur options:", err);
        setFetchingOptions(false);
      });
  }, []);

  const handleRegister = async () => {
    if (!formData.email || !formData.phone || !formData.password || !formData.fieldId || !formData.academicLevelId) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs obligatoires.');
      return;
    }

    setLoading(true);
    try {
      // Transformation technique pour l'API qui attend levelId
      const apiData = {
        ...formData,
        levelId: formData.academicLevelId
      };
      
      const res = await api.post('/auth/register', apiData);
      if (res.data.success) {
        Alert.alert('Succès', 'Votre compte a été créé. Un code de validation vous a été envoyé sur WhatsApp.');
        router.push('/auth/login');
      } else {
        Alert.alert('Erreur', res.data.error || "Une erreur est survenue.");
      }
    } catch (error: any) {
      const msg = error.response?.data?.error || "Impossible de contacter le serveur.";
      Alert.alert('Erreur d\'inscription', msg);
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
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => router.back()} className="mb-6">
            <ArrowLeft size={24} color="#0f172a" />
          </TouchableOpacity>

          <Text className="text-3xl font-bold text-slate-900 mb-2">Inscription</Text>
          <Text className="text-slate-500 mb-8">Rejoignez la communauté DefiTech.</Text>

          <View className="space-y-4 mb-6">
            <View className="flex-row justify-between">
                <View className="w-[48%]">
                    <Text className="text-slate-700 font-medium mb-2">Prénom</Text>
                    <View className="flex-row items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50">
                        <TextInput 
                        placeholder="Jean"
                        value={formData.firstName}
                        onChangeText={(text) => setFormData({...formData, firstName: text})}
                        className="flex-1 text-slate-900"
                        />
                    </View>
                </View>
                <View className="w-[48%]">
                    <Text className="text-slate-700 font-medium mb-2">Nom</Text>
                    <View className="flex-row items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50">
                        <TextInput 
                        placeholder="Dupont"
                        value={formData.lastName}
                        onChangeText={(text) => setFormData({...formData, lastName: text})}
                        className="flex-1 text-slate-900"
                        />
                    </View>
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
              <Text className="text-slate-700 font-medium mb-2">Numéro WhatsApp</Text>
              <View className="flex-row items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50">
                <Smartphone size={20} color="#64748b" />
                <TextInput 
                  placeholder="22890000000"
                  value={formData.phone}
                  onChangeText={(text) => setFormData({...formData, phone: text})}
                  className="flex-1 ml-3 text-slate-900"
                  keyboardType="phone-pad"
                />
              </View>
              <Text className="text-[10px] text-slate-400 mt-1 ml-1">Le code de validation sera envoyé sur ce numéro.</Text>
            </View>

            <View>
              <Text className="text-slate-700 font-medium mb-2">Filière</Text>
              <View className="flex-row flex-wrap gap-2">
                {options.fields.map(f => (
                    <TouchableOpacity 
                        key={f.id}
                        onPress={() => setFormData({...formData, fieldId: f.id})}
                        className={`px-3 py-2 rounded-lg border ${formData.fieldId === f.id ? 'bg-blue-600 border-blue-600' : 'bg-slate-50 border-slate-200'}`}
                    >
                        <Text className={`text-xs font-bold ${formData.fieldId === f.id ? 'text-white' : 'text-slate-600'}`}>{f.code}</Text>
                    </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text className="text-slate-700 font-medium mb-2">Niveau</Text>
              <View className="flex-row flex-wrap gap-2">
                {options.levels.map(l => (
                    <TouchableOpacity 
                        key={l.id}
                        onPress={() => setFormData({...formData, academicLevelId: l.id})}
                        className={`px-3 py-2 rounded-lg border ${formData.academicLevelId === l.id ? 'bg-green-600 border-green-600' : 'bg-slate-50 border-slate-200'}`}
                    >
                        <Text className={`text-xs font-bold ${formData.academicLevelId === l.id ? 'text-white' : 'text-slate-600'}`}>{l.name}</Text>
                    </TouchableOpacity>
                ))}
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
          </View>

          <TouchableOpacity 
            onPress={handleRegister}
            disabled={loading}
            className={`w-full py-4 rounded-xl items-center shadow-md mb-6 ${loading ? 'bg-slate-300' : 'bg-green-600 shadow-green-200'}`}
          >
            {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">S'inscrire</Text>}
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
