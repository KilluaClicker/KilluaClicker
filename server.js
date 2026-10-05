require("dotenv").config();

const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!process.env.DATABASE_URL) {
    console.error("ОШИБКА: DATABASE_URL не задан.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.on("error", (error) => {
    console.error("PostgreSQL pool error:", error);
});

app.use(
    session({
        store: new pgSession({
            pool,
            tableName: "user_sessions",
            createTableIfMissing: true
        }),
        secret: process.env.SESSION_SECRET || "killuaclicker-secret",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: isProduction,
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24 * 30
        }
    })
);

/* =========================
   SHOP
========================= */

const STORE_ITEMS = [
    { id: "1", name: "+1 к клику", amount: "1", price: "2", icon: "✦" },
    { id: "10", name: "+10 к клику", amount: "10", price: "20", icon: "✦" },
    { id: "100", name: "+100 к клику", amount: "100", price: "200", icon: "✦" },
    { id: "1000", name: "+1 000 к клику", amount: "1000", price: "2000", icon: "⚡" },
    { id: "million", name: "+1 миллион к клику", amount: "1000000", price: "2000000", icon: "◆" },
    { id: "billion", name: "+1 миллиард к клику", amount: "1000000000", price: "2000000000", icon: "◆" },
    { id: "quadrillion", name: "+1 квадриллион к клику", amount: "1000000000000000", price: "2000000000000000", icon: "♛" },
    { id: "sextillion", name: "+1 сикстиллион к клику", amount: "1000000000000000000000", price: "2000000000000000000000", icon: "♛" }
];

/* =========================
   DATABASE
========================= */

