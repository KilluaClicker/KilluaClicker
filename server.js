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

if (!process.env.DATABASE_URL) {
    console.error("ОШИБКА: DATABASE_URL не указан в .env");
    process.exit(1);
}

if (!process.env.SESSION_SECRET) {
    console.error("ОШИБКА: SESSION_SECRET не указан в .env");
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
        process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : false
});

app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        store: new pgSession({
            pool: pool,
            tableName: "user_sessions",
            createTableIfMissing: true
        }),
        secret: process.env.SESSION_SECRET,
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

/* =========================================================
   STORE
========================================================= */

const STORE_ITEMS = [
    {
        id: "1",
        name: "+1 к клику",
        amount: "1",
        price: "2",
        icon: "✦"
    },
    {
        id: "10",
        name: "+10 к клику",
        amount: "10",
        price: "20",
        icon: "✦"
    },
    {
        id: "100",
        name: "+100 к клику",
        amount: "100",
        price: "200",
        icon: "✦"
    },
    {
        id: "1000",
        name: "+1 000 к клику",
        amount: "1000",
        price: "2000",
        icon: "⚡"
    },
    {
        id: "million",
        name: "+1 миллион к клику",
        amount: "1000000",
        price: "2000000",
        icon: "◆"
    },
    {
        id: "billion",
        name: "+1 миллиард к клику",
        amount: "1000000000",
        price: "2000000000",
        icon: "◆"
    },
    {
        id: "quadrillion",
        name: "+1 квадриллион к клику",
        amount: "1000000000000000",
        price: "2000000000000000",
        icon: "♛"
    },
    {
        id: "sextillion",
        name: "+1 сикстиллион к клику",
        amount: "1000000000000000000000",
        price: "2000000000000000000000",
        icon: "♛"
    }
];

/* =========================================================
   HELPERS
========================================================= */

function isValidIntegerString(value) {
    return typeof value === "string" && /^\d+$/.test(value);
}

function normalizeBigIntString(value) {
    if (!isValidIntegerString(value)) {
        return null;
    }

    try {
        return BigInt(value).toString();
    } catch {
        return null;
    }
}

async function getUserById(id) {
    const result = await pool.query(
        `
        SELECT
            id,
            username,
            clicks,
            click_power,
            banned,
            is_admin,
            created_at
        FROM users
        WHERE id = $1
        `,
        [id]
    );

    return result.rows[0] || null;
}

async function getCurrentUser(req) {
    if (!req.session.userId) {
        return null;
    }

    return getUserById(req.session.userId);
}

/*
    Если администратор зашёл в аккаунт другого пользователя,
    req.session.adminUserId хранит настоящий аккаунт администратора.
*/
async function getAdminUser(req) {
    const adminId = req.session.adminUserId || req.session.userId;

    if (!adminId) {
        return null;
    }

    return getUserById(adminId);
}

async function isAdmin(req) {
    const adminUser = await getAdminUser(req);

    if (!adminUser) {
        return false;
    }

    if (adminUser.username === ADMIN_USERNAME) {
        return true;
    }

    return adminUser.is_admin === true;
}

async function requireAuth(req, res, next) {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Сессия закончилась. Войдите снова."
            });
        }

        const user = await getCurrentUser(req);

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

        next();
    } catch (error) {
        console.error("AUTH ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка проверки авторизации."
        });
    }
}

