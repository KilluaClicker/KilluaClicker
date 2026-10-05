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

if (!process.env.DATABASE_URL) {
    console.error("ОШИБКА: DATABASE_URL не задан в .env");
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on("error", (error) => {
    console.error("Ошибка PostgreSQL:", error);
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

        secret:
            process.env.SESSION_SECRET ||
            "change-this-secret",

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

/* =========================================================
   НАСТРОЙКИ
========================================================= */

const ADMIN_USERNAME =
    process.env.ADMIN_USERNAME || "Killua666";

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD || "Kotkova2015";

/*
 * Магазин.
 *
 * Цена каждого товара = 2 × количество получаемых кликов.
 */
const STORE_ITEMS = [
    {
        id: "1",
        name: "+1 клик",
        amount: "1",
        price: "2",
        icon: "✦"
    },

    {
        id: "10",
        name: "+10 кликов",
        amount: "10",
        price: "20",
        icon: "✦"
    },

    {
        id: "100",
        name: "+100 кликов",
        amount: "100",
        price: "200",
        icon: "✦"
    },

    {
        id: "1000",
        name: "+1 000 кликов",
        amount: "1000",
        price: "2000",
        icon: "⚡"
    },

    {
        id: "million",
        name: "+1 миллион",
        amount: "1000000",
        price: "2000000",
        icon: "◆"
    },

    {
        id: "billion",
        name: "+1 миллиард",
        amount: "1000000000",
        price: "2000000000",
        icon: "◆"
    },

    {
        id: "quadrillion",
        name: "+1 квадриллион",
        amount: "1000000000000000",
        price: "2000000000000000",
        icon: "♛"
    },

    {
        id: "sextillion",
        name: "+1 сикстиллион",
        amount: "1000000000000000000000",
        price: "2000000000000000000000",
        icon: "♛"
    }
];

/* =========================================================
   DATABASE
========================================================= */

async function query(text, params = []) {
    return pool.query(text, params);
}

async function initDatabase() {
    await query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(32) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            clicks NUMERIC(100,0) NOT NULL DEFAULT 0,
            banned BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    /*
     * На случай, если старая таблица была BIGINT.
     * NUMERIC(100,0) позволяет хранить очень большие числа.
     */
    await query(`
        ALTER TABLE users
        ALTER COLUMN clicks TYPE NUMERIC(100,0)
        USING clicks::numeric
    `).catch(() => {});

    await query(`
        CREATE TABLE IF NOT EXISTS clans (
            id SERIAL PRIMARY KEY,
            name VARCHAR(32) UNIQUE NOT NULL,
            tag VARCHAR(8) UNIQUE NOT NULL,
            owner_id INTEGER NOT NULL
                REFERENCES users(id)
                ON DELETE CASCADE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS clan_members (
            id SERIAL PRIMARY KEY,
            clan_id INTEGER NOT NULL
                REFERENCES clans(id)
                ON DELETE CASCADE,
            user_id INTEGER NOT NULL UNIQUE
                REFERENCES users(id)
                ON DELETE CASCADE,
            joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    /*
     * Создаём администратора, если его ещё нет.
     */
    const adminResult = await query(
        `
        SELECT id, password
        FROM users
        WHERE username = $1
        LIMIT 1
        `,
        [ADMIN_USERNAME]
    );

    if (adminResult.rows.length === 0) {
        const passwordHash = await bcrypt.hash(
            ADMIN_PASSWORD,
            10
        );

        await query(
            `
            INSERT INTO users
            (
                username,
                password,
                clicks,
                banned
            )
            VALUES
            (
                $1,
                $2,
                0,
                false
            )
            `,
            [
                ADMIN_USERNAME,
                passwordHash
            ]
        );

        console.log(
            `Администратор ${ADMIN_USERNAME} создан.`
        );
    } else {
        /*
         * Если пароль администратора в .env отличается
         * от сохранённого, обновляем его.
         */
        const adminUser = adminResult.rows[0];

        const passwordCorrect =
            await bcrypt.compare(
                ADMIN_PASSWORD,
                adminUser.password
            );

        if (!passwordCorrect) {
            const passwordHash =
                await bcrypt.hash(
                    ADMIN_PASSWORD,
                    10
                );

            await query(
                `
                UPDATE users
                SET password = $1
                WHERE username = $2
                `,
                [
                    passwordHash,
                    ADMIN_USERNAME
                ]
            );

            console.log(
                "Пароль администратора обновлён."
            );
        }
    }

    console.log("База данных готова.");
}

/* =========================================================
   CURRENT USER
========================================================= */

async function getCurrentUser(req) {
    if (!req.session.userId) {
        return null;
    }

    const result = await query(
        `
        SELECT
            id,
            username,
            clicks,
            banned,
            created_at
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [req.session.userId]
    );

    return result.rows[0] || null;
}

/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message:
                "Сессия закончилась. Войдите снова."
        });
    }

    next();
}

