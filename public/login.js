document.addEventListener("DOMContentLoaded", () => {

    const loginForm = document.getElementById("loginForm");

    const loginUsername =
        document.getElementById("loginUsername");

    const loginPassword =
        document.getElementById("loginPassword");

    const loginButton =
        document.getElementById("loginButton");


    const registerForm =
        document.getElementById("registerForm");

    const registerUsername =
        document.getElementById("registerUsername");

    const registerPassword =
        document.getElementById("registerPassword");

    const registerButton =
        document.getElementById("registerButton");


    const showRegister =
        document.getElementById("showRegister");

    const hideRegister =
        document.getElementById("hideRegister");

    const registerBox =
        document.getElementById("registerBox");

    const message =
        document.getElementById("message");


    // =================================================
    // MESSAGE
    // =================================================

    function showMessage(text, type = "error") {
        message.textContent = text;

        message.className = "auth-message";

        if (type === "success") {
            message.classList.add("success");
        }

        if (type === "error") {
            message.classList.add("error");
        }

        if (type === "info") {
            message.classList.add("info");
        }
    }


    function clearMessage() {
        message.textContent = "";
        message.className = "auth-message";
    }


    // =================================================
    // REGISTER BOX
    // =================================================

    showRegister.addEventListener("click", () => {
        clearMessage();

        registerBox.style.display = "block";

        showRegister.style.display = "none";

        setTimeout(() => {
            registerUsername.focus();
        }, 50);
    });


    hideRegister.addEventListener("click", () => {
        clearMessage();

        registerBox.style.display = "none";

        showRegister.style.display = "block";

        registerForm.reset();

        loginUsername.focus();
    });


    // =================================================
    // LOGIN
    // =================================================

    loginForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        clearMessage();

        const username =
            loginUsername.value.trim();

        const password =
            loginPassword.value;


        if (!username || !password) {
            showMessage(
                "Введите логин и пароль",
                "error"
            );

            return;
        }


        loginButton.disabled = true;

        loginButton.textContent = "Вход...";


        try {

            const response = await fetch(
                "/api/login",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    credentials: "include",

                    body: JSON.stringify({
                        username,
                        password
                    })
                }
            );


            const data = await response.json();


            if (!response.ok || !data.success) {

                showMessage(
                    data.message ||
                    "Не удалось войти",
                    "error"
                );

                return;
            }


            showMessage(
                "Вход выполнен! Переходим...",
                "success"
            );


            /*
             * ВАЖНО:
             * replace, а не href.
             * Поэтому страница входа не останется
             * в истории браузера.
             */

            setTimeout(() => {
                window.location.replace("/");
            }, 200);


        } catch (error) {

            console.error(error);

            showMessage(
                "Ошибка соединения с сервером",
                "error"
            );

        } finally {

            loginButton.disabled = false;

            loginButton.textContent = "Войти";
        }
    });


    // =================================================
    // REGISTER
    // =================================================

    registerForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            clearMessage();

            const username =
                registerUsername.value.trim();

            const password =
                registerPassword.value;


            if (!username || !password) {

                showMessage(
                    "Заполните все поля",
                    "error"
                );

                return;
            }


            if (username.length < 3) {

                showMessage(
                    "Логин должен быть минимум 3 символа",
                    "error"
                );

                return;
            }


            if (password.length < 4) {

                showMessage(
                    "Пароль должен быть минимум 4 символа",
                    "error"
                );

                return;
            }


            registerButton.disabled = true;

            registerButton.textContent =
                "Регистрация...";


            try {

                const response = await fetch(
                    "/api/register",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        credentials: "include",

                        body: JSON.stringify({
                            username,
                            password
                        })
                    }
                );


                const data = await response.json();


                if (!response.ok || !data.success) {

                    showMessage(
                        data.message ||
                        "Не удалось зарегистрироваться",
                        "error"
                    );

                    return;
                }


                showMessage(
                    "Аккаунт создан! Переходим...",
                    "success"
                );


                /*
                 * После регистрации сервер уже
                 * создаёт сессию.
                 */

                setTimeout(() => {
                    window.location.replace("/");
                }, 200);


            } catch (error) {

                console.error(error);

                showMessage(
                    "Ошибка соединения с сервером",
                    "error"
                );

            } finally {

                registerButton.disabled = false;

                registerButton.textContent =
                    "Зарегистрироваться";
            }
        }
    );


    // =================================================
    // START
    // =================================================

    loginUsername.focus();

});