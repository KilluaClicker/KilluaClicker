require("dotenv").config();

const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});


// =====================================================
// СТАТИЧЕСКИЕ ФАЙЛЫ
// =====================================================

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

app.get("/", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );
});


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

        secret:
            process.env.SESSION_SECRET ||
            "killuaclicker-secret-change-me",

        resave: false,

        saveUninitialized: false,

        cookie: {
            httpOnly: true,
            secure:
                process.env.NODE_ENV === "production",
            maxAge:
                1000 * 60 * 60 * 24 * 30
        }
    })
);


// =====================================================
// БАЗА ДАННЫХ
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
            owner_id INTEGER NOT NULL
                REFERENCES users(id)
                ON DELETE CASCADE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
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

            joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);


    const adminUsername =
        process.env.ADMIN_USERNAME ||
        "Killua666";

    const adminPassword =
        process.env.ADMIN_PASSWORD ||
        "Kotkova2015";


    const existingAdmin =
        await pool.query(
            `
            SELECT id
            FROM users
            WHERE username = $1
            `,
            [adminUsername]
        );


    if (
        existingAdmin.rows.length === 0
    ) {

        const hashedPassword =
            await bcrypt.hash(
                adminPassword,
                12
            );


        await pool.query(
            `
            INSERT INTO users
            (
                username,
                password,
                clicks,
                banned
            )
            VALUES
            ($1, $2, 0, false)
            `,
            [
                adminUsername,
                hashedPassword
            ]
        );

        console.log(
            `Создан администратор ${adminUsername}`
        );
    }

}


// =====================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =====================================================

function requireLogin(
    req,
    res,
    next
) {

    if (!req.session.userId) {

        return res.status(401).json({
            error: "Нужно войти в аккаунт"
        });

    }

    next();

}


function requireAdmin(
    req,
    res,
    next
) {

    if (!req.session.userId) {

        return res.status(401).json({
            error: "Нужно войти"
        });

    }


    pool.query(
        `
        SELECT username
        FROM users
        WHERE id = $1
        `,
        [req.session.userId]
    )
        .then(result => {

            if (
                result.rows.length === 0
            ) {

                return res.status(401).json({
                    error: "Пользователь не найден"
                });

            }


            const adminUsername =
                process.env.ADMIN_USERNAME ||
                "Killua666";


            if (
                result.rows[0].username !==
                adminUsername
            ) {

                return res.status(403).json({
                    error: "Нет доступа"
                });

            }


            next();

        })
        .catch(error => {

            console.error(error);

            res.status(500).json({
                error: "Ошибка сервера"
            });

        });

}


// =====================================================
// HEALTH
// =====================================================

app.get(
    "/api/health",
    async (req, res) => {

        try {

            await pool.query(
                "SELECT 1"
            );

            res.json({
                success: true,
                message:
                    "KilluaClicker server работает",
                database: "connected"
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                database: "error"
            });

        }

    }
);


// =====================================================
// REGISTER
// =====================================================

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
                    error:
                        "Ник должен быть от 3 до 32 символов"
                });

            }


            if (
                password.length < 4
            ) {

                return res.status(400).json({
                    error:
                        "Пароль должен быть минимум 4 символа"
                });

            }


            const existing =
                await pool.query(
                    `
                    SELECT id
                    FROM users
                    WHERE LOWER(username) =
                          LOWER($1)
                    `,
                    [username]
                );


            if (
                existing.rows.length > 0
            ) {

                return res.status(400).json({
                    error:
                        "Такой ник уже занят"
                });

            }


            const hashedPassword =
                await bcrypt.hash(
                    password,
                    12
                );


            const result =
                await pool.query(
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
                        hashedPassword
                    ]
                );


            req.session.userId =
                result.rows[0].id;


            await new Promise(
                (resolve, reject) => {

                    req.session.save(
                        error => {

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
                user: result.rows[0]
            });

        } catch (error) {

            console.error(
                "REGISTER ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Ошибка регистрации"
            });

        }

    }
);


