import { Alert, Linking } from 'react-native';
import { SITE_URL } from '../config';

/**
 * Le serveur exige un CAPTCHA que l'application ne peut pas afficher : proposer d'ouvrir la page
 * correspondante du site web, où la vérification fonctionne.
 */
export function offerWebFallback(path: '/register' | '/login', message: string): void {
  Alert.alert('Vérification requise', message, [
    { text: 'Annuler', style: 'cancel' },
    {
      text: 'Ouvrir le site',
      onPress: () => {
        Linking.openURL(`${SITE_URL}${path}`).catch(() => {
          Alert.alert('Ouverture impossible', "Ouvrez le site depuis votre navigateur pour terminer cette étape.");
        });
      },
    },
  ]);
}
