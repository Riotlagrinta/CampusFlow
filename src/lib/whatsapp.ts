export async function sendWhatsAppMessage(to: string, message: string) {
  const instanceId = process.env.WHATSAPP_INSTANCE_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (!instanceId || !token) {
    console.warn("⚠️ WHATSAPP : Instance ID ou Token manquant dans les variables d'environnement.");
    return;
  }

  // Nettoyage du numéro (doit commencer par le code pays sans le +)
  const cleanNumber = to.replace(/\D/g, '');

  const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
  
  const data = {
    token: token,
    to: cleanNumber,
    body: message,
    priority: 10
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    if (result.sent === "true") {
      console.log(`✅ WHATSAPP ENVOYÉ à ${cleanNumber}`);
      return true;
    } else {
      console.error("❌ WHATSAPP ÉCHEC :", result.error || "Erreur inconnue");
      return false;
    }
  } catch (error) {
    console.error("🔥 WHATSAPP CRASH :", error);
    return false;
  }
}
