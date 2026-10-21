import sys
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        
        # En-tête sur les pages > 1
        if self._pageNumber > 1:
            self.drawString(45, 805, "CampusHub Togo — Charte d'Équipe & Cadrage Technologique")
            self.drawRightString(550, 805, "Projet Académique 2026-2027")
            self.setStrokeColor(colors.HexColor("#E2E8F0"))
            self.setLineWidth(0.75)
            self.line(45, 798, 550, 798)
            
        # Pied de page sur toutes les pages
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.75)
        self.line(45, 42, 550, 42)
        
        self.drawString(45, 30, "Document officiel — Soumis à l'approbation de l'enseignant")
        page_str = f"Page {self._pageNumber} sur {page_count}"
        self.drawRightString(550, 30, page_str)
        self.restoreState()

def build_pdf(filename="Charte_Equipe_CampusHub_TG.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=45,
        rightMargin=45,
        topMargin=50,
        bottomMargin=50
    )

    styles = getSampleStyleSheet()
    
    # Custom Palette
    c_primary = colors.HexColor("#1E3A8A")   # Blue 900
    c_accent = colors.HexColor("#2563EB")    # Blue 600
    c_dark = colors.HexColor("#0F172A")      # Slate 900
    c_text = colors.HexColor("#334155")      # Slate 700
    c_border = colors.HexColor("#CBD5E1")    # Slate 300
    c_bg_light = colors.HexColor("#F8FAFC")  # Slate 50

    # Typography Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=c_primary,
        alignment=TA_CENTER
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=15,
        textColor=c_accent,
        alignment=TA_CENTER
    )

    h1_style = ParagraphStyle(
        'Heading1Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=c_primary,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Heading2Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14,
        textColor=c_accent,
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'BodyCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=c_text,
        alignment=TA_JUSTIFY,
        spaceAfter=5
    )

    body_bold = ParagraphStyle(
        'BodyBoldCustom',
        parent=body_style,
        fontName='Helvetica-Bold'
    )

    cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=c_text
    )

    cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=cell_style,
        fontName='Helvetica-Bold',
        textColor=c_dark
    )

    cell_header = ParagraphStyle(
        'TableCellHeader',
        parent=cell_style,
        fontName='Helvetica-Bold',
        textColor=colors.white,
        alignment=TA_CENTER
    )

    callout_style = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#1E293B")
    )

    story = []

    # ==================== BANNIÈRE D'EN-TÊTE ====================
    story.append(Paragraph("DOSSIER DE CADRAGE & CHARTE D'ÉQUIPE", title_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph("<b>Annexe A — Constitution d'Équipe & Spécification Préliminaire du Sujet</b>", subtitle_style))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_primary, spaceBefore=0, spaceAfter=12))

    # Bloc d'information administrative
    info_data = [
        [
            Paragraph("<b>Établissement :</b> DEFITECH Lomé", cell_style),
            Paragraph("<b>Nom de l'Équipe :</b> NEXUS CAMPUS", cell_style),
            Paragraph("<b>Année Académique :</b> 2026 - 2027", cell_style)
        ],
        [
            Paragraph("<b>Projet :</b> CampusHub Togo", cell_style),
            Paragraph("<b>Nature :</b> Plateforme SaaS & FinTech", cell_style),
            Paragraph("<b>Statut :</b> Soumis pour validation", cell_style)
        ]
    ]
    t_info = Table(info_data, colWidths=[170, 170, 165])
    t_info.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), c_bg_light),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_info)
    story.append(Spacer(1, 10))

    # ==================== SECTION 1 : COMPOSITION DE L'ÉQUIPE & RÔLES ====================
    story.append(Paragraph("1. Composition de l'Équipe & Attribution des Rôles", h1_style))
    story.append(Paragraph(
        "L'équipe a choisi le nom <b>NEXUS CAMPUS</b>, symbolisant le point de convergence entre les établissements d'enseignement supérieur, les familles et les apprenants. Les responsabilités sont réparties pour garantir autonomie technique et complémentarité.",
        body_style
    ))
    
    roles_data = [
        [
            Paragraph("Membre", cell_header),
            Paragraph("Rôle Attribué", cell_header),
            Paragraph("Responsabilités Principales", cell_header),
            Paragraph("Compétences Clés", cell_header)
        ],
        [
            Paragraph("<b>KARABOKA Kelvyn</b>", cell_bold),
            Paragraph("Chef de Projet &<br/>Lead Architecte FinTech", cell_style),
            Paragraph("Supervision générale, conception de l'architecture logicielle, intégration sécurisée des paiements (GeniusPay / T-Money / Flooz) et relation institutionnelle.", cell_style),
            Paragraph("Next.js, TypeScript, Architecture BDD, APIs de paiement, DevOps.", cell_style)
        ],
        [
            Paragraph("<b>Camarade 1</b><br/>(Désigné dans l'équipe)", cell_bold),
            Paragraph("Lead Développeur<br/>Frontend & UI/UX", cell_style),
            Paragraph("Conception des interfaces (Mobile-First), vitrines publiques des universités, portail parents pour la consultation des plannings et dashboards interactifs.", cell_style),
            Paragraph("React, Next.js App Router, Tailwind CSS, Ergonomie, Responsive Design.", cell_style)
        ],
        [
            Paragraph("<b>Camarade 2</b><br/>(Désigné dans l'équipe)", cell_bold),
            Paragraph("Lead Backend &<br/>Sécurité Données", cell_style),
            Paragraph("Modélisation de la base PostgreSQL multi-tenant, développement des endpoints d'API, génération certifiée des reçus de scolarité PDF et sécurité RLS.", cell_style),
            Paragraph("PostgreSQL, Prisma ORM, Node.js, Cryptographie, Tests d'API.", cell_style)
        ],
        [
            Paragraph("<b>Camarade 3</b><br/>(Désigné dans l'équipe)", cell_bold),
            Paragraph("Lead Mobile &<br/>Intégration IA", cell_style),
            Paragraph("Application mobile (Expo / React Native) pour notifications push en direct, intégration du module Tuteur IA (Groq Llama 3.3) et suivi des quotas.", cell_style),
            Paragraph("React Native, Expo, LLM APIs (Groq), State Management.", cell_style)
        ]
    ]

    t_roles = Table(roles_data, colWidths=[110, 110, 185, 100])
    t_roles.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_primary),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_bg_light]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_roles)
    story.append(Spacer(1, 10))

    # ==================== SECTION 2 : CHARTE D'ÉQUIPE (ANNEXE A) ====================
    story.append(Paragraph("2. Annexe A : Charte de Travail & Règles de Fonctionnement", h1_style))
    story.append(Paragraph(
        "Cette charte engage solidairement chaque membre à respecter les standards de qualité, de collaboration et d'éthique nécessaires à la réussite du projet.",
        body_style
    ))

    charte_points = [
        "<b>1. Ponctualité & Réunions :</b> Stand-up hebdomadaire obligatoire chaque lundi à 18h (présentiel ou Google Meet). Tout empêchement doit être notifié au moins 6h à l'avance sur le canal WhatsApp officiel.",
        "<b>2. Stratégie Git & Zéro Régression :</b> Aucun commit direct sur la branche <code>main</code>. Chaque fonctionnalité est développée sur une branche isolée (ex: <code>feat/payment-gateway</code>) et nécessite une Pull Request validée par un pair avant merge.",
        "<b>3. Communication Transparente :</b> Tout blocage technique persistant plus de 24h doit être immédiatement partagé sur le groupe pour un déblocage en pair-programming.",
        "<b>4. Règle d'Implication & Retards :</b> En cas de retard non justifié sur un livrable critique, une session de rattrapage intensive est organisée le samedi. Le non-respect récurrent expose à un signalement auprès de l'enseignant encadrant.",
        "<b>5. Respect & Résolution des Conflits :</b> Les divergences techniques sont tranchées par argumentation objective et vote à la majorité simple, le Chef de Projet disposant d'une voix prépondérante en cas d'égalité."
    ]

    for pt in charte_points:
        story.append(Paragraph(f"• {pt}", body_style))
    story.append(Spacer(1, 6))

    # Bloc signatures
    sig_data = [
        [
            Paragraph("<b>KARABOKA Kelvyn</b><br/>Chef de Projet<br/><br/><i>Lu et approuvé</i><br/>___________________", cell_style),
            Paragraph("<b>Camarade 1</b><br/>Lead Frontend<br/><br/><i>Lu et approuvé</i><br/>___________________", cell_style),
            Paragraph("<b>Camarade 2</b><br/>Lead Backend<br/><br/><i>Lu et approuvé</i><br/>___________________", cell_style),
            Paragraph("<b>Camarade 3</b><br/>Lead Mobile / IA<br/><br/><i>Lu et approuvé</i><br/>___________________", cell_style)
        ]
    ]
    t_sig = Table(sig_data, colWidths=[126, 126, 126, 127])
    t_sig.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('BACKGROUND', (0,0), (-1,-1), c_bg_light),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_sig)

    story.append(PageBreak())

    # ==================== SECTION 3 : PRÉSENTATION DU SUJET PROPOSÉ ====================
    story.append(Paragraph("3. Sujet Proposé : CampusHub Togo", h1_style))
    story.append(Paragraph("<b>Titre officiel :</b> Plateforme SaaS B2B2C Multi-Universités & FinTech de Paiement Scolaire", h2_style))

    story.append(Paragraph(
        "<b>A. Contexte et Problématique :</b><br/>"
        "Dans l'enseignement supérieur au Togo, l'accès à l'information académique reste fragmenté (groupes WhatsApp surchargés, plannings non synchronisés, perte de cours). De plus, les familles sont confrontées chaque trimestre au calvaire des files d'attente aux guichets bancaires ou aux caisses pour régler la scolarité de leurs enfants. Enfin, les universités privées manquent d'un canal digital unifié pour présenter leurs offres de formation aux bacheliers.",
        body_style
    ))

    story.append(Paragraph(
        "<b>B. Solution Développée :</b><br/>"
        "<b>CampusHub Togo</b> est une plateforme web et mobile modulaire articulée autour de 3 piliers :<br/>"
        "• <b>Pour les Écoles (B2B SaaS) :</b> Chaque université dispose de sa page institutionnelle, gère ses filières, publie ses emplois du temps officiels et dématérialise son recouvrement financier.<br/>"
        "• <b>Pour les Parents (FinTech) :</b> Consultation en temps réel des horaires et paiement dématérialisé et instantané des tranches de scolarité par <b>Mobile Money (T-Money, Moov Flooz)</b> avec délivrance d'un reçu numérique certifié par QR code.<br/>"
        "• <b>Pour les Étudiants (B2C EdTech) :</b> Accès centralisé aux ressources pédagogiques et à un <b>Tuteur d'Intelligence Artificielle 24/7</b> pour la révision et la préparation aux examens.",
        body_style
    ))

    # Objectifs Court & Long terme
    obj_data = [
        [
            Paragraph("Objectifs à Court Terme (Mois 1 - 2)", cell_header),
            Paragraph("Objectifs à Long Terme (Mois 3 - 12)", cell_header)
        ],
        [
            Paragraph(
                "• Implémentation du socle multi-tenant (PostgreSQL isolant chaque établissement).<br/>"
                "• Portail vitrine listant les universités togolaises avec filtre par filière.<br/>"
                "• Page institutionnelle modèle avec emploi du temps dynamique.<br/>"
                "• Module FinTech MVP de paiement Mobile Money avec génération de reçu PDF certifié.<br/>"
                "• Présentation du prototype pilote à l'administration de DEFITECH.",
                cell_style
            ),
            Paragraph(
                "• Déploiement officiel en production sur un panel pilote d'étudiants.<br/>"
                "• Tableau de bord comptable de réconciliation financière pour les universités.<br/>"
                "• Intégration de l'application mobile Expo pour notifications push (emplois du temps).<br/>"
                "• Onboarding de 5 à 10 universités partenaires de Lomé (UAC, ESA, Formatec, etc.).<br/>"
                "• Monétisation du tuteur IA étudiant par micro-recharges Mobile Money.",
                cell_style
            )
        ]
    ]
    t_obj = Table(obj_data, colWidths=[252, 253])
    t_obj.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_accent),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('BACKGROUND', (0,1), (-1,1), c_bg_light),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_obj)
    story.append(Spacer(1, 10))

    # Bénéfices Financiers
    story.append(Paragraph("<b>C. Modèle Économique & Bénéfices Financiers :</b>", h2_style))
    story.append(Paragraph(
        "Le projet s'appuie sur une rentabilité éprouvée via un modèle tripartite :<br/>"
        "1. <b>Abonnement B2B Universités :</b> Facturation mensuelle indexée sur l'effectif étudiant (de 80 000 FCFA/mois pour les petits instituts à 400 000 FCFA/mois pour les grands campus). Estimation : <b>14,4 M FCFA / an</b> pour 5 écoles.<br/>"
        "2. <b>Commissions FinTech Scolarité :</b> Prélèvement d'une commission de service de 1% à 1.5% sur chaque tranche de scolarité réglée par T-Money/Flooz. Pour 1 500 étudiants (panier moyen 500 000 FCFA), la marge brute s'élève à <b>~7,5 M FCFA / an</b>.<br/>"
        "3. <b>Micro-Paiements Étudiants :</b> Formule freemium avec Pass Révision IA à 1 000 FCFA/mois ou packs de jetons à 500 FCFA via Mobile Money (~4,8 M FCFA / an).<br/>"
        "👉 <b>Potentiel global estimé en année de croisière :</b> <b>~28 700 000 FCFA / an</b> avec une marge brute supérieure à 80%.",
        body_style
    ))
    story.append(Spacer(1, 6))

    # ==================== SECTION 4 : CHOIX DE LA STACK & JUSTIFICATION ====================
    story.append(Paragraph("4. Choix de la Stack Technologique & Justifications", h1_style))
    story.append(Paragraph(
        "Le choix technique repose sur une analyse rigoureuse des compétences de l'équipe, de la documentation disponible et des contraintes d'isolation multi-tenant et de sécurité financière.",
        body_style
    ))

    stack_data = [
        [
            Paragraph("Composant", cell_header),
            Paragraph("Technologie Retenue", cell_header),
            Paragraph("Justification & Adaptation au Sujet", cell_header),
            Paragraph("Compétences & Écosystème", cell_header)
        ],
        [
            Paragraph("<b>Langage</b>", cell_bold),
            Paragraph("<b>TypeScript</b><br/>(Full-Stack)", cell_style),
            Paragraph("Sécurité du typage statique indispensable pour les calculs de transactions financières et les interfaces multi-écoles. Partage des contrats d'interface entre web et mobile.", cell_style),
            Paragraph("Compétence déjà maîtrisée par l'équipe ; documentation TypeScript officielle riche.", cell_style)
        ],
        [
            Paragraph("<b>Framework Web & API</b>", cell_bold),
            Paragraph("<b>Next.js 15/16</b><br/>(App Router)", cell_style),
            Paragraph("Architecture hybride combinant rendu côté serveur (SSR) pour le référencement naturel des vitrines d'universités et API routes légères pour la communication sécurisée.", cell_style),
            Paragraph("Écosystème React mature, Server Actions évitant la duplication de code.", cell_style)
        ],
        [
            Paragraph("<b>Base de Données & ORM</b>", cell_bold),
            Paragraph("<b>PostgreSQL</b><br/>+ Prisma ORM", cell_style),
            Paragraph("Moteur relationnel conforme ACID garantissant une cohérence absolue des paiements scolaires. Modélisation multi-tenant robuste (Institutions, Filières, Factures, Reçus).", cell_style),
            Paragraph("SQL maîtrisé dans le cursus académique ; Prisma offre une auto-complétion typée et des migrations fiables.", cell_style)
        ],
        [
            Paragraph("<b>Passerelle Paiement</b>", cell_bold),
            Paragraph("<b>GeniusPay API</b><br/>(T-Money, Flooz)", cell_style),
            Paragraph("Agrégateur certifié au Togo prenant en charge les portefeuilles locaux (T-Money Togo Telecom et Moov Money). Gestion de webhooks signés et traitement idempotent.", cell_style),
            Paragraph("Documentation API claire, support des devises XOF, validation par Regex des numéros togolais.", cell_style)
        ],
        [
            Paragraph("<b>Moteur d'IA</b>", cell_bold),
            Paragraph("<b>Groq SDK</b><br/>(Llama 3.3 70B)", cell_style),
            Paragraph("Inférence ultra-rapide (500 tokens/s) permettant un dialogue fluide sans latence pour le tuteur étudiant. Coût extrêmement faible permettant le modèle freemium.", cell_style),
            Paragraph("API compatible OpenAI, rotation automatique de modèles configurée en cas de charge.", cell_style)
        ]
    ]

    t_stack = Table(stack_data, colWidths=[80, 95, 205, 125])
    t_stack.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_primary),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_bg_light]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_stack)
    story.append(Spacer(1, 12))

    # Cadre de conclusion / approbation
    approb_data = [
        [
            Paragraph("<b>Avis et Validation de l'Enseignant Responsable :</b><br/><br/>[  ] Sujet Validé sans réserve &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [  ] Validé avec modifications &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [  ] Refusé<br/><br/>Observations : ____________________________________________________________________________<br/><br/>Signature & Date : ________________________________________", callout_style)
        ]
    ]
    t_approb = Table(approb_data, colWidths=[505])
    t_approb.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 1.5, c_primary),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#EFF6FF")),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(t_approb)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"PDF généré avec succès : {filename}")

if __name__ == "__main__":
    build_pdf()
