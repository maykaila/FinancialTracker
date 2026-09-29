require('dotenv').config();
const express = require('express');
const path = require('path');
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
    try {
        const { description, account, method, amount, goalId = null, isWithdrawal = false } = req.body || {};
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
            goalId,
            isWithdrawal: Boolean(isWithdrawal),
            userId,
            date: new Date().toISOString()
        };

        const docRef = await addDoc(collection(database, 'transactions'), created);
        res.status(201).json({ id: docRef.id, ...created });
    } catch (error) {
        console.error('POST /api/transactions failed:', error);
        res.status(500).json({ error: 'Failed to create transaction' });
    }
});

app.patch('/api/transactions/:id', async (req, res) => {
    try {
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
        res.status(200).json({ id, ...patch });
    } catch (error) {
        console.error('PATCH /api/transactions/:id failed:', error);
        res.status(500).json({ error: 'Failed to update transaction' });
    }
});

app.delete('/api/transactions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const database = getDb();
        const userId = getUserId(req);
        const ref = doc(database, 'transactions', id);
        const existing = await getDoc(ref);

        if (!existing.exists() || existing.data().userId !== userId) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        await deleteDoc(ref);
        res.status(200).json({ id });
    } catch (error) {
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
    try {
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
        res.status(201).json({ id: docRef.id, ...created });
    } catch (error) {
        console.error('POST /api/goals failed:', error);
        res.status(500).json({ error: 'Failed to create goal' });
    }
});

app.patch('/api/goals/:id', async (req, res) => {
    try {
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
        res.status(200).json({ id, ...patch });
    } catch (error) {
        console.error('PATCH /api/goals/:id failed:', error);
        res.status(500).json({ error: 'Failed to update goal' });
    }
});

app.delete('/api/goals/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const database = getDb();
        const userId = getUserId(req);
        const ref = doc(database, 'goals', id);
        const existing = await getDoc(ref);

        if (!existing.exists() || existing.data().userId !== userId) {
            return res.status(404).json({ error: 'Goal not found' });
        }

        await deleteDoc(ref);
        res.status(200).json({ id });
    } catch (error) {
        console.error('DELETE /api/goals/:id failed:', error);
        res.status(500).json({ error: 'Failed to delete goal' });
    }
});

// GET user budget
app.get('/api/budget', async (req, res) => {
    try {
        const database = getDb();
        const userId = getUserId(req);
        const ref = doc(database, 'budgets', userId);
        const snapshot = await getDoc(ref);

        if (!snapshot.exists()) {
            return res.status(200).json({ amount: 0 });
        }

        res.status(200).json(snapshot.data());
    } catch (error) {
        console.error('GET /api/budget failed:', error);
        res.status(500).json({ error: 'Failed to load budget' });
    }
});

// POST/PUT user budget
app.post('/api/budget', async (req, res) => {
    try {
        const database = getDb();
        const userId = getUserId(req);
        const { amount } = req.body || {};

        const normalizedAmount = toAmount(amount);
        const ref = doc(database, 'budgets', userId);

        const data = {
            amount: Math.max(0, normalizedAmount),
            userId,
            updatedAt: new Date().toISOString()
        };

        // setDoc with merge: true creates or updates the user's document
        const { setDoc } = require('firebase/firestore');
        await setDoc(ref, data, { merge: true });

        res.status(200).json(data);
    } catch (error) {
        console.error('POST /api/budget failed:', error);
        res.status(500).json({ error: 'Failed to save budget' });
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