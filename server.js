require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();

const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "Killua666";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Kotkova2015";
const SESSION_SECRET =
    process.env.SESSION_SECRET || "Kc_9xP7mQ2vL8nR4zT6wY1";

const isProduction = process.env.NODE_ENV === "production";


// =====================================================
// DATABASE
// =====================================================

if (!process.env.DATABASE_URL) {
    console.error("ОШИБКА: DATABASE_URL не найден в .env");
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});


// =====================================================
// EXPRESS
// =====================================================

app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// =====================================================
// SESSION
// =====================================================

app.use(
    session({
        store: new pgSession({
            pool: pool,
            tableName: "user_sessions",
            createTableIfMissing: true
        }),

        secret: SESSION_SECRET,

        resave: false,

        saveUninitialized: false,

        rolling: true,

        cookie: {
            httpOnly: true,
            secure: isProduction,
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24 * 30
        }
    })
);


// =====================================================
// DATABASE INIT
// =====================================================

async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(32) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            clicks NUMERIC(100,0) NOT NULL DEFAULT 0,
            banned BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        ALTER TABLE users
        ALTER COLUMN clicks TYPE NUMERIC(100,0)
        USING clicks::numeric;
    `).catch(() => {});

    await pool.query(`
        CREATE TABLE IF NOT EXISTS clans (
            id SERIAL PRIMARY KEY,
            name VARCHAR(32) UNIQUE NOT NULL,
            tag VARCHAR(8) UNIQUE NOT NULL,
            owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS clan_members (
            id SERIAL PRIMARY KEY,
            clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    console.log("База данных готова.");
}


// =====================================================
// HELPERS
// =====================================================

function isLoggedIn(req) {
    return !!req.session.userId;
}


async function getCurrentUser(req) {
    if (!req.session.userId) {
        return null;
    }

    const result = await pool.query(
        `
        SELECT id, username, clicks, banned, created_at
        FROM users
        WHERE id = $1
        `,
        [req.session.userId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0];
}


function isAdminUser(user) {
    return user && user.username === ADMIN_USERNAME;
}


function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: "Необходимо войти в аккаунт"
        });
    }

    next();
}


async function requireAdmin(req, res, next) {
    try {
        const user = await getCurrentUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт"
            });
        }

        if (!isAdminUser(user)) {
            return res.status(403).json({
                success: false,
                message: "Доступ запрещён"
            });
        }

        req.currentUser = user;

        next();
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
}


// =====================================================
// HEALTH
// =====================================================

app.get("/api/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            success: true,
            message: "KilluaClicker server работает",
            database: "connected"
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Ошибка подключения к базе данных"
        });
    }
});


// =====================================================
// REGISTER
// =====================================================

