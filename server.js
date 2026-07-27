const { createClient } = require('@libsql/client');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Configuration multer pour les uploads d'images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadDir = path.join(__dirname, 'src', 'uploads');
        if (file.fieldname === 'avatar') {
            uploadDir = path.join(__dirname, 'src', 'uploads', 'avatars');
        }
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'src')));
app.use('/uploads', express.static(path.join(__dirname, 'src', 'uploads')));
app.use(session({
    secret: 'restos_du_coeur_secret_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 3600000 }
}));

// ===== CONNEXION À TURSO =====
console.log('🔌 Connexion à Turso...');
const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});
console.log('✅ Base de données Turso connectée');

// ===== FONCTION CHECK PERMISSIONS =====
async function checkPermission(userId, permission) {
    try {
        const result = await db.execute({
            sql: `SELECT r.permissions, u.role
                  FROM users u
                  JOIN roles r ON r.id = u.role_id
                  WHERE u.id = ?`,
            args: [userId]
        });
        const row = result.rows[0];
        if (!row) return false;
        if (row.role === 'admin') return true;
        const permissions = row.permissions ? row.permissions.split(',') : [];
        return permissions.includes(permission);
    } catch (error) {
        console.error('❌ Erreur checkPermission:', error);
        return false;
    }
}

// ===== INITIALISATION DES TABLES AVEC TURSO =====
async function initDatabase() {
    console.log('📦 Initialisation des tables Turso...');
    
    try {
        // ===== CRÉATION DES TABLES =====
        
        // 1. Table des rôles
        await db.execute(`
            CREATE TABLE IF NOT EXISTS roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nom TEXT UNIQUE NOT NULL,
                description TEXT,
                permissions TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Table roles créée');

        // 2. Table des utilisateurs
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                nom TEXT NOT NULL,
                prenom TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'benevole',
                telephone TEXT,
                age INTEGER,
                avatar TEXT,
                role_id INTEGER,
                actif INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (role_id) REFERENCES roles(id)
            )
        `);
        console.log('✅ Table users créée');

        // 3. Table des messages
        await db.execute(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titre TEXT NOT NULL,
                contenu TEXT NOT NULL,
                type TEXT NOT NULL,
                date_distribution DATE,
                image_url TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Table messages créée');

        // 4. Table whitelist
        await db.execute(`
            CREATE TABLE IF NOT EXISTS whitelist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                role TEXT NOT NULL DEFAULT 'benevole',
                created_by INTEGER
            )
        `);
        console.log('✅ Table whitelist créée');

        // 5. Table des types de repas
        await db.execute(`
            CREATE TABLE IF NOT EXISTS types_repas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nom TEXT UNIQUE NOT NULL,
                points INTEGER DEFAULT 0,
                description TEXT,
                actif INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Table types_repas créée');

        // 6. Table des campagnes
        await db.execute(`
            CREATE TABLE IF NOT EXISTS campagnes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                annee INTEGER NOT NULL,
                saison TEXT NOT NULL,
                actif INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(annee, saison)
            )
        `);
        console.log('✅ Table campagnes créée');

        // 7. Table des familles
        await db.execute(`
            CREATE TABLE IF NOT EXISTS familles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campagne_id INTEGER NOT NULL,
                nom TEXT NOT NULL,
                prenom TEXT NOT NULL,
                numero_carte TEXT NOT NULL,
                nb_adultes INTEGER DEFAULT 1,
                type_dotation TEXT DEFAULT 'normale',
                nb_repas_semaine INTEGER DEFAULT 0,
                points INTEGER DEFAULT 0,
                heure_passage TEXT,
                adresse TEXT,
                code_postal TEXT,
                ville TEXT,
                telephone TEXT,
                email TEXT,
                consentement BOOLEAN DEFAULT 1,
                enfants_0_6 INTEGER DEFAULT 0,
                enfants_6_12 INTEGER DEFAULT 0,
                enfants_12_18 INTEGER DEFAULT 0,
                enfants_18_36 INTEGER DEFAULT 0,
                enfants_36_60 INTEGER DEFAULT 0,
                actif INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_by INTEGER,
                FOREIGN KEY (campagne_id) REFERENCES campagnes(id)
            )
        `);
        console.log('✅ Table familles créée');

        // 8. Table des produits
        await db.execute(`
            CREATE TABLE IF NOT EXISTS produits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reference TEXT,
                nom TEXT NOT NULL,
                groupe TEXT,
                points_total INTEGER DEFAULT 1,
                est_mixte BOOLEAN DEFAULT 0,
                est_divisible BOOLEAN DEFAULT 0,
                nombre_unites INTEGER DEFAULT 1,
                points_protides REAL DEFAULT 0,
                points_accompagnement REAL DEFAULT 0,
                points_laitier REAL DEFAULT 0,
                points_dessert REAL DEFAULT 0,
                min_par_personne BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Table produits créée');

        // 9. Table des emplacements
        await db.execute(`
            CREATE TABLE IF NOT EXISTS emplacements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nom TEXT UNIQUE NOT NULL,
                type TEXT NOT NULL,
                ordre INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Table emplacements créée');

        // 10. Table des livraisons
        await db.execute(`
            CREATE TABLE IF NOT EXISTS livraisons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date_livraison DATE NOT NULL,
                produit_id INTEGER NOT NULL,
                produit_nom TEXT NOT NULL,
                nb_colis INTEGER,
                produits_par_colis INTEGER,
                total_a_distribuer INTEGER,
                date_peremption DATE,
                notes TEXT,
                image_url TEXT,
                emplacement_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_by INTEGER,
                FOREIGN KEY (produit_id) REFERENCES produits(id)
            )
        `);
        console.log('✅ Table livraisons créée');

        // 11. Table des créneaux (planning)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS creneaux (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date_creneau DATE NOT NULL,
                heure_debut TIME NOT NULL,
                heure_fin TIME NOT NULL,
                type_activite TEXT NOT NULL,
                places_total INTEGER DEFAULT 5,
                places_occupees INTEGER DEFAULT 0,
                description TEXT,
                created_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Table creneaux créée');

        // 12. Table des inscriptions bénévoles
        await db.execute(`
            CREATE TABLE IF NOT EXISTS inscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                creneau_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                statut TEXT DEFAULT 'inscrit',
                inscrit_le DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (creneau_id) REFERENCES creneaux(id),
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(creneau_id, user_id)
            )
        `);
        console.log('✅ Table inscriptions créée');

        // 13. Table des conversations (messagerie)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nom TEXT,
                type TEXT DEFAULT 'private',
                created_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Table conversations créée');

        // 14. Table des participants
        await db.execute(`
            CREATE TABLE IF NOT EXISTS conversation_participants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                last_read DATETIME,
                joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(conversation_id, user_id)
            )
        `);
        console.log('✅ Table conversation_participants créée');

        // 15. Table des messages de la messagerie
        await db.execute(`
            CREATE TABLE IF NOT EXISTS messages_conversation (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                message TEXT NOT NULL,
                is_read INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Table messages_conversation créée');

        // 16. Table des distributions
        await db.execute(`
            CREATE TABLE IF NOT EXISTS distributions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campagne_id INTEGER NOT NULL,
                date_distribution DATE NOT NULL,
                periode TEXT,
                livraison_ids TEXT,
                besoins_json TEXT,
                ventilation_json TEXT,
                statut TEXT DEFAULT 'prepare',
                created_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (campagne_id) REFERENCES campagnes(id)
            )
        `);
        console.log('✅ Table distributions créée');

        // 17. Table suivi_retraits
        await db.execute(`
            CREATE TABLE IF NOT EXISTS suivi_retraits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                produit_id INTEGER NOT NULL,
                produit_nom TEXT NOT NULL,
                quantite INTEGER NOT NULL,
                motif TEXT,
                user_id INTEGER,
                groupe_id TEXT,
                date_retrait DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (produit_id) REFERENCES produits(id)
            )
        `);
        console.log('✅ Table suivi_retraits créée');

        // Migration : ajouter la colonne groupe_id si la table existait déjà sans elle
        try {
            await db.execute('ALTER TABLE suivi_retraits ADD COLUMN groupe_id TEXT');
            console.log('✅ Colonne groupe_id ajoutée à suivi_retraits');
        } catch (e) {
            // La colonne existe déjà, rien à faire
        }

        console.log('✅ Toutes les tables sont créées ou existent déjà');

        // ===== INSERTION DES DONNÉES PAR DÉFAUT =====
        console.log('📝 Insertion des données par défaut...');

        // Insérer les rôles par défaut
        await db.execute(`
            INSERT OR IGNORE INTO roles (id, nom, description, permissions) 
            VALUES (1, 'admin', 'Administrateur complet', 'accueil,informations,dashboard,communication,gestion_planning,planning,livraisons,familles,produits,distribution,utilisateurs,messagerie,profil')
        `);
        await db.execute(`
            INSERT OR IGNORE INTO roles (id, nom, description, permissions) 
            VALUES (2, 'benevole', 'Bénévole standard', 'accueil,informations,planning,messagerie,profil')
        `);
        console.log('✅ Rôles par défaut insérés');

        // Insérer les emplacements par défaut
        const defaultEmplacements = [
            'Ambiant 1', 'Ambiant 2', 'CE 1', 'CE 2',
            'Frigo 1', 'Frigo 2', 'Frigo 3', 'Frigo 4', 'Frigo 5', 'Frigo 6', 'Frigo 7'
        ];
        for (const [index, nom] of defaultEmplacements.entries()) {
            const type = nom.startsWith('Frigo') ? 'frigo' : 'ambiant';
            await db.execute(`INSERT OR IGNORE INTO emplacements (nom, type, ordre) VALUES (?, ?, ?)`, [nom, type, index]);
        }
        console.log('✅ Emplacements par défaut insérés');

        // Insérer les campagnes par défaut
        await db.execute(`INSERT OR IGNORE INTO campagnes (annee, saison) VALUES (2025, 'Hiver')`);
        await db.execute(`INSERT OR IGNORE INTO campagnes (annee, saison) VALUES (2025, 'Été')`);
        await db.execute(`INSERT OR IGNORE INTO campagnes (annee, saison) VALUES (2026, 'Hiver')`);
        await db.execute(`INSERT OR IGNORE INTO campagnes (annee, saison) VALUES (2026, 'Été')`);
        console.log('✅ Campagnes par défaut insérées');

        // Insérer les types de repas par défaut
        const defaultTypesRepas = [
            { nom: 'Protide', points: 4, description: 'Viande, poisson, œufs' },
            { nom: 'Protides + accompagnement', points: 6, description: 'Repas complet avec féculents/légumes' },
            { nom: 'Accompagnement 250g', points: 2, description: 'Petite portion de pâtes/riz/légumes' },
            { nom: 'Accompagnement 500g', points: 3, description: 'Grande portion de pâtes/riz/légumes' },
            { nom: 'Dessert', points: 2, description: 'Yaourt, fruit, gâteau' },
            { nom: 'Produit laitier', points: 2, description: 'Lait, fromage' },
            { nom: 'Pain', points: 1, description: 'Portion de pain' },
            { nom: 'Boisson', points: 1, description: 'Eau, jus de fruit' }
        ];
        for (const type of defaultTypesRepas) {
            await db.execute(
                `INSERT OR IGNORE INTO types_repas (nom, points, description) VALUES (?, ?, ?)`,
                [type.nom, type.points, type.description]
            );
        }
        console.log('✅ Types de repas par défaut insérés');

        // Insérer l'admin par défaut
        const hash = await bcrypt.hash('admin123', 10);
        await db.execute(`
            INSERT OR IGNORE INTO users (id, email, password, nom, prenom, role, role_id) 
            VALUES (1, 'admin@restos.fr', ?, 'Admin', 'Système', 'admin', 1)
        `, [hash]);
        console.log('✅ Admin par défaut inséré');

        // Créer la conversation générale
        await db.execute(`INSERT OR IGNORE INTO conversations (id, nom, type, created_by) VALUES (1, 'Général', 'group', 1)`);
        await db.execute(`INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (1, 1)`);
        console.log('✅ Conversation générale créée');

        console.log('✅ Initialisation terminée avec succès !');
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation:', error.message);
        throw error;
    }
}

