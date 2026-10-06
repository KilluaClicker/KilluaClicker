"use strict";

require("dotenv").config();

const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME =
    process.env.ADMIN_USERNAME || "Killua666";

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD || "Kotkova2015";

const SESSION_SECRET =
    process.env.SESSION_SECRET ||
    "Kc_9xP7mQ2vL8nR4zT6wY1";

const DATABASE_URL =
    process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error(
        "ОШИБКА: DATABASE_URL не указан."
    );
    process.exit(1);
}

const pool = new Pool({
    connectionString: DATABASE_URL,

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
            pool,
            tableName: "user_sessions",
            createTableIfMissing: true
        }),

        secret: SESSION_SECRET,

        resave: false,

        saveUninitialized: false,

        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure:
                process.env.NODE_ENV === "production",
            maxAge:
                1000 *
                60 *
                60 *
                24 *
                30
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

const CLAN_CREATE_PRICE =
    "100000";

const CHAT_MAX_LENGTH = 500;


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
            click_power NUMERIC(100,0) NOT NULL DEFAULT 1,
            banned BOOLEAN NOT NULL DEFAULT FALSE,
            is_admin BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_admin
        BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS clans (
            id SERIAL PRIMARY KEY,
            name VARCHAR(32) UNIQUE NOT NULL,
            tag VARCHAR(8) UNIQUE NOT NULL,
            owner_id INTEGER NOT NULL
                REFERENCES users(id)
                ON DELETE CASCADE,
            created_at TIMESTAMP NOT NULL
                DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS clan_members (
            id SERIAL PRIMARY KEY,
            clan_id INTEGER NOT NULL
                REFERENCES clans(id)
                ON DELETE CASCADE,
            user_id INTEGER NOT NULL UNIQUE
                REFERENCES users(id)
                ON DELETE CASCADE,
            joined_at TIMESTAMP NOT NULL
                DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS chat_messages (
            id BIGSERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL
                REFERENCES users(id)
                ON DELETE CASCADE,
            message TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL
                DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS clan_chat_messages (
            id BIGSERIAL PRIMARY KEY,
            clan_id INTEGER NOT NULL
                REFERENCES clans(id)
                ON DELETE CASCADE,
            user_id INTEGER NOT NULL
                REFERENCES users(id)
                ON DELETE CASCADE,
            message TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL
                DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS chat_mutes (
            user_id INTEGER PRIMARY KEY
                REFERENCES users(id)
                ON DELETE CASCADE,
            muted_until TIMESTAMP NULL,
            reason TEXT,
            muted_by INTEGER
                REFERENCES users(id)
                ON DELETE SET NULL
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS clan_chat_mutes (
            clan_id INTEGER NOT NULL
                REFERENCES clans(id)
                ON DELETE CASCADE,
            user_id INTEGER NOT NULL
                REFERENCES users(id)
                ON DELETE CASCADE,
            muted_until TIMESTAMP NULL,
            reason TEXT,
            muted_by INTEGER
                REFERENCES users(id)
                ON DELETE SET NULL,
            PRIMARY KEY (clan_id, user_id)
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS clan_invites (
            id BIGSERIAL PRIMARY KEY,
            clan_id INTEGER NOT NULL
                REFERENCES clans(id)
                ON DELETE CASCADE,
            inviter_id INTEGER NOT NULL
                REFERENCES users(id)
                ON DELETE CASCADE,
            invited_user_id INTEGER NOT NULL
                REFERENCES users(id)
                ON DELETE CASCADE,
            created_at TIMESTAMP NOT NULL
                DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (clan_id, invited_user_id)
        );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS
        chat_messages_created_idx
        ON chat_messages(created_at DESC);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS
        clan_chat_messages_idx
        ON clan_chat_messages(clan_id, created_at DESC);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS
        clan_invites_user_idx
        ON clan_invites(invited_user_id);
    `);

    const passwordHash =
        await bcrypt.hash(
            ADMIN_PASSWORD,
            10
        );

    await pool.query(
        `
        INSERT INTO users
            (
                username,
                password,
                clicks,
                click_power,
                banned,
                is_admin
            )
        VALUES
            ($1, $2, 0, 1, false, true)
        ON CONFLICT (username)
        DO UPDATE SET
            is_admin = true
        `,
        [
            ADMIN_USERNAME,
            passwordHash
        ]
    );

    console.log(
        "База данных готова."
    );
}


/* =========================================================
   HELPERS
========================================================= */

async function getUserById(id) {

    const result = await pool.query(
        `
        SELECT
            id,
            username,
            password,
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

    return getUserById(
        req.session.userId
    );
}


async function getAdminUser(req) {

    const adminId =
        req.session.adminUserId ||
        req.session.userId;

    if (!adminId) {
        return null;
    }

    return getUserById(adminId);
}


async function isAdmin(req) {

    const adminUser =
        await getAdminUser(req);

    if (!adminUser) {
        return false;
    }

    if (
        adminUser.username ===
        ADMIN_USERNAME
    ) {
        return true;
    }

    return (
        adminUser.is_admin === true
    );
}


async function getUserClan(userId) {

    const result = await pool.query(
        `
        SELECT
            c.id,
            c.name,
            c.tag,
            c.owner_id,
            u.username AS owner_username,
            (
                SELECT COUNT(*)
                FROM clan_members cm2
                WHERE cm2.clan_id = c.id
            ) AS members_count
        FROM clans c
        JOIN users u
            ON u.id = c.owner_id
        JOIN clan_members cm
            ON cm.clan_id = c.id
        WHERE cm.user_id = $1
        LIMIT 1
        `,
        [userId]
    );

    return result.rows[0] || null;
}


async function isClanMember(
    clanId,
    userId
) {

    const result = await pool.query(
        `
        SELECT 1
        FROM clan_members
        WHERE clan_id = $1
          AND user_id = $2
        LIMIT 1
        `,
        [
            clanId,
            userId
        ]
    );

    return result.rows.length > 0;
}


async function isClanOwner(
    clanId,
    userId
) {

    const result = await pool.query(
        `
        SELECT 1
        FROM clans
        WHERE id = $1
          AND owner_id = $2
        LIMIT 1
        `,
        [
            clanId,
            userId
        ]
    );

    return result.rows.length > 0;
}


function normalizeMessage(
    value
) {

    return String(
        value ?? ""
    )
        .trim()
        .slice(
            0,
            CHAT_MAX_LENGTH
        );
}


function validPositiveInteger(
    value
) {

    return /^\d+$/.test(
        String(value ?? "")
    ) &&
    BigInt(
        String(value)
    ) > 0n;
}


/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

async function requireAuth(
    req,
    res,
    next
) {

    try {

        const user =
            await getCurrentUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message:
                    "Сессия закончилась. Войдите снова."
            });
        }

        if (user.banned) {
            return res.status(403).json({
                success: false,
                message:
                    "Ваш аккаунт заблокирован."
            });
        }

        req.currentUser = user;

        next();

    } catch (error) {

        console.error(
            "AUTH ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Ошибка авторизации."
        });
    }
}


async function requireAdmin(
    req,
    res,
    next
) {

    try {

        if (
            !(await isAdmin(req))
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Доступ запрещён."
            });
        }

        next();

    } catch (error) {

        console.error(
            "ADMIN AUTH ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Ошибка проверки администратора."
        });
    }
}


