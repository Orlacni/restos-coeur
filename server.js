const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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
    secret: process.env.SESSION_SECRET || 'restos_du_coeur_secret_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 3600000 }
}));


// Initialisation base de données
const db = new sqlite3.Database(path.join(__dirname, 'restos.db'));

// Création des tables
db.serialize(() => {
    // Table des rôles personnalisés
    db.run(`
        CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT UNIQUE NOT NULL,
            description TEXT,
            permissions TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Insertion des rôles par défaut
    db.run(`INSERT OR IGNORE INTO roles (id, nom, description, permissions) VALUES (1, 'admin', 'Administrateur complet', 'dashboard,messages,planning,livraisons,familles,produits,utilisateurs,profil')`);
    db.run(`INSERT OR IGNORE INTO roles (id, nom, description, permissions) VALUES (2, 'benevole', 'Bénévole standard', 'planning,profil')`);

    // Table utilisateurs
    db.run(`
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

    // Table messages
    db.run(`
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

    // Table whitelist
    db.run(`
        CREATE TABLE IF NOT EXISTS whitelist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            role TEXT NOT NULL DEFAULT 'benevole',
            created_by INTEGER
        )
    `);

    // Table des types de repas
    db.run(`
        CREATE TABLE IF NOT EXISTS types_repas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT UNIQUE NOT NULL,
            points INTEGER DEFAULT 0,
            description TEXT,
            actif INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Table des campagnes
    db.run(`
        CREATE TABLE IF NOT EXISTS campagnes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            annee INTEGER NOT NULL,
            saison TEXT NOT NULL,
            actif INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(annee, saison)
        )
    `);

    // Table des familles
    db.run(`
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

    // Table des produits
    db.run(`
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
            emplacement_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (emplacement_id) REFERENCES emplacements(id)
        )
    `);

    // Table des emplacements
    db.run(`
        CREATE TABLE IF NOT EXISTS emplacements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL,
            ordre INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Table des livraisons
    db.run(`
        CREATE TABLE IF NOT EXISTS livraisons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date_livraison DATE NOT NULL,
            fournisseur TEXT,
            numero_lot TEXT,
            produit_id INTEGER,
            produit_nom TEXT,
            produit_reference TEXT,
            produit_groupe TEXT,
            produit_points INTEGER DEFAULT 0,
            quantite INTEGER NOT NULL,
            date_peremption DATE,
            provenance TEXT,
            notes TEXT,
            image_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            FOREIGN KEY (produit_id) REFERENCES produits(id)
        )
    `);

    // Table des créneaux (planning)
    db.run(`
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

    // Table des inscriptions bénévoles
    db.run(`
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

    // Table des conversations (messagerie)
    db.run(`
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT,
            type TEXT DEFAULT 'private',
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Table des participants
    db.run(`
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

    // Table des messages de la messagerie
    db.run(`
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

    // Table des distributions
    db.run(`
        CREATE TABLE IF NOT EXISTS distributions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campagne_id INTEGER NOT NULL,
            date_distribution DATE NOT NULL,
            besoins TEXT,
            statut TEXT DEFAULT 'prepare',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            FOREIGN KEY (campagne_id) REFERENCES campagnes(id)
        )
    `);

    // Insertion des campagnes par défaut
    db.run(`INSERT OR IGNORE INTO campagnes (annee, saison) VALUES (2025, 'Hiver')`);
    db.run(`INSERT OR IGNORE INTO campagnes (annee, saison) VALUES (2025, 'Été')`);
    db.run(`INSERT OR IGNORE INTO campagnes (annee, saison) VALUES (2026, 'Hiver')`);
    db.run(`INSERT OR IGNORE INTO campagnes (annee, saison) VALUES (2026, 'Été')`);

    // Insertion des emplacements par défaut
    const defaultEmplacements = [
        'Ambiant 1', 'Ambiant 2', 'CE 1', 'CE 2',
        'Frigo 1', 'Frigo 2', 'Frigo 3', 'Frigo 4', 'Frigo 5', 'Frigo 6', 'Frigo 7',
        'Hygiène'
    ];
    defaultEmplacements.forEach((nom, index) => {
        const type = nom.startsWith('Frigo') ? 'frigo' : (nom === 'Hygiène' ? 'hygiene' : 'ambiant');
        db.run(`INSERT OR IGNORE INTO emplacements (nom, type, ordre) VALUES (?, ?, ?)`, [nom, type, index]);
    });

    // Insertion des types de repas par défaut
    db.get('SELECT COUNT(*) as count FROM types_repas', [], (err, row) => {
        if (!err && row && row.count === 0) {
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
            defaultTypesRepas.forEach(type => {
                db.run(`INSERT INTO types_repas (nom, points, description) VALUES (?, ?, ?)`, 
                    [type.nom, type.points, type.description]);
            });
        }
    });

    // Créer la conversation générale par défaut
    db.run(`INSERT OR IGNORE INTO conversations (id, nom, type, created_by) VALUES (1, 'Général', 'group', 1)`);
    db.run(`INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) SELECT 1, id FROM users WHERE id = 1`);
});

// Insertion admin par défaut
bcrypt.hash('admin123', 10, (err, hash) => {
    if (!err) {
        db.run(`INSERT OR IGNORE INTO users (id, email, password, nom, prenom, role, role_id) 
                VALUES (1, 'admin@restos.fr', ?, 'Admin', 'Système', 'admin', 1)`, [hash]);
    }
});

// ============ ROUTES API ============

// Vérifier whitelist
app.post('/api/check-whitelist', (req, res) => {
    const { email } = req.body;
    db.get('SELECT * FROM whitelist WHERE email = ?', [email], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ exists: !!row, role: row ? row.role : null });
    });
});

// Inscription
app.post('/api/register', async (req, res) => {
    const { email, password, nom, prenom } = req.body;
    
    db.get('SELECT * FROM whitelist WHERE email = ?', [email], async (err, whitelistRow) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!whitelistRow) return res.status(403).json({ error: 'Email non autorisé' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run('INSERT INTO users (email, password, nom, prenom, role, role_id) VALUES (?, ?, ?, ?, ?, ?)',
            [email, hashedPassword, nom, prenom, 'benevole', 2],
            function(err) {
                if (err) return res.status(400).json({ error: 'Email déjà utilisé' });
                res.json({ success: true, userId: this.lastID });
            }
        );
    });
});

// Créer une conversation de groupe
app.post('/api/conversations/group', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    const { participants, nom } = req.body;
    const userId = req.session.user.id;
    
    if (!participants || !Array.isArray(participants) || participants.length < 2) {
        return res.status(400).json({ error: 'Au moins 2 participants requis' });
    }
    
    // S'assurer que l'utilisateur courant est dans la liste
    if (!participants.includes(userId)) {
        participants.push(userId);
    }
    
    // Générer un nom par défaut si non fourni
    let conversationNom = nom;
    if (!conversationNom) {
        conversationNom = 'Groupe de discussion';
    }
    
    db.run(`INSERT INTO conversations (nom, type, created_by) VALUES (?, 'group', ?)`, 
        [conversationNom, userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        const conversationId = this.lastID;
        
        // Ajouter tous les participants
        const stmt = db.prepare(`INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)`);
        for (const p of participants) {
            stmt.run([conversationId, p]);
        }
        stmt.finalize();
        
        res.json({ success: true, conversation_id: conversationId });
    });
});

// Connexion
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        
        req.session.user = {
            id: user.id,
            email: user.email,
            nom: user.nom,
            prenom: user.prenom,
            role: user.role
        };
        
        res.json({ success: true, role: user.role });
    });
});

// Déconnexion
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ============ ROUTES PROFIL UTILISATEUR ============

app.get('/api/user/profile', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    db.get('SELECT id, email, nom, prenom, telephone, age, avatar FROM users WHERE id = ?', [req.session.user.id], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(user);
    });
});

app.put('/api/user/profile', upload.single('avatar'), async (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    const { nom, prenom, telephone, age, old_password, new_password } = req.body;
    const avatar_url = req.file ? `/uploads/avatars/${req.file.filename}` : null;
    
    let updateQuery = 'UPDATE users SET nom = ?, prenom = ?, telephone = ?, age = ?';
    let params = [nom, prenom, telephone || null, age || null];
    
    if (avatar_url) {
        updateQuery += ', avatar = ?';
        params.push(avatar_url);
    }
    
    if (new_password) {
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT password FROM users WHERE id = ?', [req.session.user.id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
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
    
    db.run(updateQuery, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, newPassword: !!new_password });
    });
});

// ============ ROUTES MESSAGES ============

app.get('/api/messages', (req, res) => {
    db.all('SELECT * FROM messages ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/distributions', (req, res) => {
    db.all('SELECT * FROM messages WHERE type = ? ORDER BY date_distribution ASC', ['distribution'], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/messages', upload.single('image'), (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { titre, contenu, type, date_distribution } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;
    
    db.run(`INSERT INTO messages (titre, contenu, type, date_distribution, image_url) 
            VALUES (?, ?, ?, ?, ?)`,
        [titre, contenu, type, date_distribution || null, image_url],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.put('/api/admin/messages/:id', upload.single('image'), (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { titre, contenu, type, date_distribution } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : req.body.existing_image;
    
    db.run(`UPDATE messages 
            SET titre = ?, contenu = ?, type = ?, date_distribution = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
        [titre, contenu, type, date_distribution || null, image_url, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.delete('/api/admin/messages/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    db.run('DELETE FROM messages WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ============ ROUTES TYPES DE REPAS ============

app.get('/api/types-repas', (req, res) => {
    db.all('SELECT * FROM types_repas WHERE actif = 1 ORDER BY points DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/admin/types-repas', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    db.all('SELECT * FROM types_repas ORDER BY points DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/types-repas', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { nom, points, description } = req.body;
    db.run(`INSERT INTO types_repas (nom, points, description) VALUES (?, ?, ?)`,
        [nom, points || 0, description || null],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.put('/api/admin/types-repas/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { nom, points, description, actif } = req.body;
    db.run(`UPDATE types_repas SET nom = ?, points = ?, description = ?, actif = ? WHERE id = ?`,
        [nom, points || 0, description || null, actif !== undefined ? actif : 1, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.delete('/api/admin/types-repas/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const id = req.params.id;
    
    db.get('SELECT COUNT(*) as count FROM livraisons WHERE type_repas_id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (result.count > 0) {
            return res.status(400).json({ error: 'Impossible de supprimer : ce type est utilisé dans des livraisons' });
        }
        
        db.run('DELETE FROM types_repas WHERE id = ?', [id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Type de repas supprimé définitivement' });
        });
    });
});

// ============ ROUTES CAMPAGNES ============

app.get('/api/campagnes', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    db.all('SELECT * FROM campagnes WHERE actif = 1 ORDER BY annee DESC, saison', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/campagnes', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { annee, saison } = req.body;
    db.run(`INSERT INTO campagnes (annee, saison) VALUES (?, ?)`, [annee, saison], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

// ============ ROUTES FAMILLES ============

function calculerRepasSemaine(nbAdultes, typeDotation) {
    const repasNormale = {1:7, 2:10, 3:15, 4:20, 5:25, 6:30, 7:35};
    const repasMinoree = {1:4, 2:6, 3:9, 4:12, 5:15, 6:18, 7:21};
    if (typeDotation === 'minoree') {
        return repasMinoree[nbAdultes] || nbAdultes * 3;
    }
    return repasNormale[nbAdultes] || nbAdultes * 7;
}

app.get('/api/familles/:campagneId', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const campagneId = req.params.campagneId;
    
    db.all('SELECT * FROM familles WHERE campagne_id = ? AND actif = 1 ORDER BY nom', [campagneId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/familles', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { campagne_id, nom, prenom, numero_carte, nb_adultes, type_dotation,
            adresse, code_postal, ville, telephone, email, heure_passage,
            enfants_0_6, enfants_6_12, enfants_12_18, enfants_18_36, enfants_36_60,
            consentement } = req.body;
    
    const repasSemaine = calculerRepasSemaine(nb_adultes, type_dotation || 'normale');
    const points = repasSemaine * 4;
    
    db.run(`INSERT INTO familles (
        campagne_id, nom, prenom, numero_carte, nb_adultes, type_dotation, nb_repas_semaine, points,
        heure_passage, adresse, code_postal, ville, telephone, email, consentement,
        enfants_0_6, enfants_6_12, enfants_12_18, enfants_18_36, enfants_36_60,
        created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [campagne_id, nom, prenom, numero_carte, nb_adultes || 1, type_dotation || 'normale', repasSemaine, points,
         heure_passage || null, adresse || null, code_postal || null, ville || null, telephone || null, email || null,
         consentement !== false ? 1 : 0,
         enfants_0_6 || 0, enfants_6_12 || 0, enfants_12_18 || 0, enfants_18_36 || 0, enfants_36_60 || 0,
         req.session.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.put('/api/admin/familles/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { campagne_id, nom, prenom, numero_carte, nb_adultes, type_dotation,
            adresse, code_postal, ville, telephone, email, heure_passage,
            enfants_0_6, enfants_6_12, enfants_12_18, enfants_18_36, enfants_36_60,
            consentement } = req.body;
    const familleId = req.params.id;
    
    const repasSemaine = calculerRepasSemaine(nb_adultes, type_dotation || 'normale');
    const points = repasSemaine * 4;
    
    db.run(`UPDATE familles 
            SET campagne_id = ?, nom = ?, prenom = ?, numero_carte = ?, 
                nb_adultes = ?, type_dotation = ?, nb_repas_semaine = ?, points = ?,
                heure_passage = ?, adresse = ?, code_postal = ?, ville = ?, 
                telephone = ?, email = ?, consentement = ?,
                enfants_0_6 = ?, enfants_6_12 = ?, enfants_12_18 = ?, enfants_18_36 = ?, enfants_36_60 = ?
            WHERE id = ?`,
        [campagne_id, nom, prenom, numero_carte, nb_adultes || 1, type_dotation || 'normale', repasSemaine, points,
         heure_passage || null, adresse || null, code_postal || null, ville || null, 
         telephone || null, email || null, consentement !== false ? 1 : 0,
         enfants_0_6 || 0, enfants_6_12 || 0, enfants_12_18 || 0, enfants_18_36 || 0, enfants_36_60 || 0,
         familleId],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.delete('/api/admin/familles/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const id = req.params.id;
    
    db.run('DELETE FROM familles WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Famille supprimée définitivement' });
    });
});

app.post('/api/admin/familles/import', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { campagne_id, data } = req.body;
    
    if (!campagne_id || !data || !Array.isArray(data)) {
        return res.status(400).json({ error: 'Données invalides' });
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    const insertFamille = (famille, callback) => {
        const repasSemaine = calculerRepasSemaine(famille.nb_adultes || 1, famille.type_dotation || 'normale');
        const points = repasSemaine * 4;
        
        let telFinal = null;
        if (famille.consentement === true || famille.consentement === 'true') {
            telFinal = famille.telephone || null;
        }
        
        db.get('SELECT id FROM familles WHERE numero_carte = ? AND campagne_id = ?', [famille.numero_carte, campagne_id], (err, existing) => {
            if (err) {
                errorCount++;
                callback();
                return;
            }
            
            if (existing) {
                errorCount++;
                callback();
                return;
            }
            
            db.run(`INSERT INTO familles (
                campagne_id, nom, prenom, numero_carte, nb_adultes, type_dotation, nb_repas_semaine, points,
                heure_passage, adresse, code_postal, ville, telephone, consentement,
                enfants_0_6, enfants_6_12, enfants_12_18, enfants_18_36, enfants_36_60,
                created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [campagne_id, famille.nom, famille.prenom, famille.numero_carte, famille.nb_adultes || 1, famille.type_dotation || 'normale', repasSemaine, points,
                 famille.heure_passage || null, famille.adresse || null, famille.code_postal || null, famille.ville || null, telFinal,
                 famille.consentement === true ? 1 : 0,
                 famille.enfants_0_6 || 0, famille.enfants_6_12 || 0, famille.enfants_12_18 || 0, famille.enfants_18_36 || 0, famille.enfants_36_60 || 0,
                 req.session.user.id],
                function(err) {
                    if (err) {
                        errorCount++;
                        callback();
                    } else {
                        successCount++;
                        callback();
                    }
                }
            );
        });
    };
    
    let completed = 0;
    for (let i = 0; i < data.length; i++) {
        insertFamille(data[i], () => {
            completed++;
            if (completed === data.length) {
                res.json({ success: true, successCount: successCount, errorCount: errorCount, total: data.length });
            }
        });
    }
});

app.get('/api/familles/export/:campagneId', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const campagneId = req.params.campagneId;
    const format = req.query.format || 'csv';
    
    db.all('SELECT * FROM familles WHERE campagne_id = ? AND actif = 1', [campagneId], (err, familles) => {
        if (err) return res.status(500).json({ error: err.message });
        
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
    });
});

// ============ ROUTES PRODUITS ============

app.get('/api/produits', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    db.all('SELECT * FROM produits ORDER BY nom', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/emplacements', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    db.all('SELECT * FROM emplacements ORDER BY ordre, nom', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/produits', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { reference, nom, groupe, points_total, est_mixte, est_divisible, nombre_unites,
            points_protides, points_accompagnement, points_laitier, points_dessert, emplacement_id } = req.body;
    
    db.run(`INSERT INTO produits (reference, nom, groupe, points_total, est_mixte, est_divisible, nombre_unites,
            points_protides, points_accompagnement, points_laitier, points_dessert, emplacement_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [reference || null, nom, groupe || null, points_total, est_mixte ? 1 : 0, est_divisible ? 1 : 0, nombre_unites || 1,
         points_protides || 0, points_accompagnement || 0, points_laitier || 0, points_dessert || 0, emplacement_id || null],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.put('/api/admin/produits/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { reference, nom, groupe, points_total, est_mixte, est_divisible, nombre_unites,
            points_protides, points_accompagnement, points_laitier, points_dessert, emplacement_id } = req.body;
    
    db.run(`UPDATE produits SET reference = ?, nom = ?, groupe = ?, points_total = ?, est_mixte = ?, est_divisible = ?, nombre_unites = ?,
            points_protides = ?, points_accompagnement = ?, points_laitier = ?, points_dessert = ?, emplacement_id = ?
            WHERE id = ?`,
        [reference || null, nom, groupe || null, points_total, est_mixte ? 1 : 0, est_divisible ? 1 : 0, nombre_unites || 1,
         points_protides || 0, points_accompagnement || 0, points_laitier || 0, points_dessert || 0, emplacement_id || null, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.delete('/api/admin/produits/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    db.run('DELETE FROM produits WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get('/api/produits/export', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    db.all('SELECT * FROM produits ORDER BY nom', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let csv = 'reference,nom,groupe,points_total,est_mixte,points_protides,points_accompagnement,points_laitier,points_dessert,est_divisible,nombre_unites\n';
        for (const p of rows) {
            csv += `"${p.reference || ''}","${p.nom}","${p.groupe || ''}",${p.points_total},${p.est_mixte ? 1 : 0},${p.points_protides || 0},${p.points_accompagnement || 0},${p.points_laitier || 0},${p.points_dessert || 0},${p.est_divisible ? 1 : 0},${p.nombre_unites || 1}\n`;
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=produits.csv');
        res.send(csv);
    });
});

app.post('/api/admin/produits/import', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { data } = req.body;
    
    if (!data || !Array.isArray(data)) {
        return res.status(400).json({ error: 'Données invalides' });
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    const insertProduit = (produit, callback) => {
        db.run(`INSERT INTO produits (
            reference, nom, groupe, points_total, est_mixte, est_divisible, nombre_unites,
            points_protides, points_accompagnement, points_laitier, points_dessert
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [produit.reference || null, produit.nom, produit.groupe || null, produit.points_total,
             produit.est_mixte ? 1 : 0, produit.est_divisible ? 1 : 0, produit.nombre_unites || 1,
             produit.points_protides || 0, produit.points_accompagnement || 0, produit.points_laitier || 0, produit.points_dessert || 0],
            function(err) {
                if (err) {
                    errorCount++;
                    callback();
                } else {
                    successCount++;
                    callback();
                }
            }
        );
    };
    
    let completed = 0;
    for (let i = 0; i < data.length; i++) {
        insertProduit(data[i], () => {
            completed++;
            if (completed === data.length) {
                res.json({ success: true, successCount: successCount, errorCount: errorCount, total: data.length });
            }
        });
    }
});

// ============ ROUTES LIVRAISONS ============

app.get('/api/livraisons', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    db.all('SELECT * FROM livraisons ORDER BY date_livraison DESC, created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const formatted = rows.map(row => ({
            ...row,
            produit: row.produit_nom,
            reference: row.produit_reference,
            points: row.produit_points
        }));
        
        const grouped = {};
        formatted.forEach(row => {
            const date = row.date_livraison;
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(row);
        });
        
        res.json(grouped);
    });
});

app.get('/api/livraisons/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    db.get('SELECT * FROM livraisons WHERE id = ?', [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Livraison non trouvée' });
        
        res.json({
            ...row,
            produit: row.produit_nom
        });
    });
});

