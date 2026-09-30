let currentUserId = null;
let requestCounter = 0;
const pendingRequests = new Map();
const mutationMethods = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function nextIdempotencyKey(method, url) {
    requestCounter += 1;
    return `${method}:${url}:${Date.now()}:${requestCounter}`;
}

function dedupeRequestKey(method, targetUrl, body) {
    const bodySig = body || '';
    return `${currentUserId || 'anonymous'}:${method}:${targetUrl}:${bodySig}`;
}

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

        const method = (options.method || 'GET').toUpperCase();
        const isMutation = mutationMethods.has(method);

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

        if (isMutation && !headers['x-idempotency-key']) {
            headers['x-idempotency-key'] = nextIdempotencyKey(method, url);
        }

        const dedupeKey = dedupeRequestKey(method, targetUrl, options.body);
        if (isMutation && pendingRequests.has(dedupeKey)) {
            return pendingRequests.get(dedupeKey);
        }

        const requestPromise = (async () => {
            const response = await fetch(targetUrl, { ...options, method, headers });
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
        })();

        if (isMutation) {
            pendingRequests.set(dedupeKey, requestPromise);
            requestPromise.finally(() => pendingRequests.delete(dedupeKey));
        }

        return requestPromise;
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
    },

    // BUDGET
    async getBudget() {
        const data = await this.request('/api/budget');
        return data || { amount: 0 };
    },

    async saveBudget(amount) {
        return this.request('/api/budget', {
            method: 'POST',
            body: JSON.stringify({
                amount: Number(amount) || 0,
                userId: currentUserId
            })
        });
    },
};