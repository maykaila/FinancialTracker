import { API } from './api.js';

const State = {
    transactions: [],
    goals: [],
    filterMode: 'all',
    selectedMonthYear: '',
    pendingDelete: { type: null, id: null }
};

const Utils = {
    // Exact two-decimal arithmetic to eliminate floating-point precision drift
    add: (a, b) => Math.round((Number(a || 0) + Number(b || 0)) * 100) / 100,
    sub: (a, b) => Math.round((Number(a || 0) - Number(b || 0)) * 100) / 100,

    formatCurrency: (n) => {
        const num = Number(n || 0);
        const absVal = Math.abs(num);
        const formatted = '₱' + absVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return num < 0 ? `-${formatted}` : formatted;
    },

    sanitizeNumber: (val) => {
        const num = parseFloat(val);
        return isNaN(num) || !isFinite(num) ? 0 : Math.round(num * 100) / 100;
    }
};

window.openModal = (id) => document.getElementById(id).classList.add('active');
window.closeModal = (id) => document.getElementById(id).classList.remove('active');

window.showAlert = function(title, message) {
    document.getElementById('alert-modal-title').textContent = title;
    document.getElementById('alert-modal-msg').textContent = message;
    openModal('alert-modal');
};

async function initApp() {
    const periodModeSelect = document.getElementById('period-mode-select');
    const filterInput = document.getElementById('month-year-filter');

    if (!State.filterMode) State.filterMode = 'all';
    periodModeSelect.value = State.filterMode;

    const now = new Date();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    filterInput.value = `${now.getFullYear()}-${currentMonth}`;
    if (!State.selectedMonthYear) State.selectedMonthYear = filterInput.value;

    const [txData, goalsData] = await Promise.all([
        API.getTransactions(),
        API.getGoals()
    ]);
    State.transactions = txData || [];
    State.goals = goalsData || [];

    renderAll();
}

// Period Filter Listeners
document.getElementById('period-mode-select').addEventListener('change', (e) => {
    State.filterMode = e.target.value;
    const filterInput = document.getElementById('month-year-filter');

    if (State.filterMode === 'month') {
        filterInput.style.display = 'inline-block';
        State.selectedMonthYear = filterInput.value;
    } else {
        filterInput.style.display = 'none';
        State.selectedMonthYear = '';
    }
    renderAll();
});

document.getElementById('month-year-filter').addEventListener('change', (e) => {
    State.selectedMonthYear = e.target.value;
    renderAll();
});

function renderAll() {
    renderTransactions();
    renderGoals();
    populateGoalDropdown();
}