// =====================================================
// LOGIN
// =====================================================

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
                    SELECT
                        id,
                        username,
                        password,
                        clicks,
                        banned
                    FROM users
                    WHERE LOWER(username) =
                          LOWER($1)
                    `,
                    [username]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(401).json({
                    error:
                        "Неверный логин или пароль"
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
                    error:
                        "Неверный логин или пароль"
                });

            }


            if (user.banned) {

                return res.status(403).json({
                    error:
                        "Ваш аккаунт заблокирован"
                });

            }


            req.session.userId =
                user.id;


            await new Promise(
                (resolve, reject) => {

                    req.session.save(
                        error => {

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
                error:
                    "Ошибка входа"
            });

        }

    }
);


// =====================================================
// LOGOUT
// =====================================================

app.post(
    "/api/logout",
    (req, res) => {

        req.session.destroy(
            error => {

                if (error) {

                    return res.status(500).json({
                        error:
                            "Ошибка выхода"
                    });

                }


                res.json({
                    success: true
                });

            }
        );

    }
);


// =====================================================
// ME
// =====================================================

app.get(
    "/api/me",
    async (req, res) => {

        try {

            if (!req.session.userId) {

                return res.json({
                    user: null
                });

            }


            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        username,
                        clicks,
                        banned,
                        created_at
                    FROM users
                    WHERE id = $1
                    `,
                    [req.session.userId]
                );


            if (
                result.rows.length === 0
            ) {

                return res.json({
                    user: null
                });

            }


            const user =
                result.rows[0];


            if (user.banned) {

                req.session.destroy(
                    () => {}
                );

                return res.status(403).json({
                    error:
                        "Ваш аккаунт заблокирован"
                });

            }


            res.json({

                user: {

                    id: user.id,

                    username:
                        user.username,

                    clicks:
                        String(user.clicks),

                    banned:
                        user.banned,

                    created_at:
                        user.created_at

                }

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Ошибка сервера"
            });

        }

    }
);


// =====================================================
// CLICK
// =====================================================

