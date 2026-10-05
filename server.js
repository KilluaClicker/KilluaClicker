require("dotenv").config();

const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "Killua666";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Kotkova2015";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// --------------------------------------------------
// EXPRESS
// --------------------------------------------------

app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------------------------------------------------
// SESSION
// --------------------------------------------------

app.use(
    session({
        store: new pgSession({
            pool: pool,
            tableName: "user_sessions",
            createTableIfMissing: true
        }),

        secret:
            process.env.SESSION_SECRET ||
            "killuaclicker-secret-change-this",

        resave: false,
        saveUninitialized: false,

        cookie: {
            httpOnly: true,
            secure: "auto",
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24 * 30
        }
    })
);

// --------------------------------------------------
// STATIC FILES
// --------------------------------------------------

app.use(express.static(path.join(__dirname, "public")));

// --------------------------------------------------
// DATABASE INIT
// --------------------------------------------------

async function initDatabase() {
    try {
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
        `);

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
    } catch (error) {
        console.error("Ошибка создания базы данных:");
        console.error(error);
    }
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: "Сессия закончилась. Войдите снова."
        });
    }

    next();
}

async function getUserById(id) {
    const result = await pool.query(
        `
        SELECT id, username, clicks, banned, created_at
        FROM users
        WHERE id = $1
        `,
        [id]
    );

    return result.rows[0] || null;
}

async function isAdmin(req) {
    if (!req.session.userId) {
        return false;
    }

    const user = await getUserById(req.session.userId);

    if (!user) {
        return false;
    }

    return user.username === ADMIN_USERNAME;
}

function validUsername(username) {
    return (
        typeof username === "string" &&
        username.length >= 3 &&
        username.length <= 32 &&
        /^[a-zA-Z0-9_]+$/.test(username)
    );
}

function validPassword(password) {
    return (
        typeof password === "string" &&
        password.length >= 4 &&
        password.length <= 100
    );
}

// --------------------------------------------------
// HEALTH
// --------------------------------------------------

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

// --------------------------------------------------
// REGISTER
// --------------------------------------------------

app.post("/api/register", async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        if (!validUsername(username)) {
            return res.status(400).json({
                success: false,
                message:
                    "Логин: от 3 до 32 символов. Только буквы, цифры и _."
            });
        }

        if (!validPassword(password)) {
            return res.status(400).json({
                success: false,
                message: "Пароль должен быть от 4 до 100 символов."
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
                message: "Такой пользователь уже существует."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `
            INSERT INTO users (username, password, clicks, banned)
            VALUES ($1, $2, 0, false)
            RETURNING id, username, clicks, banned
            `,
            [username, hashedPassword]
        );

        const user = result.rows[0];

        req.session.userId = user.id;

        req.session.save((err) => {
            if (err) {
                console.error("Ошибка сохранения сессии:", err);

                return res.status(500).json({
                    success: false,
                    message: "Не удалось сохранить сессию."
                });
            }

            res.json({
                success: true,
                message: "Регистрация успешна.",
                user: {
                    id: user.id,
                    username: user.username,
                    clicks: String(user.clicks),
                    banned: user.banned
                }
            });
        });
    } catch (error) {
        console.error("Ошибка регистрации:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка сервера при регистрации."
        });
    }
});

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

app.post("/api/login", async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Введите логин и пароль."
            });
        }

        const result = await pool.query(
            `
            SELECT *
            FROM users
            WHERE LOWER(username) = LOWER($1)
            LIMIT 1
            `,
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Неверный логин или пароль."
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
                message: "Неверный логин или пароль."
            });
        }

        if (user.banned) {
            return res.status(403).json({
                success: false,
                message: "Ваш аккаунт заблокирован."
            });
        }

        req.session.regenerate((err) => {
            if (err) {
                console.error("Ошибка создания сессии:", err);

                return res.status(500).json({
                    success: false,
                    message: "Ошибка создания сессии."
                });
            }

            req.session.userId = user.id;

            req.session.save((saveError) => {
                if (saveError) {
                    console.error(
                        "Ошибка сохранения сессии:",
                        saveError
                    );

                    return res.status(500).json({
                        success: false,
                        message: "Ошибка сохранения сессии."
                    });
                }

                res.json({
                    success: true,
                    message: "Вход выполнен.",
                    user: {
                        id: user.id,
                        username: user.username,
                        clicks: String(user.clicks),
                        banned: user.banned
                    }
                });
            });
        });
    } catch (error) {
        console.error("Ошибка входа:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка сервера при входе."
        });
    }
});

// --------------------------------------------------
// LOGOUT
// --------------------------------------------------

app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Ошибка выхода:", err);

            return res.status(500).json({
                success: false,
                message: "Не удалось выйти."
            });
        }

        res.clearCookie("connect.sid");

        res.json({
            success: true,
            message: "Вы вышли из аккаунта."
        });
    });
});

// --------------------------------------------------
// CURRENT USER
// --------------------------------------------------

app.get("/api/me", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Не авторизован."
            });
        }

        const user = await getUserById(req.session.userId);

        if (!user) {
            req.session.destroy(() => {});

            return res.status(401).json({
                success: false,
                message: "Пользователь не найден."
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
            user: {
                id: user.id,
                username: user.username,
                clicks: String(user.clicks),
                banned: user.banned,
                created_at: user.created_at
            }
        });
    } catch (error) {
        console.error("Ошибка /api/me:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка сервера."
        });
    }
});

// --------------------------------------------------
// CLICK
// --------------------------------------------------

app.post("/api/click", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `
            UPDATE users
            SET clicks = clicks + 1
            WHERE id = $1
              AND banned = false
            RETURNING id, username, clicks
            `,
            [req.session.userId]
        );

        if (result.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: "Аккаунт заблокирован или не найден."
            });
        }

        res.json({
            success: true,
            clicks: String(result.rows[0].clicks)
        });
    } catch (error) {
        console.error("Ошибка клика:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка при клике."
        });
    }
});

// --------------------------------------------------
// TOP
// --------------------------------------------------

app.get("/api/top", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                username,
                clicks
            FROM users
            WHERE banned = false
            ORDER BY clicks DESC, id ASC
            LIMIT 100
        `);

        res.json({
            success: true,
            users: result.rows.map((user, index) => ({
                place: index + 1,
                id: user.id,
                username: user.username,
                clicks: String(user.clicks)
            }))
        });
    } catch (error) {
        console.error("Ошибка топа:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка загрузки топа."
        });
    }
});

