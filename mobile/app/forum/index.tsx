import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { MessageSquare, Search, Plus } from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import api from '../../src/services/api';
import { logError } from '../../src/services/errors';
import { formatDate, fullName, plainText, toList } from '../../src/utils/format';
import { useCachedResource } from '@/hooks/use-cached-resource';
import { useAppColors } from '@/hooks/use-app-colors';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { RequireLogin } from '@/components/require-login';
import { EmptyView, ErrorView, LoadingView, StatusBanner } from '@/components/state-views';

interface ForumQuestion {
  id: string;
  title: string;
  content?: string;
  createdAt?: string;
  author?: { firstName?: string | null; lastName?: string | null } | null;
  field?: { name?: string; code?: string } | null;
  _count?: { answers?: number };
}

const PAGE_SIZE = 20;
const MIN_SEARCH_LENGTH = 2;

export default function ForumScreen() {
  const { token } = useAuth();
  const colors = useAppColors();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [extra, setExtra] = useState<ForumQuestion[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const termRef = useRef('');

  // La recherche est faite côté serveur (titre, contenu, tags), après une courte pause de frappe.
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = query.trim();
      setSearchTerm(trimmed.length >= MIN_SEARCH_LENGTH ? trimmed : '');
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    termRef.current = searchTerm;
  }, [searchTerm]);

  const fetchFirstPage = useCallback(async (): Promise<ForumQuestion[]> => {
    const response = await api.get('/forum/questions', {
      params: { limit: PAGE_SIZE, ...(searchTerm ? { q: searchTerm } : {}) },
    });
    return toList<ForumQuestion>(response.data);
  }, [searchTerm]);

  const questions = useCachedResource<ForumQuestion[]>(
    `forumQuestions:${searchTerm}`,
    fetchFirstPage,
    !!token
  );
  const { data: firstPage, reload } = questions;

  // Nouvelle première page (recherche, actualisation) : les pages suivantes sont à relire.
  useEffect(() => {
    setExtra([]);
    setExhausted(false);
  }, [firstPage]);

  // Au retour (après publication d'une question), la liste est relue sans écran de chargement.
  const hasFocusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }
      if (token) void reload();
    }, [token, reload])
  );

  const list = useMemo(() => [...(firstPage ?? []), ...extra], [firstPage, extra]);
  const hasMore = !exhausted && (firstPage?.length ?? 0) >= PAGE_SIZE;

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || list.length === 0) return;
    const term = searchTerm;
    setLoadingMore(true);
    try {
      const response = await api.get('/forum/questions', {
        params: {
          limit: PAGE_SIZE,
          cursor: list[list.length - 1].id,
          ...(term ? { q: term } : {}),
        },
      });
      // La recherche a changé pendant l'appel : cette page n'est plus pertinente.
      if (termRef.current !== term) return;
      const page = toList<ForumQuestion>(response.data);
      setExtra((previous) => {
        const known = new Set([...(firstPage ?? []), ...previous].map((item) => item.id));
        return [...previous, ...page.filter((item) => !known.has(item.id))];
      });
      if (page.length < PAGE_SIZE) setExhausted(true);
    } catch (error) {
      logError('forum (page suivante)', error);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, list, searchTerm, firstPage]);

  if (!token) {
    return (
      <Screen>
        <ScreenHeader title="Forum communautaire" />
        <RequireLogin message="Connectez-vous pour lire et publier des questions sur le forum." />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Forum communautaire" />

      <View className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <View className="flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-2">
          <Search size={20} color={colors.muted} />
          <TextInput
            placeholder="Rechercher un sujet..."
            placeholderTextColor={colors.placeholder}
            value={query}
            onChangeText={setQuery}
            accessibilityLabel="Rechercher un sujet"
            autoCorrect={false}
            returnKeyType="search"
            className="flex-1 ml-2 text-slate-900 dark:text-white"
          />
        </View>
      </View>

      {questions.loading ? (
        <LoadingView />
      ) : questions.error && !questions.data ? (
        <ErrorView message={questions.error} onRetry={questions.reload} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 + insets.bottom }}
          refreshing={questions.refreshing}
          onRefresh={questions.refresh}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <StatusBanner offline={questions.offline} error={questions.data ? questions.error : null} />
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator className="my-4" color={colors.primary} /> : null
          }
          ListEmptyComponent={
            <EmptyView
              icon={MessageSquare}
              title={searchTerm ? 'Aucun résultat' : 'Aucune question pour le moment'}
              message={searchTerm ? 'Essayez un autre mot-clé.' : 'Soyez le premier à poser une question !'}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/forum/[id]', params: { id: item.id } })}
              accessibilityRole="button"
              accessibilityLabel={`Question : ${plainText(item.title)}`}
              className="bg-white dark:bg-slate-900 p-4 rounded-xl mb-4 border border-slate-100 dark:border-slate-800"
            >
              {item.field?.code ? (
                <Text className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-1">{item.field.code}</Text>
              ) : null}
              <Text className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                {plainText(item.title)}
              </Text>
              {item.content ? (
                <Text numberOfLines={2} className="text-slate-500 dark:text-slate-400 text-sm">
                  {plainText(item.content)}
                </Text>
              ) : null}
              <View className="flex-row items-center justify-between mt-3">
                <Text className="text-slate-500 dark:text-slate-400 text-xs flex-1 mr-2" numberOfLines={1}>
                  Par {fullName(item.author, 'Anonyme')}
                  {item.createdAt ? ` • ${formatDate(item.createdAt)}` : ''}
                </Text>
                <View className="flex-row items-center">
                  <MessageSquare size={16} color={colors.muted} />
                  <Text className="text-slate-600 dark:text-slate-300 text-xs ml-1">
                    {item._count?.answers ?? 0}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        onPress={() => router.push('/forum/new')}
        accessibilityRole="button"
        accessibilityLabel="Poser une question"
        className="absolute right-6 bg-blue-600 w-14 h-14 rounded-full items-center justify-center shadow-lg"
        style={{ bottom: insets.bottom + 24 }}
      >
        <Plus size={30} color="white" />
      </TouchableOpacity>
    </Screen>
  );
}