// ===== APPEL DE LA FONCTION D'INITIALISATION =====
initDatabase()
    .then(() => {
        console.log('✅ Base de données prête');
    })
    .catch((error) => {
        console.error('❌ Échec de l\'initialisation:', error);
        process.exit(1);
    });

// ============ ROUTES API ============

// Vérifier whitelist
app.post('/api/check-whitelist', async (req, res) => {
    const { email } = req.body;
    try {
        const result = await db.execute({
            sql: 'SELECT * FROM whitelist WHERE email = ?',
            args: [email]
        });
        const row = result.rows[0];
        res.json({ exists: !!row, role: row ? row.role : null });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// Inscription
app.post('/api/register', async (req, res) => {
    const { email, password, nom, prenom } = req.body;
    
    try {
        const whitelistResult = await db.execute({
            sql: 'SELECT * FROM whitelist WHERE email = ?',
            args: [email]
        });
        const whitelistRow = whitelistResult.rows[0];
        if (!whitelistRow) {
            return res.status(403).json({ error: 'Email non autorisé' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const insertResult = await db.execute({
            sql: 'INSERT INTO users (email, password, nom, prenom, role, role_id) VALUES (?, ?, ?, ?, ?, ?)',
            args: [email, hashedPassword, nom, prenom, 'benevole', 2]
        });
        
        // Récupérer l'ID du nouvel utilisateur
        const userResult = await db.execute({
            sql: 'SELECT last_insert_rowid() as id'
        });
        const userId = userResult.rows[0].id;
        
        // Ajouter à la conversation générale
        await db.execute({
            sql: 'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (1, ?)',
            args: [userId]
        });
        
        res.json({ success: true, userId: userId });
    } catch (error) {
        console.error('❌ Erreur:', error);
        if (error.message.includes('UNIQUE constraint failed')) {
            res.status(400).json({ error: 'Email déjà utilisé' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// Connexion
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const result = await db.execute({
            sql: 'SELECT * FROM users WHERE email = ?',
            args: [email]
        });
        const user = result.rows[0];
        
        if (!user) {
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }
        
        req.session.user = {
            id: user.id,
            email: user.email,
            nom: user.nom,
            prenom: user.prenom,
            role: user.role
        };
        
        res.json({ success: true, role: user.role });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// Déconnexion
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ============ ROUTES PROFIL UTILISATEUR ============

app.get('/api/user/profile', async (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    try {
        const result = await db.execute({
            sql: 'SELECT id, email, nom, prenom, telephone, age, avatar FROM users WHERE id = ?',
            args: [req.session.user.id]
        });
        res.json(result.rows[0]);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/user/profile', upload.single('avatar'), async (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    const { nom, prenom, telephone, age, old_password, new_password } = req.body;
    const avatar_url = req.file ? `/uploads/avatars/${req.file.filename}` : null;
    
    try {
        let updateQuery = 'UPDATE users SET nom = ?, prenom = ?, telephone = ?, age = ?';
        let params = [nom, prenom, telephone || null, age || null];
        
        if (avatar_url) {
            updateQuery += ', avatar = ?';
            params.push(avatar_url);
        }
        
        if (new_password) {
            const userResult = await db.execute({
                sql: 'SELECT password FROM users WHERE id = ?',
                args: [req.session.user.id]
            });
            const user = userResult.rows[0];
            
            const validPassword = await bcrypt.compare(old_password, user.password);
            if (!validPassword) {
                return res.status(401).json({ error: 'Ancien mot de passe incorrect' });
            }
            
            const hashedPassword = await bcrypt.hash(new_password, 10);
            updateQuery += ', password = ?';
            params.push(hashedPassword);
        }
        
        updateQuery += ' WHERE id = ?';
        params.push(req.session.user.id);
        
        await db.execute({
            sql: updateQuery,
            args: params
        });
        
        res.json({ success: true, newPassword: !!new_password });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// Récupérer les permissions de l'utilisateur connecté
app.get('/api/user/permissions', async (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    const userId = req.session.user.id;
    const userRole = req.session.user.role;
    
    try {
        if (userRole === 'admin') {
            const allPermissions = ['accueil', 'informations', 'dashboard', 'communication', 'gestion_planning', 'planning', 'livraisons', 'familles', 'produits', 'distribution', 'utilisateurs', 'messagerie', 'profil'];
            return res.json({ permissions: allPermissions });
        }
        
        const userResult = await db.execute({
            sql: 'SELECT role_id FROM users WHERE id = ?',
            args: [userId]
        });
        const user = userResult.rows[0];
        const roleId = user ? user.role_id : null;
        
        if (!roleId) {
            return res.json({ permissions: ['accueil', 'informations', 'profil'] });
        }
        
        const roleResult = await db.execute({
            sql: 'SELECT permissions FROM roles WHERE id = ?',
            args: [roleId]
        });
        const role = roleResult.rows[0];
        
        let permissions = [];
        if (role && role.permissions) {
            permissions = role.permissions.split(',').map(p => p.trim());
        }
        
        const basePermissions = ['accueil', 'informations', 'profil', 'messagerie'];
        const allPermissions = [...new Set([...basePermissions, ...permissions])];
        
        res.json({ permissions: allPermissions });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ROUTES MESSAGES ============

app.get('/api/messages', async (req, res) => {
    try {
        const result = await db.execute('SELECT * FROM messages ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// Dates de messages/annonces de type "distribution" (NB: renommé pour ne pas
// entrer en collision avec /api/distributions, la vraie route de gestion des distributions)
app.get('/api/messages/dates-distribution', async (req, res) => {
    try {
        const result = await db.execute('SELECT * FROM messages WHERE type = ? ORDER BY date_distribution ASC', ['distribution']);
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/messages', upload.single('image'), async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { titre, contenu, type, date_distribution } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;
    
    try {
        await db.execute({
            sql: 'INSERT INTO messages (titre, contenu, type, date_distribution, image_url) VALUES (?, ?, ?, ?, ?)',
            args: [titre, contenu, type, date_distribution || null, image_url]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/messages/:id', upload.single('image'), async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { titre, contenu, type, date_distribution } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : req.body.existing_image;
    
    try {
        await db.execute({
            sql: 'UPDATE messages SET titre = ?, contenu = ?, type = ?, date_distribution = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            args: [titre, contenu, type, date_distribution || null, image_url, req.params.id]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/messages/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    try {
        await db.execute({
            sql: 'DELETE FROM messages WHERE id = ?',
            args: [req.params.id]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ROUTES TYPES DE REPAS ============

app.get('/api/types-repas', async (req, res) => {
    try {
        const result = await db.execute('SELECT * FROM types_repas WHERE actif = 1 ORDER BY points DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/types-repas', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    try {
        const result = await db.execute('SELECT * FROM types_repas ORDER BY points DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/types-repas', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { nom, points, description } = req.body;
    try {
        await db.execute({
            sql: 'INSERT INTO types_repas (nom, points, description) VALUES (?, ?, ?)',
            args: [nom, points || 0, description || null]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/types-repas/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { nom, points, description, actif } = req.body;
    try {
        await db.execute({
            sql: 'UPDATE types_repas SET nom = ?, points = ?, description = ?, actif = ? WHERE id = ?',
            args: [nom, points || 0, description || null, actif !== undefined ? actif : 1, req.params.id]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/types-repas/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const id = req.params.id;
    
    try {
        const result = await db.execute({
            sql: 'SELECT COUNT(*) as count FROM livraisons WHERE type_repas_id = ?',
            args: [id]
        });
        const count = result.rows[0].count;
        
        if (count > 0) {
            return res.status(400).json({ error: 'Impossible de supprimer : ce type est utilisé dans des livraisons' });
        }
        
        await db.execute({
            sql: 'DELETE FROM types_repas WHERE id = ?',
            args: [id]
        });
        res.json({ success: true, message: 'Type de repas supprimé définitivement' });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ROUTES CAMPAGNES ============

app.get('/api/campagnes', async (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    try {
        const result = await db.execute('SELECT * FROM campagnes WHERE actif = 1 ORDER BY annee DESC, saison');
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/campagnes', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { annee, saison } = req.body;
    try {
        await db.execute({
            sql: 'INSERT INTO campagnes (annee, saison) VALUES (?, ?)',
            args: [annee, saison]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ROUTES FAMILLES ============

function calculerRepasSemaine(nbAdultes, typeDotation) {
    const repasNormale = {1:6, 2:10, 3:15, 4:20, 5:25, 6:30, 7:35};
    const repasMinoree = {1:3, 2:6, 3:9, 4:12, 5:15, 6:18, 7:21};
    if (typeDotation === 'minoree') {
        return repasMinoree[nbAdultes] || nbAdultes * 3;
    }
    return repasNormale[nbAdultes] || nbAdultes * 7;
}

function calculerPointsAdultes(nbAdultes, typeDotation) {
    var repasSemaine = calculerRepasSemaine(nbAdultes, typeDotation);
    if (nbAdultes === 1 && typeDotation === 'normale') {
        return (repasSemaine * 4) + 2;
    }
    return repasSemaine * 4;
}

function calculerPointsEnfants(enfants) {
    var points = {
        total: 0,
        accompagnement: 0,
        laitier: 0,
        pald: 0
    };
    
    points.accompagnement += (enfants.enfants_6_12 || 0) * 4;
    points.accompagnement += (enfants.enfants_12_18 || 0) * 6;
    points.laitier += (enfants.enfants_12_18 || 0) * 4;
    points.pald += (enfants.enfants_12_18 || 0) * 3;
    points.accompagnement += (enfants.enfants_18_36 || 0) * 6;
    points.pald += (enfants.enfants_18_36 || 0) * 3;
    
    points.total = points.accompagnement + points.laitier + points.pald;
    return points;
}

app.get('/api/familles/:campagneId', async (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const campagneId = req.params.campagneId;
    
    try {
        const result = await db.execute({
            sql: 'SELECT * FROM familles WHERE campagne_id = ? AND actif = 1 ORDER BY nom',
            args: [campagneId]
        });
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/familles', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { campagne_id, nom, prenom, numero_carte, nb_adultes, type_dotation,
            adresse, code_postal, ville, telephone, email, heure_passage,
            enfants_0_6, enfants_6_12, enfants_12_18, enfants_18_36, enfants_36_60,
            consentement } = req.body;
    
    const repasSemaine = calculerRepasSemaine(nb_adultes, type_dotation || 'normale');
    const points = calculerPointsAdultes(nb_adultes, type_dotation || 'normale');
    
    try {
        await db.execute({
            sql: `INSERT INTO familles (
                campagne_id, nom, prenom, numero_carte, nb_adultes, type_dotation, nb_repas_semaine, points,
                heure_passage, adresse, code_postal, ville, telephone, email, consentement,
                enfants_0_6, enfants_6_12, enfants_12_18, enfants_18_36, enfants_36_60,
                created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [campagne_id, nom, prenom, numero_carte, nb_adultes || 1, type_dotation || 'normale', repasSemaine, points,
                heure_passage || null, adresse || null, code_postal || null, ville || null, telephone || null, email || null,
                consentement !== false ? 1 : 0,
                enfants_0_6 || 0, enfants_6_12 || 0, enfants_12_18 || 0, enfants_18_36 || 0, enfants_36_60 || 0,
                req.session.user.id]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/familles/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { campagne_id, nom, prenom, numero_carte, nb_adultes, type_dotation,
            adresse, code_postal, ville, telephone, email, heure_passage,
            enfants_0_6, enfants_6_12, enfants_12_18, enfants_18_36, enfants_36_60,
            consentement } = req.body;
    const familleId = req.params.id;
    
    const repasSemaine = calculerRepasSemaine(nb_adultes, type_dotation || 'normale');
    const points = calculerPointsAdultes(nb_adultes, type_dotation || 'normale');
    
    try {
        await db.execute({
            sql: `UPDATE familles 
                   SET campagne_id = ?, nom = ?, prenom = ?, numero_carte = ?, 
                       nb_adultes = ?, type_dotation = ?, nb_repas_semaine = ?, points = ?,
                       heure_passage = ?, adresse = ?, code_postal = ?, ville = ?, 
                       telephone = ?, email = ?, consentement = ?,
                       enfants_0_6 = ?, enfants_6_12 = ?, enfants_12_18 = ?, enfants_18_36 = ?, enfants_36_60 = ?
                   WHERE id = ?`,
            args: [campagne_id, nom, prenom, numero_carte, nb_adultes || 1, type_dotation || 'normale', repasSemaine, points,
                heure_passage || null, adresse || null, code_postal || null, ville || null, 
                telephone || null, email || null, consentement !== false ? 1 : 0,
                enfants_0_6 || 0, enfants_6_12 || 0, enfants_12_18 || 0, enfants_18_36 || 0, enfants_36_60 || 0,
                familleId]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/familles/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const id = req.params.id;
    
    try {
        await db.execute({
            sql: 'DELETE FROM familles WHERE id = ?',
            args: [id]
        });
        res.json({ success: true, message: 'Famille supprimée définitivement' });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/familles/import', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { campagne_id, data } = req.body;
    
    if (!campagne_id || !data || !Array.isArray(data)) {
        return res.status(400).json({ error: 'Données invalides' });
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const famille of data) {
        const repasSemaine = calculerRepasSemaine(famille.nb_adultes || 1, famille.type_dotation || 'normale');
        const points = calculerPointsAdultes(famille.nb_adultes || 1, famille.type_dotation || 'normale');
        
        let telFinal = null;
        if (famille.consentement === true || famille.consentement === 'true') {
            telFinal = famille.telephone || null;
        }
        
        try {
            await db.execute({
                sql: `INSERT INTO familles (
                    campagne_id, nom, prenom, numero_carte, nb_adultes, type_dotation, nb_repas_semaine, points,
                    heure_passage, adresse, code_postal, ville, telephone, consentement,
                    enfants_0_6, enfants_6_12, enfants_12_18, enfants_18_36, enfants_36_60,
                    created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [campagne_id, famille.nom, famille.prenom, famille.numero_carte, famille.nb_adultes || 1, famille.type_dotation || 'normale', repasSemaine, points,
                    famille.heure_passage || null, famille.adresse || null, famille.code_postal || null, famille.ville || null, telFinal,
                    famille.consentement === true ? 1 : 0,
                    famille.enfants_0_6 || 0, famille.enfants_6_12 || 0, famille.enfants_12_18 || 0, famille.enfants_18_36 || 0, famille.enfants_36_60 || 0,
                    req.session.user.id]
            });
            successCount++;
        } catch (error) {
            errorCount++;
        }
    }
    
    res.json({ success: true, successCount: successCount, errorCount: errorCount, total: data.length });
});

app.get('/api/familles/export/:campagneId', async (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const campagneId = req.params.campagneId;
    const format = req.query.format || 'csv';
    
    try {
        const result = await db.execute({
            sql: 'SELECT * FROM familles WHERE campagne_id = ? AND actif = 1',
            args: [campagneId]
        });
        const familles = result.rows;
        
        if (format === 'json') {
            res.json(familles);
        } else {
            let csv = 'Nom,Prénom,Numéro carte,Adultes,Type dotation,Repas/semaine,Points,Heure,Adresse,Code postal,Ville,Téléphone,Consentement,Enfants 0-6,Enfants 6-12,Enfants 12-18,Enfants 18-36,Enfants 36-60\n';
            for (const f of familles) {
                csv += `"${f.nom || ''}","${f.prenom || ''}","${f.numero_carte || ''}",${f.nb_adultes || 1},"${f.type_dotation || 'normale'}",${f.nb_repas_semaine || 0},${f.points || 0},"${f.heure_passage || ''}","${f.adresse || ''}","${f.code_postal || ''}","${f.ville || ''}","${f.telephone || ''}",${f.consentement ? 'Oui' : 'Non'},${f.enfants_0_6 || 0},${f.enfants_6_12 || 0},${f.enfants_12_18 || 0},${f.enfants_18_36 || 0},${f.enfants_36_60 || 0}\n`;
            }
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=familles_campagne_${campagneId}.csv`);
            res.send(csv);
        }
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ROUTES PRODUITS ============

app.get('/api/produits', async (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    try {
        const result = await db.execute('SELECT * FROM produits ORDER BY nom');
        console.log('📦 Produits envoyés:', result.rows.length);
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/emplacements', async (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    try {
        const result = await db.execute('SELECT * FROM emplacements ORDER BY ordre, nom');
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/produits', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { reference, nom, groupe, points_total, est_mixte, est_divisible, nombre_unites,
            points_protides, points_accompagnement, points_laitier, points_dessert, min_par_personne } = req.body;
    
    try {
        await db.execute({
            sql: `INSERT INTO produits (reference, nom, groupe, points_total, est_mixte, est_divisible, nombre_unites,
                   points_protides, points_accompagnement, points_laitier, points_dessert, min_par_personne)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [reference || null, nom, groupe || null, points_total, est_mixte ? 1 : 0, est_divisible ? 1 : 0, nombre_unites || 1,
                points_protides || 0, points_accompagnement || 0, points_laitier || 0, points_dessert || 0, min_par_personne ? 1 : 0]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/produits/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { reference, nom, groupe, points_total, est_mixte, est_divisible, nombre_unites,
            points_protides, points_accompagnement, points_laitier, points_dessert, min_par_personne } = req.body;
    const produitId = req.params.id;
    
    try {
        await db.execute({
            sql: `UPDATE produits SET 
                   reference = ?, nom = ?, groupe = ?, points_total = ?, 
                   est_mixte = ?, est_divisible = ?, nombre_unites = ?,
                   points_protides = ?, points_accompagnement = ?, points_laitier = ?, points_dessert = ?,
                   min_par_personne = ?
                   WHERE id = ?`,
            args: [reference || null, nom, groupe || null, points_total, 
                est_mixte ? 1 : 0, est_divisible ? 1 : 0, nombre_unites || 1,
                points_protides || 0, points_accompagnement || 0, points_laitier || 0, points_dessert || 0,
                min_par_personne ? 1 : 0, produitId]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/produits/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    try {
        await db.execute({
            sql: 'DELETE FROM produits WHERE id = ?',
            args: [req.params.id]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/produits/export', async (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    try {
        const result = await db.execute('SELECT * FROM produits ORDER BY nom');
        const rows = result.rows;
        
        let csv = 'reference,nom,groupe,points_total,est_mixte,points_protides,points_accompagnement,points_laitier,points_dessert,est_divisible,nombre_unites,min_par_personne\n';
        for (const p of rows) {
            csv += `"${p.reference || ''}","${p.nom}","${p.groupe || ''}",${p.points_total},${p.est_mixte ? 1 : 0},${p.points_protides || 0},${p.points_accompagnement || 0},${p.points_laitier || 0},${p.points_dessert || 0},${p.est_divisible ? 1 : 0},${p.nombre_unites || 1},${p.min_par_personne ? 1 : 0}\n`;
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=produits.csv');
        res.send(csv);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/produits/import', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { data } = req.body;
    
    if (!data || !Array.isArray(data)) {
        return res.status(400).json({ error: 'Données invalides' });
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const produit of data) {
        try {
            await db.execute({
                sql: `INSERT INTO produits (
                    reference, nom, groupe, points_total, est_mixte, est_divisible, nombre_unites,
                    points_protides, points_accompagnement, points_laitier, points_dessert, min_par_personne
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [produit.reference || null, produit.nom, produit.groupe || null, produit.points_total,
                    produit.est_mixte ? 1 : 0, produit.est_divisible ? 1 : 0, produit.nombre_unites || 1,
                    produit.points_protides || 0, produit.points_accompagnement || 0, produit.points_laitier || 0, produit.points_dessert || 0,
                    produit.min_par_personne ? 1 : 0]
            });
            successCount++;
        } catch (error) {
            errorCount++;
        }
    }
    
    res.json({ success: true, successCount: successCount, errorCount: errorCount, total: data.length });
});

// ============ ROUTES LIVRAISONS ============

app.get('/api/livraisons', async (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    try {
        const result = await db.execute('SELECT * FROM livraisons ORDER BY date_livraison DESC, created_at DESC');
        
        const formatted = result.rows.map(row => ({
            ...row,
            produit: row.produit_nom
        }));
        
        const grouped = {};
        formatted.forEach(row => {
            const date = row.date_livraison;
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(row);
        });
        
        res.json(grouped);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/livraisons/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    try {
        const result = await db.execute({
            sql: 'SELECT * FROM livraisons WHERE id = ?',
            args: [req.params.id]
        });
        const row = result.rows[0];
        if (!row) return res.status(404).json({ error: 'Livraison non trouvée' });
        
        res.json({
            ...row,
            produit: row.produit_nom
        });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/livraisons', upload.single('image'), async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { date_livraison, produit_id, nb_colis, produits_par_colis, total_a_distribuer,
            date_peremption, notes, emplacement_id } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    if (!date_livraison || !produit_id) {
        return res.status(400).json({ error: 'La date et le produit sont obligatoires' });
    }
    
    try {
        const produitResult = await db.execute({
            sql: 'SELECT nom FROM produits WHERE id = ?',
            args: [produit_id]
        });
        const produit = produitResult.rows[0];
        if (!produit) return res.status(404).json({ error: 'Produit non trouvé' });
        
        await db.execute({
            sql: `INSERT INTO livraisons (
                date_livraison, produit_id, produit_nom,
                nb_colis, produits_par_colis, total_a_distribuer,
                date_peremption, notes, image_url, emplacement_id, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [date_livraison, produit_id, produit.nom,
                nb_colis || 0, produits_par_colis || 0, total_a_distribuer || 0,
                date_peremption || null, notes || null, image_url, emplacement_id || null, req.session.user.id]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur insertion livraison:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/livraisons/:id', upload.single('image'), async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { date_livraison, produit_id, nb_colis, produits_par_colis, total_a_distribuer,
            date_peremption, notes, emplacement_id } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : req.body.existing_image;
    const livraisonId = req.params.id;

    if (!date_livraison || !produit_id) {
        return res.status(400).json({ error: 'La date et le produit sont obligatoires' });
    }
    
    try {
        const produitResult = await db.execute({
            sql: 'SELECT nom FROM produits WHERE id = ?',
            args: [produit_id]
        });
        const produit = produitResult.rows[0];
        if (!produit) return res.status(404).json({ error: 'Produit non trouvé' });
        
        await db.execute({
            sql: `UPDATE livraisons SET 
                date_livraison = ?, produit_id = ?, produit_nom = ?,
                nb_colis = ?, produits_par_colis = ?, total_a_distribuer = ?,
                date_peremption = ?, notes = ?, image_url = ?, emplacement_id = ?
                WHERE id = ?`,
            args: [date_livraison, produit_id, produit.nom,
                nb_colis || 0, produits_par_colis || 0, total_a_distribuer || 0,
                date_peremption || null, notes || null, image_url, emplacement_id || null, livraisonId]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur mise à jour livraison:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/livraisons/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    try {
        await db.execute({
            sql: 'DELETE FROM livraisons WHERE id = ?',
            args: [req.params.id]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ROUTES UTILISATEURS ============

app.get('/api/admin/users', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    try {
        const result = await db.execute('SELECT id, email, nom, prenom, telephone, age, role_id, actif FROM users ORDER BY nom');
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/users', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { email, password, nom, prenom, telephone, age, role_id, actif } = req.body;
    
    if (!email || !email.trim()) {
        return res.status(400).json({ error: 'Email requis' });
    }
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        await db.execute({
            sql: 'INSERT INTO users (email, password, nom, prenom, telephone, age, role_id, actif) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            args: [email.trim(), hashedPassword, nom, prenom, telephone || null, age || null, role_id || 2, actif ? 1 : 0]
        });
        
        // Ajouter le nouvel utilisateur à la conversation générale
        const userResult = await db.execute({
            sql: 'SELECT last_insert_rowid() as id'
        });
        const userId = userResult.rows[0].id;
        await db.execute({
            sql: 'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (1, ?)',
            args: [userId]
        });
        
        res.json({ success: true, id: userId });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/users/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { email, password, nom, prenom, telephone, age, role_id, actif } = req.body;
    const userId = req.params.id;
    
    try {
        let query = 'UPDATE users SET email = ?, nom = ?, prenom = ?, telephone = ?, age = ?, role_id = ?, actif = ?';
        let params = [email, nom, prenom, telephone || null, age || null, role_id || 2, actif ? 1 : 0];
        
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = ?';
            params.push(hashedPassword);
        }
        
        query += ' WHERE id = ?';
        params.push(userId);
        
        await db.execute({
            sql: query,
            args: params
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/users/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    try {
        await db.execute({
            sql: 'DELETE FROM users WHERE id = ?',
            args: [req.params.id]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ROUTES RÔLES ============

app.get('/api/admin/roles', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    try {
        const result = await db.execute('SELECT * FROM roles ORDER BY id');
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/roles', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { nom, description, permissions } = req.body;
    try {
        await db.execute({
            sql: 'INSERT INTO roles (nom, description, permissions) VALUES (?, ?, ?)',
            args: [nom, description || null, permissions || null]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/roles/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { nom, description, permissions } = req.body;
    try {
        await db.execute({
            sql: 'UPDATE roles SET nom = ?, description = ?, permissions = ? WHERE id = ?',
            args: [nom, description || null, permissions || null, req.params.id]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/roles/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const roleId = req.params.id;
    try {
        await db.execute({
            sql: 'UPDATE users SET role_id = 2 WHERE role_id = ?',
            args: [roleId]
        });
        await db.execute({
            sql: 'DELETE FROM roles WHERE id = ?',
            args: [roleId]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ROUTES WHITELIST ============

app.get('/api/admin/whitelist', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    try {
        const result = await db.execute('SELECT * FROM whitelist ORDER BY id DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/whitelist', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { email, role } = req.body;
    try {
        await db.execute({
            sql: 'INSERT OR REPLACE INTO whitelist (email, role, created_by) VALUES (?, ?, ?)',
            args: [email, role, req.session.user.id]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/whitelist/:email', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    try {
        await db.execute({
            sql: 'DELETE FROM whitelist WHERE email = ?',
            args: [req.params.email]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ROUTES PLANNING ============

app.get('/api/creneaux', async (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    
    try {
        const query = `
            SELECT c.*, 
                   (SELECT COUNT(*) FROM inscriptions WHERE creneau_id = c.id) as places_prises,
                   (SELECT statut FROM inscriptions WHERE creneau_id = c.id AND user_id = ?) as mon_statut
            FROM creneaux c
            WHERE c.date_creneau >= date('now')
            ORDER BY c.date_creneau ASC, c.heure_debut ASC
        `;
        const result = await db.execute({
            sql: query,
            args: [userId]
        });
        const rows = result.rows;
        
        if (isAdmin && rows.length > 0) {
            for (const creneau of rows) {
                const inscritsResult = await db.execute({
                    sql: `
                        SELECT u.id, u.nom, u.prenom, u.email, i.statut, i.inscrit_le
                        FROM inscriptions i
                        JOIN users u ON u.id = i.user_id
                        WHERE i.creneau_id = ?
                    `,
                    args: [creneau.id]
                });
                creneau.inscrits = inscritsResult.rows;
            }
        }
        res.json(rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/creneaux/passes', async (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    const userId = req.session.user.id;
    
    try {
        const result = await db.execute({
            sql: `
                SELECT c.*, i.statut, i.inscrit_le
                FROM creneaux c
                JOIN inscriptions i ON i.creneau_id = c.id
                WHERE c.date_creneau < date('now') AND i.user_id = ?
                ORDER BY c.date_creneau DESC
            `,
            args: [userId]
        });
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/creneaux', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { date_creneau, heure_debut, heure_fin, type_activite, places_total, description } = req.body;
    try {
        await db.execute({
            sql: 'INSERT INTO creneaux (date_creneau, heure_debut, heure_fin, type_activite, places_total, description, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
            args: [date_creneau, heure_debut, heure_fin, type_activite, places_total || 5, description || null, req.session.user.id]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/creneaux/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { date_creneau, heure_debut, heure_fin, type_activite, places_total, description } = req.body;
    try {
        await db.execute({
            sql: 'UPDATE creneaux SET date_creneau = ?, heure_debut = ?, heure_fin = ?, type_activite = ?, places_total = ?, description = ? WHERE id = ?',
            args: [date_creneau, heure_debut, heure_fin, type_activite, places_total || 5, description || null, req.params.id]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/creneaux/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    try {
        await db.execute({
            sql: 'DELETE FROM inscriptions WHERE creneau_id = ?',
            args: [req.params.id]
        });
        await db.execute({
            sql: 'DELETE FROM creneaux WHERE id = ?',
            args: [req.params.id]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/inscriptions', async (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    const { creneau_id } = req.body;
    const user_id = req.session.user.id;
    
    try {
        const creneauResult = await db.execute({
            sql: 'SELECT places_total, (SELECT COUNT(*) FROM inscriptions WHERE creneau_id = ?) as places_prises FROM creneaux WHERE id = ?',
            args: [creneau_id, creneau_id]
        });
        const creneau = creneauResult.rows[0];
        if (!creneau) return res.status(404).json({ error: 'Créneau non trouvé' });
        
        if (creneau.places_prises >= creneau.places_total) {
            return res.status(400).json({ error: 'Plus de places disponibles' });
        }
        
        await db.execute({
            sql: 'INSERT INTO inscriptions (creneau_id, user_id) VALUES (?, ?)',
            args: [creneau_id, user_id]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/inscriptions/:creneau_id', async (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    const { creneau_id } = req.params;
    const user_id = req.session.user.id;
    
    try {
        await db.execute({
            sql: 'DELETE FROM inscriptions WHERE creneau_id = ? AND user_id = ?',
            args: [creneau_id, user_id]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/inscriptions/:id/statut', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { statut } = req.body;
    const { id } = req.params;
    
    try {
        await db.execute({
            sql: 'UPDATE inscriptions SET statut = ? WHERE id = ?',
            args: [statut, id]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ROUTES DISTRIBUTION ============

// GET - Récupérer toutes les distributions
app.get('/api/distributions', async (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    try {
        const result = await db.execute('SELECT * FROM distributions ORDER BY date_distribution DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET - Récupérer une distribution par ID
app.get('/api/distributions/:id', async (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    try {
        const result = await db.execute({
            sql: 'SELECT * FROM distributions WHERE id = ?',
            args: [req.params.id]
        });
        const row = result.rows[0];
        if (!row) return res.status(404).json({ error: 'Distribution non trouvée' });
        
        var resultData = { ...row };
        if (row.besoins_json) {
            try {
                var data = JSON.parse(row.besoins_json);
                resultData.besoins = data;
                resultData.familles_par_personne = data.familles_par_personne;
                resultData.total_familles = data.total_familles;
                resultData.multiplicateur = data.multiplicateur;
            } catch (e) {
                console.error('Erreur parsing besoins_json:', e);
            }
        }
        if (row.ventilation_json) {
            try {
                resultData.ventilation = JSON.parse(row.ventilation_json);
            } catch (e) {
                console.error('Erreur parsing ventilation_json:', e);
            }
        }
        
        res.json(resultData);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET - Récupérer les besoins d'une distribution
app.get('/api/distributions/:id/besoins', async (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    const distributionId = req.params.id;
    
    try {
        const distResult = await db.execute({
            sql: 'SELECT * FROM distributions WHERE id = ?',
            args: [distributionId]
        });
        const distribution = distResult.rows[0];
        if (!distribution) return res.status(404).json({ error: 'Distribution non trouvée' });
        
        const campagneId = distribution.campagne_id;
        const periode = distribution.periode || 'bimensuel';
        const multiplicateur = periode === 'bimensuel' ? 2 : 1;
        
        const famillesResult = await db.execute({
            sql: 'SELECT * FROM familles WHERE campagne_id = ? AND actif = 1',
            args: [campagneId]
        });
        const familles = famillesResult.rows;
        
        let besoins = {
            protides: 0,
            accompagnement: 0,
            laitier: 0,
            dessert: 0
        };
        
        let famillesParPersonne = {};
        let totalFamilles = familles.length;
        
        for (const f of familles) {
            const nbPersonnes = f.nb_adultes || 1;
            const pointsParPersonne = nbPersonnes === 1 ? 6 : 5;
            const pointsTotalParCategorie = pointsParPersonne * multiplicateur;
            
            besoins.protides += pointsTotalParCategorie;
            besoins.accompagnement += pointsTotalParCategorie;
            besoins.laitier += pointsTotalParCategorie;
            besoins.dessert += pointsTotalParCategorie;
            
            if (!famillesParPersonne[nbPersonnes]) {
                famillesParPersonne[nbPersonnes] = 0;
            }
            famillesParPersonne[nbPersonnes]++;
        }
        
        res.json({
            besoins: besoins,
            famillesParPersonne: famillesParPersonne,
            totalFamilles: totalFamilles,
            periode: periode,
            multiplicateur: multiplicateur,
            campagne_id: campagneId
        });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST - Créer une distribution
app.post('/api/distributions', async (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    const hasPermission = await checkPermission(req.session.user.id, 'distribution');
    if (!hasPermission && req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { campagne_id, date_distribution, periode, livraison_ids } = req.body;
    try {
        const result = await db.execute({
            sql: 'INSERT INTO distributions (campagne_id, date_distribution, periode, livraison_ids, created_by) VALUES (?, ?, ?, ?, ?)',
            args: [campagne_id, date_distribution, periode || 'hebdomadaire', JSON.stringify(livraison_ids || []), req.session.user.id]
        });
        
        const idResult = await db.execute('SELECT last_insert_rowid() as id');
        const id = idResult.rows[0].id;
        
        res.json({ success: true, id: id });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST - Sauvegarder les données d'une distribution
app.post('/api/distributions/:id/save-data', async (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    const hasPermission = await checkPermission(req.session.user.id, 'distribution');
    if (!hasPermission && req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { besoins, famillesParPersonne, totalFamilles, multiplicateur, ventilation } = req.body;
    const distributionId = req.params.id;
    
    const data = {
        besoins: besoins,
        familles_par_personne: famillesParPersonne,
        total_familles: totalFamilles,
        multiplicateur: multiplicateur
    };
    
    try {
        if (ventilation) {
            await db.execute({
                sql: 'UPDATE distributions SET besoins_json = ?, ventilation_json = ? WHERE id = ?',
                args: [JSON.stringify(data), JSON.stringify(ventilation), distributionId]
            });
        } else {
            await db.execute({
                sql: 'UPDATE distributions SET besoins_json = ? WHERE id = ?',
                args: [JSON.stringify(data), distributionId]
            });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE - Supprimer une distribution
app.delete('/api/distributions/:id', async (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    const hasPermission = await checkPermission(req.session.user.id, 'distribution');
    if (!hasPermission && req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    try {
        await db.execute({
            sql: 'DELETE FROM distributions WHERE id = ?',
            args: [req.params.id]
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ROUTES SUIVI DISTRIBUTION ============

// POST - Effectuer un retrait
// POST - Retrait GROUPÉ (tous les produits d'une même "famille servie" en un seul appel,
// beaucoup plus rapide qu'un appel par produit, et permet ensuite d'annuler tout le groupe d'un coup)
app.post('/api/suivi/retrait-groupe', async (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'Non autorisé' });
    }

    const { motif, produits } = req.body;

    if (!Array.isArray(produits) || produits.length === 0) {
        return res.status(400).json({ error: 'Aucun produit à retirer' });
    }

    for (const p of produits) {
        if (!p.produit_id || !p.quantite || p.quantite <= 0) {
            return res.status(400).json({ error: 'Données invalides' });
        }
    }

    try {
        // Récupérer noms + stock disponible pour tous les produits demandés en une fois
        const ids = produits.map(p => p.produit_id);
        const placeholders = ids.map(() => '?').join(',');

        const produitsResult = await db.execute({
            sql: `SELECT id, nom FROM produits WHERE id IN (${placeholders})`,
            args: ids
        });
        const produitsInfo = {};
        produitsResult.rows.forEach(row => { produitsInfo[row.id] = row.nom; });

        const stockResult = await db.execute({
            sql: `
                SELECT p.id,
                    COALESCE(l.total_livraisons, 0) - COALESCE(r.total_retraits, 0) as stock_disponible
                FROM produits p
                LEFT JOIN (SELECT produit_id, SUM(total_a_distribuer) as total_livraisons FROM livraisons GROUP BY produit_id) l ON l.produit_id = p.id
                LEFT JOIN (SELECT produit_id, SUM(quantite) as total_retraits FROM suivi_retraits GROUP BY produit_id) r ON r.produit_id = p.id
                WHERE p.id IN (${placeholders})
            `,
            args: ids
        });
        const stockParProduit = {};
        stockResult.rows.forEach(row => { stockParProduit[row.id] = row.stock_disponible || 0; });

        // Vérifier le stock disponible pour chaque produit avant d'insérer quoi que ce soit
        for (const p of produits) {
            const nom = produitsInfo[p.produit_id];
            if (!nom) {
                return res.status(404).json({ error: 'Produit non trouvé (id ' + p.produit_id + ')' });
            }
            const dispo = stockParProduit[p.produit_id] || 0;
            if (p.quantite > dispo) {
                return res.status(400).json({ error: 'Stock insuffisant pour ' + nom, produit: nom, stock_disponible: dispo });
            }
        }

        const groupeId = crypto.randomUUID();

        for (const p of produits) {
            await db.execute({
                sql: `INSERT INTO suivi_retraits (produit_id, produit_nom, quantite, motif, user_id, groupe_id)
                      VALUES (?, ?, ?, ?, ?, ?)`,
                args: [p.produit_id, produitsInfo[p.produit_id], p.quantite, motif || null, req.session.user.id, groupeId]
            });
        }

        res.json({ success: true, groupe_id: groupeId });

    } catch (error) {
        console.error('❌ Erreur retrait groupé:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE - Annuler un retrait groupé (remet le stock en supprimant les lignes du groupe)
app.delete('/api/suivi/retrait-groupe/:groupeId', async (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'Non autorisé' });
    }

    try {
        const result = await db.execute({
            sql: 'DELETE FROM suivi_retraits WHERE groupe_id = ?',
            args: [req.params.groupeId]
        });
        res.json({ success: true, lignes_supprimees: result.rowsAffected });
    } catch (error) {
        console.error('❌ Erreur annulation retrait:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST - Annuler des retraits par leurs identifiants précis (remet le stock).
// Fonctionne pour tous les retraits, y compris les anciens sans groupe_id.
app.post('/api/suivi/retraits/annuler', async (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'Non autorisé' });
    }

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Aucun identifiant fourni' });
    }
    const idsValides = ids.map(id => parseInt(id)).filter(id => Number.isInteger(id));
    if (idsValides.length === 0) {
        return res.status(400).json({ error: 'Identifiants invalides' });
    }

    try {
        const placeholders = idsValides.map(() => '?').join(',');
        const result = await db.execute({
            sql: `DELETE FROM suivi_retraits WHERE id IN (${placeholders})`,
            args: idsValides
        });
        res.json({ success: true, lignes_supprimees: result.rowsAffected });
    } catch (error) {
        console.error('❌ Erreur annulation retraits:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/suivi/retrait', async (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'Non autorisé' });
    }

    const { produit_id, quantite, motif } = req.body;
    
    if (!produit_id || !quantite || quantite <= 0) {
        return res.status(400).json({ error: 'Données invalides' });
    }

    try {
        const produitResult = await db.execute({
            sql: 'SELECT nom, points_total FROM produits WHERE id = ?',
            args: [produit_id]
        });
        const produit = produitResult.rows[0];
        if (!produit) {
            return res.status(404).json({ error: 'Produit non trouvé' });
        }

        // Vérifier le stock disponible
        const stockResult = await db.execute({
            sql: `
                SELECT COALESCE(SUM(total_a_distribuer), 0) as total_livraisons
                FROM livraisons
                WHERE produit_id = ?
            `,
            args: [produit_id]
        });
        const totalLivraisons = stockResult.rows[0].total_livraisons || 0;

        const retraitsResult = await db.execute({
            sql: `
                SELECT COALESCE(SUM(quantite), 0) as total_retraits
                FROM suivi_retraits
                WHERE produit_id = ?
            `,
            args: [produit_id]
        });
        const totalRetraits = retraitsResult.rows[0].total_retraits || 0;

        const stockDisponible = totalLivraisons - totalRetraits;

        if (quantite > stockDisponible) {
            return res.status(400).json({ 
                error: 'Stock insuffisant', 
                stock_disponible: stockDisponible 
            });
        }

        await db.execute({
            sql: `INSERT INTO suivi_retraits (produit_id, produit_nom, quantite, motif, user_id) 
                  VALUES (?, ?, ?, ?, ?)`,
            args: [produit_id, produit.nom, quantite, motif || null, req.session.user.id]
        });

        res.json({ success: true, stock_restant: stockDisponible - quantite });

    } catch (error) {
        console.error('❌ Erreur retrait:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET - Stock disponible réel par produit (livraisons cumulées - tous les retraits déjà effectués)
app.get('/api/suivi/stock', async (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'Non autorisé' });
    }

    try {
        const result = await db.execute(`
            SELECT
                p.id,
                p.nom,
                p.groupe,
                p.points_total,
                COALESCE(l.total_livraisons, 0) as total_livraisons,
                COALESCE(r.total_retraits, 0) as total_retraits,
                COALESCE(l.total_livraisons, 0) - COALESCE(r.total_retraits, 0) as stock_disponible
            FROM produits p
            LEFT JOIN (
                SELECT produit_id, SUM(total_a_distribuer) as total_livraisons
                FROM livraisons
                GROUP BY produit_id
            ) l ON l.produit_id = p.id
            LEFT JOIN (
                SELECT produit_id, SUM(quantite) as total_retraits
                FROM suivi_retraits
                GROUP BY produit_id
            ) r ON r.produit_id = p.id
            ORDER BY p.nom
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET - Récupérer les retraits du jour
app.get('/api/suivi/retraits/jour', async (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'Non autorisé' });
    }

    try {
        const result = await db.execute({
            sql: `
                SELECT sr.*, u.nom as user_nom, u.prenom as user_prenom
                FROM suivi_retraits sr
                LEFT JOIN users u ON u.id = sr.user_id
                WHERE DATE(sr.date_retrait) = DATE('now')
                ORDER BY sr.date_retrait DESC
            `
        });
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET - Récupérer l'historique des retraits d'un produit
app.get('/api/suivi/retraits/:produitId', async (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'Non autorisé' });
    }

    try {
        const result = await db.execute({
            sql: `
                SELECT sr.*, u.nom as user_nom, u.prenom as user_prenom
                FROM suivi_retraits sr
                LEFT JOIN users u ON u.id = sr.user_id
                WHERE sr.produit_id = ?
                ORDER BY sr.date_retrait DESC
                LIMIT 100
            `,
            args: [req.params.produitId]
        });
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ROUTES VÉRIFICATION SESSION ============

app.get('/api/check-auth', (req, res) => {
    res.json({ 
        isAuthenticated: !!req.session.user,
        user: req.session.user || null
    });
});

// ============ ROUTES PAGES HTML ============

// Pages publiques
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'pages', 'accueil.html'));
});

app.get('/informations', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'pages', 'informations.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
});

app.get('/profil.html', (req, res) => {
    if (!req.session.user) {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'profil.html'));
});

app.get('/messagerie.html', (req, res) => {
    if (!req.session.user) {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'messagerie.html'));
});

// Pages Admin avec vérification des permissions
app.get('/admin/dashboard.html', async (req, res) => {
    if (!req.session.user) return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    
    const hasPermission = await checkPermission(req.session.user.id, 'dashboard');
    if (!hasPermission && req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'benevole', 'dashboard.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'admin', 'dashboard.html'));
});

app.get('/admin/gestion-communication.html', async (req, res) => {
    if (!req.session.user) return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    
    const hasPermission = await checkPermission(req.session.user.id, 'communication');
    if (!hasPermission && req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'admin', 'gestion-communication.html'));
});

app.get('/admin/gestion-planning.html', async (req, res) => {
    if (!req.session.user) return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    
    const hasPermission = await checkPermission(req.session.user.id, 'gestion_planning');
    if (!hasPermission && req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'admin', 'gestion-planning.html'));
});

app.get('/admin/gestion-livraisons.html', async (req, res) => {
    if (!req.session.user) return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    
    const hasPermission = await checkPermission(req.session.user.id, 'livraisons');
    if (!hasPermission && req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'admin', 'gestion-livraisons.html'));
});

app.get('/admin/gestion-familles.html', async (req, res) => {
    if (!req.session.user) return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    
    const hasPermission = await checkPermission(req.session.user.id, 'familles');
    if (!hasPermission && req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'admin', 'gestion-familles.html'));
});

app.get('/admin/gestion-produits.html', async (req, res) => {
    if (!req.session.user) return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    
    const hasPermission = await checkPermission(req.session.user.id, 'produits');
    if (!hasPermission && req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'admin', 'gestion-produits.html'));
});

app.get('/admin/gestion-distribution.html', async (req, res) => {
    if (!req.session.user) return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    
    const hasPermission = await checkPermission(req.session.user.id, 'distribution');
    if (!hasPermission && req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'admin', 'gestion-distribution.html'));
});

app.get('/admin/gestion-suivi-distribution.html', async (req, res) => {
    if (!req.session.user) return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    
    const hasPermission = await checkPermission(req.session.user.id, 'distribution');
    if (!hasPermission && req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'admin', 'gestion-suivi-distribution.html'));
});

app.get('/admin/gestion-utilisateurs.html', async (req, res) => {
    if (!req.session.user) return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    
    const hasPermission = await checkPermission(req.session.user.id, 'utilisateurs');
    if (!hasPermission && req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'admin', 'gestion-utilisateurs.html'));
});

// Pages Bénévole
app.get('/benevole/dashboard.html', (req, res) => {
    if (!req.session.user) {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'benevole', 'dashboard.html'));
});

app.get('/benevole/planning.html', (req, res) => {
    if (!req.session.user) {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'benevole', 'planning.html'));
});

// Ancienne route pour compatibilité
app.get('/admin/gestion-messages.html', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.redirect('/admin/gestion-communication.html');
});

// ===== GESTIONNAIRE D'ERREURS GLOBAL =====
app.use((err, req, res, next) => {
    console.error('❌ Erreur globale:', err.stack);
    res.status(500).json({ 
        error: 'Erreur interne du serveur',
        message: err.message 
    });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Route non trouvée' });
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`\n✅ Serveur démarré sur http://localhost:${PORT}`);
    console.log('🔑 Compte admin: admin@restos.fr / admin123');
    console.log('📦 Campagnes préchargées : 2025 Hiver/Été, 2026 Hiver/Été\n');
});