class ShortTermEmailApp {
    constructor() {
        this.currentEmail = '';
        this.socket = null;
        this.autoRefreshInterval = null;
        this.currentEmails = [];
        this.apiBaseUrl = window.CONFIG?.API_BASE_URL || 'https://api.shorttermemail.com';
        this.socketUrl = window.CONFIG?.SOCKET_URL || 'wss://api.shorttermemail.com';
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkExistingEmail();
        this.checkApiStatus();
        this.initSocket();
    }

    bindEvents() {
        document.getElementById('generateEmailBtn').addEventListener('click', () => this.generateEmail());
        document.getElementById('copyEmailBtn').addEventListener('click', () => this.copyEmail());
        document.getElementById('refreshBtn').addEventListener('click', () => this.fetchEmails());
        document.getElementById('refreshStatus').addEventListener('click', () => this.checkApiStatus());
        document.getElementById('clearInbox').addEventListener('click', () => this.clearInbox());
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.getElementById('closeModalBtn').addEventListener('click', () => this.closeModal());
        
        document.getElementById('emailModal').addEventListener('click', (e) => {
            if (e.target.id === 'emailModal') this.closeModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeModal();
            if (e.ctrlKey && e.key === 'c' && this.currentEmail) this.copyEmail();
        });
    }

    initSocket() {
        try {
            this.socket = io(this.socketUrl, {
                timeout: 10000,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });
            
            this.socket.on('connect', () => {
                console.log('✅ Connected to ShortTermEmail server');
                if (this.currentEmail) {
                    this.socket.emit('subscribe', this.currentEmail);
                }
            });

            this.socket.on('new-email', (email) => {
                this.handleNewEmail(email);
            });

            this.socket.on('disconnect', () => {
                console.log('❌ Disconnected from server');
            });

            this.socket.on('reconnect', () => {
                console.log('🔗 Reconnected to server');
                if (this.currentEmail) {
                    this.socket.emit('subscribe', this.currentEmail);
                }
            });

        } catch (error) {
            console.error('Failed to initialize socket:', error);
        }
    }