async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(32) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            clicks NUMERIC(100,0) NOT NULL DEFAULT 0,
            click_power NUMERIC(100,0) NOT NULL DEFAULT 1,
            banned BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS click_power
        NUMERIC(100,0) NOT NULL DEFAULT 1
    `);

    await pool.query(`
        ALTER TABLE users
        ALTER COLUMN clicks TYPE NUMERIC(100,0)
        USING clicks::numeric
    `);

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

    const adminUsername =
        process.env.ADMIN_USERNAME || "Killua666";

    const adminPassword =
        process.env.ADMIN_PASSWORD || "Kotkova2015";

    const admin = await pool.query(
        `SELECT id FROM users WHERE username = $1`,
        [adminUsername]
    );

    const passwordHash =
        await bcrypt.hash(adminPassword, 10);

    if (admin.rows.length === 0) {
        await pool.query(
            `
            INSERT INTO users
            (username, password, clicks, click_power, banned)
            VALUES ($1, $2, 0, 1, false)
            `,
            [adminUsername, passwordHash]
        );

        console.log("Администратор создан.");
    } else {
        await pool.query(
            `
            UPDATE users
            SET password = $1,
                banned = false
            WHERE username = $2
            `,
            [passwordHash, adminUsername]
        );

        console.log("Администратор обновлён.");
    }

    console.log("База данных готова.");
}

/* =========================
   HELPERS
========================= */

async function getCurrentUser(req) {
    if (!req.session.userId) {
        return null;
    }

    const result = await pool.query(
        `
        SELECT
            id,
            username,
            clicks,
            click_power,
            banned,
            created_at
        FROM users
        WHERE id = $1
        `,
        [req.session.userId]
    );

    return result.rows[0] || null;
}

function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: "Сессия закончилась. Войдите снова."
        });
    }

    next();
}

async function isAdmin(req) {
    const user = await getCurrentUser(req);

    if (!user) {
        return false;
    }

    return (
        user.username ===
        (process.env.ADMIN_USERNAME || "Killua666")
    );
}

async function requireAdmin(req, res, next) {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Сессия закончилась."
            });
        }

        if (!(await isAdmin(req))) {
            return res.status(403).json({
                success: false,
                message: "Нет доступа."
            });
        }

        next();
    } catch (error) {
        console.error("ADMIN AUTH ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка проверки администратора."
        });
    }
}

/* =========================
   REGISTER
========================= */

app.post("/api/register", async (req, res) => {
    try {
        const username =
            String(req.body.username || "").trim();

        const password =
            String(req.body.password || "");

        if (username.length < 3 || username.length > 32) {
            return res.status(400).json({
                success: false,
                message: "Логин должен быть от 3 до 32 символов."
            });
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return res.status(400).json({
                success: false,
                message:
                    "Используйте только английские буквы, цифры и _."
            });
        }

        if (password.length < 4) {
            return res.status(400).json({
                success: false,
                message: "Пароль минимум 4 символа."
            });
        }

        const exists = await pool.query(
            `SELECT id FROM users WHERE username = $1`,
            [username]
        );

        if (exists.rows.length) {
            return res.status(400).json({
                success: false,
                message: "Такой пользователь уже существует."
            });
        }

        const hash =
            await bcrypt.hash(password, 10);

        const result = await pool.query(
            `
            INSERT INTO users
            (username, password, clicks, click_power, banned)
            VALUES ($1, $2, 0, 1, false)
            RETURNING
                id,
                username,
                clicks,
                click_power,
                banned
            `,
            [username, hash]
        );

        req.session.userId =
            result.rows[0].id;

        res.json({
            success: true,
            user: result.rows[0]
        });
    } catch (error) {
        console.error("REGISTER ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка регистрации."
        });
    }
});

/* =========================
   LOGIN
========================= */

app.post("/api/login", async (req, res) => {
    try {
        const username =
            String(req.body.username || "").trim();

        const password =
            String(req.body.password || "");

        const result = await pool.query(
            `
            SELECT
                id,
                username,
                password,
                clicks,
                click_power,
                banned
            FROM users
            WHERE username = $1
            `,
            [username]
        );

        if (!result.rows.length) {
            return res.status(401).json({
                success: false,
                message: "Неверный логин или пароль."
            });
        }

        const user = result.rows[0];

        const correct =
            await bcrypt.compare(
                password,
                user.password
            );

        if (!correct) {
            return res.status(401).json({
                success: false,
                message: "Неверный логин или пароль."
            });
        }

        if (user.banned) {
            return res.status(403).json({
                success: false,
                message: "Ваш аккаунт заблокирован."
            });
        }

        req.session.userId = user.id;

        delete user.password;

        res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error("LOGIN ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка входа."
        });
    }
});

/* =========================
   LOGOUT
========================= */

app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
        res.clearCookie("connect.sid");

        res.json({
            success: true
        });
    });
});

/* =========================
   ME
========================= */

app.get("/api/me", async (req, res) => {
    try {
        const user =
            await getCurrentUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Не авторизован."
            });
        }

        if (user.banned) {
            req.session.destroy(() => {});

            return res.status(403).json({
                success: false,
                message: "Ваш аккаунт заблокирован."
            });
        }

        res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error("ME ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка сервера."
        });
    }
});

/* =========================
   CLICK
========================= */

app.post("/api/click", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `
            UPDATE users
            SET clicks = clicks + click_power
            WHERE id = $1
              AND banned = false
            RETURNING
                id,
                username,
                clicks,
                click_power
            `,
            [req.session.userId]
        );

        if (!result.rows.length) {
            return res.status(403).json({
                success: false,
                message: "Аккаунт заблокирован."
            });
        }

        res.json({
            success: true,
            user: result.rows[0]
        });
    } catch (error) {
        console.error("CLICK ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка клика."
        });
    }
});

/* =========================
   TOP
========================= */

app.get("/api/top", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                username,
                clicks,
                click_power
            FROM users
            WHERE banned = false
            ORDER BY clicks DESC
            LIMIT 100
        `);

        res.json({
            success: true,
            users: result.rows
        });
    } catch (error) {
        console.error("TOP ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка загрузки топа."
        });
    }
});

/* =========================
   SHOP
========================= */

app.get("/api/shop", requireAuth, async (req, res) => {
    try {
        const user =
            await getCurrentUser(req);

        res.json({
            success: true,
            clicks: String(user.clicks),
            click_power: String(user.click_power),
            items: STORE_ITEMS
        });
    } catch (error) {
        console.error("SHOP ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка магазина."
        });
    }
});