function renderTransactions() {
    const tbody = document.getElementById('transaction-tbody');
    tbody.innerHTML = '';

    const totals = { income: 0, spending: 0, savings: 0, investments: 0, protection: 0 };

    const filteredTx = State.transactions.filter(t => {
        if (State.filterMode === 'all' || !State.selectedMonthYear) return true;
        const txDate = new Date(t.date || Date.now());
        const txMonth = String(txDate.getMonth() + 1).padStart(2, '0');
        const txYearMonth = `${txDate.getFullYear()}-${txMonth}`;
        return txYearMonth === State.selectedMonthYear;
    });

    if (filteredTx.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#9c9288; padding:20px;">No entries logged for this period.</td></tr>`;
    } else {
        const fragment = document.createDocumentFragment();
        filteredTx.forEach(t => {
            const amt = Utils.sanitizeNumber(t.amount);
            if (totals[t.account] !== undefined) {
                totals[t.account] = Utils.add(totals[t.account], amt);
            }

            const tr = document.createElement('tr');
            const dateStr = new Date(t.date || Date.now()).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
            tr.innerHTML = `
                <td>${dateStr}</td>
                <td>${t.description}</td>
                <td><span class="badge-pill ${t.account}">${t.account}</span></td>
                <td><span class="method-badge">${t.method || 'Cash'}</span></td>
                <td class="text-right">${Utils.formatCurrency(amt)}</td>
                <td class="text-center">
                    <div class="kebab-container">
                        <button type="button" class="kebab-btn" onclick="toggleKebab(event, '${t.id}')">⋮</button>
                        <div id="kebab-${t.id}" class="kebab-dropdown">
                            <button type="button" class="kebab-item" onclick="startEditTx('${t.id}')">Edit</button>
                            <button type="button" class="kebab-item delete-item" onclick="promptDelete('tx', '${t.id}')">Delete</button>
                        </div>
                    </div>
                </td>
            `;
            fragment.appendChild(tr);
        });
        tbody.appendChild(fragment);
    }

    // Top Metric Badges
    document.getElementById('total-income').textContent = Utils.formatCurrency(totals.income);
    document.getElementById('total-spending').textContent = Utils.formatCurrency(totals.spending);
    document.getElementById('total-savings').textContent = Utils.formatCurrency(totals.savings);
    document.getElementById('total-investments').textContent = Utils.formatCurrency(totals.investments);
    document.getElementById('total-protection').textContent = Utils.formatCurrency(totals.protection);

    // Summary Calculations
    const totalAssets = Utils.add(totals.savings, totals.investments);
    const totalOutflow = Utils.add(totals.spending, totals.protection);
    const balance = Utils.sub(totals.income, Utils.add(totalOutflow, totalAssets));

    document.getElementById('summary-income').textContent = Utils.formatCurrency(totals.income);
    document.getElementById('summary-spending').textContent = Utils.formatCurrency(totals.spending);
    document.getElementById('summary-protection').textContent = Utils.formatCurrency(totals.protection);
    document.getElementById('summary-assets').textContent = Utils.formatCurrency(totalAssets);
    
    const balanceEl = document.getElementById('summary-balance');
    const balanceRow = document.getElementById('summary-balance-row');
    balanceEl.textContent = Utils.formatCurrency(balance);

    balanceRow.classList.remove('balance-positive', 'balance-negative');
    if (balance < 0) {
        balanceRow.classList.add('balance-negative');
    } else {
        balanceRow.classList.add('balance-positive');
    }

    ChartManager.update(totals);
}

function renderGoals() {
    const container = document.getElementById('goals-list-container');
    container.innerHTML = '';

    let totalTarget = 0;
    let totalSaved = 0;

    if (State.goals.length === 0) {
        container.innerHTML = '<p style="font-size:11.5px; color:#8c8278; text-align:center; padding:10px 0;">No savings vaults active.</p>';
    } else {
        const fragment = document.createDocumentFragment();
        State.goals.forEach(g => {
            const gTarget = Utils.sanitizeNumber(g.target);
            const gSaved = Utils.sanitizeNumber(g.saved);

            totalTarget = Utils.add(totalTarget, gTarget);
            totalSaved = Utils.add(totalSaved, gSaved);
            const percent = gTarget > 0 ? Math.min(100, Math.round((gSaved / gTarget) * 100)) : 0;

            const card = document.createElement('div');
            card.className = 'goal-vault-item';
            card.innerHTML = `
                <div class="goal-header-row">
                    <span>${g.name}</span>
                    <div class="goal-actions">
                        <button type="button" class="action-btn withdraw" onclick="openWithdrawGoalModal('${g.id}')" title="Withdraw / Spend from Vault">−</button>
                        <button type="button" class="action-btn edit" onclick="openEditGoalTarget('${g.id}')" title="Edit Target">
                            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                        </button>
                        <button type="button" class="action-btn delete" onclick="promptDelete('goal', '${g.id}')" title="Delete Goal">
                            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        </button>
                    </div>
                </div>
                <div class="progress-labels" style="font-size:10px;">
                    <span>${Utils.formatCurrency(gSaved)} / ${Utils.formatCurrency(gTarget)}</span>
                    <span>${percent}%</span>
                </div>
                <div class="progress-track" style="height:8px;">
                    <div class="progress-fill" style="width: ${percent}%;"></div>
                </div>
            `;
            fragment.appendChild(card);
        });
        container.appendChild(fragment);
    }

    const overallPercent = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;
    document.getElementById('all-goals-bar').style.width = `${overallPercent}%`;
    document.getElementById('all-goals-percent').textContent = `${overallPercent}% (${Utils.formatCurrency(totalSaved)} / ${Utils.formatCurrency(totalTarget)})`;
}

