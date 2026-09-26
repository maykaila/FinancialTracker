require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs/promises');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TRANSACTIONS_PATH = path.join(DATA_DIR, 'transactions.json');
const GOALS_PATH = path.join(DATA_DIR, 'goals.json');

app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

async function readJson(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content || '[]');
}

async function writeJson(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function toAmount(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

app.get('/api/transactions', async (_req, res) => {
    try {
        const transactions = await readJson(TRANSACTIONS_PATH);
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

        if (!description || !account || !method || amount === undefined) {
            return res.status(400).json({ error: 'description, account, method, and amount are required' });
        }

        const normalizedAmount = toAmount(amount);
        if (normalizedAmount <= 0) {
            return res.status(400).json({ error: 'amount must be greater than 0' });
        }

        const transactions = await readJson(TRANSACTIONS_PATH);
        const created = {
            id: String(Date.now()),
            description: String(description).trim(),
            account,
            method,
            amount: normalizedAmount,
            goalId,
            isWithdrawal: Boolean(isWithdrawal),
            date: new Date().toISOString()
        };

        transactions.unshift(created);
        await writeJson(TRANSACTIONS_PATH, transactions);
        res.status(201).json(created);
    } catch (error) {
        console.error('POST /api/transactions failed:', error);
        res.status(500).json({ error: 'Failed to create transaction' });
    }
});

app.patch('/api/transactions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const transactions = await readJson(TRANSACTIONS_PATH);
        const idx = transactions.findIndex((tx) => tx.id === id);

        if (idx === -1) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        const patch = { ...req.body };
        if (patch.amount !== undefined) {
            patch.amount = toAmount(patch.amount);
        }

        transactions[idx] = {
            ...transactions[idx],
            ...patch
        };

        await writeJson(TRANSACTIONS_PATH, transactions);
        res.status(200).json(transactions[idx]);
    } catch (error) {
        console.error('PATCH /api/transactions/:id failed:', error);
        res.status(500).json({ error: 'Failed to update transaction' });
    }
});

app.delete('/api/transactions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const transactions = await readJson(TRANSACTIONS_PATH);
        const filtered = transactions.filter((tx) => tx.id !== id);

        if (filtered.length === transactions.length) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        await writeJson(TRANSACTIONS_PATH, filtered);
        res.status(200).json({ id });
    } catch (error) {
        console.error('DELETE /api/transactions/:id failed:', error);
        res.status(500).json({ error: 'Failed to delete transaction' });
    }
});

app.get('/api/goals', async (_req, res) => {
    try {
        const goals = await readJson(GOALS_PATH);
        res.status(200).json(goals);
    } catch (error) {
        console.error('GET /api/goals failed:', error);
        res.status(500).json({ error: 'Failed to load goals' });
    }
});

app.post('/api/goals', async (req, res) => {
    try {
        const { name, target, saved = 0 } = req.body || {};
        if (!name || target === undefined) {
            return res.status(400).json({ error: 'name and target are required' });
        }

        const normalizedTarget = toAmount(target);
        if (normalizedTarget <= 0) {
            return res.status(400).json({ error: 'target must be greater than 0' });
        }

        const goals = await readJson(GOALS_PATH);
        const created = {
            id: String(Date.now()),
            name: String(name).trim(),
            target: normalizedTarget,
            saved: Math.max(0, toAmount(saved))
        };

        goals.push(created);
        await writeJson(GOALS_PATH, goals);
        res.status(201).json(created);
    } catch (error) {
        console.error('POST /api/goals failed:', error);
        res.status(500).json({ error: 'Failed to create goal' });
    }
});

app.patch('/api/goals/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const goals = await readJson(GOALS_PATH);
        const idx = goals.findIndex((goal) => goal.id === id);

        if (idx === -1) {
            return res.status(404).json({ error: 'Goal not found' });
        }

        const patch = { ...req.body };
        if (patch.target !== undefined) patch.target = toAmount(patch.target);
        if (patch.saved !== undefined) patch.saved = Math.max(0, toAmount(patch.saved));

        goals[idx] = {
            ...goals[idx],
            ...patch
        };

        await writeJson(GOALS_PATH, goals);
        res.status(200).json(goals[idx]);
    } catch (error) {
        console.error('PATCH /api/goals/:id failed:', error);
        res.status(500).json({ error: 'Failed to update goal' });
    }
});

app.delete('/api/goals/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const goals = await readJson(GOALS_PATH);
        const filtered = goals.filter((goal) => goal.id !== id);

        if (filtered.length === goals.length) {
            return res.status(404).json({ error: 'Goal not found' });
        }

        await writeJson(GOALS_PATH, filtered);
        res.status(200).json({ id });
    } catch (error) {
        console.error('DELETE /api/goals/:id failed:', error);
        res.status(500).json({ error: 'Failed to delete goal' });
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

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));