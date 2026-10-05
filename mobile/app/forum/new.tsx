import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import api from '../../src/services/api';
import { getErrorMessage, logError } from '../../src/services/errors';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { FormField } from '@/components/form-field';
import { RequireLogin } from '@/components/require-login';

// Mêmes bornes que le serveur (src/app/api/forum/_lib/forum.ts).
const TITLE_MIN = 5;
const TITLE_MAX = 150;
const CONTENT_MIN = 10;
const CONTENT_MAX = 5000;

export default function NewQuestionScreen() {
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (cleanTitle.length < TITLE_MIN) {
      Alert.alert('Erreur', `Le titre doit contenir au moins ${TITLE_MIN} caractères.`);
      return;
    }
    if (cleanContent.length < CONTENT_MIN) {
      Alert.alert('Erreur', `Décrivez votre question en au moins ${CONTENT_MIN} caractères.`);
      return;
    }

    setLoading(true);
    try {
      const cleanTags = tags.trim();
      const response = await api.post('/forum/questions', {
        title: cleanTitle,
        content: cleanContent,
        ...(cleanTags ? { tags: cleanTags } : {}),
      });

      // La réponse du tuteur IA est ajoutée quelques secondes après la publication.
      const createdId: unknown = response.data?.id;
      if (typeof createdId === 'string' && createdId) {
        router.replace({ pathname: '/forum/[id]', params: { id: createdId } });
      } else {
        router.back();
      }
    } catch (error) {
      logError('publication question', error);
      Alert.alert('Erreur', getErrorMessage(error, 'Impossible de publier la question.'));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Screen>
        <ScreenHeader title="Poser une question" />
        <RequireLogin message="Connectez-vous pour publier une question sur le forum." />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-slate-50 dark:bg-slate-950"
    >
      <Screen>
        <ScreenHeader title="Poser une question" />
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FormField
            label="Titre"
            placeholder="Résumez votre question"
            value={title}
            onChangeText={setTitle}
            maxLength={TITLE_MAX}
          />
          <FormField
            label="Détails"
            placeholder="Expliquez votre problème, ajoutez du code si besoin..."
            value={content}
            onChangeText={setContent}
            multiline
            maxLength={CONTENT_MAX}
            textAlignVertical="top"
            style={{ minHeight: 140 }}
          />
          <FormField
            label="Tags (facultatif)"
            placeholder="python, algorithmes"
            value={tags}
            onChangeText={setTags}
            autoCapitalize="none"
            hint="Séparés par des virgules (5 au maximum)."
          />

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            accessibilityRole="button"
            className={`w-full py-4 rounded-xl items-center mt-2 ${loading ? 'bg-blue-400' : 'bg-blue-600'}`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-lg">Publier la question</Text>
            )}
          </TouchableOpacity>

          <View className="h-6" />
        </ScrollView>
      </Screen>
    </KeyboardAvoidingView>
  );
}