// --------------------------------------------------
// SHOP
// --------------------------------------------------

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

app.get("/api/shop", requireAuth, (req, res) => {
    res.json({
        success: true,
        items: STORE_ITEMS
    });
});

// --------------------------------------------------
// BUY SHOP ITEM
// --------------------------------------------------

app.post("/api/shop/buy", requireAuth, async (req, res) => {
    const client = await pool.connect();

    try {
        const itemId = String(req.body.itemId || "");

        const item = STORE_ITEMS.find(
            (storeItem) => storeItem.id === itemId
        );

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Товар не найден."
            });
        }

        const price = BigInt(item.price);
        const amount = BigInt(item.amount);

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
                message: "Пользователь не найден."
            });
        }

        const user = userResult.rows[0];

        if (user.banned) {
            await client.query("ROLLBACK");

            return res.status(403).json({
                success: false,
                message: "Аккаунт заблокирован."
            });
        }

        const currentClicks = BigInt(String(user.clicks));

        if (currentClicks < price) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Недостаточно кликов."
            });
        }

        const newClicks = currentClicks - price + amount;

        const updateResult = await client.query(
            `
            UPDATE users
            SET clicks = $1
            WHERE id = $2
            RETURNING clicks
            `,
            [newClicks.toString(), user.id]
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            message: `Вы купили ${item.name}.`,
            item: item,
            clicks: String(updateResult.rows[0].clicks)
        });
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (_) {}

        console.error("Ошибка покупки:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка покупки."
        });
    } finally {
        client.release();
    }
});

// --------------------------------------------------
// MY CLAN
// --------------------------------------------------

