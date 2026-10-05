require("dotenv").config();

const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        store: new pgSession({
            pool: pool,
            tableName: "user_sessions",
            createTableIfMissing: true
        }),
        secret: process.env.SESSION_SECRET || "killuaclicker-secret",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24 * 30
        }
    })
);

app.use(express.static(path.join(__dirname, "public")));

/* =========================================================
   SHOP
========================================================= */

const SHOP_ITEMS = [
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

/* =========================================================
   DATABASE
========================================================= */

async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(32) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            clicks NUMERIC(100,0) NOT NULL DEFAULT 0,
            banned BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        ALTER TABLE users
        ALTER COLUMN clicks TYPE NUMERIC(100,0)
        USING clicks::numeric
    `).catch(() => {});

    await pool.query(`
        CREATE TABLE IF NOT EXISTS clans (
            id SERIAL PRIMARY KEY,
            name VARCHAR(32) UNIQUE NOT NULL,
            tag VARCHAR(8) UNIQUE NOT NULL,
            owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS clan_members (
            id SERIAL PRIMARY KEY,
            clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log("Database initialized");
}

/* =========================================================
   HELPERS
========================================================= */

function isLoggedIn(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            error: "Не авторизован"
        });
    }

    next();
}

function isAdmin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            error: "Не авторизован"
        });
    }

    if (req.session.username !== process.env.ADMIN_USERNAME) {
        return res.status(403).json({
            success: false,
            error: "Нет доступа"
        });
    }

    next();
}

function cleanUsername(username) {
    return String(username || "").trim();
}

function cleanClanName(name) {
    return String(name || "").trim();
}

function cleanClanTag(tag) {
    return String(tag || "")
        .trim()
        .toUpperCase();
}

/* =========================================================
   HEALTH
========================================================= */

app.get("/api/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            success: true,
            message: "KilluaClicker server работает",
            database: "connected"
        });
    } catch (error) {
        console.error("Health error:", error);

        res.status(500).json({
            success: false,
            message: "Database error"
        });
    }
});

/* =========================================================
   REGISTER
========================================================= */

app.post("/api/register", async (req, res) => {
    try {
        const username = cleanUsername(req.body.username);
        const password = String(req.body.password || "");

        if (username.length < 3 || username.length > 32) {
            return res.status(400).json({
                success: false,
                error: "Логин должен быть от 3 до 32 символов"
            });
        }

        if (password.length < 4) {
            return res.status(400).json({
                success: false,
                error: "Пароль должен быть минимум 4 символа"
            });
        }

        const existing = await pool.query(
            "SELECT id FROM users WHERE LOWER(username) = LOWER($1)",
            [username]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: "Такой пользователь уже существует"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `
            INSERT INTO users (username, password, clicks, banned)
            VALUES ($1, $2, 0, FALSE)
            RETURNING id, username, clicks, banned
            `,
            [username, hashedPassword]
        );

        const user = result.rows[0];

        req.session.userId = user.id;
        req.session.username = user.username;

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                clicks: String(user.clicks),
                banned: user.banned
            }
        });
    } catch (error) {
        console.error("Register error:", error);

        res.status(500).json({
            success: false,
            error: "Ошибка сервера"
        });
    }
});

/* =========================================================
   LOGIN
========================================================= */

app.post("/api/login", async (req, res) => {
    try {
        const username = cleanUsername(req.body.username);
        const password = String(req.body.password || "");

        const result = await pool.query(
            `
            SELECT id, username, password, clicks, banned
            FROM users
            WHERE LOWER(username) = LOWER($1)
            `,
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: "Неверный логин или пароль"
            });
        }

        const user = result.rows[0];

        const passwordCorrect = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordCorrect) {
            return res.status(401).json({
                success: false,
                error: "Неверный логин или пароль"
            });
        }

        if (user.banned) {
            return res.status(403).json({
                success: false,
                error: "Ваш аккаунт заблокирован"
            });
        }

        req.session.userId = user.id;
        req.session.username = user.username;

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                clicks: String(user.clicks),
                banned: user.banned
            }
        });
    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            success: false,
            error: "Ошибка сервера"
        });
    }
});

/* =========================================================
   LOGOUT
========================================================= */

