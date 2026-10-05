import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from './api';
import { logError } from './errors';

/**
 * Demande la permission, récupère le token Expo Push et l'envoie au serveur.
 * Le token n'est jamais journalisé (il permet d'envoyer des notifications à l'appareil).
 */
export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  if (!Device.isDevice) {
    // Les notifications push nécessitent un appareil physique.
    return undefined;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return undefined;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  try {
    await api.patch('/user/profile', { pushToken: token });
  } catch (error) {
    logError("Envoi du pushToken au serveur", error);
  }

  return token;
}

// Façon dont les notifications sont affichées quand l'application est ouverte.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