async function requireAdmin(req, res, next) {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Не авторизован."
            });
        }

        const user =
            await getCurrentUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Пользователь не найден."
            });
        }

        if (user.banned) {
            return res.status(403).json({
                success: false,
                message:
                    "Ваш аккаунт заблокирован."
            });
        }

        if (
            user.username !==
            ADMIN_USERNAME
        ) {
            return res.status(403).json({
                success: false,
                message: "Доступ запрещён."
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
            message: "Ошибка сервера."
        });
    }
}

/* =========================================================
   REGISTER
========================================================= */

app.post("/api/register", async (req, res) => {
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
            !/^[A-Za-z0-9_]{3,32}$/.test(
                username
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Логин должен содержать от 3 до 32 символов: буквы, цифры или _."
            });
        }

        if (
            password.length < 4 ||
            password.length > 100
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Пароль должен быть от 4 до 100 символов."
            });
        }

        const existing =
            await query(
                `
                SELECT id
                FROM users
                WHERE LOWER(username) =
                      LOWER($1)
                LIMIT 1
                `,
                [username]
            );

        if (existing.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message:
                    "Такой пользователь уже существует."
            });
        }

        const passwordHash =
            await bcrypt.hash(
                password,
                10
            );

        const result =
            await query(
                `
                INSERT INTO users
                (
                    username,
                    password,
                    clicks,
                    banned
                )
                VALUES
                (
                    $1,
                    $2,
                    0,
                    false
                )
                RETURNING
                    id,
                    username,
                    clicks,
                    banned
                `,
                [
                    username,
                    passwordHash
                ]
            );

        /*
         * Создаём новую сессию после регистрации.
         */
        await new Promise(
            (resolve, reject) => {
                req.session.regenerate(
                    (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    }
                );
            }
        );

        req.session.userId =
            result.rows[0].id;

        await new Promise(
            (resolve, reject) => {
                req.session.save(
                    (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    }
                );
            }
        );

        res.json({
            success: true,
            user: {
                id: result.rows[0].id,
                username:
                    result.rows[0].username,
                clicks:
                    String(
                        result.rows[0].clicks
                    ),
                banned:
                    result.rows[0].banned
            }
        });
    } catch (error) {
        console.error(
            "REGISTER ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Ошибка сервера при регистрации."
        });
    }
});

/* =========================================================
   LOGIN
========================================================= */

app.post("/api/login", async (req, res) => {
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
            await query(
                `
                SELECT
                    id,
                    username,
                    password,
                    clicks,
                    banned
                FROM users
                WHERE LOWER(username) =
                      LOWER($1)
                LIMIT 1
                `,
                [username]
            );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message:
                    "Неверный логин или пароль."
            });
        }

        const user =
            result.rows[0];

        if (user.banned) {
            return res.status(403).json({
                success: false,
                message:
                    "Ваш аккаунт заблокирован."
            });
        }

        const passwordCorrect =
            await bcrypt.compare(
                password,
                user.password
            );

        if (!passwordCorrect) {
            return res.status(401).json({
                success: false,
                message:
                    "Неверный логин или пароль."
            });
        }

        /*
         * Полностью новая сессия.
         */
        await new Promise(
            (resolve, reject) => {
                req.session.regenerate(
                    (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    }
                );
            }
        );

        req.session.userId =
            user.id;

        await new Promise(
            (resolve, reject) => {
                req.session.save(
                    (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    }
                );
            }
        );

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                clicks:
                    String(user.clicks),
                banned: user.banned
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
                "Ошибка сервера при входе."
        });
    }
});

/* =========================================================
   LOGOUT
========================================================= */

app.post(
    "/api/logout",
    (req, res) => {
        req.session.destroy(
            (error) => {
                res.clearCookie(
                    "connect.sid"
                );

                if (error) {
                    console.error(
                        "LOGOUT ERROR:",
                        error
                    );
                }

                res.json({
                    success: true
                });
            }
        );
    }
);