function populateGoalDropdown() {
    const select = document.getElementById('savings-goal-select');
    select.innerHTML = '<option value="">-- Choose a Goal Vault --</option>';
    State.goals.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name;
        select.appendChild(opt);
    });
}

// UI Dropdowns & Kebab Actions
document.getElementById('account').addEventListener('change', (e) => {
    const group = document.getElementById('savings-goal-select-group');
    group.style.display = e.target.value === 'savings' ? 'block' : 'none';
    if (e.target.value !== 'savings') document.getElementById('savings-goal-select').value = '';
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.kebab-container')) {
        document.querySelectorAll('.kebab-dropdown.show').forEach(d => d.classList.remove('show'));
    }
});

window.toggleKebab = (e, id) => {
    e.stopPropagation();
    document.querySelectorAll('.kebab-dropdown.show').forEach(d => {
        if (d.id !== `kebab-${id}`) d.classList.remove('show');
    });
    document.getElementById(`kebab-${id}`).classList.toggle('show');
};

// Main Transaction Form Submit with Goal Synchronization
document.getElementById('transaction-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('tx-submit-btn');
    const accountVal = document.getElementById('account').value;
    const selectedGoalId = document.getElementById('savings-goal-select').value;
    const amountVal = Utils.sanitizeNumber(document.getElementById('amount').value);

    if (amountVal <= 0) {
        showAlert('Invalid Amount', 'Please enter an amount greater than ₱0.00.');
        return;
    }

    if (accountVal === 'savings') {
        if (State.goals.length === 0) {
            showAlert('No Existing Goals', 'You do not have any active Savings Goals. Please create a goal vault first.');
            return;
        }
        if (!selectedGoalId) {
            showAlert('No Goal Chosen', 'Please select which savings goal vault you would like to allocate this deposit to.');
            return;
        }
    }

    btn.disabled = true;
    const editId = document.getElementById('edit-tx-id').value;
    const payload = {
        description: document.getElementById('description').value.trim(),
        account: accountVal,
        method: document.getElementById('method').value,
        amount: amountVal,
        goalId: selectedGoalId || null
    };

    try {
        if (editId) {
            const oldTx = State.transactions.find(t => t.id === editId);

            // Revert old transaction's impact on goal vault
            if (oldTx && oldTx.goalId) {
                const oldGoal = State.goals.find(g => g.id === oldTx.goalId);
                if (oldGoal) {
                    let revertedSaved = Utils.sanitizeNumber(oldGoal.saved);
                    const oldAmount = Utils.sanitizeNumber(oldTx.amount);

                    if (oldTx.account === 'savings') {
                        revertedSaved = Math.max(0, Utils.sub(revertedSaved, oldAmount));
                    } else if (oldTx.isWithdrawal || oldTx.account === 'spending') {
                        revertedSaved = Utils.add(revertedSaved, oldAmount);
                    }
                    await API.updateGoal(oldGoal.id, { saved: revertedSaved });
                }
            }

            if (oldTx && oldTx.isWithdrawal && payload.account === 'spending') {
                payload.isWithdrawal = true;
            }

            await API.updateTransaction(editId, payload);

            // Apply new transaction's impact on goal vault
            if (payload.goalId) {
                const newGoal = State.goals.find(g => g.id === payload.goalId);
                if (newGoal) {
                    let currentSaved = Utils.sanitizeNumber(newGoal.saved);
                    if (oldTx && oldTx.goalId === payload.goalId) {
                        if (oldTx.account === 'savings') currentSaved = Math.max(0, Utils.sub(currentSaved, oldTx.amount));
                        if (oldTx.isWithdrawal || oldTx.account === 'spending') currentSaved = Utils.add(currentSaved, oldTx.amount);
                    }

                    if (accountVal === 'savings') {
                        currentSaved = Utils.add(currentSaved, amountVal);
                    } else if (payload.isWithdrawal || accountVal === 'spending') {
                        currentSaved = Math.max(0, Utils.sub(currentSaved, amountVal));
                    }
                    await API.updateGoal(newGoal.id, { saved: currentSaved });
                }
            }
        } else {
            await API.addTransaction(payload);
            if (accountVal === 'savings' && selectedGoalId) {
                const goal = State.goals.find(g => g.id === selectedGoalId);
                if (goal) {
                    await API.updateGoal(goal.id, { saved: Utils.add(goal.saved || 0, amountVal) });
                }
            }
        }
        resetTxForm();
        await initApp();
    } finally {
        btn.disabled = false;
    }
});