/* =========================================================
   AUTH
========================================================= */

app.post(
    "/api/register",
    async (req, res) => {

        try {

            const username =
                String(
                    req.body.username || ""
                ).trim();

            const password =
                String(
                    req.body.password || ""
                );

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
                !/^[a-zA-Z0-9_А-Яа-яЁё-]+$/
                    .test(username)
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Недопустимые символы в нике."
                });
            }

            if (
                password.length < 4
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Пароль должен быть минимум 4 символа."
                });
            }

            const exists =
                await pool.query(
                    `
                    SELECT id
                    FROM users
                    WHERE LOWER(username) =
                          LOWER($1)
                    `,
                    [username]
                );

            if (exists.rows.length) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Такой ник уже занят."
                });
            }

            const hash =
                await bcrypt.hash(
                    password,
                    10
                );

            const result =
                await pool.query(
                    `
                    INSERT INTO users
                        (
                            username,
                            password,
                            clicks,
                            click_power,
                            banned,
                            is_admin
                        )
                    VALUES
                        ($1, $2, 0, 1, false, false)
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
                        hash
                    ]
                );

            const user =
                result.rows[0];

            req.session.userId =
                user.id;

            req.session.adminUserId =
                null;

            res.json({
                success: true,
                user
            });

        } catch (error) {

            console.error(
                "REGISTER ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка регистрации."
            });
        }
    }
);


app.post(
    "/api/login",
    async (req, res) => {

        try {

            const username =
                String(
                    req.body.username || ""
                ).trim();

            const password =
                String(
                    req.body.password || ""
                );

            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM users
                    WHERE LOWER(username) =
                          LOWER($1)
                    LIMIT 1
                    `,
                    [username]
                );

            if (!result.rows.length) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Неверный ник или пароль."
                });
            }

            const user =
                result.rows[0];

            const valid =
                await bcrypt.compare(
                    password,
                    user.password
                );

            if (!valid) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Неверный ник или пароль."
                });
            }

            if (user.banned) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Ваш аккаунт заблокирован."
                });
            }

            req.session.userId =
                user.id;

            req.session.adminUserId =
                null;

            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    clicks: user.clicks,
                    click_power:
                        user.click_power,
                    banned: user.banned,
                    is_admin:
                        user.is_admin
                }
            });

        } catch (error) {

            console.error(
                "LOGIN ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка входа."
            });
        }
    }
);


app.post(
    "/api/logout",
    (req, res) => {

        req.session.destroy(
            error => {

                if (error) {

                    console.error(
                        "LOGOUT ERROR:",
                        error
                    );

                    return res.status(500).json({
                        success: false
                    });
                }

                res.clearCookie(
                    "connect.sid"
                );

                res.json({
                    success: true
                });
            }
        );
    }
);


app.get(
    "/api/me",
    async (req, res) => {

        try {

            const user =
                await getCurrentUser(req);

            if (!user) {

                return res.json({
                    success: true,
                    loggedIn: false
                });
            }

            const impersonating =
                Boolean(
                    req.session.adminUserId
                );

            res.json({
                success: true,
                loggedIn: true,
                impersonating,
                user: {
                    id: user.id,
                    username: user.username,
                    clicks: user.clicks,
                    click_power:
                        user.click_power,
                    banned: user.banned,
                    is_admin:
                        user.is_admin
                }
            });

        } catch (error) {

            console.error(
                "ME ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message: "Ошибка."
            });
        }
    }
);


/* =========================================================
   CLICKER
========================================================= */

app.post(
    "/api/click",
    requireAuth,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET clicks =
                        clicks + click_power
                    WHERE id = $1
                      AND banned = false
                    RETURNING
                        id,
                        username,
                        clicks,
                        click_power,
                        banned,
                        is_admin
                    `,
                    [req.session.userId]
                );

            if (!result.rows.length) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Аккаунт заблокирован."
                });
            }

            res.json({
                success: true,
                user: result.rows[0]
            });

        } catch (error) {

            console.error(
                "CLICK ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка клика."
            });
        }
    }
);


/* =========================================================
   TOP
========================================================= */

app.get(
    "/api/top",
    requireAuth,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        username,
                        clicks,
                        click_power
                    FROM users
                    WHERE banned = false
                    ORDER BY clicks DESC
                    LIMIT 100
                    `
                );

            res.json({
                success: true,
                users: result.rows
            });

        } catch (error) {

            console.error(
                "TOP ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка загрузки топа."
            });
        }
    }
);


/* =========================================================
   SHOP
========================================================= */

app.get(
    "/api/shop",
    requireAuth,
    (req, res) => {

        res.json({
            success: true,
            items: STORE_ITEMS
        });
    }
);


app.post(
    "/api/shop/buy",
    requireAuth,
    async (req, res) => {

        try {

            const itemId =
                String(
                    req.body.itemId || ""
                );

            const item =
                STORE_ITEMS.find(
                    x => x.id === itemId
                );

            if (!item) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Товар не найден."
                });
            }

            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET
                        clicks =
                            clicks -
                            $1::numeric,

                        click_power =
                            click_power +
                            $2::numeric
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

            if (!result.rows.length) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Недостаточно кликов."
                });
            }

            res.json({
                success: true,
                item,
                user: result.rows[0]
            });

        } catch (error) {

            console.error(
                "SHOP BUY ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка покупки."
            });
        }
    }
);


