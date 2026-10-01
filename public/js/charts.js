const allocationCtx = document.getElementById('allocationChart')?.getContext('2d');
const comparisonCtx = document.getElementById('comparisonChart')?.getContext('2d');
const budgetSpendingCtx = document.getElementById('budgetSpendingChart')?.getContext('2d');

let allocationChartInstance = null;
let comparisonChartInstance = null;
let budgetSpendingChartInstance = null;

const formatPesoCompact = (n) => {
    return `₱${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

const donutCenterTextPlugin = {
    id: 'donutCenterText',
    afterDatasetsDraw(chart) {
        if (chart.config.type !== 'doughnut') return;
        const centerCfg = chart?.options?.plugins?.donutCenterText;
        if (!centerCfg?.enabled) return;

        const meta = chart.getDatasetMeta(0);
        const firstArc = meta?.data?.[0];
        if (!firstArc) return;

        const { x, y } = firstArc;
        const ctx = chart.ctx;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = centerCfg.color || '#4a423b';
        ctx.font = centerCfg.valueFont || "700 12px 'M PLUS Rounded 1c', sans-serif";
        ctx.fillText(centerCfg.valueText || '', x, y - 2);

        if (centerCfg.captionText) {
            ctx.fillStyle = centerCfg.captionColor || '#8c8278';
            ctx.font = centerCfg.captionFont || "700 9px 'M PLUS Rounded 1c', sans-serif";
            ctx.fillText(centerCfg.captionText, x, y + 13);
        }

        ctx.restore();
    }
};

window.ChartManager = {
    init() {
        if (typeof Chart === 'undefined') return;
        Chart.register(donutCenterTextPlugin);

        // 1. Account Breakdown (Doughnut)
        if (allocationCtx && !allocationChartInstance) {
            allocationChartInstance = new Chart(allocationCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Cash', 'Savings', 'Investments', 'Protection'],
                    datasets: [{
                        data: [0, 0, 0, 0],
                        backgroundColor: ['#e27289', '#c98a3b', '#8b5db3', '#4988bd'],
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '58%',
                    layout: {
                        padding: { top: 8, right: 8, bottom: 8, left: 8 }
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            align: 'center',
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
                    cutout: '62%',
                    layout: {
                        padding: { top: 8, right: 8, bottom: 8, left: 8 }
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            align: 'center',
                            labels: {
                                font: { family: "'M PLUS Rounded 1c', sans-serif", weight: '700', size: 10 },
                                boxWidth: 12
                            }
                        },
                        donutCenterText: {
                            enabled: true,
                            valueText: '₱0 / ₱0',
                            captionText: 'utilization'
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

    update(totals, budget = 0, monthlyTotals = null) {
        if (!allocationChartInstance || !comparisonChartInstance || !budgetSpendingChartInstance) {
            this.init();
        }

        // Update Account Breakdown Doughnut
        if (allocationChartInstance) {
            const income = Number(totals.income || 0);
            const spending = Number(totals.spending || 0);
            const savings = Number(totals.savings || 0);
            const investments = Number(totals.investments || 0);
            const protection = Number(totals.protection || 0);
            const cash = Math.max(0, income - (spending + savings + investments + protection));

            allocationChartInstance.data.datasets[0].data = [
                cash,
                savings,
                investments,
                protection
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
            const scoped = monthlyTotals || totals;
            const actualSpending = Number(scoped.spending || 0);
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

            budgetSpendingChartInstance.options.plugins.donutCenterText = {
                enabled: true,
                valueText: `${formatPesoCompact(actualSpending)} / ${formatPesoCompact(budgetLimit)}`,
                captionText: 'utilization'
            };

            budgetSpendingChartInstance.update();
        }
    }
};

window.ChartManager.init();