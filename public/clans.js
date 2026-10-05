"use strict";


const usernameEl =
    document.getElementById("username");

const logoutBtn =
    document.getElementById("logoutBtn");

const adminLink =
    document.getElementById("adminLink");

const createClanForm =
    document.getElementById("createClanForm");

const clanNameInput =
    document.getElementById("clanName");

const clanTagInput =
    document.getElementById("clanTag");

const leaveClanBtn =
    document.getElementById("leaveClanBtn");

const clansList =
    document.getElementById("clansList");

const myClanName =
    document.getElementById("myClanName");

const myClanMembers =
    document.getElementById("myClanMembers");

const myClanRank =
    document.getElementById("myClanRank");

const myClanShort =
    document.getElementById("myClanShort");

const myClanBoxName =
    document.getElementById("myClanBoxName");

const myClanBoxTag =
    document.getElementById("myClanBoxTag");

const toastEl =
    document.getElementById("toast");


let toastTimer = null;
let myClan = null;


function showToast(message) {

    toastEl.textContent =
        message;

    toastEl.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {

        toastEl.classList.remove("show");

    }, 2200);

}


function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

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


        usernameEl.textContent =
            data.user.username;


        if (
            data.user.username ===
            "Killua666"
        ) {

            adminLink.style.display =
                "flex";

        }


    } catch (error) {

        console.error(error);

        usernameEl.textContent =
            "Ошибка соединения";

    }

}


async function loadMyClan() {

    try {

        const response =
            await fetch("/api/clans/my", {
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
            !data.success
        ) {

            return;

        }


        myClan =
            data.clan || null;


        if (!myClan) {

            myClanName.textContent =
                "Нет";

            myClanMembers.textContent =
                "0";

            myClanRank.textContent =
                "—";

            myClanShort.textContent =
                "НЕТ";

            myClanBoxName.textContent =
                "Нет клана";

            myClanBoxTag.textContent =
                "Создай свой клан";

            leaveClanBtn.style.display =
                "none";

            return;

        }


        myClanName.textContent =
            myClan.name;


        myClanMembers.textContent =
            myClan.members_count ??
            "0";


        myClanShort.textContent =
            myClan.tag ||
            "ДА";


        myClanBoxName.textContent =
            myClan.name;


        myClanBoxTag.textContent =
            myClan.tag
                ? "[" + myClan.tag + "]"
                : "Клан";


        leaveClanBtn.style.display =
            "block";


    } catch (error) {

        console.error(error);

    }

}


async function loadClans() {

    try {

        const response =
            await fetch("/api/clans", {
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
            !Array.isArray(data.clans)
        ) {

            return;

        }


        renderClans(
            data.clans
        );


    } catch (error) {

        console.error(error);

    }

}


function renderClans(clans) {

    clansList.innerHTML = "";


    if (clans.length === 0) {

        clansList.innerHTML = `

            <div class="stat-card"
                 style="grid-column:1/-1;">

                <div>

                    <div class="stat-label">
                        CLANS
                    </div>

                    <div class="stat-value">
                        Пока нет кланов
                    </div>

                </div>

            </div>

        `;

        return;

    }


    clans.forEach((clan, index) => {

        const card =
            document.createElement("div");


        card.className =
            "stat-card";


        const rank =
            index + 1;


        const alreadyInClan =
            Boolean(myClan);


        const isMyClan =
            myClan &&
            String(myClan.id) ===
            String(clan.id);


        card.innerHTML = `

            <div class="stat-icon ${
                rank === 1
                    ? "purple"
                    : rank === 2
                        ? "blue"
                        : "green"
            }">

                #${rank}

            </div>


            <div style="width:100%;">

                <div class="stat-label">
                    ${escapeHtml(
                        clan.tag
                            ? "[" + clan.tag + "]"
                            : "CLAN"
                    )}
                </div>


                <div class="shop-name">
                    ${escapeHtml(
                        clan.name
                    )}
                </div>


                <div class="shop-price">

                    Владелец:
                    <strong>
                        ${escapeHtml(
                            clan.owner_username ||
                            "—"
                        )}
                    </strong>

                    <br>

                    Участников:
                    <strong>
                        ${clan.members_count ?? 0}
                    </strong>

                </div>


                ${
                    isMyClan
                        ? `
                            <button
                                type="button"
                                class="shop-buy"
                                disabled
                            >
                                Ваш клан
                            </button>
                        `
                        : alreadyInClan
                            ? `
                                <button
                                    type="button"
                                    class="shop-buy"
                                    disabled
                                >
                                    Вы уже в клане
                                </button>
                            `
                            : `
                                <button
                                    type="button"
                                    class="shop-buy join-clan-btn"
                                    data-id="${clan.id}"
                                >
                                    Вступить
                                </button>
                            `
                }

            </div>

        `;


        clansList.appendChild(card);

    });


    document
        .querySelectorAll(".join-clan-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                function(event) {

                    event.preventDefault();
                    event.stopPropagation();

                    joinClan(
                        this.dataset.id
                    );

                }
            );

        });

}