app.post(
    "/api/shop/buy-max",
    requireAuth,
    async (req, res) => {

        try {

            const itemId =
                String(
                    req.body.itemId || ""
                );

            const item =
                STORE_ITEMS.find(
                    x => x.id === itemId
                );

            if (!item) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Товар не найден."
                });
            }

            const result =
                await pool.query(
                    `
                    WITH purchase AS (
                        SELECT
                            FLOOR(
                                clicks /
                                $1::numeric
                            ) AS quantity
                        FROM users
                        WHERE id = $3
                          AND banned = false
                    )
                    UPDATE users AS u
                    SET
                        clicks =
                            u.clicks -
                            (
                                p.quantity *
                                $1::numeric
                            ),

                        click_power =
                            u.click_power +
                            (
                                p.quantity *
                                $2::numeric
                            )
                    FROM purchase AS p
                    WHERE u.id = $3
                      AND p.quantity > 0

                    RETURNING
                        u.id,
                        u.username,
                        u.clicks,
                        u.click_power,
                        u.banned,
                        p.quantity AS quantity,
                        (
                            p.quantity *
                            $1::numeric
                        ) AS spent,
                        (
                            p.quantity *
                            $2::numeric
                        ) AS power_gain
                    `,
                    [
                        item.price,
                        item.amount,
                        req.session.userId
                    ]
                );

            if (!result.rows.length) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Недостаточно кликов для покупки."
                });
            }

            const row =
                result.rows[0];

            res.json({
                success: true,
                item,
                quantity:
                    String(row.quantity),
                spent:
                    String(row.spent),
                power_gain:
                    String(row.power_gain),
                user: {
                    id: row.id,
                    username:
                        row.username,
                    clicks:
                        String(row.clicks),
                    click_power:
                        String(row.click_power),
                    banned:
                        row.banned
                }
            });

        } catch (error) {

            console.error(
                "SHOP BUY MAX ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка покупки на весь баланс."
            });
        }
    }
);


/* =========================================================
   CLANS
========================================================= */

app.get(
    "/api/clans",
    requireAuth,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        c.id,
                        c.name,
                        c.tag,
                        c.owner_id,
                        u.username
                            AS owner_username,
                        (
                            SELECT COUNT(*)
                            FROM clan_members cm
                            WHERE cm.clan_id = c.id
                        ) AS members_count
                    FROM clans c
                    JOIN users u
                        ON u.id = c.owner_id
                    ORDER BY
                        (
                            SELECT COUNT(*)
                            FROM clan_members cm2
                            WHERE cm2.clan_id = c.id
                        ) DESC,
                        c.created_at ASC
                    `
                );

            res.json({
                success: true,
                clans: result.rows
            });

        } catch (error) {

            console.error(
                "CLANS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка загрузки кланов."
            });
        }
    }
);


app.get(
    "/api/clans/my",
    requireAuth,
    async (req, res) => {

        try {

            const clan =
                await getUserClan(
                    req.session.userId
                );

            res.json({
                success: true,
                clan
            });

        } catch (error) {

            console.error(
                "MY CLAN ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка загрузки клана."
            });
        }
    }
);


/*
 * СОЗДАНИЕ КЛАНА
 * Стоимость: 100 000 кликов
 */

app.post(
    "/api/clans/create",
    requireAuth,
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const name =
                String(
                    req.body.name || ""
                ).trim();

            const tag =
                String(
                    req.body.tag || ""
                )
                    .trim()
                    .toUpperCase();

            if (
                name.length < 2 ||
                name.length > 32
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Название должно быть от 2 до 32 символов."
                });
            }

            if (
                tag.length < 2 ||
                tag.length > 8
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Тег должен быть от 2 до 8 символов."
                });
            }

            const existingClan =
                await getUserClan(
                    req.session.userId
                );

            if (existingClan) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Вы уже состоите в клане."
                });
            }

            await client.query(
                "BEGIN"
            );

            const balance =
                await client.query(
                    `
                    SELECT clicks
                    FROM users
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [req.session.userId]
                );

            if (
                !balance.rows.length
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({
                    success: false,
                    message:
                        "Игрок не найден."
                });
            }

            const clicks =
                BigInt(
                    String(
                        balance.rows[0].clicks
                    )
                );

            if (
                clicks <
                BigInt(CLAN_CREATE_PRICE)
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({
                    success: false,
                    message:
                        "Для создания клана нужно 100 000 кликов."
                });
            }

            const duplicate =
                await client.query(
                    `
                    SELECT id
                    FROM clans
                    WHERE LOWER(name) =
                          LOWER($1)
                       OR LOWER(tag) =
                          LOWER($2)
                    LIMIT 1
                    `,
                    [
                        name,
                        tag
                    ]
                );

            if (
                duplicate.rows.length
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({
                    success: false,
                    message:
                        "Такое название или тег уже занят."
                });
            }

            const clanResult =
                await client.query(
                    `
                    INSERT INTO clans
                        (
                            name,
                            tag,
                            owner_id
                        )
                    VALUES
                        ($1, $2, $3)
                    RETURNING
                        id,
                        name,
                        tag,
                        owner_id
                    `,
                    [
                        name,
                        tag,
                        req.session.userId
                    ]
                );

            const clan =
                clanResult.rows[0];

            await client.query(
                `
                INSERT INTO clan_members
                    (
                        clan_id,
                        user_id
                    )
                VALUES
                    ($1, $2)
                `,
                [
                    clan.id,
                    req.session.userId
                ]
            );

            await client.query(
                `
                UPDATE users
                SET clicks =
                    clicks - $1::numeric
                WHERE id = $2
                `,
                [
                    CLAN_CREATE_PRICE,
                    req.session.userId
                ]
            );

            await client.query(
                "COMMIT"
            );

            res.json({
                success: true,
                clan,
                price:
                    CLAN_CREATE_PRICE
            });

        } catch (error) {

            try {
                await client.query(
                    "ROLLBACK"
                );
            } catch {}

            console.error(
                "CREATE CLAN ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка создания клана."
            });

        } finally {

            client.release();
        }
    }
);


/*
 * ВСТУПЛЕНИЕ НАПРЯМУЮ ЗАПРЕЩЕНО.
 * Теперь только приглашения.
 */

app.post(
    "/api/clans/:id/join",
    requireAuth,
    async (req, res) => {

        res.status(403).json({
            success: false,
            message:
                "Вступление закрыто. В клан можно попасть только по приглашению."
        });
    }
);


/*
 * СПИСОК УЧАСТНИКОВ
 */

app.get(
    "/api/clans/:id/members",
    requireAuth,
    async (req, res) => {

        try {

            const clanId =
                String(
                    req.params.id
                );

            const result =
                await pool.query(
                    `
                    SELECT
                        u.id,
                        u.username,
                        u.clicks,
                        u.click_power,
                        u.is_admin,
                        c.owner_id,
                        cm.joined_at
                    FROM clan_members cm
                    JOIN users u
                        ON u.id = cm.user_id
                    JOIN clans c
                        ON c.id = cm.clan_id
                    WHERE cm.clan_id = $1
                    ORDER BY
                        CASE
                            WHEN u.id = c.owner_id
                            THEN 0
                            ELSE 1
                        END,
                        u.username
                    `,
                    [clanId]
                );

            res.json({
                success: true,
                members:
                    result.rows
            });

        } catch (error) {

            console.error(
                "CLAN MEMBERS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка загрузки участников."
            });
        }
    }
);


