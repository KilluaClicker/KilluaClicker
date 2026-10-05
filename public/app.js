let currentUser = null;
let clicking = false;

const usernameEl = document.getElementById("username");
const clicksEl = document.getElementById("clicks");
const miniClicksEl = document.getElementById("miniClicks");
const rankEl = document.getElementById("rank");
const clickButton = document.getElementById("clickButton");
const logoutBtn = document.getElementById("logoutBtn");
const adminLink = document.getElementById("adminLink");
const toast = document.getElementById("toast");


function formatClicks(value) {
    try {
        return BigInt(value).toLocaleString("ru-RU");
    } catch {
        return String(value);
    }
}


function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(window.toastTimer);

    window.toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2200);
}


function updateClicks(value) {
    const formatted = formatClicks(value);

    clicksEl.textContent = formatted;
    miniClicksEl.textContent = formatted;
}


async function loadUser() {

    try {

        const response = await fetch("/api/me", {
            credentials: "include"
        });

        const data = await response.json();

        if (!data.success || !data.user) {
            window.location.href = "/";
            return;
        }

        currentUser = data.user;

        usernameEl.textContent = currentUser.username;

        updateClicks(currentUser.clicks);

        if (currentUser.username === "Killua666") {
            adminLink.style.display = "flex";
        }

        await loadRank();

    } catch (error) {

        console.error(error);

        showToast("Ошибка соединения с сервером");

    }
}


async function loadRank() {

    try {

        const response = await fetch("/api/top", {
            credentials: "include"
        });

        if (!response.ok) {
            return;
        }

        const data = await response.json();

        if (!data.success || !Array.isArray(data.users)) {
            return;
        }

        const index = data.users.findIndex(
            user => user.username === currentUser.username
        );

        if (index !== -1) {
            rankEl.textContent = "#" + (index + 1);
        } else {
            rankEl.textContent = "—";
        }

    } catch (error) {
        console.error(error);
    }
}


async function makeClick() {

    if (clicking) {
        return;
    }

    clicking = true;

    try {

        const response = await fetch("/api/click", {
            method: "POST",
            credentials: "include"
        });

        const data = await response.json();

        if (!response.ok || !data.success) {

            if (response.status === 401) {
                window.location.href = "/";
                return;
            }

            throw new Error(
                data.message || "Ошибка клика"
            );
        }

        if (data.clicks !== undefined) {
            updateClicks(data.clicks);
            currentUser.clicks = data.clicks;
        }

        loadRank();

    } catch (error) {

        console.error(error);

        showToast(
            error.message || "Не удалось сделать клик"
        );

    } finally {

        setTimeout(() => {
            clicking = false;
        }, 40);

    }
}


clickButton.addEventListener("click", makeClick);


document.addEventListener("keydown", event => {

    if (
        event.code === "Space" &&
        document.activeElement.tagName !== "INPUT" &&
        document.activeElement.tagName !== "TEXTAREA"
    ) {

        event.preventDefault();

        makeClick();
    }

});


logoutBtn.addEventListener("click", async () => {

    try {

        await fetch("/api/logout", {
            method: "POST",
            credentials: "include"
        });

    } catch (error) {
        console.error(error);
    }

    window.location.href = "/";

});


loadUser();