app.post(
    "/api/click",
    requireLogin,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET clicks =
                        clicks + 1
                    WHERE id = $1
                    AND banned = false
                    RETURNING clicks
                    `,
                    [req.session.userId]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(403).json({
                    error:
                        "Аккаунт заблокирован"
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
                error:
                    "Ошибка клика"
            });

        }

    }
);


// =====================================================
// ТОП ИГРОКОВ
// =====================================================

app.get(
    "/api/top",
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        username,
                        clicks
                    FROM users
                    WHERE banned = false
                    ORDER BY clicks DESC
                    LIMIT 100
                    `
                );


            res.json({

                success: true,

                users:
                    result.rows.map(
                        user => ({
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

            console.error(error);

            res.status(500).json({
                error:
                    "Ошибка загрузки топа"
            });

        }

    }
);


// =====================================================
// МАГАЗИН
// =====================================================

const STORE_ITEMS = [

    {
        id: "1",
        name: "1 клик",
        amount: "1",
        price: "0"
    },

    {
        id: "10",
        name: "10 кликов",
        amount: "10",
        price: "5"
    },

    {
        id: "100",
        name: "100 кликов",
        amount: "100",
        price: "40"
    },

    {
        id: "1000",
        name: "1 000 кликов",
        amount: "1000",
        price: "350"
    },

    {
        id: "million",
        name: "1 миллион",
        amount: "1000000",
        price: "300000"
    },

    {
        id: "billion",
        name: "1 миллиард",
        amount: "1000000000",
        price: "300000000"
    },

    {
        id: "quadrillion",
        name: "1 квадриллион",
        amount:
            "1000000000000000",
        price:
            "300000000000000"
    },

    {
        id: "sextillion",
        name: "1 сикстиллион",
        amount:
            "1000000000000000000000",
        price:
            "300000000000000000000"
    }

];


app.get(
    "/api/shop",
    (req, res) => {

        res.json({

            success: true,

            items:
                STORE_ITEMS

        });

    }
);


app.post(
    "/api/shop/buy",
    requireLogin,
    async (req, res) => {

        const itemId =
            String(
                req.body.item || ""
            );


        const product =
            STORE_ITEMS.find(
                item =>
                    item.id === itemId
            );


        if (!product) {

            return res.status(400).json({
                error:
                    "Товар не найден"
            });

        }


        const client =
            await pool.connect();


        try {

            await client.query(
                "BEGIN"
            );


            const result =
                await client.query(
                    `
                    SELECT
                        id,
                        username,
                        clicks,
                        banned
                    FROM users
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [req.session.userId]
                );


            if (
                result.rows.length === 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({
                    error:
                        "Пользователь не найден"
                });

            }


            const user =
                result.rows[0];


            if (user.banned) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(403).json({
                    error:
                        "Аккаунт заблокирован"
                });

            }


            const currentClicks =
                BigInt(
                    String(
                        user.clicks
                    )
                );


            const price =
                BigInt(
                    product.price
                );


            const amount =
                BigInt(
                    product.amount
                );


            if (
                currentClicks < price
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({

                    error:
                        "Недостаточно кликов. Нужно " +
                        price.toLocaleString(
                            "ru-RU"
                        )

                });

            }


            const newClicks =
                currentClicks -
                price +
                amount;


            await client.query(
                `
                UPDATE users
                SET clicks = $1::numeric
                WHERE id = $2
                `,
                [
                    newClicks.toString(),
                    user.id
                ]
            );


            await client.query(
                "COMMIT"
            );


            res.json({

                success: true,

                item:
                    product.name,

                spent:
                    product.price,

                added:
                    product.amount,

                clicks:
                    newClicks.toString()

            });

        } catch (error) {

            await client.query(
                "ROLLBACK"
            );


            console.error(
                "SHOP ERROR:",
                error
            );


            res.status(500).json({
                error:
                    "Ошибка покупки"
            });

        } finally {

            client.release();

        }

    }
);


// =====================================================
// КЛАНЫ
// =====================================================

app.get(
    "/api/clans/my",
    requireLogin,
    async (req, res) => {

        try {

            const clanResult =
                await pool.query(
                    `
                    SELECT
                        c.id,
                        c.name,
                        c.tag,
                        c.owner_id,
                        c.created_at
                    FROM clans c
                    JOIN clan_members cm
                        ON cm.clan_id = c.id
                    WHERE cm.user_id = $1
                    `,
                    [req.session.userId]
                );


            if (
                clanResult.rows.length === 0
            ) {

                return res.json({
                    clan: null,
                    members: []
                });

            }


            const clan =
                clanResult.rows[0];


            const membersResult =
                await pool.query(
                    `
                    SELECT
                        u.id,
                        u.username,
                        u.clicks
                    FROM clan_members cm
                    JOIN users u
                        ON u.id = cm.user_id
                    WHERE cm.clan_id = $1
                    ORDER BY u.clicks DESC
                    `,
                    [clan.id]
                );


            res.json({

                clan,

                members:
                    membersResult.rows.map(
                        member => ({
                            id: member.id,
                            username:
                                member.username,
                            clicks:
                                String(
                                    member.clicks
                                )
                        })
                    )

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Ошибка клана"
            });

        }

    }
);


app.post(
    "/api/clans/create",
    requireLogin,
    async (req, res) => {

        const name =
            String(
                req.body.name || ""
            ).trim();

        const tag =
            String(
                req.body.tag || ""
            ).trim().toUpperCase();


        if (
            name.length < 3 ||
            name.length > 32
        ) {

            return res.status(400).json({
                error:
                    "Название клана: 3-32 символа"
            });

        }


        if (
            tag.length < 2 ||
            tag.length > 8
        ) {

            return res.status(400).json({
                error:
                    "Тег клана: 2-8 символов"
            });

        }


        const client =
            await pool.connect();


        try {

            await client.query(
                "BEGIN"
            );


            const already =
                await client.query(
                    `
                    SELECT id
                    FROM clan_members
                    WHERE user_id = $1
                    `,
                    [req.session.userId]
                );


            if (
                already.rows.length > 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({
                    error:
                        "Вы уже состоите в клане"
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
                    RETURNING *
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
                "COMMIT"
            );


            res.json({

                success: true,

                clan

            });

        } catch (error) {

            await client.query(
                "ROLLBACK"
            );


            if (
                error.code === "23505"
            ) {

                return res.status(400).json({
                    error:
                        "Название или тег уже занят"
                });

            }


            console.error(error);

            res.status(500).json({
                error:
                    "Ошибка создания клана"
            });

        } finally {

            client.release();

        }

    }
);


app.get(
    "/api/clans",
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
                        COUNT(cm.user_id)::integer
                            AS members,
                        COALESCE(
                            SUM(u.clicks),
                            0
                        )::numeric AS total_clicks
                    FROM clans c
                    LEFT JOIN clan_members cm
                        ON cm.clan_id = c.id
                    LEFT JOIN users u
                        ON u.id = cm.user_id
                    GROUP BY
                        c.id
                    ORDER BY
                        total_clicks DESC
                    LIMIT 100
                    `
                );


            res.json({

                success: true,

                clans:
                    result.rows.map(
                        clan => ({
                            id: clan.id,
                            name: clan.name,
                            tag: clan.tag,
                            owner_id:
                                clan.owner_id,
                            members:
                                clan.members,
                            total_clicks:
                                String(
                                    clan.total_clicks
                                )
                        })
                    )

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Ошибка загрузки кланов"
            });

        }

    }
);


app.post(
    "/api/clans/:id/join",
    requireLogin,
    async (req, res) => {

        const clanId =
            Number(req.params.id);


        if (
            !Number.isInteger(clanId)
        ) {

            return res.status(400).json({
                error:
                    "Неверный клан"
            });

        }


        try {

            const already =
                await pool.query(
                    `
                    SELECT id
                    FROM clan_members
                    WHERE user_id = $1
                    `,
                    [req.session.userId]
                );


            if (
                already.rows.length > 0
            ) {

                return res.status(400).json({
                    error:
                        "Вы уже состоите в клане"
                });

            }


            const clan =
                await pool.query(
                    `
                    SELECT id
                    FROM clans
                    WHERE id = $1
                    `,
                    [clanId]
                );


            if (
                clan.rows.length === 0
            ) {

                return res.status(404).json({
                    error:
                        "Клан не найден"
                });

            }


            await pool.query(
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
                    clanId,
                    req.session.userId
                ]
            );


            res.json({
                success: true
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Ошибка вступления"
            });

        }

    }
);


app.post(
    "/api/clans/leave",
    requireLogin,
    async (req, res) => {

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

            console.error(error);

            res.status(500).json({
                error:
                    "Ошибка выхода из клана"
            });

        }

    }
);


