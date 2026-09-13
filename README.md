# 🌸 Money Planner ♡

A cozy, aesthetic indie-web financial planner and tracker built with Node.js, Express, Chart.js, and Firebase Firestore. Designed around a 5-account budgeting method with multi-goal savings vaults, dynamic analytics, and device-isolated storage.

---

## ✨ Features

- **5-Account Allocation System:** Categorize transactions seamlessly into *Income*, *Spending*, *Savings*, *Investments*, and *Protection*.
- **Interactive Data Visualizations:** Real-time account breakdown (doughnut chart) and Income vs. Spending balance (bar chart) using Chart.js.
- **Dynamic Date Filtering:** Switch effortlessly between all-time entries and month-specific views.
- **Multi-Goal Savings Vaults:**
  - Create dedicated savings targets with individual progress bars.
  - Allocate savings deposits directly to specific goal vaults.
  - Dedicated withdrawal flow that auto-logs spending while decrementing vault balances.
  - Full two-way synchronization: editing or deleting transactions adjusts vault balances automatically.
- **Indie-Web / Stationery Aesthetic:** Cozy pastel color palette, custom die-cut sticker accents with interactive hover animations, and dual rounded typography (*Cherry Bomb One* & *M PLUS Rounded 1c*).
- **Device-Isolated Data:** Uses local device identification for individual data isolation without requiring manual login screens.

---

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3 (Custom Indie-Web decals & animations), Vanilla JavaScript (ES Modules)
- **Visuals & Charts:** Chart.js, Google Fonts
- **Backend:** Node.js, Express.js
- **Database:** Firebase Cloud Firestore
- **Deployment:** Vercel

---

## 📁 Project Structure

```text
├── public/
│   ├── assets/              # PNG/GIF stickers, icons, and washi dividers
│   ├── css/
│   │   └── style.css        # Indie-web styling, animations, and responsive layout
│   ├── js/
│   │   ├── api.js           # Firebase Firestore initialization and CRUD operations
│   │   ├── app.js           # App logic, state management, and edge-case sync
│   │   └── charts.js        # Chart.js initialization and updates
│   └── index.html           # Main dashboard markup
├── .gitignore               # Ignored files (node_modules, .env)
├── package.json             # Node dependencies and scripts
├── server.js                # Express server and config endpoint
└── vercel.json              # Vercel serverless routing configuration