app.post("/api/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("Logout error:", error);

            return res.status(500).json({
                success: false,
                error: "Ошибка выхода"
            });
        }

        res.clearCookie("connect.sid");

        res.json({
            success: true
        });
    });
});

/* =========================================================
   CURRENT USER
========================================================= */

app.get("/api/me", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                error: "Не авторизован"
            });
        }

        const result = await pool.query(
            `
            SELECT id, username, clicks, banned
            FROM users
            WHERE id = $1
            `,
            [req.session.userId]
        );

        if (result.rows.length === 0) {
            req.session.destroy(() => {});

            return res.status(401).json({
                success: false,
                error: "Пользователь не найден"
            });
        }

        const user = result.rows[0];

        if (user.banned) {
            req.session.destroy(() => {});

            return res.status(403).json({
                success: false,
                error: "Аккаунт заблокирован"
            });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                clicks: String(user.clicks),
                banned: user.banned
            }
        });
    } catch (error) {
        console.error("Me error:", error);

        res.status(500).json({
            success: false,
            error: "Ошибка сервера"
        });
    }
});

/* =========================================================
   CLICK
========================================================= */

app.post("/api/click", isLoggedIn, async (req, res) => {
    try {
        const result = await pool.query(
            `
            UPDATE users
            SET clicks = clicks + 1
            WHERE id = $1
            AND banned = FALSE
            RETURNING id, username, clicks
            `,
            [req.session.userId]
        );

        if (result.rows.length === 0) {
            return res.status(403).json({
                success: false,
                error: "Аккаунт заблокирован или пользователь не найден"
            });
        }

        const user = result.rows[0];

        res.json({
            success: true,
            clicks: String(user.clicks),
            user: {
                id: user.id,
                username: user.username,
                clicks: String(user.clicks)
            }
        });
    } catch (error) {
        console.error("CLICK ERROR:", error);

        res.status(500).json({
            success: false,
            error: "Ошибка при добавлении клика"
        });
    }
});

/* =========================================================
   TOP
========================================================= */

app.get("/api/top", async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                id,
                username,
                clicks,
                banned
            FROM users
            WHERE banned = FALSE
            ORDER BY clicks DESC
            LIMIT 100
            `
        );

        res.json({
            success: true,
            users: result.rows.map((user) => ({
                id: user.id,
                username: user.username,
                clicks: String(user.clicks),
                banned: user.banned
            }))
        });
    } catch (error) {
        console.error("Top error:", error);

        res.status(500).json({
            success: false,
            error: "Ошибка загрузки топа"
        });
    }
});

/* =========================================================
   SHOP LIST
========================================================= */

app.get("/api/shop", async (req, res) => {
    res.json({
        success: true,
        items: SHOP_ITEMS
    });
});

/* =========================================================
   SHOP BUY
========================================================= */

app.post("/api/shop/buy", isLoggedIn, async (req, res) => {
    const client = await pool.connect();

    try {
        const itemId = String(req.body.itemId || "");

        const item = SHOP_ITEMS.find(
            (shopItem) => shopItem.id === itemId
        );

        if (!item) {
            return res.status(400).json({
                success: false,
                error: "Товар не найден"
            });
        }

        const price = item.price;
        const amount = item.amount;

        await client.query("BEGIN");

        const userResult = await client.query(
            `
            SELECT id, username, clicks, banned
            FROM users
            WHERE id = $1
            FOR UPDATE
            `,
            [req.session.userId]
        );

        if (userResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                error: "Пользователь не найден"
            });
        }

        const user = userResult.rows[0];

        if (user.banned) {
            await client.query("ROLLBACK");

            return res.status(403).json({
                success: false,
                error: "Аккаунт заблокирован"
            });
        }

        const balance = BigInt(String(user.clicks));
        const itemPrice = BigInt(price);
        const itemAmount = BigInt(amount);

        if (balance < itemPrice) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                error: "Недостаточно кликов",
                clicks: String(user.clicks)
            });
        }

        const newBalance = balance - itemPrice + itemAmount;

        await client.query(
            `
            UPDATE users
            SET clicks = $1
            WHERE id = $2
            `,
            [newBalance.toString(), user.id]
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            item: {
                id: item.id,
                name: item.name,
                amount: item.amount,
                price: item.price
            },
            clicks: newBalance.toString(),
            user: {
                id: user.id,
                username: user.username,
                clicks: newBalance.toString()
            }
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});

        console.error("SHOP BUY ERROR:", error);

        res.status(500).json({
            success: false,
            error: "Ошибка покупки"
        });
    } finally {
        client.release();
    }
});

/* =========================================================
   MY CLAN
========================================================= */

app.get("/api/clans/my", isLoggedIn, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                c.id,
                c.name,
                c.tag,
                c.owner_id,
                c.created_at,
                COUNT(cm2.id)::INTEGER AS members_count
            FROM clan_members cm
            JOIN clans c ON c.id = cm.clan_id
            LEFT JOIN clan_members cm2 ON cm2.clan_id = c.id
            WHERE cm.user_id = $1
            GROUP BY
                c.id,
                c.name,
                c.tag,
                c.owner_id,
                c.created_at
            `,
            [req.session.userId]
        );

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                clan: null
            });
        }

        res.json({
            success: true,
            clan: result.rows[0]
        });
    } catch (error) {
        console.error("My clan error:", error);

        res.status(500).json({
            success: false,
            error: "Ошибка загрузки клана"
        });
    }
});