/* =========================================================
   ME
========================================================= */

app.get(
    "/api/me",
    requireLogin,
    async (req, res) => {
        try {
            const user =
                await getCurrentUser(req);

            if (!user || user.banned) {
                req.session.destroy(
                    () => {}
                );

                return res.status(401).json({
                    success: false,
                    message:
                        "Сессия недействительна."
                });
            }

            res.json({
                success: true,
                user: {
                    id: user.id,
                    username:
                        user.username,
                    clicks:
                        String(
                            user.clicks
                        ),
                    banned:
                        user.banned,
                    created_at:
                        user.created_at,
                    isAdmin:
                        user.username ===
                        ADMIN_USERNAME
                }
            });
        } catch (error) {
            console.error(
                "ME ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка сервера."
            });
        }
    }
);

/* =========================================================
   CLICK
========================================================= */

app.post(
    "/api/click",
    requireLogin,
    async (req, res) => {
        try {
            /*
             * Здесь НЕТ cooldown.
             *
             * Каждый запрос добавляет ровно 1 клик.
             */
            const result =
                await query(
                    `
                    UPDATE users
                    SET clicks =
                        clicks + 1
                    WHERE id = $1
                      AND banned = false
                    RETURNING
                        id,
                        username,
                        clicks
                    `,
                    [
                        req.session.userId
                    ]
                );

            if (
                result.rows.length === 0
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Аккаунт заблокирован."
                });
            }

            res.json({
                success: true,
                clicks:
                    String(
                        result.rows[0].clicks
                    )
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
   TOP PLAYERS
========================================================= */

app.get(
    "/api/top",
    async (req, res) => {
        try {
            const result =
                await query(`
                    SELECT
                        id,
                        username,
                        clicks
                    FROM users
                    WHERE banned = false
                    ORDER BY
                        clicks DESC,
                        id ASC
                    LIMIT 100
                `);

            res.json({
                success: true,

                users:
                    result.rows.map(
                        (user) => ({
                            id: user.id,
                            username:
                                user.username,
                            clicks:
                                String(
                                    user.clicks
                                )
                        })
                    )
            });
        } catch (error) {
            console.error(
                "TOP ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Не удалось загрузить топ."
            });
        }
    }
);

/* =========================================================
   SHOP
========================================================= */

app.get(
    "/api/shop",
    requireLogin,
    async (req, res) => {
        res.json({
            success: true,
            items: STORE_ITEMS
        });
    }
);

/*
 * Покупка товара.
 *
 * Например:
 *
 * +1       -> цена 2
 * +10      -> цена 20
 * +100     -> цена 200
 * +1000    -> цена 2000
 * +1 млн   -> цена 2 млн
 *
 * Огромные числа считаются через BigInt.
 */
app.post(
    "/api/shop/buy",
    requireLogin,
    async (req, res) => {
        const client =
            await pool.connect();

        try {
            const itemId =
                String(
                    req.body.itemId || ""
                );

            const item =
                STORE_ITEMS.find(
                    (entry) =>
                        entry.id ===
                        itemId
                );

            if (!item) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Товар не найден."
                });
            }

            const price =
                BigInt(item.price);

            const amount =
                BigInt(item.amount);

            await client.query(
                "BEGIN"
            );

            /*
             * Блокируем строку пользователя
             * на время покупки.
             *
             * Это защищает от одновременных
             * покупок и неправильного баланса.
             */
            const userResult =
                await client.query(
                    `
                    SELECT clicks
                    FROM users
                    WHERE id = $1
                      AND banned = false
                    FOR UPDATE
                    `,
                    [
                        req.session.userId
                    ]
                );

            if (
                userResult.rows.length ===
                0
            ) {
                await client.query(
                    "ROLLBACK"
                );

                return res.status(403).json({
                    success: false,
                    message:
                        "Аккаунт заблокирован."
                });
            }

            const currentClicks =
                BigInt(
                    String(
                        userResult.rows[0]
                            .clicks
                    )
                );

            if (
                currentClicks <
                price
            ) {
                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({
                    success: false,
                    message:
                        "Недостаточно кликов."
                });
            }

            /*
             * Покупка:
             *
             * баланс - цена + получаемое количество
             */
            const newClicks =
                currentClicks -
                price +
                amount;

            await client.query(
                `
                UPDATE users
                SET clicks = $1
                WHERE id = $2
                `,
                [
                    newClicks.toString(),
                    req.session.userId
                ]
            );

            await client.query(
                "COMMIT"
            );

            res.json({
                success: true,
                message:
                    `Покупка "${item.name}" выполнена.`,
                clicks:
                    newClicks.toString(),
                item: {
                    id: item.id,
                    name: item.name,
                    amount: item.amount,
                    price: item.price
                }
            });
        } catch (error) {
            try {
                await client.query(
                    "ROLLBACK"
                );
            } catch {}

            console.error(
                "SHOP BUY ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка покупки."
            });
        } finally {
            client.release();
        }
    }
);