    async checkApiStatus() {
        try {
            const statusElement = document.getElementById('apiStatus');
            statusElement.textContent = '🔄 Checking...';
            statusElement.className = 'status-checking';

            const response = await fetch(`${this.apiBaseUrl}/api/health`);
            const data = await response.json();
            
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
            const btnText = btn.querySelector('.btn-text');
            const btnLoader = btn.querySelector('.btn-loader');
            
            btn.disabled = true;
            btnText.classList.add('hidden');
            btnLoader.classList.remove('hidden');

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
                
                if (this.socket && this.socket.connected) {
                    this.socket.emit('subscribe', this.currentEmail);
                }
                
                localStorage.setItem('shorttermemail', JSON.stringify({
                    email: this.currentEmail,
                    expires: data.expires,
                    created: Date.now()
                }));

                this.showNotification('🎉 Temporary email created successfully!', 'success');
                
                document.title = `${this.currentEmail} - ShortTermEmail`;
            } else {
                throw new Error(data.error || 'Failed to generate email');
            }
        } catch (error) {
            console.error('Error generating email:', error);
            this.showError('Failed to generate email. Please check API status.');
        } finally {
            const btn = document.getElementById('generateEmailBtn');
            const btnText = btn.querySelector('.btn-text');
            const btnLoader = btn.querySelector('.btn-loader');
            
            btn.disabled = false;
            btnText.classList.remove('hidden');
            btnLoader.classList.add('hidden');
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
                this.currentEmails = data.emails || [];
                this.displayEmails(this.currentEmails);
                this.updateEmailCount(this.currentEmails.length);
                this.updateUnreadCount();
                
                if (this.currentEmails.length === 0) {
                    document.getElementById('noEmails').classList.remove('hidden');
                } else {
                    document.getElementById('noEmails').classList.add('hidden');
                }
            } else {
                throw new Error(data.error || 'Failed to fetch emails');
            }
        } catch (error) {
            console.error('Error fetching emails:', error);
            this.showError('Failed to fetch emails. Please check API status.');
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

        emailsList.innerHTML = emails.map((email, index) => `
            <div class="email-item ${email.read ? '' : 'unread'}" data-email-index="${index}">
                <div class="email-header">
                    <div class="email-subject">${this.escapeHtml(email.subject)}</div>
                    <div class="email-date">${this.formatDate(email.timestamp)}</div>
                </div>
                <div class="email-from">From: ${this.escapeHtml(email.from)}</div>
                <div class="email-preview" title="${this.escapeHtml(email.body)}">
                    ${this.escapeHtml(this.truncateText(email.body, 120))}
                </div>
            </div>
        `).join('');

        emailsList.querySelectorAll('.email-item').forEach((item, index) => {
            item.addEventListener('click', () => this.showEmail(emails[index]));
        });
    }

    showEmail(email) {
        this.currentEmailInModal = email;
        
        email.read = true;
        this.updateUnreadCount();
        
        const emailElement = document.querySelector(`[data-email-index="${this.currentEmails.indexOf(email)}"]`);
        if (emailElement) {
            emailElement.classList.remove('unread');
        }
        
        document.getElementById('modalSubject').textContent = this.escapeHtml(email.subject);
        document.getElementById('modalFrom').textContent = this.escapeHtml(email.from);
        document.getElementById('modalTo').textContent = this.escapeHtml(email.to);
        document.getElementById('modalDate').textContent = this.formatDate(email.timestamp);
        
        const bodyElement = document.getElementById('modalBody');
        if (email.html) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = email.html;
            this.sanitizeHtmlContent(tempDiv);
            bodyElement.innerHTML = tempDiv.innerHTML;
        } else {
            bodyElement.textContent = email.body;
        }
        
        document.getElementById('emailModal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    sanitizeHtmlContent(container) {
        const scripts = container.getElementsByTagName('script');
        for (let i = scripts.length - 1; i >= 0; i--) {
            scripts[i].remove();
        }
        
        const elements = container.getElementsByTagName('*');
        for (let element of elements) {
            const attributes = element.attributes;
            for (let i = attributes.length - 1; i >= 0; i--) {
                const attr = attributes[i];
                if (attr.name.startsWith('on') || attr.name === 'src' || attr.name === 'href') {
                    if (attr.name === 'src' || attr.name === 'href') {
                        if (attr.value && (attr.value.startsWith('javascript:') || attr.value.startsWith('data:'))) {
                            element.removeAttribute(attr.name);
                        }
                    } else {
                        element.removeAttribute(attr.name);
                    }
                }
            }
        }
    }

    closeModal() {
        document.getElementById('emailModal').classList.add('hidden');
        document.body.style.overflow = '';
        this.currentEmailInModal = null;
    }

    handleNewEmail(email) {
        this.currentEmails.unshift(email);
        this.displayEmails(this.currentEmails);
        this.updateEmailCount(this.currentEmails.length);
        this.updateUnreadCount();
        
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`New email from ${email.from}`, {
                body: email.subject,
                icon: '/favicon.ico'
            });
        }
        
        this.showNotification(`📩 New email from ${email.from}: "${this.truncateText(email.subject, 50)}"`, 'info');
        
        const newEmailElement = document.querySelector('[data-email-index="0"]');
        if (newEmailElement) {
            newEmailElement.classList.add('new-email');
            setTimeout(() => {
                newEmailElement.classList.remove('new-email');
            }, 2000);
        }
    }

    async copyEmail() {
        try {
            await navigator.clipboard.writeText(this.currentEmail);
            this.showNotification('✅ Email address copied to clipboard!', 'success');
        } catch (error) {
            const textArea = document.createElement('textarea');
            textArea.value = this.currentEmail;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showNotification('✅ Email address copied to clipboard!', 'success');
        }
    }

    async clearInbox() {
        if (!this.currentEmail || this.currentEmails.length === 0) return;
        
        if (confirm('Are you sure you want to clear all emails from your inbox?')) {
            try {
                const response = await fetch(`${this.apiBaseUrl}/api/emails/${encodeURIComponent(this.currentEmail)}`, {
                    method: 'DELETE'
                });
                
                const data = await response.json();
                
                if (data.success) {
                    this.currentEmails = [];
                    this.displayEmails(this.currentEmails);
                    this.updateEmailCount(0);
                    this.updateUnreadCount();
                    this.showNotification('Inbox cleared successfully', 'success');
                } else {
                    throw new Error(data.error);
                }
            } catch (error) {
                this.currentEmails = [];
                this.displayEmails(this.currentEmails);
                this.updateEmailCount(0);
                this.updateUnreadCount();
                this.showNotification('Inbox cleared locally', 'info');
            }
        }
    }

    checkExistingEmail() {
        const stored = localStorage.getItem('shorttermemail');
        if (stored) {
            try {
                const data = JSON.parse(stored);
                
                if (new Date(data.expires) > new Date()) {
                    this.currentEmail = data.email;
                    this.displayEmail(data.email, data.expires);
                    this.startAutoRefresh();
                    this.showNotification('Resumed your temporary email session', 'info');
                } else {
                    localStorage.removeItem('shorttermemail');
                    this.showNotification('Your temporary email has expired. Generate a new one.', 'warning');
                }
            } catch (error) {
                console.error('Error parsing stored email:', error);
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
        }, 15000);
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
        document.querySelectorAll('.notification').forEach(notification => {
            notification.remove();
        });
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 4000);
    }

    updateEmailCount(count) {
        document.getElementById('emailCount').textContent = `Emails: ${count}`;
    }

    updateUnreadCount() {
        const unreadCount = this.currentEmails.filter(email => !email.read).length;
        const badge = document.getElementById('unreadCount');
        
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.classList.remove('hidden');
            document.title = `(${unreadCount}) ${this.currentEmail} - ShortTermEmail`;
        } else {
            badge.classList.add('hidden');
            document.title = `${this.currentEmail} - ShortTermEmail`;
        }
    }

    escapeHtml(unsafe) {
        if (!unsafe) return '';
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
        return text.substring(0, maxLength).trim() + '...';
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
        
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
}

if ('Notification' in window) {
    Notification.requestPermission();
}

document.addEventListener('DOMContentLoaded', () => {
    window.emailApp = new ShortTermEmailApp();
});