async function requireAdmin(req, res, next) {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Сессия закончилась."
            });
        }

        const admin = await isAdmin(req);

        if (!admin) {
            return res.status(403).json({
                success: false,
                message: "Нет доступа к админ-панели."
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

/* =========================================================
   DATABASE INIT
========================================================= */

async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(32) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            clicks NUMERIC(100,0) NOT NULL DEFAULT 0,
            click_power NUMERIC(100,0) NOT NULL DEFAULT 1,
            banned BOOLEAN NOT NULL DEFAULT FALSE,
            is_admin BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    /*
        Если users была создана раньше,
        добавляем is_admin автоматически.
    */
    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
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

    const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

    const adminResult = await pool.query(
        `
        SELECT id
        FROM users
        WHERE username = $1
        `,
        [ADMIN_USERNAME]
    );

    if (adminResult.rows.length === 0) {
        await pool.query(
            `
            INSERT INTO users (
                username,
                password,
                clicks,
                click_power,
                banned,
                is_admin
            )
            VALUES ($1, $2, 0, 1, false, true)
            `,
            [ADMIN_USERNAME, adminPasswordHash]
        );

        console.log(`Создан главный администратор: ${ADMIN_USERNAME}`);
    } else {
        await pool.query(
            `
            UPDATE users
            SET
                is_admin = true,
                password = $2
            WHERE username = $1
            `,
            [ADMIN_USERNAME, adminPasswordHash]
        );
    }

    console.log("База данных готова.");
}

/* =========================================================
   AUTH
========================================================= */

app.post("/api/register", async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        if (username.length < 3 || username.length > 32) {
            return res.status(400).json({
                success: false,
                message: "Ник должен быть от 3 до 32 символов."
            });
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return res.status(400).json({
                success: false,
                message: "В нике разрешены только буквы, цифры и _."
            });
        }

        if (password.length < 4) {
            return res.status(400).json({
                success: false,
                message: "Пароль должен быть минимум 4 символа."
            });
        }

        const exists = await pool.query(
            `
            SELECT id
            FROM users
            WHERE LOWER(username) = LOWER($1)
            `,
            [username]
        );

        if (exists.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Такой ник уже занят."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `
            INSERT INTO users (
                username,
                password,
                clicks,
                click_power,
                banned,
                is_admin
            )
            VALUES ($1, $2, 0, 1, false, false)
            RETURNING
                id,
                username,
                clicks,
                click_power,
                banned,
                is_admin
            `,
            [username, passwordHash]
        );

        req.session.userId = result.rows[0].id;
        delete req.session.adminUserId;

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

app.post("/api/login", async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        const result = await pool.query(
            `
            SELECT
                id,
                username,
                password,
                clicks,
                click_power,
                banned,
                is_admin
            FROM users
            WHERE LOWER(username) = LOWER($1)
            `,
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Неверный ник или пароль."
            });
        }

        const user = result.rows[0];

        const passwordOk = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordOk) {
            return res.status(400).json({
                success: false,
                message: "Неверный ник или пароль."
            });
        }

        if (user.banned) {
            return res.status(403).json({
                success: false,
                message: "Этот аккаунт заблокирован."
            });
        }

        req.session.userId = user.id;
        delete req.session.adminUserId;

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

app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({
            success: true
        });
    });
});

app.get("/api/me", async (req, res) => {
    try {
        const user = await getCurrentUser(req);

        if (!user) {
            return res.json({
                success: true,
                loggedIn: false
            });
        }

        const impersonating = Boolean(req.session.adminUserId);

        res.json({
            success: true,
            loggedIn: true,
            impersonating,
            user: {
                id: user.id,
                username: user.username,
                clicks: user.clicks,
                click_power: user.click_power,
                banned: user.banned,
                is_admin: user.is_admin
            }
        });
    } catch (error) {
        console.error("ME ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка."
        });
    }
});

/* =========================================================
   CLICK
========================================================= */

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
                click_power,
                banned
            `,
            [req.session.userId]
        );

        if (result.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: "Клик недоступен."
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

/* =========================================================
   TOP
========================================================= */

app.get("/api/top", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                username,
                clicks,
                click_power,
                is_admin
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

/* =========================================================
   SHOP
========================================================= */

app.get("/api/shop", requireAuth, (req, res) => {
    res.json({
        success: true,
        items: STORE_ITEMS
    });
});

app.post("/api/shop/buy", requireAuth, async (req, res) => {
    try {
        const itemId = String(req.body.itemId || "");

        const item = STORE_ITEMS.find(
            (x) => x.id === itemId
        );

        if (!item) {
            return res.status(400).json({
                success: false,
                message: "Товар не найден."
            });
        }

        const result = await pool.query(
            `
            UPDATE users
            SET
                clicks = clicks - $1::numeric,
                click_power = click_power + $2::numeric
            WHERE id = $3
              AND banned = false
              AND clicks >= $1::numeric
            RETURNING
                id,
                username,
                clicks,
                click_power,
                banned
            `,
            [
                item.price,
                item.amount,
                req.session.userId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Недостаточно кликов."
            });
        }

        res.json({
            success: true,
            item,
            user: result.rows[0]
        });
    } catch (error) {
        console.error("SHOP BUY ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка покупки."
        });
    }
});

/* =========================================================
   CLANS
========================================================= */

app.get("/api/clans", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                c.id,
                c.name,
                c.tag,
                c.owner_id,
                u.username AS owner,
                COUNT(cm.user_id)::int AS members
            FROM clans c
            JOIN users u ON u.id = c.owner_id
            LEFT JOIN clan_members cm ON cm.clan_id = c.id
            GROUP BY
                c.id,
                c.name,
                c.tag,
                c.owner_id,
                u.username
            ORDER BY members DESC, c.name ASC
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
                u.username AS owner
            FROM clan_members cm
            JOIN clans c ON c.id = cm.clan_id
            JOIN users u ON u.id = c.owner_id
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
        const name = String(req.body.name || "").trim();
        const tag = String(req.body.tag || "").trim();

        if (
            name.length < 2 ||
            name.length > 32 ||
            tag.length < 2 ||
            tag.length > 8
        ) {
            return res.status(400).json({
                success: false,
                message: "Неверное название или тег клана."
            });
        }

        await client.query("BEGIN");

        const already = await client.query(
            `
            SELECT clan_id
            FROM clan_members
            WHERE user_id = $1
            `,
            [req.session.userId]
        );

        if (already.rows.length > 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Вы уже состоите в клане."
            });
        }

        const clan = await client.query(
            `
            INSERT INTO clans (
                name,
                tag,
                owner_id
            )
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
            INSERT INTO clan_members (
                clan_id,
                user_id
            )
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
        await client.query("ROLLBACK");

        console.error("CREATE CLAN ERROR:", error);

        res.status(400).json({
            success: false,
            message: "Не удалось создать клан."
        });
    } finally {
        client.release();
    }
});

app.post("/api/clans/join", requireAuth, async (req, res) => {
    try {
        const clanId = Number(req.body.clanId);

        if (!Number.isInteger(clanId)) {
            return res.status(400).json({
                success: false,
                message: "Неверный клан."
            });
        }

        const already = await pool.query(
            `
            SELECT id
            FROM clan_members
            WHERE user_id = $1
            `,
            [req.session.userId]
        );

        if (already.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Вы уже состоите в клане."
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
                message: "Клан не найден."
            });
        }

        await pool.query(
            `
            INSERT INTO clan_members (
                clan_id,
                user_id
            )
            VALUES ($1, $2)
            `,
            [
                clanId,
                req.session.userId
            ]
        );

        res.json({
            success: true
        });
    } catch (error) {
        console.error("JOIN CLAN ERROR:", error);

        res.status(400).json({
            success: false,
            message: "Не удалось вступить в клан."
        });
    }
});

app.post("/api/clans/leave", requireAuth, async (req, res) => {
    try {
        await pool.query(
            `
            DELETE FROM clan_members
            WHERE user_id = $1
            `,
            [req.session.userId]
        );

        res.json({
            success: true
        });
    } catch (error) {
        console.error("LEAVE CLAN ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка выхода из клана."
        });
    }
});

/* =========================================================
   ADMIN - USERS
========================================================= */

app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                username,
                clicks,
                click_power,
                banned,
                is_admin,
                created_at
            FROM users
            ORDER BY id ASC
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

/* =========================================================
   ADMIN - EDIT
========================================================= */

app.post(
    "/api/admin/users/:id/edit",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            if (!Number.isInteger(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID пользователя."
                });
            }

            const username = String(
                req.body.username || ""
            ).trim();

            const clicks = normalizeBigIntString(
                String(req.body.clicks ?? "")
            );

            const clickPower = normalizeBigIntString(
                String(req.body.click_power ?? "")
            );

            if (
                username.length < 3 ||
                username.length > 32 ||
                !/^[a-zA-Z0-9_]+$/.test(username)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ник."
                });
            }

            if (clicks === null || clickPower === null) {
                return res.status(400).json({
                    success: false,
                    message: "Баланс и сила клика должны быть целыми числами."
                });
            }

            const target = await getUserById(id);

            if (!target) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден."
                });
            }

            /*
                Главного Killua666 нельзя переименовать через админку
                и нельзя превратить в обычного пользователя.
            */
            if (
                target.username === ADMIN_USERNAME &&
                username !== ADMIN_USERNAME
            ) {
                return res.status(403).json({
                    success: false,
                    message: "Главного администратора нельзя переименовать."
                });
            }

            const result = await pool.query(
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
                    is_admin
                `,
                [
                    username,
                    clicks,
                    clickPower,
                    id
                ]
            );

            res.json({
                success: true,
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

/* =========================================================
   ADMIN - GIVE BALANCE
========================================================= */

app.post(
    "/api/admin/users/:id/give-balance",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            if (!Number.isInteger(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID пользователя."
                });
            }

            const amount = normalizeBigIntString(
                String(req.body.amount ?? "")
            );

            if (amount === null || BigInt(amount) <= 0n) {
                return res.status(400).json({
                    success: false,
                    message: "Укажи положительное целое число."
                });
            }

            const result = await pool.query(
                `
                UPDATE users
                SET clicks = clicks + $1::numeric
                WHERE id = $2
                RETURNING
                    id,
                    username,
                    clicks,
                    click_power,
                    banned,
                    is_admin
                `,
                [
                    amount,
                    id
                ]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден."
                });
            }

            res.json({
                success: true,
                message: `Выдано ${amount} кликов.`,
                user: result.rows[0]
            });
        } catch (error) {
            console.error("GIVE BALANCE ERROR:", error);

            res.status(500).json({
                success: false,
                message: "Ошибка выдачи баланса."
            });
        }
    }
);

