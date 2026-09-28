let currentUserId = null;

export const API = {
    // Call this from app.js once Firebase onAuthStateChanged resolves
    setUserId(uid) {
        currentUserId = uid;
    },

    getUserId() {
        return currentUserId;
    },

    async request(url, options = {}) {
        if (!currentUserId) {
            console.warn("API request initiated before user authentication.");
        }

        const headers = {
            'Content-Type': 'application/json',
            'x-ft-user-id': currentUserId || '',
            ...(options.headers || {})
        };

        // Attach userId as query parameter for GET requests
        let targetUrl = url;
        if (currentUserId) {
            const separator = targetUrl.includes('?') ? '&' : '?';
            targetUrl = `${targetUrl}${separator}userId=${encodeURIComponent(currentUserId)}`;
        }

        const response = await fetch(targetUrl, { ...options, headers });
        let payload = null;

        try {
            payload = await response.json();
        } catch (_err) {
            payload = null;
        }

        if (!response.ok) {
            const message = payload?.error || `Request failed (${response.status})`;
            throw new Error(message);
        }

        return payload;
    },

    // TRANSACTIONS
    async getTransactions() {
        const data = await this.request('/api/transactions');
        return Array.isArray(data) ? data : [];
    },

    async addTransaction(data) {
        return this.request('/api/transactions', {
            method: 'POST',
            body: JSON.stringify({
                ...data,
                userId: currentUserId
            })
        });
    },

    async updateTransaction(id, data) {
        return this.request(`/api/transactions/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                ...data,
                userId: currentUserId
            })
        });
    },

    async deleteTransaction(id) {
        return this.request(`/api/transactions/${id}`, {
            method: 'DELETE'
        });
    },

    // GOALS
    async getGoals() {
        const data = await this.request('/api/goals');
        return Array.isArray(data) ? data : [];
    },

    async addGoal(data) {
        return this.request('/api/goals', {
            method: 'POST',
            body: JSON.stringify({
                ...data,
                userId: currentUserId
            })
        });
    },

    async updateGoal(id, data) {
        return this.request(`/api/goals/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                ...data,
                userId: currentUserId
            })
        });
    },

    async deleteGoal(id) {
        return this.request(`/api/goals/${id}`, {
            method: 'DELETE'
        });
    }
};