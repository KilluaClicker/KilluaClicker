document.addEventListener("DOMContentLoaded", () => {
    const usersList =
        document.getElementById("usersList") ||
        document.getElementById("adminUsers") ||
        document.getElementById("users");

    const messageElement =
        document.getElementById("message") ||
        document.getElementById("adminMessage");

    function showMessage(message, type = "error") {
        if (!messageElement) {
            console.log(message);
            return;
        }

        messageElement.textContent = message;
        messageElement.className = `admin-message ${type}`;
    }

    function formatNumber(value) {
        try {
            const number = BigInt(String(value ?? "0"));

            if (number < 1000n) {
                return number.toString();
            }

            const units = [
                {
                    value: 1000000000000000000000000n,
                    name: "септиллион"
                },
                {
                    value: 1000000000000000000000n,
                    name: "сикстиллион"
                },
                {
                    value: 1000000000000000n,
                    name: "квадриллион"
                },
                {
                    value: 1000000000000n,
                    name: "триллион"
                },
                {
                    value: 1000000000n,
                    name: "миллиард"
                },
                {
                    value: 1000000n,
                    name: "миллион"
                },
                {
                    value: 1000n,
                    name: "тысяча"
                }
            ];

            for (const unit of units) {
                if (number >= unit.value) {
                    const whole = number / unit.value;
                    const remainder = number % unit.value;

                    if (remainder === 0n) {
                        return `${whole} ${unit.name}`;
                    }

                    const decimal =
                        Number(remainder) /
                        Number(unit.value);

                    const formatted = decimal
                        .toFixed(2)
                        .replace(/\.?0+$/, "");

                    return `${whole}${formatted.slice(1)} ${unit.name}`;
                }
            }

            return number.toString();
        } catch {
            return "0";
        }
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    async function apiRequest(url, options = {}) {
        const response = await fetch(url, {
            credentials: "include",
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        });

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error(
                `Сервер вернул неправильный ответ (${response.status}).`
            );
        }

        if (response.status === 401) {
            window.location.href = "/login.html";
            return null;
        }

        if (response.status === 403) {
            throw new Error(
                data?.message || "У вас нет доступа к админ-панели."
            );
        }

        if (!response.ok || !data || data.success !== true) {
            throw new Error(
                data?.message ||
                `Ошибка сервера (${response.status}).`
            );
        }

        return data;
    }

    function renderUsers(users) {
        if (!usersList) {
            console.error(
                "Не найден элемент usersList/adminUsers/users."
            );
            return;
        }

        if (!Array.isArray(users) || users.length === 0) {
            usersList.innerHTML = `
                <div class="empty-state">
                    Пользователей пока нет.
                </div>
            `;
            return;
        }

        usersList.innerHTML = users
            .map((user, index) => {
                const username =
                    escapeHtml(user.username);

                const clicks =
                    formatNumber(user.clicks);

                const clickPower =
                    formatNumber(
                        user.click_power ?? 1
                    );

                const banned =
                    Boolean(user.banned);

                const status = banned
                    ? "Заблокирован"
                    : "Активен";

                const statusClass = banned
                    ? "banned"
                    : "active";

                return `
                    <div class="admin-user">
                        <div class="admin-user-number">
                            #${index + 1}
                        </div>

                        <div class="admin-user-info">
                            <div class="admin-user-name">
                                ${username}
                            </div>

                            <div class="admin-user-stats">
                                <span>
                                    💰 ${clicks}
                                </span>

                                <span>
                                    ⚡ +${clickPower}/клик
                                </span>

                                <span class="${statusClass}">
                                    ${status}
                                </span>
                            </div>
                        </div>

                        <div class="admin-user-actions">
                            ${
                                banned
                                    ? `
                                        <button
                                            class="admin-btn unban-btn"
                                            data-action="unban"
                                            data-id="${user.id}"
                                        >
                                            Разблокировать
                                        </button>
                                    `
                                    : `
                                        <button
                                            class="admin-btn ban-btn"
                                            data-action="ban"
                                            data-id="${user.id}"
                                        >
                                            Заблокировать
                                        </button>
                                    `
                            }

                            <button
                                class="admin-btn reset-btn"
                                data-action="reset"
                                data-id="${user.id}"
                            >
                                Сбросить
                            </button>
                        </div>
                    </div>
                `;
            })
            .join("");
    }

    async function loadUsers() {
        try {
            showMessage("Загрузка...", "info");

            const data = await apiRequest(
                "/api/admin/users"
            );

            if (!data) {
                return;
            }

            /*
             * Текущий server.js возвращает:
             *
             * {
             *   success: true,
             *   users: [...]
             * }
             */
            if (!Array.isArray(data.users)) {
                console.error(
                    "Неправильный ответ сервера:",
                    data
                );

                throw new Error(
                    "Сервер вернул неправильный ответ."
                );
            }

            renderUsers(data.users);

            showMessage(
                `Пользователей: ${data.users.length}`,
                "success"
            );
        } catch (error) {
            console.error(
                "Ошибка загрузки админки:",
                error
            );

            showMessage(
                error.message ||
                    "Сервер вернул неправильный ответ.",
                "error"
            );
        }
    }

    async function userAction(action, userId) {
        let url;

        if (action === "ban") {
            url = `/api/admin/users/${userId}/ban`;
        } else if (action === "unban") {
            url = `/api/admin/users/${userId}/unban`;
        } else if (action === "reset") {
            url = `/api/admin/users/${userId}/reset`;
        } else {
            return;
        }

        if (action === "ban") {
            const confirmed = confirm(
                "Заблокировать этого пользователя?"
            );

            if (!confirmed) {
                return;
            }
        }

        if (action === "reset") {
            const confirmed = confirm(
                "Сбросить клики и силу клика этого пользователя?"
            );

            if (!confirmed) {
                return;
            }
        }

        try {
            showMessage("Выполняется...", "info");

            const data = await apiRequest(url, {
                method: "POST",
                body: JSON.stringify({})
            });

            if (!data) {
                return;
            }

            showMessage(
                data.message || "Готово.",
                "success"
            );

            await loadUsers();
        } catch (error) {
            console.error(
                "Ошибка действия:",
                error
            );

            showMessage(
                error.message ||
                    "Сервер вернул неправильный ответ.",
                "error"
            );
        }
    }

    if (usersList) {
        usersList.addEventListener(
            "click",
            (event) => {
                const button =
                    event.target.closest(
                        "[data-action]"
                    );

                if (!button) {
                    return;
                }

                const action =
                    button.dataset.action;

                const userId =
                    button.dataset.id;

                if (!userId) {
                    return;
                }

                userAction(
                    action,
                    userId
                );
            }
        );
    }

    loadUsers();
});