document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

let currentUser = null;
let isClicking = false;

/* =========================================================
   INIT
========================================================= */

async function initApp() {
    setupButtons();
    await loadCurrentUser();
}

/* =========================================================
   BUTTONS
========================================================= */

function setupButtons() {
    const clickButton = document.getElementById("clickButton");
    const logoutButton = document.getElementById("logoutButton");

    if (clickButton) {
        clickButton.addEventListener("click", async (event) => {
            event.preventDefault();

            if (isClicking) {
                return;
            }

            await makeClick();
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener("click", async (event) => {
            event.preventDefault();

            await logout();
        });
    }

    document.addEventListener("submit", (event) => {
        event.preventDefault();
    });
}

/* =========================================================
   CURRENT USER
========================================================= */

async function loadCurrentUser() {
    try {
        const response = await fetch("/api/me", {
            method: "GET",
            credentials: "include",
            cache: "no-store"
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success || !data.user) {
            showLoggedOutState();
            return;
        }

        currentUser = data.user;

        updateUserInterface(currentUser);

    } catch (error) {
        console.error("Ошибка проверки аккаунта:", error);

        showLoggedOutState();
    }
}

/* =========================================================
   CLICK
========================================================= */

async function makeClick() {
    if (!currentUser) {
        showToast("Сначала войдите в аккаунт");
        return;
    }

    isClicking = true;

    const clickButton = document.getElementById("clickButton");

    if (clickButton) {
        clickButton.disabled = true;
    }

    try {
        const response = await fetch("/api/click", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({})
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            if (response.status === 401) {
                currentUser = null;
                showLoggedOutState();
                showToast("Сессия закончилась. Войдите снова.");
                return;
            }

            showToast(data.error || "Ошибка клика");
            return;
        }

        currentUser.clicks = String(data.clicks);

        updateClicks(currentUser.clicks);

    } catch (error) {
        console.error("Ошибка клика:", error);

        showToast("Ошибка соединения с сервером");

    } finally {
        isClicking = false;

        if (clickButton) {
            clickButton.disabled = false;
        }
    }
}

/* =========================================================
   LOGOUT
========================================================= */

async function logout() {
    const logoutButton = document.getElementById("logoutButton");

    if (logoutButton) {
        logoutButton.disabled = true;
    }

    try {
        const response = await fetch("/api/logout", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({})
        });

        await response.json().catch(() => ({}));

    } catch (error) {
        console.error("Ошибка выхода:", error);

    } finally {
        currentUser = null;

        /*
         * Переходим на страницу входа.
         * В нашем проекте страница входа находится на "/".
         */
        window.location.href = "/?login=1";
    }
}

/* =========================================================
   UI
========================================================= */

function updateUserInterface(user) {
    const usernameElements = document.querySelectorAll(
        "#username, #playerName, .username"
    );

    usernameElements.forEach((element) => {
        element.textContent = user.username;
    });

    updateClicks(user.clicks);

    const adminButton = document.getElementById("adminButton");

    if (adminButton) {
        if (user.username === "Killua666") {
            adminButton.style.display = "";
        } else {
            adminButton.style.display = "none";
        }
    }
}

function updateClicks(clicks) {
    const formatted = formatNumber(clicks);

    const elements = document.querySelectorAll(
        "#clicks, #clickCount, .click-count, [data-clicks]"
    );

    elements.forEach((element) => {
        element.textContent = formatted;
    });
}

function showLoggedOutState() {
    currentUser = null;

    const usernameElements = document.querySelectorAll(
        "#username, #playerName, .username"
    );

    usernameElements.forEach((element) => {
        element.textContent = "Не авторизован";
    });

    updateClicks("0");

    const clickButton = document.getElementById("clickButton");

    if (clickButton) {
        clickButton.disabled = false;
    }
}

/* =========================================================
   NUMBER FORMAT
========================================================= */

function formatNumber(value) {
    try {
        return BigInt(String(value)).toLocaleString("ru-RU");
    } catch {
        return String(value);
    }
}

/* =========================================================
   TOAST
========================================================= */

function showToast(message) {
    let toast = document.getElementById("toast");

    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";
        toast.className = "toast";

        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(window.toastTimer);

    window.toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}