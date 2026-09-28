import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    updateProfile,
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

let auth;
let currentMode = 'login';

// RFC 5322 standard email regex with valid TLD requirement (at least 2 letters)
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Initialize Firebase using your environment config endpoint
async function initFirebase() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        const app = initializeApp(config);
        auth = getAuth(app);

        // Redirect to dashboard if already logged in
        onAuthStateChanged(auth, (user) => {
            if (user) {
                window.location.href = '/index.html';
            }
        });
    } catch (err) {
        console.error("Failed to load Firebase configuration:", err);
    }
}

initFirebase();

// Tab switching
window.switchAuthMode = function(mode) {
    currentMode = mode;
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const tag = document.getElementById('auth-tag');
    const nameField = document.getElementById('name-field-group');
    const submitBtn = document.getElementById('auth-submit-btn');
    const prompt = document.getElementById('auth-toggle-prompt');
    const errorMsg = document.getElementById('auth-error-msg');
    const passwordInput = document.getElementById('auth-password');

    errorMsg.style.display = 'none';

    if (mode === 'signup') {
        tabSignup.classList.add('active');
        tabLogin.classList.remove('active');
        tag.className = 'card-tag tag-green';
        tag.textContent = 'JOIN US';
        nameField.style.display = 'block';
        passwordInput.setAttribute('autocomplete', 'new-password');
        submitBtn.textContent = 'Create Account ♡';
        prompt.innerHTML = `Already have an account? <a href="javascript:void(0)" onclick="switchAuthMode('login')">Log in here</a>`;
    } else {
        tabLogin.classList.add('active');
        tabSignup.classList.remove('active');
        tag.className = 'card-tag tag-pink';
        tag.textContent = 'WELCOME BACK';
        nameField.style.display = 'none';
        passwordInput.setAttribute('autocomplete', 'current-password');
        submitBtn.textContent = 'Log In ♡';
        prompt.innerHTML = `Don't have an account yet? <a href="javascript:void(0)" onclick="switchAuthMode('signup')">Sign up here</a>`;
    }
};

function displayError(msg) {
    const errorMsg = document.getElementById('auth-error-msg');
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
}

// Form submission handler
const form = document.getElementById('auth-form');
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const displayName = document.getElementById('auth-name').value.trim();
    const errorMsg = document.getElementById('auth-error-msg');
    const submitBtn = document.getElementById('auth-submit-btn');

    errorMsg.style.display = 'none';

    // 1. Email format and domain validation
    if (!email) {
        displayError('Please enter your email address.');
        return;
    }
    if (!EMAIL_REGEX.test(email)) {
        displayError('Please enter a valid email address (e.g. name@domain.com).');
        return;
    }

    // 2. Password length validation
    if (!password) {
        displayError('Please enter your password.');
        return;
    }
    if (password.length < 6) {
        displayError('Password must be at least 6 characters long.');
        return;
    }
    if (password.length > 64) {
        displayError('Password cannot exceed 64 characters.');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Loading...';

    try {
        if (currentMode === 'signup') {
            const credential = await createUserWithEmailAndPassword(auth, email, password);
            if (displayName) {
                await updateProfile(credential.user, { displayName });
            }
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }

        // Redirect to planner on success
        window.location.href = '/index.html';
    } catch (err) {
        displayError(formatAuthError(err.code));
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = currentMode === 'signup' ? 'Create Account ♡' : 'Log In ♡';
    }
});

function formatAuthError(code) {
    switch (code) {
        case 'auth/email-already-in-use':
            return 'An account with this email already exists.';
        case 'auth/invalid-email':
            return 'The email domain or address is invalid.';
        case 'auth/weak-password':
            return 'Password is too weak. Please use at least 6 characters.';
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
            return 'Incorrect email or password. Please try again.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Please wait a moment before trying again.';
        default:
            return 'Authentication failed. Please check your connection and try again.';
    }
}