app.post("/api/shop/buy", requireAuth, async (req, res) => {
    const client = await pool.connect();

    try {
        const item =
            STORE_ITEMS.find(
                x => x.id === String(req.body.itemId || "")
            );

        if (!item) {
            return res.status(400).json({
                success: false,
                message: "Товар не найден."
            });
        }

        const price = BigInt(item.price);
        const amount = BigInt(item.amount);

        await client.query("BEGIN");

        const result = await client.query(
            `
            SELECT
                id,
                clicks,
                click_power,
                banned
            FROM users
            WHERE id = $1
            FOR UPDATE
            `,
            [req.session.userId]
        );

        if (!result.rows.length) {
            await client.query("ROLLBACK");

            return res.status(401).json({
                success: false,
                message: "Пользователь не найден."
            });
        }

        const user = result.rows[0];

        if (user.banned) {
            await client.query("ROLLBACK");

            return res.status(403).json({
                success: false,
                message: "Аккаунт заблокирован."
            });
        }

        const clicks =
            BigInt(String(user.clicks));

        const power =
            BigInt(String(user.click_power));

        if (clicks < price) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    `Нужно ${price.toString()} кликов.`
            });
        }

        const newClicks =
            clicks - price;

        const newPower =
            power + amount;

        const updated =
            await client.query(
                `
                UPDATE users
                SET
                    clicks = $1::numeric,
                    click_power = $2::numeric
                WHERE id = $3
                RETURNING
                    id,
                    username,
                    clicks,
                    click_power
                `,
                [
                    newClicks.toString(),
                    newPower.toString(),
                    user.id
                ]
            );

        await client.query("COMMIT");

        res.json({
            success: true,
            message:
                `Сила клика увеличена на ${amount.toString()}!`,
            user: updated.rows[0]
        });
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {}

        console.error("BUY ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка покупки."
        });
    } finally {
        client.release();
    }
});

/* =========================
   CLANS
========================= */

app.get("/api/clans", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                c.id,
                c.name,
                c.tag,
                c.owner_id,
                c.created_at,
                u.username AS owner_username,
                COUNT(cm.id)::integer AS members
            FROM clans c
            JOIN users u ON u.id = c.owner_id
            LEFT JOIN clan_members cm
                ON cm.clan_id = c.id
            GROUP BY
                c.id,
                c.name,
                c.tag,
                c.owner_id,
                c.created_at,
                u.username
            ORDER BY members DESC
        `);

        res.json({
            success: true,
            clans: result.rows
        });
    } catch (error) {
        console.error("CLANS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка загрузки кланов."
        });
    }
});

app.get("/api/clans/my", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                c.id,
                c.name,
                c.tag,
                c.owner_id,
                c.created_at,
                u.username AS owner_username
            FROM clan_members cm
            JOIN clans c
                ON c.id = cm.clan_id
            JOIN users u
                ON u.id = c.owner_id
            WHERE cm.user_id = $1
            `,
            [req.session.userId]
        );

        res.json({
            success: true,
            clan: result.rows[0] || null
        });
    } catch (error) {
        console.error("MY CLAN ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка."
        });
    }
});

app.post("/api/clans/create", requireAuth, async (req, res) => {
    const client = await pool.connect();

    try {
        const name =
            String(req.body.name || "").trim();

        const tag =
            String(req.body.tag || "")
                .trim()
                .toUpperCase();

        if (name.length < 2 || name.length > 32) {
            return res.status(400).json({
                success: false,
                message: "Название клана: 2-32 символа."
            });
        }

        if (tag.length < 2 || tag.length > 8) {
            return res.status(400).json({
                success: false,
                message: "Тег: 2-8 символов."
            });
        }

        await client.query("BEGIN");

        const member = await client.query(
            `
            SELECT id
            FROM clan_members
            WHERE user_id = $1
            `,
            [req.session.userId]
        );

        if (member.rows.length) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Вы уже в клане."
            });
        }

        const clan = await client.query(
            `
            INSERT INTO clans
            (name, tag, owner_id)
            VALUES ($1, $2, $3)
            RETURNING *
            `,
            [
                name,
                tag,
                req.session.userId
            ]
        );

        await client.query(
            `
            INSERT INTO clan_members
            (clan_id, user_id)
            VALUES ($1, $2)
            `,
            [
                clan.rows[0].id,
                req.session.userId
            ]
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            clan: clan.rows[0]
        });
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {}

        if (error.code === "23505") {
            return res.status(400).json({
                success: false,
                message: "Название или тег уже занят."
            });
        }

        console.error("CREATE CLAN ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка создания клана."
        });
    } finally {
        client.release();
    }
});

