// Example inside public/js/charts.js
const allocationCtx = document.getElementById('allocationChart')?.getContext('2d');
const comparisonCtx = document.getElementById('comparisonChart')?.getContext('2d');

let allocationChartInstance = null;
let comparisonChartInstance = null;

window.ChartManager = {
    init() {
        if (!allocationCtx || !comparisonCtx || typeof Chart === 'undefined') return;

        allocationChartInstance = new Chart(allocationCtx, {
            type: 'doughnut',
            data: {
                labels: ['Income', 'Spending', 'Savings', 'Investments', 'Protection'],
                datasets: [{
                    data: [0, 0, 0, 0, 0],
                    backgroundColor: ['#e27289', '#557d62', '#c98a3b', '#8b5db3', '#4988bd'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            boxWidth: 12,
                            font: { family: "'M PLUS Rounded 1c', sans-serif", weight: '700', size: 10 }
                        }
                    }
                },
                cutout: '65%'
            }
        });

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
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: { family: "'M PLUS Rounded 1c', sans-serif", size: 10 }
                        }
                    },
                    x: {
                        ticks: {
                            font: { family: "'M PLUS Rounded 1c', sans-serif", weight: '700', size: 10 }
                        }
                    }
                }
            }
        });
    },

    update(totals) {
        if (!allocationChartInstance || !comparisonChartInstance) {
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

        if (comparisonChartInstance) {
            const outflow = (totals.spending || 0) + (totals.savings || 0) + (totals.investments || 0) + (totals.protection || 0);
            comparisonChartInstance.data.datasets[0].data = [totals.income || 0, outflow];
            comparisonChartInstance.update();
        }
    }
};

// Initialize as soon as script evaluates
window.ChartManager.init();