/* =========================================================
   CLANS - LIST
========================================================= */

app.get(
    "/api/clans",
    async (req, res) => {
        try {
            const result =
                await query(`
                    SELECT
                        c.id,
                        c.name,
                        c.tag,
                        c.owner_id,
                        u.username AS owner,
                        COUNT(
                            cm.user_id
                        )::int AS members
                    FROM clans c

                    JOIN users u
                        ON u.id =
                           c.owner_id

                    LEFT JOIN clan_members cm
                        ON cm.clan_id =
                           c.id

                    GROUP BY
                        c.id,
                        u.username

                    ORDER BY
                        members DESC,
                        c.id ASC

                    LIMIT 100
                `);

            res.json({
                success: true,
                clans:
                    result.rows
            });
        } catch (error) {
            console.error(
                "CLANS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Не удалось загрузить кланы."
            });
        }
    }
);

/* =========================================================
   MY CLAN
========================================================= */

app.get(
    "/api/clans/my",
    requireLogin,
    async (req, res) => {
        try {
            const result =
                await query(
                    `
                    SELECT
                        c.id,
                        c.name,
                        c.tag,
                        c.owner_id,
                        u.username AS owner
                    FROM clan_members cm

                    JOIN clans c
                        ON c.id =
                           cm.clan_id

                    JOIN users u
                        ON u.id =
                           c.owner_id

                    WHERE cm.user_id = $1

                    LIMIT 1
                    `,
                    [
                        req.session.userId
                    ]
                );

            if (
                result.rows.length ===
                0
            ) {
                return res.json({
                    success: true,
                    clan: null
                });
            }

            const clan =
                result.rows[0];

            const members =
                await query(
                    `
                    SELECT
                        u.id,
                        u.username,
                        u.clicks
                    FROM clan_members cm

                    JOIN users u
                        ON u.id =
                           cm.user_id

                    WHERE cm.clan_id = $1

                    ORDER BY
                        u.clicks DESC
                    `,
                    [clan.id]
                );

            res.json({
                success: true,

                clan: {
                    id: clan.id,
                    name: clan.name,
                    tag: clan.tag,
                    owner_id:
                        clan.owner_id,
                    owner:
                        clan.owner,

                    members:
                        members.rows.map(
                            (member) => ({
                                id:
                                    member.id,
                                username:
                                    member.username,
                                clicks:
                                    String(
                                        member.clicks
                                    )
                            })
                        )
                }
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

/* =========================================================
   CREATE CLAN
========================================================= */

app.post(
    "/api/clans/create",
    requireLogin,
    async (req, res) => {
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
                !/^[A-Za-zА-Яа-я0-9_ ]{3,32}$/.test(
                    name
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Название клана должно быть от 3 до 32 символов."
                });
            }

            if (
                !/^[A-ZА-ЯЁ0-9]{2,8}$/.test(
                    tag
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Тег клана должен быть от 2 до 8 символов."
                });
            }

            const already =
                await query(
                    `
                    SELECT id
                    FROM clan_members
                    WHERE user_id = $1
                    LIMIT 1
                    `,
                    [
                        req.session.userId
                    ]
                );

            if (
                already.rows.length >
                0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Вы уже состоите в клане."
                });
            }

            const clanResult =
                await query(
                    `
                    INSERT INTO clans
                    (
                        name,
                        tag,
                        owner_id
                    )
                    VALUES
                    (
                        $1,
                        $2,
                        $3
                    )
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

            await query(
                `
                INSERT INTO clan_members
                (
                    clan_id,
                    user_id
                )
                VALUES
                (
                    $1,
                    $2
                )
                `,
                [
                    clanResult.rows[0]
                        .id,
                    req.session.userId
                ]
            );

            res.json({
                success: true,
                clan:
                    clanResult.rows[0]
            });
        } catch (error) {
            console.error(
                "CREATE CLAN ERROR:",
                error
            );

            if (
                error.code ===
                "23505"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Такое название или тег уже занят."
                });
            }

            res.status(500).json({
                success: false,
                message:
                    "Не удалось создать клан."
            });
        }
    }
);

/* =========================================================
   JOIN CLAN
========================================================= */

app.post(
    "/api/clans/:id/join",
    requireLogin,
    async (req, res) => {
        try {
            const clanId =
                Number(
                    req.params.id
                );

            if (
                !Number.isInteger(
                    clanId
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Неверный клан."
                });
            }

            const clan =
                await query(
                    `
                    SELECT id
                    FROM clans
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [clanId]
                );

            if (
                clan.rows.length ===
                0
            ) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Клан не найден."
                });
            }

            const current =
                await query(
                    `
                    SELECT id
                    FROM clan_members
                    WHERE user_id = $1
                    LIMIT 1
                    `,
                    [
                        req.session.userId
                    ]
                );

            if (
                current.rows.length >
                0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Вы уже состоите в клане."
                });
            }

            await query(
                `
                INSERT INTO clan_members
                (
                    clan_id,
                    user_id
                )
                VALUES
                (
                    $1,
                    $2
                )
                `,
                [
                    clanId,
                    req.session.userId
                ]
            );

            res.json({
                success: true,
                message:
                    "Вы вступили в клан."
            });
        } catch (error) {
            console.error(
                "JOIN CLAN ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Не удалось вступить в клан."
            });
        }
    }
);