createClanForm.addEventListener(
    "submit",
    async function(event) {

        event.preventDefault();
        event.stopPropagation();


        const name =
            clanNameInput.value.trim();

        const tag =
            clanTagInput.value
                .trim()
                .toUpperCase();


        if (
            name.length < 2 ||
            name.length > 32
        ) {

            showToast(
                "Название должно быть от 2 до 32 символов"
            );

            return;

        }


        if (
            tag.length < 2 ||
            tag.length > 8
        ) {

            showToast(
                "Тег должен быть от 2 до 8 символов"
            );

            return;

        }


        const submitButton =
            createClanForm.querySelector(
                "button[type='submit']"
            );


        submitButton.disabled =
            true;


        try {

            const response =
                await fetch(
                    "/api/clans/create",
                    {
                        method: "POST",

                        credentials: "include",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            name: name,
                            tag: tag
                        })
                    }
                );


            const data =
                await response.json();


            if (
                !response.ok ||
                !data.success
            ) {

                throw new Error(
                    data.message ||
                    "Не удалось создать клан"
                );

            }


            showToast(
                "Клан успешно создан!"
            );


            clanNameInput.value =
                "";

            clanTagInput.value =
                "";


            await loadMyClan();

            await loadClans();


        } catch (error) {

            console.error(error);

            showToast(
                error.message ||
                "Ошибка создания клана"
            );

        } finally {

            submitButton.disabled =
                false;

        }

    }
);


async function joinClan(clanId) {

    try {

        const response =
            await fetch(
                `/api/clans/${clanId}/join`,
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

            throw new Error(
                data.message ||
                "Не удалось вступить"
            );

        }


        showToast(
            "Ты вступил в клан!"
        );


        await loadMyClan();

        await loadClans();


    } catch (error) {

        console.error(error);

        showToast(
            error.message ||
            "Ошибка вступления"
        );

    }

}


leaveClanBtn.addEventListener(
    "click",
    async function(event) {

        event.preventDefault();
        event.stopPropagation();


        leaveClanBtn.disabled =
            true;


        try {

            const response =
                await fetch(
                    "/api/clans/leave",
                    {
                        method: "POST",
                        credentials: "include"
                    }
                );


            const data =
                await response.json();


            if (
                !response.ok ||
                !data.success
            ) {

                throw new Error(
                    data.message ||
                    "Не удалось покинуть клан"
                );

            }


            showToast(
                "Ты покинул клан"
            );


            await loadMyClan();

            await loadClans();


        } catch (error) {

            console.error(error);

            showToast(
                error.message ||
                "Ошибка"
            );

        } finally {

            leaveClanBtn.disabled =
                false;

        }

    }
);


logoutBtn.addEventListener(
    "click",
    async function(event) {

        event.preventDefault();
        event.stopPropagation();


        logoutBtn.disabled =
            true;


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


        window.location.href =
            "/";

    }
);


document.addEventListener(
    "submit",
    function(event) {

        /*
         * Запасная защита от случайного
         * обновления страницы.
         *
         * createClanForm уже обрабатывает
         * свой submit выше.
         */

        if (
            event.target !==
            createClanForm
        ) {

            event.preventDefault();

        }

    }
);


async function start() {

    await loadUser();

    await loadMyClan();

    await loadClans();

}


start();