/* =========================================================
   ADMIN - GIVE CLICK POWER
========================================================= */

app.post(
    "/api/admin/users/:id/give-click-power",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            if (!Number.isInteger(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID пользователя."
                });
            }

            const amount = normalizeBigIntString(
                String(req.body.amount ?? "")
            );

            if (amount === null || BigInt(amount) <= 0n) {
                return res.status(400).json({
                    success: false,
                    message: "Укажи положительное целое число."
                });
            }

            const result = await pool.query(
                `
                UPDATE users
                SET click_power = click_power + $1::numeric
                WHERE id = $2
                RETURNING
                    id,
                    username,
                    clicks,
                    click_power,
                    banned,
                    is_admin
                `,
                [
                    amount,
                    id
                ]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден."
                });
            }

            res.json({
                success: true,
                message: `Выдано +${amount} к клику.`,
                user: result.rows[0]
            });
        } catch (error) {
            console.error("GIVE CLICK POWER ERROR:", error);

            res.status(500).json({
                success: false,
                message: "Ошибка выдачи силы клика."
            });
        }
    }
);

/* =========================================================
   ADMIN - GIVE ADMIN
========================================================= */

app.post(
    "/api/admin/users/:id/give-admin",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            if (!Number.isInteger(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID пользователя."
                });
            }

            const result = await pool.query(
                `
                UPDATE users
                SET is_admin = true
                WHERE id = $1
                RETURNING
                    id,
                    username,
                    clicks,
                    click_power,
                    banned,
                    is_admin
                `,
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден."
                });
            }

            res.json({
                success: true,
                message: `Пользователь ${result.rows[0].username} теперь администратор.`,
                user: result.rows[0]
            });
        } catch (error) {
            console.error("GIVE ADMIN ERROR:", error);

            res.status(500).json({
                success: false,
                message: "Ошибка выдачи админки."
            });
        }
    }
);