/* =========================================================
   LEAVE CLAN
========================================================= */

app.post(
    "/api/clans/leave",
    requireLogin,
    async (req, res) => {
        try {
            const current =
                await query(
                    `
                    SELECT
                        cm.clan_id,
                        c.owner_id
                    FROM clan_members cm

                    JOIN clans c
                        ON c.id =
                           cm.clan_id

                    WHERE cm.user_id = $1

                    LIMIT 1
                    `,
                    [
                        req.session.userId
                    ]
                );

            if (
                current.rows.length ===
                0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Вы не состоите в клане."
                });
            }

            const clanId =
                current.rows[0]
                    .clan_id;

            const ownerId =
                current.rows[0]
                    .owner_id;

            /*
             * Если владелец выходит —
             * удаляем весь клан.
             */
            if (
                Number(ownerId) ===
                Number(
                    req.session.userId
                )
            ) {
                await query(
                    `
                    DELETE FROM clans
                    WHERE id = $1
                    `,
                    [clanId]
                );

                return res.json({
                    success: true,
                    message:
                        "Клан удалён."
                });
            }

            await query(
                `
                DELETE FROM clan_members
                WHERE clan_id = $1
                  AND user_id = $2
                `,
                [
                    clanId,
                    req.session.userId
                ]
            );

            res.json({
                success: true,
                message:
                    "Вы вышли из клана."
            });
        } catch (error) {
            console.error(
                "LEAVE CLAN ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Не удалось выйти из клана."
            });
        }
    }
);

/* =========================================================
   ADMIN - USERS
========================================================= */

