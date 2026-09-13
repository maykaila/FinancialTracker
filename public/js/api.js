import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    getDocs, 
    addDoc, 
    doc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let db;

// Anonymous Device/User Identity (Ensures each laptop has private data)
let userId = localStorage.getItem('ft_user_id');
if (!userId) {
    userId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('ft_user_id', userId);
}

// Fetch Firebase Configuration Keys dynamically
async function initFirebase() {
    if (db) return db;
    
    const res = await fetch('/api/config');
    const firebaseConfig = await res.json();
    
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    return db;
}

export const API = {
    // TRANSACTIONS
    async getTransactions() {
        const database = await initFirebase();
        const q = query(
            collection(database, "transactions"), 
            where("userId", "==", userId)
        );
        const snapshot = await getDocs(q);
        const list = [];
        snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
        return list.sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    async addTransaction(data) {
        const database = await initFirebase();
        const docRef = await addDoc(collection(database, "transactions"), {
            ...data,
            userId,
            date: new Date().toISOString()
        });
        return { id: docRef.id, ...data };
    },

    async updateTransaction(id, data) {
        const database = await initFirebase();
        const ref = doc(database, "transactions", id);
        await updateDoc(ref, data);
        return { id, ...data };
    },

    async deleteTransaction(id) {
        const database = await initFirebase();
        await deleteDoc(doc(database, "transactions", id));
        return { id };
    },

    // GOALS
    async getGoals() {
        const database = await initFirebase();
        const q = query(collection(database, "goals"), where("userId", "==", userId));
        const snapshot = await getDocs(q);
        const list = [];
        snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
        return list;
    },

    async addGoal(data) {
        const database = await initFirebase();
        const docRef = await addDoc(collection(database, "goals"), {
            ...data,
            userId
        });
        return { id: docRef.id, ...data };
    },

    async updateGoal(id, data) {
        const database = await initFirebase();
        const ref = doc(database, "goals", id);
        await updateDoc(ref, data);
        return { id, ...data };
    },

    async deleteGoal(id) {
        const database = await initFirebase();
        await deleteDoc(doc(database, "goals", id));
        return { id };
    }
};