app.get("/api/clans/my", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                c.id,
                c.name,
                c.tag,
                c.owner_id,
                c.created_at
            FROM clan_members cm
            JOIN clans c ON c.id = cm.clan_id
            WHERE cm.user_id = $1
            LIMIT 1
            `,
            [req.session.userId]
        );

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                clan: null
            });
        }

        const clan = result.rows[0];

        const membersResult = await pool.query(
            `
            SELECT
                u.id,
                u.username,
                u.clicks
            FROM clan_members cm
            JOIN users u ON u.id = cm.user_id
            WHERE cm.clan_id = $1
            ORDER BY u.clicks DESC
            `,
            [clan.id]
        );

        res.json({
            success: true,
            clan: {
                id: clan.id,
                name: clan.name,
                tag: clan.tag,
                owner_id: clan.owner_id,
                created_at: clan.created_at,
                members: membersResult.rows.map((member) => ({
                    id: member.id,
                    username: member.username,
                    clicks: String(member.clicks)
                }))
            }
        });
    } catch (error) {
        console.error("Ошибка моего клана:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка загрузки клана."
        });
    }
});

// --------------------------------------------------
// ALL CLANS
// --------------------------------------------------

app.get("/api/clans", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                c.id,
                c.name,
                c.tag,
                c.owner_id,
                c.created_at,
                COUNT(cm.user_id)::INTEGER AS members,
                COALESCE(SUM(u.clicks), 0) AS total_clicks
            FROM clans c
            LEFT JOIN clan_members cm
                ON cm.clan_id = c.id
            LEFT JOIN users u
                ON u.id = cm.user_id
            GROUP BY
                c.id,
                c.name,
                c.tag,
                c.owner_id,
                c.created_at
            ORDER BY total_clicks DESC, c.id ASC
        `);

        res.json({
            success: true,
            clans: result.rows.map((clan) => ({
                id: clan.id,
                name: clan.name,
                tag: clan.tag,
                owner_id: clan.owner_id,
                members: clan.members,
                total_clicks: String(clan.total_clicks),
                created_at: clan.created_at
            }))
        });
    } catch (error) {
        console.error("Ошибка загрузки кланов:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка загрузки кланов."
        });
    }
});

// --------------------------------------------------
// CREATE CLAN
// --------------------------------------------------

app.post("/api/clans/create", requireAuth, async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const tag = String(req.body.tag || "").trim();

        if (name.length < 2 || name.length > 32) {
            return res.status(400).json({
                success: false,
                message: "Название клана должно быть от 2 до 32 символов."
            });
        }

        if (
            tag.length < 2 ||
            tag.length > 8 ||
            !/^[a-zA-Z0-9]+$/.test(tag)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Тег должен быть от 2 до 8 символов и содержать только буквы и цифры."
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
                message: "Вы уже состоите в клане."
            });
        }

        const existingClan = await pool.query(
            `
            SELECT id
            FROM clans
            WHERE LOWER(name) = LOWER($1)
               OR LOWER(tag) = LOWER($2)
            `,
            [name, tag]
        );

        if (existingClan.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Клан с таким названием или тегом уже существует."
            });
        }

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

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
                message: "Клан создан.",
                clan: clan
            });
        } catch (error) {
            await client.query("ROLLBACK");

            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Ошибка создания клана:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка создания клана."
        });
    }
});

// --------------------------------------------------
// JOIN CLAN
// --------------------------------------------------

app.post("/api/clans/:id/join", requireAuth, async (req, res) => {
    try {
        const clanId = Number(req.params.id);

        if (!Number.isInteger(clanId) || clanId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Неверный ID клана."
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
                message: "Вы уже состоите в клане."
            });
        }

        const clan = await pool.query(
            `
            SELECT id, name, tag
            FROM clans
            WHERE id = $1
            `,
            [clanId]
        );

        if (clan.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Клан не найден."
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
            message: "Вы вступили в клан.",
            clan: clan.rows[0]
        });
    } catch (error) {
        console.error("Ошибка вступления в клан:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка вступления в клан."
        });
    }
});

// --------------------------------------------------
// LEAVE CLAN
// --------------------------------------------------

app.post("/api/clans/leave", requireAuth, async (req, res) => {
    try {
        const memberResult = await pool.query(
            `
            SELECT
                cm.clan_id,
                c.owner_id
            FROM clan_members cm
            JOIN clans c ON c.id = cm.clan_id
            WHERE cm.user_id = $1
            LIMIT 1
            `,
            [req.session.userId]
        );

        if (memberResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Вы не состоите в клане."
            });
        }

        const member = memberResult.rows[0];

        if (member.owner_id === req.session.userId) {
            return res.status(400).json({
                success: false,
                message:
                    "Создатель не может просто выйти из клана. Передайте клан или удалите его."
            });
        }

        await pool.query(
            `
            DELETE FROM clan_members
            WHERE user_id = $1
            `,
            [req.session.userId]
        );

        res.json({
            success: true,
            message: "Вы вышли из клана."
        });
    } catch (error) {
        console.error("Ошибка выхода из клана:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка выхода из клана."
        });
    }
});

// --------------------------------------------------
// ADMIN CHECK
// --------------------------------------------------