window.startEditTx = (id) => {
    const tx = State.transactions.find(t => t.id === id);
    if (!tx) return;

    document.getElementById('edit-tx-id').value = tx.id;
    document.getElementById('description').value = tx.description;
    document.getElementById('account').value = tx.account;
    document.getElementById('method').value = tx.method || 'Cash';
    document.getElementById('amount').value = tx.amount;

    const group = document.getElementById('savings-goal-select-group');
    group.style.display = tx.account === 'savings' ? 'block' : 'none';
    document.getElementById('savings-goal-select').value = tx.goalId || '';

    document.getElementById('tx-form-title').textContent = 'EDIT TRANSACTION';
    document.getElementById('tx-submit-btn').textContent = 'Save Changes';
    document.getElementById('tx-cancel-btn').style.display = 'block';
};

function resetTxForm() {
    document.getElementById('transaction-form').reset();
    document.getElementById('edit-tx-id').value = '';
    document.getElementById('savings-goal-select-group').style.display = 'none';
    document.getElementById('tx-form-title').textContent = 'LOG TRANSACTION';
    document.getElementById('tx-submit-btn').textContent = 'Save Entry ♡';
    document.getElementById('tx-cancel-btn').style.display = 'none';
}
document.getElementById('tx-cancel-btn').addEventListener('click', resetTxForm);

// Add Goal Form
document.getElementById('open-add-goal-btn').addEventListener('click', () => openModal('add-goal-modal'));
document.getElementById('add-goal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const target = Utils.sanitizeNumber(document.getElementById('new-goal-target').value);
    const saved = Utils.sanitizeNumber(document.getElementById('new-goal-saved').value);

    if (target <= 0) {
        showAlert('Invalid Target', 'Goal target amount must be greater than ₱0.00.');
        return;
    }

    const payload = {
        name: document.getElementById('new-goal-name').value.trim(),
        target,
        saved: Math.max(0, saved)
    };
    await API.addGoal(payload);
    document.getElementById('add-goal-form').reset();
    closeModal('add-goal-modal');
    await initApp();
});

// Edit Goal Target
window.openEditGoalTarget = (id) => {
    const goal = State.goals.find(g => g.id === id);
    if (!goal) return;
    document.getElementById('edit-goal-id').value = goal.id;
    document.getElementById('edit-goal-title').textContent = `Edit Target: ${goal.name}`;
    document.getElementById('edit-goal-target').value = goal.target;
    openModal('edit-goal-modal');
};

document.getElementById('edit-goal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-goal-id').value;
    const target = Utils.sanitizeNumber(document.getElementById('edit-goal-target').value);

    if (target <= 0) {
        showAlert('Invalid Target', 'Goal target must be greater than ₱0.00.');
        return;
    }

    await API.updateGoal(id, { target });
    closeModal('edit-goal-modal');
    await initApp();
});