// =====================================================
// ADMIN
// =====================================================

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
                        banned,
                        created_at
                    FROM users
                    ORDER BY id ASC
                    `
                );


            res.json({

                success: true,

                users:
                    result.rows.map(
                        user => ({
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

            console.error(error);

            res.status(500).json({
                error:
                    "Ошибка загрузки игроков"
            });

        }

    }
);


app.post(
    "/api/admin/user/:id/clicks",
    requireAdmin,
    async (req, res) => {

        try {

            const userId =
                Number(req.params.id);

            const clicks =
                BigInt(
                    String(
                        req.body.clicks || "0"
                    )
                );


            if (
                clicks < 0n
            ) {

                return res.status(400).json({
                    error:
                        "Количество не может быть отрицательным"
                });

            }


            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET clicks = $1::numeric
                    WHERE id = $2
                    RETURNING
                        id,
                        username,
                        clicks
                    `,
                    [
                        clicks.toString(),
                        userId
                    ]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    error:
                        "Игрок не найден"
                });

            }


            res.json({

                success: true,

                user: {
                    id:
                        result.rows[0].id,

                    username:
                        result.rows[0].username,

                    clicks:
                        String(
                            result.rows[0].clicks
                        )
                }

            });

        } catch (error) {

            console.error(error);

            res.status(400).json({
                error:
                    "Неверное количество кликов"
            });

        }

    }
);


