/**
 * Toast Notification System
 * Simple, elegant toast notifications for user feedback
 */

// Create toast container if it doesn't exist
function ensureToastContainer() {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

// Main toast function
function showToast(message, type = 'info', title = '', duration = 4000) {
    const container = ensureToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = {
        success: '✓',
        error: '✗',
        warning: '⚠',
        info: 'ℹ'
    };
    
    const titles = {
        success: title || 'Success',
        error: title || 'Error',
        warning: title || 'Warning',
        info: title || 'Info'
    };
    
    toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>
        <div class="toast-content">
            <div class="toast-title">${titles[type]}</div>
            <div class="toast-message"></div>
        </div>
        <button class="toast-close" aria-label="Close">×</button>
    `;
    toast.querySelector('.toast-message').textContent = message;
    
    container.appendChild(toast);
    
    // Close button functionality
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        removeToast(toast);
    });
    
    // Auto-remove after duration
    if (duration > 0) {
        setTimeout(() => {
            removeToast(toast);
        }, duration);
    }
    
    return toast;
}

// Remove toast with animation
function removeToast(toast) {
    toast.classList.add('toast-exit');
    setTimeout(() => {
        if (toast.parentElement) {
            toast.parentElement.removeChild(toast);
        }
    }, 250);
}

// Convenience methods
const toast = {
    success(message, title = '', duration = 4000) {
        return showToast(message, 'success', title, duration);
    },
    
    error(message, title = '', duration = 5000) {
        return showToast(message, 'error', title, duration);
    },
    
    warning(message, title = '', duration = 5000) {
        return showToast(message, 'warning', title, duration);
    },
    
    info(message, title = '', duration = 4000) {
        return showToast(message, 'info', title, duration);
    }
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.toast = toast;
}

/**
 * Confirm Dialog
 * Replaces window.confirm with a styled, themed dialog.
 * Returns a Promise<boolean>.
 */
function showConfirm(message, title = 'Confirm', confirmText = 'Confirm', cancelText = 'Cancel', dangerous = false) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog';
        dialog.setAttribute('role', 'alertdialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.innerHTML = `
            <div class="confirm-title">${title}</div>
            <div class="confirm-message">${message}</div>
            <div class="confirm-buttons">
                <button class="confirm-cancel-btn">${cancelText}</button>
                <button class="confirm-ok-btn${dangerous ? ' confirm-dangerous' : ''}">${confirmText}</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Focus confirm button
        requestAnimationFrame(() => dialog.querySelector('.confirm-ok-btn').focus());

        const cleanup = (result) => {
            overlay.classList.add('confirm-hiding');
            setTimeout(() => overlay.remove(), 200);
            document.removeEventListener('keydown', keyHandler);
            resolve(result);
        };

        const keyHandler = (e) => {
            if (e.key === 'Escape') cleanup(false);
        };

        dialog.querySelector('.confirm-ok-btn').addEventListener('click', () => cleanup(true));
        dialog.querySelector('.confirm-cancel-btn').addEventListener('click', () => cleanup(false));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
        document.addEventListener('keydown', keyHandler);
    });
}

/**
 * Button Loading State Helpers
 */
function setButtonLoading(btn, loadingText = 'Loading...') {
    if (!btn) return;
    btn.disabled = true;
    btn._originalHTML = btn.innerHTML;
    btn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span>${loadingText}`;
}

function clearButtonLoading(btn) {
    if (!btn || btn._originalHTML === undefined) return;
    btn.disabled = false;
    btn.innerHTML = btn._originalHTML;
    delete btn._originalHTML;
}

if (typeof window !== 'undefined') {
    window.showConfirm = showConfirm;
    window.setButtonLoading = setButtonLoading;
    window.clearButtonLoading = clearButtonLoading;
}

/**
 * Scroll to Top Button
 * Automatically shows when user scrolls down
 */
function initScrollToTop() {
    // Create button if it doesn't exist
    let scrollBtn = document.querySelector('.scroll-to-top');
    if (!scrollBtn) {
        scrollBtn = document.createElement('button');
        scrollBtn.className = 'scroll-to-top';
        scrollBtn.innerHTML = '↑';
        scrollBtn.setAttribute('aria-label', 'Scroll to top');
        scrollBtn.title = 'Scroll to top';
        document.body.appendChild(scrollBtn);
        
        // Scroll to top on click
        scrollBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
    
    // Show/hide based on scroll position
    function toggleScrollButton() {
        if (window.scrollY > 300) {
            scrollBtn.classList.add('visible');
        } else {
            scrollBtn.classList.remove('visible');
        }
    }
    
    // Check on scroll
    window.addEventListener('scroll', toggleScrollButton);
    
    // Initial check
    toggleScrollButton();
}

// Auto-initialize scroll to top
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollToTop);
} else {
    initScrollToTop();
}

/**
 * Loading Skeleton Generator
 * Creates skeleton loading placeholders
 */
function createSkeleton(type = 'card', count = 1) {
    const skeletons = [];
    
    for (let i = 0; i < count; i++) {
        const skeleton = document.createElement('div');
        
        if (type === 'card') {
            skeleton.className = 'skeleton-card';
            skeleton.innerHTML = `
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text"></div>
            `;
        } else if (type === 'text') {
            skeleton.className = 'skeleton skeleton-text';
        } else if (type === 'title') {
            skeleton.className = 'skeleton skeleton-title';
        }
        
        skeletons.push(skeleton);
    }
    
    return count === 1 ? skeletons[0] : skeletons;
}

// Export skeleton generator
if (typeof window !== 'undefined') {
    window.createSkeleton = createSkeleton;
}
