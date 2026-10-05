const usersContainer = document.getElementById("users");
const searchInput = document.getElementById("search");

const totalUsers = document.getElementById("totalUsers");
const totalClicks = document.getElementById("totalClicks");
const bannedUsers = document.getElementById("bannedUsers");
const logoutButton = document.getElementById("logoutButton");

let allUsers = [];

async function api(url, options = {}) {
    const response = await fetch(url, {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        ...options
    });

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error("Сервер вернул неправильный ответ");
    }

    if (!response.ok) {
        throw new Error(data.error || "Ошибка сервера");
    }

    return data;
}

async function checkAdmin() {
    try {
        const data = await api("/api/me");

        if (!data.user) {
            window.location.href = "/";
            return false;
        }

        if (data.user.username !== "Killua666") {
            alert("Доступ запрещён");
            window.location.href = "/";
            return false;
        }

        return true;
    } catch (error) {
        console.error(error);
        window.location.href = "/";
        return false;
    }
}

async function loadUsers() {
    usersContainer.innerHTML = `
        <div style="
            padding:30px;
            text-align:center;
            color:#888;
        ">
            ⏳ Загрузка игроков...
        </div>
    `;

    try {
        const data = await api("/api/admin/users");

        console.log("ADMIN USERS:", data);

        if (!data.success || !Array.isArray(data.users)) {
            throw new Error("Неверный ответ API");
        }

        allUsers = data.users;

        updateStats();
        renderUsers(allUsers);

    } catch (error) {
        console.error(error);

        usersContainer.innerHTML = `
            <div style="
                padding:30px;
                text-align:center;
                color:#f87171;
            ">
                ❌ Не удалось загрузить игроков
                <br>
                <small style="color:#777">
                    ${escapeHtml(error.message)}
                </small>
                <br><br>
                <button
                    class="action"
                    onclick="loadUsers()"
                >
                    🔄 Повторить
                </button>
            </div>
        `;
    }
}

function updateStats() {
    totalUsers.textContent = allUsers.length;

    const clicks = allUsers.reduce((sum, user) => {
        return sum + Number(user.clicks || 0);
    }, 0);

    totalClicks.textContent = clicks.toLocaleString("ru-RU");

    const banned = allUsers.filter(user => user.banned).length;

    bannedUsers.textContent = banned;
}

function renderUsers(users) {
    if (!users.length) {
        usersContainer.innerHTML = `
            <div style="
                padding:30px;
                text-align:center;
                color:#777;
            ">
                Игроки не найдены
            </div>
        `;

        return;
    }

    usersContainer.innerHTML = users.map((user, index) => {
        const clicks = Number(user.clicks || 0);
        const isAdmin = user.username === "Killua666";

        const status = user.banned
            ? `<span class="banned">🚫 ЗАБЛОКИРОВАН</span>`
            : `<span class="active">● АКТИВЕН</span>`;

        let actions;

        if (isAdmin) {
            actions = `
                <span style="
                    color:#a78bfa;
                    font-size:10px;
                    font-weight:800;
                ">
                    👑 АДМИНИСТРАТОР
                </span>
            `;
        } else {
            actions = `
                <button
                    class="action"
                    onclick="addClicks(${user.id})"
                >
                    + Клики
                </button>

                <button
                    class="action"
                    onclick="setClicks(${user.id})"
                >
                    ✏️ Установить
                </button>

                <button
                    class="action"
                    onclick="renameUser(${user.id})"
                >
                    ✏️ Ник
                </button>

                <button
                    class="action"
                    onclick="toggleBan(${user.id})"
                >
                    ${user.banned ? "🔓 Разбан" : "🚫 Бан"}
                </button>

                <button
                    class="action danger"
                    onclick="deleteUser(${user.id})"
                >
                    🗑️ Удалить
                </button>
            `;
        }

        return `
            <div class="user-row">

                <div class="user-number">
                    ${index + 1}
                </div>

                <div class="user-name">
                    ${escapeHtml(user.username)}
                </div>

                <div class="user-clicks">
                    ⚡ ${clicks.toLocaleString("ru-RU")}
                </div>

                <div>
                    ${status}
                </div>

                <div class="actions">
                    ${actions}
                </div>

            </div>
        `;
    }).join("");
}

searchInput.addEventListener("input", () => {
    const query = searchInput.value
        .trim()
        .toLowerCase();

    const filtered = allUsers.filter(user =>
        user.username.toLowerCase().includes(query)
    );

    renderUsers(filtered);
});

async function addClicks(id) {
    const amount = prompt("Сколько кликов добавить?");

    if (amount === null) return;

    const number = Number(amount);

    if (!Number.isInteger(number) || number <= 0) {
        alert("Введите положительное целое число");
        return;
    }

    try {
        await api(`/api/admin/user/${id}/add-clicks`, {
            method: "POST",
            body: JSON.stringify({
                amount: number
            })
        });

        await loadUsers();

    } catch (error) {
        alert(error.message);
    }
}

async function setClicks(id) {
    const user = allUsers.find(u => u.id === id);

    if (!user) return;

    const current = Number(user.clicks || 0);

    const value = prompt(
        `Текущее количество кликов: ${current}\n\nВведите новое количество:`,
        current
    );

    if (value === null) return;

    const number = Number(value);

    if (!Number.isInteger(number) || number < 0) {
        alert("Введите целое число от 0");
        return;
    }

    try {
        await api(`/api/admin/user/${id}/clicks`, {
            method: "POST",
            body: JSON.stringify({
                clicks: number
            })
        });

        await loadUsers();

    } catch (error) {
        alert(error.message);
    }
}

async function renameUser(id) {
    const user = allUsers.find(u => u.id === id);

    if (!user) return;

    const username = prompt(
        "Введите новый ник:",
        user.username
    );

    if (username === null) return;

    const newUsername = username.trim();

    if (!newUsername) {
        alert("Ник не может быть пустым");
        return;
    }

    if (newUsername.length < 3 || newUsername.length > 32) {
        alert("Ник должен быть от 3 до 32 символов");
        return;
    }

    try {
        await api(`/api/admin/user/${id}/username`, {
            method: "POST",
            body: JSON.stringify({
                username: newUsername
            })
        });

        await loadUsers();

    } catch (error) {
        alert(error.message);
    }
}

async function toggleBan(id) {
    const user = allUsers.find(u => u.id === id);

    if (!user) return;

    const action = user.banned
        ? "разблокировать"
        : "заблокировать";

    if (!confirm(
        `Точно ${action} игрока "${user.username}"?`
    )) {
        return;
    }

    try {
        await api(`/api/admin/user/${id}/ban`, {
            method: "POST",
            body: JSON.stringify({
                banned: !user.banned
            })
        });

        await loadUsers();

    } catch (error) {
        alert(error.message);
    }
}

async function deleteUser(id) {
    const user = allUsers.find(u => u.id === id);

    if (!user) return;

    if (!confirm(
        `⚠️ ВНИМАНИЕ!\n\n` +
        `Удалить игрока "${user.username}"?\n\n` +
        `Это действие нельзя отменить.`
    )) {
        return;
    }

    try {
        await api(`/api/admin/user/${id}`, {
            method: "DELETE"
        });

        await loadUsers();

    } catch (error) {
        alert(error.message);
    }
}

logoutButton.addEventListener("click", async () => {
    try {
        await api("/api/logout", {
            method: "POST"
        });
    } catch (error) {
        console.error(error);
    }

    window.location.href = "/";
});

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

(async function init() {
    const isAdmin = await checkAdmin();

    if (!isAdmin) return;

    await loadUsers();
})();