app.post('/api/livraisons', upload.single('image'), (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { date_livraison, fournisseur, numero_lot, produit_id, quantite, date_peremption, provenance, notes } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;
    
    db.get('SELECT nom, reference, groupe, points_total FROM produits WHERE id = ?', [produit_id], (err, produit) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!produit) return res.status(404).json({ error: 'Produit non trouvé' });
        
        db.run(`INSERT INTO livraisons (
            date_livraison, fournisseur, numero_lot, 
            produit_id, produit_nom, produit_reference, produit_groupe, produit_points,
            quantite, date_peremption, provenance, notes, image_url, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [date_livraison, fournisseur || null, numero_lot || null, 
             produit_id, produit.nom, produit.reference || null, produit.groupe || null, produit.points_total,
             quantite, date_peremption || null, provenance || null, notes || null, image_url, req.session.user.id],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, id: this.lastID });
            }
        );
    });
});

app.put('/api/livraisons/:id', upload.single('image'), (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { date_livraison, fournisseur, numero_lot, produit_id, quantite, date_peremption, provenance, notes } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : req.body.existing_image;
    const livraisonId = req.params.id;
    
    db.get('SELECT nom, reference, groupe, points_total FROM produits WHERE id = ?', [produit_id], (err, produit) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!produit) return res.status(404).json({ error: 'Produit non trouvé' });
        
        db.run(`UPDATE livraisons SET 
            date_livraison = ?, fournisseur = ?, numero_lot = ?, 
            produit_id = ?, produit_nom = ?, produit_reference = ?, produit_groupe = ?, produit_points = ?,
            quantite = ?, date_peremption = ?, provenance = ?, notes = ?, image_url = ?
            WHERE id = ?`,
            [date_livraison, fournisseur || null, numero_lot || null, 
             produit_id, produit.nom, produit.reference || null, produit.groupe || null, produit.points_total,
             quantite, date_peremption || null, provenance || null, notes || null, image_url, livraisonId],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    });
});

app.delete('/api/livraisons/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    db.run('DELETE FROM livraisons WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ============ ROUTES UTILISATEURS ============

app.get('/api/admin/users', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    db.all('SELECT id, email, nom, prenom, telephone, age, role_id, actif FROM users ORDER BY nom', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/users', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { email, password, nom, prenom, telephone, age, role_id, actif } = req.body;
    
    if (!email || !email.trim()) {
        return res.status(400).json({ error: 'Email requis' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run(`INSERT INTO users (email, password, nom, prenom, telephone, age, role_id, actif)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [email.trim(), hashedPassword, nom, prenom, telephone || null, age || null, role_id || 2, actif ? 1 : 0],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            const newUserId = this.lastID;
            
            // Ajouter le nouvel utilisateur à la conversation générale (id 1)
            db.run(`INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (1, ?)`, [newUserId], (err2) => {
                if (err2) console.error('Erreur ajout à conversation générale:', err2.message);
            });
            
            res.json({ success: true, id: newUserId });
        }
    );
});