/*
 * ПОКИНУТЬ КЛАН
 */

app.post(
    "/api/clans/leave",
    requireAuth,
    async (req, res) => {

        try {

            const clan =
                await getUserClan(
                    req.session.userId
                );

            if (!clan) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Вы не состоите в клане."
                });
            }

            if (
                Number(clan.owner_id) ===
                Number(req.session.userId)
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Владелец не может покинуть клан."
                });
            }

            await pool.query(
                `
                DELETE FROM clan_members
                WHERE clan_id = $1
                  AND user_id = $2
                `,
                [
                    clan.id,
                    req.session.userId
                ]
            );

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "LEAVE CLAN ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка выхода из клана."
            });
        }
    }
);


/* =========================================================
   CLAN INVITES
========================================================= */


/*
 * ВЛАДЕЛЕЦ ПРИГЛАШАЕТ ИГРОКА
 */

app.post(
    "/api/clans/:id/invite",
    requireAuth,
    async (req, res) => {

        try {

            const clanId =
                String(
                    req.params.id
                );

            const username =
                String(
                    req.body.username || ""
                ).trim();

            if (!username) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Введите ник игрока."
                });
            }

            const owner =
                await isClanOwner(
                    clanId,
                    req.session.userId
                );

            if (!owner) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Только владелец клана может приглашать игроков."
                });
            }

            const target =
                await pool.query(
                    `
                    SELECT
                        id,
                        username,
                        banned
                    FROM users
                    WHERE LOWER(username) =
                          LOWER($1)
                    LIMIT 1
                    `,
                    [username]
                );

            if (!target.rows.length) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Игрок не найден."
                });
            }

            const targetUser =
                target.rows[0];

            if (targetUser.banned) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Нельзя пригласить заблокированного игрока."
                });
            }

            if (
                Number(
                    targetUser.id
                ) ===
                Number(
                    req.session.userId
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Нельзя пригласить самого себя."
                });
            }

            const targetClan =
                await getUserClan(
                    targetUser.id
                );

            if (targetClan) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Игрок уже состоит в клане."
                });
            }

            const clanExists =
                await pool.query(
                    `
                    SELECT id
                    FROM clans
                    WHERE id = $1
                    `,
                    [clanId]
                );

            if (!clanExists.rows.length) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Клан не найден."
                });
            }

            await pool.query(
                `
                INSERT INTO clan_invites
                    (
                        clan_id,
                        inviter_id,
                        invited_user_id
                    )
                VALUES
                    ($1, $2, $3)
                ON CONFLICT
                    (
                        clan_id,
                        invited_user_id
                    )
                DO UPDATE SET
                    inviter_id =
                        EXCLUDED.inviter_id,
                    created_at =
                        CURRENT_TIMESTAMP
                `,
                [
                    clanId,
                    req.session.userId,
                    targetUser.id
                ]
            );

            res.json({
                success: true,
                message:
                    `Приглашение отправлено игроку ${targetUser.username}.`
            });

        } catch (error) {

            console.error(
                "CLAN INVITE ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка приглашения."
            });
        }
    }
);


/*
 * МОИ ПРИГЛАШЕНИЯ
 */

app.get(
    "/api/clans/invites",
    requireAuth,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        ci.id,
                        ci.clan_id,
                        ci.created_at,
                        c.name AS clan_name,
                        c.tag AS clan_tag,
                        u.username
                            AS inviter_username,
                        (
                            SELECT COUNT(*)
                            FROM clan_members cm
                            WHERE cm.clan_id =
                                  ci.clan_id
                        ) AS members_count
                    FROM clan_invites ci
                    JOIN clans c
                        ON c.id = ci.clan_id
                    JOIN users u
                        ON u.id = ci.inviter_id
                    WHERE ci.invited_user_id = $1
                    ORDER BY
                        ci.created_at DESC
                    `,
                    [req.session.userId]
                );

            res.json({
                success: true,
                invites:
                    result.rows
            });

        } catch (error) {

            console.error(
                "INVITES ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка загрузки приглашений."
            });
        }
    }
);


/*
 * ПРИНЯТЬ ПРИГЛАШЕНИЕ
 */

app.post(
    "/api/clans/invites/:id/accept",
    requireAuth,
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            await client.query(
                "BEGIN"
            );

            const currentClan =
                await getUserClan(
                    req.session.userId
                );

            if (currentClan) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({
                    success: false,
                    message:
                        "Вы уже состоите в клане."
                });
            }

            const inviteResult =
                await client.query(
                    `
                    SELECT
                        ci.id,
                        ci.clan_id
                    FROM clan_invites ci
                    WHERE ci.id = $1
                      AND ci.invited_user_id = $2
                    FOR UPDATE
                    `,
                    [
                        req.params.id,
                        req.session.userId
                    ]
                );

            if (
                !inviteResult.rows.length
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({
                    success: false,
                    message:
                        "Приглашение не найдено."
                });
            }

            const invite =
                inviteResult.rows[0];

            const clanResult =
                await client.query(
                    `
                    SELECT *
                    FROM clans
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [invite.clan_id]
                );

            if (
                !clanResult.rows.length
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({
                    success: false,
                    message:
                        "Клан больше не существует."
                });
            }

            await client.query(
                `
                INSERT INTO clan_members
                    (
                        clan_id,
                        user_id
                    )
                VALUES
                    ($1, $2)
                `,
                [
                    invite.clan_id,
                    req.session.userId
                ]
            );

            await client.query(
                `
                DELETE FROM clan_invites
                WHERE invited_user_id = $1
                  AND id = $2
                `,
                [
                    req.session.userId,
                    invite.id
                ]
            );

            await client.query(
                "COMMIT"
            );

            res.json({
                success: true
            });

        } catch (error) {

            try {
                await client.query(
                    "ROLLBACK"
                );
            } catch {}

            console.error(
                "ACCEPT INVITE ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка принятия приглашения."
            });

        } finally {

            client.release();
        }
    }
);


/*
 * ОТКЛОНИТЬ ПРИГЛАШЕНИЕ
 */

