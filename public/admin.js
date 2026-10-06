"use strict";

let users = [];

const usersContainer = document.getElementById("users");
const searchInput = document.getElementById("search");
const message = document.getElementById("message");

/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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
    if (!message) {
        return;
    }

    message.textContent = text;
    message.style.color = error ? "#ff6b6b" : "#caa8ff";

    setTimeout(() => {
        if (message.textContent === text) {
            message.textContent = "";
        }
    }, 3500);
}

/* =========================================================
   API
========================================================= */

async function api(url, options = {}) {
    try {
        const response = await fetch(url, {
            credentials: "same-origin",
            ...options,
            headers: {
                ...(options.body
                    ? {
                        "Content-Type": "application/json"
                    }
                    : {}),
                ...(options.headers || {})
            }
        });

        const text = await response.text();

        let data = {};

        if (text) {
            try {
                data = JSON.parse(text);
            } catch (error) {
                console.error(
                    "Неверный JSON от сервера:",
                    text
                );

                throw new Error(
                    `Сервер вернул неправильный ответ (${response.status})`
                );
            }
        }

        if (!response.ok) {
            if (
                response.status === 401 ||
                response.status === 403
            ) {
                throw new Error(
                    data.message ||
                    data.error ||
                    "Нет доступа к админ-панели."
                );
            }

            throw new Error(
                data.message ||
                data.error ||
                `Ошибка сервера (${response.status})`
            );
        }

        return data;

    } catch (error) {
        console.error(
            "API ERROR:",
            url,
            error
        );

        throw error;
    }
}

/* =========================================================
   LOAD USERS
========================================================= */

async function loadUsers() {
    if (!usersContainer) {
        console.error(
            "Элемент #users не найден."
        );
        return;
    }

    usersContainer.innerHTML = `
        <div class="empty">
            ⏳ Загрузка игроков...
        </div>
    `;

    try {
        const data = await api(
            "/api/admin/users"
        );

        console.log(
            "Ответ /api/admin/users:",
            data
        );

        if (Array.isArray(data)) {
            users = data;
        } else if (
            data &&
            Array.isArray(data.users)
        ) {
            users = data.users;
        } else {
            users = [];
        }

        renderUsers();

    } catch (error) {
        console.error(
            "LOAD USERS ERROR:",
            error
        );

        usersContainer.innerHTML = `
            <div class="empty">
                ❌ ${escapeHtml(error.message)}
            </div>
        `;

        showMessage(
            `Ошибка загрузки игроков: ${error.message}`,
            true
        );
    }
}

/* =========================================================
   RENDER USERS
========================================================= */

