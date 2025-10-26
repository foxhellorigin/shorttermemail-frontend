class ShortTermEmailApp {
    constructor() {
        this.currentEmail = '';
        this.socket = null;
        this.autoRefreshInterval = null;
        this.currentEmails = [];
        this.apiBaseUrl = window.CONFIG?.API_BASE_URL || 'https://api.shorttermemail.com';
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkExistingEmail();
        this.checkApiStatus();
    }

    bindEvents() {
        document.getElementById('generateEmailBtn').addEventListener('click', () => this.generateEmail());
        document.getElementById('copyEmailBtn').addEventListener('click', () => this.copyEmail());
        
        // Keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'c' && this.currentEmail) this.copyEmail();
        });
    }

    async checkApiStatus() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/health`);
            const data = await response.json();
            
            const statusElement = document.getElementById('apiStatus');
            if (data.status === 'OK') {
                statusElement.textContent = '✅ API Online';
                statusElement.className = 'status-online';
            } else {
                statusElement.textContent = '❌ API Offline';
                statusElement.className = 'status-offline';
            }
        } catch (error) {
            const statusElement = document.getElementById('apiStatus');
            statusElement.textContent = '❌ API Offline';
            statusElement.className = 'status-offline';
        }
    }

    async generateEmail() {
        try {
            const btn = document.getElementById('generateEmailBtn');
            btn.disabled = true;
            btn.textContent = 'Generating...';

            const response = await fetch(`${this.apiBaseUrl}/api/generate-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                this.currentEmail = data.email;
                this.displayEmail(data.email, data.expires);
                this.startAutoRefresh();
                
                // Store in localStorage
                localStorage.setItem('shorttermemail', JSON.stringify({
                    email: this.currentEmail,
                    expires: data.expires,
                    created: Date.now()
                }));

                this.showNotification('Temporary email created successfully!');
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            this.showError('Failed to generate email. Please check API status.');
        } finally {
            const btn = document.getElementById('generateEmailBtn');
            btn.disabled = false;
            btn.textContent = 'Generate New Email';
        }
    }

    displayEmail(email, expires) {
        const emailDisplay = document.getElementById('emailDisplay');
        const emailElement = document.getElementById('currentEmail');
        const expiryElement = document.getElementById('emailExpiry');

        emailElement.textContent = email;
        expiryElement.textContent = `Expires: ${new Date(expires).toLocaleString()}`;
        
        emailDisplay.classList.remove('hidden');
        document.getElementById('noEmails').classList.remove('hidden');
        
        this.fetchEmails();
    }

    async fetchEmails() {
        if (!this.currentEmail) return;

        try {
            this.showLoading(true);
            
            const response = await fetch(`${this.apiBaseUrl}/api/emails/${encodeURIComponent(this.currentEmail)}`);
            const data = await response.json();

            if (data.success) {
                this.displayEmails(data.emails);
                this.updateEmailCount(data.emails.length);
                
                if (data.emails.length === 0) {
                    document.getElementById('noEmails').classList.remove('hidden');
                } else {
                    document.getElementById('noEmails').classList.add('hidden');
                }
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            this.showError('Failed to fetch emails');
        } finally {
            this.showLoading(false);
        }
    }

    displayEmails(emails) {
        const emailsList = document.getElementById('emailsList');
        
        if (emails.length === 0) {
            emailsList.innerHTML = '';
            return;
        }

        emails.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        emailsList.innerHTML = emails.map(email => `
            <div class="email-item ${email.read ? '' : 'unread'}">
                <div class="email-header">
                    <div class="email-subject">${this.escapeHtml(email.subject)}</div>
                    <div class="email-date">${this.formatDate(email.timestamp)}</div>
                </div>
                <div class="email-from">From: ${this.escapeHtml(email.from)}</div>
                <div class="email-preview">${this.escapeHtml(this.truncateText(email.body, 100))}</div>
            </div>
        `).join('');
    }

    async copyEmail() {
        try {
            await navigator.clipboard.writeText(this.currentEmail);
            this.showNotification('Email address copied to clipboard!');
        } catch (error) {
            this.showError('Failed to copy email address');
        }
    }

    checkExistingEmail() {
        const stored = localStorage.getItem('shorttermemail');
        if (stored) {
            const data = JSON.parse(stored);
            if (new Date(data.expires) > new Date()) {
                this.currentEmail = data.email;
                this.displayEmail(data.email, data.expires);
                this.startAutoRefresh();
            } else {
                localStorage.removeItem('shorttermemail');
            }
        }
    }

    startAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
        this.autoRefreshInterval = setInterval(() => {
            this.fetchEmails();
        }, 10000);
    }

    showLoading(show) {
        const loading = document.getElementById('loadingIndicator');
        if (show) {
            loading.classList.remove('hidden');
        } else {
            loading.classList.add('hidden');
        }
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: type === 'error' ? '#dc3545' : '#28a745',
            color: 'white',
            padding: '15px 20px',
            borderRadius: '5px',
            zIndex: '1001'
        });
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    updateEmailCount(count) {
        document.getElementById('emailCount').textContent = `Emails: ${count}`;
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleDateString();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ShortTermEmailApp();
});