/* =========================================================
   ALL CLANS
========================================================= */

app.get("/api/clans", async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                c.id,
                c.name,
                c.tag,
                c.owner_id,
                u.username AS owner_username,
                c.created_at,
                COUNT(cm.id)::INTEGER AS members_count
            FROM clans c
            JOIN users u ON u.id = c.owner_id
            LEFT JOIN clan_members cm ON cm.clan_id = c.id
            GROUP BY
                c.id,
                c.name,
                c.tag,
                c.owner_id,
                u.username,
                c.created_at
            ORDER BY COUNT(cm.id) DESC, c.id ASC
            LIMIT 100
            `
        );

        res.json({
            success: true,
            clans: result.rows
        });
    } catch (error) {
        console.error("Clans error:", error);

        res.status(500).json({
            success: false,
            error: "Ошибка загрузки кланов"
        });
    }
});

/* =========================================================
   CREATE CLAN
========================================================= */

app.post("/api/clans/create", isLoggedIn, async (req, res) => {
    const client = await pool.connect();

    try {
        const name = cleanClanName(req.body.name);
        const tag = cleanClanTag(req.body.tag);

        if (name.length < 3 || name.length > 32) {
            return res.status(400).json({
                success: false,
                error: "Название клана должно быть от 3 до 32 символов"
            });
        }

        if (!/^[A-Z0-9]+$/.test(tag)) {
            return res.status(400).json({
                success: false,
                error: "Тег должен содержать только буквы и цифры"
            });
        }

        if (tag.length < 2 || tag.length > 8) {
            return res.status(400).json({
                success: false,
                error: "Тег должен быть от 2 до 8 символов"
            });
        }

        await client.query("BEGIN");

        const alreadyInClan = await client.query(
            `
            SELECT id
            FROM clan_members
            WHERE user_id = $1
            `,
            [req.session.userId]
        );

        if (alreadyInClan.rows.length > 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                error: "Вы уже состоите в клане"
            });
        }

        const clanResult = await client.query(
            `
            INSERT INTO clans (name, tag, owner_id)
            VALUES ($1, $2, $3)
            RETURNING id, name, tag, owner_id, created_at
            `,
            [name, tag, req.session.userId]
        );

        const clan = clanResult.rows[0];

        await client.query(
            `
            INSERT INTO clan_members (clan_id, user_id)
            VALUES ($1, $2)
            `,
            [clan.id, req.session.userId]
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            clan: {
                ...clan,
                members_count: 1
            }
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});

        console.error("Create clan error:", error);

        if (error.code === "23505") {
            return res.status(400).json({
                success: false,
                error: "Такое название или тег уже используется"
            });
        }

        res.status(500).json({
            success: false,
            error: "Ошибка создания клана"
        });
    } finally {
        client.release();
    }
});

/* =========================================================
   JOIN CLAN
========================================================= */

app.post("/api/clans/:id/join", isLoggedIn, async (req, res) => {
    try {
        const clanId = Number(req.params.id);

        if (!Number.isInteger(clanId)) {
            return res.status(400).json({
                success: false,
                error: "Неверный ID клана"
            });
        }

        const existingMember = await pool.query(
            `
            SELECT id
            FROM clan_members
            WHERE user_id = $1
            `,
            [req.session.userId]
        );

        if (existingMember.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: "Вы уже состоите в клане"
            });
        }

        const clan = await pool.query(
            `
            SELECT id, name, tag, owner_id
            FROM clans
            WHERE id = $1
            `,
            [clanId]
        );

        if (clan.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Клан не найден"
            });
        }

        await pool.query(
            `
            INSERT INTO clan_members (clan_id, user_id)
            VALUES ($1, $2)
            `,
            [clanId, req.session.userId]
        );

        res.json({
            success: true,
            message: "Вы вступили в клан"
        });
    } catch (error) {
        console.error("Join clan error:", error);

        if (error.code === "23505") {
            return res.status(400).json({
                success: false,
                error: "Вы уже состоите в клане"
            });
        }

        res.status(500).json({
            success: false,
            error: "Ошибка вступления в клан"
        });
    }
});

/* =========================================================
   LEAVE CLAN
========================================================= */

app.post("/api/clans/leave", isLoggedIn, async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const membership = await client.query(
            `
            SELECT
                cm.clan_id,
                c.owner_id
            FROM clan_members cm
            JOIN clans c ON c.id = cm.clan_id
            WHERE cm.user_id = $1
            `,
            [req.session.userId]
        );

        if (membership.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                error: "Вы не состоите в клане"
            });
        }

        const clanId = membership.rows[0].clan_id;
        const ownerId = membership.rows[0].owner_id;

        if (Number(ownerId) === Number(req.session.userId)) {
            await client.query(
                `
                DELETE FROM clans
                WHERE id = $1
                `,
                [clanId]
            );
        } else {
            await client.query(
                `
                DELETE FROM clan_members
                WHERE user_id = $1
                `,
                [req.session.userId]
            );
        }

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "Вы вышли из клана"
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});

        console.error("Leave clan error:", error);

        res.status(500).json({
            success: false,
            error: "Ошибка выхода из клана"
        });
    } finally {
        client.release();
    }
});

/* =========================================================
   ADMIN — USERS
========================================================= */

app.get("/api/admin/users", isAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                id,
                username,
                clicks,
                banned,
                created_at
            FROM users
            ORDER BY id ASC
            `
        );

        res.json({
            success: true,
            users: result.rows.map((user) => ({
                id: user.id,
                username: user.username,
                clicks: String(user.clicks),
                banned: user.banned,
                created_at: user.created_at
            }))
        });
    } catch (error) {
        console.error("Admin users error:", error);

        res.status(500).json({
            success: false,
            error: "Ошибка загрузки пользователей"
        });
    }
});

