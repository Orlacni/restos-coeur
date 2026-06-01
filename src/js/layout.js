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

// Fermer le menu quand on clique ailleurs
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
            // Afficher le nom dans le dropdown
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
// GÉNÉRATION DU MENU SELON LE RÔLE
// ============================================
function generateMenu() {
    const isAdmin = window.userRole === 'admin';
    const menuItems = [
        { href: '/', icon: 'fas fa-home', label: 'Accueil', adminOnly: false, benevoleOnly: false },
        { href: '/informations', icon: 'fas fa-info-circle', label: 'Informations', adminOnly: false, benevoleOnly: false },
        { divider: true, adminOnly: false },
        { href: '/admin/dashboard.html', icon: 'fas fa-chart-line', label: 'Dashboard', adminOnly: true, benevoleOnly: false },
        { href: '/admin/gestion-communication.html', icon: 'fas fa-bullhorn', label: 'Communication', adminOnly: true, benevoleOnly: false },
        { href: '/messagerie.html', icon: 'fas fa-envelope', label: 'Messagerie', adminOnly: false, benevoleOnly: false },
        { href: '/admin/gestion-planning.html', icon: 'fas fa-calendar', label: 'Planning', adminOnly: false, benevoleOnly: true },
        { href: '/benevole/planning.html', icon: 'fas fa-calendar-check', label: 'Mes missions', adminOnly: false, benevoleOnly: true },
        { href: '/admin/gestion-distribution.html', icon: 'fas fa-hand-holding-heart', label: 'Distribution', adminOnly: true, benevoleOnly: false },
        { href: '/admin/gestion-livraisons.html', icon: 'fas fa-truck', label: 'Livraisons', adminOnly: true, benevoleOnly: false },
        { href: '/admin/gestion-familles.html', icon: 'fas fa-users', label: 'Familles', adminOnly: true, benevoleOnly: false },
        { href: '/admin/gestion-produits.html', icon: 'fas fa-box', label: 'Produits', adminOnly: true, benevoleOnly: false },
        { href: '/admin/gestion-utilisateurs.html', icon: 'fas fa-user-shield', label: 'Utilisateurs', adminOnly: true, benevoleOnly: false }
    ];
    
    let html = '';
    for (const item of menuItems) {
        if (item.divider) {
            html += '<div class="sidebar-section">Menu principal</div>';
        } else if (item.adminOnly && !isAdmin) {
            continue;
        } else if (item.benevoleOnly && isAdmin) {
            continue;
        } else {
            const isActive = window.location.pathname === item.href;
            html += `<a href="${item.href}" class="nav-item ${isActive ? 'active' : ''}">
                        <i class="${item.icon}"></i>
                        <span>${item.label}</span>
                     </a>`;
        }
    }
    
    const navContainer = document.querySelector('.sidebar-nav');
    if (navContainer) navContainer.innerHTML = html;
}

// ============================================
// INITIALISATION
// ============================================
document.addEventListener('DOMContentLoaded', async function() {
    // Vérifier la session
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        if (data.isAuthenticated) {
            window.userRole = data.user.role;
            generateMenu();
            loadUserInfo();
        }
    } catch (error) {
        console.error('Erreur:', error);
    }
    
    initTheme();
});