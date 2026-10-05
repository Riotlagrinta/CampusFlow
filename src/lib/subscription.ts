export function isPremium(user: {
  isSubscribed: boolean;
  subscriptionExpiresAt: Date | null;
}): boolean {
  return (
    user.isSubscribed &&
    user.subscriptionExpiresAt !== null &&
    user.subscriptionExpiresAt.getTime() > Date.now()
  );
}
