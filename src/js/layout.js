// ============================================
// GESTION DU THEME (CLAIR/SOMBRE)
// ============================================
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.checked = true;
    }
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// ============================================
// GESTION DU MENU PROFIL
// ============================================
function toggleProfileMenu() {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) dropdown.classList.toggle('show');
}

document.addEventListener('click', function(e) {
    const profileMenu = document.querySelector('.profile-menu');
    if (profileMenu && !profileMenu.contains(e.target)) {
        const dropdown = document.getElementById('profileDropdown');
        if (dropdown) dropdown.classList.remove('show');
    }
});

// ============================================
// GESTION DU MENU MOBILE
// ============================================
function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
}

// ============================================
// DÉCONNEXION
// ============================================
async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
}

// ============================================
// CHARGEMENT DES INFOS UTILISATEUR
// ============================================
async function loadUserInfo() {
    try {
        const response = await fetch('/api/user/profile');
        if (response.ok) {
            const user = await response.json();
            const avatarElement = document.querySelector('.profile-avatar');
            if (avatarElement) {
                if (user.avatar) {
                    avatarElement.innerHTML = `<img src="${user.avatar}" alt="Avatar">`;
                } else {
                    const initials = (user.prenom ? user.prenom[0] : '') + (user.nom ? user.nom[0] : '');
                    avatarElement.innerHTML = initials || '<i class="fas fa-user"></i>';
                }
            }
            const userNameElement = document.getElementById('userName');
            if (userNameElement) {
                userNameElement.textContent = `${user.prenom || ''} ${user.nom || ''}`;
            }
            const userEmailElement = document.getElementById('userEmail');
            if (userEmailElement) {
                userEmailElement.textContent = user.email || '';
            }
        }
    } catch (error) {
        console.error('Erreur chargement profil:', error);
    }
}

// ============================================
// VARIABLES GLOBALES
// ============================================
let userPermissions = [];
let menuGenerated = false;
let permissionCheckInterval = null;
let lastPermissionsHash = '';

