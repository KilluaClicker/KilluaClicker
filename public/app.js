document.addEventListener("DOMContentLoaded", () => {
    const clickButton = document.getElementById("clickButton");
    const clicksElement = document.getElementById("clicks");
    const clickPowerElement = document.getElementById("clickPower");

    const rebirthCountElement =
        document.getElementById("rebirthCount");

    const rebirthMultiplierElement =
        document.getElementById("rebirthMultiplier");

    const rebirthPriceElement =
        document.getElementById("rebirthPrice");

    const rebirthButton =
        document.getElementById("rebirthButton");

    const rebirthMessage =
        document.getElementById("rebirthMessage");

    let currentClicks = 0n;
    let currentClickPower = 1n;

    let currentRebirths = 0;
    let currentMultiplier = "1";
    let nextRebirth = null;

    let clickBusy = false;
    let rebirthBusy = false;

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
            let unitIndex = 0;

            while (number >= 1000n && unitIndex < units.length - 1) {
                number /= 1000n;
                unitIndex++;
            }

            return `${number.toString()} ${units[unitIndex]}`;
        } catch {
            return String(value);
        }
    }

    function updateClicks(value) {
        currentClicks = BigInt(String(value));

        if (clicksElement) {
            clicksElement.textContent =
                formatNumber(currentClicks);
        }

        updateRebirthButton();
    }

    function updateClickPower(value) {
        currentClickPower = BigInt(String(value));

        if (clickPowerElement) {
            clickPowerElement.textContent =
                formatNumber(currentClickPower);
        }
    }

    function updateGameData(user) {
        if (!user) {
            return;
        }

        if (user.clicks !== undefined) {
            updateClicks(user.clicks);
        }

        if (user.click_power !== undefined) {
            updateClickPower(user.click_power);
        }

        if (user.rebirths !== undefined) {
            currentRebirths = Number(user.rebirths);

            if (rebirthCountElement) {
                rebirthCountElement.textContent =
                    currentRebirths;
            }
        }

        if (user.rebirth_multiplier !== undefined) {
            currentMultiplier =
                String(user.rebirth_multiplier);

            if (rebirthMultiplierElement) {
                rebirthMultiplierElement.textContent =
                    `x${currentMultiplier}`;
            }
        }

        updateRebirthButton();
    }

    async function loadGame() {
        try {
            const response =
                await fetch("/api/me", {
                    credentials: "include"
                });

            if (!response.ok) {
                return;
            }

            const data = await response.json();

            if (data.user) {
                updateGameData(data.user);
            }

            await loadRebirths();
        } catch (error) {
            console.error(
                "Ошибка загрузки игры:",
                error
            );
        }
    }

    async function loadRebirths() {
        try {
            const response =
                await fetch("/api/rebirths", {
                    credentials: "include"
                });

            if (!response.ok) {
                return;
            }

            const data = await response.json();

            currentRebirths =
                Number(data.current_rebirths || 0);

            currentMultiplier =
                String(
                    data.current_multiplier || "1"
                );

            /*
             * Сервер может возвращать:
             * data.next
             * или
             * data.next_rebirth
             */
            nextRebirth =
                data.next_rebirth ||
                data.next ||
                null;

            if (rebirthCountElement) {
                rebirthCountElement.textContent =
                    currentRebirths;
            }

            if (rebirthMultiplierElement) {
                rebirthMultiplierElement.textContent =
                    `x${currentMultiplier}`;
            }

            if (rebirthPriceElement) {
                if (nextRebirth) {
                    rebirthPriceElement.textContent =
                        formatNumber(
                            nextRebirth.price
                        );
                } else {
                    rebirthPriceElement.textContent =
                        "MAX";
                }
            }

            updateRebirthButton();
        } catch (error) {
            console.error(
                "Ошибка загрузки перерождений:",
                error
            );
        }
    }

    function updateRebirthButton() {
        if (!rebirthButton) {
            return;
        }

        if (!nextRebirth) {
            rebirthButton.disabled = true;

            if (rebirthMessage) {
                rebirthMessage.textContent =
                    "Вы достигли максимального перерождения!";
            }

            return;
        }

        let price;

        try {
            price = BigInt(
                String(nextRebirth.price)
            );
        } catch {
            rebirthButton.disabled = true;
            return;
        }

        const canRebirth =
            currentClicks >= price &&
            !rebirthBusy;

        rebirthButton.disabled =
            !canRebirth;

        if (rebirthMessage) {
            if (currentClicks >= price) {
                rebirthMessage.textContent =
                    "Вы можете сделать перерождение!";
            } else {
                const remaining =
                    price - currentClicks;

                rebirthMessage.textContent =
                    `Нужно ещё ${formatNumber(
                        remaining
                    )} кликов`;
            }
        }
    }

    async function makeClick() {
        if (clickBusy) {
            return;
        }

        clickBusy = true;

        try {
            const response =
                await fetch("/api/click", {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type":
                            "application/json"
                    }
                });

            const data =
                await response.json();

            if (!response.ok) {
                console.error(
                    data.message ||
                    "Ошибка клика"
                );

                return;
            }

            if (data.user) {
                updateGameData(data.user);
            } else if (
                data.clicks !== undefined
            ) {
                updateClicks(data.clicks);
            }
        } catch (error) {
            console.error(
                "Ошибка клика:",
                error
            );
        } finally {
            clickBusy = false;
        }
    }

    async function makeRebirth() {
        if (rebirthBusy) {
            return;
        }

        if (!nextRebirth) {
            return;
        }

        let price;

        try {
            price = BigInt(
                String(nextRebirth.price)
            );
        } catch {
            return;
        }

        if (currentClicks < price) {
            if (rebirthMessage) {
                rebirthMessage.textContent =
                    "Недостаточно кликов!";
            }

            return;
        }

        rebirthBusy = true;
        updateRebirthButton();

        try {
            const response =
                await fetch("/api/rebirth", {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type":
                            "application/json"
                    }
                });

            const data =
                await response.json();

            if (!response.ok) {
                if (rebirthMessage) {
                    rebirthMessage.textContent =
                        data.message ||
                        "Не удалось сделать перерождение";
                }

                return;
            }

            if (data.user) {
                updateGameData(data.user);
            }

            if (rebirthMessage) {
                rebirthMessage.textContent =
                    "Перерождение успешно!";
            }

            await loadRebirths();
        } catch (error) {
            console.error(
                "Ошибка перерождения:",
                error
            );

            if (rebirthMessage) {
                rebirthMessage.textContent =
                    "Ошибка соединения с сервером";
            }
        } finally {
            rebirthBusy = false;
            updateRebirthButton();
        }
    }

    if (clickButton) {
        clickButton.addEventListener(
            "click",
            makeClick
        );
    }

    if (rebirthButton) {
        rebirthButton.addEventListener(
            "click",
            makeRebirth
        );
    }

    loadGame();
});