async function requireAdmin(req, res, next) {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Не авторизован."
            });
        }

        const user = await getUserById(req.session.userId);

        if (!user || user.username !== ADMIN_USERNAME) {
            return res.status(403).json({
                success: false,
                message: "Доступ запрещён."
            });
        }

        next();
    } catch (error) {
        console.error("Ошибка проверки админа:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка сервера."
        });
    }
}

// --------------------------------------------------
// ADMIN USERS
// --------------------------------------------------

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
        console.error("Ошибка admin users:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка загрузки пользователей."
        });
    }
});

// --------------------------------------------------
// ADMIN SET CLICKS
// --------------------------------------------------

app.post(
    "/api/admin/user/:id/clicks",
    requireAdmin,
    async (req, res) => {
        try {
            const userId = Number(req.params.id);
            const clicks = String(req.body.clicks || "").trim();

            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID пользователя."
                });
            }

            if (!/^\d+$/.test(clicks)) {
                return res.status(400).json({
                    success: false,
                    message: "Количество кликов должно быть числом."
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
                    message: "Пользователь не найден."
                });
            }

            res.json({
                success: true,
                message: "Клики изменены.",
                user: {
                    id: result.rows[0].id,
                    username: result.rows[0].username,
                    clicks: String(result.rows[0].clicks),
                    banned: result.rows[0].banned
                }
            });
        } catch (error) {
            console.error("Ошибка изменения кликов:", error);

            res.status(500).json({
                success: false,
                message: "Ошибка изменения кликов."
            });
        }
    }
);

// --------------------------------------------------
// ADMIN ADD CLICKS
// --------------------------------------------------

app.post(
    "/api/admin/user/:id/add-clicks",
    requireAdmin,
    async (req, res) => {
        try {
            const userId = Number(req.params.id);
            const amount = String(req.body.amount || "").trim();

            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID пользователя."
                });
            }

            if (!/^\d+$/.test(amount)) {
                return res.status(400).json({
                    success: false,
                    message: "Количество кликов должно быть числом."
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
                    message: "Пользователь не найден."
                });
            }

            res.json({
                success: true,
                message: "Клики добавлены.",
                user: {
                    id: result.rows[0].id,
                    username: result.rows[0].username,
                    clicks: String(result.rows[0].clicks),
                    banned: result.rows[0].banned
                }
            });
        } catch (error) {
            console.error("Ошибка добавления кликов:", error);

            res.status(500).json({
                success: false,
                message: "Ошибка добавления кликов."
            });
        }
    }
);

// --------------------------------------------------
// ADMIN BAN
// --------------------------------------------------

app.post(
    "/api/admin/user/:id/ban",
    requireAdmin,
    async (req, res) => {
        try {
            const userId = Number(req.params.id);
            const banned =
                req.body.banned === true ||
                req.body.banned === "true";

            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID пользователя."
                });
            }

            const target = await getUserById(userId);

            if (!target) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден."
                });
            }

            if (target.username === ADMIN_USERNAME) {
                return res.status(400).json({
                    success: false,
                    message: "Нельзя заблокировать администратора."
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

            res.json({
                success: true,
                message: banned
                    ? "Пользователь заблокирован."
                    : "Пользователь разблокирован.",
                user: {
                    id: result.rows[0].id,
                    username: result.rows[0].username,
                    clicks: String(result.rows[0].clicks),
                    banned: result.rows[0].banned
                }
            });
        } catch (error) {
            console.error("Ошибка блокировки:", error);

            res.status(500).json({
                success: false,
                message: "Ошибка блокировки."
            });
        }
    }
);

// --------------------------------------------------
// ADMIN CHANGE USERNAME
// --------------------------------------------------

app.post(
    "/api/admin/user/:id/username",
    requireAdmin,
    async (req, res) => {
        try {
            const userId = Number(req.params.id);
            const username = String(req.body.username || "").trim();

            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID пользователя."
                });
            }

            if (!validUsername(username)) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Логин должен быть от 3 до 32 символов и содержать только буквы, цифры и _."
                });
            }

            const duplicate = await pool.query(
                `
                SELECT id
                FROM users
                WHERE LOWER(username) = LOWER($1)
                  AND id <> $2
                `,
                [username, userId]
            );

            if (duplicate.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: "Такой логин уже занят."
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
                    message: "Пользователь не найден."
                });
            }

            res.json({
                success: true,
                message: "Логин изменён.",
                user: {
                    id: result.rows[0].id,
                    username: result.rows[0].username,
                    clicks: String(result.rows[0].clicks),
                    banned: result.rows[0].banned
                }
            });
        } catch (error) {
            console.error("Ошибка изменения логина:", error);

            res.status(500).json({
                success: false,
                message: "Ошибка изменения логина."
            });
        }
    }
);

