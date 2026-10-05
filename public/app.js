document.addEventListener("DOMContentLoaded", () => {
    const clickButton = document.getElementById("clickButton");
    const clicksElement = document.getElementById("clicks");
    const usernameElement = document.getElementById("username");
    const logoutButton = document.getElementById("logoutButton");

    let clickInProgress = false;

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

    function showClicks(value) {
        if (!clicksElement) return;

        clicksElement.textContent = formatNumber(value);
    }

    async function loadUser() {
        try {
            const response = await fetch("/api/me", {
                credentials: "include",
                cache: "no-store"
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                window.location.replace("/login.html");
                return;
            }

            if (usernameElement) {
                usernameElement.textContent =
                    data.user.username;
            }

            showClicks(data.user.clicks);
        } catch (error) {
            console.error("Ошибка загрузки пользователя:", error);
        }
    }

    async function makeClick() {
        if (!clickButton) return;

        /*
         * Не ставим длинный cooldown.
         * Один запрос может идти одновременно,
         * но следующий можно отправить сразу после ответа.
         */
        if (clickInProgress) {
            return;
        }

        clickInProgress = true;

        try {
            const response = await fetch("/api/click", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "include",
                cache: "no-store"
            });

            const data = await response.json();

            if (response.status === 401) {
                window.location.replace("/login.html");
                return;
            }

            if (!response.ok || !data.success) {
                console.error(
                    data.message || "Ошибка клика"
                );
                return;
            }

            showClicks(data.clicks);

            clickButton.classList.remove("click-animation");

            /*
             * Перезапускаем маленькую анимацию,
             * но без задержки между кликами.
             */
            void clickButton.offsetWidth;

            clickButton.classList.add("click-animation");
        } catch (error) {
            console.error("CLICK ERROR:", error);
        } finally {
            clickInProgress = false;
        }
    }

    async function logout() {
        if (logoutButton) {
            logoutButton.disabled = true;
        }

        try {
            await fetch("/api/logout", {
                method: "POST",
                credentials: "include"
            });
        } catch (error) {
            console.error(error);
        }

        window.location.replace("/login.html");
    }

    if (clickButton) {
        clickButton.addEventListener("click", makeClick);

        /*
         * Клик мышью без искусственного cooldown.
         */
        clickButton.addEventListener("mousedown", () => {
            clickButton.classList.add("pressed");
        });

        clickButton.addEventListener("mouseup", () => {
            clickButton.classList.remove("pressed");
        });

        clickButton.addEventListener("mouseleave", () => {
            clickButton.classList.remove("pressed");
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener("click", logout);
    }

    loadUser();
});