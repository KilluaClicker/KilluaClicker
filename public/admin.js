"use strict";

let users = [];

const usersContainer = document.getElementById("users");
const searchInput = document.getElementById("search");
const message = document.getElementById("message");

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function big(value) {
    try {
        return BigInt(String(value ?? "0"));
    } catch {
        return 0n;
    }
}

function formatBig(value) {
    const str = String(value ?? "0");

    try {
        return BigInt(str).toLocaleString("ru-RU");
    } catch {
        return str;
    }
}

function showMessage(text, error = false) {
    message.textContent = text;
    message.style.color = error ? "#ff6b6b" : "#caa8ff";

    setTimeout(() => {
        if (message.textContent === text) {
            message.textContent = "";
        }
    }, 3500);
}

async function api(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const text = await response.text();

    let data;

    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        throw new Error(
            `Сервер вернул неправильный ответ (${response.status})`
        );
    }

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            location.href = "/login.html";
            return;
        }

        throw new Error(data.error || data.message || "Ошибка сервера");
    }

    return data;
}

async function loadUsers() {
    try {
        const data = await api("/api/admin/users");

        users = Array.isArray(data)
            ? data
            : Array.isArray(data.users)
                ? data.users
                : [];

        renderUsers();
    } catch (error) {
        console.error(error);
        usersContainer.innerHTML = `
            <div class="empty">
                ❌ ${escapeHtml(error.message)}
            </div>
        `;
    }
}

function renderUsers() {
    const search = searchInput.value.trim().toLowerCase();

    const filtered = users.filter(user =>
        String(user.username || "")
            .toLowerCase()
            .includes(search)
    );

    if (!filtered.length) {
        usersContainer.innerHTML = `
            <div class="empty">
                Игроки не найдены.
            </div>
        `;
        return;
    }

    usersContainer.innerHTML = filtered.map(user => {
        const isMainAdmin =
            String(user.username).toLowerCase() === "killua666";

        const isAdmin = user.is_admin === true;

        return `
            <div class="user-card ${isAdmin ? "admin" : ""}" data-id="${user.id}">

                <div class="user-top">
                    <div class="username">
                        👤 ${escapeHtml(user.username)}
                    </div>

                    <div class="badges">
                        ${
                            isAdmin
                                ? `<span class="badge badge-admin">👑 ADMIN</span>`
                                : ""
                        }

                        ${
                            user.banned
                                ? `<span class="badge badge-ban">🚫 BAN</span>`
                                : ""
                        }
                    </div>
                </div>

                <div class="stats">

                    <div class="stat">
                        <div class="stat-title">Баланс</div>
                        <div class="stat-value">
                            ${formatBig(user.clicks)}
                        </div>
                    </div>

                    <div class="stat">
                        <div class="stat-title">За клик</div>
                        <div class="stat-value">
                            ${formatBig(user.click_power)}
                        </div>
                    </div>

                </div>

                <div class="field">
                    <label>Ник</label>
                    <input
                        class="nickname-input"
                        value="${escapeHtml(user.username)}"
                    >
                </div>

                <div class="field">
                    <label>Установить баланс</label>
                    <input
                        class="balance-input"
                        type="text"
                        inputmode="numeric"
                        placeholder="Например: 1000000"
                    >
                </div>

                <div class="field">
                    <label>Установить силу клика</label>
                    <input
                        class="power-input"
                        type="text"
                        inputmode="numeric"
                        placeholder="Например: 100"
                    >
                </div>

                <div class="section-title">
                    ➕ Выдать дополнительно
                </div>

                <div class="field">
                    <input
                        class="give-balance-input"
                        type="text"
                        inputmode="numeric"
                        placeholder="Сколько кликов выдать"
                    >
                </div>

                <button
                    class="give"
                    data-action="give-balance"
                >
                    💰 Выдать баланс
                </button>

                <div class="field" style="margin-top:8px;">
                    <input
                        class="give-power-input"
                        type="text"
                        inputmode="numeric"
                        placeholder="Сколько добавить к клику"
                    >
                </div>

                <button
                    class="power"
                    data-action="give-power"
                >
                    ⚡ Выдать к клику
                </button>

                <div class="buttons">

                    <button
                        class="save"
                        data-action="save"
                    >
                        💾 Сохранить
                    </button>

                    ${
                        isAdmin
                            ? `
                                ${
                                    !isMainAdmin
                                        ? `
                                            <button
                                                class="remove-admin"
                                                data-action="remove-admin"
                                            >
                                                👑 Забрать админку
                                            </button>
                                        `
                                        : `
                                            <button
                                                class="admin"
                                                disabled
                                                style="opacity:.6;cursor:not-allowed;"
                                            >
                                                👑 Главный админ
                                            </button>
                                        `
                                }
                            `
                            : `
                                <button
                                    class="admin"
                                    data-action="give-admin"
                                >
                                    👑 Выдать админку
                                </button>
                            `
                    }

                    <button
                        class="login-as"
                        data-action="impersonate"
                    >
                        👤 Зайти в аккаунт
                    </button>

                    ${
                        user.banned
                            ? `
                                <button
                                    class="unban"
                                    data-action="unban"
                                >
                                    ✅ Разбанить
                                </button>
                            `
                            : `
                                <button
                                    class="ban"
                                    data-action="ban"
                                >
                                    🚫 Забанить
                                </button>
                            `
                    }

                    <button
                        class="reset"
                        data-action="reset"
                    >
                        🔄 Сбросить
                    </button>

                    ${
                        !isMainAdmin
                            ? `
                                <button
                                    class="delete"
                                    data-action="delete"
                                >
                                    🗑️ Удалить аккаунт
                                </button>
                            `
                            : ""
                    }

                </div>

            </div>
        `;
    });
}

