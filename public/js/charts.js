const ChartManager = {
    allocationChart: null,
    comparisonChart: null,
    palette: ['#df6d82', '#557d62', '#e5a95d', '#8b69aa', '#5b8eac'],

    init(totals) {
        // 1. Account Breakdown
        const ctx1 = document.getElementById('allocationChart').getContext('2d');
        this.allocationChart = new Chart(ctx1, {
            type: 'doughnut',
            data: {
                labels: ['Income', 'Spending', 'Savings', 'Investments', 'Protection'],
                datasets: [{
                    data: [totals.income, totals.spending, totals.savings, totals.investments, totals.protection],
                    backgroundColor: this.palette,
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { font: { family: 'M PLUS Rounded 1c', weight: '700', size: 10.5 }, color: '#4a423a' }
                    }
                }
            }
        });

        // 2. Income vs Spending
        const ctx2 = document.getElementById('comparisonChart').getContext('2d');
        this.comparisonChart = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: ['Total Income', 'Total Spending'],
                datasets: [{
                    data: [totals.income, totals.spending],
                    backgroundColor: ['#557d62', '#df6d82'],
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        ticks: { color: '#7d756d', font: { family: 'M PLUS Rounded 1c', weight: '700', size: 10 }, callback: v => '₱' + v },
                        grid: { color: '#f2ede4' }
                    },
                    x: {
                        ticks: { color: '#4a423a', font: { family: 'M PLUS Rounded 1c', weight: '700', size: 10 } },
                        grid: { display: false }
                    }
                }
            }
        });
    },

    update(totals) {
        if (!this.allocationChart || !this.comparisonChart) return this.init(totals);

        this.allocationChart.data.datasets[0].data = [
            totals.income, totals.spending, totals.savings, totals.investments, totals.protection
        ];
        this.allocationChart.update();

        this.comparisonChart.data.datasets[0].data = [totals.income, totals.spending];
        this.comparisonChart.update();
    }
};