app.post("/api/register", async (req, res) => {
    try {
        let { username, password } = req.body;

        username = String(username || "").trim();
        password = String(password || "");

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Заполни все поля"
            });
        }

        if (username.length < 3 || username.length > 32) {
            return res.status(400).json({
                success: false,
                message: "Логин должен быть от 3 до 32 символов"
            });
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return res.status(400).json({
                success: false,
                message: "Логин может содержать только буквы, цифры и _"
            });
        }

        if (password.length < 4) {
            return res.status(400).json({
                success: false,
                message: "Пароль должен быть минимум 4 символа"
            });
        }

        const existing = await pool.query(
            `
            SELECT id
            FROM users
            WHERE LOWER(username) = LOWER($1)
            `,
            [username]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Такой логин уже существует"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `
            INSERT INTO users
                (username, password, clicks, banned)
            VALUES
                ($1, $2, 0, false)
            RETURNING id, username, clicks, banned
            `,
            [username, hashedPassword]
        );

        const user = result.rows[0];

        req.session.userId = user.id;

        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        res.json({
            success: true,
            message: "Регистрация успешна",
            user: {
                id: user.id,
                username: user.username,
                clicks: String(user.clicks)
            }
        });
    } catch (error) {
        console.error("REGISTER ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка сервера при регистрации"
        });
    }
});


// =====================================================
// LOGIN
// =====================================================

app.post("/api/login", async (req, res) => {
    try {
        let { username, password } = req.body;

        username = String(username || "").trim();
        password = String(password || "");

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Введите логин и пароль"
            });
        }

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
                message: "Неверный логин или пароль"
            });
        }

        const user = result.rows[0];

        if (user.banned) {
            return res.status(403).json({
                success: false,
                message: "Ваш аккаунт заблокирован"
            });
        }

        const passwordCorrect = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordCorrect) {
            return res.status(401).json({
                success: false,
                message: "Неверный логин или пароль"
            });
        }

        // Удаляем старую сессию и создаём новую.
        // Это дополнительно защищает от проблем со старой cookie.
        await new Promise((resolve, reject) => {
            req.session.regenerate((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        req.session.userId = user.id;

        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        res.json({
            success: true,
            message: "Вход выполнен",
            user: {
                id: user.id,
                username: user.username,
                clicks: String(user.clicks)
            }
        });
    } catch (error) {
        console.error("LOGIN ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка сервера при входе"
        });
    }
});


// =====================================================
// LOGOUT
// =====================================================

app.post("/api/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("LOGOUT ERROR:", error);

            return res.status(500).json({
                success: false,
                message: "Не удалось выйти"
            });
        }

        res.clearCookie("connect.sid", {
            httpOnly: true,
            secure: isProduction,
            sameSite: "lax"
        });

        res.json({
            success: true,
            message: "Вы вышли из аккаунта"
        });
    });
});


// =====================================================
// CURRENT USER
// =====================================================

app.get("/api/me", async (req, res) => {
    try {
        const user = await getCurrentUser(req);

        if (!user) {
            if (req.session.userId) {
                req.session.destroy(() => {});
            }

            return res.status(401).json({
                success: false,
                loggedIn: false,
                message: "Вы не авторизованы"
            });
        }

        if (user.banned) {
            req.session.destroy(() => {});

            return res.status(403).json({
                success: false,
                loggedIn: false,
                message: "Ваш аккаунт заблокирован"
            });
        }

        res.json({
            success: true,
            loggedIn: true,
            user: {
                id: user.id,
                username: user.username,
                clicks: String(user.clicks),
                banned: user.banned,
                created_at: user.created_at
            }
        });
    } catch (error) {
        console.error("ME ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});


// =====================================================
// CLICK
// =====================================================

app.post("/api/click", requireLogin, async (req, res) => {
    try {
        const user = await getCurrentUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Сессия закончилась"
            });
        }

        if (user.banned) {
            return res.status(403).json({
                success: false,
                message: "Аккаунт заблокирован"
            });
        }

        const result = await pool.query(
            `
            UPDATE users
            SET clicks = clicks + 1
            WHERE id = $1
            RETURNING clicks
            `,
            [user.id]
        );

        res.json({
            success: true,
            clicks: String(result.rows[0].clicks)
        });
    } catch (error) {
        console.error("CLICK ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка при клике"
        });
    }
});


// =====================================================
// TOP
// =====================================================

app.get("/api/top", requireLogin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                username,
                clicks
            FROM users
            WHERE banned = false
            ORDER BY clicks DESC
            LIMIT 100
        `);

        res.json({
            success: true,
            users: result.rows.map((user) => ({
                id: user.id,
                username: user.username,
                clicks: String(user.clicks)
            }))
        });
    } catch (error) {
        console.error("TOP ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка загрузки топа"
        });
    }
});


// =====================================================
// SHOP
// =====================================================

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


app.get("/api/shop", requireLogin, (req, res) => {
    res.json({
        success: true,
        items: STORE_ITEMS
    });
});


