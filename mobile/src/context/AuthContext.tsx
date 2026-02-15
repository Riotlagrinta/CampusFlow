import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import api from '../services/api';

interface AuthContextType {
  user: any;
  token: string | null;
  isLoading: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStorageData();
  }, []);

  async function loadStorageData() {
    try {
      const authDataSerialized = await SecureStore.getItemAsync('userToken');
      if (authDataSerialized) {
        setToken(authDataSerialized);
        // Optionnel : Récupérer le profil utilisateur depuis l'API ici
      }
    } catch (error) {
      console.error('Erreur chargement stockage:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const signIn = async (email: string, pass: string) => {
    try {
      const response = await api.post('/auth/login', { email, password: pass });
      const { token, user } = response.data;

      setToken(token);
      setUser(user);
      await SecureStore.setItemAsync('userToken', token);
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Erreur de connexion');
    }
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync('userToken');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans un AuthProvider');
  return context;
};
