require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { initializeApp, getApps } = require('firebase/app');
const {
    getFirestore,
    collection,
    getDocs,
    getDoc,
    addDoc,
    setDoc,
    doc,
    updateDoc,
    deleteDoc,
    query,
    where
} = require('firebase/firestore');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

let db;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const IDEMPOTENCY_MAX_ENTRIES = 5000;
const idempotencyStore = new Map();

function getDb() {
    if (db) return db;

    const firebaseConfig = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID
    };

    if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
        throw new Error('Missing Firebase environment variables for backend Firestore access');
    }

    const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp);
    return db;
}

function getUserId(req) {
    const headerId = req.get('x-ft-user-id');
    if (headerId && String(headerId).trim()) {
        return String(headerId).trim();
    }
    return 'anonymous';
}

function toAmount(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function stableStringify(value) {
    if (value === null || value === undefined) return String(value);
    if (typeof value !== 'object') return JSON.stringify(value);

    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }

    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function makeRequestFingerprint(req) {
    const bodySignature = stableStringify(req.body || {});
    return crypto.createHash('sha256').update(bodySignature).digest('hex');
}

function pruneIdempotencyStore() {
    const now = Date.now();

    for (const [storeKey, entry] of idempotencyStore.entries()) {
        if ((now - entry.createdAt) > IDEMPOTENCY_TTL_MS) {
            idempotencyStore.delete(storeKey);
        }
    }

    if (idempotencyStore.size <= IDEMPOTENCY_MAX_ENTRIES) return;

    const ordered = [...idempotencyStore.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    const overflow = idempotencyStore.size - IDEMPOTENCY_MAX_ENTRIES;
    for (let i = 0; i < overflow; i += 1) {
        idempotencyStore.delete(ordered[i][0]);
    }
}

function consumeIdempotency(req, res) {
    const keyHeader = req.get('x-idempotency-key');
    if (!keyHeader || !String(keyHeader).trim()) {
        return { enabled: false };
    }

    pruneIdempotencyStore();

    const userId = getUserId(req);
    const method = req.method.toUpperCase();
    const pathKey = req.path;
    const idempotencyKey = String(keyHeader).trim();
    const requestFingerprint = makeRequestFingerprint(req);
    const storeKey = `${userId}:${method}:${pathKey}:${idempotencyKey}`;
    const existing = idempotencyStore.get(storeKey);

    if (!existing) {
        return { enabled: true, storeKey, requestFingerprint };
    }

    const expired = (Date.now() - existing.createdAt) > IDEMPOTENCY_TTL_MS;
    if (expired) {
        idempotencyStore.delete(storeKey);
        return { enabled: true, storeKey, requestFingerprint };
    }

    if (existing.requestFingerprint !== requestFingerprint) {
        res.status(409).json({ error: 'Idempotency key was already used with a different request payload' });
        return null;
    }

    if (existing.state === 'in-progress') {
        res.status(409).json({ error: 'A request with this idempotency key is currently being processed' });
        return null;
    }

    res.set('x-idempotency-replayed', 'true');
    res.status(existing.status).json(existing.body);
    return null;
}

function beginIdempotentRequest(context) {
    if (!context || !context.enabled) return;

    idempotencyStore.set(context.storeKey, {
        state: 'in-progress',
        requestFingerprint: context.requestFingerprint,
        createdAt: Date.now()
    });
}

function completeIdempotentRequest(context, status, body) {
    if (!context || !context.enabled) return;

    idempotencyStore.set(context.storeKey, {
        state: 'completed',
        requestFingerprint: context.requestFingerprint,
        createdAt: Date.now(),
        status,
        body
    });
}

function failIdempotentRequest(context) {
    if (!context || !context.enabled) return;
    idempotencyStore.delete(context.storeKey);
}

app.get('/api/transactions', async (req, res) => {
    try {
        const database = getDb();
        const userId = getUserId(req);
        const q = query(collection(database, 'transactions'), where('userId', '==', userId));
        const snapshot = await getDocs(q);
        const transactions = [];
        snapshot.forEach((txDoc) => transactions.push({ id: txDoc.id, ...txDoc.data() }));
        transactions.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        res.status(200).json(transactions);
    } catch (error) {
        console.error('GET /api/transactions failed:', error);
        res.status(500).json({ error: 'Failed to load transactions' });
    }
});

app.post('/api/transactions', async (req, res) => {
    const idempotencyContext = consumeIdempotency(req, res);
    if (idempotencyContext === null) return;

    try {
        beginIdempotentRequest(idempotencyContext);

        const {
            description,
            account,
            method,
            amount,
            goalId,
            isWithdrawal = false
        } = req.body || {};
        const userId = getUserId(req);

        if (!description || !account || !method || amount === undefined) {
            return res.status(400).json({ error: 'description, account, method, and amount are required' });
        }

        const normalizedAmount = toAmount(amount);
        if (normalizedAmount <= 0) {
            return res.status(400).json({ error: 'amount must be greater than 0' });
        }

        const database = getDb();
        const created = {
            description: String(description).trim(),
            account,
            method,
            amount: normalizedAmount,
            goalId: goalId ?? null,
            isWithdrawal: Boolean(isWithdrawal),
            userId,
            date: new Date().toISOString()
        };

        const docRef = await addDoc(collection(database, 'transactions'), created);
        const responseBody = { id: docRef.id, ...created };
        completeIdempotentRequest(idempotencyContext, 201, responseBody);
        res.status(201).json(responseBody);
    } catch (error) {
        failIdempotentRequest(idempotencyContext);
        console.error('POST /api/transactions failed:', error);
        res.status(500).json({ error: 'Failed to create transaction' });
    }
});

app.patch('/api/transactions/:id', async (req, res) => {
    const idempotencyContext = consumeIdempotency(req, res);
    if (idempotencyContext === null) return;

    try {
        beginIdempotentRequest(idempotencyContext);

        const { id } = req.params;
        const database = getDb();
        const userId = getUserId(req);
        const ref = doc(database, 'transactions', id);
        const existing = await getDoc(ref);

        if (!existing.exists() || existing.data().userId !== userId) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        const patch = { ...req.body };
        if (patch.amount !== undefined) {
            patch.amount = toAmount(patch.amount);
        }

        await updateDoc(ref, patch);
        const responseBody = { id, ...patch };
        completeIdempotentRequest(idempotencyContext, 200, responseBody);
        res.status(200).json(responseBody);
    } catch (error) {
        failIdempotentRequest(idempotencyContext);
        console.error('PATCH /api/transactions/:id failed:', error);
        res.status(500).json({ error: 'Failed to update transaction' });
    }
});

app.delete('/api/transactions/:id', async (req, res) => {
    const idempotencyContext = consumeIdempotency(req, res);
    if (idempotencyContext === null) return;

    try {
        beginIdempotentRequest(idempotencyContext);

        const { id } = req.params;
        const database = getDb();
        const userId = getUserId(req);
        const ref = doc(database, 'transactions', id);
        const existing = await getDoc(ref);

        if (!existing.exists() || existing.data().userId !== userId) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        await deleteDoc(ref);
        const responseBody = { id };
        completeIdempotentRequest(idempotencyContext, 200, responseBody);
        res.status(200).json(responseBody);
    } catch (error) {
        failIdempotentRequest(idempotencyContext);
        console.error('DELETE /api/transactions/:id failed:', error);
        res.status(500).json({ error: 'Failed to delete transaction' });
    }
});

app.get('/api/goals', async (req, res) => {
    try {
        const database = getDb();
        const userId = getUserId(req);
        const q = query(collection(database, 'goals'), where('userId', '==', userId));
        const snapshot = await getDocs(q);
        const goals = [];
        snapshot.forEach((goalDoc) => goals.push({ id: goalDoc.id, ...goalDoc.data() }));
        res.status(200).json(goals);
    } catch (error) {
        console.error('GET /api/goals failed:', error);
        res.status(500).json({ error: 'Failed to load goals' });
    }
});

app.post('/api/goals', async (req, res) => {
    const idempotencyContext = consumeIdempotency(req, res);
    if (idempotencyContext === null) return;

    try {
        beginIdempotentRequest(idempotencyContext);

        const { name, target, saved = 0 } = req.body || {};
        const userId = getUserId(req);
        if (!name || target === undefined) {
            return res.status(400).json({ error: 'name and target are required' });
        }

        const normalizedTarget = toAmount(target);
        if (normalizedTarget <= 0) {
            return res.status(400).json({ error: 'target must be greater than 0' });
        }

        const database = getDb();
        const created = {
            name: String(name).trim(),
            target: normalizedTarget,
            saved: Math.max(0, toAmount(saved)),
            userId
        };

        const docRef = await addDoc(collection(database, 'goals'), created);
        const responseBody = { id: docRef.id, ...created };
        completeIdempotentRequest(idempotencyContext, 201, responseBody);
        res.status(201).json(responseBody);
    } catch (error) {
        failIdempotentRequest(idempotencyContext);
        console.error('POST /api/goals failed:', error);
        res.status(500).json({ error: 'Failed to create goal' });
    }
});

app.patch('/api/goals/:id', async (req, res) => {
    const idempotencyContext = consumeIdempotency(req, res);
    if (idempotencyContext === null) return;

    try {
        beginIdempotentRequest(idempotencyContext);

        const { id } = req.params;
        const database = getDb();
        const userId = getUserId(req);
        const ref = doc(database, 'goals', id);
        const existing = await getDoc(ref);

        if (!existing.exists() || existing.data().userId !== userId) {
            return res.status(404).json({ error: 'Goal not found' });
        }

        const patch = { ...req.body };
        if (patch.target !== undefined) patch.target = toAmount(patch.target);
        if (patch.saved !== undefined) patch.saved = Math.max(0, toAmount(patch.saved));

        await updateDoc(ref, patch);
        const responseBody = { id, ...patch };
        completeIdempotentRequest(idempotencyContext, 200, responseBody);
        res.status(200).json(responseBody);
    } catch (error) {
        failIdempotentRequest(idempotencyContext);
        console.error('PATCH /api/goals/:id failed:', error);
        res.status(500).json({ error: 'Failed to update goal' });
    }
});

app.delete('/api/goals/:id', async (req, res) => {
    const idempotencyContext = consumeIdempotency(req, res);
    if (idempotencyContext === null) return;

    try {
        beginIdempotentRequest(idempotencyContext);

        const { id } = req.params;
        const database = getDb();
        const userId = getUserId(req);
        const ref = doc(database, 'goals', id);
        const existing = await getDoc(ref);

        if (!existing.exists() || existing.data().userId !== userId) {
            return res.status(404).json({ error: 'Goal not found' });
        }

        await deleteDoc(ref);
        const responseBody = { id };
        completeIdempotentRequest(idempotencyContext, 200, responseBody);
        res.status(200).json(responseBody);
    } catch (error) {
        failIdempotentRequest(idempotencyContext);
        console.error('DELETE /api/goals/:id failed:', error);
        res.status(500).json({ error: 'Failed to delete goal' });
    }
});

// GET user budget
app.get('/api/budget', async (req, res) => {
    try {
        const database = getDb();
        const headerUserId = req.get('x-ft-user-id');
        const queryUserId = req.query?.userId;
        const userId = (headerUserId && String(headerUserId).trim())
            || (queryUserId && String(queryUserId).trim());

        if (!userId) {
            return res.status(200).json({ amount: 0 });
        }

        const ref = doc(database, 'budgets', userId);
        const snapshot = await getDoc(ref);

        if (!snapshot.exists()) {
            return res.status(200).json({ amount: 0 });
        }

        res.status(200).json(snapshot.data());
    } catch (error) {
        console.error('GET /api/budget failed:', error);
        res.status(500).json({ error: error.message || 'Failed to load budget' });
    }
});

// POST user budget
app.post('/api/budget', async (req, res) => {
    const idempotencyContext = consumeIdempotency(req, res);
    if (idempotencyContext === null) return;

    try {
        beginIdempotentRequest(idempotencyContext);

        const database = getDb();
        const { amount, userId: bodyUserId } = req.body || {};
        const queryUserId = req.query?.userId;
        const headerUserId = req.get('x-ft-user-id');

        // Resolve userId from header, body, or query param
        const userId = (headerUserId && String(headerUserId).trim())
            || (bodyUserId && String(bodyUserId).trim())
            || (queryUserId && String(queryUserId).trim());

        if (!userId) {
            return res.status(401).json({ error: 'User ID is missing' });
        }

        const normalizedAmount = toAmount(amount);
        const ref = doc(database, 'budgets', userId);

        const data = {
            amount: Math.max(0, normalizedAmount),
            userId,
            updatedAt: new Date().toISOString()
        };

        // Use the setDoc already imported at the top of server.js
        await setDoc(ref, data, { merge: true });

        completeIdempotentRequest(idempotencyContext, 200, data);
        res.status(200).json(data);
    } catch (error) {
        failIdempotentRequest(idempotencyContext);
        console.error('POST /api/budget failed:', error);
        res.status(500).json({ error: error.message || 'Failed to save budget' });
    }
});

// Safe client-side Firebase configuration endpoint
app.get('/api/config', (req, res) => {
    res.json({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID
    });
});

module.exports = app;

if (require.main === module) {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}