app.post("/api/clans/:id/join", requireAuth, async (req, res) => {
    try {
        const clanId =
            Number(req.params.id);

        const member = await pool.query(
            `
            SELECT id
            FROM clan_members
            WHERE user_id = $1
            `,
            [req.session.userId]
        );

        if (member.rows.length) {
            return res.status(400).json({
                success: false,
                message: "Вы уже состоите в клане."
            });
        }

        const clan = await pool.query(
            `SELECT id FROM clans WHERE id = $1`,
            [clanId]
        );

        if (!clan.rows.length) {
            return res.status(404).json({
                success: false,
                message: "Клан не найден."
            });
        }

        await pool.query(
            `
            INSERT INTO clan_members
            (clan_id, user_id)
            VALUES ($1, $2)
            `,
            [
                clanId,
                req.session.userId
            ]
        );

        res.json({
            success: true,
            message: "Вы вступили в клан."
        });
    } catch (error) {
        console.error("JOIN CLAN ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка."
        });
    }
});

app.post("/api/clans/leave", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                cm.clan_id,
                c.owner_id
            FROM clan_members cm
            JOIN clans c
                ON c.id = cm.clan_id
            WHERE cm.user_id = $1
            `,
            [req.session.userId]
        );

        if (!result.rows.length) {
            return res.status(400).json({
                success: false,
                message: "Вы не состоите в клане."
            });
        }

        const clanId =
            result.rows[0].clan_id;

        const ownerId =
            result.rows[0].owner_id;

        await pool.query(
            `
            DELETE FROM clan_members
            WHERE user_id = $1
            `,
            [req.session.userId]
        );

        if (
            Number(ownerId) ===
            Number(req.session.userId)
        ) {
            await pool.query(
                `
                DELETE FROM clans
                WHERE id = $1
                `,
                [clanId]
            );
        }

        res.json({
            success: true,
            message: "Вы вышли из клана."
        });
    } catch (error) {
        console.error("LEAVE CLAN ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка."
        });
    }
});

/* =========================
   ADMIN - USERS
========================= */

app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                username,
                clicks,
                click_power,
                banned,
                created_at
            FROM users
            ORDER BY clicks DESC
        `);

        res.json({
            success: true,
            users: result.rows
        });
    } catch (error) {
        console.error("ADMIN USERS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка загрузки пользователей."
        });
    }
});

/* =========================
   ADMIN - EDIT USER
========================= */

