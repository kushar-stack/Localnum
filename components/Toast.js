/**
 * Toast Notification System
 * A lightweight, dependency-free utility for showing non-intrusive feedback.
 */

export class ToastSystem {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.style.cssText = `
      position: fixed;
      top: 1.5rem;
      right: 1.5rem;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      pointer-events: none;
    `;
    document.body.appendChild(this.container);
  }

  show(message, type = 'neutral', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast-item reveal ${type}`;
    
    const icon = this._getIcon(type);
    
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
      </div>
      <div class="toast-progress"></div>
    `;

    this.container.appendChild(toast);

    // Trigger reveal
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    // Auto-remove
    setTimeout(() => {
      toast.classList.remove('visible');
      toast.addEventListener('transitionend', () => {
        toast.remove();
      }, { once: true });
    }, duration);
  }

  _getIcon(type) {
    switch (type) {
      case 'success': return '✓';
      case 'error': return '⚠';
      case 'warning': return '◬';
      default: return 'ℹ';
    }
  }
}

export const toast = new ToastSystem();
