import { API } from './api.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// Instant synchronous name render from cache to avoid "Loading..." flash
const cachedName = localStorage.getItem('ft_cached_name');
const userNameEl = document.getElementById('user-display-name');
if (userNameEl && cachedName) {
    userNameEl.textContent = cachedName;
}

let currentUser = null;
const ActionLocks = new Set();
let hasBoundLogoutHandlers = false;
let initializedUserId = null;
let slowConnectionTimer = null;

// Initialize Auth & Protect Route
async function initAuthProtection() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        const app = initializeApp(config);
        const auth = getAuth(app);
        

        bindLogoutHandlers(auth);

        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                initializedUserId = null;
                localStorage.removeItem('ft_cached_name');
                window.location.href = '/auth.html';
                return;
            }

            currentUser = user;
            API.setUserId(user.uid);

            // Authoritative display name update and cache refresh
            const finalName = user.displayName || user.email.split('@')[0];
            localStorage.setItem('ft_cached_name', finalName);
            if (userNameEl) {
                userNameEl.textContent = finalName;
            }

            // Load app data for authenticated user
            if (initializedUserId !== user.uid) {
                initializedUserId = user.uid;
                await initApp();
            }
        });
    } catch (err) {
        console.error("Auth guard error:", err);
    }
}

function bindLogoutHandlers(auth) {
    if (hasBoundLogoutHandlers) return;

    const logoutBtn = document.getElementById('logout-btn');
    const confirmLogoutBtn = document.getElementById('confirm-logout-btn');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            openModal('logout-modal');
        });
    }

    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener('click', async () => {
            if (ActionLocks.has('logout')) return;
            ActionLocks.add('logout');

            try {
                closeModal('logout-modal');
                localStorage.removeItem('ft_cached_name');
                await signOut(auth);
                window.location.href = '/auth.html';
            } finally {
                ActionLocks.delete('logout');
            }
        });
    }

    hasBoundLogoutHandlers = true;
}

initAuthProtection();

const State = {
    transactions: [],
    budget: 0,
    isBudgetEditing: false,
    filterMode: 'all',
    selectedMonthYear: '',
    pendingDelete: { type: null, id: null },
    lastDisplayTotals: { income: 0, spending: 0, savings: 0, investments: 0, protection: 0 },
    lastMonthlyTotals: { income: 0, spending: 0, savings: 0, investments: 0, protection: 0 }
};

const Utils = {
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
    },

    parseTxDate: (val) => {
        if (!val) return new Date();
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
            const [y, m, d] = val.split('-').map(Number);
            return new Date(y, m - 1, d);
        }
        const parsed = new Date(val);
        return isNaN(parsed.getTime()) ? new Date() : parsed;
    },

    toDateInputValue: (val) => {
        const d = Utils.parseTxDate(val);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
};

function formatProgressPercent(percent) {
    const value = Number(percent || 0);
    if (value > 0 && value < 5) {
        return `${value.toFixed(1)}%`;
    }
    return `${Math.round(value)}%`;
}

function getCurrentMonthYear() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getActiveMonthYear() {
    const filterInput = document.getElementById('month-year-filter');
    if (State.filterMode === 'month' && State.selectedMonthYear) {
        return State.selectedMonthYear;
    }
    if (filterInput?.value) {
        return filterInput.value;
    }
    return getCurrentMonthYear();
}

function filterTransactionsByMonthYear(transactions, monthYear) {
    return transactions.filter(t => {
        const txDate = Utils.parseTxDate(t.date);
        const txMonth = String(txDate.getMonth() + 1).padStart(2, '0');
        const txYearMonth = `${txDate.getFullYear()}-${txMonth}`;
        return txYearMonth === monthYear;
    });
}

function computeTotals(transactions) {
    return transactions.reduce((acc, t) => {
        const amt = Utils.sanitizeNumber(t.amount);
        if (acc[t.account] !== undefined) {
            acc[t.account] = Utils.add(acc[t.account], amt);
        }

        // Spending entries created from vault withdrawals should also reduce net savings balance.
        if (t.isWithdrawal) {
            acc.savings = Utils.sub(acc.savings, amt);
        }

        return acc;
    }, { income: 0, spending: 0, savings: 0, investments: 0, protection: 0 });
}

window.openModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
};

window.closeModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
};

window.showAlert = function(title, message) {
    document.getElementById('alert-modal-title').textContent = title;
    document.getElementById('alert-modal-msg').textContent = message;
    openModal('alert-modal');
};

