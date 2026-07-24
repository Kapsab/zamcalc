const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? {
    	rejectUnauthorized: false	// Required by most cloud database hosts
    } : false
});

pool.on('error', (err) => {
	console.error('Unexpected error on idle client', err);
});

app.use(express.json());
app.use(express.static(__dirname));

app.use(session({
	store: new pgSession({
		pool: pool,
		tableName: 'session'
	}),
    secret: process.env.SESSION_SECRET || 'fallback_development_secret', // Replace with a strong random string
    resave: false,	// this prevents constant session overwrites
    saveUninitialized: false,
    proxy: true,
    cookie: {
    	secure: isProduction,	// must be false for http://localhost
    	maxAge: 1000 * 60 * 60 * 24,
    	httpOnly: true,
    	sameSite: 'lax'
    } // 24 hours session
}));

const isAuthenticated = (req, res, next) => {
    if (req.session.userId) return next();
    res.status(401).json({ error: 'Unauthorized: Please log in' });
};

const isAdmin = (req, res, next) => {
    // Ensure the user is logged in and their role is exactly 'admin'
    if (req.session && req.session.role === 'admin') {
        return next(); // User is an admin, proceed to the next handler
    }
    // User is not an admin, block the request
    res.status(403).send('Forbidden: Admin access required');
};

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    try {
        await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username, hash]);
        res.status(201).send('User registered');
    } catch (err) { res.status(500).send('Registration failed'); }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length > 0) {
        const user = result.rows[0];
        if (await bcrypt.compare(password, user.password_hash)) {
            req.session.userId = user.id;
            req.session.role = user.role;
            return res.send({ message: 'Logged in', role: user.role });
        }
    }
    res.status(401).send('Invalid credentials');
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Could not log out' });
        }
        res.clearCookie('connect.sid'); // Clears the browser cookie
        res.json({ message: 'Logged out successfully' });
    });
});

app.delete('/api/points/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
    	const { id } = req.params;
    	const result = await pool.query('DELETE FROM survey_points WHERE id = $1', [id]);
    	if(result.rowCount === 0) {
    		return res.status(404).json({ error: "Point not found or unauthorized" });
    	}
        res.json({ message: "Point deleted successfully" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/points/:id', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const { pt_no, easting, northing, elevation } = req.body;
    const userId = req.session.userId;
    
    console.log(`Attempting update: Point ID ${id} for User ${userId}`);
    
    try {
        const query = `
            UPDATE survey_points 
            SET pt_no = $1, easting = $2, northing = $3, elevation = $4 
            WHERE id = $5 AND user_id = $6 RETURNING *`;
        const result = await pool.query(query, [pt_no, easting, northing, elevation, id, req.session.userId]);
        
        if (result.rowCount === 0) {
        	console.log("Update failed: Point not found or user mismatch.");
            return res.status(404).json({ error: "Point not found or unauthorized" });
        }
        res.json(result.rows[0]);
    } catch (err) {
    console.error("SQL Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/points/bulk-delete', isAuthenticated, async (req, res) => {
    const { ids } = req.body;
    try {
        await pool.query('DELETE FROM survey_points WHERE id = ANY($1) AND user_id = $2', [ids, req.session.userId]);
        res.json({ message: "Selected points deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/points', isAuthenticated, async (req, res) => {
    const { pt_no, easting, northing, elevation, srid } = req.body;
    const userId = req.session.userId;
    
    // Fallback default setting: Use Arc 1950 UTM35S (20935) if no custom CRS selection is supplied
    const targetSRID = parseInt(srid) || 20935;

    try {
        // Query structures the geometry using the exact client-specified projection code string
        const query = `
            INSERT INTO survey_points (pt_no, easting, northing, elevation, user_id, geom) 
            VALUES (
                $1, 
                $2::numeric, 
                $3::numeric, 
                $4::numeric, 
                $5,
                CASE 
                    -- If the user provides raw 4326 Lat/Lon, map it natively
                    WHEN $6 = 4326 THEN ST_SetSRID(ST_MakePoint($2, $3), 4326)
                    -- If the user provides South-Positive Lo coordinates (22287/22289), apply negative sign correction matrix variables
                    WHEN $6 IN (22287, 22289) THEN ST_Transform(ST_SetSRID(ST_MakePoint(-$2, -$3), $6), 4326)
                    -- For standard North-Positive metric plane grids (UTM 20935 / 32735)
                    ELSE ST_Transform(ST_SetSRID(ST_MakePoint($2, $3), $6), 4326)
                END
            ) 
            RETURNING id, pt_no, ROUND(easting::numeric, 3) as easting, ROUND(northing::numeric, 3) as northing, ROUND(elevation::numeric, 3) as elevation;
        `;
        
        const result = await pool.query(query, [pt_no, easting, northing, elevation, userId, targetSRID]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("Database Save Error with CRS integration:", err.message);
        res.status(500).json({ error: err.message });
    }
});


app.get('/api/points', isAuthenticated, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        // Structured SQL wildcard layout array
        const searchValue = `%${search}%`;

        // 1. Fetches filtered data rows matching search terms across ALL database entries
        const dataQuery = `
            SELECT id, pt_no, easting, northing, elevation 
            FROM public.survey_points
            WHERE pt_no ILIKE $1 
            ORDER BY id ASC
            LIMIT $2 OFFSET $3;
        `;
        
        // 2. Synchronizes total pages pagination values matching search query constraints
        const countQuery = `
            SELECT COUNT(*) AS count FROM public.survey_points
            WHERE pt_no ILIKE $1;
        `;

        const dataRes = await pool.query(dataQuery, [searchValue, limit, offset]);
        const countRes = await pool.query(countQuery, [searchValue]);
        const totalRows = parseInt(countRes.rows[0].count);

        res.json({
            points: dataRes.rows,
            totalRows: totalRows,
            currentPage: page,
            totalPages: Math.ceil(totalRows / limit)
        });
    } catch (err) {
        console.error("Global table search endpoint failure:", err.message);
        res.status(500).send('Database Error');
    }
});

app.get('/api/my-points', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const result = await pool.query(
            'SELECT * FROM survey_points WHERE user_id = $1 ORDER BY id DESC', 
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch your points" });
    }
});

app.get('/api/check-session', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, userId: req.session.userId, role: req.session.role });
    } else {
        res.json({ loggedIn: false });
    }
});

app.get('/api/map-points', isAuthenticated, async (req, res) => {
    try {
        const query = `
            SELECT id, pt_no, 
            ST_AsGeoJSON(geom)::json as location 
            FROM survey_points
            WHERE geom IS NOT NULL`;
        
        const result = await pool.query(query);
        
        const features = result.rows.map(row => ({
        	type: 'Feature',
        	geometry: row.location,
        	properties: { pt_no:row.pt_no }
        }));
        
        //res.json(result.rows);
        res.json({ type: 'FeatureCollection', features });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Server running on port:${port}`);
});
