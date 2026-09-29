const allocationCtx = document.getElementById('allocationChart')?.getContext('2d');
const comparisonCtx = document.getElementById('comparisonChart')?.getContext('2d');
const budgetSpendingCtx = document.getElementById('budgetSpendingChart')?.getContext('2d');

let allocationChartInstance = null;
let comparisonChartInstance = null;
let budgetSpendingChartInstance = null;

window.ChartManager = {
    init() {
        if (typeof Chart === 'undefined') return;

        if (allocationCtx && !allocationChartInstance) {
            allocationChartInstance = new Chart(allocationCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Income', 'Spending', 'Savings', 'Investments', 'Protection'],
                    datasets: [{
                        data: [0, 0, 0, 0, 0],
                        backgroundColor: ['#e27289', '#557d62', '#c98a3b', '#8b5db3', '#4988bd'],
                        // borderWidth: 2,
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '62%',
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

        if (budgetSpendingCtx && !budgetSpendingChartInstance) {
            budgetSpendingChartInstance = new Chart(budgetSpendingCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Budget Limit', 'Actual Spending'],
                    datasets: [{
                        label: 'Amount (₱)',
                        data: [0, 0],
                        backgroundColor: ['#c98a3b', '#557d62'],
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '62%',
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
    },

    update(totals, budget = 0) {
        if (!allocationChartInstance || !comparisonChartInstance || !budgetSpendingChartInstance) {
            this.init();
        }

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

        if (comparisonCtx && comparisonChartInstance) {
            const outflow = (totals.spending || 0) + (totals.savings || 0) + (totals.investments || 0) + (totals.protection || 0);
            comparisonChartInstance.data.datasets[0].data = [totals.income || 0, outflow];
            comparisonChartInstance.update();
        }

        if (budgetSpendingChartInstance) {
            const actualSpending = totals.spending || 0;
            budgetSpendingChartInstance.data.datasets[0].data = [budget, actualSpending];
            budgetSpendingChartInstance.data.datasets[0].backgroundColor = [
                '#c98a3b',
                actualSpending > budget && budget > 0 ? '#c44f67' : '#557d62'
            ];
            budgetSpendingChartInstance.update();
        }
    }
};

window.ChartManager.init();