function skeletonLine(width) {
    return `<span class="skeleton-line" style="width:${width};"></span>`;
}

function setLoadingNotice(message = '', persistMs = 0) {
    const noticeEl = document.getElementById('loading-connection-msg');
    if (!noticeEl) return;

    if (!message) {
        noticeEl.textContent = '';
        noticeEl.style.display = 'none';
        return;
    }

    noticeEl.textContent = message;
    noticeEl.style.display = 'block';

    if (persistMs > 0) {
        window.setTimeout(() => {
            noticeEl.style.display = 'none';
        }, persistMs);
    }
}

function renderLoadingSkeleton() {
    const metricWidths = {
        'total-income': '110px',
        'total-spending': '110px',
        'total-savings': '110px',
        'total-investments': '110px',
        'total-protection': '110px'
    };

    Object.entries(metricWidths).forEach(([id, width]) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = skeletonLine(width);
    });

    const summaryTargets = ['summary-income', 'summary-spending', 'summary-protection', 'summary-assets', 'summary-balance'];
    summaryTargets.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = skeletonLine('88px');
    });

    const budgetTarget = document.getElementById('budget-display-target');
    const budgetSpent = document.getElementById('budget-display-spent');
    const budgetPercent = document.getElementById('budget-spent-percent');
    const budgetStatus = document.getElementById('budget-status-text');
    const budgetBar = document.getElementById('budget-progress-bar');

    if (budgetTarget) budgetTarget.innerHTML = skeletonLine('90px');
    if (budgetSpent) budgetSpent.innerHTML = skeletonLine('90px');
    if (budgetPercent) budgetPercent.innerHTML = skeletonLine('36px');
    if (budgetStatus) budgetStatus.innerHTML = skeletonLine('124px');
    if (budgetBar) budgetBar.style.width = '28%';

    const tbody = document.getElementById('transaction-tbody');
    if (tbody) {
        tbody.innerHTML = '';
        const rows = Array.from({ length: 6 }).map(() => `
            <tr class="skeleton-row">
                <td>${skeletonLine('40px')}</td>
                <td>${skeletonLine('180px')}</td>
                <td>${skeletonLine('76px')}</td>
                <td class="text-right">${skeletonLine('84px')}</td>
                <td class="text-center">${skeletonLine('22px')}</td>
            </tr>
        `).join('');
        tbody.innerHTML = rows;
    }
}

function setLoadingState(isLoading) {
    const appRoot = document.querySelector('.planner-app');
    if (appRoot) {
        appRoot.classList.toggle('is-loading', isLoading);
    }

    if (isLoading) {
        renderLoadingSkeleton();
    }
}

async function initApp() {
    const periodModeSelect = document.getElementById('period-mode-select');
    const filterInput = document.getElementById('month-year-filter');

    if (periodModeSelect && !State.filterMode) State.filterMode = 'all';
    if (periodModeSelect) periodModeSelect.value = State.filterMode;

    const now = new Date();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    if (filterInput) {
        filterInput.value = `${now.getFullYear()}-${currentMonth}`;
        if (!State.selectedMonthYear) State.selectedMonthYear = filterInput.value;
    }



    try {
        setLoadingState(true);
        setLoadingNotice('');
        if (slowConnectionTimer) {
            clearTimeout(slowConnectionTimer);
        }
        slowConnectionTimer = setTimeout(() => {
            setLoadingNotice('Connection is slow. Still loading your records...');
        }, 1800);

        const [txData, budgetData] = await Promise.all([
            API.getTransactions().catch(() => []),
            API.getBudget().catch(() => ({ amount: 0 }))
        ]);
        State.transactions = txData || [];
        State.budget = budgetData?.amount || 0;
        renderAll();
    } catch (error) {
        console.error('Failed to initialize app data from API:', error);
        const hasExistingData = State.transactions.length > 0 || State.budget > 0;
        if (!hasExistingData) {
            State.transactions = [];
            State.budget = 0;
        }
        renderAll();
        setLoadingNotice('Unable to refresh data right now. Showing latest available values.', 5000);
        showAlert('Connection Error', 'Unable to load records right now. Please try again in a moment.');
    } finally {
        if (slowConnectionTimer) {
            clearTimeout(slowConnectionTimer);
            slowConnectionTimer = null;
        }
        setLoadingState(false);
        if (document.getElementById('loading-connection-msg')?.textContent === 'Connection is slow. Still loading your records...') {
            setLoadingNotice('');
        }
    }
}

