document.addEventListener("DOMContentLoaded", () => {
    const shopGrid =
        document.getElementById("shopGrid");

    const shopMessage =
        document.getElementById("shopMessage");

    let shopItems = [];

    function formatNumber(value) {
        try {
            const n =
                BigInt(String(value));

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
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function showMessage(text, type = "") {
        if (!shopMessage) {
            return;
        }

        shopMessage.textContent = text;
        shopMessage.className = "shop-message";

        if (type) {
            shopMessage.classList.add(type);
        }
    }

    async function loadShop() {
        try {
            const response = await fetch(
                "/api/shop",
                {
                    credentials: "include",
                    cache: "no-store"
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
                    "Не удалось загрузить магазин.",
                    "error"
                );
                return;
            }

            shopItems =
                Array.isArray(data.items)
                    ? data.items
                    : [];

            renderShop(shopItems);

        } catch (error) {
            console.error(
                "SHOP ERROR:",
                error
            );

            showMessage(
                "Ошибка соединения с сервером.",
                "error"
            );
        }
    }

    function renderShop(items) {
        if (!shopGrid) {
            return;
        }

        shopGrid.innerHTML = "";

        if (
            !Array.isArray(items) ||
            items.length === 0
        ) {
            shopGrid.innerHTML = `
                <div class="empty-state">
                    Магазин пока пуст.
                </div>
            `;
            return;
        }

        items.forEach(item => {
            const card =
                document.createElement("div");

            card.className =
                "shop-card";

            card.innerHTML = `
                <div class="shop-icon">
                    ${escapeHtml(
                        item.icon || "✦"
                    )}
                </div>

                <div class="shop-info">

                    <div class="shop-name">
                        ${escapeHtml(
                            item.name
                        )}
                    </div>

                    <div class="shop-amount">
                        Получишь:
                        <strong>
                            +${formatNumber(
                                item.amount
                            )}
                        </strong>
                        к клику
                    </div>

                    <div class="shop-price">
                        Цена:
                        <strong>
                            ${formatNumber(
                                item.price
                            )}
                        </strong>
                        кликов
                    </div>

                    <div
                        class="shop-buttons"
                        style="
                            display:flex;
                            gap:8px;
                            flex-wrap:wrap;
                            margin-top:12px;
                        "
                    >

                        <button
                            class="shop-buy"
                            data-item-id="${escapeHtml(
                                item.id
                            )}"
                            style="
                                flex:1;
                                min-width:120px;
                            "
                        >
                            Купить
                        </button>

                        <button
                            class="shop-buy-max"
                            data-item-id="${escapeHtml(
                                item.id
                            )}"
                            style="
                                flex:1;
                                min-width:120px;
                            "
                        >
                            🛒 Купить всё
                        </button>

                    </div>

                </div>
            `;

            shopGrid.appendChild(card);
        });

        document
            .querySelectorAll(".shop-buy")
            .forEach(button => {
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

        document
            .querySelectorAll(".shop-buy-max")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    () => {
                        buyMaxItem(
                            button.dataset.itemId,
                            button
                        );
                    }
                );
            });
    }

    async function buyItem(
        itemId,
        button
    ) {
        if (!button) {
            return;
        }

        button.disabled = true;
        button.textContent =
            "Покупка...";

        showMessage("");

        try {
            const response =
                await fetch(
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

            const data =
                await response.json();

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
                "✅ Покупка успешно совершена!",
                "success"
            );

            updateBalanceFromResponse(data);

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

    /*
     * =====================================================
     * КУПИТЬ НА ВСЕ ДЕНЬГИ
     * =====================================================
     */

    async function buyMaxItem(
        itemId,
        button
    ) {
        if (!button) {
            return;
        }

        const item =
            shopItems.find(
                x =>
                    String(x.id) ===
                    String(itemId)
            );

        if (!item) {
            showMessage(
                "Товар не найден.",
                "error"
            );
            return;
        }

        /*
         * БЕЗ confirm
         *
         * Нажал «Купить всё» —
         * сразу покупаем максимально
         * возможное количество.
         */

        button.disabled = true;
        button.textContent =
            "Покупка...";

        showMessage("");

        try {
            const response =
                await fetch(
                    "/api/shop/buy-max",
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

            const data =
                await response.json();

            if (response.status === 401) {
                window.location.replace(
                    "/login.html"
                );
                return;
            }

            if (!response.ok || !data.success) {
                showMessage(
                    data.message ||
                    "Не удалось купить товар.",
                    "error"
                );
                return;
            }

            const quantity =
                data.quantity ?? "0";

            const spent =
                data.spent ?? "0";

            const powerGain =
                data.power_gain ?? "0";

            showMessage(
                `🛒 Куплено: ${formatNumber(quantity)} шт. | Потрачено: ${formatNumber(spent)} | +${formatNumber(powerGain)} к клику`,
                "success"
            );

            updateBalanceFromResponse(data);

            /*
             * Обновляем силу клика
             */

            const powerElement =
                document.getElementById(
                    "clickPower"
                );

            if (
                powerElement &&
                data.user &&
                data.user.click_power !==
                    undefined
            ) {
                powerElement.textContent =
                    "+" +
                    formatNumber(
                        data.user.click_power
                    );
            }

        } catch (error) {
            console.error(
                "BUY MAX ERROR:",
                error
            );

            showMessage(
                "Ошибка соединения с сервером.",
                "error"
            );

        } finally {
            button.disabled = false;
            button.textContent =
                "🛒 Купить всё";
        }
    }

    function updateBalanceFromResponse(data) {
        const clicksElement =
            document.getElementById(
                "clicks"
            );

        if (
            clicksElement &&
            data.user &&
            data.user.clicks !== undefined
        ) {
            clicksElement.textContent =
                formatNumber(
                    data.user.clicks
                );

            return;
        }

        if (
            clicksElement &&
            data.clicks !== undefined
        ) {
            clicksElement.textContent =
                formatNumber(
                    data.clicks
                );
        }
    }

    loadShop();
});