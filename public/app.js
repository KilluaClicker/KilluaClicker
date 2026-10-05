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
        } catch {
            return "0";
        }
    }

    function updateClickPower() {
        let powerElement =
            document.getElementById("clickPower");

        if (!powerElement) {
            const stats =
                document.querySelector(".stats");

            if (stats) {
                const powerCard =
                    document.createElement("div");

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

    /*
     * =====================================================
     * АДМИН-ПАНЕЛЬ
     * =====================================================
     */

    function updateAdminInterface(user, impersonating = false) {
        /*
         * Ищем уже существующую кнопку админки.
         * Если её нет — создаём.
         */

        let adminButton =
            document.getElementById("adminPanelButton");

        /*
         * Если мы вошли в аккаунт другого игрока
         * через админку — показываем кнопку возврата.
         */
        let returnButton =
            document.getElementById("returnAdminButton");

        if (user && user.is_admin === true && !impersonating) {

            if (!adminButton) {
                adminButton =
                    document.createElement("button");

                adminButton.id =
                    "adminPanelButton";

                adminButton.type = "button";

                adminButton.textContent =
                    "⚙️ Админ-панель";

                /*
                 * Стили специально здесь,
                 * чтобы кнопка появилась даже если
                 * в index.html её раньше не было.
                 */
                adminButton.style.cssText = `
                    display: block;
                    width: 100%;
                    margin-top: 12px;
                    padding: 13px 18px;
                    border: 0;
                    border-radius: 12px;
                    background: linear-gradient(135deg, #6d35d9, #9b59ff);
                    color: white;
                    font-size: 15px;
                    font-weight: 700;
                    cursor: pointer;
                    box-shadow: 0 8px 25px rgba(120, 60, 220, .25);
                `;

                adminButton.addEventListener(
                    "click",
                    () => {
                        window.location.href =
                            "/admin.html";
                    }
                );

                /*
                 * Пытаемся поставить кнопку рядом
                 * с кнопкой выхода.
                 */
                if (logoutButton) {
                    logoutButton.parentElement
                        ?.appendChild(adminButton);
                } else {
                    document.body
                        .appendChild(adminButton);
                }
            }

            adminButton.style.display = "block";
        } else {
            if (adminButton) {
                adminButton.style.display = "none";
            }
        }

        /*
         * =================================================
         * ВОЗВРАТ ИЗ ЧУЖОГО АККАУНТА
         * =================================================
         */

        if (impersonating) {

            if (!returnButton) {
                returnButton =
                    document.createElement("button");

                returnButton.id =
                    "returnAdminButton";

                returnButton.type = "button";

                returnButton.textContent =
                    "↩️ Вернуться в админку";

                returnButton.style.cssText = `
                    position: fixed;
                    top: 15px;
                    right: 15px;
                    z-index: 99999;
                    padding: 13px 18px;
                    border: 0;
                    border-radius: 12px;
                    background: linear-gradient(135deg, #713bd1, #9b59ff);
                    color: white;
                    font-size: 14px;
                    font-weight: 700;
                    cursor: pointer;
                    box-shadow: 0 8px 25px rgba(0,0,0,.35);
                `;

                returnButton.addEventListener(
                    "click",
                    async () => {
                        try {
                            const response =
                                await fetch(
                                    "/api/admin/stop-impersonation",
                                    {
                                        method: "POST",
                                        credentials: "include",
                                        headers: {
                                            "Content-Type":
                                                "application/json"
                                        }
                                    }
                                );

                            const data =
                                await response.json();

                            if (
                                !response.ok ||
                                !data.success
                            ) {
                                alert(
                                    data.message ||
                                    "Не удалось вернуться в админку."
                                );

                                return;
                            }

                            window.location.href =
                                "/admin.html";

                        } catch (error) {
                            console.error(error);

                            alert(
                                "Ошибка возврата в админку."
                            );
                        }
                    }
                );

                document.body.appendChild(
                    returnButton
                );
            }

            returnButton.style.display = "block";

        } else {

            if (returnButton) {
                returnButton.style.display = "none";
            }
        }
    }

    function updateUser(user, impersonating = false) {
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

        try {
            clickPower = BigInt(
                String(user.click_power ?? "1")
            );
        } catch {
            clickPower = 1n;
        }

        updateClickPower();

        /*
         * ВАЖНО:
         * Проверяем is_admin, который приходит
         * непосредственно из users.is_admin.
         */
        updateAdminInterface(
            user,
            impersonating
        );
    }

    async function loadUser() {
        try {
            const response =
                await fetch("/api/me", {
                    credentials: "include"
                });

            const data =
                await response.json();

            if (!response.ok || !data.success) {
                window.location.href =
                    "/login.html";

                return;
            }

            if (!data.loggedIn || !data.user) {
                window.location.href =
                    "/login.html";

                return;
            }

            updateUser(
                data.user,
                data.impersonating === true
            );

        } catch (error) {
            console.error(
                "Ошибка загрузки пользователя:",
                error
            );
        }
    }

    async function makeClick() {
        if (
            !clickButton ||
            clickInProgress
        ) {
            return;
        }

        clickInProgress = true;

        clickButton.classList.add("pressed");
        clickButton.classList.add(
            "click-animation"
        );

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

            if (response.status === 401) {
                window.location.href =
                    "/login.html";

                return;
            }

            if (!response.ok || !data.success) {
                console.error(
                    data.message ||
                    "Ошибка клика."
                );

                return;
            }

            /*
             * При клике обновляем только данные,
             * не ломая информацию об админке.
             */
            updateUser(data.user);

        } catch (error) {
            console.error(
                "Ошибка клика:",
                error
            );

        } finally {
            setTimeout(() => {
                clickButton.classList.remove(
                    "pressed"
                );

                clickButton.classList.remove(
                    "click-animation"
                );

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
                    await fetch(
                        "/api/logout",
                        {
                            method: "POST",
                            credentials: "include"
                        }
                    );
                } catch (error) {
                    console.error(error);
                }

                window.location.href =
                    "/login.html";
            }
        );
    }

    loadUser();
});