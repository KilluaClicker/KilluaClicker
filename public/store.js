document.addEventListener("DOMContentLoaded", () => {
    const shopGrid =
        document.getElementById("shopGrid");

    const shopMessage =
        document.getElementById("shopMessage");

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

    function showMessage(text, type = "") {
        if (!shopMessage) return;

        shopMessage.textContent = text;
        shopMessage.className = "shop-message";

        if (type) {
            shopMessage.classList.add(type);
        }
    }

    async function loadShop() {
        try {
            const response = await fetch("/api/shop", {
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
                    "Не удалось загрузить магазин.",
                    "error"
                );
                return;
            }

            renderShop(data.items);
        } catch (error) {
            console.error("SHOP ERROR:", error);

            showMessage(
                "Ошибка соединения с сервером.",
                "error"
            );
        }
    }

    function renderShop(items) {
        if (!shopGrid) return;

        shopGrid.innerHTML = "";

        if (!Array.isArray(items) || items.length === 0) {
            shopGrid.innerHTML = `
                <div class="empty-state">
                    Магазин пока пуст.
                </div>
            `;
            return;
        }

        items.forEach((item) => {
            const card =
                document.createElement("div");

            card.className = "shop-card";

            card.innerHTML = `
                <div class="shop-icon">
                    ${escapeHtml(item.icon || "✦")}
                </div>

                <div class="shop-info">
                    <div class="shop-name">
                        ${escapeHtml(item.name)}
                    </div>

                    <div class="shop-amount">
                        Получишь:
                        <strong>
                            +${formatNumber(item.amount)}
                        </strong>
                    </div>

                    <div class="shop-price">
                        Цена:
                        <strong>
                            ${formatNumber(item.price)}
                        </strong>
                        кликов
                    </div>

                    <button
                        class="shop-buy"
                        data-item-id="${escapeHtml(item.id)}"
                    >
                        Купить
                    </button>
                </div>
            `;

            shopGrid.appendChild(card);
        });

        document
            .querySelectorAll(".shop-buy")
            .forEach((button) => {
                button.addEventListener(
                    "click",
                    () => {
                        buyItem(
                            button.dataset.itemId,
                            button
                        );
                    }
                );
            });
    }

    async function buyItem(itemId, button) {
        if (!button) return;

        button.disabled = true;
        button.textContent = "Покупка...";

        showMessage("");

        try {
            const response = await fetch(
                "/api/shop/buy",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        itemId
                    })
                }
            );

            const data = await response.json();

            if (response.status === 401) {
                window.location.replace(
                    "/login.html"
                );
                return;
            }

            if (!response.ok || !data.success) {
                showMessage(
                    data.message ||
                    "Покупка не удалась.",
                    "error"
                );
                return;
            }

            showMessage(
                "Покупка успешно совершена!",
                "success"
            );

            const clicksElement =
                document.getElementById("clicks");

            if (
                clicksElement &&
                data.clicks !== undefined
            ) {
                clicksElement.textContent =
                    formatNumber(data.clicks);
            }
        } catch (error) {
            console.error(
                "BUY ERROR:",
                error
            );

            showMessage(
                "Ошибка соединения с сервером.",
                "error"
            );
        } finally {
            button.disabled = false;
            button.textContent = "Купить";
        }
    }

    loadShop();
});