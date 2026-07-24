async function registerUser() {
    // 1. Get references to the input elements themselves
    const userField = document.getElementById('reg_user');
    const passField = document.getElementById('reg_pass');

    const user = userField.value;
    const pass = passField.value;

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });

        if (response.ok) {
            alert("Registration successful! You can now log in.");
            toggleRegModal(false);
        } else {
            alert("Registration failed. Username might be taken.");
        }
    } catch (error) {
        console.error("Network error during registration:", error);
        alert("A network error occurred. Please try again.");
    } finally {
        // 2. CLEAR CREDENTIALS HERE (Runs automatically on success, failure, or crash)
        userField.value = '';
        passField.value = '';
    }
}

function toggleRegModal(show) {
    const regModal = document.getElementById('register_modal');
    const loginModal = document.getElementById('loginModal');
    const overlay = document.getElementById('modalOverlay');
    const display = show ? 'block' : 'none';

    // 1. Show/Hide the registration modal and overlay
    regModal.style.display = display;
    overlay.style.display = display;

    // 2. If opening registration, hide the login modal automatically
    if (show) {
        loginModal.style.display = 'none';
    }
}

// Toggle Modal Visibility
function toggleLoginModal(show) {
	const modal = document.getElementById('loginModal');
	const overlay = document.getElementById('modalOverlay');
	const display = show ? 'block' : 'none';
	
	modal.style.display = display;
	overlay.style.display = display;
}

function initAuthUIControls() {
	const loginBtn = document.getElementById('loginBtn');
	if (loginBtn) {
		loginBtn.onclick = () => toggleLoginModal(true);
	}
}

async function handleLogin(e) {
    if (e && e.preventDefault) e.preventDefault();
    
    const userField = document.getElementById('login_user');
    const passField = document.getElementById('login_pass');
    if (!userField || !passField) return;

    const user = userField.value;
    const pass = passField.value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass }),
            credentials: 'include' // Ensures the secure session cookie attaches safely
        });

        if (response.ok) {
            const data = await response.json();
            
            // 1. Hide the login panel overlay
            if (typeof toggleLoginModal === 'function') {
                toggleLoginModal(false);
            } else if (typeof closeLoginModal === 'function') {
                closeLoginModal();
            }

            // 2. Clear out your input credentials from the screen safely
            userField.value = '';
            passField.value = '';

            // 3. Update top-right navbar navigation status display blocks
            const statusText = document.getElementById('status_text');
            if (statusText) statusText.innerText = `Logged in as ${user} (${data.role})`;
            
            const loginBtn = document.getElementById('loginBtn');
            if (loginBtn) {
                loginBtn.innerText = "LOGOUT";
                loginBtn.onclick = handleLogout;
            }

            // 🚀 CRITICAL FIX: Force data execution pipelines to refresh immediately upon login success
            console.log("Auth UI: Login confirmed. Initializing point render pass...");
            if (typeof loadPoints === 'function') {
                loadPoints(1, '', false); // Populates page 1 table rows
            }
            if (typeof renderMapPoints === 'function') {
                renderMapPoints(); // Draws the 464 gold circle markers onto Leaflet canvas
            }
        } else {
            alert("Invalid username or password!");
        }
    } catch (err) {
        console.error("Login network error:", err);
    }
}

// Keep this unified single function copy as an alias routing bridge in case other forms call it
async function login(username, password) {
    const userField = document.getElementById('login_user');
    const passField = document.getElementById('login_pass');
    if (userField && passField) {
        userField.value = username;
        passField.value = password;
    }
    await handleLogin();
}

async function handleLogout() {
    try {
        const response = await fetch('/api/logout', { 
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            console.log("Auth UI: Session cleanly destroyed on cloud infrastructure.");
        }
    } catch (err) {
        console.error("Logout network query failed:", err);
    } finally {
        // 🚀 OPTIMIZED STATE RESET: Wipe visual canvas memory instead of using location.reload
        allPointsData = [];
        currentPage = 1;
        
        if (window.mapLayer && map) {
            map.removeLayer(window.mapLayer);
            window.mapLayer = null;
        }
        
        const tableBody = document.querySelector(".data_table tbody");
        if (tableBody) tableBody.innerHTML = "";

        const statusText = document.getElementById('status_text');
        if (statusText) statusText.innerText = "Logged out successfully.";

        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.innerText = "LOGIN";
            loginBtn.onclick = () => { if (typeof toggleLoginModal === 'function') toggleLoginModal(true); };
        }

        // Force user straight to the login panel overlay
        if (typeof toggleLoginModal === 'function') toggleLoginModal(true);
    }
}
