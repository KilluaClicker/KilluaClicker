"use strict";

const messagesEl = document.getElementById("messages");
const form = document.getElementById("chatForm");
const input = document.getElementById("messageInput");
const usernameEl = document.getElementById("username");
const statusEl = document.getElementById("status");

let lastMessageIds = new Set();

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showStatus(text, error = false) {
    statusEl.textContent = text;
    statusEl.style.color = error ? "#ff6b6b" : "#aaa";
}

async function loadUser() {
    try {
        const response = await fetch("/api/me", {
            credentials: "same-origin",
            cache: "no-store"
        });

        const data = await response.json();

        if (!data.success || !data.user) {
            usernameEl.textContent = "Не авторизован";
            return;
        }

        usernameEl.textContent = data.user.username;

    } catch (error) {
        console.error(error);
        usernameEl.textContent = "Ошибка";
    }
}

function renderMessages(messages) {
    if (!Array.isArray(messages)) {
        messagesEl.textContent = "Нет сообщений.";
        return;
    }

    if (messages.length === 0) {
        messagesEl.innerHTML = `
            <div style="text-align:center;color:#777;padding:30px;">
                Пока сообщений нет.
            </div>
        `;
        return;
    }

    const wasAtBottom =
        messagesEl.scrollHeight -
        messagesEl.scrollTop -
        messagesEl.clientHeight < 80;

    messagesEl.innerHTML = messages.map(message => {
        const date = message.created_at
            ? new Date(message.created_at)
            : new Date();

        const time = date.toLocaleTimeString(
            "ru-RU",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );

        return `
            <div class="message">
                <div class="name">
                    ${escapeHtml(message.username)}
                    <span class="time">
                        ${escapeHtml(time)}
                    </span>
                </div>

                <div class="text">
                    ${escapeHtml(message.message)}
                </div>
            </div>
        `;
    }).join("");

    if (wasAtBottom) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }
}

async function loadMessages() {
    try {
        const response = await fetch(
            "/api/chat/messages",
            {
                credentials: "same-origin",
                cache: "no-store"
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.message ||
                "Не удалось загрузить чат."
            );
        }

        renderMessages(data.messages);

        lastMessageIds = new Set(
            data.messages.map(message =>
                String(message.id)
            )
        );

        showStatus(
            `Сообщений: ${data.messages.length}`
        );

    } catch (error) {
        console.error(
            "CHAT LOAD ERROR:",
            error
        );

        showStatus(
            error.message,
            true
        );
    }
}

form.addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        const message =
            input.value.trim();

        if (!message) {
            return;
        }

        if (message.length > 500) {
            showStatus(
                "Сообщение слишком длинное.",
                true
            );
            return;
        }

        input.disabled = true;

        try {
            const response = await fetch(
                "/api/chat/messages",
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        message
                    })
                }
            );

            const data =
                await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message ||
                    "Не удалось отправить сообщение."
                );
            }

            input.value = "";

            await loadMessages();

        } catch (error) {
            console.error(
                "CHAT SEND ERROR:",
                error
            );

            showStatus(
                error.message,
                true
            );

        } finally {
            input.disabled = false;
            input.focus();
        }
    }
);

loadUser();
loadMessages();

setInterval(
    loadMessages,
    2500
);