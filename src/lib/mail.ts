import nodemailer from 'nodemailer';

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPass) {
    console.warn('❌ CONFIG EMAIL : Identifiants Gmail manquants dans .env.local');
    return;
  }

  console.log(`📧 TENTATIVE D'ENVOI MAIL : Vers ${to} | Sujet: ${subject}`);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"StudentHub" <${gmailUser}>`,
      to,
      subject,
      html,
    });
    console.log('✅ MAIL ENVOYÉ ! ID Message:', info.messageId);
    return info;
  } catch (error: any) {
    console.error('❌ ERREUR LORS DE L\'ENVOI DU MAIL :', error.message);
    if (error.code === 'EAUTH') {
      console.error('   Piste : Erreur d\'authentification ! Vérifiez GMAIL_APP_PASSWORD.');
    }
    throw error;
  }
}
