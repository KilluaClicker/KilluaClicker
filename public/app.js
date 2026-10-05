const $ = (id) => document.getElementById(id);


/* ELEMENTS */

const authScreen = $("authScreen");
const gameScreen = $("gameScreen");

const loginTab = $("loginTab");
const registerTab = $("registerTab");

const loginForm = $("loginForm");
const registerForm = $("registerForm");

const loginButton = $("loginButton");
const registerButton = $("registerButton");

const logoutButton = $("logoutButton");

const clickButton = $("clickButton");

const score = $("score");
const profileClicks = $("profileClicks");

const playerName = $("playerName");

const leaderboard = $("leaderboard");

const authMessage = $("authMessage");

const adminLink = $("adminLink");


/* API */

async function api(url, options = {}) {

  const response = await fetch(url, {

    ...options,

    credentials: "include",

    headers: {

      "Content-Type":
        "application/json",

      ...(options.headers || {})

    }

  });


  const data =
    await response.json()
      .catch(() => ({}));


  if (!response.ok) {

    throw new Error(
      data.error ||
      "Ошибка сервера"
    );

  }


  return data;

}


/* FORMAT */

function formatNumber(value) {

  try {

    return BigInt(value || 0)
      .toLocaleString("ru-RU");

  } catch {

    return "0";

  }

}


/* TABS */

if (loginTab) {

  loginTab.onclick = () => {

    loginTab.classList.add("active");

    registerTab.classList.remove("active");

    loginForm.classList.remove("hidden");

    registerForm.classList.add("hidden");

    authMessage.textContent = "";

  };

}


if (registerTab) {

  registerTab.onclick = () => {

    registerTab.classList.add("active");

    loginTab.classList.remove("active");

    registerForm.classList.remove("hidden");

    loginForm.classList.add("hidden");

    authMessage.textContent = "";

  };

}


/* SHOW GAME */

function showGame(user) {

  authScreen.classList.add("hidden");

  gameScreen.classList.remove("hidden");


  playerName.textContent =
    user.username;


  score.textContent =
    formatNumber(user.clicks);


  profileClicks.textContent =
    formatNumber(user.clicks);


  if (user.username === "Killua666") {

    adminLink.classList.remove("hidden");

  } else {

    adminLink.classList.add("hidden");

  }


  loadLeaderboard();

}


/* LOGIN */

if (loginButton) {

  loginButton.onclick = async () => {

    authMessage.textContent = "";

    loginButton.disabled = true;

    loginButton.textContent =
      "Входим...";


    try {

      const data = await api(
        "/api/login",
        {
          method: "POST",

          body: JSON.stringify({

            username:
              $("loginUsername").value,

            password:
              $("loginPassword").value

          })

        }
      );


      showGame(data.user);


    } catch (error) {

      authMessage.textContent =
        error.message;


    } finally {

      loginButton.disabled = false;

      loginButton.textContent =
        "⚡ Войти";

    }

  };

}


/* REGISTER */

if (registerButton) {

  registerButton.onclick = async () => {

    authMessage.textContent = "";

    registerButton.disabled = true;

    registerButton.textContent =
      "Создаём...";


    try {

      const data = await api(
        "/api/register",
        {
          method: "POST",

          body: JSON.stringify({

            username:
              $("registerUsername").value,

            password:
              $("registerPassword").value

          })

        }
      );


      showGame(data.user);


    } catch (error) {

      authMessage.textContent =
        error.message;


    } finally {

      registerButton.disabled = false;

      registerButton.textContent =
        "🚀 Создать аккаунт";

    }

  };

}


/* CLICK */

if (clickButton) {

  clickButton.onclick = async (event) => {

    try {

      const data = await api(
        "/api/click",
        {
          method: "POST"
        }
      );


      score.textContent =
        formatNumber(data.clicks);


      profileClicks.textContent =
        formatNumber(data.clicks);


      createClickPop(
        event.clientX,
        event.clientY
      );


    } catch (error) {

      console.error(
        "Ошибка клика:",
        error
      );

    }

  };

}


/* CLICK ANIMATION */

function createClickPop(x, y) {

  const pop =
    document.createElement("div");


  pop.className =
    "click-pop";


  pop.textContent =
    "+1 ⚡";


  pop.style.left =
    `${x - 15}px`;


  pop.style.top =
    `${y - 10}px`;


  document.body.appendChild(pop);


  setTimeout(
    () => pop.remove(),
    800
  );

}


/* LEADERBOARD */

async function loadLeaderboard() {

  try {

    const players =
      await api("/api/top");


    leaderboard.innerHTML = "";


    if (!players.length) {

      leaderboard.innerHTML =
        `<div class="loading">
          Пока игроков нет
        </div>`;

      return;

    }


    players.forEach(
      (player, index) => {

        const row =
          document.createElement("div");


        row.className =
          "leader-row";


        let rank;


        if (index === 0) {

          rank = "🥇";

        } else if (index === 1) {

          rank = "🥈";

        } else if (index === 2) {

          rank = "🥉";

        } else {

          rank =
            "#" + (index + 1);

        }


        row.innerHTML = `

          <div class="rank ${
            index < 3 ? "top" : ""
          }">
            ${rank}
          </div>

          <div class="leader-avatar">
            ⚡
          </div>

          <div class="leader-name">
            ${escapeHtml(player.username)}
          </div>

          <div class="leader-score">
            ${formatNumber(player.clicks)}
          </div>

        `;


        leaderboard.appendChild(row);

      }
    );


  } catch (error) {

    console.error(
      "Ошибка топа:",
      error
    );

  }

}


/* LOGOUT */

if (logoutButton) {

  logoutButton.onclick = async () => {

    try {

      await api(
        "/api/logout",
        {
          method: "POST"
        }
      );

    } catch (error) {

      console.error(error);

    }


    location.reload();

  };

}


/* ESCAPE */

function escapeHtml(value) {

  return String(value)

    .replaceAll("&", "&amp;")

    .replaceAll("<", "&lt;")

    .replaceAll(">", "&gt;")

    .replaceAll('"', "&quot;")

    .replaceAll("'", "&#039;");

}


/* SESSION */

async function loadUser() {

  try {

    const data =
      await api("/api/me");


    showGame(data.user);


  } catch {

    authScreen.classList.remove(
      "hidden"
    );

    gameScreen.classList.add(
      "hidden"
    );

  }

}


loadUser();


/* ENTER */

document.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key === "Enter" &&
      !gameScreen.classList.contains(
        "hidden"
      )
    ) {

      clickButton.click();

    }

  }
);