app.post("/api/shop/buy", requireLogin, async (req, res) => {
    try {
        const { itemId } = req.body;

        const item = STORE_ITEMS.find(
            (storeItem) => storeItem.id === String(itemId)
        );

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Товар не найден"
            });
        }

        const price = BigInt(item.price);
        const amount = BigInt(item.amount);

        const user = await getCurrentUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Сессия закончилась"
            });
        }

        const currentClicks = BigInt(String(user.clicks));

        if (currentClicks < price) {
            return res.status(400).json({
                success: false,
                message: "Недостаточно кликов"
            });
        }

        const newClicks = currentClicks - price + amount;

        await pool.query(
            `
            UPDATE users
            SET clicks = $1
            WHERE id = $2
            `,
            [newClicks.toString(), user.id]
        );

        res.json({
            success: true,
            message: "Покупка успешна",
            clicks: newClicks.toString()
        });
    } catch (error) {
        console.error("SHOP ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка покупки"
        });
    }
});


// =====================================================
// CLANS
// =====================================================

app.get("/api/clans/my", requireLogin, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                c.id,
                c.name,
                c.tag,
                c.owner_id,
                c.created_at
            FROM clans c
            INNER JOIN clan_members cm
                ON cm.clan_id = c.id
            WHERE cm.user_id = $1
            LIMIT 1
            `,
            [req.session.userId]
        );

        res.json({
            success: true,
            clan: result.rows.length > 0
                ? result.rows[0]
                : null
        });
    } catch (error) {
        console.error("MY CLAN ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка загрузки клана"
        });
    }
});


app.post("/api/clans/create", requireLogin, async (req, res) => {
    const client = await pool.connect();

    try {
        let { name, tag } = req.body;

        name = String(name || "").trim();
        tag = String(tag || "").trim().toUpperCase();

        if (!name || !tag) {
            return res.status(400).json({
                success: false,
                message: "Введите название и тег"
            });
        }

        if (name.length < 2 || name.length > 32) {
            return res.status(400).json({
                success: false,
                message: "Название клана: 2-32 символа"
            });
        }

        if (tag.length < 2 || tag.length > 8) {
            return res.status(400).json({
                success: false,
                message: "Тег клана: 2-8 символов"
            });
        }

        await client.query("BEGIN");

        const existingMember = await client.query(
            `
            SELECT id
            FROM clan_members
            WHERE user_id = $1
            `,
            [req.session.userId]
        );

        if (existingMember.rows.length > 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Вы уже состоите в клане"
            });
        }

        const clanResult = await client.query(
            `
            INSERT INTO clans
                (name, tag, owner_id)
            VALUES
                ($1, $2, $3)
            RETURNING id, name, tag, owner_id, created_at
            `,
            [name, tag, req.session.userId]
        );

        const clan = clanResult.rows[0];

        await client.query(
            `
            INSERT INTO clan_members
                (clan_id, user_id)
            VALUES
                ($1, $2)
            `,
            [clan.id, req.session.userId]
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "Клан создан",
            clan
        });
    } catch (error) {
        await client.query("ROLLBACK");

        console.error("CREATE CLAN ERROR:", error);

        if (error.code === "23505") {
            return res.status(400).json({
                success: false,
                message: "Название или тег уже занят"
            });
        }

        res.status(500).json({
            success: false,
            message: "Ошибка создания клана"
        });
    } finally {
        client.release();
    }
});


app.get("/api/clans", requireLogin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                c.id,
                c.name,
                c.tag,
                c.owner_id,
                c.created_at,
                COUNT(cm.user_id)::INTEGER AS members
            FROM clans c
            LEFT JOIN clan_members cm
                ON cm.clan_id = c.id
            GROUP BY
                c.id,
                c.name,
                c.tag,
                c.owner_id,
                c.created_at
            ORDER BY members DESC, c.id ASC
            LIMIT 100
        `);

        res.json({
            success: true,
            clans: result.rows
        });
    } catch (error) {
        console.error("CLANS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка загрузки кланов"
        });
    }
});


app.post("/api/clans/:id/join", requireLogin, async (req, res) => {
    try {
        const clanId = Number(req.params.id);

        if (!Number.isInteger(clanId)) {
            return res.status(400).json({
                success: false,
                message: "Неверный ID клана"
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
                message: "Вы уже состоите в клане"
            });
        }

        const clan = await pool.query(
            `
            SELECT id
            FROM clans
            WHERE id = $1
            `,
            [clanId]
        );

        if (clan.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Клан не найден"
            });
        }

        await pool.query(
            `
            INSERT INTO clan_members
                (clan_id, user_id)
            VALUES
                ($1, $2)
            `,
            [clanId, req.session.userId]
        );

        res.json({
            success: true,
            message: "Вы вступили в клан"
        });
    } catch (error) {
        console.error("JOIN CLAN ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка вступления в клан"
        });
    }
});