// Withdraw from Goal
window.openWithdrawGoalModal = (id) => {
    const goal = State.goals.find(g => g.id === id);
    if (!goal) return;

    document.getElementById('withdraw-goal-id').value = goal.id;
    document.getElementById('withdraw-goal-title').textContent = `Withdraw: ${goal.name}`;
    document.getElementById('withdraw-goal-avail').textContent = `Available in vault: ${Utils.formatCurrency(goal.saved || 0)}`;
    document.getElementById('withdraw-amount').value = '';
    document.getElementById('withdraw-reason').value = `Spent from ${goal.name}`;
    openModal('withdraw-goal-modal');
};

document.getElementById('withdraw-goal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('withdraw-goal-id').value;
    const goal = State.goals.find(g => g.id === id);
    if (!goal) return;

    const amountToWithdraw = Utils.sanitizeNumber(document.getElementById('withdraw-amount').value);
    const method = document.getElementById('withdraw-method').value;
    const reason = document.getElementById('withdraw-reason').value.trim();
    const currentSaved = Utils.sanitizeNumber(goal.saved);

    if (amountToWithdraw <= 0) {
        showAlert('Invalid Amount', 'Withdrawal amount must be greater than ₱0.00.');
        return;
    }

    if (amountToWithdraw > currentSaved) {
        showAlert('Insufficient Vault Funds', `This vault only has ${Utils.formatCurrency(currentSaved)} available.`);
        return;
    }

    // Decrement Goal Vault
    const newSaved = Math.max(0, Utils.sub(currentSaved, amountToWithdraw));
    await API.updateGoal(goal.id, { saved: newSaved });

    // Auto-log as spending with isWithdrawal tag
    await API.addTransaction({
        description: reason || `Spent from ${goal.name}`,
        account: 'spending',
        method: method,
        amount: amountToWithdraw,
        goalId: goal.id,
        isWithdrawal: true
    });

    document.getElementById('withdraw-goal-form').reset();
    closeModal('withdraw-goal-modal');
    await initApp();
});

// Delete Record Handling with Goal Vault Refund & Cascading
window.promptDelete = (type, id) => {
    State.pendingDelete = { type, id };
    document.getElementById('delete-modal-msg').textContent =
        type === 'tx' ? 'Are you sure you want to delete this transaction record?' : 'Are you sure you want to delete this savings goal vault?';
    openModal('delete-modal');
};

document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    const { type, id } = State.pendingDelete;

    if (type === 'tx') {
        const txToDelete = State.transactions.find(t => t.id === id);

        if (txToDelete && txToDelete.goalId) {
            const goal = State.goals.find(g => g.id === txToDelete.goalId);
            if (goal) {
                let updatedSaved = Utils.sanitizeNumber(goal.saved);
                const txAmount = Utils.sanitizeNumber(txToDelete.amount);

                if (txToDelete.account === 'savings') {
                    // Deleting a deposit decreases the vault balance
                    updatedSaved = Math.max(0, Utils.sub(updatedSaved, txAmount));
                } else if (txToDelete.isWithdrawal || txToDelete.account === 'spending') {
                    // Deleting a withdrawal refunds the vault balance
                    updatedSaved = Utils.add(updatedSaved, txAmount);
                }

                await API.updateGoal(goal.id, { saved: updatedSaved });
            }
        }
        await API.deleteTransaction(id);
    }

    if (type === 'goal') {
        // Detach goal references from existing transactions so they are not orphaned
        const linkedTransactions = State.transactions.filter(t => t.goalId === id);
        for (const tx of linkedTransactions) {
            await API.updateTransaction(tx.id, { goalId: null });
        }
        await API.deleteGoal(id);
    }

    closeModal('delete-modal');
    State.pendingDelete = { type: null, id: null };
    await initApp();
});

initApp();