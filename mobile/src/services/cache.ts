import AsyncStorage from '@react-native-async-storage/async-storage';

export const cacheData = async (key: string, data: any) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Erreur lors de la mise en cache de ${key}:`, error);
  }
};

export const getCachedData = async (key: string) => {
  try {
    const cached = await AsyncStorage.getItem(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error(`Erreur lors de la récupération du cache pour ${key}:`, error);
    return null;
  }
};