// ============================================
// NOTIFICATION
// ============================================
function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--restos-rose);
        color: white;
        padding: 12px 20px;
        border-radius: 12px;
        z-index: 10000;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
    `;
    notification.innerHTML = `<i class="fas fa-sync-alt"></i> ${message}`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Ajouter les animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// ============================================
// GÉNÉRATION DU MENU
// ============================================
function generateMenu() {
    const isAdmin = window.userRole === 'admin';
    
    console.log('=== GÉNÉRATION DU MENU ===');
    console.log('Rôle utilisateur:', window.userRole);
    console.log('Permissions disponibles:', userPermissions);
    
    // Tous les onglets disponibles
    const allMenuItems = [
        { href: '/', icon: 'fas fa-home', label: 'Accueil', permission: 'accueil' },
        { href: '/informations', icon: 'fas fa-info-circle', label: 'Informations', permission: 'informations' },
        { divider: true, title: 'Échanges' },
        { href: '/admin/dashboard.html', icon: 'fas fa-chart-line', label: 'Dashboard', permission: 'dashboard' },
        { href: '/admin/gestion-communication.html', icon: 'fas fa-bullhorn', label: 'Communication', permission: 'communication' },
        { href: '/benevole/planning.html', icon: 'fas fa-calendar-check', label: 'Mes missions', permission: 'planning', adminOnly: false, hideForAdmin: true },
        { href: '/admin/gestion-planning.html', icon: 'fas fa-calendar-alt', label: 'Gestion planning', permission: 'gestion_planning' },
        { href: '/messagerie.html', icon: 'fas fa-envelope', label: 'Messagerie', permission: 'messagerie' },
        { divider: true, title: 'Accompagnement' },
        { href: '/admin/gestion-distribution.html', icon: 'fas fa-hand-holding-heart', label: 'Distribution', permission: 'distribution' },
        { href: '/admin/gestion-suivi-distribution.html', icon: 'fas fa-clipboard-list', label: 'Suivi distribution', permission: 'distribution' },
        { href: '/admin/gestion-livraisons.html', icon: 'fas fa-truck', label: 'Livraisons', permission: 'livraisons' },
        { href: '/admin/gestion-familles.html', icon: 'fas fa-users', label: 'Familles', permission: 'familles' },
        { href: '/admin/gestion-produits.html', icon: 'fas fa-box', label: 'Produits', permission: 'produits' },
        { href: '/admin/gestion-utilisateurs.html', icon: 'fas fa-user-shield', label: 'Bénévoles', permission: 'utilisateurs' },
    ];
    
    let html = '';
    let count = 0;
    
    for (const item of allMenuItems) {
        if (item.divider) {
            const sectionTitle = item.title || 'Menu principal';
            html += `<div class="sidebar-section">${sectionTitle}</div>`;
            continue;
        }
        
        // Vérifier la permission
        let hasPermission = false;
        
        // Si l'utilisateur est admin, il a toutes les permissions
        if (isAdmin) {
            hasPermission = true;
        } else {
            hasPermission = userPermissions.includes(item.permission);
        }
        
        if (!hasPermission) {
            console.log(`❌ ${item.label} (${item.permission}) - NON autorisé`);
            continue;
        }
        if (item.hideForAdmin && isAdmin) {
            console.log(`❌ ${item.label} - caché pour admin`);
            continue;
        }

        console.log(`✅ ${item.label} (${item.permission}) - autorisé`);
        count++;
        
        const isActive = window.location.pathname === item.href;
        html += `<a href="${item.href}" class="nav-item ${isActive ? 'active' : ''}">
                    <i class="${item.icon}"></i>
                    <span>${item.label}</span>
                 </a>`;
    }
    
    const navContainer = document.querySelector('.sidebar-nav');
    if (navContainer) {
        navContainer.innerHTML = html;
        console.log(`📋 Menu généré : ${count} éléments affichés`);
    } else {
        console.error('❌ Sidebar-nav non trouvé dans le DOM');
    }
    
    menuGenerated = true;
}

// ============================================
// CHARGEMENT DES PERMISSIONS
// ============================================
async function loadPermissions() {
    try {
        const response = await fetch('/api/user/permissions');
        if (response.ok) {
            const data = await response.json();
            const newPermissions = data.permissions || [];
            const newHash = JSON.stringify(newPermissions);
            
            userPermissions = newPermissions;
            lastPermissionsHash = newHash;
            
            console.log('✅ Permissions chargées:', userPermissions);
            return true;
        } else {
            console.error('❌ Erreur chargement permissions:', response.status);
            userPermissions = [];
            return false;
        }
    } catch (error) {
        console.error('❌ Erreur:', error);
        userPermissions = [];
        return false;
    }
}

// ============================================
// POLLING POUR METTRE À JOUR LES PERMISSIONS
// ============================================
function startPermissionPolling() {
    if (permissionCheckInterval) clearInterval(permissionCheckInterval);
    
    permissionCheckInterval = setInterval(async function() {
        if (!window.userRole) return;
        
        try {
            const response = await fetch('/api/user/permissions');
            if (response.ok) {
                const data = await response.json();
                const newPermissions = data.permissions || [];
                const newHash = JSON.stringify(newPermissions);
                
                if (newHash !== lastPermissionsHash) {
                    console.log('🔄 Détection de changement de permissions ! Mise à jour...');
                    lastPermissionsHash = newHash;
                    userPermissions = newPermissions;
                    generateMenu();
                    showNotification('Vos accès ont été mis à jour', 'info');
                }
            }
        } catch (error) {
            console.error('Erreur polling permissions:', error);
        }
    }, 5000);
}

function stopPermissionPolling() {
    if (permissionCheckInterval) {
        clearInterval(permissionCheckInterval);
        permissionCheckInterval = null;
    }
}

// ============================================
// RECHARGEMENT MANUEL DES PERMISSIONS
// ============================================
async function refreshPermissions() {
    console.log('🔄 Rechargement manuel des permissions...');
    await loadPermissions();
    generateMenu();
    showNotification('Permissions mises à jour', 'success');
}

// ============================================
// INITIALISATION
// ============================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('=== INITIALISATION LAYOUT ===');
    
    try {
        const authResponse = await fetch('/api/check-auth');
        const authData = await authResponse.json();
        
        if (authData.isAuthenticated) {
            window.userRole = authData.user.role;
            console.log('✅ Utilisateur connecté:', authData.user.email, 'Rôle:', window.userRole);
            
            await loadUserInfo();
            await loadPermissions();
            generateMenu();
            startPermissionPolling();
            
        } else {
            console.log('👤 Utilisateur non connecté - menu public');
            const navContainer = document.querySelector('.sidebar-nav');
            if (navContainer) {
                navContainer.innerHTML = `
                    <a href="/" class="nav-item ${window.location.pathname === '/' ? 'active' : ''}">
                        <i class="fas fa-home"></i>
                        <span>Accueil</span>
                    </a>
                    <a href="/informations" class="nav-item ${window.location.pathname === '/informations' ? 'active' : ''}">
                        <i class="fas fa-info-circle"></i>
                        <span>Informations</span>
                    </a>
                    <a href="/login.html" class="nav-item ${window.location.pathname === '/login.html' ? 'active' : ''}">
                        <i class="fas fa-sign-in-alt"></i>
                        <span>Connexion</span>
                    </a>
                `;
            }
        }
    } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation:', error);
    }
    
    initTheme();
});

// Exposer les fonctions globalement
window.refreshPermissions = refreshPermissions;
window.toggleTheme = toggleTheme;
window.toggleProfileMenu = toggleProfileMenu;
window.toggleMobileMenu = toggleMobileMenu;
window.logout = logout;