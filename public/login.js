document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");

    const showRegisterButton = document.getElementById("showRegister");
    const hideRegisterButton = document.getElementById("hideRegister");

    const registerBox = document.getElementById("registerBox");

    if (showRegisterButton) {
        showRegisterButton.addEventListener("click", () => {
            registerBox.classList.add("show");
            showMessage("");
        });
    }

    if (hideRegisterButton) {
        hideRegisterButton.addEventListener("click", () => {
            registerBox.classList.remove("show");
            showMessage("");
        });
    }

    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const username = document
                .getElementById("loginUsername")
                .value
                .trim();

            const password = document
                .getElementById("loginPassword")
                .value;

            if (!username || !password) {
                showMessage("Заполни логин и пароль", true);
                return;
            }

            const button = document.getElementById("loginButton");

            button.disabled = true;
            button.textContent = "Вход...";

            try {
                const response = await fetch("/api/login", {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        username,
                        password
                    })
                });

                const data = await response.json().catch(() => ({}));

                if (!response.ok || !data.success) {
                    showMessage(
                        data.error || "Не удалось войти",
                        true
                    );

                    return;
                }

                showMessage("Успешный вход!");

                setTimeout(() => {
                    window.location.href = "/";
                }, 300);

            } catch (error) {
                console.error(error);

                showMessage(
                    "Ошибка соединения с сервером",
                    true
                );

            } finally {
                button.disabled = false;
                button.textContent = "Войти";
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const username = document
                .getElementById("registerUsername")
                .value
                .trim();

            const password = document
                .getElementById("registerPassword")
                .value;

            if (!username || !password) {
                showMessage("Заполни все поля", true);
                return;
            }

            const button = document.getElementById("registerButton");

            button.disabled = true;
            button.textContent = "Регистрация...";

            try {
                const response = await fetch("/api/register", {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        username,
                        password
                    })
                });

                const data = await response.json().catch(() => ({}));

                if (!response.ok || !data.success) {
                    showMessage(
                        data.error || "Не удалось зарегистрироваться",
                        true
                    );

                    return;
                }

                showMessage("Аккаунт создан!");

                setTimeout(() => {
                    window.location.href = "/";
                }, 300);

            } catch (error) {
                console.error(error);

                showMessage(
                    "Ошибка соединения с сервером",
                    true
                );

            } finally {
                button.disabled = false;
                button.textContent = "Зарегистрироваться";
            }
        });
    }
});

function showMessage(message, error = false) {
    const element = document.getElementById("message");

    if (!element) {
        return;
    }

    element.textContent = message;

    element.className = "auth-message";

    if (error) {
        element.classList.add("error");
    }

    if (!message) {
        element.style.display = "none";
    } else {
        element.style.display = "block";
    }
}