app.post(
    "/api/clans/invites/:id/decline",
    requireAuth,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    DELETE FROM clan_invites
                    WHERE id = $1
                      AND invited_user_id = $2
                    RETURNING id
                    `,
                    [
                        req.params.id,
                        req.session.userId
                    ]
                );

            if (!result.rows.length) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Приглашение не найдено."
                });
            }

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "DECLINE INVITE ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка отклонения приглашения."
            });
        }
    }
);


/* =========================================================
   GLOBAL CHAT
========================================================= */


/*
 * ПРОВЕРКА ГЛОБАЛЬНОГО МУТА
 */

async function getGlobalMute(
    userId
) {

    const result =
        await pool.query(
            `
            SELECT
                user_id,
                muted_until,
                reason
            FROM chat_mutes
            WHERE user_id = $1
            `,
            [userId]
        );

    if (!result.rows.length) {
        return null;
    }

    const mute =
        result.rows[0];

    if (
        mute.muted_until &&
        new Date(mute.muted_until)
            <= new Date()
    ) {

        await pool.query(
            `
            DELETE FROM chat_mutes
            WHERE user_id = $1
            `,
            [userId]
        );

        return null;
    }

    return mute;
}


/*
 * ПОЛУЧИТЬ ОБЩИЙ ЧАТ
 */

app.get(
    "/api/chat/messages",
    requireAuth,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        cm.id,
                        cm.user_id,
                        u.username,
                        cm.message,
                        cm.created_at
                    FROM chat_messages cm
                    JOIN users u
                        ON u.id = cm.user_id
                    ORDER BY
                        cm.id DESC
                    LIMIT 100
                    `
                );

            res.json({
                success: true,
                messages:
                    result.rows.reverse()
            });

        } catch (error) {

            console.error(
                "CHAT LOAD ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка загрузки чата."
            });
        }
    }
);


/*
 * ОТПРАВИТЬ В ОБЩИЙ ЧАТ
 */

app.post(
    "/api/chat/messages",
    requireAuth,
    async (req, res) => {

        try {

            const message =
                normalizeMessage(
                    req.body.message
                );

            if (!message) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Сообщение не может быть пустым."
                });
            }

            const mute =
                await getGlobalMute(
                    req.session.userId
                );

            if (mute) {

                let messageText =
                    "Вы замьючены в общем чате.";

                if (mute.muted_until) {

                    messageText +=
                        " До " +
                        new Date(
                            mute.muted_until
                        ).toLocaleString(
                            "ru-RU"
                        ) +
                        ".";
                } else {

                    messageText +=
                        " Мут бессрочный.";
                }

                if (mute.reason) {

                    messageText +=
                        " Причина: " +
                        mute.reason;
                }

                return res.status(403).json({
                    success: false,
                    muted: true,
                    message:
                        messageText
                });
            }

            const result =
                await pool.query(
                    `
                    INSERT INTO chat_messages
                        (
                            user_id,
                            message
                        )
                    VALUES
                        ($1, $2)
                    RETURNING
                        id,
                        user_id,
                        message,
                        created_at
                    `,
                    [
                        req.session.userId,
                        message
                    ]
                );

            res.json({
                success: true,
                message: {
                    ...result.rows[0],
                    username:
                        req.currentUser.username
                }
            });

        } catch (error) {

            console.error(
                "CHAT SEND ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка отправки сообщения."
            });
        }
    }
);


/* =========================================================
   CLAN CHAT
========================================================= */


/*
 * ПРОВЕРКА МУТА КЛАНОВОГО ЧАТА
 */

async function getClanMute(
    clanId,
    userId
) {

    const result =
        await pool.query(
            `
            SELECT
                clan_id,
                user_id,
                muted_until,
                reason
            FROM clan_chat_mutes
            WHERE clan_id = $1
              AND user_id = $2
            `,
            [
                clanId,
                userId
            ]
        );

    if (!result.rows.length) {
        return null;
    }

    const mute =
        result.rows[0];

    if (
        mute.muted_until &&
        new Date(mute.muted_until)
            <= new Date()
    ) {

        await pool.query(
            `
            DELETE FROM clan_chat_mutes
            WHERE clan_id = $1
              AND user_id = $2
            `,
            [
                clanId,
                userId
            ]
        );

        return null;
    }

    return mute;
}


/*
 * ПОЛУЧИТЬ КЛАНОВЫЙ ЧАТ
 */

app.get(
    "/api/clans/:id/chat/messages",
    requireAuth,
    async (req, res) => {

        try {

            const clanId =
                String(
                    req.params.id
                );

            if (
                !(await isClanMember(
                    clanId,
                    req.session.userId
                ))
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Вы не состоите в этом клане."
                });
            }

            const result =
                await pool.query(
                    `
                    SELECT
                        ccm.id,
                        ccm.clan_id,
                        ccm.user_id,
                        u.username,
                        ccm.message,
                        ccm.created_at
                    FROM clan_chat_messages ccm
                    JOIN users u
                        ON u.id = ccm.user_id
                    WHERE ccm.clan_id = $1
                    ORDER BY
                        ccm.id DESC
                    LIMIT 100
                    `,
                    [clanId]
                );

            res.json({
                success: true,
                messages:
                    result.rows.reverse()
            });

        } catch (error) {

            console.error(
                "CLAN CHAT LOAD ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка загрузки кланового чата."
            });
        }
    }
);


/*
 * ОТПРАВИТЬ В КЛАНОВЫЙ ЧАТ
 */

app.post(
    "/api/clans/:id/chat/messages",
    requireAuth,
    async (req, res) => {

        try {

            const clanId =
                String(
                    req.params.id
                );

            if (
                !(await isClanMember(
                    clanId,
                    req.session.userId
                ))
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Вы не состоите в этом клане."
                });
            }

            const message =
                normalizeMessage(
                    req.body.message
                );

            if (!message) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Сообщение не может быть пустым."
                });
            }

            const mute =
                await getClanMute(
                    clanId,
                    req.session.userId
                );

            if (mute) {

                let messageText =
                    "Вы замьючены в чате этого клана.";

                if (mute.muted_until) {

                    messageText +=
                        " До " +
                        new Date(
                            mute.muted_until
                        ).toLocaleString(
                            "ru-RU"
                        ) +
                        ".";
                } else {

                    messageText +=
                        " Мут бессрочный.";
                }

                if (mute.reason) {

                    messageText +=
                        " Причина: " +
                        mute.reason;
                }

                return res.status(403).json({
                    success: false,
                    muted: true,
                    message:
                        messageText
                });
            }

            const result =
                await pool.query(
                    `
                    INSERT INTO clan_chat_messages
                        (
                            clan_id,
                            user_id,
                            message
                        )
                    VALUES
                        ($1, $2, $3)
                    RETURNING
                        id,
                        clan_id,
                        user_id,
                        message,
                        created_at
                    `,
                    [
                        clanId,
                        req.session.userId,
                        message
                    ]
                );

            res.json({
                success: true,
                message: {
                    ...result.rows[0],
                    username:
                        req.currentUser.username
                }
            });

        } catch (error) {

            console.error(
                "CLAN CHAT SEND ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка отправки сообщения."
            });
        }
    }
);


