document.addEventListener("DOMContentLoaded", () => {
loadTop();
});

function formatNumber(value) {
try {
return BigInt(value).toLocaleString("ru-RU");
} catch {
return String(value);
}
}

async function loadTop() {
const list = document.getElementById("topList");

```
try {
    const response = await fetch("/api/top", {
        method: "GET",
        credentials: "include",
        cache: "no-store"
    });

    const data = await response.json();

    if (!response.ok || !data.success || !Array.isArray(data.users)) {
        list.innerHTML = `
            <div class="empty-state">
                Не удалось загрузить топ игроков.
            </div>
        `;
        return;
    }

    if (data.users.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                Пока игроков нет.
            </div>
        `;
        return;
    }

    list.innerHTML = data.users.map((user, index) => {
        const place = index + 1;

        let medal = "";

        if (place === 1) medal = "🥇";
        else if (place === 2) medal = "🥈";
        else if (place === 3) medal = "🥉";
        else medal = `#${place}`;

        return `
            <div class="top-player">
                <div class="top-place">
                    ${medal}
                </div>

                <div class="top-avatar">
                    ${escapeHtml(user.username.charAt(0).toUpperCase())}
                </div>

                <div class="top-user">
                    <div class="top-username">
                        ${escapeHtml(user.username)}
                    </div>
                    <div class="top-label">
                        Игрок #${user.id}
                    </div>
                </div>

                <div class="top-clicks">
                    <span>${formatNumber(user.clicks)}</span>
                    <small>кликов</small>
                </div>
            </div>
        `;
    }).join("");

} catch (error) {
    console.error("Ошибка загрузки топа:", error);

    list.innerHTML = `
        <div class="empty-state">
            Ошибка соединения с сервером.
        </div>
    `;
}
```

}

function escapeHtml(value) {
return String(value)
.replaceAll("&", "&")
.replaceAll("<", "<")
.replaceAll(">", ">")
.replaceAll('"', """)
.replaceAll("'", "'");
}
