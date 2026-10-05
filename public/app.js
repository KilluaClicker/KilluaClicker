"use strict";


const usernameEl =
    document.getElementById("username");

const clicksEl =
    document.getElementById("clicks");

const miniClicksEl =
    document.getElementById("miniClicks");

const rankEl =
    document.getElementById("rank");

const clickButton =
    document.getElementById("clickButton");

const logoutBtn =
    document.getElementById("logoutBtn");

const adminLink =
    document.getElementById("adminLink");

const toastEl =
    document.getElementById("toast");


let currentUser = null;
let clicking = false;
let toastTimer = null;


function formatNumber(value) {

    try {

        return BigInt(value).toLocaleString("ru-RU");

    } catch {

        return String(value);

    }

}


function updateClicks(value) {

    const formatted =
        formatNumber(value);

    clicksEl.textContent =
        formatted;

    miniClicksEl.textContent =
        formatted;

}


function showToast(message) {

    if (!toastEl) {
        return;
    }

    toastEl.textContent =
        message;

    toastEl.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {

        toastEl.classList.remove("show");

    }, 2200);

}


async function loadUser() {

    try {

        const response =
            await fetch("/api/me", {
                method: "GET",
                credentials: "include",
                cache: "no-store"
            });


        if (!response.ok) {

            usernameEl.textContent =
                "Не авторизован";

            return;

        }


        const data =
            await response.json();


        if (!data.success || !data.user) {

            usernameEl.textContent =
                "Не авторизован";

            return;

        }


        currentUser =
            data.user;


        usernameEl.textContent =
            currentUser.username;


        updateClicks(
            currentUser.clicks
        );


        if (
            currentUser.username ===
            "Killua666"
        ) {

            adminLink.style.display =
                "flex";

        }


        await loadRank();

    } catch (error) {

        console.error(error);

        usernameEl.textContent =
            "Ошибка соединения";

    }

}


async function loadRank() {

    if (!currentUser) {
        return;
    }


    try {

        const response =
            await fetch("/api/top", {
                method: "GET",
                credentials: "include",
                cache: "no-store"
            });


        if (!response.ok) {
            return;
        }


        const data =
            await response.json();


        if (
            !data.success ||
            !Array.isArray(data.users)
        ) {

            return;

        }


        const index =
            data.users.findIndex(
                user =>
                    user.username ===
                    currentUser.username
            );


        rankEl.textContent =
            index >= 0
                ? "#" + (index + 1)
                : "—";


    } catch (error) {

        console.error(error);

    }

}


async function makeClick() {

    if (clicking) {
        return;
    }


    clicking = true;


    clickButton.classList.add(
        "pressed"
    );


    try {

        const response =
            await fetch("/api/click", {
                method: "POST",

                credentials: "include",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                cache: "no-store",

                body: JSON.stringify({})
            });


        const data =
            await response.json();


        if (
            response.status === 401
        ) {

            showToast(
                "Сессия закончилась. Войдите снова."
            );

            return;

        }


        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Ошибка клика"
            );

        }


        if (
            data.clicks !== undefined
        ) {

            currentUser.clicks =
                data.clicks;

            updateClicks(
                data.clicks
            );

        }


    } catch (error) {

        console.error(error);

        showToast(
            error.message ||
            "Ошибка клика"
        );

    } finally {

        setTimeout(() => {

            clickButton.classList.remove(
                "pressed"
            );

            clicking = false;

        }, 40);

    }

}


clickButton.addEventListener(
    "click",
    function(event) {

        event.preventDefault();
        event.stopPropagation();

        makeClick();

    }
);


document.addEventListener(
    "submit",
    function(event) {

        event.preventDefault();

    }
);


document.addEventListener(
    "keydown",
    function(event) {

        if (
            event.code !== "Space"
        ) {
            return;
        }


        const active =
            document.activeElement;


        if (
            active &&
            (
                active.tagName === "INPUT" ||
                active.tagName === "TEXTAREA"
            )
        ) {

            return;

        }


        event.preventDefault();

        makeClick();

    }
);


logoutBtn.addEventListener(
    "click",
    async function(event) {

        event.preventDefault();
        event.stopPropagation();


        logoutBtn.disabled = true;

        logoutBtn.textContent =
            "Выход...";


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


        /*
         * Здесь переход происходит только
         * после нажатия пользователем "Выйти".
         */

        window.location.href = "/";

    }
);


loadUser();