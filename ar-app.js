class ShortTermEmailApp {
    constructor() {
        this.currentEmail = '';
        this.socket = null;
        this.autoRefreshInterval = null;
        this.currentEmails = [];
        this.apiBaseUrl = window.CONFIG?.API_BASE_URL || 'https://api.shorttermemail.com';
        this.language = window.CONFIG?.LANGUAGE || 'ar';
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkExistingEmail();
        this.checkApiStatus();
        this.setupLanguageSwitcher();
    }

    bindEvents() {
        document.getElementById('generateEmailBtn').addEventListener('click', () => this.generateEmail());
        document.getElementById('copyEmailBtn').addEventListener('click', () => this.copyEmail());
        document.getElementById('refreshBtn').addEventListener('click', () => this.fetchEmails());
        document.getElementById('clearInbox').addEventListener('click', () => this.clearInbox());
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.getElementById('closeModalBtn').addEventListener('click', () => this.closeModal());
        
        // Close modal when clicking outside
        document.getElementById('emailModal').addEventListener('click', (e) => {
            if (e.target.id === 'emailModal') {
                this.closeModal();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeModal();
            if (e.ctrlKey && e.key === 'c' && this.currentEmail) this.copyEmail();
            if (e.key === 'F5') {
                e.preventDefault();
                this.fetchEmails();
            }
        });

        // Online/offline detection
        window.addEventListener('online', () => this.handleOnlineStatus());
        window.addEventListener('offline', () => this.handleOfflineStatus());
    }

    setupLanguageSwitcher() {
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const lang = e.target.dataset.lang;
                if (lang === 'en') {
                    window.location.href = '/';
                } else {
                    window.location.href = '/ar.html';
                }
            });
        });
    }

    async checkApiStatus() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/health`);
            const data = await response.json();
            
            const statusElement = document.getElementById('apiStatus');
            if (data.status === 'OK') {
                statusElement.textContent = '✅ الخدمة تعمل';
                statusElement.className = 'status-online';
            } else {
                statusElement.textContent = '❌ الخدمة متوقفة';
                statusElement.className = 'status-offline';
            }
        } catch (error) {
            const statusElement = document.getElementById('apiStatus');
            statusElement.textContent = '❌ الخدمة متوقفة';
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
                
                // Store in localStorage
                localStorage.setItem('shorttermemail', JSON.stringify({
                    email: this.currentEmail,
                    expires: data.expires,
                    created: Date.now(),
                    language: this.language
                }));

                this.showNotification('🎉 تم إنشاء البريد الإلكتروني المؤقت بنجاح!', 'success');
                
                // Update page title with email
                document.title = `${this.currentEmail} - ShortTermEmail`;
            } else {
                throw new Error(data.error || 'فشل في إنشاء البريد الإلكتروني');
            }
        } catch (error) {
            console.error('Error generating email:', error);
            this.showError(`فشل في إنشاء البريد الإلكتروني: ${error.message}`);
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
        expiryElement.textContent = `تنتهي الصلاحية: ${new Date(expires).toLocaleString('ar-EG')}`;
        
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
                throw new Error(data.error || 'فشل في جلب الرسائل');
            }
        } catch (error) {
            console.error('Error fetching emails:', error);
            this.showError(`فشل في جلب الرسائل: ${error.message}`);
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

        // Sort emails by date (newest first)
        emails.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        emailsList.innerHTML = emails.map((email, index) => `
            <div class="email-item ${email.read ? '' : 'unread'}" data-email-id="${email.id}" data-email-index="${index}">
                <div class="email-header">
                    <div class="email-subject">${this.escapeHtml(email.subject)}</div>
                    <div class="email-date">${this.formatDate(email.timestamp)}</div>
                </div>
                <div class="email-from">من: ${this.escapeHtml(email.from)}</div>
                <div class="email-preview" title="${this.escapeHtml(email.body)}">
                    ${this.escapeHtml(this.truncateText(email.body, 120))}
                </div>
            </div>
        `).join('');

        // Add click listeners
        emailsList.querySelectorAll('.email-item').forEach((item) => {
            const index = parseInt(item.dataset.emailIndex);
            item.addEventListener('click', () => this.showEmail(emails[index]));
        });
    }

    showEmail(email) {
        this.currentEmailInModal = email;
        
        // Mark as read in local array
        email.read = true;
        this.updateUnreadCount();
        
        // Update the UI
        const emailElement = document.querySelector(`[data-email-id="${email.id}"]`);
        if (emailElement) {
            emailElement.classList.remove('unread');
        }
        
        // Show in modal
        document.getElementById('modalSubject').textContent = this.escapeHtml(email.subject);
        document.getElementById('modalFrom').textContent = this.escapeHtml(email.from);
        document.getElementById('modalTo').textContent = this.escapeHtml(email.to);
        document.getElementById('modalDate').textContent = this.formatDate(email.timestamp);
        
        const bodyElement = document.getElementById('modalBody');
        if (email.html) {
            // Create a safe container for HTML content
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = email.html;
            
            // Remove potentially dangerous elements
            this.sanitizeHtmlContent(tempDiv);
            
            bodyElement.innerHTML = tempDiv.innerHTML;
        } else {
            bodyElement.textContent = email.body;
        }
        
        document.getElementById('emailModal').classList.remove('hidden');
        
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    sanitizeHtmlContent(container) {
        // Remove scripts
        const scripts = container.getElementsByTagName('script');
        for (let i = scripts.length - 1; i >= 0; i--) {
            scripts[i].remove();
        }
        
        // Remove event handlers and dangerous attributes
        const elements = container.getElementsByTagName('*');
        for (let element of elements) {
            const attributes = element.attributes;
            for (let i = attributes.length - 1; i >= 0; i--) {
                const attr = attributes[i];
                if (attr.name.startsWith('on') || 
                    attr.name === 'src' || 
                    attr.name === 'href' ||
                    attr.name === 'style') {
                    
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

    async clearInbox() {
        if (!this.currentEmail || this.currentEmails.length === 0) return;
        
        if (confirm('هل أنت متأكد أنك تريد مسح جميع الرسائل من بريدك الوارد؟')) {
            this.currentEmails = [];
            this.displayEmails(this.currentEmails);
            this.updateEmailCount(0);
            this.updateUnreadCount();
            this.showNotification('تم مسح البريد الوارد بنجاح!', 'success');
        }
    }

    handleOnlineStatus() {
        this.showNotification('تم استعادة الاتصال', 'success');
        this.fetchEmails();
        this.checkApiStatus();
    }

    handleOfflineStatus() {
        this.showNotification('أنت غير متصل بالإنترنت. بعض الميزات قد لا تعمل.', 'warning');
    }

    async copyEmail() {
        try {
            await navigator.clipboard.writeText(this.currentEmail);
            this.showNotification('✅ تم نسخ عنوان البريد الإلكتروني إلى الحافظة!', 'success');
        } catch (error) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = this.currentEmail;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showNotification('✅ تم نسخ عنوان البريد الإلكتروني إلى الحافظة!', 'success');
        }
    }

    checkExistingEmail() {
        const stored = localStorage.getItem('shorttermemail');
        if (stored) {
            try {
                const data = JSON.parse(stored);
                
                // Check if email hasn't expired and language matches
                if (new Date(data.expires) > new Date() && data.language === this.language) {
                    this.currentEmail = data.email;
                    this.displayEmail(data.email, data.expires);
                    this.startAutoRefresh();
                    this.showNotification('تم استئناف جلسة البريد الإلكتروني المؤقت', 'info');
                } else {
                    localStorage.removeItem('shorttermemail');
                    if (data.language !== this.language) {
                        this.showNotification('يرجى إنشاء بريد إلكتروني جديد لهذه اللغة', 'info');
                    }
                }
            } catch (error) {
                console.error('Error parsing stored email:', error);
                localStorage.removeItem('shorttermemail');
            }
        }
    }

    startAutoRefresh() {
        // Refresh every 15 seconds
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
        // Remove existing notifications
        document.querySelectorAll('.notification').forEach(notification => {
            notification.remove();
        });
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Remove after 4 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 4000);
    }

    updateEmailCount(count) {
        document.getElementById('emailCount').textContent = `الرسائل: ${count}`;
    }

    updateUnreadCount() {
        const unreadCount = this.currentEmails.filter(email => !email.read).length;
        const badge = document.getElementById('unreadCount');
        
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.classList.remove('hidden');
            
            // Update browser tab title
            document.title = `(${unreadCount}) ${this.currentEmail} - ShortTermEmail`;
        } else {
            badge.classList.add('hidden');
            document.title = `${this.currentEmail} - ShortTermEmail`;
        }
    }

    // Utility methods
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
        
        if (diff < 60000) return 'الآن';
        if (diff < 3600000) return `منذ ${Math.floor(diff / 60000)} دقيقة`;
        if (diff < 86400000) return `منذ ${Math.floor(diff / 3600000)} ساعة`;
        if (diff < 604800000) return `منذ ${Math.floor(diff / 86400000)} يوم`;
        
        return date.toLocaleDateString('ar-EG') + ' ' + date.toLocaleTimeString('ar-EG', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
}

// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.emailApp = new ShortTermEmailApp();
});