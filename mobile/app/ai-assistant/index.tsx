import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Send, Bot, User, ChevronLeft, Sparkles, Zap } from 'lucide-react-native';
import { router } from 'expo-router';
import api from '../../src/services/api';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: "Bonjour ! Je suis votre assistant DefiTech. Comment puis-je vous aider dans vos révisions aujourd'hui ?", sender: 'ai', timestamp: new Date() }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      // Appel à ton API de chat qui gère la rotation Groq
      const response = await api.post('/chat', { message: inputText });
      
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: response.data.response,
        sender: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: "Désolé, j'ai rencontré une erreur. Vérifiez vos jetons IA ou votre connexion.",
        sender: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <View className="px-4 py-4 flex-row items-center bg-white border-b border-slate-200 justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <ChevronLeft size={24} color="#0f172a" />
          </TouchableOpacity>
          <View>
            <Text className="text-xl font-bold text-slate-900">Assistant IA</Text>
            <View className="flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
              <Text className="text-xs text-slate-500 font-medium">Rotation Groq Active</Text>
            </View>
          </View>
        </View>
        <View className="bg-blue-50 px-3 py-1 rounded-full flex-row items-center">
          <Zap size={14} color="#3b82f6" />
          <Text className="text-blue-600 text-xs font-bold ml-1">Tokens: Illimités</Text>
        </View>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        className="flex-1"
      >
        <ScrollView 
          ref={scrollViewRef}
          className="flex-1 p-4"
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((msg) => (
            <View 
              key={msg.id} 
              className={`mb-4 flex-row ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'ai' && (
                <View className="bg-blue-600 w-8 h-8 rounded-full items-center justify-center mr-2 self-end">
                  <Bot size={18} color="white" />
                </View>
              )}
              <View 
                className={`max-w-[80%] p-4 rounded-2xl ${
                  msg.sender === 'user' 
                    ? 'bg-blue-600 rounded-tr-none' 
                    : 'bg-white border border-slate-100 rounded-tl-none'
                }`}
              >
                <Text className={`${msg.sender === 'user' ? 'text-white' : 'text-slate-800'} leading-5`}>
                  {msg.text}
                </Text>
              </View>
            </View>
          ))}
          {isTyping && (
            <View className="flex-row mb-4">
              <View className="bg-blue-600 w-8 h-8 rounded-full items-center justify-center mr-2">
                <Bot size={18} color="white" />
              </View>
              <View className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-100">
                <ActivityIndicator size="small" color="#3b82f6" />
              </View>
            </View>
          )}
        </ScrollView>

        <View className="p-4 bg-white border-t border-slate-200">
          <View className="flex-row items-center bg-slate-100 rounded-2xl px-4 py-2">
            <TextInput 
              placeholder="Posez votre question académique..."
              value={inputText}
              onChangeText={setInputText}
              multiline
              className="flex-1 text-slate-900 max-h-24 py-2"
            />
            <TouchableOpacity 
              onPress={sendMessage}
              disabled={!inputText.trim() || isTyping}
              className={`p-2 rounded-xl ${!inputText.trim() || isTyping ? 'bg-slate-300' : 'bg-blue-600'}`}
            >
              <Send size={20} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
