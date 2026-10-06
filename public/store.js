"use strict";

const shopGrid = document.getElementById("shopGrid");
const shopMessage = document.getElementById("shopMessage");

let shopItems = [];

function formatNumber(value) {
    try {
        const n = BigInt(String(value));

        if (n < 1000n) {
            return n.toString();
        }

        const units = [
            { value: 1000000000000000000000n, name: "секст." },
            { value: 1000000000000000n, name: "квадр." },
            { value: 1000000000n, name: "млрд" },
            { value: 1000000n, name: "млн" },
            { value: 1000n, name: "тыс." }
        ];

        for (const unit of units) {
            if (n >= unit.value) {
                const whole = n / unit.value;
                const remainder = n % unit.value;

                if (remainder === 0n) {
                    return `${whole} ${unit.name}`;
                }

                const decimal =
                    Number(remainder * 100n / unit.value) / 100;

                return `${Number(whole) + decimal} ${unit.name}`;
            }
        }

        return n.toString();

    } catch {
        return String(value);
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

function showMessage(text, error = false) {
    if (!shopMessage) {
        return;
    }

    shopMessage.textContent = text;
    shopMessage.style.color = error
        ? "#ff6b6b"
        : "#aaa";
}

async function loadShop() {
    try {
        const response = await fetch(
            "/api/shop",
            {
                credentials: "same-origin",
                cache: "no-store"
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.message ||
                "Не удалось загрузить магазин."
            );
        }

        shopItems = Array.isArray(data.items)
            ? data.items
            : [];

        renderShop();

    } catch (error) {
        console.error(
            "SHOP LOAD ERROR:",
            error
        );

        showMessage(
            error.message,
            true
        );
    }
}

function renderShop() {
    if (!shopGrid) {
        return;
    }

    if (shopItems.length === 0) {
        shopGrid.innerHTML = `
            <div style="
                text-align:center;
                color:#777;
                padding:30px;
            ">
                Магазин пуст.
            </div>
        `;

        return;
    }

    shopGrid.innerHTML = shopItems.map(item => {
        return `
            <div class="shop-card">

                <div class="shop-icon">
                    ${escapeHtml(item.icon || "✦")}
                </div>

                <div class="shop-name">
                    ${escapeHtml(item.name)}
                </div>

                <div class="shop-price">
                    ${formatNumber(item.price)} кликов
                </div>

                <div style="
                    display:flex;
                    gap:8px;
                    width:100%;
                    margin-top:12px;
                ">

                    <button
                        class="shop-buy"
                        data-item-id="${escapeHtml(item.id)}"
                        style="
                            flex:1;
                            min-width:120px;
                        "
                    >
                        Купить
                    </button>

                    <button
                        class="shop-buy"
                        data-buy-max="true"
                        data-item-id="${escapeHtml(item.id)}"
                        style="
                            flex:1;
                            min-width:120px;
                        "
                    >
                        Купить всё
                    </button>

                </div>

            </div>
        `;
    }).join("");

    attachShopEvents();
}

function attachShopEvents() {

    document
        .querySelectorAll(
            ".shop-buy:not([data-buy-max])"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    const itemId =
                        button.dataset.itemId;

                    await buyItem(
                        itemId,
                        button
                    );
                }
            );
        });

    document
        .querySelectorAll(
            ".shop-buy[data-buy-max]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    const itemId =
                        button.dataset.itemId;

                    await buyMaxItem(
                        itemId,
                        button
                    );
                }
            );
        });
}

async function buyItem(itemId, button) {

    if (button.disabled) {
        return;
    }

    button.disabled = true;

    const oldText =
        button.textContent;

    button.textContent =
        "Покупка...";

    try {

        const response = await fetch(
            "/api/shop/buy",
            {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    itemId
                })
            }
        );

        const data =
            await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.message ||
                "Не удалось купить предмет."
            );
        }

        showMessage(
            `Куплено: ${data.item?.name || "улучшение"}`
        );

        if (
            typeof window.loadUser ===
            "function"
        ) {
            await window.loadUser();
        }

    } catch (error) {

        console.error(
            "SHOP BUY ERROR:",
            error
        );

        showMessage(
            error.message,
            true
        );

    } finally {

        button.disabled = false;
        button.textContent = oldText;
    }
}

async function buyMaxItem(itemId, button) {

    if (button.disabled) {
        return;
    }

    button.disabled = true;

    const oldText =
        button.textContent;

    button.textContent =
        "Покупка...";

    try {

        const response = await fetch(
            "/api/shop/buy-max",
            {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    itemId
                })
            }
        );

        const data =
            await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.message ||
                "Не удалось купить всё."
            );
        }

        const quantity =
            data.quantity ?? 0;

        if (quantity > 0) {

            showMessage(
                `Куплено всё: ${quantity} шт.`
            );

        } else {

            showMessage(
                "Недостаточно кликов.",
                true
            );
        }

        if (
            typeof window.loadUser ===
            "function"
        ) {
            await window.loadUser();
        }

    } catch (error) {

        console.error(
            "SHOP BUY MAX ERROR:",
            error
        );

        showMessage(
            error.message,
            true
        );

    } finally {

        button.disabled = false;
        button.textContent = oldText;
    }
}

loadShop();