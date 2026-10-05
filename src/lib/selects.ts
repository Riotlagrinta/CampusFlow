import { Prisma } from "@prisma/client";

// Champs d'un utilisateur que l'on peut renvoyer à l'utilisateur lui-même.
// Jamais de password, otpCode, resetCode ni pushToken dans une réponse API.
export const safeUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  image: true,
  bio: true,
  role: true,
  xp: true,
  level: true,
  streak: true,
  isSubscribed: true,
  subscriptionExpiresAt: true,
  referralCode: true,
  fieldId: true,
  academicLevelId: true,
  aiBonusRequests: true,
} satisfies Prisma.UserSelect;

// Champs d'un auteur visible par les autres utilisateurs (forum, ressources...).
export const publicAuthorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  image: true,
  level: true,
} satisfies Prisma.UserSelect;