app.post(
    "/api/admin/user/:id/add-clicks",
    requireAdmin,
    async (req, res) => {

        try {

            const userId =
                Number(req.params.id);

            const amount =
                BigInt(
                    String(
                        req.body.amount || "0"
                    )
                );


            if (
                amount < 0n
            ) {

                return res.status(400).json({
                    error:
                        "Количество не может быть отрицательным"
                });

            }


            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET clicks =
                        clicks + $1::numeric
                    WHERE id = $2
                    RETURNING
                        id,
                        username,
                        clicks
                    `,
                    [
                        amount.toString(),
                        userId
                    ]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    error:
                        "Игрок не найден"
                });

            }


            res.json({

                success: true,

                user: {
                    id:
                        result.rows[0].id,

                    username:
                        result.rows[0].username,

                    clicks:
                        String(
                            result.rows[0].clicks
                        )
                }

            });

        } catch (error) {

            console.error(error);

            res.status(400).json({
                error:
                    "Неверное количество"
            });

        }

    }
);


app.post(
    "/api/admin/user/:id/ban",
    requireAdmin,
    async (req, res) => {

        try {

            const userId =
                Number(req.params.id);

            const banned =
                Boolean(
                    req.body.banned
                );


            const adminUsername =
                process.env.ADMIN_USERNAME ||
                "Killua666";


            const target =
                await pool.query(
                    `
                    SELECT username
                    FROM users
                    WHERE id = $1
                    `,
                    [userId]
                );


            if (
                target.rows.length === 0
            ) {

                return res.status(404).json({
                    error:
                        "Игрок не найден"
                });

            }


            if (
                target.rows[0].username ===
                adminUsername
            ) {

                return res.status(400).json({
                    error:
                        "Нельзя заблокировать администратора"
                });

            }


            await pool.query(
                `
                UPDATE users
                SET banned = $1
                WHERE id = $2
                `,
                [
                    banned,
                    userId
                ]
            );


            res.json({
                success: true
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Ошибка блокировки"
            });

        }

    }
);


app.post(
    "/api/admin/user/:id/username",
    requireAdmin,
    async (req, res) => {

        try {

            const userId =
                Number(req.params.id);

            const username =
                String(
                    req.body.username || ""
                ).trim();


            if (
                username.length < 3 ||
                username.length > 32
            ) {

                return res.status(400).json({
                    error:
                        "Ник должен быть 3-32 символа"
                });

            }


            const target =
                await pool.query(
                    `
                    SELECT username
                    FROM users
                    WHERE id = $1
                    `,
                    [userId]
                );


            if (
                target.rows.length === 0
            ) {

                return res.status(404).json({
                    error:
                        "Игрок не найден"
                });

            }


            const adminUsername =
                process.env.ADMIN_USERNAME ||
                "Killua666";


            if (
                target.rows[0].username ===
                adminUsername
            ) {

                return res.status(400).json({
                    error:
                        "Нельзя переименовать администратора"
                });

            }


            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET username = $1
                    WHERE id = $2
                    RETURNING
                        id,
                        username
                    `,
                    [
                        username,
                        userId
                    ]
                );


            res.json({

                success: true,

                user:
                    result.rows[0]

            });

        } catch (error) {

            if (
                error.code === "23505"
            ) {

                return res.status(400).json({
                    error:
                        "Такой ник уже существует"
                });

            }


            console.error(error);

            res.status(500).json({
                error:
                    "Ошибка переименования"
            });

        }

    }
);


app.delete(
    "/api/admin/user/:id",
    requireAdmin,
    async (req, res) => {

        try {

            const userId =
                Number(req.params.id);


            const target =
                await pool.query(
                    `
                    SELECT username
                    FROM users
                    WHERE id = $1
                    `,
                    [userId]
                );


            if (
                target.rows.length === 0
            ) {

                return res.status(404).json({
                    error:
                        "Игрок не найден"
                });

            }


            const adminUsername =
                process.env.ADMIN_USERNAME ||
                "Killua666";


            if (
                target.rows[0].username ===
                adminUsername
            ) {

                return res.status(400).json({
                    error:
                        "Нельзя удалить администратора"
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
                success: true
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Ошибка удаления"
            });

        }

    }
);


// =====================================================
// ОШИБКИ
// =====================================================

app.use(
    (error, req, res, next) => {

        console.error(
            "SERVER ERROR:",
            error
        );

        res.status(500).json({
            error:
                "Внутренняя ошибка сервера"
        });

    }
);


// =====================================================
// ЗАПУСК
// =====================================================

const PORT =
    process.env.PORT || 3000;


initDatabase()
    .then(() => {

        app.listen(
            PORT,
            () => {

                console.log(
                    `KilluaClicker запущен на порту ${PORT}`
                );

            }
        );

    })
    .catch(error => {

        console.error(
            "Не удалось запустить сервер:"
        );

        console.error(error);

        process.exit(1);

    });