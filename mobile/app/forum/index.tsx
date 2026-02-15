import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, SafeAreaView } from 'react-native';
import { MessageSquare, Search, Plus, ThumbsUp, ChevronLeft } from 'lucide-react-native';
import { router } from 'expo-router';

export default function ForumScreen() {
  const posts = [
    { id: 1, title: 'Problème avec React Native Navigation', author: 'Koffi', replies: 5, likes: 12, category: 'Dev' },
    { id: 2, title: "Date de l'examen de Réseaux L2", author: 'Awa', replies: 2, likes: 8, category: 'Examens' },
    { id: 3, title: 'Meilleures ressources pour apprendre SQL', author: 'Marc', replies: 10, likes: 25, category: 'Ressources' },
  ];

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <View className="px-4 py-4 flex-row items-center bg-white border-b border-slate-200">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <ChevronLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-slate-900">Forum Communautaire</Text>
      </View>

      <View className="p-4 bg-white border-b border-slate-200">
        <View className="flex-row items-center bg-slate-100 rounded-xl px-4 py-2">
          <Search size={20} color="#64748b" />
          <TextInput placeholder="Rechercher un sujet..." className="flex-1 ml-2 text-slate-900" />
        </View>
      </View>

      <ScrollView className="p-4">
        {posts.map((post) => (
          <TouchableOpacity key={post.id} className="bg-white p-4 rounded-xl mb-4 shadow-sm border border-slate-100">
            <Text className="text-xs font-bold text-blue-600 mb-1">{post.category}</Text>
            <Text className="text-lg font-bold text-slate-900 mb-2">{post.title}</Text>
            <View className="flex-row items-center justify-between mt-2">
              <Text className="text-slate-500 text-sm">Par {post.author}</Text>
              <View className="flex-row items-center">
                <View className="flex-row items-center mr-4">
                  <MessageSquare size={16} color="#64748b" />
                  <Text className="text-slate-600 text-xs ml-1">{post.replies}</Text>
                </View>
                <View className="flex-row items-center">
                  <ThumbsUp size={16} color="#64748b" />
                  <Text className="text-slate-600 text-xs ml-1">{post.likes}</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity className="absolute bottom-6 right-6 bg-blue-600 w-14 h-14 rounded-full items-center justify-center shadow-lg">
        <Plus size={30} color="white" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