async function saveUser(card) {
    const id = card.dataset.id;

    const nickname =
        card.querySelector(".nickname-input").value.trim();

    const balance =
        card.querySelector(".balance-input").value.trim();

    const power =
        card.querySelector(".power-input").value.trim();

    const body = {};

    if (nickname) {
        body.username = nickname;
    }

    if (balance) {
        if (!/^\d+$/.test(balance)) {
            showMessage("Баланс должен быть целым числом.", true);
            return;
        }

        body.clicks = balance;
    }

    if (power) {
        if (!/^\d+$/.test(power)) {
            showMessage("Сила клика должна быть целым числом.", true);
            return;
        }

        body.click_power = power;
    }

    if (!Object.keys(body).length) {
        showMessage("Нечего сохранять.", true);
        return;
    }

    try {
        await api(`/api/admin/users/${id}`, {
            method: "PUT",
            body: JSON.stringify(body)
        });

        showMessage("✅ Пользователь сохранён.");
        await loadUsers();

    } catch (error) {
        showMessage(error.message, true);
    }
}

async function giveBalance(card) {
    const id = card.dataset.id;

    const input =
        card.querySelector(".give-balance-input");

    const amount = input.value.trim();

    if (!/^\d+$/.test(amount) || amount === "0") {
        showMessage(
            "Введите положительное целое число.",
            true
        );
        return;
    }

    try {
        await api(`/api/admin/users/${id}/give-balance`, {
            method: "POST",
            body: JSON.stringify({
                amount
            })
        });

        input.value = "";

        showMessage(
            `💰 Выдано ${formatBig(amount)} кликов.`
        );

        await loadUsers();

    } catch (error) {
        showMessage(error.message, true);
    }
}

