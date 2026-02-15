import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { BookOpen, Trophy, Timer, ChevronLeft, Play } from 'lucide-react-native';
import { router } from 'expo-router';

export default function QuizScreen() {
  const quizzes = [
    { id: 1, title: 'Algorithmique L1', questions: 10, time: '15 min', difficulty: 'Moyen', reward: '50 XP' },
    { id: 2, title: 'Réseaux Sociaux & Sécurité', questions: 15, time: '20 min', difficulty: 'Difficile', reward: '100 XP' },
    { id: 3, title: 'Culture Générale Informatique', questions: 5, time: '5 min', difficulty: 'Facile', reward: '20 XP' },
  ];

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <View className="px-4 py-4 flex-row items-center bg-white border-b border-slate-200">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <ChevronLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-slate-900">Quiz & Défis</Text>
      </View>

      <View className="bg-blue-600 m-4 p-6 rounded-3xl flex-row items-center justify-between shadow-lg shadow-blue-200">
        <View className="flex-1">
          <Text className="text-white/80 font-medium text-sm">Rang actuel</Text>
          <Text className="text-white text-2xl font-bold">Top 10%</Text>
        </View>
        <Trophy size={40} color="white" />
      </View>

      <ScrollView className="p-4">
        <Text className="text-lg font-bold text-slate-800 mb-4">Quiz disponibles</Text>
        {quizzes.map((quiz) => (
          <View key={quiz.id} className="bg-white p-5 rounded-2xl mb-4 shadow-sm border border-slate-100">
            <View className="flex-row justify-between items-start mb-3">
              <View className="flex-1">
                <Text className="font-bold text-slate-900 text-lg mb-1">{quiz.title}</Text>
                <Text className="text-blue-600 font-bold text-sm">Récompense : {quiz.reward}</Text>
              </View>
              <View className="bg-slate-100 px-2 py-1 rounded">
                <Text className="text-xs text-slate-600 font-medium">{quiz.difficulty}</Text>
              </View>
            </View>

            <View className="flex-row items-center mb-4">
              <View className="flex-row items-center mr-4">
                <BookOpen size={16} color="#64748b" />
                <Text className="text-slate-500 text-xs ml-1">{quiz.questions} Qs</Text>
              </View>
              <View className="flex-row items-center">
                <Timer size={16} color="#64748b" />
                <Text className="text-slate-500 text-xs ml-1">{quiz.time}</Text>
              </View>
            </View>

            <TouchableOpacity className="bg-blue-600 py-3 rounded-xl items-center flex-row justify-center">
              <Play size={16} color="white" fill="white" />
              <Text className="text-white font-bold ml-2">Commencer le Quiz</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