// --------------------------------------------------
// ADMIN DELETE USER
// --------------------------------------------------

app.delete(
    "/api/admin/user/:id",
    requireAdmin,
    async (req, res) => {
        try {
            const userId = Number(req.params.id);

            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID пользователя."
                });
            }

            const target = await getUserById(userId);

            if (!target) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден."
                });
            }

            if (target.username === ADMIN_USERNAME) {
                return res.status(400).json({
                    success: false,
                    message: "Нельзя удалить администратора."
                });
            }

            await pool.query(
                `
                DELETE FROM users
                WHERE id = $1
                `,
                [userId]
            );

            res.json({
                success: true,
                message: "Пользователь удалён."
            });
        } catch (error) {
            console.error("Ошибка удаления пользователя:", error);

            res.status(500).json({
                success: false,
                message: "Ошибка удаления пользователя."
            });
        }
    }
);

// --------------------------------------------------
// PAGE ROUTES
// --------------------------------------------------

// Главная
app.get("/", (req, res) => {
    if (!req.session.userId) {
        return res.sendFile(
            path.join(__dirname, "public", "login.html")
        );
    }

    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

// Страница входа
app.get("/login.html", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "login.html")
    );
});

// Кликер
app.get("/index.html", (req, res) => {
    if (!req.session.userId) {
        return res.redirect("/login.html");
    }

    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

// Топы
app.get("/top.html", (req, res) => {
    if (!req.session.userId) {
        return res.redirect("/login.html");
    }

    res.sendFile(
        path.join(__dirname, "public", "top.html")
    );
});

// Магазин
app.get("/store.html", (req, res) => {
    if (!req.session.userId) {
        return res.redirect("/login.html");
    }

    res.sendFile(
        path.join(__dirname, "public", "store.html")
    );
});

// Кланы
app.get("/clans.html", (req, res) => {
    if (!req.session.userId) {
        return res.redirect("/login.html");
    }

    res.sendFile(
        path.join(__dirname, "public", "clans.html")
    );
});

// Админка
app.get("/admin.html", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.redirect("/login.html");
        }

        const admin = await isAdmin(req);

        if (!admin) {
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
                            background: #090612;
                            color: white;
                            font-family: Arial, sans-serif;
                        }

                        .box {
                            text-align: center;
                            padding: 40px;
                            border-radius: 20px;
                            background: #151022;
                            border: 1px solid #35245c;
                        }

                        a {
                            color: #a66cff;
                        }
                    </style>
                </head>
                <body>
                    <div class="box">
                        <h1>Доступ запрещён</h1>
                        <p>Админка доступна только администратору.</p>
                        <a href="/">Вернуться</a>
                    </div>
                </body>
                </html>
            `);
        }

        res.sendFile(
            path.join(__dirname, "public", "admin.html")
        );
    } catch (error) {
        console.error(error);

        res.status(500).send("Ошибка сервера.");
    }
});

// --------------------------------------------------
// 404
// --------------------------------------------------

app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({
            success: false,
            message: "API маршрут не найден."
        });
    }

    res.status(404).send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <title>404</title>
            <style>
                body {
                    margin: 0;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #090612;
                    color: white;
                    font-family: Arial, sans-serif;
                    text-align: center;
                }

                a {
                    color: #a66cff;
                }
            </style>
        </head>
        <body>
            <div>
                <h1>404</h1>
                <p>Страница не найдена.</p>
                <a href="/">На главную</a>
            </div>
        </body>
        </html>
    `);
});

// --------------------------------------------------
// ERROR HANDLER
// --------------------------------------------------

app.use((error, req, res, next) => {
    console.error("Необработанная ошибка:", error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        success: false,
        message: "Внутренняя ошибка сервера."
    });
});

// --------------------------------------------------
// START
// --------------------------------------------------

async function startServer() {
    await initDatabase();

    app.listen(PORT, () => {
        console.log("");
        console.log("====================================");
        console.log("       KILLUACLICKER SERVER");
        console.log("====================================");
        console.log(`Сервер запущен на порту: ${PORT}`);
        console.log(`Локально: http://localhost:${PORT}`);
        console.log("");
        console.log(`Администратор: ${ADMIN_USERNAME}`);
        console.log("====================================");
    });
}

startServer().catch((error) => {
    console.error("Не удалось запустить сервер:");
    console.error(error);
    process.exit(1);
});