let userId = localStorage.getItem('ft_user_id');
if (!userId) {
    userId = 'usr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    localStorage.setItem('ft_user_id', userId);
}

async function request(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'x-ft-user-id': userId,
        ...(options.headers || {})
    };

    const response = await fetch(url, { ...options, headers });
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
}

export const API = {
    // TRANSACTIONS
    async getTransactions() {
        const data = await request('/api/transactions');
        return Array.isArray(data) ? data : [];
    },

    async addTransaction(data) {
        return request('/api/transactions', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async updateTransaction(id, data) {
        return request(`/api/transactions/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },

    async deleteTransaction(id) {
        return request(`/api/transactions/${id}`, {
            method: 'DELETE'
        });
    },

    // GOALS
    async getGoals() {
        const data = await request('/api/goals');
        return Array.isArray(data) ? data : [];
    },

    async addGoal(data) {
        return request('/api/goals', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async updateGoal(id, data) {
        return request(`/api/goals/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },

    async deleteGoal(id) {
        return request(`/api/goals/${id}`, {
            method: 'DELETE'
        });
    }
};