/* =========================================================
   ADMIN - REMOVE ADMIN
========================================================= */

app.post(
    "/api/admin/users/:id/remove-admin",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            if (!Number.isInteger(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID пользователя."
                });
            }

            const target = await getUserById(id);

            if (!target) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден."
                });
            }

            if (target.username === ADMIN_USERNAME) {
                return res.status(403).json({
                    success: false,
                    message: "У главного администратора нельзя забрать админку."
                });
            }

            const result = await pool.query(
                `
                UPDATE users
                SET is_admin = false
                WHERE id = $1
                RETURNING
                    id,
                    username,
                    clicks,
                    click_power,
                    banned,
                    is_admin
                `,
                [id]
            );

            res.json({
                success: true,
                message: `Админка у ${result.rows[0].username} забрана.`,
                user: result.rows[0]
            });
        } catch (error) {
            console.error("REMOVE ADMIN ERROR:", error);

            res.status(500).json({
                success: false,
                message: "Ошибка снятия админки."
            });
        }
    }
);

/* =========================================================
   ADMIN - IMPERSONATE / LOGIN AS USER
========================================================= */

app.post(
    "/api/admin/users/:id/impersonate",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            if (!Number.isInteger(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID пользователя."
                });
            }

            const admin = await getAdminUser(req);
            const target = await getUserById(id);

            if (!admin) {
                return res.status(403).json({
                    success: false,
                    message: "Администратор не найден."
                });
            }

            if (!target) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден."
                });
            }

            /*
                Сохраняем настоящий ID администратора.
            */
            req.session.adminUserId = admin.id;
            req.session.userId = target.id;

            res.json({
                success: true,
                message: `Вы вошли в аккаунт ${target.username}.`,
                user: {
                    id: target.id,
                    username: target.username,
                    clicks: target.clicks,
                    click_power: target.click_power,
                    banned: target.banned,
                    is_admin: target.is_admin
                }
            });
        } catch (error) {
            console.error("IMPERSONATE ERROR:", error);

            res.status(500).json({
                success: false,
                message: "Ошибка входа в аккаунт."
            });
        }
    }
);