function renderUsers() {
    if (!usersContainer) {
        return;
    }

    const search = searchInput
        ? searchInput.value
            .trim()
            .toLowerCase()
        : "";

    const filtered = users.filter(user => {
        return String(
            user.username || ""
        )
            .toLowerCase()
            .includes(search);
    });

    if (!filtered.length) {
        usersContainer.innerHTML = `
            <div class="empty">
                Игроки не найдены.
            </div>
        `;

        return;
    }

    usersContainer.innerHTML = filtered
        .map(user => {

            const id = String(
                user.id ?? ""
            );

            const username = String(
                user.username ?? ""
            );

            const isMainAdmin =
                username.toLowerCase() ===
                "killua666";

            const isAdmin =
                user.is_admin === true ||
                user.is_admin === "true" ||
                user.is_admin === 1 ||
                user.is_admin === "1";

            const isBanned =
                user.banned === true ||
                user.banned === "true" ||
                user.banned === 1 ||
                user.banned === "1";

            return `
                <div
                    class="user-card ${isAdmin ? "admin" : ""}"
                    data-id="${escapeHtml(id)}"
                >

                    <div class="user-top">

                        <div class="username">
                            👤 ${escapeHtml(username)}
                        </div>

                        <div class="badges">

                            ${
                                isAdmin
                                    ? `
                                        <span class="badge badge-admin">
                                            👑 ADMIN
                                        </span>
                                    `
                                    : ""
                            }

                            ${
                                isBanned
                                    ? `
                                        <span class="badge badge-ban">
                                            🚫 BAN
                                        </span>
                                    `
                                    : ""
                            }

                        </div>

                    </div>

                    <div class="stats">

                        <div class="stat">

                            <div class="stat-title">
                                Баланс
                            </div>

                            <div class="stat-value">
                                ${formatBig(user.clicks)}
                            </div>

                        </div>

                        <div class="stat">

                            <div class="stat-title">
                                За клик
                            </div>

                            <div class="stat-value">
                                ${formatBig(user.click_power)}
                            </div>

                        </div>

                    </div>

                    <div class="field">

                        <label>
                            Ник
                        </label>

                        <input
                            class="nickname-input"
                            value="${escapeHtml(username)}"
                        >

                    </div>

                    <div class="field">

                        <label>
                            Установить баланс
                        </label>

                        <input
                            class="balance-input"
                            type="text"
                            inputmode="numeric"
                            placeholder="Например: 1000000"
                        >

                    </div>

                    <div class="field">

                        <label>
                            Установить силу клика
                        </label>

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

                    <div
                        class="field"
                        style="margin-top:8px;"
                    >

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
                            isBanned
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
        })
        .join("");
}

/* =========================================================
   SAVE USER
========================================================= */

async function saveUser(card) {
    const id = card.dataset.id;

    const nickname =
        card
            .querySelector(".nickname-input")
            ?.value
            .trim() || "";

    const balance =
        card
            .querySelector(".balance-input")
            ?.value
            .trim() || "";

    const power =
        card
            .querySelector(".power-input")
            ?.value
            .trim() || "";

    const body = {};

    if (nickname) {
        body.username = nickname;
    }

    if (balance) {
        if (!/^\d+$/.test(balance)) {
            showMessage(
                "Баланс должен быть целым числом.",
                true
            );
            return;
        }

        body.clicks = balance;
    }

    if (power) {
        if (!/^\d+$/.test(power)) {
            showMessage(
                "Сила клика должна быть целым числом.",
                true
            );
            return;
        }

        body.click_power = power;
    }

    if (!Object.keys(body).length) {
        showMessage(
            "Нечего сохранять.",
            true
        );
        return;
    }

    try {
        await api(
            `/api/admin/users/${encodeURIComponent(id)}/edit`,
            {
                method: "POST",
                body: JSON.stringify(body)
            }
        );

        showMessage(
            "✅ Пользователь сохранён."
        );

        await loadUsers();

    } catch (error) {
        showMessage(
            error.message,
            true
        );
    }
}

/* =========================================================
   GIVE BALANCE
========================================================= */

async function giveBalance(card) {
    const id = card.dataset.id;

    const input =
        card.querySelector(
            ".give-balance-input"
        );

    if (!input) {
        return;
    }

    const amount =
        input.value.trim();

    if (
        !/^\d+$/.test(amount) ||
        amount === "0"
    ) {
        showMessage(
            "Введите положительное целое число.",
            true
        );
        return;
    }

    try {
        await api(
            `/api/admin/users/${encodeURIComponent(id)}/give-balance`,
            {
                method: "POST",
                body: JSON.stringify({
                    amount
                })
            }
        );

        input.value = "";

        showMessage(
            `💰 Выдано ${formatBig(amount)} кликов.`
        );

        await loadUsers();

    } catch (error) {
        showMessage(
            error.message,
            true
        );
    }
}

/* =========================================================
   GIVE CLICK POWER
========================================================= */

async function givePower(card) {
    const id = card.dataset.id;

    const input =
        card.querySelector(
            ".give-power-input"
        );

    if (!input) {
        return;
    }

    const amount =
        input.value.trim();

    if (
        !/^\d+$/.test(amount) ||
        amount === "0"
    ) {
        showMessage(
            "Введите положительное целое число.",
            true
        );
        return;
    }

    try {
        await api(
            `/api/admin/users/${encodeURIComponent(id)}/give-click-power`,
            {
                method: "POST",
                body: JSON.stringify({
                    amount
                })
            }
        );

        input.value = "";

        showMessage(
            `⚡ Добавлено ${formatBig(amount)} к силе клика.`
        );

        await loadUsers();

    } catch (error) {
        showMessage(
            error.message,
            true
        );
    }
}

/* =========================================================
   GIVE ADMIN
========================================================= */

async function giveAdmin(card) {
    const id = card.dataset.id;

    if (
        !confirm(
            "Выдать этому игроку права администратора?"
        )
    ) {
        return;
    }

    try {
        await api(
            `/api/admin/users/${encodeURIComponent(id)}/give-admin`,
            {
                method: "POST"
            }
        );

        showMessage(
            "👑 Админка выдана."
        );

        await loadUsers();

    } catch (error) {
        showMessage(
            error.message,
            true
        );
    }
}

/* =========================================================
   REMOVE ADMIN
========================================================= */

async function removeAdmin(card) {
    const id = card.dataset.id;

    if (
        !confirm(
            "Забрать у этого игрока права администратора?"
        )
    ) {
        return;
    }

    try {
        await api(
            `/api/admin/users/${encodeURIComponent(id)}/remove-admin`,
            {
                method: "POST"
            }
        );

        showMessage(
            "👑 Админка забрана."
        );

        await loadUsers();

    } catch (error) {
        showMessage(
            error.message,
            true
        );
    }
}

/* =========================================================
   IMPERSONATE
========================================================= */

async function impersonate(card) {
    const id = card.dataset.id;

    if (
        !confirm(
            "Зайти в аккаунт этого игрока?"
        )
    ) {
        return;
    }

    try {
        await api(
            `/api/admin/users/${encodeURIComponent(id)}/impersonate`,
            {
                method: "POST"
            }
        );

        location.href = "/";

    } catch (error) {
        showMessage(
            error.message,
            true
        );
    }
}

/* =========================================================
   BAN
========================================================= */

async function banUser(card) {
    const id = card.dataset.id;

    if (
        !confirm(
            "Забанить этого игрока?"
        )
    ) {
        return;
    }

    try {
        await api(
            `/api/admin/users/${encodeURIComponent(id)}/ban`,
            {
                method: "POST"
            }
        );

        showMessage(
            "🚫 Игрок забанен."
        );

        await loadUsers();

    } catch (error) {
        showMessage(
            error.message,
            true
        );
    }
}

/* =========================================================
   UNBAN
========================================================= */

async function unbanUser(card) {
    const id = card.dataset.id;

    try {
        await api(
            `/api/admin/users/${encodeURIComponent(id)}/unban`,
            {
                method: "POST"
            }
        );

        showMessage(
            "✅ Игрок разбанен."
        );

        await loadUsers();

    } catch (error) {
        showMessage(
            error.message,
            true
        );
    }
}

/* =========================================================
   RESET
========================================================= */

async function resetUser(card) {
    const id = card.dataset.id;

    if (
        !confirm(
            "Сбросить баланс и силу клика этого игрока?"
        )
    ) {
        return;
    }

    try {
        await api(
            `/api/admin/users/${encodeURIComponent(id)}/reset`,
            {
                method: "POST"
            }
        );

        showMessage(
            "🔄 Данные сброшены."
        );

        await loadUsers();

    } catch (error) {
        showMessage(
            error.message,
            true
        );
    }
}

/* =========================================================
   DELETE
========================================================= */

async function deleteUser(card) {
    const id = card.dataset.id;

    if (
        !confirm(
            "⚠️ УДАЛИТЬ АККАУНТ НАВСЕГДА?\n\nЭто действие нельзя отменить."
        )
    ) {
        return;
    }

    try {
        await api(
            `/api/admin/users/${encodeURIComponent(id)}/delete`,
            {
                method: "POST"
            }
        );

        showMessage(
            "🗑️ Аккаунт удалён."
        );

        await loadUsers();

    } catch (error) {
        showMessage(
            error.message,
            true
        );
    }
}

/* =========================================================
   BUTTON EVENTS
========================================================= */

if (usersContainer) {
    usersContainer.addEventListener(
        "click",
        async event => {

            const button =
                event.target.closest(
                    "[data-action]"
                );

            if (!button) {
                return;
            }

            const card =
                button.closest(
                    ".user-card"
                );

            if (!card) {
                return;
            }

            const action =
                button.dataset.action;

            if (action === "save") {
                await saveUser(card);
                return;
            }

            if (action === "give-balance") {
                await giveBalance(card);
                return;
            }

            if (action === "give-power") {
                await givePower(card);
                return;
            }

            if (action === "give-admin") {
                await giveAdmin(card);
                return;
            }

            if (action === "remove-admin") {
                await removeAdmin(card);
                return;
            }

            if (action === "impersonate") {
                await impersonate(card);
                return;
            }

            if (action === "ban") {
                await banUser(card);
                return;
            }

            if (action === "unban") {
                await unbanUser(card);
                return;
            }

            if (action === "reset") {
                await resetUser(card);
                return;
            }

            if (action === "delete") {
                await deleteUser(card);
                return;
            }
        }
    );
}

/* =========================================================
   SEARCH
========================================================= */

if (searchInput) {
    searchInput.addEventListener(
        "input",
        renderUsers
    );
}

/* =========================================================
   START
========================================================= */

loadUsers();