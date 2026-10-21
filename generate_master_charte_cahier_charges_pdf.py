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
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        
        # En-tête sur les pages > 1
        if self._pageNumber > 1:
            self.drawString(45, 805, "CampusHub Togo — Dossier de Cadrage, Charte d'Équipe & Cahier des Charges")
            self.drawRightString(550, 805, "Équipe NEXUS CAMPUS (2026-2027)")
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.75)
            self.line(45, 798, 550, 798)
            
        # Pied de page sur toutes les pages
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.75)
        self.line(45, 38, 550, 38)
        
        self.setFont("Helvetica", 8)
        self.drawString(45, 26, "Document académique officiel — DEFITECH Lomé (Génie Logiciel)")
        page_str = f"Page {self._pageNumber} sur {page_count}"
        self.drawRightString(550, 26, page_str)
        self.restoreState()

def build_pdf(filename="Dossier_Cadrage_Charte_Cahier_des_Charges_CampusHub.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=45,
        rightMargin=45,
        topMargin=46,
        bottomMargin=46
    )

    styles = getSampleStyleSheet()
    
    # Palette Institutionnelle Moderne
    c_primary = colors.HexColor("#0F2942")   # Bleu Marine Profond
    c_accent = colors.HexColor("#1D4ED8")    # Bleu Cobalt Royal
    c_secondary = colors.HexColor("#0284C7") # Bleu Cyan Pro
    c_dark = colors.HexColor("#0F172A")      # Noir Ardoise
    c_text = colors.HexColor("#334155")      # Gris Texte Foncé
    c_border = colors.HexColor("#CBD5E1")    # Bordures
    c_bg_light = colors.HexColor("#F8FAFC")  # Arrière-plan cartes

    # Typographie
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=17,
        leading=21,
        textColor=c_primary,
        alignment=TA_CENTER
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=13,
        textColor=c_accent,
        alignment=TA_CENTER
    )

    h1_style = ParagraphStyle(
        'Heading1Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11.5,
        leading=15,
        textColor=c_primary,
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Heading2Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=12.5,
        textColor=c_accent,
        spaceBefore=6,
        spaceAfter=2,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'BodyCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=c_text,
        alignment=TA_JUSTIFY,
        spaceAfter=3
    )

    cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
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
        fontSize=7.5,
        textColor=colors.white,
        alignment=TA_CENTER
    )

    callout_style = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10.5,
        textColor=colors.HexColor("#1E293B")
    )

    story = []

    # =========================================================================
    # PAGE 1 : IDENTITÉ, ATTRIBUTION DES RÔLES & CHARTE D'ÉQUIPE (ANNEXE A)
    # =========================================================================
    story.append(Paragraph("DOSSIER DE CADRAGE, CHARTE D'ÉQUIPE<br/>& CAHIER DES CHARGES", title_style))
    story.append(Spacer(1, 3))
    story.append(Paragraph("<b>Projet Académique : CampusHub Togo — Plateforme SaaS & FinTech Multi-Universités</b>", subtitle_style))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_primary, spaceBefore=0, spaceAfter=8))

    # Tableau méta-données
    meta_data = [
        [
            Paragraph("<b>Établissement :</b> DEFITECH Lomé", cell_style),
            Paragraph("<b>Nom d'Équipe :</b> NEXUS CAMPUS", cell_style),
            Paragraph("<b>Année Académique :</b> 2026 - 2027", cell_style)
        ],
        [
            Paragraph("<b>Projet :</b> CampusHub Togo", cell_style),
            Paragraph("<b>Typologie :</b> SaaS B2B2C / FinTech Éducative", cell_style),
            Paragraph("<b>Statut :</b> Validation Enseignant", cell_style)
        ]
    ]
    t_meta = Table(meta_data, colWidths=[170, 170, 165])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), c_bg_light),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 6))

    story.append(Paragraph("1. Fiche d'Identité de l'Équipe & Attribution des Rôles", h1_style))
    story.append(Paragraph(
        "L'équipe a choisi le nom <b>NEXUS CAMPUS</b>. Ce vocable incarne le trait d'union numérique reliant les directions d'universités, les enseignants, les parents et la communauté estudiantine. La répartition des rôles valorise les aptitudes individuelles et assure une stricte isolation des responsabilités :",
        body_style
    ))

    roles_data = [
        [
            Paragraph("Membre", cell_header),
            Paragraph("Rôle Attribué", cell_header),
            Paragraph("Missions & Responsabilités", cell_header),
            Paragraph("Compétences Clés", cell_header)
        ],
        [
            Paragraph("<b>KARABOKA Kelvyn</b>", cell_bold),
            Paragraph("Chef de Projet &<br/>Lead Architecte FinTech", cell_style),
            Paragraph("Supervision générale, modélisation architecturale, sécurisation des flux d'encaissement Mobile Money (GeniusPay T-Money/Flooz), coordination d'équipe et relation institutionnelle.", cell_style),
            Paragraph("Next.js, TypeScript, PostgreSQL, Intégration Paiement, DevOps.", cell_style)
        ],
        [
            Paragraph("<b>Camarade 1</b><br/>(Désigné)", cell_bold),
            Paragraph("Lead Développeur<br/>Frontend & UI/UX", cell_style),
            Paragraph("Conception et développement de l'interface Web (Mobile-First), vitrines publiques des universités, portail parent de consultation des emplois du temps et ergonomie globale.", cell_style),
            Paragraph("React, Next.js App Router, Tailwind CSS, Responsive Design, Accessibilité.", cell_style)
        ],
        [
            Paragraph("<b>Camarade 2</b><br/>(Désigné)", cell_bold),
            Paragraph("Lead Développeur<br/>Backend & BDD", cell_style),
            Paragraph("Conception du schéma de données PostgreSQL multi-tenant, développement des routes d'API REST, génération certifiée des reçus de paiement PDF avec QR Code et intégrité ACID.", cell_style),
            Paragraph("PostgreSQL, Prisma ORM, Node.js, Cryptographie, Tests d'API.", cell_style)
        ],
        [
            Paragraph("<b>Camarade 3</b><br/>(Désigné)", cell_bold),
            Paragraph("Lead Développeur<br/>Mobile & Moteur IA", cell_style),
            Paragraph("Développement de l'application mobile Expo (React Native) pour les notifications push, intégration du module Tuteur IA (Groq Llama 3.3) et suivi des quotas freemium.", cell_style),
            Paragraph("React Native, Expo Router, Groq LLM API, State Management.", cell_style)
        ]
    ]

    t_roles = Table(roles_data, colWidths=[105, 110, 190, 100])
    t_roles.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_primary),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_bg_light]),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_roles)
    story.append(Spacer(1, 5))

    story.append(Paragraph("2. Annexe A : Charte d'Équipe & Règles de Fonctionnement", h1_style))
    story.append(Paragraph(
        "Cette charte engage solidairement chaque membre au respect des standards d'excellence, de rigueur et de ponctualité :",
        body_style
    ))

    charte_bullets = [
        "<b>A. Rythme & Réunions :</b> Stand-up hebdomadaire obligatoire chaque lundi à 18h00 (présentiel ou Google Meet). Notification de tout empêchement au moins 6h à l'avance sur le canal WhatsApp officiel.",
        "<b>B. Règle Git & Zéro Régression :</b> Interdiction formelle de committer directement sur <code>main</code>. Chaque fonctionnalité est isolée sur une branche thématique (ex: <code>feat/school-portal</code>) avec Pull Request validée par un pair après tests.",
        "<b>C. Entraide & Escalade :</b> Tout blocage technique non résolu sous 24h est communiqué à l'équipe afin d'organiser une session de pair-programming.",
        "<b>D. Arbitrage :</b> Les choix sont débattus collégialement et validés à la majorité simple. En cas d'égalité stricte, la voix du Chef de Projet est prépondérante."
    ]
    for b in charte_bullets:
        story.append(Paragraph(f"• {b}", body_style))
    story.append(Spacer(1, 5))

    # Signatures
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
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_sig)

    story.append(PageBreak())

    # =========================================================================
    # PAGE 2 : CHOIX DU LANGAGE, FRAMEWORKS, BASES DE DONNÉES & JUSTIFICATIONS
    # =========================================================================
    story.append(Paragraph("3. Choix Technologiques Approfondis & Justifications", h1_style))
    story.append(Paragraph(
        "Conformément aux directives de cadrage académique, chaque composant de l'architecture logicielle a été évalué et retenu selon trois critères obligatoires : <b>les compétences actuelles de l'équipe</b>, <b>la documentation disponible</b>, et <b>l'adaptation spécifique au sujet</b> (multi-tenant, paiements financiers, trafic mobile au Togo).",
        body_style
    ))

    # --- LANGAGE ---
    story.append(Paragraph("3.1. Langage de Programmation : TypeScript (Full-Stack)", h2_style))
    story.append(Paragraph(
        "Le choix s'est porté à 100% sur <b>TypeScript</b> pour l'ensemble de l'écosystème (Frontend Web, API Backend et Application Mobile Expo).<br/>"
        "• <b>Compétences de l'équipe :</b> Maîtrise confirmée en JavaScript moderne et TypeScript, acquise en cours et sur des projets de digitalisation.<br/>"
        "• <b>Documentation disponible :</b> Standard absolu de l'industrie (Handbook officiel Microsoft, typages universels <code>@types/*</code> sur NPM).<br/>"
        "• <b>Adaptation au sujet :</b> Le typage statique strict élimine dès la compilation les erreurs critiques sur la manipulation des montants financiers (centimes, devises XOF, statuts stricts de paiement <code>PENDING | COMPLETED | FAILED</code>). Il permet en outre de partager directement les interfaces de données (modèles de scolarité, plannings) entre le Web, le Backend et le Mobile sans duplication.",
        body_style
    ))

    # --- FRAMEWORK WEB & API ---
    story.append(Paragraph("3.2. Framework Web & API : Next.js 15/16 (React 19 & App Router)", h2_style))
    story.append(Paragraph(
        "Pour le portail applicatif et l'API centrale, l'équipe a retenu <b>Next.js</b> avec l'architecture App Router.<br/>"
        "• <b>Compétences de l'équipe :</b> Maîtrise des concepts React (Composants, Hooks, Context, Server vs Client Components).<br/>"
        "• <b>Documentation disponible :</b> Documentation officielle Vercel d'une clarté exemplaire, supportée par un écosystème massif.<br/>"
        "• <b>Adaptation au sujet :</b> Double atout majeur :<br/>"
        "&nbsp;&nbsp;1. <i>Rendu Côté Serveur (SSR / SSG) :</i> Capital pour le référencement naturel (SEO) des vitrines d'universités sur Google auprès des futurs bacheliers togolais.<br/>"
        "&nbsp;&nbsp;2. <i>Server Actions & API Routes sécurisées :</i> Permettent d'exécuter les webhooks de paiement Mobile Money et les opérations comptables sensibles côté serveur, garantissant qu'aucune clé secrète ne fuite côté navigateur.",
        body_style
    ))

    # --- BASE DE DONNÉES & ORM ---
    story.append(Paragraph("3.3. Base de Données & ORM : PostgreSQL (Neon Serverless) & Prisma ORM", h2_style))
    story.append(Paragraph(
        "La gestion des données repose sur le moteur relationnel <b>PostgreSQL</b> hébergé sur Neon Serverless, interfacé via <b>Prisma ORM</b>.<br/>"
        "• <b>Compétences de l'équipe :</b> Formation approfondie sur le modèle relationnel, l'algèbre relationnelle et les requêtes SQL (jointures, index, transactions).<br/>"
        "• <b>Documentation disponible :</b> PostgreSQL est la base relationnelle open-source la plus documentée et éprouvée depuis 30 ans. Prisma fournit un client TypeScript auto-généré et des migrations de schéma automatisées.<br/>"
        "• <b>Adaptation au sujet :</b><br/>"
        "&nbsp;&nbsp;1. <i>Conformité ACID stricte :</i> Obligatoire pour une plateforme manipulant des frais de scolarité (Atomicité, Cohérence, Isolation, Durabilité). Un paiement Mobile Money ne peut être validé sans mise à jour immédiate et infaillible du solde étudiant.<br/>"
        "&nbsp;&nbsp;2. <i>Isolation Multi-Tenant :</i> Modélisation relationnelle avec clé étrangère <code>institutionId</code> et indexation composée, garantissant l'étanchéité absolue des données entre universités concurrentes.",
        body_style
    ))

    # --- AUTRES BRIQUES TECHNIQUES ---
    story.append(Paragraph("3.4. Briques Complémentaires : Mobile, FinTech & Intelligence Artificielle", h2_style))
    story.append(Paragraph(
        "• <b>Framework Mobile :</b> <b>React Native / Expo</b> — Permet un déploiement cross-platform rapide sur Android (qui représente plus de 90% du parc mobile au Togo) avec notifications push gratuites pour les alertes d'emplois du temps et rappels de scolarité.<br/>"
        "• <b>Passerelle FinTech :</b> <b>GeniusPay API</b> — Supporte nativement les portefeuilles locaux togolais (T-Money Togo Telecom et Moov Money Flooz) avec vérification cryptographique des signatures de callbacks.<br/>"
        "• <b>Moteur d'IA :</b> <b>Groq SDK (Llama 3.3 70B & Mixtral)</b> — Vitesse d'inférence exceptionnelle (500 tokens/s) sans latence, avec un coût infime permettant d'offrir le tuteur de révision en modèle freemium.",
        body_style
    ))
    story.append(Spacer(1, 4))

    # Tableau récapitulatif
    tech_matrix = [
        [
            Paragraph("Couche", cell_header),
            Paragraph("Technologie", cell_header),
            Paragraph("Compétences Équipe", cell_header),
            Paragraph("Documentation", cell_header),
            Paragraph("Critère Majeur d'Adaptation", cell_header)
        ],
        [
            Paragraph("<b>Langage</b>", cell_bold),
            Paragraph("TypeScript 5.x", cell_style),
            Paragraph("Avancée (Pratique continue)", cell_style),
            Paragraph("Excellente (Microsoft / NPM)", cell_style),
            Paragraph("Typage strict des calculs financiers et partage de code Web/Mobile.", cell_style)
        ],
        [
            Paragraph("<b>Web & API</b>", cell_bold),
            Paragraph("Next.js 15/16 App Router", cell_style),
            Paragraph("Confirmée (React, SSR, APIs)", cell_style),
            Paragraph("Exhaustive (Vercel, GitHub)", cell_style),
            Paragraph("SEO pour les vitrines d'écoles & Server Actions sécurisées pour les paiements.", cell_style)
        ],
        [
            Paragraph("<b>BDD & ORM</b>", cell_bold),
            Paragraph("PostgreSQL + Prisma", cell_style),
            Paragraph("Solide (SQL, Modélisation)", cell_style),
            Paragraph("Référence mondiale éprouvée", cell_style),
            Paragraph("Conformité ACID pour les transactions & Isolation multi-tenant stricte.", cell_style)
        ],
        [
            Paragraph("<b>FinTech</b>", cell_bold),
            Paragraph("GeniusPay (T-Money/Flooz)", cell_style),
            Paragraph("Maîtrisée (APIs REST, Regex)", cell_style),
            Paragraph("Claire (Docs locales Togo)", cell_style),
            Paragraph("Règlement instantané des scolarités via numéros +228 locaux.", cell_style)
        ]
    ]
    t_tech = Table(tech_matrix, colWidths=[65, 105, 105, 105, 125])
    t_tech.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_primary),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_bg_light]),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_tech)

    story.append(PageBreak())

    # =========================================================================
    # PAGE 3 : CAHIER DES CHARGES - UTILISATEURS, BESOINS & PÉRIMÈTRE
    # =========================================================================
    story.append(Paragraph("4. Cahier des Charges Fonctionnel & Technique", h1_style))
    story.append(Paragraph(
        "Ce cahier des charges formalise le cadre fonctionnel et opérationnel de <b>CampusHub Togo</b>. Il identifie les acteurs cibles, détaille leurs besoins spécifiques et fixe les limites strictes du périmètre de développement.",
        body_style
    ))

    story.append(Paragraph("4.1. Identification des Utilisateurs & Cartographie des Besoins (Personas)", h2_style))
    story.append(Paragraph(
        "Le système interconnecte quatre profils d'utilisateurs distincts dont les flux interagissent au sein de la plateforme :",
        body_style
    ))

    users_data = [
        [
            Paragraph("Profil Utilisateur", cell_header),
            Paragraph("Description & Pain Points Actuels", cell_header),
            Paragraph("Besoins Clés Exprimés dans CampusHub", cell_header)
        ],
        [
            Paragraph("<b>1. Direction d'Université & Comptabilité</b><br/>(B2B)", cell_bold),
            Paragraph("Grandes écoles et facultés privées de Lomé (DEFITECH, ESA, UAC, etc.).<br/><i>Pain points :</i> Recouvrement difficile des frais de scolarité, fraudes sur les bordereaux de banque, manque de visibilité digitale auprès des nouveaux bacheliers.", cell_style),
            Paragraph("• Mini-site vitrine officiel personnalisable (filières, tarifs, accréditations).<br/>• Tableau de bord d'encaissement en direct avec notification de paiement.<br/>• Publication et mise à jour en un clic des emplois du temps officiels.<br/>• Export comptable automatisé et diminution radicale des impayés.", cell_style)
        ],
        [
            Paragraph("<b>2. Parents d'Élèves</b><br/>(B2C FinTech)", cell_bold),
            Paragraph("Parents finançant les études supérieures de leurs enfants.<br/><i>Pain points :</i> Perte de temps colossale dans les files d'attente bancaires ou à la caisse de l'école ; méconnaissance des emplois du temps réels de leur enfant.", cell_style),
            Paragraph("• Consultation simple sans mot de passe complexe des horaires de cours.<br/>• Règlement en ligne instantané des tranches de scolarité via T-Money ou Moov Flooz.<br/>• Téléchargement immédiat d'un reçu officiel de paiement certifié par QR Code.<br/>• Réception de notifications SMS/WhatsApp à chaque paiement validé.", cell_style)
        ],
        [
            Paragraph("<b>3. Étudiants</b><br/>(B2C EdTech)", cell_bold),
            Paragraph("Apprenants inscrits de la Licence 1 au Master 2.<br/><i>Pain points :</i> Cours dispersés sur WhatsApp, plannings modifiés à la dernière minute sans préavis, manque d'accompagnement pédagogique personnalisé.", cell_style),
            Paragraph("• Compte gratuit rattaché à leur filière (GL, Réseaux, Gestion, etc.).<br/>• Consultation temps réel des salles, matières et modifications de planning.<br/>• Téléchargement centralisé des supports de cours et annales d'examens.<br/>• Tuteur IA interactif disponible 24h/24 pour réviser et générer des quiz.", cell_style)
        ],
        [
            Paragraph("<b>4. Super-Administrateur CampusHub</b>", cell_bold),
            Paragraph("Équipe technique et commerciale NEXUS CAMPUS.<br/><i>Rôle :</i> Gestionnaire de l'infrastructure globale multi-tenant.", cell_style),
            Paragraph("• Onboarding et validation des nouveaux établissements partenaires.<br/>• Suivi global des flux financiers et des commissions prélevées.<br/>• Monitoring de la disponibilité de la plateforme et gestion des quotas IA.", cell_style)
        ]
    ]

    t_users = Table(users_data, colWidths=[120, 185, 200])
    t_users.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_accent),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_bg_light]),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_users)
    story.append(Spacer(1, 6))

    story.append(Paragraph("4.2. Définition du Périmètre du Projet (In-Scope vs Out-of-Scope)", h2_style))
    story.append(Paragraph(
        "Afin de garantir une livraison respectant les délais académiques, le périmètre a été scrupuleusement borné entre ce qui relève du produit minimum viable (MVP) et les extensions futures :",
        body_style
    ))

    scope_data = [
        [
            Paragraph("PÉRIMÈTRE INCLUS (In-Scope pour le MVP V1)", cell_header),
            Paragraph("PÉRIMÈTRE EXCLU / REPORTÉ (Out-of-Scope V2)", cell_header)
        ],
        [
            Paragraph(
                "• <b>Multi-Tenancy :</b> Isolation stricte des données pour 3 écoles pilotes.<br/>"
                "• <b>Annuaire Public :</b> Moteur de recherche des universités togolaises par filière.<br/>"
                "• <b>Mini-Site Institutionnel :</b> Présentation de DEFITECH et des filières.<br/>"
                "• <b>Module Emplois du Temps :</b> Consultation dynamique par filière et niveau.<br/>"
                "• <b>Paiement FinTech :</b> Intégration T-Money & Flooz (GeniusPay) pour la scolarité.<br/>"
                "• <b>Reçu Numérique :</b> Génération automatique de reçu PDF muni d'un QR code vérifiable.<br/>"
                "• <b>Espace Étudiant & IA :</b> Hub de cours + Tuteur IA Llama 3.3 avec quota gratuit.",
                cell_style
            ),
            Paragraph(
                "• <i>Gestion complète des notes et bulletins semestriels</i> (reporté V2).<br/>"
                "• <i>Émargement biométrique des professeurs en salle de classe.</i><br/>"
                "• <i>Paiement par virement bancaire SWIFT international</i> (réservé aux devises hors UEMOA).<br/>"
                "• <i>Réseau social interne complexe avec messagerie privée chiffrée.</i><br/>"
                "• <i>Bourse de stages et recrutement d'entreprises partenaires.</i><br/>"
                "• <i>Déploiement international hors du Togo (Bénin, Côte d'Ivoire en V3).</i>",
                cell_style
            )
        ]
    ]
    t_scope = Table(scope_data, colWidths=[252, 253])
    t_scope.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,0), colors.HexColor("#059669")), # Vert In-Scope
        ('BACKGROUND', (1,0), (1,0), colors.HexColor("#64748B")), # Gris Out-of-Scope
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('BACKGROUND', (0,1), (-1,1), c_bg_light),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_scope)

    story.append(PageBreak())

    # =========================================================================
    # PAGE 4 : CAHIER DES CHARGES - FONCTIONNALITÉS (MoSCoW), CONTRAINTES & VALIDATION
    # =========================================================================
    story.append(Paragraph("4.3. Liste des Fonctionnalités & Classification par Priorités (Matrice MoSCoW)", h2_style))
    story.append(Paragraph(
        "Les fonctionnalités sont ordonnées selon la méthodologie <b>MoSCoW</b> (Must Have, Should Have, Could Have, Won't Have) afin de garantir la livraison continue de valeur fonctionnelle :",
        body_style
    ))

    moscow_data = [
        [
            Paragraph("Priorité", cell_header),
            Paragraph("Module & Fonctionnalité", cell_header),
            Paragraph("Description Détaillée & Critère d'Acceptation", cell_header),
            Paragraph("Cible", cell_header)
        ],
        [
            Paragraph("<font color='#DC2626'><b>MUST HAVE</b></font><br/>(P0 - Vital)", cell_style),
            Paragraph("<b>Paiement Scolarité T-Money / Flooz</b>", cell_bold),
            Paragraph("Formulaire de paiement en ligne sécurisé avec saisie du matricule étudiant, choix de la tranche, paiement Mobile Money via GeniusPay et mise à jour immédiate du statut.", cell_style),
            Paragraph("Parents / Écoles", cell_style)
        ],
        [
            Paragraph("<font color='#DC2626'><b>MUST HAVE</b></font><br/>(P0 - Vital)", cell_style),
            Paragraph("<b>Émission de Reçu PDF Certifié QR</b>", cell_bold),
            Paragraph("Génération instantanée d'une quittance de paiement PDF infalsifiable portant un QR Code scannable redirigeant vers une URL de vérification publique.", cell_style),
            Paragraph("Parents / Caisse", cell_style)
        ],
        [
            Paragraph("<font color='#DC2626'><b>MUST HAVE</b></font><br/>(P0 - Vital)", cell_style),
            Paragraph("<b>Isolation Multi-Tenant BDD</b>", cell_bold),
            Paragraph("Partitionnement logique des données par établissement (<code>institutionId</code>). Une université ne peut en aucun cas accéder aux données d'une autre.", cell_style),
            Paragraph("Système / Admin", cell_style)
        ],
        [
            Paragraph("<font color='#DC2626'><b>MUST HAVE</b></font><br/>(P0 - Vital)", cell_style),
            Paragraph("<b>Consultation Emploi du Temps</b>", cell_bold),
            Paragraph("Affichage responsive de l'emploi du temps par filière et semestre, consultable sans friction par les étudiants et leurs parents.", cell_style),
            Paragraph("Étudiants / Parents", cell_style)
        ],
        [
            Paragraph("<font color='#D97706'><b>SHOULD HAVE</b></font><br/>(P1 - Important)", cell_style),
            Paragraph("<b>Vitrines Institutionnelles</b>", cell_bold),
            Paragraph("Pages de présentation personnalisées pour chaque université partenaire (filières, corps professoral, accréditations CAMES, tarifs indicatifs).", cell_style),
            Paragraph("Écoles / Public", cell_style)
        ],
        [
            Paragraph("<font color='#D97706'><b>SHOULD HAVE</b></font><br/>(P1 - Important)", cell_style),
            Paragraph("<b>Assistant Tuteur IA (Groq)</b>", cell_bold),
            Paragraph("Agent conversationnel alimenté par Llama 3.3 répondant aux questions de cours et générant des quiz, avec quota gratuit quotidien de 10 requêtes.", cell_style),
            Paragraph("Étudiants", cell_style)
        ],
        [
            Paragraph("<font color='#D97706'><b>SHOULD HAVE</b></font><br/>(P1 - Important)", cell_style),
            Paragraph("<b>Dashboard Comptable Établissement</b>", cell_bold),
            Paragraph("Tableau de bord récapitulant les sommes encaissées, le taux de recouvrement par filière et l'exportation des écritures en format Excel / CSV.", cell_style),
            Paragraph("Comptables Écoles", cell_style)
        ],
        [
            Paragraph("<font color='#2563EB'><b>COULD HAVE</b></font><br/>(P2 - Souhaitable)", cell_style),
            Paragraph("<b>Notifications Push & WhatsApp</b>", cell_bold),
            Paragraph("Envoi automatique d'une alerte WhatsApp ou Push lors de l'annulation d'un cours ou de la validation d'un règlement de scolarité.", cell_style),
            Paragraph("Parents / Étudiants", cell_style)
        ],
        [
            Paragraph("<font color='#2563EB'><b>COULD HAVE</b></font><br/>(P2 - Souhaitable)", cell_style),
            Paragraph("<b>Recharges Jetons IA par Mobile Money</b>", cell_bold),
            Paragraph("Micro-paiement de 500 à 1 000 FCFA pour débloquer des jetons IA supplémentaires au-delà du quota freemium gratuit.", cell_style),
            Paragraph("Étudiants", cell_style)
        ],
        [
            Paragraph("<font color='#64748B'><b>WON'T HAVE</b></font><br/>(P3 - Reporté V2)", cell_style),
            Paragraph("<b>Gestion des Relevés de Notes & Bulletins</b>", cell_bold),
            Paragraph("Saisie des notes d'examens et génération des procès-verbaux de délibération semestrielle (repoussé à la V2 pour ne pas surcharger le MVP).", cell_style),
            Paragraph("Administration", cell_style)
        ]
    ]

    t_moscow = Table(moscow_data, colWidths=[80, 115, 230, 80])
    t_moscow.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_primary),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_bg_light]),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_moscow)
    story.append(Spacer(1, 4))

    story.append(Paragraph("4.4. Définition des Contraintes du Système", h2_style))
    story.append(Paragraph(
        "Le projet s'inscrit dans un cadre opérationnel togolais strict imposant trois types de contraintes majeures :",
        body_style
    ))

    constraints = [
        "<b>1. Contraintes Techniques & Réseau :</b> Conception <i>Mobile-First</i> optimisée pour les réseaux mobiles 3G/4G au Togo. Poids des pages sous 1.5 Mo et temps de réponse des transactions sous 800 ms.",
        "<b>2. Contraintes Réglementaires & Sécurité Financière :</b> Traçabilité totale des flux de scolarité, réconciliation par <code>reference_id</code> unique, journalisation inaltérable et conformité avec l'ARCEP Togo.",
        "<b>3. Contraintes Temporelles & Académiques :</b> Livraison du MVP sous 8 semaines pour permettre la soutenance académique et le déploiement pilote officiel auprès de DEFITECH."
    ]
    for c in constraints:
        story.append(Paragraph(f"• {c}", body_style))
    story.append(Spacer(1, 6))

    # Bloc d'approbation enseignant
    approb_data = [
        [
            Paragraph("<b>CADRE RÉSERVÉ À L'ENSEIGNANT ENCADRANT (DEFITECH) :</b><br/><br/>"
                      "<b>Décision relative au Sujet et au Cahier des Charges :</b><br/>"
                      "[ &nbsp; ] <b>VALIDÉ SANS RÉSERVE</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; "
                      "[ &nbsp; ] <b>VALIDÉ SOUS CONDITIONS</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; "
                      "[ &nbsp; ] <b>NON VALIDÉ (À REVOIR)</b><br/><br/>"
                      "<b>Observations & Recommandations :</b><br/>"
                      "____________________________________________________________________________________________________<br/>"
                      "____________________________________________________________________________________________________<br/><br/>"
                      "<b>Nom de l'Enseignant :</b> __________________________ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; "
                      "<b>Date :</b> ____ / ____ / 2026 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; "
                      "<b>Signature :</b> ____________________", callout_style)
        ]
    ]
    t_approb = Table(approb_data, colWidths=[505])
    t_approb.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 1.5, c_primary),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#EFF6FF")),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_approb)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Master PDF generated successfully: {filename}")

if __name__ == "__main__":
    build_pdf()
