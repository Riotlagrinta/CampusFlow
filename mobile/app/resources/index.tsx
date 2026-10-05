import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Linking, Alert } from 'react-native';
import { FileText, ExternalLink, CirclePlay, Folder, ChevronRight, WifiOff, FolderOpen } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { SITE_URL } from '../../src/config';
import { fetchAllPages } from '../../src/services/pagination';
import { goBackOrHome } from '@/components/screen-header';
import { useCachedResource } from '@/hooks/use-cached-resource';
import { useAppColors } from '@/hooks/use-app-colors';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { RequireLogin } from '@/components/require-login';
import { EmptyView, ErrorView, LoadingView, StatusBanner } from '@/components/state-views';

interface Resource {
  id: string;
  type: string;
  title: string;
  url?: string | null;
  size?: string | null;
  semester?: number | null;
  subject?: { name?: string } | null;
}

interface FolderCrumb {
  id: string | null;
  title: string;
}

const ROOT: FolderCrumb = { id: null, title: 'Ressources' };

/** Adresse ouvrable d'une ressource : https, ou chemin relatif du site (anciens fichiers /uploads). */
function resolveResourceUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/')) return `${SITE_URL}${url}`;
  return url.startsWith('https://') ? url : null;
}

export default function ResourcesScreen() {
  const { token } = useAuth();
  const colors = useAppColors();
  const [path, setPath] = useState<FolderCrumb[]>([ROOT]);
  const current = path[path.length - 1];

  // Les ressources sont paginées par 50 côté serveur : toutes les pages du dossier sont lues.
  const fetchResources = useCallback(
    () =>
      fetchAllPages<Resource>('/resources', current.id ? { parentId: current.id } : {}),
    [current.id]
  );
  const resources = useCachedResource<Resource[]>(
    `resources:${current.id ?? 'root'}`,
    fetchResources,
    !!token
  );

  const openResource = async (resource: Resource) => {
    if (resource.type === 'FOLDER') {
      setPath((previous) => [...previous, { id: resource.id, title: resource.title }]);
      return;
    }

    const target = resolveResourceUrl(resource.url);
    if (!target) {
      Alert.alert('Ressource indisponible', "Le lien de ce document n'est pas valide.");
      return;
    }
    try {
      await Linking.openURL(target);
    } catch {
      Alert.alert('Erreur', "Impossible d'ouvrir ce document sur cet appareil.");
    }
  };

  const goUp = () => {
    if (path.length > 1) {
      setPath((previous) => previous.slice(0, -1));
    } else {
      goBackOrHome();
    }
  };

  if (!token) {
    return (
      <Screen>
        <ScreenHeader title="Ressources" />
        <RequireLogin message="Connectez-vous pour accéder à vos cours et documents." />
      </Screen>
    );
  }

  const list = resources.data ?? [];

  return (
    <Screen>
      <ScreenHeader
        title={current.title}
        subtitle={path.length > 1 ? path.map((crumb) => crumb.title).join(' / ') : undefined}
        onBack={goUp}
        right={resources.offline ? <WifiOff size={20} color="#ef4444" /> : undefined}
      />

      {resources.loading ? (
        <LoadingView />
      ) : resources.error && !resources.data ? (
        <ErrorView message={resources.error} onRetry={resources.reload} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={resources.refreshing} onRefresh={resources.refresh} />}
        >
          <StatusBanner offline={resources.offline} error={resources.data ? resources.error : null} />

          {list.length === 0 ? (
            <EmptyView
              icon={FolderOpen}
              title="Aucun document"
              message={path.length > 1 ? 'Ce dossier est vide.' : "Aucune ressource n'est disponible pour votre filière."}
            />
          ) : (
            list.map((resource) => {
              const isFolder = resource.type === 'FOLDER';
              const isMedia = resource.type === 'VIDEO' || resource.type === 'AUDIO';
              const details = [
                resource.subject?.name,
                isFolder ? null : resource.size,
                resource.semester ? `S${resource.semester}` : null,
              ]
                .filter(Boolean)
                .join(' • ');

              return (
                <TouchableOpacity
                  key={resource.id}
                  onPress={() => openResource(resource)}
                  accessibilityRole="button"
                  accessibilityLabel={`${isFolder ? 'Dossier' : 'Document'} ${resource.title}`}
                  className="bg-white dark:bg-slate-900 p-4 rounded-xl mb-3 flex-row items-center border border-slate-100 dark:border-slate-800"
                >
                  <View
                    className={`p-3 rounded-lg mr-4 ${
                      isFolder
                        ? 'bg-amber-50 dark:bg-amber-950'
                        : isMedia
                          ? 'bg-blue-50 dark:bg-blue-950'
                          : 'bg-red-50 dark:bg-red-950'
                    }`}
                  >
                    {isFolder ? (
                      <Folder size={24} color="#f59e0b" />
                    ) : isMedia ? (
                      <CirclePlay size={24} color="#3b82f6" />
                    ) : (
                      <FileText size={24} color="#ef4444" />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="font-bold text-slate-900 dark:text-white">{resource.title}</Text>
                    {details ? (
                      <Text className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">{details}</Text>
                    ) : null}
                  </View>
                  {isFolder ? (
                    <ChevronRight size={20} color={colors.subtle} />
                  ) : (
                    <View className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full">
                      <ExternalLink size={20} color={colors.muted} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