app.post(
    "/api/admin/users/:id/edit",
    requireAdmin,
    async (req, res) => {
        try {
            const userId =
                Number(req.params.id);

            if (!Number.isInteger(userId)) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID."
                });
            }

            const username =
                String(
                    req.body.username ?? ""
                ).trim();

            const clicks =
                String(
                    req.body.clicks ?? "0"
                ).trim();

            const clickPower =
                String(
                    req.body.click_power ?? "1"
                ).trim();

            if (
                username.length < 3 ||
                username.length > 32
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Ник должен быть от 3 до 32 символов."
                });
            }

            if (
                !/^[a-zA-Z0-9_]+$/.test(username)
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Ник может содержать только английские буквы, цифры и _."
                });
            }

            if (!/^\d+$/.test(clicks)) {
                return res.status(400).json({
                    success: false,
                    message: "Баланс должен быть числом."
                });
            }

            if (!/^\d+$/.test(clickPower)) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Сила клика должна быть числом."
                });
            }

            const duplicate =
                await pool.query(
                    `
                    SELECT id
                    FROM users
                    WHERE username = $1
                      AND id <> $2
                    `,
                    [username, userId]
                );

            if (duplicate.rows.length) {
                return res.status(400).json({
                    success: false,
                    message: "Этот ник уже занят."
                });
            }

            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET
                        username = $1,
                        clicks = $2::numeric,
                        click_power = $3::numeric
                    WHERE id = $4
                    RETURNING
                        id,
                        username,
                        clicks,
                        click_power,
                        banned,
                        created_at
                    `,
                    [
                        username,
                        clicks,
                        clickPower,
                        userId
                    ]
                );

            if (!result.rows.length) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден."
                });
            }

            res.json({
                success: true,
                message: "Изменения сохранены.",
                user: result.rows[0]
            });
        } catch (error) {
            console.error("ADMIN EDIT ERROR:", error);

            if (error.code === "23505") {
                return res.status(400).json({
                    success: false,
                    message: "Такой ник уже занят."
                });
            }

            res.status(500).json({
                success: false,
                message: "Ошибка изменения пользователя."
            });
        }
    }
);

/* =========================
   ADMIN - BAN
========================= */

app.post(
    "/api/admin/users/:id/ban",
    requireAdmin,
    async (req, res) => {
        try {
            const userId =
                Number(req.params.id);

            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET banned = true
                    WHERE id = $1
                    RETURNING
                        id,
                        username,
                        clicks,
                        click_power,
                        banned
                    `,
                    [userId]
                );

            if (!result.rows.length) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден."
                });
            }

            res.json({
                success: true,
                message: "Пользователь заблокирован.",
                user: result.rows[0]
            });
        } catch (error) {
            console.error("BAN ERROR:", error);

            res.status(500).json({
                success: false,
                message: "Ошибка блокировки."
            });
        }
    }
);

/* =========================
   ADMIN - UNBAN
========================= */

app.post(
    "/api/admin/users/:id/unban",
    requireAdmin,
    async (req, res) => {
        try {
            const userId =
                Number(req.params.id);

            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET banned = false
                    WHERE id = $1
                    RETURNING
                        id,
                        username,
                        clicks,
                        click_power,
                        banned
                    `,
                    [userId]
                );

            if (!result.rows.length) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден."
                });
            }

            res.json({
                success: true,
                message: "Пользователь разблокирован.",
                user: result.rows[0]
            });
        } catch (error) {
            console.error("UNBAN ERROR:", error);

            res.status(500).json({
                success: false,
                message: "Ошибка разблокировки."
            });
        }
    }
);

/* =========================
   ADMIN - RESET
========================= */

app.post(
    "/api/admin/users/:id/reset",
    requireAdmin,
    async (req, res) => {
        try {
            const userId =
                Number(req.params.id);

            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET
                        clicks = 0,
                        click_power = 1
                    WHERE id = $1
                    RETURNING
                        id,
                        username,
                        clicks,
                        click_power,
                        banned
                    `,
                    [userId]
                );

            if (!result.rows.length) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден."
                });
            }

            res.json({
                success: true,
                message: "Игрок полностью сброшен.",
                user: result.rows[0]
            });
        } catch (error) {
            console.error("RESET ERROR:", error);

            res.status(500).json({
                success: false,
                message: "Ошибка сброса."
            });
        }
    }
);

/* =========================
   PAGES
========================= */

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

app.get("/login.html", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "login.html")
    );
});

app.get("/top.html", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "top.html")
    );
});

app.get("/store.html", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "store.html")
    );
});

app.get("/clans.html", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "clans.html")
    );
});

app.get("/admin.html", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "admin.html")
    );
});

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

app.use((req, res) => {
    res.status(404).send("Страница не найдена.");
});

/* =========================
   START
========================= */

async function startServer() {
    try {
        await initDatabase();

        app.listen(PORT, () => {
            console.log("");
            console.log("================================");
            console.log("       KILLUACLICKER");
            console.log("================================");
            console.log(`Сервер: http://localhost:${PORT}`);
            console.log("================================");
            console.log("");
        });
    } catch (error) {
        console.error("");
        console.error("НЕ УДАЛОСЬ ЗАПУСТИТЬ СЕРВЕР:");
        console.error(error);
        console.error("");

        process.exit(1);
    }
}

startServer();