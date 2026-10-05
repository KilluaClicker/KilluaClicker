document.addEventListener("DOMContentLoaded", () => {
    const topList = document.getElementById("topList");
    const topMessage = document.getElementById("topMessage");

    function formatNumber(value) {
        try {
            const n = BigInt(String(value));

            if (n < 1000n) {
                return n.toString();
            }

            const units = [
                "",
                "тыс.",
                "млн",
                "млрд",
                "трлн",
                "квадр.",
                "квинт.",
                "секст.",
                "септ.",
                "окт.",
                "нонил.",
                "дец."
            ];

            let number = n;
            let unit = 0;

            while (
                number >= 1000n &&
                unit < units.length - 1
            ) {
                number /= 1000n;
                unit++;
            }

            return `${number.toString()} ${units[unit]}`;
        } catch {
            return String(value);
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function showMessage(text) {
        if (!topMessage) return;

        topMessage.textContent = text;
    }

    function renderTop(users) {
        if (!topList) return;

        topList.innerHTML = "";

        if (!Array.isArray(users) || users.length === 0) {
            topList.innerHTML = `
                <div class="empty-state">
                    Игроков пока нет.
                </div>
            `;
            return;
        }

        users.forEach((user, index) => {
            const place = index + 1;

            const row = document.createElement("div");
            row.className = "top-player";

            let placeClass = "";

            if (place === 1) {
                placeClass = " first";
            } else if (place === 2) {
                placeClass = " second";
            } else if (place === 3) {
                placeClass = " third";
            }

            row.innerHTML = `
                <div class="top-place${placeClass}">
                    #${place}
                </div>

                <div class="top-avatar">
                    ${escapeHtml(
                        String(user.username || "?")
                            .charAt(0)
                            .toUpperCase()
                    )}
                </div>

                <div class="top-user">
                    <div class="top-username">
                        ${escapeHtml(user.username)}
                    </div>

                    <div class="top-label">
                        Игрок
                    </div>
                </div>

                <div class="top-clicks">
                    ${formatNumber(user.clicks)}
                    <span>кликов</span>
                </div>
            `;

            topList.appendChild(row);
        });
    }

    async function loadTop() {
        try {
            showMessage("Загрузка топа...");

            const response = await fetch("/api/top", {
                credentials: "include",
                cache: "no-store"
            });

            const data = await response.json();

            if (response.status === 401) {
                window.location.replace("/login.html");
                return;
            }

            if (!response.ok || !data.success) {
                showMessage(
                    data.message ||
                    "Не удалось загрузить топ."
                );
                return;
            }

            renderTop(data.users);

            if (topMessage) {
                topMessage.textContent = "";
            }
        } catch (error) {
            console.error("TOP ERROR:", error);

            showMessage(
                "Ошибка соединения с сервером."
            );
        }
    }

    loadTop();
});