app.put('/api/admin/users/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { email, password, nom, prenom, telephone, age, role_id, actif } = req.body;
    const userId = req.params.id;
    
    let query = 'UPDATE users SET email = ?, nom = ?, prenom = ?, telephone = ?, age = ?, role_id = ?, actif = ?';
    let params = [email, nom, prenom, telephone || null, age || null, role_id || 2, actif ? 1 : 0];
    
    if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        query += ', password = ?';
        params.push(hashedPassword);
    }
    
    query += ' WHERE id = ?';
    params.push(userId);
    
    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/admin/users/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ============ ROUTES RÔLES ============

app.get('/api/admin/roles', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    db.all('SELECT * FROM roles ORDER BY id', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/roles', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { nom, description, permissions } = req.body;
    
    db.run(`INSERT INTO roles (nom, description, permissions) VALUES (?, ?, ?)`,
        [nom, description || null, permissions || null],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.put('/api/admin/roles/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { nom, description, permissions } = req.body;
    
    db.run(`UPDATE roles SET nom = ?, description = ?, permissions = ? WHERE id = ?`,
        [nom, description || null, permissions || null, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.delete('/api/admin/roles/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const roleId = req.params.id;
    
    db.run('UPDATE users SET role_id = 2 WHERE role_id = ?', [roleId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.run('DELETE FROM roles WHERE id = ?', [roleId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// ============ ROUTES WHITELIST ============

app.get('/api/admin/whitelist', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    db.all('SELECT * FROM whitelist ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/whitelist', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { email, role } = req.body;
    db.run('INSERT OR REPLACE INTO whitelist (email, role, created_by) VALUES (?, ?, ?)',
        [email, role, req.session.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.delete('/api/admin/whitelist/:email', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    db.run('DELETE FROM whitelist WHERE email = ?', [req.params.email], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ============ ROUTES DISTRIBUTION ============

app.get('/api/distribution/besoins/:campagneId', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const campagneId = req.params.campagneId;
    
    db.all('SELECT * FROM familles WHERE campagne_id = ? AND actif = 1', [campagneId], (err, familles) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let besoins = {
            protides: 0,
            accompagnement: 0,
            laitier: 0,
            dessert: 0,
            bebe: 0,
            hygiene: 0
        };
        
        for (const f of familles) {
            const repasSemaine = calculerRepasSemaine(f.nb_adultes, f.type_dotation || 'normale');
            const pointsAdultes = repasSemaine * 4;
            const pointsParCategorie = pointsAdultes / 4;
            
            besoins.protides += pointsParCategorie;
            besoins.accompagnement += pointsParCategorie;
            besoins.laitier += pointsParCategorie;
            besoins.dessert += pointsParCategorie;
            
            besoins.accompagnement += (f.enfants_6_12 || 0) * 4;
            besoins.accompagnement += (f.enfants_12_18 || 0) * 6;
            besoins.laitier += (f.enfants_12_18 || 0) * 4;
            besoins.accompagnement += (f.enfants_18_36 || 0) * 6;
            
            const paldEnfants = (f.enfants_12_18 || 0) * 3 + (f.enfants_18_36 || 0) * 3;
            besoins.protides += paldEnfants / 4;
            besoins.accompagnement += paldEnfants / 4;
            besoins.laitier += paldEnfants / 4;
            besoins.dessert += paldEnfants / 4;
        }
        
        besoins.protides = Math.round(besoins.protides);
        besoins.accompagnement = Math.round(besoins.accompagnement);
        besoins.laitier = Math.round(besoins.laitier);
        besoins.dessert = Math.round(besoins.dessert);
        
        res.json({
            familles: familles.length,
            besoins: besoins,
            date: new Date().toISOString().split('T')[0]
        });
    });
});

// ============ ROUTES MESSAGERIE ============

app.get('/api/conversations', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    const userId = req.session.user.id;
    
    db.all(`
        SELECT c.*, 
               (SELECT COUNT(*) FROM messages_conversation WHERE conversation_id = c.id AND is_read = 0 AND user_id != ?) as unread_count,
               (SELECT message FROM messages_conversation WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
               (SELECT created_at FROM messages_conversation WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_date
        FROM conversations c
        JOIN conversation_participants cp ON cp.conversation_id = c.id
        WHERE cp.user_id = ?
        ORDER BY last_message_date DESC
    `, [userId, userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/conversations/:id/messages', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    const conversationId = req.params.id;
    const userId = req.session.user.id;
    
    db.get('SELECT id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?', [conversationId, userId], (err, participant) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!participant) return res.status(403).json({ error: 'Accès non autorisé' });
        
        db.run('UPDATE messages_conversation SET is_read = 1 WHERE conversation_id = ? AND user_id != ?', [conversationId, userId]);
        
        db.all(`
            SELECT m.*, u.nom, u.prenom, u.avatar
            FROM messages_conversation m
            JOIN users u ON u.id = m.user_id
            WHERE m.conversation_id = ?
            ORDER BY m.created_at ASC
        `, [conversationId], (err, messages) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(messages);
        });
    });
});

app.post('/api/conversations/:id/messages', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    const conversationId = req.params.id;
    const userId = req.session.user.id;
    const { message } = req.body;
    
    if (!message || message.trim() === '') {
        return res.status(400).json({ error: 'Message vide' });
    }
    
    db.get('SELECT id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?', [conversationId, userId], (err, participant) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!participant) return res.status(403).json({ error: 'Accès non autorisé' });
        
        db.run(`INSERT INTO messages_conversation (conversation_id, user_id, message) VALUES (?, ?, ?)`,
            [conversationId, userId, message],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, id: this.lastID });
            }
        );
    });
});

app.post('/api/conversations/private', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    const { other_user_id } = req.body;
    const userId = req.session.user.id;
    
    db.all(`
        SELECT c.id FROM conversations c
        JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = ?
        JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = ?
        WHERE c.type = 'private'
    `, [userId, other_user_id], (err, existing) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (existing && existing.length > 0) {
            return res.json({ success: true, conversation_id: existing[0].id });
        }
        
        db.run(`INSERT INTO conversations (type, created_by) VALUES ('private', ?)`, [userId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            const conversationId = this.lastID;
            
            db.run(`INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)`,
                [conversationId, userId, conversationId, other_user_id],
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true, conversation_id: conversationId });
                }
            );
        });
    });
});

app.get('/api/users/benevoles', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    db.all('SELECT id, nom, prenom, email, avatar FROM users WHERE role = ? OR role = ? ORDER BY nom', ['admin', 'benevole'], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ============ ROUTES PLANNING ============

app.get('/api/creneaux', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    
    let query = `
        SELECT c.*, 
               (SELECT COUNT(*) FROM inscriptions WHERE creneau_id = c.id) as places_prises,
               (SELECT statut FROM inscriptions WHERE creneau_id = c.id AND user_id = ?) as mon_statut
        FROM creneaux c
        WHERE c.date_creneau >= date('now')
        ORDER BY c.date_creneau ASC, c.heure_debut ASC
    `;
    
    db.all(query, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (isAdmin && rows.length > 0) {
            const promises = rows.map(creneau => {
                return new Promise((resolve) => {
                    db.all(`
                        SELECT u.id, u.nom, u.prenom, u.email, i.statut, i.inscrit_le
                        FROM inscriptions i
                        JOIN users u ON u.id = i.user_id
                        WHERE i.creneau_id = ?
                    `, [creneau.id], (err, inscrits) => {
                        creneau.inscrits = inscrits || [];
                        resolve();
                    });
                });
            });
            
            Promise.all(promises).then(() => {
                res.json(rows);
            });
        } else {
            res.json(rows);
        }
    });
});

app.get('/api/creneaux/passes', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    const userId = req.session.user.id;
    
    db.all(`
        SELECT c.*, i.statut, i.inscrit_le
        FROM creneaux c
        JOIN inscriptions i ON i.creneau_id = c.id
        WHERE c.date_creneau < date('now') AND i.user_id = ?
        ORDER BY c.date_creneau DESC
    `, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/creneaux', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { date_creneau, heure_debut, heure_fin, type_activite, places_total, description } = req.body;
    
    db.run(`INSERT INTO creneaux (date_creneau, heure_debut, heure_fin, type_activite, places_total, description, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [date_creneau, heure_debut, heure_fin, type_activite, places_total || 5, description || null, req.session.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.put('/api/admin/creneaux/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { date_creneau, heure_debut, heure_fin, type_activite, places_total, description } = req.body;
    
    db.run(`UPDATE creneaux 
            SET date_creneau = ?, heure_debut = ?, heure_fin = ?, type_activite = ?, places_total = ?, description = ?
            WHERE id = ?`,
        [date_creneau, heure_debut, heure_fin, type_activite, places_total || 5, description || null, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.delete('/api/admin/creneaux/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    db.run('DELETE FROM inscriptions WHERE creneau_id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.run('DELETE FROM creneaux WHERE id = ?', [req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

app.post('/api/inscriptions', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    const { creneau_id } = req.body;
    const user_id = req.session.user.id;
    
    db.get('SELECT places_total, (SELECT COUNT(*) FROM inscriptions WHERE creneau_id = ?) as places_prises FROM creneaux WHERE id = ?',
        [creneau_id, creneau_id], (err, creneau) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!creneau) return res.status(404).json({ error: 'Créneau non trouvé' });
            
            if (creneau.places_prises >= creneau.places_total) {
                return res.status(400).json({ error: 'Plus de places disponibles' });
            }
            
            db.run(`INSERT INTO inscriptions (creneau_id, user_id) VALUES (?, ?)`,
                [creneau_id, user_id],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true });
                }
            );
        });
});

app.delete('/api/inscriptions/:creneau_id', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Non autorisé' });
    
    const { creneau_id } = req.params;
    const user_id = req.session.user.id;
    
    db.run('DELETE FROM inscriptions WHERE creneau_id = ? AND user_id = ?',
        [creneau_id, user_id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.put('/api/admin/inscriptions/:id/statut', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    const { statut } = req.body;
    const { id } = req.params;
    
    db.run('UPDATE inscriptions SET statut = ? WHERE id = ?',
        [statut, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
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

// Pages Admin
app.get('/admin/dashboard.html', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'admin', 'dashboard.html'));
});

app.get('/admin/gestion-communication.html', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'admin', 'gestion-communication.html'));
});

app.get('/admin/gestion-livraisons.html', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'admin', 'gestion-livraisons.html'));
});

app.get('/admin/gestion-planning.html', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'admin', 'gestion-planning.html'));
});

app.get('/admin/gestion-familles.html', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'admin', 'gestion-familles.html'));
});

app.get('/admin/gestion-produits.html', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'admin', 'gestion-produits.html'));
});

app.get('/admin/gestion-utilisateurs.html', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'admin', 'gestion-utilisateurs.html'));
});

app.get('/admin/gestion-distribution.html', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'src', 'pages', 'admin', 'gestion-distribution.html'));
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

// Ancienne route pour compatibilité (redirection)
app.get('/admin/gestion-messages.html', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.sendFile(path.join(__dirname, 'src', 'pages', 'login.html'));
    }
    res.redirect('/admin/gestion-communication.html');
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`\n✅ Serveur démarré sur http://localhost:${PORT}`);
    console.log('🔑 Compte admin: admin@restos.fr / admin123');
    console.log('📦 Campagnes préchargées : 2025 Hiver/Été, 2026 Hiver/Été\n');
});