// Period Filter Listeners
const periodSelect = document.getElementById('period-mode-select');
if (periodSelect) {
    periodSelect.addEventListener('change', (e) => {
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
}

const monthFilter = document.getElementById('month-year-filter');
if (monthFilter) {
    monthFilter.addEventListener('change', (e) => {
        State.selectedMonthYear = e.target.value;
        renderAll();
    });
}

function renderAll() {
    renderPeriodAwareCardTitles();
    renderTransactions();
}

function renderPeriodAwareCardTitles() {
    const summaryTag = document.getElementById('summary-card-tag');
    const budgetTag = document.getElementById('budget-card-tag');

    if (!summaryTag || !budgetTag) return;

    if (State.filterMode === 'all') {
        summaryTag.textContent = 'OVERALL SUMMARY';
        budgetTag.textContent = 'OVERALL BUDGET';
        return;
    }

    const monthValue = State.selectedMonthYear || document.getElementById('month-year-filter')?.value;
    if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) {
        summaryTag.textContent = 'MONTHLY SUMMARY';
        budgetTag.textContent = 'MONTHLY BUDGET';
        return;
    }

    const [yearStr, monthStr] = monthValue.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const refDate = new Date(year, month - 1, 1);
    const monthName = refDate.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();

    summaryTag.textContent = `${monthName} SUMMARY`;
    budgetTag.textContent = `${monthName} BUDGET`;
}

function renderTransactions() {
    const tbody = document.getElementById('transaction-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const filteredTx = State.transactions.filter(t => {
        if (State.filterMode === 'all' || !State.selectedMonthYear) return true;
        const txDate = Utils.parseTxDate(t.date);
        const txMonth = String(txDate.getMonth() + 1).padStart(2, '0');
        const txYearMonth = `${txDate.getFullYear()}-${txMonth}`;
        return txYearMonth === State.selectedMonthYear;
    });

    const activeMonthYear = getActiveMonthYear();
    const monthlyScopedTx = filterTransactionsByMonthYear(State.transactions, activeMonthYear);

    const displayTotals = computeTotals(filteredTx);
    const monthlyTotals = computeTotals(monthlyScopedTx);

    State.lastDisplayTotals = displayTotals;
    State.lastMonthlyTotals = monthlyTotals;

    if (filteredTx.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#9c9288; padding:20px;">No entries logged for this period.</td></tr>`;
    } else {
        const fragment = document.createDocumentFragment();
        filteredTx.forEach(t => {
            const amt = Utils.sanitizeNumber(t.amount);

            const tr = document.createElement('tr');
            const dateStr = Utils.parseTxDate(t.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
            tr.innerHTML = `
                <td>${dateStr}</td>
                <td>${t.description}</td>
                <td><span class="badge-pill ${t.account}">${t.account}</span></td>
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

    document.getElementById('total-income').textContent = Utils.formatCurrency(displayTotals.income);
    document.getElementById('total-spending').textContent = Utils.formatCurrency(displayTotals.spending);
    document.getElementById('total-savings').textContent = Utils.formatCurrency(displayTotals.savings);
    document.getElementById('total-investments').textContent = Utils.formatCurrency(displayTotals.investments);
    document.getElementById('total-protection').textContent = Utils.formatCurrency(displayTotals.protection);

    const summaryScopeTotals = State.filterMode === 'all' ? displayTotals : monthlyTotals;
    const totalAssets = Utils.add(summaryScopeTotals.savings, summaryScopeTotals.investments);
    const totalOutflow = Utils.add(summaryScopeTotals.spending, summaryScopeTotals.protection);
    const balance = Utils.sub(summaryScopeTotals.income, Utils.add(totalOutflow, totalAssets));

    document.getElementById('summary-income').textContent = Utils.formatCurrency(summaryScopeTotals.income);
    document.getElementById('summary-spending').textContent = Utils.formatCurrency(summaryScopeTotals.spending);
    document.getElementById('summary-protection').textContent = Utils.formatCurrency(summaryScopeTotals.protection);
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

    // Budget UI Calculations
    const budgetInput = document.getElementById('monthly-budget-input');
    const budgetSubmitBtn = document.querySelector('#budget-form button[type="submit"]');
    const budgetEditBtn = document.getElementById('budget-edit-btn');
    const hasBudgetSet = State.budget > 0;

    if (budgetInput) {
        budgetInput.disabled = hasBudgetSet && !State.isBudgetEditing;
        if (!budgetInput.matches(':focus')) {
            budgetInput.value = hasBudgetSet ? State.budget : '';
        }
    }

    if (budgetSubmitBtn) {
        budgetSubmitBtn.textContent = hasBudgetSet ? 'Save' : 'Set';
        budgetSubmitBtn.style.display = hasBudgetSet && !State.isBudgetEditing ? 'none' : 'inline-flex';
    }

    if (budgetEditBtn) {
        budgetEditBtn.style.display = hasBudgetSet ? 'inline-flex' : 'none';
        budgetEditBtn.textContent = State.isBudgetEditing ? 'Cancel' : 'Edit';
    }

    const budgetDisplayTarget = document.getElementById('budget-display-target');
    const budgetDisplaySpent = document.getElementById('budget-display-spent');
    const budgetStatusText = document.getElementById('budget-status-text');
    const budgetSpentPercent = document.getElementById('budget-spent-percent');
    const budgetBar = document.getElementById('budget-progress-bar');

    const budgetScopeTotals = computeTotals(State.transactions);

    if (budgetDisplayTarget) budgetDisplayTarget.textContent = Utils.formatCurrency(State.budget);
    if (budgetDisplaySpent) budgetDisplaySpent.textContent = Utils.formatCurrency(budgetScopeTotals.spending);

    const percentSpentRaw = State.budget > 0 ? Math.min(100, (budgetScopeTotals.spending / State.budget) * 100) : 0;
    if (budgetSpentPercent) budgetSpentPercent.textContent = formatProgressPercent(percentSpentRaw);

    if (budgetBar) {
        budgetBar.style.width = `${Math.min(100, percentSpentRaw)}%`;
        budgetBar.style.backgroundColor = budgetScopeTotals.spending > State.budget && State.budget > 0 ? '#c44f67' : '#557d62';
    }

    if (budgetStatusText) {
        const diff = Utils.sub(State.budget, budgetScopeTotals.spending);
        if (State.budget === 0) {
            budgetStatusText.textContent = 'No budget set';
            budgetStatusText.style.color = '#8c8278';
        } else if (diff >= 0) {
            budgetStatusText.textContent = `Remaining: ${Utils.formatCurrency(diff)}`;
            budgetStatusText.style.color = '#357448';
        } else {
            budgetStatusText.textContent = `Over budget: ${Utils.formatCurrency(Math.abs(diff))}`;
            budgetStatusText.style.color = '#c44f67';
        }
    }

    // Update charts with both totals and budget
    if (window.ChartManager && typeof ChartManager.update === 'function') {
        ChartManager.update(displayTotals, State.budget, budgetScopeTotals);
    }
}

// UI Kebab Actions

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
    const target = document.getElementById(`kebab-${id}`);
    if (target) target.classList.toggle('show');
};

// Main Transaction Form Submit
const txForm = document.getElementById('transaction-form');
const txDateInput = document.getElementById('tx-date');
if (txDateInput && !txDateInput.value) {
    txDateInput.value = Utils.toDateInputValue(new Date());
}
if (txForm) {
    txForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('tx-submit-btn');
        const accountVal = document.getElementById('account').value;
        const amountVal = Utils.sanitizeNumber(document.getElementById('amount').value);

        if (amountVal <= 0) {
            showAlert('Invalid Amount', 'Please enter an amount greater than ₱0.00.');
            return;
        }

        if (ActionLocks.has('transaction-submit')) {
            return;
        }

        ActionLocks.add('transaction-submit');

        btn.disabled = true;
        const editId = document.getElementById('edit-tx-id').value;
        const dateVal = document.getElementById('tx-date').value;
        const payload = {
            description: document.getElementById('description').value.trim(),
            account: accountVal,
            method: document.getElementById('method').value,
            amount: amountVal,
            date: Utils.parseTxDate(dateVal).toISOString()
        };

        try {
            if (editId) {
                const oldTx = State.transactions.find(t => t.id === editId);

                if (oldTx && oldTx.isWithdrawal && payload.account === 'spending') {
                    payload.isWithdrawal = true;
                }

                await API.updateTransaction(editId, payload);
            } else {
                await API.addTransaction(payload);
            }
            resetTxForm();
            await initApp();
        } catch (error) {
            console.error('Transaction submit failed:', error);
            showAlert('Save Failed', 'Unable to save transaction. Please check your connection and try again.');
        } finally {
            btn.disabled = false;
            ActionLocks.delete('transaction-submit');
        }
    });
}

window.startEditTx = (id) => {
    const tx = State.transactions.find(t => t.id === id);
    if (!tx) return;

    document.getElementById('edit-tx-id').value = tx.id;
    document.getElementById('description').value = tx.description;
    document.getElementById('account').value = tx.account;
    document.getElementById('method').value = tx.method || 'Cash';
    document.getElementById('amount').value = tx.amount;
    document.getElementById('tx-date').value = Utils.toDateInputValue(tx.date);

    document.getElementById('tx-form-title').textContent = 'EDIT TRANSACTION';
    document.getElementById('tx-submit-btn').textContent = 'Save Changes';
    document.getElementById('tx-cancel-btn').style.display = 'block';
};

function resetTxForm() {
    document.getElementById('transaction-form').reset();
    document.getElementById('edit-tx-id').value = '';
    document.getElementById('tx-date').value = Utils.toDateInputValue(new Date());
    document.getElementById('tx-form-title').textContent = 'LOG TRANSACTION';
    document.getElementById('tx-submit-btn').textContent = 'Save Entry';
    document.getElementById('tx-cancel-btn').style.display = 'none';
}

const cancelBtn = document.getElementById('tx-cancel-btn');
if (cancelBtn) cancelBtn.addEventListener('click', resetTxForm);

// Budget Form Submit
const budgetForm = document.getElementById('budget-form');
if (budgetForm) {
    budgetForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (ActionLocks.has('budget-submit')) {
            return;
        }

        if (State.budget > 0 && !State.isBudgetEditing) {
            showAlert('Budget Locked', 'Your budget is already set. Use the Edit button to update it.');
            return;
        }

        const inputVal = Utils.sanitizeNumber(document.getElementById('monthly-budget-input').value);
        const isResetToZero = inputVal === 0;
        const canReset = State.budget > 0 && State.isBudgetEditing;

        if (inputVal < 0) {
            showAlert('Invalid Budget', 'Budget cannot be negative.');
            return;
        }

        if (isResetToZero && !canReset) {
            showAlert('Invalid Budget', 'Set a budget greater than ₱0.00. To delete it, click Edit and save 0.');
            return;
        }

        ActionLocks.add('budget-submit');
        const submitBtn = document.querySelector('#budget-form button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            if (inputVal === 0 && canReset) {
                await API.saveBudget(0);
                State.budget = 0;
                State.isBudgetEditing = false;
                renderTransactions();
                showAlert('Budget Reset', 'Your spending budget has been reset to ₱0.00.');
                return;
            }

            await API.saveBudget(inputVal);
            State.budget = inputVal;
            State.isBudgetEditing = false;
            renderTransactions();
            showAlert('Budget Saved', `Your spending budget has been set to ${Utils.formatCurrency(inputVal)}.`);
        } catch (error) {
            console.error('Budget submit failed:', error);
            showAlert('Save Failed', 'Unable to save budget. Please try again.');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
            ActionLocks.delete('budget-submit');
        }
    });
}

const budgetEditBtn = document.getElementById('budget-edit-btn');
if (budgetEditBtn) {
    budgetEditBtn.addEventListener('click', () => {
        State.isBudgetEditing = !State.isBudgetEditing;
        renderTransactions();

        if (State.isBudgetEditing) {
            const budgetInput = document.getElementById('monthly-budget-input');
            if (budgetInput) {
                budgetInput.focus();
                budgetInput.select();
            }
        }
    });
}

// Delete Record Handling
window.promptDelete = (type, id) => {
    State.pendingDelete = { type, id };
    document.getElementById('delete-modal-msg').textContent = 'Are you sure you want to delete this transaction record?';
    openModal('delete-modal');
};

const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async () => {
        if (ActionLocks.has('record-delete')) return;

        const { type, id } = State.pendingDelete;

        ActionLocks.add('record-delete');
        confirmDeleteBtn.disabled = true;

        try {
            if (type === 'tx') {
                await API.deleteTransaction(id);
            }

            closeModal('delete-modal');
            State.pendingDelete = { type: null, id: null };
            await initApp();
        } catch (error) {
            console.error('Delete operation failed:', error);
            showAlert('Delete Failed', 'Unable to delete this record right now.');
        } finally {
            confirmDeleteBtn.disabled = false;
            ActionLocks.delete('record-delete');
        }
    });
}