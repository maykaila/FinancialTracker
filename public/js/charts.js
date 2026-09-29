const allocationCtx = document.getElementById('allocationChart')?.getContext('2d');
const comparisonCtx = document.getElementById('comparisonChart')?.getContext('2d');
const budgetSpendingCtx = document.getElementById('budgetSpendingChart')?.getContext('2d');

let allocationChartInstance = null;
let comparisonChartInstance = null;
let budgetSpendingChartInstance = null;

window.ChartManager = {
    init() {
        if (typeof Chart === 'undefined') return;

        // 1. Account Breakdown (Doughnut)
        if (allocationCtx && !allocationChartInstance) {
            allocationChartInstance = new Chart(allocationCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Income', 'Spending', 'Savings', 'Investments', 'Protection'],
                    datasets: [{
                        data: [0, 0, 0, 0, 0],
                        backgroundColor: ['#e27289', '#557d62', '#c98a3b', '#8b5db3', '#4988bd'],
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '30%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { font: { family: "'M PLUS Rounded 1c', sans-serif", weight: '700', size: 10 } }
                        },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => ` ${ctx.label}: ₱${Number(ctx.parsed || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            }
                        }
                    }
                }
            });
        }

        // 2. Income vs Spending (Bar)
        if (comparisonCtx && !comparisonChartInstance) {
            comparisonChartInstance = new Chart(comparisonCtx, {
                type: 'bar',
                data: {
                    labels: ['Income', 'Spending'],
                    datasets: [{
                        data: [0, 0],
                        backgroundColor: ['#e27289', '#557d62'],
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { font: { size: 10 } } },
                        x: { ticks: { font: { weight: '700', size: 10 } } }
                    }
                }
            });
        }

        // 3. Regular Doughnut: Spent vs Remaining Budget
        if (budgetSpendingCtx && !budgetSpendingChartInstance) {
            budgetSpendingChartInstance = new Chart(budgetSpendingCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Actual Spending', 'Remaining Budget'],
                    datasets: [{
                        data: [0, 0],
                        backgroundColor: ['#557d62', '#ede5da'],
                        borderRadius: 6,
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '30%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                font: { family: "'M PLUS Rounded 1c', sans-serif", weight: '700', size: 10 },
                                boxWidth: 12
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => ` ${ctx.label}: ₱${Number(ctx.parsed || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            }
                        }
                    }
                }
            });
        }
    },

    update(totals, budget = 0) {
        if (!allocationChartInstance || !comparisonChartInstance || !budgetSpendingChartInstance) {
            this.init();
        }

        // Update Account Breakdown Doughnut
        if (allocationChartInstance) {
            allocationChartInstance.data.datasets[0].data = [
                totals.income || 0,
                totals.spending || 0,
                totals.savings || 0,
                totals.investments || 0,
                totals.protection || 0
            ];
            allocationChartInstance.update();
        }

        // Update Comparison Bar
        if (comparisonCtx && comparisonChartInstance) {
            const outflow = (totals.spending || 0) + (totals.savings || 0) + (totals.investments || 0) + (totals.protection || 0);
            comparisonChartInstance.data.datasets[0].data = [totals.income || 0, outflow];
            comparisonChartInstance.update();
        }

        // Update Budget Doughnut
        if (budgetSpendingChartInstance) {
            const actualSpending = Number(totals.spending || 0);
            const budgetLimit = Number(budget || 0);
            const isOver = actualSpending > budgetLimit && budgetLimit > 0;

            if (isOver) {
                // If over budget, show full spending highlighted in red
                budgetSpendingChartInstance.data.labels = ['Over Budget Spending'];
                budgetSpendingChartInstance.data.datasets[0].data = [actualSpending];
                budgetSpendingChartInstance.data.datasets[0].backgroundColor = ['#c44f67'];
            } else if (budgetLimit === 0 && actualSpending === 0) {
                // Initial empty state
                budgetSpendingChartInstance.data.labels = ['Actual Spending', 'Remaining Budget'];
                budgetSpendingChartInstance.data.datasets[0].data = [0, 1];
                budgetSpendingChartInstance.data.datasets[0].backgroundColor = ['#557d62', '#ede5da'];
            } else {
                const remaining = Math.max(0, budgetLimit - actualSpending);
                budgetSpendingChartInstance.data.labels = ['Actual Spending', 'Remaining Budget'];
                budgetSpendingChartInstance.data.datasets[0].data = [actualSpending, remaining];
                budgetSpendingChartInstance.data.datasets[0].backgroundColor = ['#557d62', '#ede5da'];
            }

            budgetSpendingChartInstance.update();
        }
    }
};

window.ChartManager.init();