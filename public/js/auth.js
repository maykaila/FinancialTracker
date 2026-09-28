import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    sendPasswordResetEmail,
    updateProfile,
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

let auth;
let currentMode = 'login'; // 'login', 'signup', or 'forgot'

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

async function initFirebase() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        const app = initializeApp(config);
        auth = getAuth(app);

        onAuthStateChanged(auth, (user) => {
            if (user && currentMode !== 'forgot') {
                const resolvedName = user.displayName || user.email.split('@')[0];
                localStorage.setItem('ft_cached_name', resolvedName);
                window.location.href = '/index.html';
            }
        });
    } catch (err) {
        console.error("Failed to load Firebase configuration:", err);
    }
}

initFirebase();

window.switchAuthMode = function(mode) {
    currentMode = mode;
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const authTabs = document.getElementById('auth-tabs');
    const tag = document.getElementById('auth-tag');
    const nameField = document.getElementById('name-field-group');
    const passwordField = document.getElementById('password-field-group');
    const submitBtn = document.getElementById('auth-submit-btn');
    const prompt = document.getElementById('auth-toggle-prompt');
    const errorMsg = document.getElementById('auth-error-msg');
    const successMsg = document.getElementById('auth-success-msg');
    const passwordInput = document.getElementById('auth-password');

    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';

    if (mode === 'signup') {
        authTabs.style.display = 'flex';
        tabSignup.classList.add('active');
        tabLogin.classList.remove('active');
        tag.className = 'card-tag tag-green';
        tag.textContent = 'JOIN US';
        nameField.style.display = 'block';
        passwordField.style.display = 'block';
        passwordInput.setAttribute('autocomplete', 'new-password');
        submitBtn.textContent = 'Create Account';
        prompt.innerHTML = `Already have an account? <a href="javascript:void(0)" onclick="switchAuthMode('login')">Log in here</a>`;
    } else if (mode === 'login') {
        authTabs.style.display = 'flex';
        tabLogin.classList.add('active');
        tabSignup.classList.remove('active');
        tag.className = 'card-tag tag-pink';
        tag.textContent = 'WELCOME BACK';
        nameField.style.display = 'none';
        passwordField.style.display = 'block';
        passwordInput.setAttribute('autocomplete', 'current-password');
        submitBtn.textContent = 'Log In';
        prompt.innerHTML = `Don't have an account yet? <a href="javascript:void(0)" onclick="switchAuthMode('signup')">Sign up here</a>`;
    } else if (mode === 'forgot') {
        authTabs.style.display = 'none';
        tag.className = 'card-tag tag-gold';
        tag.textContent = 'RESET PASSWORD';
        nameField.style.display = 'none';
        passwordField.style.display = 'none';
        submitBtn.textContent = 'Send Reset Link';
        prompt.innerHTML = `Remembered your password? <a href="javascript:void(0)" onclick="switchAuthMode('login')">Back to Log In</a>`;
    }
};

function displayError(msg) {
    const errorMsg = document.getElementById('auth-error-msg');
    const successMsg = document.getElementById('auth-success-msg');
    if (successMsg) successMsg.style.display = 'none';
    if (errorMsg) {
        errorMsg.textContent = msg;
        errorMsg.style.display = 'block';
    }
}

function displaySuccess(msg) {
    const errorMsg = document.getElementById('auth-error-msg');
    const successMsg = document.getElementById('auth-success-msg');
    if (errorMsg) errorMsg.style.display = 'none';
    if (successMsg) {
        successMsg.textContent = msg;
        successMsg.style.display = 'block';
    }
}

const form = document.getElementById('auth-form');
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const displayName = document.getElementById('auth-name').value.trim();
    const submitBtn = document.getElementById('auth-submit-btn');

    document.getElementById('auth-error-msg').style.display = 'none';
    document.getElementById('auth-success-msg').style.display = 'none';

    if (!email) {
        displayError('Please enter your email address.');
        return;
    }
    if (!EMAIL_REGEX.test(email)) {
        displayError('Please enter a valid email address.');
        return;
    }

    if (currentMode === 'forgot') {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        try {
            await sendPasswordResetEmail(auth, email);
            displaySuccess('Password reset link sent! Check your inbox.');
        } catch (err) {
            displayError(formatAuthError(err.code));
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Reset Link';
        }
        return;
    }

    if (!password) {
        displayError('Please enter your password.');
        return;
    }
    if (password.length < 6) {
        displayError('Password must be at least 6 characters long.');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Loading...';

    try {
        if (currentMode === 'signup') {
            const credential = await createUserWithEmailAndPassword(auth, email, password);
            if (displayName) {
                await updateProfile(credential.user, { displayName });
                localStorage.setItem('ft_cached_name', displayName);
            } else {
                localStorage.setItem('ft_cached_name', email.split('@')[0]);
            }
        } else {
            const credential = await signInWithEmailAndPassword(auth, email, password);
            const resolvedName = credential.user.displayName || credential.user.email.split('@')[0];
            localStorage.setItem('ft_cached_name', resolvedName);
        }

        window.location.href = '/index.html';
    } catch (err) {
        displayError(formatAuthError(err.code));
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = currentMode === 'signup' ? 'Create Account' : 'Log In';
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
            return 'Action failed. Please check your connection and try again.';
    }
}