app.get(
    "/api/admin/users",
    requireAdmin,
    async (req, res) => {
        try {
            const result =
                await query(`
                    SELECT
                        id,
                        username,
                        clicks,
                        banned,
                        created_at
                    FROM users
                    ORDER BY
                        clicks DESC,
                        id ASC
                `);

            res.json({
                success: true,

                users:
                    result.rows.map(
                        (user) => ({
                            id: user.id,
                            username:
                                user.username,
                            clicks:
                                String(
                                    user.clicks
                                ),
                            banned:
                                user.banned,
                            created_at:
                                user.created_at
                        })
                    )
            });
        } catch (error) {
            console.error(
                "ADMIN USERS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка загрузки пользователей."
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
            const id =
                Number(
                    req.params.id
                );

            const userResult =
                await query(
                    `
                    SELECT username
                    FROM users
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [id]
                );

            if (
                userResult.rows.length ===
                0
            ) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Пользователь не найден."
                });
            }

            if (
                userResult.rows[0]
                    .username ===
                ADMIN_USERNAME
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Нельзя заблокировать администратора."
                });
            }

            await query(
                `
                UPDATE users
                SET banned = true
                WHERE id = $1
                `,
                [id]
            );

            res.json({
                success: true,
                message:
                    "Пользователь заблокирован."
            });
        } catch (error) {
            console.error(
                "BAN ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка блокировки."
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
            const id =
                Number(
                    req.params.id
                );

            await query(
                `
                UPDATE users
                SET banned = false
                WHERE id = $1
                `,
                [id]
            );

            res.json({
                success: true,
                message:
                    "Пользователь разблокирован."
            });
        } catch (error) {
            console.error(
                "UNBAN ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка разблокировки."
            });
        }
    }
);

/* =========================================================
   ADMIN - RESET CLICKS
========================================================= */

app.post(
    "/api/admin/users/:id/reset",
    requireAdmin,
    async (req, res) => {
        try {
            const id =
                Number(
                    req.params.id
                );

            await query(
                `
                UPDATE users
                SET clicks = 0
                WHERE id = $1
                  AND username <> $2
                `,
                [
                    id,
                    ADMIN_USERNAME
                ]
            );

            res.json({
                success: true,
                message:
                    "Клики сброшены."
            });
        } catch (error) {
            console.error(
                "RESET ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка сброса кликов."
            });
        }
    }
);

/* =========================================================
   PAGE ROUTES
========================================================= */

app.get("/", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.redirect(
                "/login.html"
            );
        }

        const user =
            await getCurrentUser(req);

        if (!user || user.banned) {
            return req.session.destroy(
                () => {
                    res.clearCookie(
                        "connect.sid"
                    );

                    res.redirect(
                        "/login.html"
                    );
                }
            );
        }

        return res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );
    } catch (error) {
        console.error(
            "ROOT PAGE ERROR:",
            error
        );

        return res.redirect(
            "/login.html"
        );
    }
});

/* =========================================================
   LOGIN PAGE
========================================================= */

app.get(
    "/login.html",
    (req, res) => {
        if (req.session.userId) {
            return res.redirect("/");
        }

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "login.html"
            )
        );
    }
);

/* =========================================================
   PROTECTED PAGES
========================================================= */

function protectedPage(file) {
    return async (req, res) => {
        try {
            if (!req.session.userId) {
                return res.redirect(
                    "/login.html"
                );
            }

            const user =
                await getCurrentUser(req);

            if (!user || user.banned) {
                return req.session.destroy(
                    () => {
                        res.clearCookie(
                            "connect.sid"
                        );

                        res.redirect(
                            "/login.html"
                        );
                    }
                );
            }

            res.sendFile(
                path.join(
                    __dirname,
                    "public",
                    file
                )
            );
        } catch (error) {
            console.error(
                "PAGE ERROR:",
                error
            );

            res.redirect(
                "/login.html"
            );
        }
    };
}

app.get(
    "/index.html",
    protectedPage("index.html")
);

app.get(
    "/top.html",
    protectedPage("top.html")
);

app.get(
    "/store.html",
    protectedPage("store.html")
);

app.get(
    "/clans.html",
    protectedPage("clans.html")
);

/* =========================================================
   ADMIN PAGE
========================================================= */

app.get(
    "/admin.html",
    async (req, res) => {
        try {
            if (!req.session.userId) {
                return res.redirect(
                    "/login.html"
                );
            }

            const user =
                await getCurrentUser(req);

            if (
                !user ||
                user.username !==
                    ADMIN_USERNAME
            ) {
                return res.redirect("/");
            }

            res.sendFile(
                path.join(
                    __dirname,
                    "public",
                    "admin.html"
                )
            );
        } catch (error) {
            console.error(
                "ADMIN PAGE ERROR:",
                error
            );

            res.redirect("/");
        }
    }
);

/* =========================================================
   STATIC FILES
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
   404
========================================================= */

app.use(
    (req, res) => {
        res.status(404).send(
            "Страница не найдена"
        );
    }
);

/* =========================================================
   START SERVER
========================================================= */

async function start() {
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
                    "        KILLUACLICKER"
                );
                console.log(
                    "================================"
                );
                console.log(
                    `Сервер: http://localhost:${PORT}`
                );
                console.log(
                    "База данных: подключена"
                );
                console.log(
                    "Магазин: включён"
                );
                console.log(
                    "Топы: включены"
                );
                console.log(
                    "Кланы: включены"
                );
                console.log(
                    "Админка: включена"
                );
                console.log(
                    "Быстрые клики: включены"
                );
                console.log(
                    "================================"
                );
                console.log("");
            }
        );
    } catch (error) {
        console.error("");
        console.error(
            "НЕ УДАЛОСЬ ЗАПУСТИТЬ СЕРВЕР:"
        );
        console.error(error);
        console.error("");

        process.exit(1);
    }
}

start();