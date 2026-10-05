```js
document.addEventListener("DOMContentLoaded", () => {

    const loginForm =
        document.getElementById("loginForm");

    const registerForm =
        document.getElementById("registerForm");

    const showRegister =
        document.getElementById("showRegister");

    const hideRegister =
        document.getElementById("hideRegister");

    const registerBox =
        document.getElementById("registerBox");

    const message =
        document.getElementById("message");

    // ==========================================
    // MESSAGE
    // ==========================================

    function showMessage(text, success = false) {
        message.textContent = text;

        message.style.display = "block";

        if (success) {
            message.classList.add("success");
        } else {
            message.classList.remove("success");
        }
    }

    // ==========================================
    // SHOW REGISTER
    // ==========================================

    showRegister.addEventListener("click", () => {
        registerBox.style.display = "block";
        showRegister.style.display = "none";

        message.textContent = "";
        message.style.display = "none";
    });

    // ==========================================
    // HIDE REGISTER
    // ==========================================

    hideRegister.addEventListener("click", () => {
        registerBox.style.display = "none";
        showRegister.style.display = "block";

        message.textContent = "";
        message.style.display = "none";
    });

    // ==========================================
    // LOGIN
    // ==========================================

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const username =
            document.getElementById("loginUsername")
                .value
                .trim();

        const password =
            document.getElementById("loginPassword")
                .value;

        if (!username || !password) {
            showMessage(
                "Введите логин и пароль."
            );

            return;
        }

        const button =
            document.getElementById("loginButton");

        button.disabled = true;
        button.textContent = "Вход...";

        try {
            const response = await fetch(
                "/api/login",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    credentials: "include",

                    body: JSON.stringify({
                        username,
                        password
                    })
                }
            );

            const data =
                await response.json();

            if (!response.ok || !data.success) {
                showMessage(
                    data.message ||
                    "Не удалось войти."
                );

                button.disabled = false;
                button.textContent = "Войти";

                return;
            }

            showMessage(
                "Вход выполнен! Переходим...",
                true
            );

            // СРАЗУ В КЛИКЕР
            window.location.replace("/");

        } catch (error) {
            console.error(error);

            showMessage(
                "Ошибка соединения с сервером."
            );

            button.disabled = false;
            button.textContent = "Войти";
        }
    });

    // ==========================================
    // REGISTER
    // ==========================================

    registerForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            const username =
                document.getElementById(
                    "registerUsername"
                )
                    .value
                    .trim();

            const password =
                document.getElementById(
                    "registerPassword"
                )
                    .value;

            if (!username || !password) {
                showMessage(
                    "Введите логин и пароль."
                );

                return;
            }

            const button =
                document.getElementById(
                    "registerButton"
                );

            button.disabled = true;
            button.textContent =
                "Регистрация...";

            try {
                const response =
                    await fetch(
                        "/api/register",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            credentials: "include",

                            body: JSON.stringify({
                                username,
                                password
                            })
                        }
                    );

                const data =
                    await response.json();

                if (
                    !response.ok ||
                    !data.success
                ) {
                    showMessage(
                        data.message ||
                        "Не удалось зарегистрироваться."
                    );

                    button.disabled = false;
                    button.textContent =
                        "Зарегистрироваться";

                    return;
                }

                showMessage(
                    "Аккаунт создан! Переходим...",
                    true
                );

                // СРАЗУ В КЛИКЕР
                window.location.replace("/");

            } catch (error) {
                console.error(error);

                showMessage(
                    "Ошибка соединения с сервером."
                );

                button.disabled = false;
                button.textContent =
                    "Зарегистрироваться";
            }
        }
    );
});
```