/* =========================================================
   ADMIN - STOP IMPERSONATION
========================================================= */

app.post(
    "/api/admin/stop-impersonation",
    requireAdmin,
    async (req, res) => {
        try {
            if (!req.session.adminUserId) {
                return res.status(400).json({
                    success: false,
                    message: "Вы сейчас не находитесь в чужом аккаунте."
                });
            }

            const originalAdminId = req.session.adminUserId;

            req.session.userId = originalAdminId;
            delete req.session.adminUserId;

            const admin = await getUserById(originalAdminId);

            res.json({
                success: true,
                user: admin
                    ? {
                          id: admin.id,
                          username: admin.username,
                          clicks: admin.clicks,
                          click_power: admin.click_power,
                          banned: admin.banned,
                          is_admin: admin.is_admin
                      }
                    : null
            });
        } catch (error) {
            console.error("STOP IMPERSONATION ERROR:", error);

            res.status(500).json({
                success: false,
                message: "Ошибка возврата в аккаунт."
            });
        }
    }
);

/* =========================================================
   ADMIN - BAN
========================================================= */

app.post(
    "/api/admin/users/:id/ban",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            const target = await getUserById(id);

            if (!target) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден."
                });
            }

            if (target.username === ADMIN_USERNAME) {
                return res.status(403).json({
                    success: false,
                    message: "Главного администратора нельзя заблокировать."
                });
            }

            const result = await pool.query(
                `
                UPDATE users
                SET banned = true
                WHERE id = $1
                RETURNING
                    id,
                    username,
                    clicks,
                    click_power,
                    banned,
                    is_admin
                `,
                [id]
            );

            res.json({
                success: true,
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

/* =========================================================
   ADMIN - UNBAN
========================================================= */

app.post(
    "/api/admin/users/:id/unban",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            const result = await pool.query(
                `
                UPDATE users
                SET banned = false
                WHERE id = $1
                RETURNING
                    id,
                    username,
                    clicks,
                    click_power,
                    banned,
                    is_admin
                `,
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден."
                });
            }

            res.json({
                success: true,
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

/* =========================================================
   ADMIN - RESET
========================================================= */

app.post(
    "/api/admin/users/:id/reset",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            const target = await getUserById(id);

            if (!target) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден."
                });
            }

            if (target.username === ADMIN_USERNAME) {
                return res.status(403).json({
                    success: false,
                    message: "Главного администратора нельзя сбросить."
                });
            }

            const result = await pool.query(
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
                    banned,
                    is_admin
                `,
                [id]
            );

            res.json({
                success: true,
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

/* =========================================================
   ADMIN - DELETE ACCOUNT
========================================================= */

app.post(
    "/api/admin/users/:id/delete",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            if (!Number.isInteger(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Неверный ID пользователя."
                });
            }

            const target = await getUserById(id);

            if (!target) {
                return res.status(404).json({
                    success: false,
                    message: "Пользователь не найден."
                });
            }

            /*
                Защищаем главного администратора.
            */
            if (target.username === ADMIN_USERNAME) {
                return res.status(403).json({
                    success: false,
                    message: "Главного администратора нельзя удалить."
                });
            }

            /*
                Удаляем аккаунт.
                Кланы и членство удалятся через ON DELETE CASCADE.
            */
            await pool.query(
                `
                DELETE FROM users
                WHERE id = $1
                `,
                [id]
            );

            res.json({
                success: true,
                message: `Аккаунт ${target.username} удалён.`
            });
        } catch (error) {
            console.error("DELETE USER ERROR:", error);

            res.status(500).json({
                success: false,
                message: "Ошибка удаления аккаунта."
            });
        }
    }
);

/* =========================================================
   PAGES
========================================================= */

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/index.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/login.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/register.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "register.html"));
});

app.get("/top.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "top.html"));
});

app.get("/shop.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "shop.html"));
});

app.get("/clans.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "clans.html"));
});

app.get("/admin.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.use(express.static(path.join(__dirname, "public")));

/* =========================================================
   404
========================================================= */

app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({
            success: false,
            message: "API маршрут не найден."
        });
    }

    res.status(404).send("Страница не найдена.");
});

/* =========================================================
   START
========================================================= */

async function startServer() {
    try {
        await initDatabase();

        app.listen(PORT, () => {
            console.log("");
            console.log("=================================");
            console.log("      KILLUA CLICKER");
            console.log("=================================");
            console.log(`Сервер запущен на порту ${PORT}`);
            console.log(`Администратор: ${ADMIN_USERNAME}`);
            console.log("=================================");
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