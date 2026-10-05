document.addEventListener("DOMContentLoaded", () => {
    const clickButton = document.getElementById("clickButton");
    const clicksElement = document.getElementById("clicks");
    const usernameElement = document.getElementById("username");
    const logoutButton = document.getElementById("logoutButton");

    let clickPower = 1n;
    let clickInProgress = false;

    function formatNumber(value) {
        try {
            const number = BigInt(String(value));

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
                        Number(remainder) / Number(unit.value);

                    const formatted = decimal
                        .toFixed(2)
                        .replace(/\.?0+$/, "");

                    return `${whole}${formatted.slice(1)} ${unit.name}`;
                }
            }

            return number.toString();
        } catch (error) {
            return "0";
        }
    }

    function updateClickPower() {
        let powerElement = document.getElementById("clickPower");

        if (!powerElement) {
            const stats = document.querySelector(".stats");

            if (stats) {
                const powerCard = document.createElement("div");

                powerCard.className = "stat-card";
                powerCard.innerHTML = `
                    <div class="stat-label">За клик</div>
                    <div class="stat-value" id="clickPower">+1</div>
                `;

                stats.appendChild(powerCard);
                powerElement =
                    document.getElementById("clickPower");
            }
        }

        if (powerElement) {
            powerElement.textContent =
                "+" + formatNumber(clickPower);
        }
    }

    function updateUser(user) {
        if (!user) {
            return;
        }

        if (usernameElement) {
            usernameElement.textContent =
                user.username || "";
        }

        if (clicksElement) {
            clicksElement.textContent =
                formatNumber(user.clicks ?? 0);
        }

        /*
         * Главное исправление:
         * сервер теперь возвращает click_power.
         *
         * Если по какой-то причине старый сервер
         * не прислал это поле — используем 1,
         * поэтому undefined больше не появится.
         */
        try {
            clickPower = BigInt(
                String(user.click_power ?? "1")
            );
        } catch {
            clickPower = 1n;
        }

        updateClickPower();
    }

    async function loadUser() {
        try {
            const response = await fetch("/api/me", {
                credentials: "include"
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                window.location.href = "/login.html";
                return;
            }

            updateUser(data.user);
        } catch (error) {
            console.error(
                "Ошибка загрузки пользователя:",
                error
            );
        }
    }

    async function makeClick() {
        if (!clickButton || clickInProgress) {
            return;
        }

        clickInProgress = true;

        clickButton.classList.add("pressed");
        clickButton.classList.add("click-animation");

        try {
            const response = await fetch("/api/click", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                }
            });

            const data = await response.json();

            if (response.status === 401) {
                window.location.href = "/login.html";
                return;
            }

            if (!response.ok || !data.success) {
                console.error(
                    data.message || "Ошибка клика."
                );
                return;
            }

            updateUser(data.user);
        } catch (error) {
            console.error(
                "Ошибка клика:",
                error
            );
        } finally {
            setTimeout(() => {
                clickButton.classList.remove("pressed");
                clickButton.classList.remove("click-animation");
                clickInProgress = false;
            }, 30);
        }
    }

    if (clickButton) {
        clickButton.addEventListener(
            "click",
            makeClick
        );
    }

    if (logoutButton) {
        logoutButton.addEventListener(
            "click",
            async () => {
                try {
                    await fetch("/api/logout", {
                        method: "POST",
                        credentials: "include"
                    });
                } catch (error) {
                    console.error(error);
                }

                window.location.href = "/login.html";
            }
        );
    }

    loadUser();
});