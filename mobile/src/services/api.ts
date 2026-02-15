import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// URL de production du projet DefiTech Student Hub
const API_URL = 'https://defi-tech-student-hub.vercel.app/api'; 

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercepteur pour ajouter le token JWT à chaque requête
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('userToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
