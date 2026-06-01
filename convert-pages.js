const fs = require('fs');
const path = require('path');

// Configuration
const PAGES_DIR = path.join(__dirname, 'src', 'pages');
const BACKUP_DIR = path.join(__dirname, 'src', 'pages_backup');

// Le nouveau layout à injecter
const LAYOUT_HEAD = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>%%TITLE%%</title>
    <link rel="stylesheet" href="/css/style.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
</head>
<body>
    <div class="app-container">
        <div class="sidebar" id="sidebar">
            <div class="sidebar-logo">
                <img src="/images/logo.png" alt="Restos du Cœur" onerror="this.style.display='none'">
                <h2>Restos du Cœur</h2>
            </div>
            <nav class="sidebar-nav"></nav>
            <div class="sidebar-footer">
                <div class="nav-item" onclick="logout()">
                    <i class="fas fa-sign-out-alt"></i>
                    <span>Déconnexion</span>
                </div>
            </div>
        </div>
        
        <div class="main-content">
            <div class="top-bar">
                <button class="menu-toggle" onclick="toggleMobileMenu()">
                    <i class="fas fa-bars"></i>
                </button>
                <div class="profile-menu">
                    <div class="profile-avatar" onclick="toggleProfileMenu()">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="profile-dropdown" id="profileDropdown">
                        <div class="dropdown-item" id="userName">Chargement...</div>
                        <div class="dropdown-item" id="userEmail" style="font-size: 0.8rem; color: var(--text-secondary);"></div>
                        <div class="dropdown-divider"></div>
                        <a href="/profil.html" class="dropdown-item">
                            <i class="fas fa-user-circle"></i> Mon profil
                        </a>
                        <div class="dropdown-item">
                            <i class="fas fa-moon"></i> Mode sombre
                            <label class="switch">
                                <input type="checkbox" id="themeToggle" onchange="toggleTheme()">
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="dropdown-divider"></div>
                        <div class="dropdown-item" onclick="logout()">
                            <i class="fas fa-sign-out-alt"></i> Déconnexion
                        </div>
                    </div>
                </div>
            </div>
            
            %%CONTENT%%
        </div>
    </div>
    
    <script src="/js/layout.js"></script>
</body>
</html>`;

// Fonction pour extraire le titre d'une page HTML
function extractTitle(html) {
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) return titleMatch[1];
    
    const h1Match = html.match(/<h1>(.*?)<\/h1>/i);
    if (h1Match) return h1Match[1];
    
    return "Restos du Cœur";
}

// Fonction pour extraire le contenu principal
function extractContent(html) {
    // Essayer de trouver le main ou le conteneur principal
    let content = '';
    
    // Chercher le contenu entre <main> et </main>
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
        content = mainMatch[1];
    } else {
        // Chercher le contenu entre <body> et </body> en excluant header et footer
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) {
            let bodyContent = bodyMatch[1];
            // Supprimer header et footer si présents
            bodyContent = bodyContent.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
            bodyContent = bodyContent.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
            content = bodyContent;
        }
    }
    
    // Nettoyer le contenu
    content = content.trim();
    
    // Si pas de contenu, retourner un div vide
    if (!content) {
        return '<div class="card"><p>Contenu à migrer</p></div>';
    }
    
    return content;
}

// Fonction pour convertir une page
function convertPage(filePath) {
    console.log(`Conversion de ${filePath}...`);
    
    const html = fs.readFileSync(filePath, 'utf8');
    const title = extractTitle(html);
    const content = extractContent(html);
    
    const newHtml = LAYOUT_HEAD
        .replace('%%TITLE%%', title)
        .replace('%%CONTENT%%', content);
    
    return newHtml;
}

// Fonction pour traiter tous les fichiers d'un dossier
function processDirectory(dir, basePath = '') {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            processDirectory(fullPath, path.join(basePath, file));
        } else if (file.endsWith('.html')) {
            try {
                const newContent = convertPage(fullPath);
                fs.writeFileSync(fullPath, newContent, 'utf8');
                console.log(`✅ Converti: ${path.join(basePath, file)}`);
            } catch (error) {
                console.error(`❌ Erreur pour ${file}:`, error.message);
            }
        }
    }
}

// Créer une sauvegarde avant conversion
function backupPages() {
    if (fs.existsSync(BACKUP_DIR)) {
        fs.rmSync(BACKUP_DIR, { recursive: true });
    }
    fs.cpSync(PAGES_DIR, BACKUP_DIR, { recursive: true });
    console.log(`📦 Sauvegarde créée dans ${BACKUP_DIR}`);
}

// Vérifier que layout.js existe
function ensureLayoutJs() {
    const layoutJsPath = path.join(__dirname, 'src', 'js', 'layout.js');
    if (!fs.existsSync(layoutJsPath)) {
        console.error('❌ Le fichier src/js/layout.js est manquant !');
        console.log('Veuillez créer ce fichier avant de continuer.');
        process.exit(1);
    }
}

// Vérifier que style.css est à jour
function ensureStyleCss() {
    const styleCssPath = path.join(__dirname, 'src', 'css', 'style.css');
    if (!fs.existsSync(styleCssPath)) {
        console.error('❌ Le fichier src/css/style.css est manquant !');
        process.exit(1);
    }
}

// Exécution principale
console.log('🚀 Conversion automatique des pages...\n');

// Créer les dossiers nécessaires
const jsDir = path.join(__dirname, 'src', 'js');
if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir, { recursive: true });

// Vérifications
ensureStyleCss();

// Sauvegarder avant conversion
backupPages();

// Convertir toutes les pages
processDirectory(PAGES_DIR);

console.log('\n✨ Conversion terminée !');
console.log('⚠️ Vérifiez les pages converties et ajustez si nécessaire.');
console.log('💡 Pour restaurer les anciennes pages, copiez depuis le dossier backup.');