async function givePower(card) {
    const id = card.dataset.id;

    const input =
        card.querySelector(".give-power-input");

    const amount = input.value.trim();

    if (!/^\d+$/.test(amount) || amount === "0") {
        showMessage(
            "Введите положительное целое число.",
            true
        );
        return;
    }

    try {
        await api(`/api/admin/users/${id}/give-click-power`, {
            method: "POST",
            body: JSON.stringify({
                amount
            })
        });

        input.value = "";

        showMessage(
            `⚡ Добавлено ${formatBig(amount)} к силе клика.`
        );

        await loadUsers();

    } catch (error) {
        showMessage(error.message, true);
    }
}

async function giveAdmin(card) {
    const id = card.dataset.id;

    if (!confirm("Выдать этому игроку права администратора?")) {
        return;
    }

    try {
        await api(`/api/admin/users/${id}/give-admin`, {
            method: "POST"
        });

        showMessage("👑 Админка выдана.");

        await loadUsers();

    } catch (error) {
        showMessage(error.message, true);
    }
}

async function removeAdmin(card) {
    const id = card.dataset.id;

    if (!confirm("Забрать у этого игрока права администратора?")) {
        return;
    }

    try {
        await api(`/api/admin/users/${id}/remove-admin`, {
            method: "POST"
        });

        showMessage("👑 Админка забрана.");

        await loadUsers();

    } catch (error) {
        showMessage(error.message, true);
    }
}

async function impersonate(card) {
    const id = card.dataset.id;

    if (!confirm("Зайти в аккаунт этого игрока?")) {
        return;
    }

    try {
        await api(`/api/admin/users/${id}/impersonate`, {
            method: "POST"
        });

        location.href = "/";

    } catch (error) {
        showMessage(error.message, true);
    }
}

async function banUser(card) {
    const id = card.dataset.id;

    if (!confirm("Забанить этого игрока?")) {
        return;
    }

    try {
        await api(`/api/admin/users/${id}/ban`, {
            method: "POST"
        });

        showMessage("🚫 Игрок забанен.");

        await loadUsers();

    } catch (error) {
        showMessage(error.message, true);
    }
}

async function unbanUser(card) {
    const id = card.dataset.id;

    try {
        await api(`/api/admin/users/${id}/unban`, {
            method: "POST"
        });

        showMessage("✅ Игрок разбанен.");

        await loadUsers();

    } catch (error) {
        showMessage(error.message, true);
    }
}

async function resetUser(card) {
    const id = card.dataset.id;

    if (!confirm(
        "Сбросить баланс и силу клика этого игрока?"
    )) {
        return;
    }

    try {
        await api(`/api/admin/users/${id}/reset`, {
            method: "POST"
        });

        showMessage("🔄 Данные сброшены.");

        await loadUsers();

    } catch (error) {
        showMessage(error.message, true);
    }
}

async function deleteUser(card) {
    const id = card.dataset.id;

    if (!confirm(
        "⚠️ УДАЛИТЬ АККАУНТ НАВСЕГДА?\n\nЭто действие нельзя отменить."
    )) {
        return;
    }

    try {
        await api(`/api/admin/users/${id}/delete`, {
            method: "POST"
        });

        showMessage("🗑️ Аккаунт удалён.");

        await loadUsers();

    } catch (error) {
        showMessage(error.message, true);
    }
}

usersContainer.addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");

    if (!button) {
        return;
    }

    const card = button.closest(".user-card");

    if (!card) {
        return;
    }

    const action = button.dataset.action;

    if (action === "save") {
        await saveUser(card);
    }

    if (action === "give-balance") {
        await giveBalance(card);
    }

    if (action === "give-power") {
        await givePower(card);
    }

    if (action === "give-admin") {
        await giveAdmin(card);
    }

    if (action === "remove-admin") {
        await removeAdmin(card);
    }

    if (action === "impersonate") {
        await impersonate(card);
    }

    if (action === "ban") {
        await banUser(card);
    }

    if (action === "unban") {
        await unbanUser(card);
    }

    if (action === "reset") {
        await resetUser(card);
    }

    if (action === "delete") {
        await deleteUser(card);
    }
});

searchInput.addEventListener("input", renderUsers);

loadUsers();