/* =========================================================
   ADMIN — SET CLICKS
========================================================= */

app.post("/api/admin/user/:id/clicks", isAdmin, async (req, res) => {
    try {
        const userId = Number(req.params.id);
        const clicks = String(req.body.clicks ?? "");

        if (!Number.isInteger(userId)) {
            return res.status(400).json({
                success: false,
                error: "Неверный ID"
            });
        }

        if (!/^\d+$/.test(clicks)) {
            return res.status(400).json({
                success: false,
                error: "Количество кликов должно быть числом"
            });
        }

        const result = await pool.query(
            `
            UPDATE users
            SET clicks = $1
            WHERE id = $2
            RETURNING id, username, clicks, banned
            `,
            [clicks, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Пользователь не найден"
            });
        }

        const user = result.rows[0];

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                clicks: String(user.clicks),
                banned: user.banned
            }
        });
    } catch (error) {
        console.error("Admin set clicks error:", error);

        res.status(500).json({
            success: false,
            error: "Ошибка изменения кликов"
        });
    }
});

/* =========================================================
   ADMIN — ADD CLICKS
========================================================= */

app.post("/api/admin/user/:id/add-clicks", isAdmin, async (req, res) => {
    try {
        const userId = Number(req.params.id);
        const amount = String(req.body.amount ?? "");

        if (!Number.isInteger(userId)) {
            return res.status(400).json({
                success: false,
                error: "Неверный ID"
            });
        }

        if (!/^\d+$/.test(amount)) {
            return res.status(400).json({
                success: false,
                error: "Количество должно быть положительным числом"
            });
        }

        const result = await pool.query(
            `
            UPDATE users
            SET clicks = clicks + $1
            WHERE id = $2
            RETURNING id, username, clicks, banned
            `,
            [amount, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Пользователь не найден"
            });
        }

        const user = result.rows[0];

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                clicks: String(user.clicks),
                banned: user.banned
            }
        });
    } catch (error) {
        console.error("Admin add clicks error:", error);

        res.status(500).json({
            success: false,
            error: "Ошибка добавления кликов"
        });
    }
});

