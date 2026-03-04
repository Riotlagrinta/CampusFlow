export async function sendWhatsAppMessage(to: string, message: string) {
  // Récupération sécurisée avec backup
  const instanceId = process.env.WHATSAPP_INSTANCE_ID || "instance163891";
  const token = process.env.WHATSAPP_TOKEN || "z0qxf3wh7bpnws3z";

  if (!instanceId || !token) {
    console.warn("⚠️ WHATSAPP : Identifiants manquants.");
    return false;
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