app.post("/api/clans/leave", requireLogin, async (req, res) => {
    try {
        const member = await pool.query(
            `
            SELECT clan_id
            FROM clan_members
            WHERE user_id = $1
            `,
            [req.session.userId]
        );

        if (member.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Вы не состоите в клане"
            });
        }

        const clanId = member.rows[0].clan_id;

        const clan = await pool.query(
            `
            SELECT owner_id
            FROM clans
            WHERE id = $1
            `,
            [clanId]
        );

        await pool.query(
            `
            DELETE FROM clan_members
            WHERE user_id = $1
            `,
            [req.session.userId]
        );

        if (
            clan.rows.length > 0 &&
            clan.rows[0].owner_id === req.session.userId
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
            message: "Вы вышли из клана"
        });
    } catch (error) {
        console.error("LEAVE CLAN ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка выхода из клана"
        });
    }
});


// =====================================================
// ADMIN
// =====================================================

app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                username,
                clicks,
                banned,
                created_at
            FROM users
            ORDER BY id ASC
        `);

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
        console.error("ADMIN USERS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка загрузки пользователей"
        });
    }
});


app.post(
    "/api/admin/user/:id/clicks",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);
            const clicks = String(req.body.clicks ?? "");

            if (!Number.isInteger(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID"
                });
            }

            if (!/^\d+$/.test(clicks)) {
                return res.status(400).json({
                    success: false,
                    message: "Неверное количество кликов"
                });
            }

            await pool.query(
                `
                UPDATE users
                SET clicks = $1
                WHERE id = $2
                `,
                [clicks, id]
            );

            res.json({
                success: true,
                message: "Клики изменены"
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                success: false,
                message: "Ошибка"
            });
        }
    }
);


app.post(
    "/api/admin/user/:id/add-clicks",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);
            const amount = String(req.body.amount ?? "");

            if (!Number.isInteger(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID"
                });
            }

            if (!/^\d+$/.test(amount)) {
                return res.status(400).json({
                    success: false,
                    message: "Неверное количество"
                });
            }

            await pool.query(
                `
                UPDATE users
                SET clicks = clicks + $1
                WHERE id = $2
                `,
                [amount, id]
            );

            res.json({
                success: true,
                message: "Клики добавлены"
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                success: false,
                message: "Ошибка"
            });
        }
    }
);


app.post(
    "/api/admin/user/:id/ban",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            if (!Number.isInteger(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID"
                });
            }

            if (id === req.currentUser.id) {
                return res.status(400).json({
                    success: false,
                    message: "Нельзя заблокировать самого себя"
                });
            }

            const result = await pool.query(
                `
                UPDATE users
                SET banned = NOT banned
                WHERE id = $1
                RETURNING banned
                `,
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден"
                });
            }

            res.json({
                success: true,
                banned: result.rows[0].banned
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                success: false,
                message: "Ошибка блокировки"
            });
        }
    }
);


app.post(
    "/api/admin/user/:id/username",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);
            const username = String(req.body.username || "").trim();

            if (!Number.isInteger(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID"
                });
            }

            if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный логин"
                });
            }

            const result = await pool.query(
                `
                UPDATE users
                SET username = $1
                WHERE id = $2
                RETURNING id, username
                `,
                [username, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден"
                });
            }

            res.json({
                success: true,
                user: result.rows[0]
            });
        } catch (error) {
            console.error(error);

            if (error.code === "23505") {
                return res.status(400).json({
                    success: false,
                    message: "Такой логин уже занят"
                });
            }

            res.status(500).json({
                success: false,
                message: "Ошибка изменения логина"
            });
        }
    }
);


app.delete(
    "/api/admin/user/:id",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            if (!Number.isInteger(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID"
                });
            }

            if (id === req.currentUser.id) {
                return res.status(400).json({
                    success: false,
                    message: "Нельзя удалить самого себя"
                });
            }

            const result = await pool.query(
                `
                DELETE FROM users
                WHERE id = $1
                RETURNING id
                `,
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден"
                });
            }

            res.json({
                success: true,
                message: "Пользователь удалён"
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                success: false,
                message: "Ошибка удаления"
            });
        }
    }
);


// =====================================================
// PROTECTED PAGE CHECK
// =====================================================

async function protectPage(req, res, next) {
    try {
        const user = await getCurrentUser(req);

        if (!user || user.banned) {
            if (req.session.userId) {
                req.session.destroy(() => {});
            }

            return res.redirect("/login.html");
        }

        req.currentUser = user;

        next();
    } catch (error) {
        console.error(error);

        res.redirect("/login.html");
    }
}


// =====================================================
// PAGES
// =====================================================

// ГЛАВНАЯ СТРАНИЦА
// Без авторизации -> login.html
// С авторизацией -> index.html

app.get("/", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.redirect("/login.html");
        }

        const user = await getCurrentUser(req);

        if (!user || user.banned) {
            return req.session.destroy(() => {
                res.redirect("/login.html");
            });
        }

        return res.sendFile(
            path.join(__dirname, "public", "index.html")
        );
    } catch (error) {
        console.error(error);

        return res.redirect("/login.html");
    }
});


// LOGIN
app.get("/login.html", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.sendFile(
                path.join(__dirname, "public", "login.html")
            );
        }

        const user = await getCurrentUser(req);

        if (!user || user.banned) {
            return req.session.destroy(() => {
                res.sendFile(
                    path.join(__dirname, "public", "login.html")
                );
            });
        }

        return res.redirect("/");
    } catch (error) {
        console.error(error);

        return res.sendFile(
            path.join(__dirname, "public", "login.html")
        );
    }
});


// CLICKER
app.get("/index.html", protectPage, (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});


// TOP
app.get("/top.html", protectPage, (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "top.html")
    );
});


// STORE
app.get("/store.html", protectPage, (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "store.html")
    );
});


// CLANS
app.get("/clans.html", protectPage, (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "clans.html")
    );
});


// ADMIN
app.get("/admin.html", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.redirect("/login.html");
        }

        const user = await getCurrentUser(req);

        if (!user) {
            return req.session.destroy(() => {
                res.redirect("/login.html");
            });
        }

        if (!isAdminUser(user)) {
            return res.status(403).send(`
                <!DOCTYPE html>
                <html lang="ru">
                <head>
                    <meta charset="UTF-8">
                    <title>Доступ запрещён</title>
                    <style>
                        body {
                            margin: 0;
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            background: #0b0614;
                            color: white;
                            font-family: Arial, sans-serif;
                        }

                        .box {
                            text-align: center;
                            padding: 40px;
                            border-radius: 20px;
                            background: #171022;
                            border: 1px solid #3b2855;
                        }

                        a {
                            color: #a970ff;
                        }
                    </style>
                </head>
                <body>
                    <div class="box">
                        <h1>403</h1>
                        <p>Доступ запрещён.</p>
                        <a href="/">Вернуться</a>
                    </div>
                </body>
                </html>
            `);
        }

        return res.sendFile(
            path.join(__dirname, "public", "admin.html")
        );
    } catch (error) {
        console.error(error);

        res.redirect("/login.html");
    }
});


// =====================================================
// STATIC FILES
// =====================================================

app.use(express.static(path.join(__dirname, "public")));


// =====================================================
// 404
// =====================================================

app.use((req, res) => {
    res.status(404).send("Страница не найдена");
});


// =====================================================
// START
// =====================================================

async function startServer() {
    try {
        await initDatabase();

        app.listen(PORT, () => {
            console.log("");
            console.log("========================================");
            console.log("       KILLUACLICKER SERVER");
            console.log("========================================");
            console.log("");
            console.log(`Сайт: http://localhost:${PORT}`);
            console.log("База данных: подключена");
            console.log(`NODE_ENV: ${process.env.NODE_ENV || "development"}`);
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