/* =========================================================
   ADMIN USERS
========================================================= */

app.get(
    "/api/admin/users",
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await pool.query(
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
                    ORDER BY
                        id ASC
                    `
                );

            res.json({
                success: true,
                users:
                    result.rows
            });

        } catch (error) {

            console.error(
                "ADMIN USERS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка загрузки игроков."
            });
        }
    }
);


/* =========================================================
   ADMIN EDIT USER
========================================================= */

app.post(
    "/api/admin/users/:id/edit",
    requireAdmin,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );

            const target =
                await getUserById(id);

            if (!target) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Игрок не найден."
                });
            }

            const fields = [];
            const values = [];
            let index = 1;

            if (
                req.body.username !==
                undefined
            ) {

                const username =
                    String(
                        req.body.username
                    ).trim();

                if (
                    username.length < 3 ||
                    username.length > 32
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "Неверная длина ника."
                    });
                }

                if (
                    target.username ===
                    ADMIN_USERNAME &&
                    username !==
                    ADMIN_USERNAME
                ) {

                    return res.status(403).json({
                        success: false,
                        message:
                            "Нельзя переименовать главного администратора."
                    });
                }

                fields.push(
                    `username = $${index++}`
                );

                values.push(
                    username
                );
            }

            if (
                req.body.clicks !==
                undefined
            ) {

                if (
                    !/^\d+$/.test(
                        String(
                            req.body.clicks
                        )
                    )
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "Баланс должен быть целым числом."
                    });
                }

                fields.push(
                    `clicks = $${index++}::numeric`
                );

                values.push(
                    String(
                        req.body.clicks
                    )
                );
            }

            if (
                req.body.click_power !==
                undefined
            ) {

                if (
                    !/^\d+$/.test(
                        String(
                            req.body.click_power
                        )
                    )
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "Сила клика должна быть целым числом."
                    });
                }

                fields.push(
                    `click_power = $${index++}::numeric`
                );

                values.push(
                    String(
                        req.body.click_power
                    )
                );
            }

            if (!fields.length) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Нечего изменять."
                });
            }

            values.push(id);

            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET ${fields.join(", ")}
                    WHERE id = $${index}
                    RETURNING
                        id,
                        username,
                        clicks,
                        click_power,
                        banned,
                        is_admin
                    `,
                    values
                );

            res.json({
                success: true,
                user:
                    result.rows[0]
            });

        } catch (error) {

            console.error(
                "ADMIN EDIT ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка изменения игрока."
            });
        }
    }
);


/* =========================================================
   ADMIN GIVE BALANCE
========================================================= */

app.post(
    "/api/admin/users/:id/give-balance",
    requireAdmin,
    async (req, res) => {

        try {

            const amount =
                String(
                    req.body.amount || ""
                );

            if (
                !validPositiveInteger(
                    amount
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Введите положительное число."
                });
            }

            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET clicks =
                        clicks +
                        $1::numeric
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
                        req.params.id
                    ]
                );

            if (!result.rows.length) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Игрок не найден."
                });
            }

            res.json({
                success: true,
                user:
                    result.rows[0]
            });

        } catch (error) {

            console.error(
                "GIVE BALANCE ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка выдачи баланса."
            });
        }
    }
);


/* =========================================================
   ADMIN GIVE POWER
========================================================= */

app.post(
    "/api/admin/users/:id/give-click-power",
    requireAdmin,
    async (req, res) => {

        try {

            const amount =
                String(
                    req.body.amount || ""
                );

            if (
                !validPositiveInteger(
                    amount
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Введите положительное число."
                });
            }

            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET click_power =
                        click_power +
                        $1::numeric
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
                        req.params.id
                    ]
                );

            if (!result.rows.length) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Игрок не найден."
                });
            }

            res.json({
                success: true,
                user:
                    result.rows[0]
            });

        } catch (error) {

            console.error(
                "GIVE POWER ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка выдачи силы клика."
            });
        }
    }
);


/* =========================================================
   ADMIN GIVE ADMIN
========================================================= */

