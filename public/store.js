"use strict";


const usernameEl =
    document.getElementById("username");

const balanceEl =
    document.getElementById("balance");

const shopGrid =
    document.getElementById("shopGrid");

const logoutBtn =
    document.getElementById("logoutBtn");

const adminLink =
    document.getElementById("adminLink");

const toastEl =
    document.getElementById("toast");


let currentUser = null;
let toastTimer = null;


const STORE_ITEMS = [

    {
        id: "1",
        name: "+1 клик",
        amount: "1",
        price: "0",
        icon: "✦"
    },

    {
        id: "10",
        name: "+10 кликов",
        amount: "10",
        price: "5",
        icon: "✦"
    },

    {
        id: "100",
        name: "+100 кликов",
        amount: "100",
        price: "40",
        icon: "✦"
    },

    {
        id: "1000",
        name: "+1 000 кликов",
        amount: "1000",
        price: "350",
        icon: "⚡"
    },

    {
        id: "million",
        name: "+1 миллион",
        amount: "1000000",
        price: "300000",
        icon: "◆"
    },

    {
        id: "billion",
        name: "+1 миллиард",
        amount: "1000000000",
        price: "300000000",
        icon: "◆"
    },

    {
        id: "quadrillion",
        name: "+1 квадриллион",
        amount: "1000000000000000",
        price: "300000000000000",
        icon: "♛"
    },

    {
        id: "sextillion",
        name: "+1 сикстиллион",
        amount: "1000000000000000000000",
        price: "300000000000000000000",
        icon: "♛"
    }

];


function formatNumber(value) {

    try {

        return BigInt(value)
            .toLocaleString("ru-RU");

    } catch {

        return String(value);

    }

}


function showToast(message) {

    toastEl.textContent =
        message;

    toastEl.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {

        toastEl.classList.remove("show");

    }, 2200);

}


function updateBalance(value) {

    balanceEl.textContent =
        formatNumber(value);

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


        updateBalance(
            currentUser.clicks
        );


        if (
            currentUser.username ===
            "Killua666"
        ) {

            adminLink.style.display =
                "flex";

        }


        renderShop();


    } catch (error) {

        console.error(error);

        usernameEl.textContent =
            "Ошибка соединения";

    }

}


function renderShop() {

    shopGrid.innerHTML = "";


    STORE_ITEMS.forEach(item => {

        const card =
            document.createElement("div");


        card.className =
            "stat-card shop-card";


        card.innerHTML = `

            <div class="stat-icon purple">
                ${item.icon}
            </div>

            <div class="shop-info">

                <div class="stat-label">
                    ПАКЕТ КЛИКОВ
                </div>

                <div class="shop-name">
                    ${item.name}
                </div>

                <div class="shop-price">
                    Цена:
                    <strong>
                        ${formatNumber(item.price)}
                    </strong>
                    кликов
                </div>

                <button
                    type="button"
                    class="shop-buy"
                    data-id="${item.id}"
                >
                    Купить
                </button>

            </div>

        `;


        shopGrid.appendChild(card);

    });


    document
        .querySelectorAll(".shop-buy")
        .forEach(button => {

            button.addEventListener(
                "click",
                function(event) {

                    event.preventDefault();
                    event.stopPropagation();

                    buyItem(
                        this.dataset.id
                    );

                }
            );

        });

}


async function buyItem(itemId) {

    const item =
        STORE_ITEMS.find(
            x => x.id === itemId
        );


    if (!item) {
        return;
    }


    const buttons =
        document.querySelectorAll(
            ".shop-buy"
        );


    buttons.forEach(button => {

        button.disabled = true;

    });


    try {

        const response =
            await fetch(
                "/api/shop/buy",
                {
                    method: "POST",

                    credentials: "include",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    cache: "no-store",

                    body: JSON.stringify({
                        itemId: itemId
                    })
                }
            );


        const data =
            await response.json();


        if (
            response.status === 401
        ) {

            showToast(
                "Сессия закончилась."
            );

            return;

        }


        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Недостаточно кликов"
            );

        }


        if (
            data.clicks !== undefined
        ) {

            currentUser.clicks =
                data.clicks;

            updateBalance(
                data.clicks
            );

        }


        showToast(
            "Покупка выполнена: " +
            item.name
        );


    } catch (error) {

        console.error(error);

        showToast(
            error.message ||
            "Ошибка покупки"
        );

    } finally {

        buttons.forEach(button => {

            button.disabled = false;

        });

    }

}


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


        window.location.href = "/";

    }
);


document.addEventListener(
    "submit",
    function(event) {

        event.preventDefault();

    }
);


loadUser();