/* =========================================================
   ADMIN — BAN
========================================================= */

app.post("/api/admin/user/:id/ban", isAdmin, async (req, res) => {
    try {
        const userId = Number(req.params.id);
        const banned = Boolean(req.body.banned);

        if (!Number.isInteger(userId)) {
            return res.status(400).json({
                success: false,
                error: "Неверный ID"
            });
        }

        if (userId === req.session.userId) {
            return res.status(400).json({
                success: false,
                error: "Нельзя заблокировать самого себя"
            });
        }

        const result = await pool.query(
            `
            UPDATE users
            SET banned = $1
            WHERE id = $2
            RETURNING id, username, clicks, banned
            `,
            [banned, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Пользователь не найден"
            });
        }

        const user = result.rows[0];

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                clicks: String(user.clicks),
                banned: user.banned
            }
        });
    } catch (error) {
        console.error("Admin ban error:", error);

        res.status(500).json({
            success: false,
            error: "Ошибка блокировки"
        });
    }
});

/* =========================================================
   ADMIN — CHANGE USERNAME
========================================================= */

app.post("/api/admin/user/:id/username", isAdmin, async (req, res) => {
    try {
        const userId = Number(req.params.id);
        const username = cleanUsername(req.body.username);

        if (!Number.isInteger(userId)) {
            return res.status(400).json({
                success: false,
                error: "Неверный ID"
            });
        }

        if (username.length < 3 || username.length > 32) {
            return res.status(400).json({
                success: false,
                error: "Логин должен быть от 3 до 32 символов"
            });
        }

        const result = await pool.query(
            `
            UPDATE users
            SET username = $1
            WHERE id = $2
            RETURNING id, username, clicks, banned
            `,
            [username, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Пользователь не найден"
            });
        }

        const user = result.rows[0];

        if (userId === req.session.userId) {
            req.session.username = user.username;
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                clicks: String(user.clicks),
                banned: user.banned
            }
        });
    } catch (error) {
        console.error("Admin username error:", error);

        if (error.code === "23505") {
            return res.status(400).json({
                success: false,
                error: "Такой логин уже существует"
            });
        }

        res.status(500).json({
            success: false,
            error: "Ошибка изменения логина"
        });
    }
});

/* =========================================================
   ADMIN — DELETE USER
========================================================= */

app.delete("/api/admin/user/:id", isAdmin, async (req, res) => {
    try {
        const userId = Number(req.params.id);

        if (!Number.isInteger(userId)) {
            return res.status(400).json({
                success: false,
                error: "Неверный ID"
            });
        }

        if (userId === req.session.userId) {
            return res.status(400).json({
                success: false,
                error: "Нельзя удалить самого себя"
            });
        }

        const result = await pool.query(
            `
            DELETE FROM users
            WHERE id = $1
            RETURNING id, username
            `,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Пользователь не найден"
            });
        }

        res.json({
            success: true,
            deleted: result.rows[0]
        });
    } catch (error) {
        console.error("Admin delete error:", error);

        res.status(500).json({
            success: false,
            error: "Ошибка удаления пользователя"
        });
    }
});

/* =========================================================
   PAGE ROUTES
========================================================= */

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/top.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "top.html"));
});

app.get("/store.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "store.html"));
});

app.get("/clans.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "clans.html"));
});

app.get("/admin.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
});

/* =========================================================
   404 API
========================================================= */

app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        error: "API route not found"
    });
});

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use((error, req, res, next) => {
    console.error("SERVER ERROR:", error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        success: false,
        error: "Внутренняя ошибка сервера"
    });
});

/* =========================================================
   START
========================================================= */

async function startServer() {
    try {
        await initDatabase();

        app.listen(PORT, () => {
            console.log(`KilluaClicker запущен на порту ${PORT}`);
        });
    } catch (error) {
        console.error("Не удалось запустить сервер:");
        console.error(error);
        process.exit(1);
    }
}

startServer();