app.post(
    "/api/admin/users/:id/give-admin",
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET is_admin = true
                    WHERE id = $1
                    RETURNING
                        id,
                        username,
                        is_admin
                    `,
                    [req.params.id]
                );

            if (!result.rows.length) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Игрок не найден."
                });
            }

            res.json({
                success: true,
                user:
                    result.rows[0]
            });

        } catch (error) {

            console.error(
                "GIVE ADMIN ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка выдачи админки."
            });
        }
    }
);


/* =========================================================
   ADMIN REMOVE ADMIN
========================================================= */

app.post(
    "/api/admin/users/:id/remove-admin",
    requireAdmin,
    async (req, res) => {

        try {

            const target =
                await getUserById(
                    req.params.id
                );

            if (!target) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Игрок не найден."
                });
            }

            if (
                target.username ===
                ADMIN_USERNAME
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Нельзя забрать админку у главного администратора."
                });
            }

            await pool.query(
                `
                UPDATE users
                SET is_admin = false
                WHERE id = $1
                `,
                [req.params.id]
            );

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "REMOVE ADMIN ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка снятия админки."
            });
        }
    }
);


/* =========================================================
   ADMIN IMPERSONATE
========================================================= */

app.post(
    "/api/admin/users/:id/impersonate",
    requireAdmin,
    async (req, res) => {

        try {

            const target =
                await getUserById(
                    req.params.id
                );

            if (!target) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Игрок не найден."
                });
            }

            if (target.banned) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Нельзя войти в заблокированный аккаунт."
                });
            }

            const admin =
                await getAdminUser(req);

            req.session.adminUserId =
                admin.id;

            req.session.userId =
                target.id;

            res.json({
                success: true,
                user: {
                    id: target.id,
                    username:
                        target.username,
                    clicks:
                        target.clicks,
                    click_power:
                        target.click_power,
                    banned:
                        target.banned,
                    is_admin:
                        target.is_admin
                }
            });

        } catch (error) {

            console.error(
                "IMPERSONATE ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка входа в аккаунт."
            });
        }
    }
);


/* =========================================================
   STOP IMPERSONATION
========================================================= */

app.post(
    "/api/admin/stop-impersonation",
    requireAuth,
    async (req, res) => {

        try {

            if (
                !req.session.adminUserId
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Сейчас нет режима входа в аккаунт."
                });
            }

            const adminId =
                req.session.adminUserId;

            req.session.userId =
                adminId;

            req.session.adminUserId =
                null;

            const admin =
                await getUserById(
                    adminId
                );

            res.json({
                success: true,
                user: admin
            });

        } catch (error) {

            console.error(
                "STOP IMPERSONATION ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка возврата."
            });
        }
    }
);


/* =========================================================
   ADMIN BAN
========================================================= */

app.post(
    "/api/admin/users/:id/ban",
    requireAdmin,
    async (req, res) => {

        try {

            const target =
                await getUserById(
                    req.params.id
                );

            if (!target) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Игрок не найден."
                });
            }

            if (
                target.username ===
                ADMIN_USERNAME
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Главного администратора нельзя забанить."
                });
            }

            await pool.query(
                `
                UPDATE users
                SET banned = true
                WHERE id = $1
                `,
                [req.params.id]
            );

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "BAN ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка бана."
            });
        }
    }
);


/* =========================================================
   ADMIN UNBAN
========================================================= */

app.post(
    "/api/admin/users/:id/unban",
    requireAdmin,
    async (req, res) => {

        try {

            await pool.query(
                `
                UPDATE users
                SET banned = false
                WHERE id = $1
                `,
                [req.params.id]
            );

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "UNBAN ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка разбана."
            });
        }
    }
);


/* =========================================================
   ADMIN RESET
========================================================= */

app.post(
    "/api/admin/users/:id/reset",
    requireAdmin,
    async (req, res) => {

        try {

            const target =
                await getUserById(
                    req.params.id
                );

            if (!target) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Игрок не найден."
                });
            }

            if (
                target.username ===
                ADMIN_USERNAME
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Нельзя сбросить главного администратора."
                });
            }

            await pool.query(
                `
                UPDATE users
                SET
                    clicks = 0,
                    click_power = 1
                WHERE id = $1
                `,
                [req.params.id]
            );

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "RESET ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка сброса."
            });
        }
    }
);


/* =========================================================
   ADMIN DELETE
========================================================= */

app.post(
    "/api/admin/users/:id/delete",
    requireAdmin,
    async (req, res) => {

        try {

            const target =
                await getUserById(
                    req.params.id
                );

            if (!target) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Игрок не найден."
                });
            }

            if (
                target.username ===
                ADMIN_USERNAME
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Главного администратора нельзя удалить."
                });
            }

            await pool.query(
                `
                DELETE FROM users
                WHERE id = $1
                `,
                [req.params.id]
            );

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "DELETE USER ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка удаления аккаунта."
            });
        }
    }
);


/* =========================================================
   ADMIN GLOBAL CHAT
========================================================= */


/*
 * ВСЕ СООБЩЕНИЯ ОБЩЕГО ЧАТА
 */

app.get(
    "/api/admin/chat/messages",
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        cm.id,
                        cm.user_id,
                        u.username,
                        cm.message,
                        cm.created_at
                    FROM chat_messages cm
                    JOIN users u
                        ON u.id = cm.user_id
                    ORDER BY
                        cm.id DESC
                    LIMIT 300
                    `
                );

            res.json({
                success: true,
                messages:
                    result.rows
            });

        } catch (error) {

            console.error(
                "ADMIN CHAT ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка загрузки общего чата."
            });
        }
    }
);


/*
 * УДАЛИТЬ СООБЩЕНИЕ ОБЩЕГО ЧАТА
 */

app.post(
    "/api/admin/chat/messages/:id/delete",
    requireAdmin,
    async (req, res) => {

        try {

            await pool.query(
                `
                DELETE FROM chat_messages
                WHERE id = $1
                `,
                [req.params.id]
            );

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "ADMIN DELETE CHAT ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка удаления сообщения."
            });
        }
    }
);


/*
 * ЗАМЬЮТИТЬ В ОБЩЕМ ЧАТЕ
 *
 * durationMinutes:
 * 0 = навсегда
 */

app.post(
    "/api/admin/chat/mute/:userId",
    requireAdmin,
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.params.userId
                );

            const duration =
                Number(
                    req.body.durationMinutes ||
                    0
                );

            const reason =
                String(
                    req.body.reason || ""
                )
                    .trim()
                    .slice(0, 255);

            const target =
                await getUserById(
                    userId
                );

            if (!target) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Игрок не найден."
                });
            }

            if (
                target.username ===
                ADMIN_USERNAME
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Главного администратора нельзя замьютить."
                });
            }

            let mutedUntil = null;

            if (
                Number.isFinite(duration) &&
                duration > 0
            ) {

                mutedUntil =
                    new Date(
                        Date.now() +
                        duration *
                        60 *
                        1000
                    );
            }

            const admin =
                await getAdminUser(req);

            await pool.query(
                `
                INSERT INTO chat_mutes
                    (
                        user_id,
                        muted_until,
                        reason,
                        muted_by
                    )
                VALUES
                    ($1, $2, $3, $4)
                ON CONFLICT (user_id)
                DO UPDATE SET
                    muted_until =
                        EXCLUDED.muted_until,
                    reason =
                        EXCLUDED.reason,
                    muted_by =
                        EXCLUDED.muted_by
                `,
                [
                    userId,
                    mutedUntil,
                    reason || null,
                    admin.id
                ]
            );

            res.json({
                success: true,
                muted_until:
                    mutedUntil
            });

        } catch (error) {

            console.error(
                "ADMIN CHAT MUTE ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка мута."
            });
        }
    }
);


/*
 * СНЯТЬ МУТ
 */

app.post(
    "/api/admin/chat/unmute/:userId",
    requireAdmin,
    async (req, res) => {

        try {

            await pool.query(
                `
                DELETE FROM chat_mutes
                WHERE user_id = $1
                `,
                [req.params.userId]
            );

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "ADMIN CHAT UNMUTE ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка снятия мута."
            });
        }
    }
);


/*
 * СПИСОК ГЛОБАЛЬНЫХ МУТОВ
 */

app.get(
    "/api/admin/chat/mutes",
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        cm.user_id,
                        u.username,
                        cm.muted_until,
                        cm.reason
                    FROM chat_mutes cm
                    JOIN users u
                        ON u.id = cm.user_id
                    ORDER BY
                        u.username
                    `
                );

            res.json({
                success: true,
                mutes:
                    result.rows
            });

        } catch (error) {

            console.error(
                "ADMIN MUTES ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка загрузки мутов."
            });
        }
    }
);


/* =========================================================
   ADMIN CLAN CHATS
========================================================= */


/*
 * СПИСОК КЛАНОВ ДЛЯ АДМИНКИ
 */

app.get(
    "/api/admin/clans",
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        c.id,
                        c.name,
                        c.tag,
                        c.owner_id,
                        u.username
                            AS owner_username,
                        (
                            SELECT COUNT(*)
                            FROM clan_members cm
                            WHERE cm.clan_id = c.id
                        ) AS members_count
                    FROM clans c
                    JOIN users u
                        ON u.id = c.owner_id
                    ORDER BY
                        c.name
                    `
                );

            res.json({
                success: true,
                clans:
                    result.rows
            });

        } catch (error) {

            console.error(
                "ADMIN CLANS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка загрузки кланов."
            });
        }
    }
);


