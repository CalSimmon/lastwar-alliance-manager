/**
 * Sidebar Navigation Toggle
 * Handles collapsible sidebar functionality with state persistence
 */

(function() {
    'use strict';

    // Create and insert toggle button
    function createToggleButton() {
        const existingBtn = document.querySelector('.sidebar-toggle');
        if (existingBtn) return existingBtn;

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'sidebar-toggle';
        toggleBtn.innerHTML = '☰';
        toggleBtn.setAttribute('aria-label', 'Toggle sidebar navigation');
        toggleBtn.title = 'Toggle navigation';
        
        document.body.appendChild(toggleBtn);
        return toggleBtn;
    }

    // Create overlay for mobile
    function createOverlay() {
        const existingOverlay = document.querySelector('.sidebar-overlay');
        if (existingOverlay) return existingOverlay;

        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
        
        overlay.addEventListener('click', toggleSidebar);
        
        return overlay;
    }

    // Initialize sidebar state from localStorage
    function initializeSidebarState() {
        const sidebar = document.querySelector('.nav-menu');
        const main = document.querySelector('main');
        const savedState = localStorage.getItem('sidebarCollapsed');
        
        if (!sidebar || !main) return;

        // On mobile, default to collapsed
        const isMobile = window.innerWidth <= 768;
        const shouldCollapse = savedState === 'true' || (savedState === null && isMobile);

        if (shouldCollapse) {
            sidebar.classList.add('collapsed');
            main.classList.add('sidebar-collapsed');
        } else {
            sidebar.classList.remove('collapsed');
            main.classList.remove('sidebar-collapsed');
        }

        updateToggleIcon(shouldCollapse);
    }

    // Update toggle button icon
    function updateToggleIcon(isCollapsed) {
        const toggleBtn = document.querySelector('.sidebar-toggle');
        if (toggleBtn) {
            toggleBtn.innerHTML = isCollapsed ? '☰' : '✕';
        }
    }

    // Toggle sidebar
    function toggleSidebar() {
        const sidebar = document.querySelector('.nav-menu');
        const main = document.querySelector('main');
        const toggleBtn = document.querySelector('.sidebar-toggle');
        const overlay = document.querySelector('.sidebar-overlay');
        
        if (!sidebar || !main) return;

        const isCurrentlyCollapsed = sidebar.classList.contains('collapsed');
        const isMobile = window.innerWidth <= 768;
        
        if (isCurrentlyCollapsed) {
            sidebar.classList.remove('collapsed');
            main.classList.remove('sidebar-collapsed');
            if (isMobile && overlay) {
                overlay.classList.add('active');
            }
        } else {
            sidebar.classList.add('collapsed');
            main.classList.add('sidebar-collapsed');
            if (overlay) {
                overlay.classList.remove('active');
            }
        }

        const newState = !isCurrentlyCollapsed;
        localStorage.setItem('sidebarCollapsed', newState);
        updateToggleIcon(newState);
    }

    // Close sidebar when clicking outside on mobile
    function handleOutsideClick(e) {
        if (window.innerWidth > 768) return;

        const sidebar = document.querySelector('.nav-menu');
        const toggleBtn = document.querySelector('.sidebar-toggle');
        const overlay = document.querySelector('.sidebar-overlay');
        
        if (!sidebar || sidebar.classList.contains('collapsed')) return;

        const clickedInsideSidebar = sidebar.contains(e.target);
        const clickedToggleBtn = toggleBtn && toggleBtn.contains(e.target);
        const clickedOverlay = overlay && overlay.contains(e.target);

        if (!clickedInsideSidebar && !clickedToggleBtn && !clickedOverlay) {
            toggleSidebar();
        }
    }

    // Handle window resize
    function handleResize() {
        const sidebar = document.querySelector('.nav-menu');
        const main = document.querySelector('main');
        
        if (!sidebar || !main) return;

        // On desktop, respect saved state
        // On mobile, default to collapsed if no state saved
        const savedState = localStorage.getItem('sidebarCollapsed');
        const isMobile = window.innerWidth <= 768;

        if (isMobile && savedState === null) {
            sidebar.classList.add('collapsed');
            main.classList.add('sidebar-collapsed');
            updateToggleIcon(true);
        }
    }

    // Set active link based on current page
    function setActiveLink() {
        const currentPath = window.location.pathname;
        const navLinks = document.querySelectorAll('.nav-link');
        
        navLinks.forEach(link => {
            const linkPath = new URL(link.href).pathname;
            
            if (linkPath === currentPath || 
                (currentPath === '/' && linkPath === '/') ||
                (currentPath === '/index.html' && linkPath === '/')) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    // Initialize on DOM ready
    function init() {
        const toggleBtn = createToggleButton();
        const overlay = createOverlay();
        initializeSidebarState();
        setActiveLink();

        // Event listeners
        toggleBtn.addEventListener('click', toggleSidebar);
        document.addEventListener('click', handleOutsideClick);
        window.addEventListener('resize', debounce(handleResize, 250));

        // Close sidebar on navigation link click (mobile)
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    setTimeout(() => {
                        const sidebar = document.querySelector('.nav-menu');
                        const main = document.querySelector('main');
                        if (sidebar && !sidebar.classList.contains('collapsed')) {
                            sidebar.classList.add('collapsed');
                            main.classList.add('sidebar-collapsed');
                            localStorage.setItem('sidebarCollapsed', 'true');
                            updateToggleIcon(true);
                        }
                    }, 100);
                }
            });
        });
    }

    // Debounce utility
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