/*
 * ЧАТ КОНКРЕТНОГО КЛАНА ДЛЯ АДМИНА
 */

app.get(
    "/api/admin/clans/:id/chat/messages",
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        ccm.id,
                        ccm.clan_id,
                        ccm.user_id,
                        u.username,
                        ccm.message,
                        ccm.created_at
                    FROM clan_chat_messages ccm
                    JOIN users u
                        ON u.id = ccm.user_id
                    WHERE ccm.clan_id = $1
                    ORDER BY
                        ccm.id DESC
                    LIMIT 300
                    `,
                    [req.params.id]
                );

            res.json({
                success: true,
                messages:
                    result.rows
            });

        } catch (error) {

            console.error(
                "ADMIN CLAN CHAT ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка загрузки чата клана."
            });
        }
    }
);


/*
 * УДАЛИТЬ СООБЩЕНИЕ КЛАНОВОГО ЧАТА
 */

app.post(
    "/api/admin/clan-chat/messages/:id/delete",
    requireAdmin,
    async (req, res) => {

        try {

            await pool.query(
                `
                DELETE FROM clan_chat_messages
                WHERE id = $1
                `,
                [req.params.id]
            );

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "ADMIN DELETE CLAN CHAT ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка удаления сообщения."
            });
        }
    }
);


/*
 * МУТ В КОНКРЕТНОМ КЛАНЕ
 */

app.post(
    "/api/admin/clan-chat/mute/:clanId/:userId",
    requireAdmin,
    async (req, res) => {

        try {

            const clanId =
                Number(
                    req.params.clanId
                );

            const userId =
                Number(
                    req.params.userId
                );

            const member =
                await isClanMember(
                    clanId,
                    userId
                );

            if (!member) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Игрок не состоит в этом клане."
                });
            }

            const duration =
                Number(
                    req.body.durationMinutes ||
                    0
                );

            const reason =
                String(
                    req.body.reason || ""
                )
                    .trim()
                    .slice(0, 255);

            const target =
                await getUserById(
                    userId
                );

            if (
                target &&
                target.username ===
                ADMIN_USERNAME
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Главного администратора нельзя замьютить."
                });
            }

            let mutedUntil = null;

            if (
                Number.isFinite(duration) &&
                duration > 0
            ) {

                mutedUntil =
                    new Date(
                        Date.now() +
                        duration *
                        60 *
                        1000
                    );
            }

            const admin =
                await getAdminUser(req);

            await pool.query(
                `
                INSERT INTO clan_chat_mutes
                    (
                        clan_id,
                        user_id,
                        muted_until,
                        reason,
                        muted_by
                    )
                VALUES
                    ($1, $2, $3, $4, $5)
                ON CONFLICT
                    (
                        clan_id,
                        user_id
                    )
                DO UPDATE SET
                    muted_until =
                        EXCLUDED.muted_until,
                    reason =
                        EXCLUDED.reason,
                    muted_by =
                        EXCLUDED.muted_by
                `,
                [
                    clanId,
                    userId,
                    mutedUntil,
                    reason || null,
                    admin.id
                ]
            );

            res.json({
                success: true,
                muted_until:
                    mutedUntil
            });

        } catch (error) {

            console.error(
                "ADMIN CLAN MUTE ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка мута в клане."
            });
        }
    }
);


/*
 * СНЯТЬ МУТ В КЛАНЕ
 */

app.post(
    "/api/admin/clan-chat/unmute/:clanId/:userId",
    requireAdmin,
    async (req, res) => {

        try {

            await pool.query(
                `
                DELETE FROM clan_chat_mutes
                WHERE clan_id = $1
                  AND user_id = $2
                `,
                [
                    req.params.clanId,
                    req.params.userId
                ]
            );

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "ADMIN CLAN UNMUTE ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка снятия мута."
            });
        }
    }
);


/*
 * МУТЫ КОНКРЕТНОГО КЛАНА
 */

app.get(
    "/api/admin/clans/:id/mutes",
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        m.user_id,
                        u.username,
                        m.muted_until,
                        m.reason
                    FROM clan_chat_mutes m
                    JOIN users u
                        ON u.id = m.user_id
                    WHERE m.clan_id = $1
                    ORDER BY
                        u.username
                    `,
                    [req.params.id]
                );

            res.json({
                success: true,
                mutes:
                    result.rows
            });

        } catch (error) {

            console.error(
                "ADMIN CLAN MUTES ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка загрузки мутов."
            });
        }
    }
);


/* =========================================================
   STATIC
========================================================= */

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);


/* =========================================================
   PAGE ROUTES
========================================================= */

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );
    }
);


app.get(
    "/admin",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "admin.html"
            )
        );
    }
);


app.get(
    "/clans",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "clans.html"
            )
        );
    }
);


app.get(
    "/store",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "store.html"
            )
        );
    }
);


app.get(
    "/top",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "top.html"
            )
        );
    }
);


/* =========================================================
   404 API
========================================================= */

app.use(
    "/api",
    (req, res) => {

        res.status(404).json({
            success: false,
            message:
                "API маршрут не найден."
        });
    }
);


/* =========================================================
   START
========================================================= */

async function startServer() {

    try {

        await initDatabase();

        app.listen(
            PORT,
            () => {

                console.log("");
                console.log(
                    "================================"
                );
                console.log(
                    "   KILLUACLICKER SERVER"
                );
                console.log(
                    "================================"
                );
                console.log(
                    `Порт: ${PORT}`
                );
                console.log(
                    `Админ: ${ADMIN_USERNAME}`
                );
                console.log(
                    "Кланы: 100 000 кликов"
                );
                console.log(
                    "Вступление: только по приглашению"
                );
                console.log(
                    "Чаты: включены"
                );
                console.log(
                    "================================"
                );
                console.log("");
            }
        );

    } catch (error) {

        console.error(
            "НЕ УДАЛОСЬ ЗАПУСТИТЬ СЕРВЕР:"
        );

        console.error(error);

        process.exit(1);
    }
}


startServer();